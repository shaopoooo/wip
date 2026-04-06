import { Router } from 'express'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../../models/db'
import { vendors } from '../../models/schema'
import { adminAuth } from '../../middleware/adminAuth'
import { sendSuccess } from '../../utils/response'
import { AppError, ErrorCode } from '../../utils/errors'

const router = Router()
router.use(adminAuth)

const VendorSchema = z.object({
  token: z.string().min(1).max(100),
  normalizedName: z.string().min(1).max(200),
  sourceFlags: z.string().max(200).optional().nullable(),
  scheduleVendorCount: z.number().int().default(0),
  shippingVendorCount: z.number().int().default(0),
  statusTokenCount: z.number().int().default(0),
  needsManualReview: z.boolean().default(false),
})

const UpdateVendorSchema = VendorSchema.partial()

// GET /api/admin/vendors
router.get('/', async (_req, res, next) => {
  try {
    const rows = await db.select().from(vendors).where(eq(vendors.isActive, true))
    sendSuccess(res, rows)
  } catch (err) {
    next(err)
  }
})

// POST /api/admin/vendors
router.post('/', async (req, res, next) => {
  try {
    const parsed = VendorSchema.safeParse(req.body)
    if (!parsed.success) {
      return next(new AppError(ErrorCode.VALIDATION_ERROR, parsed.error.issues[0]?.message ?? 'Invalid body'))
    }

    const [row] = await db
      .insert(vendors)
      .values({
        token: parsed.data.token,
        normalizedName: parsed.data.normalizedName,
        sourceFlags: parsed.data.sourceFlags ?? null,
        scheduleVendorCount: parsed.data.scheduleVendorCount,
        shippingVendorCount: parsed.data.shippingVendorCount,
        statusTokenCount: parsed.data.statusTokenCount,
        needsManualReview: parsed.data.needsManualReview,
      })
      .returning()

    sendSuccess(res, row, 201)
  } catch (err) {
    next(err)
  }
})

// PATCH /api/admin/vendors/:id
router.patch('/:id', async (req, res, next) => {
  try {
    const { id } = req.params as { id: string }

    const parsed = UpdateVendorSchema.safeParse(req.body)
    if (!parsed.success) {
      return next(new AppError(ErrorCode.VALIDATION_ERROR, parsed.error.issues[0]?.message ?? 'Invalid body'))
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() }
    if (parsed.data.token !== undefined) updates['token'] = parsed.data.token
    if (parsed.data.normalizedName !== undefined) updates['normalizedName'] = parsed.data.normalizedName
    if (parsed.data.sourceFlags !== undefined) updates['sourceFlags'] = parsed.data.sourceFlags
    if (parsed.data.scheduleVendorCount !== undefined) updates['scheduleVendorCount'] = parsed.data.scheduleVendorCount
    if (parsed.data.shippingVendorCount !== undefined) updates['shippingVendorCount'] = parsed.data.shippingVendorCount
    if (parsed.data.statusTokenCount !== undefined) updates['statusTokenCount'] = parsed.data.statusTokenCount
    if (parsed.data.needsManualReview !== undefined) updates['needsManualReview'] = parsed.data.needsManualReview

    const [updated] = await db.update(vendors).set(updates).where(eq(vendors.id, id)).returning()
    if (!updated) return next(new AppError(ErrorCode.NOT_FOUND, '廠商不存在', 404))

    sendSuccess(res, updated)
  } catch (err) {
    next(err)
  }
})

// DELETE /api/admin/vendors/:id (soft delete)
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params as { id: string }
    const [updated] = await db
      .update(vendors)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(vendors.id, id))
      .returning()

    if (!updated) return next(new AppError(ErrorCode.NOT_FOUND, '廠商不存在', 404))
    sendSuccess(res, null)
  } catch (err) {
    next(err)
  }
})

export default router
