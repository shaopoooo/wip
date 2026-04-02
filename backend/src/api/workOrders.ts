import { Router } from 'express'
import { and, asc, eq, SQL } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../models/db'
import { workOrders, products } from '../models/schema'
import { sendSuccess } from '../utils/response'
import { AppError, ErrorCode } from '../utils/errors'

const router = Router()

const ListQuerySchema = z.object({
  department_id: z.string().uuid(),
  status: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

// GET /api/work-orders?department_id=&status=&page=&limit=
router.get('/', async (req, res, next) => {
  try {
    const parsed = ListQuerySchema.safeParse(req.query)
    if (!parsed.success) {
      return next(
        new AppError(ErrorCode.VALIDATION_ERROR, parsed.error.issues[0]?.message ?? 'Invalid query'),
      )
    }

    const { department_id, status, page, limit } = parsed.data
    const offset = (page - 1) * limit

    const conditions: SQL[] = [eq(workOrders.departmentId, department_id)]
    if (status) {
      conditions.push(eq(workOrders.status, status))
    }

    const rows = await db
      .select({
        workOrder: workOrders,
        product: { name: products.name, modelNumber: products.modelNumber },
      })
      .from(workOrders)
      .innerJoin(products, eq(workOrders.productId, products.id))
      .where(and(...conditions))
      .orderBy(asc(workOrders.createdAt))
      .limit(limit)
      .offset(offset)

    sendSuccess(res, { items: rows, page, limit })
  } catch (err) {
    next(err)
  }
})

// GET /api/work-orders/:id
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params

    const rows = await db
      .select({
        workOrder: workOrders,
        product: { name: products.name, modelNumber: products.modelNumber },
      })
      .from(workOrders)
      .innerJoin(products, eq(workOrders.productId, products.id))
      .where(eq(workOrders.id, id))
      .limit(1)

    if (rows.length === 0) {
      return next(new AppError(ErrorCode.NOT_FOUND, 'Work order not found', 404))
    }

    sendSuccess(res, rows[0])
  } catch (err) {
    next(err)
  }
})

export default router
