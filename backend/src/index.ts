import './utils/loadEnv'
import express from 'express'
import morgan from 'morgan'
import cors from 'cors'
import { errorHandler } from './middleware/errorHandler'
import departmentsRouter from './api/departments'
import groupsRouter from './api/groups'
import stationsRouter from './api/stations'
import devicesRouter from './api/devices'
import workOrdersRouter from './api/workOrders'
import scanRouter from './api/scan'

const app = express()
const port = Number(process.env['PORT'] ?? 3000)

// ── Global middleware ──────────────────────────────────────────────────────────
app.use(morgan('dev'))
app.use(cors())
app.use(express.json())

// ── Health check ───────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok', timestamp: new Date().toISOString() } })
})

// ── API routes ─────────────────────────────────────────────────────────────────
app.use('/api/departments', departmentsRouter)
app.use('/api/groups', groupsRouter)
app.use('/api/stations', stationsRouter)
app.use('/api/devices', devicesRouter)
app.use('/api/work-orders', workOrdersRouter)
app.use('/api/scan', scanRouter)

// ── Global error handler (must be last) ───────────────────────────────────────
app.use(errorHandler)

app.listen(port, () => {
  console.log(`[server] listening on port ${port}`)
})

export default app
