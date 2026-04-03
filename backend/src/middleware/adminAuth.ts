import type { Request, Response, NextFunction } from 'express'
import { AuthService, AdminPayload } from '../services/AuthService'
import { AppError, ErrorCode } from '../utils/errors'

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      adminUser?: AdminPayload
    }
  }
}

/**
 * Reads `admin_token` from httpOnly cookie and attaches the admin user
 * payload to `req.adminUser`. Throws UNAUTHORIZED / TOKEN_EXPIRED if missing or invalid.
 */
export function adminAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = req.cookies['admin_token'] as string | undefined

  if (!token) {
    next(new AppError(ErrorCode.UNAUTHORIZED, '請先登入管理後台', 401))
    return
  }

  try {
    req.adminUser = AuthService.verifyAccessToken(token)
    next()
  } catch (err) {
    next(err)
  }
}
