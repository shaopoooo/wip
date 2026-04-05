import { Router } from 'express'
import { and, asc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../../models/db'
import { processRoutes, processSteps, stations, departments } from '../../models/schema'
import { adminAuth } from '../../middleware/adminAuth'
import { sendSuccess } from '../../utils/response'
import { AppError, ErrorCode } from '../../utils/errors'

const router = Router()
router.use(adminAuth)

const RouteSchema = z.object({
  departmentId: z.string().uuid(),
  name: z.string().min(1).max(200),
  description: z.string().max(500).optional().nullable(),
  version: z.number().int().min(1).default(1),
})

const UpdateRouteSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(500).nullable().optional(),
  isActive: z.boolean().optional(),
})

const StepSchema = z.object({
  stationId: z.string().uuid(),
  stepOrder: z.number().int().min(1),
  standardTime: z.number().int().min(0).optional().nullable(),
})

// POST /api/admin/process-routes
router.post('/', async (req, res, next) => {
  try {
    const parsed = RouteSchema.safeParse(req.body)
    if (!parsed.success) {
      return next(new AppError(ErrorCode.VALIDATION_ERROR, parsed.error.issues[0]?.message ?? 'Invalid body'))
    }

    const [dept] = await db.select({ id: departments.id }).from(departments).where(eq(departments.id, parsed.data.departmentId)).limit(1)
    if (!dept) return next(new AppError(ErrorCode.NOT_FOUND, '部門不存在', 404))

    const [route] = await db
      .insert(processRoutes)
      .values({
        departmentId: parsed.data.departmentId,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        version: parsed.data.version,
      })
      .returning()

    sendSuccess(res, route, 201)
  } catch (err) {
    next(err)
  }
})

// PATCH /api/admin/process-routes/:id
router.patch('/:id', async (req, res, next) => {
  try {
    const { id } = req.params as { id: string }

    const parsed = UpdateRouteSchema.safeParse(req.body)
    if (!parsed.success) {
      return next(new AppError(ErrorCode.VALIDATION_ERROR, parsed.error.issues[0]?.message ?? 'Invalid body'))
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() }
    if (parsed.data.name !== undefined) updates['name'] = parsed.data.name
    if (parsed.data.description !== undefined) updates['description'] = parsed.data.description
    if (parsed.data.isActive !== undefined) updates['isActive'] = parsed.data.isActive

    const [updated] = await db.update(processRoutes).set(updates).where(eq(processRoutes.id, id)).returning()
    if (!updated) return next(new AppError(ErrorCode.NOT_FOUND, '路由不存在', 404))

    sendSuccess(res, updated)
  } catch (err) {
    next(err)
  }
})

// DELETE /api/admin/process-routes/:id (soft delete)
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params as { id: string }
    const [updated] = await db
      .update(processRoutes)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(processRoutes.id, id))
      .returning()

    if (!updated) return next(new AppError(ErrorCode.NOT_FOUND, '路由不存在', 404))
    sendSuccess(res, null)
  } catch (err) {
    next(err)
  }
})

// GET /api/admin/process-routes/:id/steps
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

// POST /api/admin/process-routes/:id/steps
router.post('/:id/steps', async (req, res, next) => {
  try {
    const { id } = req.params as { id: string }

    const [route] = await db
      .select({ id: processRoutes.id, departmentId: processRoutes.departmentId })
      .from(processRoutes)
      .where(eq(processRoutes.id, id))
      .limit(1)
    if (!route) return next(new AppError(ErrorCode.NOT_FOUND, '路由不存在', 404))

    const parsed = StepSchema.safeParse(req.body)
    if (!parsed.success) {
      return next(new AppError(ErrorCode.VALIDATION_ERROR, parsed.error.issues[0]?.message ?? 'Invalid body'))
    }

    const [station] = await db
      .select({ id: stations.id, departmentId: stations.departmentId })
      .from(stations)
      .where(eq(stations.id, parsed.data.stationId))
      .limit(1)
    if (!station) return next(new AppError(ErrorCode.NOT_FOUND, '站點不存在', 404))

    // Department consistency check
    if (station.departmentId !== route.departmentId) {
      return next(new AppError(ErrorCode.WRONG_DEPARTMENT, '站點與路由不屬於同一部門'))
    }

    const [step] = await db
      .insert(processSteps)
      .values({
        routeId: id,
        stationId: parsed.data.stationId,
        stepOrder: parsed.data.stepOrder,
        standardTime: parsed.data.standardTime ?? null,
      })
      .returning()

    sendSuccess(res, step, 201)
  } catch (err) {
    next(err)
  }
})

// PATCH /api/admin/process-routes/:id/steps/:stepId
router.patch('/:id/steps/:stepId', async (req, res, next) => {
  try {
    const { id, stepId } = req.params as { id: string; stepId: string }

    const parsed = StepSchema.partial().safeParse(req.body)
    if (!parsed.success) {
      return next(new AppError(ErrorCode.VALIDATION_ERROR, parsed.error.issues[0]?.message ?? 'Invalid body'))
    }

    // If stationId is being changed, validate department consistency
    if (parsed.data.stationId !== undefined) {
      const [route] = await db
        .select({ departmentId: processRoutes.departmentId })
        .from(processRoutes)
        .where(eq(processRoutes.id, id))
        .limit(1)
      if (!route) return next(new AppError(ErrorCode.NOT_FOUND, '路由不存在', 404))

      const [station] = await db
        .select({ departmentId: stations.departmentId })
        .from(stations)
        .where(eq(stations.id, parsed.data.stationId))
        .limit(1)
      if (!station) return next(new AppError(ErrorCode.NOT_FOUND, '站點不存在', 404))

      if (station.departmentId !== route.departmentId) {
        return next(new AppError(ErrorCode.WRONG_DEPARTMENT, '站點與路由不屬於同一部門'))
      }
    }

    const updates: Record<string, unknown> = {}
    if (parsed.data.stationId !== undefined) updates['stationId'] = parsed.data.stationId
    if (parsed.data.stepOrder !== undefined) updates['stepOrder'] = parsed.data.stepOrder
    if (parsed.data.standardTime !== undefined) updates['standardTime'] = parsed.data.standardTime

    const [updated] = await db
      .update(processSteps)
      .set(updates)
      .where(and(eq(processSteps.id, stepId), eq(processSteps.routeId, id)))
      .returning()

    if (!updated) return next(new AppError(ErrorCode.NOT_FOUND, '步驟不存在', 404))

    sendSuccess(res, updated)
  } catch (err) {
    next(err)
  }
})

// DELETE /api/admin/process-routes/:id/steps/:stepId
router.delete('/:id/steps/:stepId', async (req, res, next) => {
  try {
    const { id, stepId } = req.params as { id: string; stepId: string }

    const deleted = await db
      .delete(processSteps)
      .where(and(eq(processSteps.id, stepId), eq(processSteps.routeId, id)))
      .returning()

    if (deleted.length === 0) return next(new AppError(ErrorCode.NOT_FOUND, '步驟不存在', 404))

    sendSuccess(res, null)
  } catch (err) {
    next(err)
  }
})

export default router
