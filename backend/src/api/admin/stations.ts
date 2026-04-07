import { Router } from 'express'
import { SQL, and, eq, or } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../../models/db'
import { stations, departments, groups } from '../../models/schema'
import { adminAuth } from '../../middleware/adminAuth'
import { sendSuccess } from '../../utils/response'
import { AppError, ErrorCode } from '../../utils/errors'
import { parsePage, buildOrder, searchCond, pagedResult, countCol } from '../../utils/queryHelpers'

const router = Router()
router.use(adminAuth)

const StationSchema = z.object({
  departmentId: z.string().uuid(),
  groupId: z.string().uuid().optional().nullable(),
  name: z.string().min(1).max(100),
  code: z.string().max(20).optional().nullable(),
  description: z.string().max(500).optional().nullable(),
  sortOrder: z.number().int().default(0),
})

const UpdateStationSchema = StationSchema.partial().omit({ departmentId: true })

// GET /api/admin/stations?department_id=
router.get('/', async (req, res, next) => {
  try {
    const departmentId = req.query['department_id'] as string | undefined
    if (!departmentId) {
      return next(new AppError(ErrorCode.VALIDATION_ERROR, 'department_id is required'))
    }

    const { page, limit, offset, sortDir, sortBy, search } = parsePage(req.query as Record<string, unknown>)

    const groupIdParam = req.query['group_id'] as string | undefined
    const isActiveParam = req.query['is_active'] as string | undefined

    const conditions: SQL[] = [eq(stations.departmentId, departmentId)]

    if (isActiveParam !== 'all') {
      conditions.push(eq(stations.isActive, isActiveParam !== 'false'))
    }

    if (groupIdParam) {
      conditions.push(eq(stations.groupId, groupIdParam))
    }

    if (search) {
      conditions.push(or(searchCond(stations.name, search), searchCond(stations.code, search)) as SQL)
    }

    const where = and(...conditions)

    const sortCol =
      sortBy === 'sort_order' ? stations.sortOrder :
      sortBy === 'created_at' ? stations.createdAt :
      stations.name

    const order = buildOrder(sortCol, sortDir === 'desc' ? 'desc' : 'asc')

    const countResult = await db.select({ total: countCol }).from(stations).where(where)

    const items = await db
      .select({
        id: stations.id,
        departmentId: stations.departmentId,
        groupId: stations.groupId,
        groupName: groups.name,
        name: stations.name,
        code: stations.code,
        description: stations.description,
        sortOrder: stations.sortOrder,
        isActive: stations.isActive,
        createdAt: stations.createdAt,
        updatedAt: stations.updatedAt,
      })
      .from(stations)
      .leftJoin(groups, eq(stations.groupId, groups.id))
      .where(where)
      .orderBy(order)
      .limit(limit)
      .offset(offset)

    sendSuccess(res, pagedResult(items, countResult[0]?.total ?? 0, page, limit))
  } catch (err) {
    next(err)
  }
})

// POST /api/admin/stations
router.post('/', async (req, res, next) => {
  try {
    const parsed = StationSchema.safeParse(req.body)
    if (!parsed.success) {
      return next(new AppError(ErrorCode.VALIDATION_ERROR, parsed.error.issues[0]?.message ?? 'Invalid body'))
    }

    const [dept] = await db.select({ id: departments.id }).from(departments).where(eq(departments.id, parsed.data.departmentId)).limit(1)
    if (!dept) return next(new AppError(ErrorCode.NOT_FOUND, '部門不存在', 404))

    if (parsed.data.groupId) {
      const [grp] = await db.select({ id: groups.id }).from(groups).where(eq(groups.id, parsed.data.groupId)).limit(1)
      if (!grp) return next(new AppError(ErrorCode.NOT_FOUND, '組別不存在', 404))
    }

    const [station] = await db
      .insert(stations)
      .values({
        departmentId: parsed.data.departmentId,
        groupId: parsed.data.groupId ?? null,
        name: parsed.data.name,
        code: parsed.data.code ?? null,
        description: parsed.data.description ?? null,
        sortOrder: parsed.data.sortOrder,
      })
      .returning()

    sendSuccess(res, station, 201)
  } catch (err) {
    next(err)
  }
})

// PATCH /api/admin/stations/:id
router.patch('/:id', async (req, res, next) => {
  try {
    const { id } = req.params as { id: string }

    const parsed = UpdateStationSchema.safeParse(req.body)
    if (!parsed.success) {
      return next(new AppError(ErrorCode.VALIDATION_ERROR, parsed.error.issues[0]?.message ?? 'Invalid body'))
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() }
    if (parsed.data.groupId !== undefined) updates['groupId'] = parsed.data.groupId
    if (parsed.data.name !== undefined) updates['name'] = parsed.data.name
    if (parsed.data.code !== undefined) updates['code'] = parsed.data.code
    if (parsed.data.description !== undefined) updates['description'] = parsed.data.description
    if (parsed.data.sortOrder !== undefined) updates['sortOrder'] = parsed.data.sortOrder

    const [updated] = await db.update(stations).set(updates).where(eq(stations.id, id)).returning()
    if (!updated) return next(new AppError(ErrorCode.NOT_FOUND, '站點不存在', 404))

    sendSuccess(res, updated)
  } catch (err) {
    next(err)
  }
})

// DELETE /api/admin/stations/:id (soft delete)
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params as { id: string }
    const [updated] = await db
      .update(stations)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(stations.id, id))
      .returning()

    if (!updated) return next(new AppError(ErrorCode.NOT_FOUND, '站點不存在', 404))
    sendSuccess(res, null)
  } catch (err) {
    next(err)
  }
})

export default router
