import jwt, { type SignOptions } from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { db } from '../models/db'
import { adminUsers, roles } from '../models/schema'
import { AppError, ErrorCode } from '../utils/errors'

export interface AdminPayload {
  userId: string
  username: string
  role: string
}

function getSecret(): string {
  const s = process.env['JWT_SECRET']
  if (!s) throw new Error('JWT_SECRET is not configured')
  return s
}

const ACCESS_TTL = (process.env['JWT_ACCESS_EXPIRES_IN'] ?? '8h') as SignOptions['expiresIn']
const REFRESH_TTL = (process.env['JWT_REFRESH_EXPIRES_IN'] ?? '7d') as SignOptions['expiresIn']

export class AuthService {
  // ── Login ─────────────────────────────────────────────────────────────────

  static async login(username: string, password: string) {
    const [user] = await db
      .select()
      .from(adminUsers)
      .where(eq(adminUsers.username, username))
      .limit(1)

    if (!user || !user.isActive) {
      throw new AppError(ErrorCode.UNAUTHORIZED, '帳號或密碼錯誤', 401)
    }

    const ok = await bcrypt.compare(password, user.passwordHash)
    if (!ok) throw new AppError(ErrorCode.UNAUTHORIZED, '帳號或密碼錯誤', 401)

    const payload = await this._buildPayload(user.id, user.username, user.roleId)
    const secret = getSecret()
    const accessToken = jwt.sign(payload, secret, { expiresIn: ACCESS_TTL })
    const refreshToken = jwt.sign({ userId: user.id, type: 'refresh' }, secret, { expiresIn: REFRESH_TTL })

    return { accessToken, refreshToken, user: payload }
  }

  // ── Verify access token ───────────────────────────────────────────────────

  static verifyAccessToken(token: string): AdminPayload {
    try {
      const decoded = jwt.verify(token, getSecret()) as AdminPayload & { type?: string }
      if (decoded.type === 'refresh') throw new Error('Wrong token type')
      return { userId: decoded.userId, username: decoded.username, role: decoded.role }
    } catch (err) {
      const e = err as Error
      if (e.name === 'TokenExpiredError') throw new AppError(ErrorCode.TOKEN_EXPIRED, 'Token 已過期，請重新整理', 401)
      throw new AppError(ErrorCode.INVALID_TOKEN, 'Token 無效，請重新登入', 401)
    }
  }

  // ── Refresh tokens ────────────────────────────────────────────────────────

  static async refreshTokens(refreshToken: string) {
    let userId: string
    try {
      const decoded = jwt.verify(refreshToken, getSecret()) as { userId: string; type: string }
      if (decoded.type !== 'refresh') throw new Error('Wrong token type')
      userId = decoded.userId
    } catch (err) {
      const e = err as Error
      if (e.name === 'TokenExpiredError') throw new AppError(ErrorCode.TOKEN_EXPIRED, '請重新登入', 401)
      throw new AppError(ErrorCode.INVALID_TOKEN, 'Refresh token 無效', 401)
    }

    const [user] = await db.select().from(adminUsers).where(eq(adminUsers.id, userId)).limit(1)
    if (!user || !user.isActive) throw new AppError(ErrorCode.UNAUTHORIZED, '帳號不存在或已停用', 401)

    const payload = await this._buildPayload(user.id, user.username, user.roleId)
    const secret = getSecret()
    const newAccessToken = jwt.sign(payload, secret, { expiresIn: ACCESS_TTL })
    const newRefreshToken = jwt.sign({ userId: user.id, type: 'refresh' }, secret, { expiresIn: REFRESH_TTL })

    return { accessToken: newAccessToken, refreshToken: newRefreshToken, user: payload }
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private static async _buildPayload(userId: string, username: string, roleId: string | null): Promise<AdminPayload> {
    let roleName = ''
    if (roleId) {
      const [r] = await db.select({ name: roles.name }).from(roles).where(eq(roles.id, roleId)).limit(1)
      if (r) roleName = r.name
    }
    return { userId, username, role: roleName }
  }
}
