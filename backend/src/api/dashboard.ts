import { Router } from 'express'
import { db } from '../models/db'
import { sql } from 'drizzle-orm'
import { and, eq, isNull, count } from 'drizzle-orm'
import { departments, groups, stations, stationLogs } from '../models/schema'

const router = Router()

function getTaiwanTodayStart(): Date {
  const dateStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' })
  return new Date(`${dateStr}T00:00:00+08:00`)
}

// GET /api/dashboard/wip?department_id=&mode=in_station|queuing
router.get('/wip', async (req, res, next) => {
  try {
    const { department_id, mode = 'in_station' } = req.query as Record<string, string>

    if (mode !== 'queuing') {
      // in_station: work orders currently checked in (open station_log)
      const rows = await db
        .select({
          stationId: stations.id,
          stationName: stations.name,
          stationCode: stations.code,
          stationSortOrder: stations.sortOrder,
          groupId: groups.id,
          groupName: groups.name,
          groupStage: groups.stage,
          groupSortOrder: groups.sortOrder,
          departmentId: departments.id,
          departmentName: departments.name,
          departmentCode: departments.code,
          wipCount: count(stationLogs.id),
        })
        .from(stations)
        .innerJoin(departments, eq(stations.departmentId, departments.id))
        .leftJoin(groups, eq(stations.groupId, groups.id))
        .leftJoin(
          stationLogs,
          and(
            eq(stationLogs.stationId, stations.id),
            eq(stationLogs.status, 'in_progress'),
            isNull(stationLogs.checkOutTime),
          ),
        )
        .where(
          and(
            eq(stations.isActive, true),
            department_id ? eq(departments.id, department_id) : undefined,
          ),
        )
        .groupBy(
          stations.id, stations.name, stations.code, stations.sortOrder,
          groups.id, groups.name, groups.stage, groups.sortOrder,
          departments.id, departments.name, departments.code,
        )
        .orderBy(departments.code, sql`COALESCE(${groups.sortOrder}, 999)`, stations.sortOrder)

      res.json({ success: true, data: rows })
    } else {
      // queuing: work orders waiting to enter their next station
      const deptWO = department_id ? sql`AND wo.department_id = ${department_id}` : sql``
      const deptSt = department_id ? sql`AND d.id = ${department_id}` : sql``

      const result = await db.execute(sql`
        WITH last_completed AS (
          SELECT
            sl.work_order_id,
            MAX(ps.step_order) AS last_step_order
          FROM station_logs sl
          JOIN process_steps ps ON sl.step_id = ps.id
          WHERE sl.status IN ('completed', 'auto_filled', 'abnormal')
          GROUP BY sl.work_order_id
        ),
        currently_in_station AS (
          SELECT DISTINCT sl.work_order_id
          FROM station_logs sl
          WHERE sl.status = 'in_progress' AND sl.check_out_time IS NULL
        ),
        queuing_at AS (
          SELECT
            wo.id AS work_order_id,
            ps.station_id
          FROM work_orders wo
          JOIN process_steps ps ON ps.route_id = wo.route_id
          LEFT JOIN last_completed lc ON lc.work_order_id = wo.id
          WHERE wo.status = 'in_progress'
            AND wo.id NOT IN (SELECT work_order_id FROM currently_in_station)
            AND ps.step_order = COALESCE(lc.last_step_order, 0) + 1
          ${deptWO}
        )
        SELECT
          s.id AS "stationId",
          s.name AS "stationName",
          s.code AS "stationCode",
          s.sort_order AS "stationSortOrder",
          g.id AS "groupId",
          g.name AS "groupName",
          g.stage AS "groupStage",
          COALESCE(g.sort_order, 999) AS "groupSortOrder",
          d.id AS "departmentId",
          d.name AS "departmentName",
          d.code AS "departmentCode",
          COUNT(qa.work_order_id)::int AS "wipCount"
        FROM stations s
        JOIN departments d ON s.department_id = d.id
        LEFT JOIN groups g ON s.group_id = g.id
        LEFT JOIN queuing_at qa ON qa.station_id = s.id
        WHERE s.is_active = true
        ${deptSt}
        GROUP BY s.id, s.name, s.code, s.sort_order, g.id, g.name, g.stage, g.sort_order, d.id, d.name, d.code
        ORDER BY d.code, COALESCE(g.sort_order, 999), s.sort_order
      `)

      res.json({ success: true, data: result.rows })
    }
  } catch (err) {
    next(err)
  }
})

