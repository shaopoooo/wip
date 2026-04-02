import type { Request, Response, NextFunction } from 'express'
import { eq } from 'drizzle-orm'
import { db } from '../models/db'
import { devices } from '../models/schema'
import { AppError, ErrorCode } from '../utils/errors'

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      device?: typeof devices.$inferSelect
    }
  }
}

/**
 * Reads `x-device-id` from request header and attaches the device record
 * to `req.device`. Throws UNAUTHORIZED if the header is missing or the
 * device does not exist / is inactive.
 */
export async function deviceAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const deviceId = req.headers['x-device-id']

  if (typeof deviceId !== 'string' || deviceId.trim() === '') {
    return next(new AppError(ErrorCode.UNAUTHORIZED, 'Missing x-device-id header', 401))
  }

  const [device] = await db
    .select()
    .from(devices)
    .where(eq(devices.id, deviceId))
    .limit(1)

  if (!device || !device.isActive) {
    return next(new AppError(ErrorCode.UNAUTHORIZED, 'Unknown or inactive device', 401))
  }

  req.device = device
  next()
}
