// ── Error Codes ────────────────────────────────────────────────────────────────

export const ErrorCode = {
  // Scan anti-fooling
  WRONG_DEPARTMENT: 'WRONG_DEPARTMENT',
  SKIP_STATION: 'SKIP_STATION',
  DUPLICATE_SCAN: 'DUPLICATE_SCAN',
  ORDER_CLOSED: 'ORDER_CLOSED',
  ORDER_ALREADY_SPLIT: 'ORDER_ALREADY_SPLIT',
  SPLIT_QTY_MISMATCH: 'SPLIT_QTY_MISMATCH',

  // Auth (admin)
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  INVALID_TOKEN: 'INVALID_TOKEN',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',

  // Generic
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const

export type ErrorCodeKey = keyof typeof ErrorCode

// ── AppError ───────────────────────────────────────────────────────────────────

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCodeKey,
    message: string,
    public readonly statusCode: number = 400,
  ) {
    super(message)
    this.name = 'AppError'
  }
}
