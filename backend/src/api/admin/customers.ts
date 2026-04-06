import { Router } from 'express'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../../models/db'
import { customers } from '../../models/schema'
import { adminAuth } from '../../middleware/adminAuth'
import { sendSuccess } from '../../utils/response'
import { AppError, ErrorCode } from '../../utils/errors'

const router = Router()
router.use(adminAuth)

const CustomerSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().max(200).optional().nullable(),
  costFileCount: z.number().int().default(0),
  needsNameMapping: z.boolean().default(true),
})

const UpdateCustomerSchema = CustomerSchema.partial()

// GET /api/admin/customers
router.get('/', async (_req, res, next) => {
  try {
    const rows = await db.select().from(customers).where(eq(customers.isActive, true))
    sendSuccess(res, rows)
  } catch (err) {
    next(err)
  }
})

// POST /api/admin/customers
router.post('/', async (req, res, next) => {
  try {
    const parsed = CustomerSchema.safeParse(req.body)
    if (!parsed.success) {
      return next(new AppError(ErrorCode.VALIDATION_ERROR, parsed.error.issues[0]?.message ?? 'Invalid body'))
    }

    const [row] = await db
      .insert(customers)
      .values({
        code: parsed.data.code,
        name: parsed.data.name ?? null,
        costFileCount: parsed.data.costFileCount,
        needsNameMapping: parsed.data.needsNameMapping,
      })
      .returning()

    sendSuccess(res, row, 201)
  } catch (err) {
    next(err)
  }
})

// PATCH /api/admin/customers/:id
router.patch('/:id', async (req, res, next) => {
  try {
    const { id } = req.params as { id: string }

    const parsed = UpdateCustomerSchema.safeParse(req.body)
    if (!parsed.success) {
      return next(new AppError(ErrorCode.VALIDATION_ERROR, parsed.error.issues[0]?.message ?? 'Invalid body'))
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() }
    if (parsed.data.code !== undefined) updates['code'] = parsed.data.code
    if (parsed.data.name !== undefined) updates['name'] = parsed.data.name
    if (parsed.data.costFileCount !== undefined) updates['costFileCount'] = parsed.data.costFileCount
    if (parsed.data.needsNameMapping !== undefined) updates['needsNameMapping'] = parsed.data.needsNameMapping

    const [updated] = await db.update(customers).set(updates).where(eq(customers.id, id)).returning()
    if (!updated) return next(new AppError(ErrorCode.NOT_FOUND, '客戶不存在', 404))

    sendSuccess(res, updated)
  } catch (err) {
    next(err)
  }
})

// DELETE /api/admin/customers/:id (soft delete)
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params as { id: string }
    const [updated] = await db
      .update(customers)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(customers.id, id))
      .returning()

    if (!updated) return next(new AppError(ErrorCode.NOT_FOUND, '客戶不存在', 404))
    sendSuccess(res, null)
  } catch (err) {
    next(err)
  }
})

export default router
