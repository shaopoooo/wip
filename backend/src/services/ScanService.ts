import { and, desc, eq, gt, isNotNull, isNull } from 'drizzle-orm'
import { db, type Db } from '../models/db'
import {
  auditLogs,
  devices,
  processSteps,
  products,
  stationLogs,
  stations,
  workOrders,
} from '../models/schema'
import { AppError, ErrorCode } from '../utils/errors'

// ── Local types ────────────────────────────────────────────────────────────────

type WorkOrder = typeof workOrders.$inferSelect
type ProcessStep = typeof processSteps.$inferSelect
type StationLog = typeof stationLogs.$inferSelect
type Device = typeof devices.$inferSelect
type Station = typeof stations.$inferSelect
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

// ── Public interface ───────────────────────────────────────────────────────────

export interface ScanInput {
  workOrderId: string
  device: Device
  stationId?: string // Optional override from UI
  /** Check-out only. Defaults to actualQtyIn - defectQty. */
  actualQtyOut?: number
  /** Check-out only. Defaults to 0. */
  defectQty?: number
  /** Client-generated UUID for retry deduplication */
  idempotencyKey?: string
}

export interface ScanResult {
  action: 'check_in' | 'check_out'
  log: StationLog
  autoFilledCount: number
  workOrderCompleted: boolean
}

export interface CorrectionInput {
  logId: string
  device: Device
  checkInTime?: Date
  checkOutTime?: Date
  reason: string
}

const DEDUP_SECONDS = 30

// ── Idempotency cache (single-instance, in-memory) ──────────────────────────

interface CachedResult { result: ScanResult; expiresAt: number }
const idempotencyCache = new Map<string, CachedResult>()
const IDEMPOTENCY_TTL_MS = 60_000 // 60 seconds

function pruneIdempotencyCache() {
  const now = Date.now()
  for (const [key, entry] of idempotencyCache) {
    if (entry.expiresAt < now) idempotencyCache.delete(key)
  }
}

// Prune every 5 minutes
setInterval(pruneIdempotencyCache, 5 * 60_000).unref()

export class ScanService {
  // ── Main entry point ─────────────────────────────────────────────────────────

