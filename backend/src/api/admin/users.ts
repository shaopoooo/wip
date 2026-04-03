import { Router } from 'express'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { db } from '../../models/db'
import { adminUsers, roles } from '../../models/schema'
import { adminAuth } from '../../middleware/adminAuth'
import { sendSuccess } from '../../utils/response'
import { AppError, ErrorCode } from '../../utils/errors'

const router = Router()
router.use(adminAuth)

const CreateUserSchema = z.object({
  username: z.string().min(1).max(50),
  password: z.string().min(6).max(100),
  roleId: z.string().uuid().optional().nullable(),
})

const UpdateUserSchema = z.object({
  roleId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(6).max(100).optional(),
})

// GET /api/admin/users
router.get('/', async (_req, res, next) => {
  try {
    const rows = await db
      .select({
        id: adminUsers.id,
        username: adminUsers.username,
        isActive: adminUsers.isActive,
        roleId: adminUsers.roleId,
        roleName: roles.name,
        createdAt: adminUsers.createdAt,
      })
      .from(adminUsers)
      .leftJoin(roles, eq(adminUsers.roleId, roles.id))
      .orderBy(adminUsers.createdAt)

    sendSuccess(res, rows)
  } catch (err) {
    next(err)
  }
})

// POST /api/admin/users
router.post('/', async (req, res, next) => {
  try {
    const parsed = CreateUserSchema.safeParse(req.body)
    if (!parsed.success) {
      return next(new AppError(ErrorCode.VALIDATION_ERROR, parsed.error.issues[0]?.message ?? 'Invalid body'))
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 12)

    const [user] = await db
      .insert(adminUsers)
      .values({
        username: parsed.data.username,
        passwordHash,
        roleId: parsed.data.roleId ?? null,
      })
      .returning({ id: adminUsers.id, username: adminUsers.username, isActive: adminUsers.isActive, roleId: adminUsers.roleId, createdAt: adminUsers.createdAt })

    sendSuccess(res, user, 201)
  } catch (err) {
    next(err)
  }
})

// PATCH /api/admin/users/:id
router.patch('/:id', async (req, res, next) => {
  try {
    const { id } = req.params as { id: string }

    const parsed = UpdateUserSchema.safeParse(req.body)
    if (!parsed.success) {
      return next(new AppError(ErrorCode.VALIDATION_ERROR, parsed.error.issues[0]?.message ?? 'Invalid body'))
    }

    const updates: Partial<{ roleId: string | null; isActive: boolean; passwordHash: string }> = {}

    if (parsed.data.roleId !== undefined) updates.roleId = parsed.data.roleId
    if (parsed.data.isActive !== undefined) updates.isActive = parsed.data.isActive
    if (parsed.data.password) updates.passwordHash = await bcrypt.hash(parsed.data.password, 12)

    if (Object.keys(updates).length === 0) {
      return next(new AppError(ErrorCode.VALIDATION_ERROR, '沒有可更新的欄位'))
    }

    const [updated] = await db
      .update(adminUsers)
      .set(updates)
      .where(eq(adminUsers.id, id))
      .returning({ id: adminUsers.id, username: adminUsers.username, isActive: adminUsers.isActive, roleId: adminUsers.roleId })

    if (!updated) return next(new AppError(ErrorCode.NOT_FOUND, '帳號不存在', 404))

    sendSuccess(res, updated)
  } catch (err) {
    next(err)
  }
})

// DELETE /api/admin/users/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params as { id: string }
    // Prevent self-delete
    if (req.adminUser?.userId === id) {
      return next(new AppError(ErrorCode.VALIDATION_ERROR, '不可刪除自己的帳號'))
    }

    const deleted = await db.delete(adminUsers).where(eq(adminUsers.id, id)).returning()
    if (deleted.length === 0) return next(new AppError(ErrorCode.NOT_FOUND, '帳號不存在', 404))

    sendSuccess(res, null)
  } catch (err) {
    next(err)
  }
})

export default router
