import { Router } from 'express'
import { SQL, and, asc, eq, ilike, inArray, isNull, isNotNull, or } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../../models/db'
import { products, departments, productCategories, processRoutes, workOrders, stationLogs, stations } from '../../models/schema'
import { adminAuth } from '../../middleware/adminAuth'
import { sendSuccess } from '../../utils/response'
import { AppError, ErrorCode } from '../../utils/errors'
import { parsePage, buildOrder, searchCond, pagedResult, countCol } from '../../utils/queryHelpers'

const router = Router()
router.use(adminAuth)

const ProductSchema = z.object({
  departmentId: z.string().uuid(),
  name: z.string().min(1).max(200),
  modelNumber: z.string().min(1).max(50),
  description: z.string().max(500).optional().nullable(),
  categoryId: z.string().uuid().optional().nullable(),
  routeId: z.string().uuid().optional().nullable(),
})

const UpdateProductSchema = ProductSchema.partial().omit({ departmentId: true }).extend({
  isActive: z.boolean().optional(),
})

async function assertRouteExists(routeId: string | null | undefined, next: Parameters<Parameters<typeof router.post>[1]>[2]): Promise<boolean> {
  if (!routeId) return true
  const [route] = await db.select({ id: processRoutes.id }).from(processRoutes).where(eq(processRoutes.id, routeId)).limit(1)
  if (!route) { next(new AppError(ErrorCode.NOT_FOUND, '路由不存在', 404)); return false }
  return true
}

// GET /api/admin/products?department_id=
router.get('/', async (req, res, next) => {
  try {
    const departmentId = req.query['department_id'] as string | undefined
    if (!departmentId) {
      return next(new AppError(ErrorCode.VALIDATION_ERROR, 'department_id is required'))
    }

    const { page, limit, offset, sortDir, sortBy, search } = parsePage(req.query as Record<string, unknown>)

    const categoryIdParam = req.query['category_id'] as string | undefined
    const routeFilter = (req.query['route_filter'] as string | undefined) ?? 'all'
    const isActiveParam = req.query['is_active'] as string | undefined

    const conditions: SQL[] = [eq(products.departmentId, departmentId)]

    if (isActiveParam === 'true') {
      conditions.push(eq(products.isActive, true))
    } else if (isActiveParam === 'false') {
      conditions.push(eq(products.isActive, false))
    }
    // no isActiveParam → show all

    if (categoryIdParam) {
      conditions.push(eq(products.categoryId, categoryIdParam))
    }

    if (routeFilter === 'set') {
      conditions.push(isNotNull(products.routeId))
    } else if (routeFilter === 'unset') {
      conditions.push(isNull(products.routeId))
    } else if (routeFilter === 'imported') {
      conditions.push(and(isNotNull(products.routeId), ilike(processRoutes.name, '%匯入製程%')) as SQL)
    }

    if (search) {
      conditions.push(or(
        searchCond(products.name, search),
        searchCond(products.modelNumber, search),
        searchCond(products.description, search),
        searchCond(processRoutes.name, search)
      ) as SQL)
    }

    const where = and(...conditions)

    const sortCol =
      sortBy === 'model_number' ? products.modelNumber :
      sortBy === 'created_at' ? products.createdAt :
      products.name

    const order = buildOrder(sortCol, sortDir === 'desc' ? 'desc' : 'asc')

    const countResult = await db
      .select({ total: countCol })
      .from(products)
      .leftJoin(productCategories, eq(products.categoryId, productCategories.id))
      .leftJoin(processRoutes, eq(products.routeId, processRoutes.id))
      .where(where)

    const items = await db
      .select({
        id: products.id,
        departmentId: products.departmentId,
        name: products.name,
        modelNumber: products.modelNumber,
        description: products.description,
        isActive: products.isActive,
        categoryId: products.categoryId,
        categoryName: productCategories.name,
        routeId: products.routeId,
        routeName: processRoutes.name,
        bomVersion: products.bomVersion,
        unitCost: products.unitCost,
        createdAt: products.createdAt,
        updatedAt: products.updatedAt,
      })
      .from(products)
      .leftJoin(productCategories, eq(products.categoryId, productCategories.id))
      .leftJoin(processRoutes, eq(products.routeId, processRoutes.id))
      .where(where)
      .orderBy(order)
      .limit(limit)
      .offset(offset)

    sendSuccess(res, pagedResult(items, countResult[0]?.total ?? 0, page, limit))
  } catch (err) {
    next(err)
  }
})

// POST /api/admin/products
router.post('/', async (req, res, next) => {
  try {
    const parsed = ProductSchema.safeParse(req.body)
    if (!parsed.success) {
      return next(new AppError(ErrorCode.VALIDATION_ERROR, parsed.error.issues[0]?.message ?? 'Invalid body'))
    }

    const [dept] = await db.select({ id: departments.id }).from(departments).where(eq(departments.id, parsed.data.departmentId)).limit(1)
    if (!dept) return next(new AppError(ErrorCode.NOT_FOUND, '部門不存在', 404))

    if (!await assertRouteExists(parsed.data.routeId, next)) return

    const [product] = await db
      .insert(products)
      .values({
        departmentId: parsed.data.departmentId,
        name: parsed.data.name,
        modelNumber: parsed.data.modelNumber,
        description: parsed.data.description ?? null,
        categoryId: parsed.data.categoryId ?? null,
        routeId: parsed.data.routeId ?? null,
      })
      .returning()

    sendSuccess(res, product, 201)
  } catch (err) {
    next(err)
  }
})

