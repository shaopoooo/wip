import { Router } from 'express'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../../models/db'
import { groups, departments } from '../../models/schema'
import { adminAuth } from '../../middleware/adminAuth'
import { sendSuccess } from '../../utils/response'
import { AppError, ErrorCode } from '../../utils/errors'

const router = Router()
router.use(adminAuth)

const GroupSchema = z.object({
  departmentId: z.string().uuid(),
  name: z.string().min(1).max(100),
  code: z.string().max(20).optional().nullable(),
  description: z.string().max(500).optional().nullable(),
  sortOrder: z.number().int().default(0),
})

const UpdateGroupSchema = GroupSchema.partial().omit({ departmentId: true })

// POST /api/admin/groups
router.post('/', async (req, res, next) => {
  try {
    const parsed = GroupSchema.safeParse(req.body)
    if (!parsed.success) {
      return next(new AppError(ErrorCode.VALIDATION_ERROR, parsed.error.issues[0]?.message ?? 'Invalid body'))
    }

    const [dept] = await db.select({ id: departments.id }).from(departments).where(eq(departments.id, parsed.data.departmentId)).limit(1)
    if (!dept) return next(new AppError(ErrorCode.NOT_FOUND, '部門不存在', 404))

    const [group] = await db
      .insert(groups)
      .values({
        departmentId: parsed.data.departmentId,
        name: parsed.data.name,
        code: parsed.data.code ?? null,
        description: parsed.data.description ?? null,
        sortOrder: parsed.data.sortOrder,
      })
      .returning()

    sendSuccess(res, group, 201)
  } catch (err) {
    next(err)
  }
})

// PATCH /api/admin/groups/:id
router.patch('/:id', async (req, res, next) => {
  try {
    const { id } = req.params as { id: string }

    const parsed = UpdateGroupSchema.safeParse(req.body)
    if (!parsed.success) {
      return next(new AppError(ErrorCode.VALIDATION_ERROR, parsed.error.issues[0]?.message ?? 'Invalid body'))
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() }
    if (parsed.data.name !== undefined) updates['name'] = parsed.data.name
    if (parsed.data.code !== undefined) updates['code'] = parsed.data.code
    if (parsed.data.description !== undefined) updates['description'] = parsed.data.description
    if (parsed.data.sortOrder !== undefined) updates['sortOrder'] = parsed.data.sortOrder

    const [updated] = await db.update(groups).set(updates).where(eq(groups.id, id)).returning()
    if (!updated) return next(new AppError(ErrorCode.NOT_FOUND, '組別不存在', 404))

    sendSuccess(res, updated)
  } catch (err) {
    next(err)
  }
})

// DELETE /api/admin/groups/:id (soft delete)
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params as { id: string }
    const [updated] = await db
      .update(groups)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(groups.id, id))
      .returning()

    if (!updated) return next(new AppError(ErrorCode.NOT_FOUND, '組別不存在', 404))
    sendSuccess(res, null)
  } catch (err) {
    next(err)
  }
})

export default router
