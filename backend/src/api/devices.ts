import { Router } from 'express'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../models/db'
import { devices, stations, groups, departments } from '../models/schema'
import { sendSuccess } from '../utils/response'
import { AppError, ErrorCode } from '../utils/errors'

const router = Router()

// GET /api/devices/:id  — returns device + station + department
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
      .innerJoin(stations, eq(devices.stationId, stations.id))
      .innerJoin(departments, eq(stations.departmentId, departments.id))
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
  stationId: z.string().uuid(),
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

    const { stationId, deviceType, name, userAgent, screenInfo, timezone, webglRenderer, employeeId } =
      parsed.data

    // Verify station exists
    const [station] = await db
      .select({ id: stations.id })
      .from(stations)
      .where(eq(stations.id, stationId))
      .limit(1)

    if (!station) {
      return next(new AppError(ErrorCode.NOT_FOUND, 'Station not found', 404))
    }

    const ipAddress = (req.headers['x-forwarded-for'] as string | undefined)
      ?.split(',')[0]
      ?.trim() ?? req.socket.remoteAddress ?? null

    const [device] = await db
      .insert(devices)
      .values({
        stationId,
        deviceType,
        name: name ?? null,
        userAgent: userAgent ?? null,
        screenInfo: screenInfo ?? null,
        timezone: timezone ?? null,
        webglRenderer: webglRenderer ?? null,
        employeeId: employeeId ?? null,
        ipAddress: ipAddress as unknown as string, // inet column accepts string
        lastSeenAt: new Date(),
      })
      .returning()

    sendSuccess(res, device, 201)
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
