import { Router } from 'express'
import { z } from 'zod'
import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import { db } from '../models/db'
import { workOrders, processSteps, stationLogs, stations, products } from '../models/schema'
import { deviceAuth } from '../middleware/deviceAuth'
import { ScanService } from '../services/ScanService'
import { sendSuccess } from '../utils/response'
import { AppError, ErrorCode } from '../utils/errors'

const router = Router()

const ScanBodySchema = z.object({
  orderNumber: z.string().min(1),
  stationId: z.string().uuid().optional(),
  /** Check-out only — defaults to plannedQty - defectQty */
  actualQtyOut: z.number().int().min(0).optional(),
  /** Check-out only — defaults to 0 */
  defectQty: z.number().int().min(0).optional(),
  /** Client-generated UUID for retry deduplication */
  idempotencyKey: z.string().uuid().optional(),
})

const CorrectionBodySchema = z.object({
  checkInTime: z.string().datetime().optional(),
  checkOutTime: z.string().datetime().optional(),
  reason: z.string().min(1).max(500),
})

// GET /api/scan/preview?orderNumber=&stationId=
router.get('/preview', deviceAuth, async (req, res, next) => {
  try {
    const orderNumber = req.query['orderNumber']
    const stationIdParam = req.query['stationId']

    if (typeof orderNumber !== 'string' || !orderNumber) {
      return next(new AppError(ErrorCode.VALIDATION_ERROR, 'orderNumber query param is required'))
    }

    const overrideStationId = typeof stationIdParam === 'string' && stationIdParam ? stationIdParam : undefined

    const device = req.device!

    // Work order + product
    const woRows = await db
      .select({ wo: workOrders, product: { name: products.name, modelNumber: products.modelNumber } })
      .from(workOrders)
      .innerJoin(products, eq(workOrders.productId, products.id))
      .where(eq(workOrders.orderNumber, orderNumber))
      .limit(1)

    if (woRows.length === 0) return next(new AppError(ErrorCode.NOT_FOUND, '工單不存在', 404))
    const { wo, product } = woRows[0]!

    if (wo.status === 'cancelled' || wo.status === 'completed')
      return next(new AppError(ErrorCode.ORDER_CLOSED, `工單已${wo.status === 'cancelled' ? '取消' : '完工'}`))
    if (wo.status === 'split')
      return next(new AppError(ErrorCode.ORDER_ALREADY_SPLIT, '此工單已拆分，請掃描子單'))

    // Department check
    if (device.departmentId !== wo.departmentId) {
      return next(new AppError(ErrorCode.WRONG_DEPARTMENT, '此裝置不屬於本產線，無法預覽此工單'))
    }

    // Process Steps
    const steps = await db
      .select()
      .from(processSteps)
      .where(eq(processSteps.routeId, wo.routeId))
      .orderBy(processSteps.stepOrder)

    if (steps.length === 0) return next(new AppError(ErrorCode.NOT_FOUND, '製程無步驟', 500))

    const targetStationId = await ScanService.determineTargetStationId(wo.id, steps, overrideStationId)

    const [station] = await db.select().from(stations).where(eq(stations.id, targetStationId)).limit(1)
    if (!station) return next(new AppError(ErrorCode.NOT_FOUND, '目標設備站點不存在', 500))

    const step = steps.find(s => s.stationId === targetStationId)
    if (!step) return next(new AppError(ErrorCode.SKIP_STATION, '推導或指定的站點不在工單的製程'))

    // Open log at this station?
    const [openLog] = await db
      .select()
      .from(stationLogs)
      .where(
        and(
          eq(stationLogs.workOrderId, wo.id),
          eq(stationLogs.stationId, targetStationId),
          isNull(stationLogs.checkOutTime),
        ),
      )
      .limit(1)

    // Steps context — fetch all station names + logs for this work order
    const allStationIds = [...new Set(steps.map(s => s.stationId))]
    const stationRows = await db
      .select({ id: stations.id, name: stations.name, code: stations.code, description: stations.description })
      .from(stations)
      .where(inArray(stations.id, allStationIds))
    const stationMap = new Map(stationRows.map(s => [s.id, s]))

    const allLogs = await db
      .select({
        stepId: stationLogs.stepId,
        status: stationLogs.status,
        checkInTime: stationLogs.checkInTime,
        checkOutTime: stationLogs.checkOutTime,
      })
      .from(stationLogs)
      .where(eq(stationLogs.workOrderId, wo.id))

    const logByStepId = new Map(allLogs.map(l => [l.stepId, l]))

    const stepsContext = steps.map(s => {
      const st = stationMap.get(s.stationId)
      const log = logByStepId.get(s.id)
      return {
        stepOrder: s.stepOrder,
        stationName: st?.name ?? '',
        stationCode: st?.code ?? null,
        status: log ? log.status : 'pending',
        checkInTime: log?.checkInTime?.toISOString() ?? null,
        checkOutTime: log?.checkOutTime?.toISOString() ?? null,
      }
    })

    sendSuccess(res, {
      action: openLog ? 'check_out' : 'check_in',
      workOrder: { id: wo.id, orderNumber: wo.orderNumber, plannedQty: wo.plannedQty, status: wo.status },
      product,
      station: { id: station.id, name: station.name, code: station.code, description: station.description },
      step: { stepOrder: step.stepOrder },
      openLog: openLog
        ? { id: openLog.id, checkInTime: openLog.checkInTime, actualQtyIn: openLog.actualQtyIn }
        : null,
      stepsContext,
    })
  } catch (err) {
    next(err)
  }
})

