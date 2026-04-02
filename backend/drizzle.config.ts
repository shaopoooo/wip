import type { Config } from 'drizzle-kit'
import * as dotenv from 'dotenv'

const envFile = process.env['NODE_ENV'] === 'production' ? '.env' : '.env.dev'
dotenv.config({ path: envFile })

export default {
  schema: './src/models/schema.ts',
  out: '../migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env['DATABASE_URL'] ?? '',
  },
} satisfies Config
