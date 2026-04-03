import { Router } from 'express'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../../models/db'
import { equipment, stations } from '../../models/schema'
import { adminAuth } from '../../middleware/adminAuth'
import { sendSuccess } from '../../utils/response'
import { AppError, ErrorCode } from '../../utils/errors'

const router = Router()
router.use(adminAuth)

const EquipmentSchema = z.object({
  stationId: z.string().uuid(),
  name: z.string().min(1).max(100),
  model: z.string().max(100).optional().nullable(),
  serialNumber: z.string().max(100).optional().nullable(),
})

const UpdateEquipmentSchema = EquipmentSchema.partial().omit({ stationId: true })

// GET /api/admin/equipment?station_id=
router.get('/', async (req, res, next) => {
  try {
    const stationId = req.query['station_id'] as string | undefined
    if (!stationId) {
      return next(new AppError(ErrorCode.VALIDATION_ERROR, 'station_id is required'))
    }

    const rows = await db
      .select()
      .from(equipment)
      .where(eq(equipment.stationId, stationId))
      .orderBy(equipment.name)

    sendSuccess(res, rows)
  } catch (err) {
    next(err)
  }
})

// POST /api/admin/equipment
router.post('/', async (req, res, next) => {
  try {
    const parsed = EquipmentSchema.safeParse(req.body)
    if (!parsed.success) {
      return next(new AppError(ErrorCode.VALIDATION_ERROR, parsed.error.issues[0]?.message ?? 'Invalid body'))
    }

    const [station] = await db.select({ id: stations.id }).from(stations).where(eq(stations.id, parsed.data.stationId)).limit(1)
    if (!station) return next(new AppError(ErrorCode.NOT_FOUND, '站點不存在', 404))

    const [eq_] = await db
      .insert(equipment)
      .values({
        stationId: parsed.data.stationId,
        name: parsed.data.name,
        model: parsed.data.model ?? null,
        serialNumber: parsed.data.serialNumber ?? null,
      })
      .returning()

    sendSuccess(res, eq_, 201)
  } catch (err) {
    next(err)
  }
})

// PATCH /api/admin/equipment/:id
router.patch('/:id', async (req, res, next) => {
  try {
    const { id } = req.params as { id: string }

    const parsed = UpdateEquipmentSchema.safeParse(req.body)
    if (!parsed.success) {
      return next(new AppError(ErrorCode.VALIDATION_ERROR, parsed.error.issues[0]?.message ?? 'Invalid body'))
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() }
    if (parsed.data.name !== undefined) updates['name'] = parsed.data.name
    if (parsed.data.model !== undefined) updates['model'] = parsed.data.model
    if (parsed.data.serialNumber !== undefined) updates['serialNumber'] = parsed.data.serialNumber

    const [updated] = await db.update(equipment).set(updates).where(eq(equipment.id, id)).returning()
    if (!updated) return next(new AppError(ErrorCode.NOT_FOUND, '設備不存在', 404))

    sendSuccess(res, updated)
  } catch (err) {
    next(err)
  }
})

// DELETE /api/admin/equipment/:id (soft delete)
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params as { id: string }
    const [updated] = await db
      .update(equipment)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(equipment.id, id))
      .returning()

    if (!updated) return next(new AppError(ErrorCode.NOT_FOUND, '設備不存在', 404))
    sendSuccess(res, null)
  } catch (err) {
    next(err)
  }
})

export default router
