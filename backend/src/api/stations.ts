import { Router } from 'express'
import { and, eq } from 'drizzle-orm'
import { db } from '../models/db'
import { stations } from '../models/schema'
import { sendSuccess } from '../utils/response'
import { AppError, ErrorCode } from '../utils/errors'

const router = Router()

// GET /api/stations?department_id=
router.get('/', async (req, res, next) => {
  try {
    const { department_id } = req.query

    if (typeof department_id !== 'string' || !department_id) {
      return next(
        new AppError(ErrorCode.VALIDATION_ERROR, 'department_id query param is required'),
      )
    }

    const rows = await db
      .select()
      .from(stations)
      .where(and(eq(stations.departmentId, department_id), eq(stations.isActive, true)))
      .orderBy(stations.sortOrder, stations.name)

    sendSuccess(res, rows)
  } catch (err) {
    next(err)
  }
})

export default router
