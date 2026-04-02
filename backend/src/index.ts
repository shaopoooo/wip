import './utils/loadEnv'
import express from 'express'

const app = express()
const port = Number(process.env['PORT'] ?? 3000)

app.use(express.json())

// Health check — used by Docker healthcheck and nginx
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.listen(port, () => {
  console.log(`[server] listening on port ${port}`)
})

export default app
