import { Router } from 'express'
import { z } from 'zod'
import { deviceAuth } from '../middleware/deviceAuth'
import { ScanService } from '../services/ScanService'
import { sendSuccess } from '../utils/response'
import { AppError, ErrorCode } from '../utils/errors'

const router = Router()

const ScanBodySchema = z.object({
  workOrderId: z.string().uuid(),
  /** Check-out only — defaults to plannedQty - defectQty */
  actualQtyOut: z.number().int().min(0).optional(),
  /** Check-out only — defaults to 0 */
  defectQty: z.number().int().min(0).optional(),
})

const CorrectionBodySchema = z.object({
  checkInTime: z.string().datetime().optional(),
  checkOutTime: z.string().datetime().optional(),
  reason: z.string().min(1).max(500),
})

// POST /api/scan
router.post('/', deviceAuth, async (req, res, next) => {
  try {
    const parsed = ScanBodySchema.safeParse(req.body)
    if (!parsed.success) {
      return next(
        new AppError(ErrorCode.VALIDATION_ERROR, parsed.error.issues[0]?.message ?? 'Invalid body'),
      )
    }

    const result = await ScanService.scan({
      workOrderId: parsed.data.workOrderId,
      device: req.device!,
      actualQtyOut: parsed.data.actualQtyOut,
      defectQty: parsed.data.defectQty,
    })

    sendSuccess(res, result)
  } catch (err) {
    next(err)
  }
})

// PATCH /api/scan/:logId/correction
router.patch('/:logId/correction', deviceAuth, async (req, res, next) => {
  try {
    const logId = req.params['logId'] as string

    const parsed = CorrectionBodySchema.safeParse(req.body)
    if (!parsed.success) {
      return next(
        new AppError(ErrorCode.VALIDATION_ERROR, parsed.error.issues[0]?.message ?? 'Invalid body'),
      )
    }

    const result = await ScanService.correct({
      logId,
      device: req.device!,
      checkInTime: parsed.data.checkInTime ? new Date(parsed.data.checkInTime) : undefined,
      checkOutTime: parsed.data.checkOutTime ? new Date(parsed.data.checkOutTime) : undefined,
      reason: parsed.data.reason,
    })

    sendSuccess(res, result)
  } catch (err) {
    next(err)
  }
})

export default router
