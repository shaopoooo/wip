import { Router } from 'express'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../../models/db'
import { departments } from '../../models/schema'
import { adminAuth } from '../../middleware/adminAuth'
import { sendSuccess } from '../../utils/response'
import { AppError, ErrorCode } from '../../utils/errors'

const router = Router()
router.use(adminAuth)

const DepartmentSchema = z.object({
  name: z.string().min(1).max(100),
  code: z.string().min(1).max(10),
})

const UpdateDepartmentSchema = DepartmentSchema.partial()

// POST /api/admin/departments
router.post('/', async (req, res, next) => {
  try {
    const parsed = DepartmentSchema.safeParse(req.body)
    if (!parsed.success) {
      return next(new AppError(ErrorCode.VALIDATION_ERROR, parsed.error.issues[0]?.message ?? 'Invalid body'))
    }

    const [dept] = await db
      .insert(departments)
      .values({ name: parsed.data.name, code: parsed.data.code })
      .returning()

    sendSuccess(res, dept, 201)
  } catch (err) {
    next(err)
  }
})

// PATCH /api/admin/departments/:id
router.patch('/:id', async (req, res, next) => {
  try {
    const { id } = req.params as { id: string }

    const parsed = UpdateDepartmentSchema.safeParse(req.body)
    if (!parsed.success) {
      return next(new AppError(ErrorCode.VALIDATION_ERROR, parsed.error.issues[0]?.message ?? 'Invalid body'))
    }

    const updates: Record<string, unknown> = {}
    if (parsed.data.name !== undefined) updates['name'] = parsed.data.name
    if (parsed.data.code !== undefined) updates['code'] = parsed.data.code

    const [updated] = await db.update(departments).set(updates).where(eq(departments.id, id)).returning()
    if (!updated) return next(new AppError(ErrorCode.NOT_FOUND, '產線不存在', 404))

    sendSuccess(res, updated)
  } catch (err) {
    next(err)
  }
})

// DELETE /api/admin/departments/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params as { id: string }

    await db.delete(departments).where(eq(departments.id, id))
    sendSuccess(res, null)
  } catch (err) {
    next(err)
  }
})

export default router
