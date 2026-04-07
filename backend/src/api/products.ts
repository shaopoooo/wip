import { Router } from 'express'
import { and, asc, eq } from 'drizzle-orm'
import { db } from '../models/db'
import { products, productCategories } from '../models/schema'
import { sendSuccess } from '../utils/response'
import { AppError, ErrorCode } from '../utils/errors'

const router = Router()

// GET /api/products?department_id=
router.get('/', async (req, res, next) => {
  try {
    const departmentId = req.query['department_id'] as string | undefined
    if (!departmentId) {
      return next(new AppError(ErrorCode.VALIDATION_ERROR, 'department_id is required'))
    }

    const rows = await db
      .select({
        id: products.id,
        departmentId: products.departmentId,
        name: products.name,
        modelNumber: products.modelNumber,
        description: products.description,
        isActive: products.isActive,
        categoryId: products.categoryId,
        categoryName: productCategories.name,
        routeId: products.routeId,
        createdAt: products.createdAt,
        updatedAt: products.updatedAt,
      })
      .from(products)
      .leftJoin(productCategories, eq(products.categoryId, productCategories.id))
      .where(and(eq(products.departmentId, departmentId), eq(products.isActive, true)))
      .orderBy(asc(products.name))

    sendSuccess(res, rows)
  } catch (err) {
    next(err)
  }
})

// GET /api/products/:id
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params as { id: string }
    const [product] = await db.select().from(products).where(eq(products.id, id)).limit(1)
    if (!product) return next(new AppError(ErrorCode.NOT_FOUND, '產品不存在', 404))
    sendSuccess(res, product)
  } catch (err) {
    next(err)
  }
})

export default router
