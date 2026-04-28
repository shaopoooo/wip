import { Router } from 'express'
import { SQL, and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { randomBytes } from 'crypto'
import { db } from '../../models/db'
import { deviceTokens, devices } from '../../models/schema'
import { adminAuth } from '../../middleware/adminAuth'
import { sendSuccess } from '../../utils/response'
import { AppError, ErrorCode } from '../../utils/errors'
import { parsePage, buildOrder, pagedResult, countCol } from '../../utils/queryHelpers'

const router = Router()
router.use(adminAuth)

/** Generate a random 8-char alphanumeric uppercase token, e.g. "A3BK9ZX2" */
function generateToken(): string {
  const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no I/O/0/1 to avoid confusion
  const bytes = randomBytes(8)
  return Array.from(bytes).map(b => CHARS[b % CHARS.length]).join('')
}

// GET /api/admin/device-tokens — list all tokens
router.get('/', async (req, res, next) => {
  try {
    const q = req.query as Record<string, unknown>
    const { page, limit, offset } = parsePage(q)
    const sortDir = (q['sort_dir'] === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc'
    const isUsedParam = q['is_used'] as string | undefined

    const conditions: SQL[] = []

    if (isUsedParam === 'true') {
      conditions.push(eq(deviceTokens.isUsed, true))
    } else if (isUsedParam === 'false') {
      conditions.push(eq(deviceTokens.isUsed, false))
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined

    const order = buildOrder(deviceTokens.createdAt, sortDir)

    const countResult = await db.select({ total: countCol }).from(deviceTokens).where(where)

    const items = await db
      .select({
        id: deviceTokens.id,
        token: deviceTokens.token,
        isUsed: deviceTokens.isUsed,
        deviceId: deviceTokens.deviceId,
        deviceName: devices.name,
        userAgent: devices.userAgent,
        createdAt: deviceTokens.createdAt,
        usedAt: deviceTokens.usedAt,
      })
      .from(deviceTokens)
      .leftJoin(devices, eq(deviceTokens.deviceId, devices.id))
      .where(where)
      .orderBy(order)
      .limit(limit)
      .offset(offset)

    sendSuccess(res, pagedResult(items, countResult[0]?.total ?? 0, page, limit))
  } catch (err) {
    next(err)
  }
})

// POST /api/admin/device-tokens/batch — generate N tokens
const BatchSchema = z.object({
  count: z.number().int().min(1).max(20),
})

router.post('/batch', async (req, res, next) => {
  try {
    const parsed = BatchSchema.safeParse(req.body)
    if (!parsed.success) {
      return next(new AppError(ErrorCode.VALIDATION_ERROR, parsed.error.issues[0]?.message ?? 'Invalid body'))
    }

    const { count } = parsed.data
    const values = Array.from({ length: count }, () => ({ token: generateToken() }))

    const created = await db.insert(deviceTokens).values(values).returning()
    sendSuccess(res, created, 201)
  } catch (err) {
    next(err)
  }
})

// DELETE /api/admin/device-tokens/:id — revoke an unused token
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params as { id: string }

    const [token] = await db
      .select({ id: deviceTokens.id, isUsed: deviceTokens.isUsed })
      .from(deviceTokens)
      .where(eq(deviceTokens.id, id))
      .limit(1)

    if (!token) return next(new AppError(ErrorCode.NOT_FOUND, '序號不存在', 404))
    if (token.isUsed) return next(new AppError(ErrorCode.VALIDATION_ERROR, '已使用的序號無法撤銷', 400))

    await db.delete(deviceTokens).where(eq(deviceTokens.id, id))
    sendSuccess(res, null)
  } catch (err) {
    next(err)
  }
})

export default router
