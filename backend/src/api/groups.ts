import { Router } from 'express'
import { eq } from 'drizzle-orm'
import { db } from '../models/db'
import { groups, stations } from '../models/schema'
import { sendSuccess } from '../utils/response'
import { AppError, ErrorCode } from '../utils/errors'

const router = Router()

// GET /api/groups/:id/stations
router.get('/:id/stations', async (req, res, next) => {
  try {
    const { id } = req.params

    const [group] = await db
      .select({ id: groups.id })
      .from(groups)
      .where(eq(groups.id, id))
      .limit(1)

    if (!group) {
      return next(new AppError(ErrorCode.NOT_FOUND, 'Group not found', 404))
    }

    const rows = await db
      .select()
      .from(stations)
      .where(eq(stations.groupId, id))
      .orderBy(stations.sortOrder, stations.name)

    sendSuccess(res, rows)
  } catch (err) {
    next(err)
  }
})

export default router
