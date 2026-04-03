import { and, desc, eq, gt, isNotNull, isNull } from 'drizzle-orm'
import { db } from '../models/db'
import {
  auditLogs,
  devices,
  processSteps,
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

// ── Public interface ───────────────────────────────────────────────────────────

export interface ScanInput {
  workOrderId: string
  device: Device
  stationId?: string // Optional override from UI
  /** Check-out only. Defaults to actualQtyIn - defectQty. */
  actualQtyOut?: number
  /** Check-out only. Defaults to 0. */
  defectQty?: number
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

export class ScanService {
  // ── Main entry point ─────────────────────────────────────────────────────────

  static async scan(input: ScanInput): Promise<ScanResult> {
    const { workOrderId, device } = input

    // 1. Fetch & validate work order
    const [wo] = await db
      .select()
      .from(workOrders)
      .where(eq(workOrders.id, workOrderId))
      .limit(1)

    if (!wo) throw new AppError(ErrorCode.NOT_FOUND, '工單不存在', 404)

    if (wo.status === 'cancelled' || wo.status === 'completed') {
      throw new AppError(ErrorCode.ORDER_CLOSED, `工單已${wo.status === 'cancelled' ? '取消' : '完工'}`)
    }
    if (wo.status === 'split') {
      throw new AppError(ErrorCode.ORDER_ALREADY_SPLIT, '此工單已拆分，請掃描子單')
    }

    // 2. Fetch route steps ordered by step_order
    const steps = await db
      .select()
      .from(processSteps)
      .where(eq(processSteps.routeId, wo.routeId))
      .orderBy(processSteps.stepOrder)

    if (steps.length === 0) {
      throw new AppError(ErrorCode.NOT_FOUND, '工序路由無步驟', 500)
    }

    // 3. Determine the target station
    const targetStationId = await this.determineTargetStationId(wo.id, steps, input.stationId)

    const [station] = await db
      .select()
      .from(stations)
      .where(eq(stations.id, targetStationId))
      .limit(1)

    if (!station) throw new AppError(ErrorCode.NOT_FOUND, '目標設備站點不存在', 500)

    // Department isolation check (Device's department vs Station's department)
    // Actually, Device department should match WO's department.
    if (device.departmentId !== wo.departmentId) {
      throw new AppError(ErrorCode.WRONG_DEPARTMENT, '此裝置不屬於本產線，無法報工此工單')
    }

    // 4. Is there an open (in-progress) log for this WO at this station?
    const [openLog] = await db
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
      return this.doCheckOut({ wo, device, station, steps, openLog, input })
    }

    return this.doCheckIn({ wo, device, station, steps, input })
  }

  // ── Infer Target Station ──────────────────────────────────────────────────────

  static async determineTargetStationId(workOrderId: string, steps: ProcessStep[], overrideStationId?: string): Promise<string> {
    if (overrideStationId) return overrideStationId

    // Auto-infer based on progress
    const completedLogs = await db
      .select()
      .from(stationLogs)
      .where(and(eq(stationLogs.workOrderId, workOrderId), isNotNull(stationLogs.checkOutTime)))
      .orderBy(desc(stationLogs.checkInTime))

    const activeLog = await db
      .select()
      .from(stationLogs)
      .where(and(eq(stationLogs.workOrderId, workOrderId), isNull(stationLogs.checkOutTime)))
      .limit(1)

    // If there's an open log, that is the current station
    if (activeLog && activeLog.length > 0) {
      return activeLog[0]!.stationId
    }

    // Otherwise, find the next uncompleted step
    const completedStepIds = new Set(completedLogs.map((l) => l.stepId))
    const nextStep = steps.find(s => !completedStepIds.has(s.id))
    if (nextStep) {
      return nextStep.stationId
    }

    // If all steps completed, but work order somehow not marked completed, guess last station
    return steps[steps.length - 1]!.stationId
  }

  // ── Check-out ─────────────────────────────────────────────────────────────────

  private static async doCheckOut({
    wo,
    device,
    station,
    steps,
    openLog,
    input,
  }: {
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

    const updatedLog = await db.transaction(async (tx) => {
      const [log] = await tx
        .update(stationLogs)
        .set({ checkOutTime: now, actualQtyOut, defectQty, status: 'completed' })
        .where(eq(stationLogs.id, openLog.id))
        .returning()

      if (isLastStep) {
        await tx
          .update(workOrders)
          .set({ status: 'completed', updatedAt: now })
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

      return log!
    })

    return { action: 'check_out', log: updatedLog, autoFilledCount: 0, workOrderCompleted: isLastStep }
  }

  // ── Check-in ──────────────────────────────────────────────────────────────────

  private static async doCheckIn({
    wo,
    device,
    station,
    steps,
    input,
  }: {
    wo: WorkOrder
    device: Device
    station: Station
    steps: ProcessStep[]
    input: ScanInput
  }): Promise<ScanResult> {
    const now = new Date()

    // Confirm current station is in this route
    const currentStep = steps.find((s) => s.stationId === station.id)
    if (!currentStep) {
      throw new AppError(ErrorCode.SKIP_STATION, '此站點不在工單的工序路由中')
    }

    // 30-second dedup
    const cutoff = new Date(now.getTime() - DEDUP_SECONDS * 1000)
    const [recentLog] = await db
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
    const completedLogs = await db
      .select()
      .from(stationLogs)
      .where(and(eq(stationLogs.workOrderId, wo.id), isNotNull(stationLogs.checkOutTime)))
      .orderBy(desc(stationLogs.checkInTime))

    const completedStepIds = new Set(completedLogs.map((l) => l.stepId))
    const lastCompletedStepOrder = steps
      .filter((s) => completedStepIds.has(s.id))
      .reduce((max, s) => Math.max(max, s.stepOrder), 0)

    const gapSteps = steps.filter(
      (s) => s.stepOrder > lastCompletedStepOrder && s.stepOrder < currentStep.stepOrder,
    )

    const lastCompletedLog = completedLogs[0]
    const autoFillBaseTime = lastCompletedLog?.checkOutTime != null ? lastCompletedLog.checkOutTime : now

    const newLog = await db.transaction(async (tx) => {
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
      const [log] = await tx
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
        entityId: log!.id,
        action: 'check_in',
        changes: { stationId: station.id, checkInTime: now.toISOString() },
        deviceId: device.id,
      })

      return log!
    })

    return {
      action: 'check_in',
      log: newLog,
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
