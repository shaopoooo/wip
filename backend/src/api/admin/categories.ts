import { Router } from 'express'
import { SQL, and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../../models/db'
import { productCategories } from '../../models/schema'
import { adminAuth } from '../../middleware/adminAuth'
import { sendSuccess } from '../../utils/response'
import { AppError, ErrorCode } from '../../utils/errors'
import { parsePage, buildOrder, searchCond, pagedResult, countCol } from '../../utils/queryHelpers'

const router = Router()
router.use(adminAuth)

const CreateSchema = z.object({
  name: z.string().min(1).max(100),
  code: z.string().max(20).optional().nullable(),
  description: z.string().max(500).optional().nullable(),
  sortOrder: z.number().int().default(0),
})

const UpdateSchema = CreateSchema.partial()

// GET /api/admin/product-categories
router.get('/', async (req, res, next) => {
  try {
    const { page, limit, offset, sortDir, sortBy, search } = parsePage(req.query as Record<string, unknown>)

    const isActiveParam = req.query['is_active'] as string | undefined

    const conditions: SQL[] = []

    if (isActiveParam !== 'all') {
      conditions.push(eq(productCategories.isActive, isActiveParam !== 'false'))
    }

    if (search) {
      conditions.push(searchCond(productCategories.name, search))
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined

    const sortCol =
      sortBy === 'name' ? productCategories.name :
      productCategories.sortOrder

    const order = buildOrder(sortCol, sortDir === 'desc' ? 'desc' : 'asc')

    const countResult = await db.select({ total: countCol }).from(productCategories).where(where)

    const items = await db
      .select()
      .from(productCategories)
      .where(where)
      .orderBy(order)
      .limit(limit)
      .offset(offset)

    sendSuccess(res, pagedResult(items, countResult[0]?.total ?? 0, page, limit))
  } catch (err) {
    next(err)
  }
})

// POST /api/admin/product-categories
router.post('/', async (req, res, next) => {
  try {
    const body = CreateSchema.parse(req.body)
    const [row] = await db
      .insert(productCategories)
      .values({ ...body, updatedAt: new Date() })
      .returning()
    sendSuccess(res, row, 201)
  } catch (err) {
    next(err)
  }
})

// PATCH /api/admin/product-categories/:id
router.patch('/:id', async (req, res, next) => {
  try {
    const { id } = req.params as { id: string }
    const body = UpdateSchema.parse(req.body)
    const [row] = await db
      .update(productCategories)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(productCategories.id, id))
      .returning()
    if (!row) return next(new AppError(ErrorCode.NOT_FOUND, '產品種類不存在', 404))
    sendSuccess(res, row)
  } catch (err) {
    next(err)
  }
})

// DELETE /api/admin/product-categories/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params as { id: string }
    await db
      .update(productCategories)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(productCategories.id, id))
    sendSuccess(res, null)
  } catch (err) {
    next(err)
  }
})

export default router