  static async scan(input: ScanInput): Promise<ScanResult> {
    const { workOrderId, device, idempotencyKey } = input

    // Idempotency: return cached result if key was already processed
    if (idempotencyKey) {
      const cached = idempotencyCache.get(idempotencyKey)
      if (cached && cached.expiresAt > Date.now()) {
        return cached.result
      }
    }

    // Wrap entire scan in a transaction with row-level lock on work order
    const result = await db.transaction(async (tx) => {
      // 1. Fetch & lock work order row (serializes concurrent scans on same WO)
      const [wo] = await tx
        .select()
        .from(workOrders)
        .where(eq(workOrders.id, workOrderId))
        .limit(1)
        .for('update')

      if (!wo) throw new AppError(ErrorCode.NOT_FOUND, '工單不存在', 404)

      if (wo.status === 'cancelled' || wo.status === 'completed') {
        throw new AppError(ErrorCode.ORDER_CLOSED, `工單已${wo.status === 'cancelled' ? '取消' : '完工'}`)
      }
      if (wo.status === 'split') {
        throw new AppError(ErrorCode.ORDER_ALREADY_SPLIT, '此工單已拆分，請掃描子單')
      }

      // 2. Sync latest routeId from product, then fetch route steps
      const [prod] = await tx
        .select({ routeId: products.routeId })
        .from(products)
        .where(eq(products.id, wo.productId))
        .limit(1)

      const latestRouteId = prod?.routeId ?? wo.routeId
      if (!latestRouteId) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, '此工單的產品尚未設定製程路由')
      }

      if (latestRouteId !== wo.routeId) {
        await tx.update(workOrders).set({ routeId: latestRouteId, updatedAt: new Date() }).where(eq(workOrders.id, wo.id))
      }

      const steps = await tx
        .select()
        .from(processSteps)
        .where(eq(processSteps.routeId, latestRouteId))
        .orderBy(processSteps.stepOrder)

      if (steps.length === 0) {
        throw new AppError(ErrorCode.NOT_FOUND, '製程無步驟', 500)
      }

      // 3. Determine the target station
      const targetStationId = await this.determineTargetStationIdTx(tx, wo.id, steps, input.stationId)

      const [station] = await tx
        .select()
        .from(stations)
        .where(eq(stations.id, targetStationId))
        .limit(1)

      if (!station) throw new AppError(ErrorCode.NOT_FOUND, '目標設備站點不存在', 500)

      // Department isolation check
      if (device.departmentId !== wo.departmentId) {
        throw new AppError(ErrorCode.WRONG_DEPARTMENT, '此裝置不屬於本產線，無法報工此工單')
      }

      // 4. Is there an open (in-progress) log for this WO at this station?
      const [openLog] = await tx
        .select()
        .from(stationLogs)
        .where(
          and(
            eq(stationLogs.workOrderId, workOrderId),
            eq(stationLogs.stationId, targetStationId),
            isNull(stationLogs.checkOutTime),
          ),
        )
        .limit(1)

      if (openLog) {
        return this.doCheckOut({ tx, wo, device, station, steps, openLog, input })
      }

      return this.doCheckIn({ tx, wo, device, station, steps, input })
    })

    // Cache result for idempotency
    if (idempotencyKey) {
      idempotencyCache.set(idempotencyKey, { result, expiresAt: Date.now() + IDEMPOTENCY_TTL_MS })
    }

    return result
  }

  // ── Infer Target Station ──────────────────────────────────────────────────────

  /** Used by preview endpoint (no transaction needed) */
  static async determineTargetStationId(workOrderId: string, steps: ProcessStep[], overrideStationId?: string): Promise<string> {
    return this._determineTargetStation(db, workOrderId, steps, overrideStationId)
  }

  /** Used inside scan transaction (shares the FOR UPDATE lock scope) */
  private static async determineTargetStationIdTx(tx: Tx, workOrderId: string, steps: ProcessStep[], overrideStationId?: string): Promise<string> {
    return this._determineTargetStation(tx, workOrderId, steps, overrideStationId)
  }

  private static async _determineTargetStation(q: Db | Tx, workOrderId: string, steps: ProcessStep[], overrideStationId?: string): Promise<string> {
    if (overrideStationId) return overrideStationId

    const completedLogs = await q
      .select()
      .from(stationLogs)
      .where(and(eq(stationLogs.workOrderId, workOrderId), isNotNull(stationLogs.checkOutTime)))
      .orderBy(desc(stationLogs.checkInTime))

    const activeLog = await q
      .select()
      .from(stationLogs)
      .where(and(eq(stationLogs.workOrderId, workOrderId), isNull(stationLogs.checkOutTime)))
      .limit(1)

    if (activeLog && activeLog.length > 0) {
      return activeLog[0]!.stationId
    }

    const completedStepIds = new Set(completedLogs.map((l) => l.stepId))
    const nextStep = steps.find(s => !completedStepIds.has(s.id))
    if (nextStep) {
      return nextStep.stationId
    }

    return steps[steps.length - 1]!.stationId
  }

  // ── Check-out ─────────────────────────────────────────────────────────────────

  private static async doCheckOut({
    tx,
    wo,
    device,
    station,
    steps,
    openLog,
    input,
  }: {
    tx: Tx
    wo: WorkOrder
    device: Device
    station: Station
    steps: ProcessStep[]
    openLog: StationLog
    input: ScanInput
  }): Promise<ScanResult> {
    const now = new Date()
    const defectQty = input.defectQty ?? 0
    const actualQtyIn = openLog.actualQtyIn ?? wo.plannedQty
    const actualQtyOut = input.actualQtyOut ?? actualQtyIn - defectQty

    const lastStep = steps[steps.length - 1]
    const isLastStep = lastStep?.id === openLog.stepId

    const [updatedLog] = await tx
      .update(stationLogs)
      .set({ checkOutTime: now, actualQtyOut, defectQty, status: 'completed' })
      .where(eq(stationLogs.id, openLog.id))
      .returning()

    if (isLastStep) {
      await tx
        .update(workOrders)
        .set({ status: 'ready_to_ship', updatedAt: now })
        .where(eq(workOrders.id, wo.id))
    }

    await tx.insert(auditLogs).values({
      entityType: 'station_log',
      entityId: openLog.id,
      action: 'check_out',
      changes: {
        checkOutTime: { old: null, new: now.toISOString() },
        actualQtyOut: { old: null, new: actualQtyOut },
        defectQty: { old: openLog.defectQty, new: defectQty },
        status: { old: 'in_progress', new: 'completed' },
      },
      deviceId: device.id,
    })

    return { action: 'check_out', log: updatedLog!, autoFilledCount: 0, workOrderCompleted: isLastStep }
  }

  // ── Check-in ──────────────────────────────────────────────────────────────────

  private static async doCheckIn({
    tx,
    wo,
    device,
    station,
    steps,
    input,
  }: {
    tx: Tx
    wo: WorkOrder
    device: Device
    station: Station
    steps: ProcessStep[]
    input: ScanInput
  }): Promise<ScanResult> {
    const now = new Date()

    // 30-second dedup
    const cutoff = new Date(now.getTime() - DEDUP_SECONDS * 1000)
    const [recentLog] = await tx
      .select({ id: stationLogs.id })
      .from(stationLogs)
      .where(
        and(
          eq(stationLogs.workOrderId, wo.id),
          eq(stationLogs.stationId, station.id),
          gt(stationLogs.checkInTime, cutoff),
        ),
      )
      .limit(1)

    if (recentLog) {
      throw new AppError(ErrorCode.DUPLICATE_SCAN, `${DEDUP_SECONDS} 秒內已掃描此工單，請確認`)
    }

    // Completed logs for this work order
    const completedLogs = await tx
      .select()
      .from(stationLogs)
      .where(and(eq(stationLogs.workOrderId, wo.id), isNotNull(stationLogs.checkOutTime)))
      .orderBy(desc(stationLogs.checkInTime))

    const completedStepIds = new Set(completedLogs.map((l) => l.stepId))

    // Confirm current station is in this route — find first uncompleted step for this station
    const currentStep = steps.find((s) => s.stationId === station.id && !completedStepIds.has(s.id))
      ?? steps.find((s) => s.stationId === station.id)
    if (!currentStep) {
      throw new AppError(ErrorCode.SKIP_STATION, '此站點不在工單的製程中')
    }
    const lastCompletedStepOrder = steps
      .filter((s) => completedStepIds.has(s.id))
      .reduce((max, s) => Math.max(max, s.stepOrder), 0)

    const gapSteps = steps.filter(
      (s) => s.stepOrder > lastCompletedStepOrder && s.stepOrder < currentStep.stepOrder,
    )

    const lastCompletedLog = completedLogs[0]
    const autoFillBaseTime = lastCompletedLog?.checkOutTime != null ? lastCompletedLog.checkOutTime : now

    // Auto-fill gap stations
    for (const gapStep of gapSteps) {
      const [filled] = await tx
        .insert(stationLogs)
        .values({
          workOrderId: wo.id,
          stationId: gapStep.stationId,
          stepId: gapStep.id,
          deviceId: device.id,
          checkInTime: autoFillBaseTime,
          checkOutTime: now,
          actualQtyIn: wo.plannedQty,
          actualQtyOut: wo.plannedQty,
          defectQty: 0,
          status: 'auto_filled',
        })
        .returning()

      await tx.insert(auditLogs).values({
        entityType: 'station_log',
        entityId: filled!.id,
        action: 'check_in',
        changes: { autoFill: true, gapStep: gapStep.stepOrder },
        deviceId: device.id,
      })
    }

    // Check-in for current station
    const [newLog] = await tx
      .insert(stationLogs)
      .values({
        workOrderId: wo.id,
        stationId: station.id,
        stepId: currentStep.id,
        deviceId: device.id,
        checkInTime: now,
        actualQtyIn: wo.plannedQty,
        defectQty: 0,
        status: 'in_progress',
      })
      .returning()

    if (wo.status === 'pending') {
      await tx
        .update(workOrders)
        .set({ status: 'in_progress', updatedAt: now })
        .where(eq(workOrders.id, wo.id))
    }

    await tx.insert(auditLogs).values({
      entityType: 'station_log',
      entityId: newLog!.id,
      action: 'check_in',
      changes: { stationId: station.id, checkInTime: now.toISOString() },
      deviceId: device.id,
    })

    return {
      action: 'check_in',
      log: newLog!,
      autoFilledCount: gapSteps.length,
      workOrderCompleted: false,
    }
  }

  // ── Time correction ───────────────────────────────────────────────────────────

  static async correct(input: CorrectionInput): Promise<StationLog> {
    const { logId, device, checkInTime, checkOutTime, reason } = input

    if (!checkInTime && !checkOutTime) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, '至少提供 checkInTime 或 checkOutTime')
    }

    const [log] = await db
      .select()
      .from(stationLogs)
      .where(eq(stationLogs.id, logId))
      .limit(1)

    if (!log) throw new AppError(ErrorCode.NOT_FOUND, '站點紀錄不存在', 404)

    if (log.status === 'auto_filled') {
      throw new AppError(ErrorCode.VALIDATION_ERROR, '自動補填紀錄不可手動補正')
    }

    const changes: Record<string, { old: unknown; new: unknown }> = { reason: { old: null, new: reason } }
    const updates: Partial<typeof log> = {}

    if (checkInTime) {
      changes['checkInTime'] = { old: log.checkInTime?.toISOString(), new: checkInTime.toISOString() }
      updates.checkInTime = checkInTime
    }
    if (checkOutTime) {
      changes['checkOutTime'] = { old: log.checkOutTime?.toISOString() ?? null, new: checkOutTime.toISOString() }
      updates.checkOutTime = checkOutTime
    }

    const updatedLog = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(stationLogs)
        .set(updates)
        .where(eq(stationLogs.id, logId))
        .returning()

      await tx.insert(auditLogs).values({
        entityType: 'station_log',
        entityId: logId,
        action: 'time_correction',
        changes,
        deviceId: device.id,
      })

      return updated!
    })

    return updatedLog
  }
}
