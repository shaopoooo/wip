import { Router } from 'express'
import { and, asc, count, desc, eq, ilike, isNotNull, isNull, like, or, SQL } from 'drizzle-orm'
import { z } from 'zod'
import QRCode from 'qrcode'
import { db } from '../../models/db'
import { workOrders, products, processRoutes, processSteps, departments, stationLogs, stations, devices } from '../../models/schema'
import { adminAuth } from '../../middleware/adminAuth'
import { sendSuccess } from '../../utils/response'
import { AppError, ErrorCode } from '../../utils/errors'
import { SplitService } from '../../services/SplitService'

const router = Router()
router.use(adminAuth)

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Resolve :id param — accepts UUID or orderNumber, returns UUID */
async function resolveWoId(param: string): Promise<string | null> {
  const cond = UUID_RE.test(param) ? eq(workOrders.id, param) : eq(workOrders.orderNumber, param)
  const [row] = await db.select({ id: workOrders.id }).from(workOrders).where(cond).limit(1)
  return row?.id ?? null
}

const CreateWorkOrderSchema = z.object({
  departmentId: z.string().uuid(),
  productId: z.string().uuid(),
  orderQty: z.number().int().min(1),              // 訂單數量（必填）
  plannedQty: z.number().int().min(1).optional(),  // 製作數量（選填，預設等於 orderQty）
  priority: z.enum(['normal', 'urgent']).default('normal'),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  note: z.string().optional().nullable(),
})

// ── Auto-generate order number ────────────────────────────────────────────────
// Format: {ROC_YYYMMDD}{3-digit seq}  e.g. 1150409001

async function generateOrderNumber(_deptCode: string): Promise<string> {
  const now = new Date()
  const rocYear = now.getFullYear() - 1911
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const prefix = `${rocYear}${mm}${dd}`

  const [last] = await db
    .select({ orderNumber: workOrders.orderNumber })
    .from(workOrders)
    .where(like(workOrders.orderNumber, `${prefix}%`))
    .orderBy(desc(workOrders.orderNumber))
    .limit(1)

  const seq = last ? (parseInt(last.orderNumber.slice(prefix.length, prefix.length + 3), 10) || 0) + 1 : 1
  return `${prefix}${String(seq).padStart(3, '0')}`
}

// GET /api/admin/work-orders?department_id=&status=&route_filter=&search=&sort_by=&sort_dir=&page=&limit=
router.get('/', async (req, res, next) => {
  try {
    const departmentId = req.query['department_id'] as string | undefined
    const status = req.query['status'] as string | undefined
    const routeFilter = req.query['route_filter'] as string | undefined  // 'set' | 'unset'
    const search = (req.query['search'] as string | undefined)?.trim()
    const sortBy = req.query['sort_by'] as string | undefined
    const sortDir = req.query['sort_dir'] === 'asc' ? 'asc' : 'desc'
    const page = Math.max(1, Number(req.query['page'] ?? 1))
    const limit = Math.min(100, Math.max(1, Number(req.query['limit'] ?? 20)))
    const offset = (page - 1) * limit

    if (!departmentId) {
      return next(new AppError(ErrorCode.VALIDATION_ERROR, 'department_id is required'))
    }

    const conditions: SQL[] = [eq(workOrders.departmentId, departmentId)]
    if (status) conditions.push(eq(workOrders.status, status))
    if (routeFilter === 'set') conditions.push(isNotNull(workOrders.routeId))
    if (routeFilter === 'unset') conditions.push(isNull(workOrders.routeId))
    if (search) {
      const pattern = `%${search}%`
      conditions.push(or(
        ilike(workOrders.orderNumber, pattern),
        ilike(products.modelNumber, pattern),
        ilike(products.name, pattern),
      )!)
    }

    // Sortable columns whitelist
    const sortColMap = {
      order_number: workOrders.orderNumber,
      order_qty: workOrders.orderQty,
      due_date: workOrders.dueDate,
      created_at: workOrders.createdAt,
    } as const
    type SortKey = keyof typeof sortColMap
    const sortCol = (sortBy && sortBy in sortColMap) ? sortColMap[sortBy as SortKey] : workOrders.createdAt
    const orderExpr = sortDir === 'asc' ? asc(sortCol) : desc(sortCol)

    const baseQuery = db
      .select({
        workOrder: workOrders,
        product: { name: products.name, modelNumber: products.modelNumber },
      })
      .from(workOrders)
      .innerJoin(products, eq(workOrders.productId, products.id))
      .where(and(...conditions))

    const [rows, [totalRow]] = await Promise.all([
      baseQuery
        .orderBy(orderExpr)
        .limit(limit)
        .offset(offset),
      db.select({ count: count() })
        .from(workOrders)
        .innerJoin(products, eq(workOrders.productId, products.id))
        .where(and(...conditions)),
    ])

    sendSuccess(res, { items: rows, total: totalRow?.count ?? 0, page, limit })
  } catch (err) {
    next(err)
  }
})

