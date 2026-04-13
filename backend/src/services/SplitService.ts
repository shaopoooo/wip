import { and, count, eq, inArray, isNull, isNotNull } from 'drizzle-orm'
import QRCode from 'qrcode'
import { db, type Db } from '../models/db'
import { auditLogs, splitLogs, stationLogs, workOrders } from '../models/schema'
import { asc } from 'drizzle-orm'
import { AppError, ErrorCode } from '../utils/errors'

// ── Local types ────────────────────────────────────────────────────────────────

type WorkOrder = typeof workOrders.$inferSelect
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

// ── Public interface ───────────────────────────────────────────────────────────

export interface SplitChild {
  plannedQty: number
  priority?: 'normal' | 'urgent'
  dueDate?: string | null
}

export interface SplitInput {
  parentId: string
  children: SplitChild[]
  splitReason: 'rush' | 'batch_shipment'
  splitNote?: string
}

export interface ChildResult {
  id: string
  orderNumber: string
  plannedQty: number
  priority: string
  dueDate: string | null
  qrDataUrl: string
}

export interface SplitResult {
  parentOrderNumber: string
  parentStatus: string
  children: ChildResult[]
}

// ── Child order number generation ──────────────────────────────────────────────

/**
 * Determines the suffix type based on parent's order number depth.
 *
 * 1150409001      → children use -A, -B, -C  (letter suffix)
 * 1150409001-A    → children use 1, 2, 3      (number suffix, no dash)
 */
function buildChildOrderNumbers(
  parentOrderNumber: string,
  existingChildCount: number,
  newChildCount: number,
): string[] {
  // A child order ends with -LETTER (e.g. A1150409001-A)
  const isChildOrder = /-[A-Z]$/.test(parentOrderNumber)

  const result: string[] = []
  for (let i = 0; i < newChildCount; i++) {
    const idx = existingChildCount + i
    if (isChildOrder) {
      // Grandchild: A1150409001-A → A1150409001-A1
      result.push(`${parentOrderNumber}${idx + 1}`)
    } else {
      // Child: A1150409001 → A1150409001-A
      result.push(`${parentOrderNumber}-${String.fromCharCode(65 + idx)}`)
    }
  }
  return result
}

// ── SplitService ───────────────────────────────────────────────────────────────

