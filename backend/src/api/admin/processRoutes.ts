import { Router } from 'express'
import { SQL, and, asc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../../models/db'
import { processRoutes, processSteps, stations, departments } from '../../models/schema'
import { adminAuth } from '../../middleware/adminAuth'
import { sendSuccess } from '../../utils/response'
import { AppError, ErrorCode } from '../../utils/errors'
import { parsePage, buildOrder, searchCond, pagedResult, countCol } from '../../utils/queryHelpers'

const router = Router()
router.use(adminAuth)

const TEMPLATE_TYPES = ['single_sided', 'double_sided', 'multi_layer', 'rigid_flex'] as const

const RouteSchema = z.object({
  departmentId: z.string().uuid(),
  name: z.string().min(1).max(200),
  description: z.string().max(500).optional().nullable(),
  version: z.number().int().min(1).default(1),
  isTemplate: z.boolean().optional().default(false),
  templateType: z.enum(TEMPLATE_TYPES).optional().nullable(),
})

const UpdateRouteSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(500).nullable().optional(),
  isActive: z.boolean().optional(),
  templateType: z.enum(TEMPLATE_TYPES).nullable().optional(),
})

const StepSchema = z.object({
  stationId: z.string().uuid(),
  stepOrder: z.number().int().min(1),
  standardTime: z.number().int().min(0).optional().nullable(),
})

// GET /api/admin/process-routes?department_id=
router.get('/', async (req, res, next) => {
  try {
    const departmentId = req.query['department_id'] as string | undefined
    if (!departmentId) {
      return next(new AppError(ErrorCode.VALIDATION_ERROR, 'department_id is required'))
    }

    const { page, limit, offset, sortDir, sortBy, search } = parsePage(req.query as Record<string, unknown>)

    const isTemplateParam = req.query['is_template'] as string | undefined
    const isActiveParam = req.query['is_active'] as string | undefined

    const conditions: SQL[] = [eq(processRoutes.departmentId, departmentId)]

    if (isActiveParam !== 'all') {
      conditions.push(eq(processRoutes.isActive, isActiveParam !== 'false'))
    }

    if (isTemplateParam === 'true') {
      conditions.push(eq(processRoutes.isTemplate, true))
    } else if (isTemplateParam === 'false') {
      conditions.push(eq(processRoutes.isTemplate, false))
    }

    if (search) {
      conditions.push(searchCond(processRoutes.name, search))
    }

    const where = and(...conditions)

    const sortCol =
      sortBy === 'created_at' ? processRoutes.createdAt :
      processRoutes.name

    const order = buildOrder(sortCol, sortDir === 'desc' ? 'desc' : 'asc')

    const countResult = await db.select({ total: countCol }).from(processRoutes).where(where)

    const items = await db
      .select()
      .from(processRoutes)
      .where(where)
      .orderBy(order)
      .limit(limit)
      .offset(offset)

    sendSuccess(res, pagedResult(items, countResult[0]?.total ?? 0, page, limit))
  } catch (err) {
    next(err)
  }
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
        isTemplate: parsed.data.isTemplate ?? false,
        templateType: parsed.data.templateType ?? null,
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
    if (parsed.data.templateType !== undefined) updates['templateType'] = parsed.data.templateType

    const [updated] = await db.update(processRoutes).set(updates).where(eq(processRoutes.id, id)).returning()
    if (!updated) return next(new AppError(ErrorCode.NOT_FOUND, '路由不存在', 404))

    sendSuccess(res, updated)
  } catch (err) {
    next(err)
  }
})

// DELETE /api/admin/process-routes/:id (soft delete — templates cannot be deleted)
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params as { id: string }

    const [existing] = await db.select({ isTemplate: processRoutes.isTemplate }).from(processRoutes).where(eq(processRoutes.id, id)).limit(1)
    if (!existing) return next(new AppError(ErrorCode.NOT_FOUND, '路由不存在', 404))
    if (existing.isTemplate) return next(new AppError(ErrorCode.VALIDATION_ERROR, '模板路由不可停用，請直接編輯步驟'))

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

// POST /api/admin/process-routes/:id/clone — clone a template into a new regular route
router.post('/:id/clone', async (req, res, next) => {
  try {
    const { id } = req.params as { id: string }
    const { name, description } = req.body as { name?: string; description?: string }

    if (!name || !name.trim()) {
      return next(new AppError(ErrorCode.VALIDATION_ERROR, '請提供新路由名稱'))
    }

    const [source] = await db.select().from(processRoutes).where(eq(processRoutes.id, id)).limit(1)
    if (!source) return next(new AppError(ErrorCode.NOT_FOUND, '路由不存在', 404))
    if (!source.isTemplate) return next(new AppError(ErrorCode.VALIDATION_ERROR, '只能從模板複製'))

    // Create new non-template route
    const [newRoute] = await db
      .insert(processRoutes)
      .values({
        departmentId: source.departmentId,
        name: name.trim(),
        description: description?.trim() ?? null,
        version: 1,
        isTemplate: false,
        templateType: null,
      })
      .returning()

    if (!newRoute) return next(new AppError(ErrorCode.INTERNAL_ERROR, '建立路由失敗'))

    // Copy all steps
    const sourceSteps = await db
      .select()
      .from(processSteps)
      .where(eq(processSteps.routeId, id))
      .orderBy(asc(processSteps.stepOrder))

    if (sourceSteps.length > 0) {
      await db.insert(processSteps).values(
        sourceSteps.map((s) => ({
          routeId: newRoute.id,
          stationId: s.stationId,
          stepOrder: s.stepOrder,
          standardTime: s.standardTime,
        })),
      )
    }

    sendSuccess(res, newRoute, 201)
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
