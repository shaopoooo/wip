import { Router } from 'express'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../models/db'
import { devices, stations, departments, deviceTokens } from '../models/schema'
import { sendSuccess } from '../utils/response'
import { AppError, ErrorCode } from '../utils/errors'

const router = Router()

// GET /api/devices/:id  — returns device + optional station + department
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params

    const rows = await db
      .select({
        device: devices,
        station: stations,
        department: departments,
      })
      .from(devices)
      .innerJoin(departments, eq(devices.departmentId, departments.id))
      .leftJoin(stations, eq(devices.stationId, stations.id))
      .where(eq(devices.id, id))
      .limit(1)

    if (rows.length === 0) {
      return next(new AppError(ErrorCode.NOT_FOUND, 'Device not found', 404))
    }

    sendSuccess(res, rows[0])
  } catch (err) {
    next(err)
  }
})

// POST /api/devices/register  — BYOD first-time registration
const RegisterSchema = z.object({
  registrationToken: z.string().min(1).max(20),
  departmentId: z.string().uuid(),
  stationId: z.string().uuid().optional(),
  deviceType: z.enum(['tablet', 'phone', 'scanner']),
  name: z.string().max(100).optional(),
  userAgent: z.string().optional(),
  screenInfo: z.record(z.string(), z.unknown()).optional(),
  timezone: z.string().max(50).optional(),
  webglRenderer: z.string().max(200).optional(),
  employeeId: z.string().max(50).optional(),
})

router.post('/register', async (req, res, next) => {
  try {
    const parsed = RegisterSchema.safeParse(req.body)
    if (!parsed.success) {
      return next(
        new AppError(ErrorCode.VALIDATION_ERROR, parsed.error.issues[0]?.message ?? 'Invalid body'),
      )
    }

    const { registrationToken, departmentId, stationId, deviceType, name, userAgent, screenInfo, timezone, webglRenderer, employeeId } =
      parsed.data

    // Verify registration token
    const [tokenRow] = await db
      .select()
      .from(deviceTokens)
      .where(eq(deviceTokens.token, registrationToken.toUpperCase()))
      .limit(1)

    if (!tokenRow) {
      return next(new AppError(ErrorCode.VALIDATION_ERROR, '序號無效', 400))
    }
    if (tokenRow.isUsed) {
      return next(new AppError(ErrorCode.VALIDATION_ERROR, '序號已使用', 400))
    }

    // Verify department exists
    const [department] = await db
      .select({ id: departments.id })
      .from(departments)
      .where(eq(departments.id, departmentId))
      .limit(1)

    if (!department) {
      return next(new AppError(ErrorCode.NOT_FOUND, 'Department not found', 404))
    }

    if (stationId) {
      const [station] = await db
        .select({ id: stations.id, departmentId: stations.departmentId })
        .from(stations)
        .where(eq(stations.id, stationId))
        .limit(1)
      if (!station) return next(new AppError(ErrorCode.NOT_FOUND, 'Station not found', 404))
      if (station.departmentId !== departmentId) {
        return next(new AppError(ErrorCode.WRONG_DEPARTMENT, '站點不屬於指定部門', 400))
      }
    }

    const ipAddress = (req.headers['x-forwarded-for'] as string | undefined)
      ?.split(',')[0]
      ?.trim() ?? req.socket.remoteAddress ?? null

    const [device] = await db
      .insert(devices)
      .values({
        departmentId,
        stationId: stationId ?? null,
        deviceType,
        name: name ?? null,
        userAgent: userAgent ?? null,
        screenInfo: screenInfo ?? null,
        timezone: timezone ?? null,
        webglRenderer: webglRenderer ?? null,
        employeeId: employeeId ?? null,
        ipAddress: ipAddress as unknown as string,
        lastSeenAt: new Date(),
      })
      .returning()

    // Mark token as consumed
    await db
      .update(deviceTokens)
      .set({ isUsed: true, deviceId: device!.id, usedAt: new Date() })
      .where(eq(deviceTokens.id, tokenRow.id))

    sendSuccess(res, device, 201)
  } catch (err) {
    next(err)
  }
})

// PATCH /api/devices/:id  — update device binding (department, name, employeeId)
const UpdateSchema = z.object({
  departmentId: z.string().uuid().optional(),
  name: z.string().max(100).nullable().optional(),
  employeeId: z.string().max(50).nullable().optional(),
})

router.patch('/:id', async (req, res, next) => {
  try {
    const { id } = req.params
    const parsed = UpdateSchema.safeParse(req.body)
    if (!parsed.success) {
      return next(new AppError(ErrorCode.VALIDATION_ERROR, parsed.error.issues[0]?.message ?? 'Invalid body'))
    }

    const updates: Record<string, unknown> = {}
    if (parsed.data.departmentId !== undefined) {
      const [dept] = await db.select({ id: departments.id }).from(departments).where(eq(departments.id, parsed.data.departmentId)).limit(1)
      if (!dept) return next(new AppError(ErrorCode.NOT_FOUND, 'Department not found', 404))
      updates.departmentId = parsed.data.departmentId
    }
    if (parsed.data.name !== undefined) updates.name = parsed.data.name
    if (parsed.data.employeeId !== undefined) updates.employeeId = parsed.data.employeeId

    if (Object.keys(updates).length === 0) {
      return next(new AppError(ErrorCode.VALIDATION_ERROR, '沒有要更新的欄位'))
    }

    const [device] = await db
      .update(devices)
      .set(updates)
      .where(eq(devices.id, id))
      .returning()

    if (!device) {
      return next(new AppError(ErrorCode.NOT_FOUND, 'Device not found', 404))
    }

    sendSuccess(res, device)
  } catch (err) {
    next(err)
  }
})

// PATCH /api/devices/:id/heartbeat  — update last_seen_at
router.patch('/:id/heartbeat', async (req, res, next) => {
  try {
    const { id } = req.params

    const [device] = await db
      .update(devices)
      .set({ lastSeenAt: new Date() })
      .where(eq(devices.id, id))
      .returning({ id: devices.id, lastSeenAt: devices.lastSeenAt })

    if (!device) {
      return next(new AppError(ErrorCode.NOT_FOUND, 'Device not found', 404))
    }

    sendSuccess(res, device)
  } catch (err) {
    next(err)
  }
})

export default router