// POST /api/scan
router.post('/', deviceAuth, async (req, res, next) => {
  try {
    const parsed = ScanBodySchema.safeParse(req.body)
    if (!parsed.success) {
      return next(
        new AppError(ErrorCode.VALIDATION_ERROR, parsed.error.issues[0]?.message ?? 'Invalid body'),
      )
    }

    // Resolve orderNumber → UUID
    const [woRow] = await db
      .select({ id: workOrders.id })
      .from(workOrders)
      .where(eq(workOrders.orderNumber, parsed.data.orderNumber))
      .limit(1)

    if (!woRow) {
      return next(new AppError(ErrorCode.NOT_FOUND, '工單不存在', 404))
    }

    const result = await ScanService.scan({
      workOrderId: woRow.id,
      device: req.device!,
      stationId: parsed.data.stationId,
      actualQtyOut: parsed.data.actualQtyOut,
      defectQty: parsed.data.defectQty,
      idempotencyKey: parsed.data.idempotencyKey,
    })

    sendSuccess(res, result)
  } catch (err) {
    next(err)
  }
})

// GET /api/scan/logs?orderNumber=
router.get('/logs', deviceAuth, async (req, res, next) => {
  try {
    const orderNumber = req.query['orderNumber']
    if (typeof orderNumber !== 'string' || !orderNumber) {
      return next(new AppError(ErrorCode.VALIDATION_ERROR, 'orderNumber query param is required'))
    }

    const [wo] = await db
      .select({ id: workOrders.id, orderNumber: workOrders.orderNumber, departmentId: workOrders.departmentId })
      .from(workOrders)
      .where(eq(workOrders.orderNumber, orderNumber))
      .limit(1)

    if (!wo) return next(new AppError(ErrorCode.NOT_FOUND, '工單不存在', 404))
    if (wo.departmentId !== req.device!.departmentId) {
      return next(new AppError(ErrorCode.WRONG_DEPARTMENT, '此裝置不屬於本產線'))
    }

    const logs = await db
      .select({
        id: stationLogs.id,
        stationId: stationLogs.stationId,
        stationName: stations.name,
        stationCode: stations.code,
        status: stationLogs.status,
        checkInTime: stationLogs.checkInTime,
        checkOutTime: stationLogs.checkOutTime,
        actualQtyIn: stationLogs.actualQtyIn,
        actualQtyOut: stationLogs.actualQtyOut,
      })
      .from(stationLogs)
      .innerJoin(stations, eq(stationLogs.stationId, stations.id))
      .where(eq(stationLogs.workOrderId, wo.id))
      .orderBy(asc(stationLogs.checkInTime))

    sendSuccess(res, { orderNumber: wo.orderNumber, logs })
  } catch (err) {
    next(err)
  }
})

// PATCH /api/scan/:logId/correction
router.patch('/:logId/correction', deviceAuth, async (req, res, next) => {
  try {
    const logId = req.params['logId'] as string

    const parsed = CorrectionBodySchema.safeParse(req.body)
    if (!parsed.success) {
      return next(
        new AppError(ErrorCode.VALIDATION_ERROR, parsed.error.issues[0]?.message ?? 'Invalid body'),
      )
    }

    const result = await ScanService.correct({
      logId,
      device: req.device!,
      checkInTime: parsed.data.checkInTime ? new Date(parsed.data.checkInTime) : undefined,
      checkOutTime: parsed.data.checkOutTime ? new Date(parsed.data.checkOutTime) : undefined,
      reason: parsed.data.reason,
    })

    sendSuccess(res, result)
  } catch (err) {
    next(err)
  }
})

export default router
