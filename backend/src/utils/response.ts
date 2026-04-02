import type { Response } from 'express'
import type { ErrorCodeKey } from './errors'

export function sendSuccess<T>(res: Response, data: T, statusCode = 200): void {
  res.status(statusCode).json({ success: true, data })
}

export function sendError(
  res: Response,
  code: ErrorCodeKey,
  message: string,
  statusCode = 400,
): void {
  res.status(statusCode).json({ success: false, error: { code, message } })
}
