import { Router } from 'express'
import { z } from 'zod'
import { AuthService } from '../../services/AuthService'
import { adminAuth } from '../../middleware/adminAuth'
import { sendSuccess } from '../../utils/response'
import { AppError, ErrorCode } from '../../utils/errors'

const router = Router()

const isProd = process.env['NODE_ENV'] === 'production'
const ACCESS_TTL = process.env['JWT_ACCESS_EXPIRES_IN'] ?? '8h'
const REFRESH_TTL = process.env['JWT_REFRESH_EXPIRES_IN'] ?? '7d'

function parseTtlMs(ttl: string): number {
  const match = ttl.match(/^(\d+)(s|m|h|d)$/)
  const num = match?.[1]
  const unit = match?.[2]
  if (!num || !unit) return 8 * 60 * 60 * 1000
  const n = parseInt(num, 10)
  switch (unit) {
    case 's': return n * 1000
    case 'm': return n * 60 * 1000
    case 'h': return n * 60 * 60 * 1000
    case 'd': return n * 24 * 60 * 60 * 1000
    default: return 8 * 60 * 60 * 1000
  }
}

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: isProd ? 'strict' as const : 'lax' as const,
  secure: isProd,
}

const LoginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
})

// POST /api/admin/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const parsed = LoginSchema.safeParse(req.body)
    if (!parsed.success) {
      return next(new AppError(ErrorCode.VALIDATION_ERROR, '請填寫帳號與密碼'))
    }

    const { accessToken, refreshToken, user } = await AuthService.login(
      parsed.data.username,
      parsed.data.password,
    )

    res.cookie('admin_token', accessToken, { ...COOKIE_OPTS, maxAge: parseTtlMs(ACCESS_TTL) })
    res.cookie('admin_refresh', refreshToken, { ...COOKIE_OPTS, maxAge: parseTtlMs(REFRESH_TTL) })

    sendSuccess(res, { user })
  } catch (err) {
    next(err)
  }
})

// POST /api/admin/auth/refresh
router.post('/refresh', async (req, res, next) => {
  try {
    const token = req.cookies['admin_refresh'] as string | undefined
    if (!token) {
      return next(new AppError(ErrorCode.UNAUTHORIZED, '請重新登入', 401))
    }

    const { accessToken, refreshToken, user } = await AuthService.refreshTokens(token)

    res.cookie('admin_token', accessToken, { ...COOKIE_OPTS, maxAge: parseTtlMs(ACCESS_TTL) })
    res.cookie('admin_refresh', refreshToken, { ...COOKIE_OPTS, maxAge: parseTtlMs(REFRESH_TTL) })

    sendSuccess(res, { user })
  } catch (err) {
    next(err)
  }
})

// POST /api/admin/auth/logout
router.post('/logout', (_req, res) => {
  res.clearCookie('admin_token')
  res.clearCookie('admin_refresh')
  sendSuccess(res, null)
})

// GET /api/admin/auth/me
router.get('/me', adminAuth, (req, res) => {
  sendSuccess(res, { user: req.adminUser })
})

export default router