// GET /api/dashboard/today?department_id=
router.get('/today', async (req, res, next) => {
  try {
    const { department_id } = req.query as Record<string, string>
    const todayStart = getTaiwanTodayStart()
    const deptFilter = department_id ? sql`AND d.id = ${department_id}` : sql``

    const result = await db.execute(sql`
      SELECT
        d.id AS "departmentId",
        d.name AS "departmentName",
        d.code AS "departmentCode",
        COUNT(DISTINCT CASE WHEN wo.status = 'completed' AND wo.updated_at >= ${todayStart} THEN wo.id END)::int AS "completedOrders",
        COUNT(DISTINCT CASE WHEN sl.check_out_time >= ${todayStart} AND sl.status = 'completed' THEN sl.id END)::int AS "totalCheckOuts",
        COUNT(DISTINCT CASE WHEN wo.status = 'in_progress' THEN wo.id END)::int AS "activeOrders"
      FROM departments d
      LEFT JOIN work_orders wo ON wo.department_id = d.id
      LEFT JOIN station_logs sl ON sl.work_order_id = wo.id
      WHERE TRUE ${deptFilter}
      GROUP BY d.id, d.name, d.code
      ORDER BY d.code
    `)

    const rows = result.rows as {
      departmentId: string; departmentName: string; departmentCode: string
      completedOrders: number; totalCheckOuts: number; activeOrders: number
    }[]

    res.json({
      success: true,
      data: {
        departments: rows,
        totals: {
          completedOrders: rows.reduce((s, r) => s + (r.completedOrders ?? 0), 0),
          totalCheckOuts: rows.reduce((s, r) => s + (r.totalCheckOuts ?? 0), 0),
          activeOrders: rows.reduce((s, r) => s + (r.activeOrders ?? 0), 0),
        },
      },
    })
  } catch (err) {
    next(err)
  }
})

