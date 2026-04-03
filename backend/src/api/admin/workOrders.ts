import { Router } from 'express'
import { and, asc, desc, eq, like, SQL } from 'drizzle-orm'
import { z } from 'zod'
import QRCode from 'qrcode'
import { db } from '../../models/db'
import { workOrders, products, processRoutes, departments, stationLogs, stations } from '../../models/schema'
import { adminAuth } from '../../middleware/adminAuth'
import { sendSuccess } from '../../utils/response'
import { AppError, ErrorCode } from '../../utils/errors'

const router = Router()
router.use(adminAuth)

const CreateWorkOrderSchema = z.object({
  departmentId: z.string().uuid(),
  productId: z.string().uuid(),
  routeId: z.string().uuid(),
  plannedQty: z.number().int().min(1),
  priority: z.enum(['normal', 'urgent']).default('normal'),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
})

// ── Auto-generate order number ────────────────────────────────────────────────

async function generateOrderNumber(deptCode: string): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `WO-${deptCode}-${year}-`

  const [last] = await db
    .select({ orderNumber: workOrders.orderNumber })
    .from(workOrders)
    .where(like(workOrders.orderNumber, `${prefix}%`))
    .orderBy(desc(workOrders.orderNumber))
    .limit(1)

  const seq = last ? (parseInt(last.orderNumber.slice(-3), 10) || 0) + 1 : 1
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

// GET /api/admin/work-orders/:id
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params as { id: string }

    const rows = await db
      .select({
        workOrder: workOrders,
        product: { name: products.name, modelNumber: products.modelNumber },
        route: { name: processRoutes.name },
      })
      .from(workOrders)
      .innerJoin(products, eq(workOrders.productId, products.id))
      .innerJoin(processRoutes, eq(workOrders.routeId, processRoutes.id))
      .where(eq(workOrders.id, id))
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
      .where(eq(stationLogs.workOrderId, id))
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

    // Validate product belongs to department
    const [product] = await db
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.id, parsed.data.productId), eq(products.departmentId, parsed.data.departmentId)))
      .limit(1)
    if (!product) return next(new AppError(ErrorCode.NOT_FOUND, '產品不屬於此部門', 404))

    // Validate route belongs to department
    const [route] = await db
      .select({ id: processRoutes.id })
      .from(processRoutes)
      .where(and(eq(processRoutes.id, parsed.data.routeId), eq(processRoutes.departmentId, parsed.data.departmentId)))
      .limit(1)
    if (!route) return next(new AppError(ErrorCode.NOT_FOUND, '路由不屬於此部門', 404))

    const orderNumber = await generateOrderNumber(dept.code)

    const [wo] = await db
      .insert(workOrders)
      .values({
        departmentId: parsed.data.departmentId,
        orderNumber,
        productId: parsed.data.productId,
        routeId: parsed.data.routeId,
        plannedQty: parsed.data.plannedQty,
        status: 'pending',
        priority: parsed.data.priority,
        dueDate: parsed.data.dueDate ?? null,
      })
      .returning()

    sendSuccess(res, wo, 201)
  } catch (err) {
    next(err)
  }
})

// PATCH /api/admin/work-orders/:id/status
router.patch('/:id/status', async (req, res, next) => {
  try {
    const { id } = req.params as { id: string }
    const { status } = req.body as { status?: string }

    const allowed = ['pending', 'in_progress', 'completed', 'cancelled']
    if (!status || !allowed.includes(status)) {
      return next(new AppError(ErrorCode.VALIDATION_ERROR, `status 必須是 ${allowed.join(' / ')}`))
    }

    const [updated] = await db
      .update(workOrders)
      .set({ status, updatedAt: new Date() })
      .where(eq(workOrders.id, id))
      .returning()

    if (!updated) return next(new AppError(ErrorCode.NOT_FOUND, '工單不存在', 404))

    sendSuccess(res, updated)
  } catch (err) {
    next(err)
  }
})

// GET /api/admin/work-orders/:id/qrcode  — returns base64 PNG
router.get('/:id/qrcode', async (req, res, next) => {
  try {
    const { id } = req.params as { id: string }

    const [wo] = await db
      .select({ orderNumber: workOrders.orderNumber, status: workOrders.status })
      .from(workOrders)
      .where(eq(workOrders.id, id))
      .limit(1)

    if (!wo) return next(new AppError(ErrorCode.NOT_FOUND, '工單不存在', 404))

    // QR content = the order number (scanned by PWA)
    const dataUrl = await QRCode.toDataURL(wo.orderNumber, {
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

        const qrDataUrl = await QRCode.toDataURL(wo.orderNumber, {
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

export default router
