import { Router } from 'express'
import { eq } from 'drizzle-orm'
import { db } from '../models/db'
import { departments, groups } from '../models/schema'
import { sendSuccess } from '../utils/response'
import { AppError, ErrorCode } from '../utils/errors'

const router = Router()

// GET /api/departments
router.get('/', async (_req, res, next) => {
  try {
    const rows = await db
      .select()
      .from(departments)
      .orderBy(departments.code)

    sendSuccess(res, rows)
  } catch (err) {
    next(err)
  }
})

// GET /api/departments/:id/groups
router.get('/:id/groups', async (req, res, next) => {
  try {
    const { id } = req.params

    const [dept] = await db
      .select({ id: departments.id })
      .from(departments)
      .where(eq(departments.id, id))
      .limit(1)

    if (!dept) {
      return next(new AppError(ErrorCode.NOT_FOUND, 'Department not found', 404))
    }

    const rows = await db
      .select()
      .from(groups)
      .where(eq(groups.departmentId, id))
      .orderBy(groups.sortOrder, groups.name)

    sendSuccess(res, rows)
  } catch (err) {
    next(err)
  }
})

export default router