export class SplitService {
  static async split(input: SplitInput): Promise<SplitResult> {
    const { parentId, children, splitReason, splitNote } = input

    if (children.length < 2) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, '拆單至少需要 2 張子單')
    }

    const result = await db.transaction(async (tx) => {
      // 1. Lock parent row
      const [parent] = await tx
        .select()
        .from(workOrders)
        .where(eq(workOrders.id, parentId))
        .limit(1)
        .for('update')

      if (!parent) throw new AppError(ErrorCode.NOT_FOUND, '工單不存在', 404)

      if (parent.status === 'cancelled' || parent.status === 'completed') {
        throw new AppError(ErrorCode.ORDER_CLOSED, '已取消或已完工的工單不可拆單')
      }
      if (parent.status === 'split') {
        throw new AppError(ErrorCode.ORDER_ALREADY_SPLIT, '此工單已拆分，請操作子單')
      }

      // 2. Validate total qty
      const totalQty = children.reduce((sum, c) => sum + c.plannedQty, 0)
      if (totalQty !== parent.plannedQty) {
        throw new AppError(
          ErrorCode.SPLIT_QTY_MISMATCH,
          `子單數量總和 (${totalQty}) 不等於母單數量 (${parent.plannedQty})`,
        )
      }

      // 3. Close in-progress station_logs as 'split' (not abnormal)
      await tx
        .update(stationLogs)
        .set({ status: 'split', checkOutTime: new Date() })
        .where(and(eq(stationLogs.workOrderId, parentId), isNull(stationLogs.checkOutTime)))

      // 3.5. Fetch all closed logs from parent to inherit
      const parentLogs = await tx
        .select()
        .from(stationLogs)
        .where(and(
          eq(stationLogs.workOrderId, parentId),
          isNotNull(stationLogs.checkOutTime),
        ))
        .orderBy(asc(stationLogs.checkInTime))

      // 4. Count existing children (including cancelled) to determine suffix start
      const countResult = await tx
        .select({ value: count() })
        .from(workOrders)
        .where(eq(workOrders.parentWorkOrderId, parentId))
      const existingChildCount = Number(countResult[0]?.value ?? 0)

      const orderNumbers = buildChildOrderNumbers(
        parent.orderNumber,
        existingChildCount,
        children.length,
      )

      // 5. Insert child work orders
      const childIds: string[] = []
      const childResults: ChildResult[] = []

      for (let i = 0; i < children.length; i++) {
        const child = children[i]!
        const orderNumber = orderNumbers[i]!

        const [inserted] = await tx
          .insert(workOrders)
          .values({
            departmentId: parent.departmentId,
            orderNumber,
            productId: parent.productId,
            routeId: parent.routeId,
            plannedQty: child.plannedQty,
            orderQty: child.plannedQty,
            status: 'pending',
            priority: child.priority ?? parent.priority ?? 'normal',
            dueDate: child.dueDate ?? parent.dueDate,
            parentWorkOrderId: parentId,
            splitReason,
            isSplit: false,
          })
          .returning()

        childIds.push(inserted!.id)

        // Inherit station_logs from parent
        for (const log of parentLogs) {
          if (log.status === 'split') {
            // Was in-progress at split time → re-open as new check-in for child
            await tx.insert(stationLogs).values({
              workOrderId: inserted!.id,
              stationId: log.stationId,
              equipmentId: log.equipmentId,
              deviceId: log.deviceId,
              stepId: log.stepId,
              checkInTime: log.checkInTime,
              checkOutTime: null,
              actualQtyIn: log.actualQtyIn,
              actualQtyOut: null,
              defectQty: 0,
              status: 'in_progress',
              previousLogId: log.previousLogId,
            })
          } else {
            // completed / auto_filled → copy as-is
            await tx.insert(stationLogs).values({
              workOrderId: inserted!.id,
              stationId: log.stationId,
              equipmentId: log.equipmentId,
              deviceId: log.deviceId,
              stepId: log.stepId,
              checkInTime: log.checkInTime,
              checkOutTime: log.checkOutTime,
              actualQtyIn: log.actualQtyIn,
              actualQtyOut: log.actualQtyOut,
              defectQty: log.defectQty,
              status: log.status,
              previousLogId: log.previousLogId,
            })
          }
        }

        // Set child status to in_progress if it inherited logs
        if (parentLogs.length > 0) {
          await tx.update(workOrders).set({ status: 'in_progress' }).where(eq(workOrders.id, inserted!.id))
        }

        const qrDataUrl = await QRCode.toDataURL(orderNumber, {
          width: 300,
          margin: 2,
          errorCorrectionLevel: 'M',
        })

        childResults.push({
          id: inserted!.id,
          orderNumber,
          plannedQty: child.plannedQty,
          priority: inserted!.priority ?? 'normal',
          dueDate: inserted!.dueDate ?? null,
          qrDataUrl,
        })
      }

      // 6. Update parent status to split
      await tx
        .update(workOrders)
        .set({ status: 'split', isSplit: true, updatedAt: new Date() })
        .where(eq(workOrders.id, parentId))

      // 7. Build qty distribution map: { orderNumber: qty }
      const qtyDistribution: Record<string, number> = {}
      for (let i = 0; i < children.length; i++) {
        qtyDistribution[orderNumbers[i]!] = children[i]!.plannedQty
      }

      // 8. Insert split_log
      const [splitLog] = await tx
        .insert(splitLogs)
        .values({
          parentWorkOrderId: parentId,
          childWorkOrderIds: childIds,
          splitReason,
          splitNote: splitNote ?? null,
          qtyBeforeSplit: parent.plannedQty,
          qtyDistribution,
        })
        .returning()

      // 9. Insert audit_log
      await tx.insert(auditLogs).values({
        entityType: 'work_order',
        entityId: parentId,
        action: 'split',
        changes: {
          splitLogId: splitLog!.id,
          childWorkOrderIds: childIds,
          qtyDistribution,
        },
      })

      return {
        parentOrderNumber: parent.orderNumber,
        parentStatus: 'split',
        children: childResults,
      }
    })

    return result
  }

  static async getSplitHistory(parentId: string): Promise<typeof splitLogs.$inferSelect[]> {
    return db
      .select()
      .from(splitLogs)
      .where(eq(splitLogs.parentWorkOrderId, parentId))
  }
}
