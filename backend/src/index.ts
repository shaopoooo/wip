import './utils/loadEnv'
import express from 'express'
import morgan from 'morgan'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { errorHandler } from './middleware/errorHandler'
import departmentsRouter from './api/departments'
import groupsRouter from './api/groups'
import stationsRouter from './api/stations'
import devicesRouter from './api/devices'
import workOrdersRouter from './api/workOrders'
import productsRouter from './api/products'
import processRoutesRouter from './api/processRoutes'
import scanRouter from './api/scan'
// Admin
import adminAuthRouter from './api/admin/auth'
import adminRolesRouter from './api/admin/roles'
import adminUsersRouter from './api/admin/users'
import adminGroupsRouter from './api/admin/groups'
import adminProductsRouter from './api/admin/products'
import adminStationsRouter from './api/admin/stations'
import adminEquipmentRouter from './api/admin/equipment'
import adminProcessRoutesRouter from './api/admin/processRoutes'
import adminWorkOrdersRouter from './api/admin/workOrders'

const app = express()
const port = Number(process.env['PORT'] ?? 3000)

// ── Global middleware ──────────────────────────────────────────────────────────
app.use(morgan('dev'))
app.use(cors({ origin: process.env['CORS_ORIGIN'] ?? true, credentials: true }))
app.use(express.json())
app.use(cookieParser())

// ── Health check ───────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok', timestamp: new Date().toISOString() } })
})

// ── Public API routes ──────────────────────────────────────────────────────────
app.use('/api/departments', departmentsRouter)
app.use('/api/groups', groupsRouter)
app.use('/api/stations', stationsRouter)
app.use('/api/devices', devicesRouter)
app.use('/api/work-orders', workOrdersRouter)
app.use('/api/products', productsRouter)
app.use('/api/process-routes', processRoutesRouter)
app.use('/api/scan', scanRouter)

// ── Admin API routes (JWT-protected inside each router) ────────────────────────
app.use('/api/admin/auth', adminAuthRouter)
app.use('/api/admin/roles', adminRolesRouter)
app.use('/api/admin/users', adminUsersRouter)
app.use('/api/admin/groups', adminGroupsRouter)
app.use('/api/admin/products', adminProductsRouter)
app.use('/api/admin/stations', adminStationsRouter)
app.use('/api/admin/equipment', adminEquipmentRouter)
app.use('/api/admin/process-routes', adminProcessRoutesRouter)
app.use('/api/admin/work-orders', adminWorkOrdersRouter)

// ── Global error handler (must be last) ───────────────────────────────────────
app.use(errorHandler)

app.listen(port, () => {
  console.log(`[server] listening on port ${port}`)
})

export default app
