import { Router } from 'express'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../../models/db'
import { products, departments } from '../../models/schema'
import { adminAuth } from '../../middleware/adminAuth'
import { sendSuccess } from '../../utils/response'
import { AppError, ErrorCode } from '../../utils/errors'

const router = Router()
router.use(adminAuth)

const ProductSchema = z.object({
  departmentId: z.string().uuid(),
  name: z.string().min(1).max(200),
  modelNumber: z.string().min(1).max(50),
  description: z.string().max(500).optional().nullable(),
})

const UpdateProductSchema = ProductSchema.partial().omit({ departmentId: true })

// POST /api/admin/products
router.post('/', async (req, res, next) => {
  try {
    const parsed = ProductSchema.safeParse(req.body)
    if (!parsed.success) {
      return next(new AppError(ErrorCode.VALIDATION_ERROR, parsed.error.issues[0]?.message ?? 'Invalid body'))
    }

    const [dept] = await db.select({ id: departments.id }).from(departments).where(eq(departments.id, parsed.data.departmentId)).limit(1)
    if (!dept) return next(new AppError(ErrorCode.NOT_FOUND, '部門不存在', 404))

    const [product] = await db
      .insert(products)
      .values({
        departmentId: parsed.data.departmentId,
        name: parsed.data.name,
        modelNumber: parsed.data.modelNumber,
        description: parsed.data.description ?? null,
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

    const updates: Record<string, unknown> = { updatedAt: new Date() }
    if (parsed.data.name !== undefined) updates['name'] = parsed.data.name
    if (parsed.data.modelNumber !== undefined) updates['modelNumber'] = parsed.data.modelNumber
    if (parsed.data.description !== undefined) updates['description'] = parsed.data.description

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

export default router
