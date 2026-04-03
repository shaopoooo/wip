import { Router } from 'express'
import { and, asc, eq } from 'drizzle-orm'
import { db } from '../models/db'
import { processRoutes, processSteps, stations } from '../models/schema'
import { sendSuccess } from '../utils/response'
import { AppError, ErrorCode } from '../utils/errors'

const router = Router()

// GET /api/process-routes?department_id=
router.get('/', async (req, res, next) => {
  try {
    const departmentId = req.query['department_id'] as string | undefined
    if (!departmentId) {
      return next(new AppError(ErrorCode.VALIDATION_ERROR, 'department_id is required'))
    }

    const rows = await db
      .select()
      .from(processRoutes)
      .where(and(eq(processRoutes.departmentId, departmentId), eq(processRoutes.isActive, true)))
      .orderBy(asc(processRoutes.name))

    sendSuccess(res, rows)
  } catch (err) {
    next(err)
  }
})

// GET /api/process-routes/:id
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params as { id: string }
    const [route] = await db.select().from(processRoutes).where(eq(processRoutes.id, id)).limit(1)
    if (!route) return next(new AppError(ErrorCode.NOT_FOUND, '路由不存在', 404))
    sendSuccess(res, route)
  } catch (err) {
    next(err)
  }
})

// GET /api/process-routes/:id/steps
router.get('/:id/steps', async (req, res, next) => {
  try {
    const { id } = req.params as { id: string }

    const steps = await db
      .select({
        id: processSteps.id,
        routeId: processSteps.routeId,
        stationId: processSteps.stationId,
        stationName: stations.name,
        stationCode: stations.code,
        stepOrder: processSteps.stepOrder,
        standardTime: processSteps.standardTime,
        createdAt: processSteps.createdAt,
      })
      .from(processSteps)
      .innerJoin(stations, eq(processSteps.stationId, stations.id))
      .where(eq(processSteps.routeId, id))
      .orderBy(asc(processSteps.stepOrder))

    sendSuccess(res, steps)
  } catch (err) {
    next(err)
  }
})

export default router
