import { Router } from 'express'
import { and, asc, desc, eq, like, SQL } from 'drizzle-orm'
import { z } from 'zod'
import QRCode from 'qrcode'
import { db } from '../../models/db'
import { workOrders, products, processRoutes, departments, stationLogs, stations } from '../../models/schema'
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

// GET /api/admin/work-orders?department_id=&status=&page=&limit=
router.get('/', async (req, res, next) => {
  try {
    const departmentId = req.query['department_id'] as string | undefined
    const status = req.query['status'] as string | undefined
    const page = Math.max(1, Number(req.query['page'] ?? 1))
    const limit = Math.min(100, Math.max(1, Number(req.query['limit'] ?? 20)))
    const offset = (page - 1) * limit

    if (!departmentId) {
      return next(new AppError(ErrorCode.VALIDATION_ERROR, 'department_id is required'))
    }

    const conditions: SQL[] = [eq(workOrders.departmentId, departmentId)]
    if (status) conditions.push(eq(workOrders.status, status))

    const rows = await db
      .select({
        workOrder: workOrders,
        product: { name: products.name, modelNumber: products.modelNumber },
      })
      .from(workOrders)
      .innerJoin(products, eq(workOrders.productId, products.id))
      .where(and(...conditions))
      .orderBy(desc(workOrders.createdAt))
      .limit(limit)
      .offset(offset)

    sendSuccess(res, { items: rows, page, limit })
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
  pending: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  // completed, cancelled, split → 不允許轉換
}

// PATCH /api/admin/work-orders/:id/status
router.patch('/:id/status', async (req, res, next) => {
  try {
    const woId = await resolveWoId(req.params['id'] as string)
    if (!woId) return next(new AppError(ErrorCode.NOT_FOUND, '工單不存在', 404))

    const { status } = req.body as { status?: string }

    const allStatuses = ['pending', 'in_progress', 'completed', 'cancelled']
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