// GET /api/dashboard/work-order-progress?department_id=&status=
router.get('/work-order-progress', async (req, res, next) => {
  try {
    const { department_id, status } = req.query as Record<string, string>
    const deptWhere = department_id ? sql`AND wo.department_id = ${department_id}` : sql``
    const statusWhere = status
      ? sql`AND wo.status = ${status}`
      : sql`AND wo.status IN ('pending', 'in_progress')`

    const result = await db.execute(sql`
      WITH step_counts AS (
        SELECT route_id, COUNT(*)::int AS total_steps
        FROM process_steps
        GROUP BY route_id
      ),
      completed_steps AS (
        SELECT
          sl.work_order_id,
          COUNT(*)::int AS completed_steps,
          MAX(sl.check_in_time) AS last_activity_at
        FROM station_logs sl
        WHERE sl.status IN ('completed', 'auto_filled', 'abnormal')
        GROUP BY sl.work_order_id
      ),
      current_station AS (
        SELECT DISTINCT ON (sl.work_order_id)
          sl.work_order_id,
          s.name AS current_station_name,
          g.name AS current_group_name
        FROM station_logs sl
        JOIN stations s ON sl.station_id = s.id
        LEFT JOIN groups g ON s.group_id = g.id
        WHERE sl.status = 'in_progress' AND sl.check_out_time IS NULL
        ORDER BY sl.work_order_id, sl.check_in_time DESC
      )
      SELECT
        wo.id AS "id",
        wo.order_number AS "orderNumber",
        wo.status AS "status",
        wo.planned_qty AS "plannedQty",
        wo.priority AS "priority",
        wo.due_date AS "dueDate",
        wo.created_at AS "createdAt",
        wo.is_split AS "isSplit",
        p.name AS "productName",
        p.model_number AS "modelNumber",
        d.id AS "departmentId",
        d.name AS "departmentName",
        COALESCE(cs.completed_steps, 0) AS "completedSteps",
        COALESCE(sc.total_steps, 0) AS "totalSteps",
        cur.current_station_name AS "currentStationName",
        cur.current_group_name AS "currentGroupName",
        cs.last_activity_at AS "lastActivityAt"
      FROM work_orders wo
      JOIN products p ON wo.product_id = p.id
      JOIN departments d ON wo.department_id = d.id
      LEFT JOIN step_counts sc ON sc.route_id = wo.route_id
      LEFT JOIN completed_steps cs ON cs.work_order_id = wo.id
      LEFT JOIN current_station cur ON cur.work_order_id = wo.id
      WHERE 1=1 ${deptWhere} ${statusWhere}
      ORDER BY
        CASE wo.priority WHEN 'urgent' THEN 0 ELSE 1 END,
        wo.due_date ASC NULLS LAST,
        wo.created_at ASC
    `)

    res.json({ success: true, data: result.rows })
  } catch (err) {
    next(err)
  }
})
// GET /api/dashboard/station/:stationId/work-orders?mode=in_station|queuing
router.get('/station/:stationId/work-orders', async (req, res, next) => {
  try {
    const { stationId } = req.params
    const mode = (req.query as Record<string, string>).mode ?? 'in_station'

    if (mode === 'in_station') {
      const result = await db.execute(sql`
        SELECT
          wo.id AS "id",
          wo.order_number AS "orderNumber",
          wo.status AS "status",
          wo.planned_qty AS "plannedQty",
          wo.priority AS "priority",
          p.name AS "productName",
          p.model_number AS "modelNumber",
          sl.check_in_time AS "checkInTime"
        FROM station_logs sl
        JOIN work_orders wo ON sl.work_order_id = wo.id
        JOIN products p ON wo.product_id = p.id
        WHERE sl.station_id = ${stationId}
          AND sl.status = 'in_progress'
          AND sl.check_out_time IS NULL
        ORDER BY sl.check_in_time DESC
      `)
      res.json({ success: true, data: result.rows })
    } else {
      // queuing
      const result = await db.execute(sql`
        WITH last_completed AS (
          SELECT
            sl.work_order_id,
            MAX(ps.step_order) AS last_step_order
          FROM station_logs sl
          JOIN process_steps ps ON sl.step_id = ps.id
          WHERE sl.status IN ('completed', 'auto_filled', 'abnormal')
          GROUP BY sl.work_order_id
        ),
        currently_in_station AS (
          SELECT DISTINCT sl.work_order_id
          FROM station_logs sl
          WHERE sl.status = 'in_progress' AND sl.check_out_time IS NULL
        )
        SELECT
          wo.id AS "id",
          wo.order_number AS "orderNumber",
          wo.status AS "status",
          wo.planned_qty AS "plannedQty",
          wo.priority AS "priority",
          p.name AS "productName",
          p.model_number AS "modelNumber",
          wo.created_at AS "createdAt"
        FROM work_orders wo
        JOIN process_steps ps ON ps.route_id = wo.route_id AND ps.station_id = ${stationId}
        JOIN products p ON wo.product_id = p.id
        LEFT JOIN last_completed lc ON lc.work_order_id = wo.id
        WHERE wo.status = 'in_progress'
          AND wo.id NOT IN (SELECT work_order_id FROM currently_in_station)
          AND ps.step_order = COALESCE(lc.last_step_order, 0) + 1
        ORDER BY
          CASE wo.priority WHEN 'urgent' THEN 0 ELSE 1 END,
          wo.created_at ASC
      `)
      res.json({ success: true, data: result.rows })
    }
  } catch (err) {
    next(err)
  }
})

export default router
