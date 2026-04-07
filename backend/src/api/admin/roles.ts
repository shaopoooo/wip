import { Router } from 'express'
import { SQL, and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../../models/db'
import { roles, adminUsers } from '../../models/schema'
import { adminAuth } from '../../middleware/adminAuth'
import { sendSuccess } from '../../utils/response'
import { AppError, ErrorCode } from '../../utils/errors'
import { parsePage, buildOrder, searchCond, pagedResult, countCol } from '../../utils/queryHelpers'

const router = Router()
router.use(adminAuth)

const RoleSchema = z.object({
  name: z.string().min(1).max(50),
  description: z.string().max(500).optional(),
})

// GET /api/admin/roles
router.get('/', async (req, res, next) => {
  try {
    const { page, limit, offset, sortDir, sortBy, search } = parsePage(req.query as Record<string, unknown>)

    const conditions: SQL[] = []

    if (search) {
      conditions.push(searchCond(roles.name, search))
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined

    const sortCol =
      sortBy === 'name' ? roles.name :
      roles.createdAt

    const order = buildOrder(sortCol, sortDir === 'desc' ? 'desc' : 'asc')

    const countResult = await db.select({ total: countCol }).from(roles).where(where)

    const items = await db
      .select()
      .from(roles)
      .where(where)
      .orderBy(order)
      .limit(limit)
      .offset(offset)

    sendSuccess(res, pagedResult(items, countResult[0]?.total ?? 0, page, limit))
  } catch (err) {
    next(err)
  }
})

// POST /api/admin/roles
router.post('/', async (req, res, next) => {
  try {
    const parsed = RoleSchema.safeParse(req.body)
    if (!parsed.success) {
      return next(new AppError(ErrorCode.VALIDATION_ERROR, parsed.error.issues[0]?.message ?? 'Invalid body'))
    }

    const [role] = await db
      .insert(roles)
      .values({ name: parsed.data.name, description: parsed.data.description ?? null })
      .returning()

    sendSuccess(res, role, 201)
  } catch (err) {
    next(err)
  }
})

// DELETE /api/admin/roles/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params as { id: string }

    // Check no users assigned
    const [user] = await db
      .select({ id: adminUsers.id })
      .from(adminUsers)
      .where(eq(adminUsers.roleId, id))
      .limit(1)

    if (user) {
      return next(new AppError(ErrorCode.VALIDATION_ERROR, '此角色仍有帳號使用中，無法刪除'))
    }

    const deleted = await db.delete(roles).where(eq(roles.id, id)).returning()
    if (deleted.length === 0) {
      return next(new AppError(ErrorCode.NOT_FOUND, '角色不存在', 404))
    }

    sendSuccess(res, null)
  } catch (err) {
    next(err)
  }
})

export default router