// GET /api/admin/work-orders/:id — supports UUID or orderNumber
router.get('/:id', async (req, res, next) => {
  try {
    const woId = await resolveWoId(req.params['id'] as string)
    if (!woId) return next(new AppError(ErrorCode.NOT_FOUND, '工單不存在', 404))

    // Sync latest routeId from product before querying
    const [woRow] = await db
      .select({ id: workOrders.id, productId: workOrders.productId, routeId: workOrders.routeId })
      .from(workOrders)
      .where(eq(workOrders.id, woId))
      .limit(1)

    if (!woRow) return next(new AppError(ErrorCode.NOT_FOUND, '工單不存在', 404))

    const [prod] = await db
      .select({ routeId: products.routeId })
      .from(products)
      .where(eq(products.id, woRow.productId))
      .limit(1)

    const latestRouteId = prod?.routeId ?? woRow.routeId
    if (latestRouteId && latestRouteId !== woRow.routeId) {
      await db.update(workOrders).set({ routeId: latestRouteId, updatedAt: new Date() }).where(eq(workOrders.id, woRow.id))
    }

    const rows = await db
      .select({
        workOrder: workOrders,
        product: { name: products.name, modelNumber: products.modelNumber, description: products.description },
        route: { name: processRoutes.name, description: processRoutes.description },
      })
      .from(workOrders)
      .innerJoin(products, eq(workOrders.productId, products.id))
      .leftJoin(processRoutes, eq(workOrders.routeId, processRoutes.id))
      .where(eq(workOrders.id, woRow.id))
      .limit(1)

    if (rows.length === 0) return next(new AppError(ErrorCode.NOT_FOUND, '工單不存在', 404))

    // Station logs for this work order
    const logs = await db
      .select({
        id: stationLogs.id,
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
      .where(eq(stationLogs.workOrderId, woRow.id))
      .orderBy(asc(stationLogs.checkInTime))

    sendSuccess(res, { ...rows[0], logs })
  } catch (err) {
    next(err)
  }
})

// POST /api/admin/work-orders
router.post('/', async (req, res, next) => {
  try {
    const parsed = CreateWorkOrderSchema.safeParse(req.body)
    if (!parsed.success) {
      return next(new AppError(ErrorCode.VALIDATION_ERROR, parsed.error.issues[0]?.message ?? 'Invalid body'))
    }

    // Validate department
    const [dept] = await db
      .select({ id: departments.id, code: departments.code })
      .from(departments)
      .where(eq(departments.id, parsed.data.departmentId))
      .limit(1)
    if (!dept) return next(new AppError(ErrorCode.NOT_FOUND, '部門不存在', 404))

    // Validate product belongs to department & get routeId
    const [product] = await db
      .select({ id: products.id, routeId: products.routeId })
      .from(products)
      .where(and(eq(products.id, parsed.data.productId), eq(products.departmentId, parsed.data.departmentId)))
      .limit(1)
    if (!product) return next(new AppError(ErrorCode.NOT_FOUND, '產品不屬於此部門', 404))

    const orderNumber = await generateOrderNumber(dept.code)

    const [wo] = await db
      .insert(workOrders)
      .values({
        departmentId: parsed.data.departmentId,
        orderNumber,
        productId: parsed.data.productId,
        routeId: product.routeId ?? null,
        orderQty: parsed.data.orderQty,
        plannedQty: parsed.data.plannedQty ?? parsed.data.orderQty,
        status: 'pending',
        priority: parsed.data.priority,
        dueDate: parsed.data.dueDate ?? null,
        note: parsed.data.note ?? null,
      })
      .returning()

    sendSuccess(res, wo, 201)
  } catch (err) {
    next(err)
  }
})

// PATCH /api/admin/work-orders/:id — edit work order fields
const UpdateWorkOrderSchema = z.object({
  orderNumber: z.string().min(1).max(50).optional(),
  orderQty: z.number().int().min(1).optional(),
  plannedQty: z.number().int().min(1).optional(),
  priority: z.enum(['normal', 'urgent']).optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  note: z.string().optional().nullable(),
  productId: z.string().uuid().optional(),
})

router.patch('/:id', async (req, res, next) => {
  try {
    const woId = await resolveWoId(req.params['id'] as string)
    if (!woId) return next(new AppError(ErrorCode.NOT_FOUND, '工單不存在', 404))

    const parsed = UpdateWorkOrderSchema.safeParse(req.body)
    if (!parsed.success) {
      return next(new AppError(ErrorCode.VALIDATION_ERROR, parsed.error.issues[0]?.message ?? 'Invalid body'))
    }

    // Don't allow editing completed/cancelled/split work orders
    const [current] = await db.select({ status: workOrders.status }).from(workOrders).where(eq(workOrders.id, woId)).limit(1)
    if (!current) return next(new AppError(ErrorCode.NOT_FOUND, '工單不存在', 404))
    if (['completed', 'cancelled', 'split'].includes(current.status)) {
      return next(new AppError(ErrorCode.VALIDATION_ERROR, '已完工/已取消/已拆單的工單不可編輯'))
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() }
    if (parsed.data.orderNumber !== undefined) updates['orderNumber'] = parsed.data.orderNumber
    if (parsed.data.orderQty !== undefined) updates['orderQty'] = parsed.data.orderQty
    if (parsed.data.plannedQty !== undefined) updates['plannedQty'] = parsed.data.plannedQty
    if (parsed.data.priority !== undefined) updates['priority'] = parsed.data.priority
    if (parsed.data.dueDate !== undefined) updates['dueDate'] = parsed.data.dueDate
    if (parsed.data.note !== undefined) updates['note'] = parsed.data.note

    if (parsed.data.productId !== undefined) {
      // Validate product + sync routeId
      const [prod] = await db
        .select({ id: products.id, routeId: products.routeId, departmentId: products.departmentId })
        .from(products)
        .where(eq(products.id, parsed.data.productId))
        .limit(1)
      if (!prod) return next(new AppError(ErrorCode.NOT_FOUND, '產品不存在', 404))

      const [wo] = await db.select({ departmentId: workOrders.departmentId }).from(workOrders).where(eq(workOrders.id, woId)).limit(1)
      if (prod.departmentId !== wo!.departmentId) {
        return next(new AppError(ErrorCode.VALIDATION_ERROR, '產品不屬於此部門'))
      }
      updates['productId'] = parsed.data.productId
      updates['routeId'] = prod.routeId ?? null
    }

    const [updated] = await db.update(workOrders).set(updates).where(eq(workOrders.id, woId)).returning()
    sendSuccess(res, updated)
  } catch (err) {
    next(err)
  }
})

// ── Work order state machine ──────────────────────────────────────────────────
const STATUS_TRANSITIONS: Record<string, string[]> = {
  pending: ['in_progress', 'manual_tracking', 'cancelled'],
  in_progress: ['completed', 'manual_tracking', 'ready_to_ship', 'cancelled'],
  manual_tracking: ['in_progress', 'ready_to_ship', 'completed', 'cancelled'],
  ready_to_ship: ['completed', 'cancelled'],
  // completed, cancelled, split → 不允許轉換
}

// PATCH /api/admin/work-orders/:id/status
router.patch('/:id/status', async (req, res, next) => {
  try {
    const woId = await resolveWoId(req.params['id'] as string)
    if (!woId) return next(new AppError(ErrorCode.NOT_FOUND, '工單不存在', 404))

    const { status } = req.body as { status?: string }

    const allStatuses = ['pending', 'in_progress', 'manual_tracking', 'ready_to_ship', 'completed', 'cancelled']
    if (!status || !allStatuses.includes(status)) {
      return next(new AppError(ErrorCode.VALIDATION_ERROR, `status 必須是 ${allStatuses.join(' / ')}`))
    }

    // Fetch current work order
    const [wo] = await db
      .select({ id: workOrders.id, status: workOrders.status })
      .from(workOrders)
      .where(eq(workOrders.id, woId))
      .limit(1)

    if (!wo) return next(new AppError(ErrorCode.NOT_FOUND, '工單不存在', 404))

    // Validate state transition
    const allowedNext = STATUS_TRANSITIONS[wo.status]
    if (!allowedNext || !allowedNext.includes(status)) {
      return next(new AppError(
        ErrorCode.VALIDATION_ERROR,
        `工單狀態 ${wo.status} 不允許轉換為 ${status}`,
      ))
    }

    const [updated] = await db
      .update(workOrders)
      .set({ status, updatedAt: new Date() })
      .where(eq(workOrders.id, woId))
      .returning()

    sendSuccess(res, updated)
  } catch (err) {
    next(err)
  }
})

// GET /api/admin/work-orders/:id/qrcode  — returns base64 PNG
router.get('/:id/qrcode', async (req, res, next) => {
  try {
    const woId = await resolveWoId(req.params['id'] as string)
    if (!woId) return next(new AppError(ErrorCode.NOT_FOUND, '工單不存在', 404))

    const [wo] = await db
      .select({ orderNumber: workOrders.orderNumber, status: workOrders.status })
      .from(workOrders)
      .where(eq(workOrders.id, woId))
      .limit(1)

    if (!wo) return next(new AppError(ErrorCode.NOT_FOUND, '工單不存在', 404))

    // QR content = scan URL with order number
    const appUrl = (process.env['APP_URL'] ?? '').replace(/\/+$/, '')
    const qrContent = appUrl ? `${appUrl}/scan?wo=${encodeURIComponent(wo.orderNumber)}` : wo.orderNumber
    const dataUrl = await QRCode.toDataURL(qrContent, {
      width: 300,
      margin: 2,
      errorCorrectionLevel: 'M',
    })

    sendSuccess(res, { orderNumber: wo.orderNumber, qrDataUrl: dataUrl, status: wo.status })
  } catch (err) {
    next(err)
  }
})

// GET /api/admin/work-orders/print?ids=id1,id2,...  — batch print data
router.get('/print', async (req, res, next) => {
  try {
    const idsParam = req.query['ids'] as string | undefined
    if (!idsParam) return next(new AppError(ErrorCode.VALIDATION_ERROR, 'ids query param is required'))

    const ids = idsParam.split(',').filter(Boolean)
    if (ids.length === 0 || ids.length > 50) {
      return next(new AppError(ErrorCode.VALIDATION_ERROR, 'ids 必須介於 1~50 筆'))
    }

    const results = await Promise.all(
      ids.map(async (id) => {
        const [wo] = await db
          .select({
            id: workOrders.id,
            orderNumber: workOrders.orderNumber,
            status: workOrders.status,
            plannedQty: workOrders.plannedQty,
            orderQty: workOrders.orderQty,
            productName: products.name,
            modelNumber: products.modelNumber,
            dueDate: workOrders.dueDate,
            priority: workOrders.priority,
          })
          .from(workOrders)
          .innerJoin(products, eq(workOrders.productId, products.id))
          .where(eq(workOrders.id, id))
          .limit(1)

        if (!wo) return null

        const appUrl = (process.env['APP_URL'] ?? '').replace(/\/+$/, '')
        const qrContent = appUrl ? `${appUrl}/scan?wo=${encodeURIComponent(wo.orderNumber)}` : wo.orderNumber
        const qrDataUrl = await QRCode.toDataURL(qrContent, {
          width: 200,
          margin: 1,
          errorCorrectionLevel: 'M',
        })

        return { ...wo, qrDataUrl }
      }),
    )

    sendSuccess(res, results.filter(Boolean))
  } catch (err) {
    next(err)
  }
})

// POST /api/admin/work-orders/:id/manual-log  — manually add a station log entry
const ManualLogSchema = z.object({
  stationId: z.string().uuid(),
  actualQtyIn: z.number().int().optional(),
  actualQtyOut: z.number().int().optional(),
  defectQty: z.number().int().min(0).optional(),
})

/** Get or create a system device for manual tracking */
async function getSystemDeviceId(departmentId: string): Promise<string> {
  const [existing] = await db
    .select({ id: devices.id })
    .from(devices)
    .where(and(eq(devices.name, '__SYSTEM__'), eq(devices.departmentId, departmentId)))
    .limit(1)
  if (existing) return existing.id

  const [created] = await db
    .insert(devices)
    .values({ departmentId, name: '__SYSTEM__', deviceType: 'scanner' })
    .returning({ id: devices.id })
  return created!.id
}

router.post('/:id/manual-log', async (req, res, next) => {
  try {
    const woId = await resolveWoId(req.params['id'] as string)
    if (!woId) return next(new AppError(ErrorCode.NOT_FOUND, '工單不存在', 404))

    const [wo] = await db
      .select({ id: workOrders.id, departmentId: workOrders.departmentId, routeId: workOrders.routeId, plannedQty: workOrders.plannedQty, status: workOrders.status })
      .from(workOrders)
      .where(eq(workOrders.id, woId))
      .limit(1)

    if (!wo) return next(new AppError(ErrorCode.NOT_FOUND, '工單不存在', 404))
    if (wo.status !== 'manual_tracking') {
      return next(new AppError(ErrorCode.VALIDATION_ERROR, '此工單必須為「人工追蹤」狀態才能手動新增紀錄'))
    }
    if (!wo.routeId) {
      return next(new AppError(ErrorCode.VALIDATION_ERROR, '此工單尚未設定製程路由'))
    }

    const parsed = ManualLogSchema.safeParse(req.body)
    if (!parsed.success) {
      return next(new AppError(ErrorCode.VALIDATION_ERROR, parsed.error.issues[0]?.message ?? 'Invalid body'))
    }

    const { stationId, actualQtyIn, actualQtyOut, defectQty } = parsed.data

    // Get all route steps in order
    const allSteps = await db
      .select({ id: processSteps.id, stationId: processSteps.stationId, stepOrder: processSteps.stepOrder })
      .from(processSteps)
      .where(eq(processSteps.routeId, wo.routeId))
      .orderBy(asc(processSteps.stepOrder))

    // Find the target step
    const targetStep = allSteps.find(s => s.stationId === stationId)
    if (!targetStep) return next(new AppError(ErrorCode.VALIDATION_ERROR, '此站點不在工單的製程路由中'))

    // Get existing completed logs for this work order
    const existingLogs = await db
      .select({ stationId: stationLogs.stationId })
      .from(stationLogs)
      .where(and(
        eq(stationLogs.workOrderId, woId),
        eq(stationLogs.status, 'completed'),
      ))
    const completedStationIds = new Set(existingLogs.map(l => l.stationId))

    // Find all steps up to and including target that are not yet completed
    const stepsToFill = allSteps
      .filter(s => s.stepOrder <= targetStep.stepOrder && !completedStationIds.has(s.stationId))

    if (stepsToFill.length === 0) {
      return next(new AppError(ErrorCode.VALIDATION_ERROR, '此站點已完成'))
    }

    const systemDeviceId = await getSystemDeviceId(wo.departmentId)
    const now = new Date()
    const qtyIn = actualQtyIn ?? wo.plannedQty
    const defect = defectQty ?? 0

    const createdLogs = []
    for (const step of stepsToFill) {
      const isTarget = step.id === targetStep.id
      const [log] = await db
        .insert(stationLogs)
        .values({
          workOrderId: woId,
          stationId: step.stationId,
          deviceId: systemDeviceId,
          stepId: step.id,
          checkInTime: now,
          checkOutTime: now,
          actualQtyIn: qtyIn,
          actualQtyOut: isTarget ? (actualQtyOut ?? (qtyIn - defect)) : qtyIn,
          defectQty: isTarget ? defect : 0,
          status: 'completed',
        })
        .returning()
      createdLogs.push(log!)
    }

    // Check if all steps are now completed → auto set ready_to_ship
    const doneCheckLogs = await db
      .select({ stationId: stationLogs.stationId })
      .from(stationLogs)
      .where(and(eq(stationLogs.workOrderId, woId), eq(stationLogs.status, 'completed')))
    const doneStationIds = new Set(doneCheckLogs.map(l => l.stationId))
    const allDone = allSteps.every(s => doneStationIds.has(s.stationId))
    if (allDone) {
      await db.update(workOrders).set({ status: 'ready_to_ship', updatedAt: new Date() }).where(eq(workOrders.id, woId))
    }

    sendSuccess(res, { logs: createdLogs, autoFilledCount: stepsToFill.length - 1 }, 201)
  } catch (err) {
    next(err)
  }
})

// ── Split ─────────────────────────────────────────────────────────────────────

const SplitSchema = z.object({
  splitReason: z.enum(['rush', 'batch_shipment']),
  splitNote: z.string().max(500).optional(),
  children: z.array(
    z.object({
      plannedQty: z.number().int().min(1),
      priority: z.enum(['normal', 'urgent']).optional(),
      dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    }),
  ).min(2, '至少需要 2 張子單'),
})

// POST /api/admin/work-orders/:id/split
router.post('/:id/split', async (req, res, next) => {
  try {
    const woId = await resolveWoId(req.params['id'] as string)
    if (!woId) return next(new AppError(ErrorCode.NOT_FOUND, '工單不存在', 404))

    const parsed = SplitSchema.safeParse(req.body)
    if (!parsed.success) {
      return next(new AppError(ErrorCode.VALIDATION_ERROR, parsed.error.issues[0]?.message ?? 'Invalid body'))
    }

    const result = await SplitService.split({
      parentId: woId,
      children: parsed.data.children,
      splitReason: parsed.data.splitReason,
      splitNote: parsed.data.splitNote,
    })

    sendSuccess(res, result, 201)
  } catch (err) {
    next(err)
  }
})

// GET /api/admin/work-orders/:id/split-history
router.get('/:id/split-history', async (req, res, next) => {
  try {
    const woId = await resolveWoId(req.params['id'] as string)
    if (!woId) return next(new AppError(ErrorCode.NOT_FOUND, '工單不存在', 404))

    const history = await SplitService.getSplitHistory(woId)
    sendSuccess(res, { items: history })
  } catch (err) {
    next(err)
  }
})

export default router