// PATCH /api/admin/products/:id
router.patch('/:id', async (req, res, next) => {
  try {
    const { id } = req.params as { id: string }

    const parsed = UpdateProductSchema.safeParse(req.body)
    if (!parsed.success) {
      return next(new AppError(ErrorCode.VALIDATION_ERROR, parsed.error.issues[0]?.message ?? 'Invalid body'))
    }

    if (!await assertRouteExists(parsed.data.routeId, next)) return

    const updates: Record<string, unknown> = { updatedAt: new Date() }
    if (parsed.data.name !== undefined) updates['name'] = parsed.data.name
    if (parsed.data.modelNumber !== undefined) updates['modelNumber'] = parsed.data.modelNumber
    if (parsed.data.description !== undefined) updates['description'] = parsed.data.description
    if (parsed.data.categoryId !== undefined) updates['categoryId'] = parsed.data.categoryId
    if (parsed.data.routeId !== undefined) updates['routeId'] = parsed.data.routeId
    if (parsed.data.isActive !== undefined) updates['isActive'] = parsed.data.isActive

    const [updated] = await db.update(products).set(updates).where(eq(products.id, id)).returning()
    if (!updated) return next(new AppError(ErrorCode.NOT_FOUND, '產品不存在', 404))

    sendSuccess(res, updated)
  } catch (err) {
    next(err)
  }
})

// DELETE /api/admin/products/:id (soft delete)
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params as { id: string }
    const [updated] = await db
      .update(products)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(products.id, id))
      .returning()

    if (!updated) return next(new AppError(ErrorCode.NOT_FOUND, '產品不存在', 404))
    sendSuccess(res, null)
  } catch (err) {
    next(err)
  }
})

// GET /api/admin/products/:id/affected-orders — work orders with logs that would be affected by route change
const ACTIVE_STATUSES = ['in_progress', 'manual_tracking', 'ready_to_ship']

router.get('/:id/affected-orders', async (req, res, next) => {
  try {
    const { id } = req.params as { id: string }

    const rows = await db
      .select({ id: workOrders.id, orderNumber: workOrders.orderNumber, status: workOrders.status })
      .from(workOrders)
      .where(and(
        eq(workOrders.productId, id),
        inArray(workOrders.status, ACTIVE_STATUSES),
      ))
      .orderBy(workOrders.orderNumber)

    // Filter to only those with at least one station log
    const withLogs = []
    for (const wo of rows) {
      const [logRow] = await db
        .select({ id: stationLogs.id })
        .from(stationLogs)
        .where(eq(stationLogs.workOrderId, wo.id))
        .limit(1)
      if (logRow) withLogs.push(wo)
    }

    sendSuccess(res, { items: withLogs, total: withLogs.length })
  } catch (err) {
    next(err)
  }
})

// POST /api/admin/products/:id/reset-affected-orders — archive logs to note and clear them
router.post('/:id/reset-affected-orders', async (req, res, next) => {
  try {
    const { id } = req.params as { id: string }

    const rows = await db
      .select({ id: workOrders.id, orderNumber: workOrders.orderNumber, status: workOrders.status, note: workOrders.note })
      .from(workOrders)
      .where(and(
        eq(workOrders.productId, id),
        inArray(workOrders.status, ACTIVE_STATUSES),
      ))

    let resetCount = 0
    for (const wo of rows) {
      // Get existing logs
      const logs = await db
        .select({
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

      if (logs.length === 0) continue

      // Format logs as text for note
      const now = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })
      const fmt = (iso: Date | null) => iso ? new Date(iso).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : '—'
      const logLines = logs.map((l, i) =>
        `  ${i + 1}. ${l.stationName}${l.stationCode ? `(${l.stationCode})` : ''} | ${l.status} | 入站 ${fmt(l.checkInTime)} | 出站 ${fmt(l.checkOutTime)} | 入${l.actualQtyIn ?? '—'} 出${l.actualQtyOut ?? '—'}`
      ).join('\n')
      const archiveNote = `\n\n── 製程變更前歷程備份（${now}）──\n${logLines}`
      const newNote = (wo.note || '') + archiveNote

      // Update note + clear logs
      await db.update(workOrders).set({ note: newNote, updatedAt: new Date() }).where(eq(workOrders.id, wo.id))
      await db.delete(stationLogs).where(eq(stationLogs.workOrderId, wo.id))
      resetCount++
    }

    sendSuccess(res, { resetCount })
  } catch (err) {
    next(err)
  }
})

export default router

// Re-export: public GET (used by frontend dropdowns)
export { products, productCategories, processRoutes }
