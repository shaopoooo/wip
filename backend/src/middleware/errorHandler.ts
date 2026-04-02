import type { Request, Response, NextFunction } from 'express'
import { AppError, ErrorCode } from '../utils/errors'
import { sendError } from '../utils/response'

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    sendError(res, err.code, err.message, err.statusCode)
    return
  }

  console.error('[error]', err)
  sendError(res, ErrorCode.INTERNAL_ERROR, 'Internal server error', 500)
}
