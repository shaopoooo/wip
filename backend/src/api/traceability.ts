import { Router } from 'express'
import { db } from '../models/db'
import { sql } from 'drizzle-orm'
import { eq } from 'drizzle-orm'
import {
  workOrders, products, departments, stations, groups,
  stationLogs, processSteps,
} from '../models/schema'

const router = Router()

// Resolve work order by UUID or order number
async function resolveWorkOrder(idOrOrderNumber: string) {
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrOrderNumber)
  const condition = isUUID
    ? eq(workOrders.id, idOrOrderNumber)
    : eq(workOrders.orderNumber, idOrOrderNumber)

  const [row] = await db
    .select({
      id: workOrders.id,
      orderNumber: workOrders.orderNumber,
      status: workOrders.status,
      plannedQty: workOrders.plannedQty,
      priority: workOrders.priority,
      dueDate: workOrders.dueDate,
      parentWorkOrderId: workOrders.parentWorkOrderId,
      isSplit: workOrders.isSplit,
      createdAt: workOrders.createdAt,
      note: workOrders.note,
      productName: products.name,
      modelNumber: products.modelNumber,
      productDescription: products.description,
      departmentId: departments.id,
      departmentName: departments.name,
      departmentCode: departments.code,
    })
    .from(workOrders)
    .innerJoin(products, eq(workOrders.productId, products.id))
    .innerJoin(departments, eq(workOrders.departmentId, departments.id))
    .where(condition)

  return row ?? null
}

// GET /api/traceability/:idOrOrderNumber — full station history
router.get('/:idOrOrderNumber', async (req, res, next) => {
  try {
    const { idOrOrderNumber } = req.params
    const wo = await resolveWorkOrder(idOrOrderNumber)

    if (!wo) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '工單不存在' } })
      return
    }

    const logs = await db
      .select({
        id: stationLogs.id,
        stationName: stations.name,
        stationCode: stations.code,
        groupName: groups.name,
        status: stationLogs.status,
        checkInTime: stationLogs.checkInTime,
        checkOutTime: stationLogs.checkOutTime,
        actualQtyIn: stationLogs.actualQtyIn,
        actualQtyOut: stationLogs.actualQtyOut,
        defectQty: stationLogs.defectQty,
        stepOrder: processSteps.stepOrder,
      })
      .from(stationLogs)
      .innerJoin(stations, eq(stationLogs.stationId, stations.id))
      .leftJoin(groups, eq(stations.groupId, groups.id))
      .innerJoin(processSteps, eq(stationLogs.stepId, processSteps.id))
      .where(eq(stationLogs.workOrderId, wo.id))
      .orderBy(processSteps.stepOrder, stationLogs.checkInTime)

    res.json({ success: true, data: { workOrder: wo, logs } })
  } catch (err) {
    next(err)
  }
})

// GET /api/traceability/:idOrOrderNumber/family — parent/child order tree
router.get('/:idOrOrderNumber/family', async (req, res, next) => {
  try {
    const { idOrOrderNumber } = req.params
    const wo = await resolveWorkOrder(idOrOrderNumber)

    if (!wo) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '工單不存在' } })
      return
    }

    // Recursive CTE: go up to root, then get all descendants
    const result = await db.execute(sql`
      WITH RECURSIVE
      ancestors AS (
        SELECT id, parent_work_order_id
        FROM work_orders
        WHERE id = ${wo.id}
        UNION ALL
        SELECT wo.id, wo.parent_work_order_id
        FROM work_orders wo
        JOIN ancestors a ON a.parent_work_order_id = wo.id
      ),
      root AS (
        SELECT id FROM ancestors WHERE parent_work_order_id IS NULL
      ),
      family AS (
        SELECT
          wo.id, wo.order_number, wo.status, wo.planned_qty,
          wo.priority, wo.due_date, wo.parent_work_order_id,
          wo.is_split, wo.created_at, wo.product_id,
          0 AS depth
        FROM work_orders wo
        WHERE wo.id IN (SELECT id FROM root)
        UNION ALL
        SELECT
          wo.id, wo.order_number, wo.status, wo.planned_qty,
          wo.priority, wo.due_date, wo.parent_work_order_id,
          wo.is_split, wo.created_at, wo.product_id,
          f.depth + 1
        FROM work_orders wo
        JOIN family f ON wo.parent_work_order_id = f.id
      )
      SELECT
        f.id AS "id",
        f.order_number AS "orderNumber",
        f.status AS "status",
        f.planned_qty AS "plannedQty",
        f.priority AS "priority",
        f.due_date AS "dueDate",
        f.parent_work_order_id AS "parentWorkOrderId",
        f.is_split AS "isSplit",
        f.created_at AS "createdAt",
        f.depth AS "depth",
        p.name AS "productName",
        p.model_number AS "modelNumber"
      FROM family f
      JOIN products p ON f.product_id = p.id
      ORDER BY f.depth, f.created_at
    `)

    res.json({ success: true, data: result.rows })
  } catch (err) {
    next(err)
  }
})

export default router
