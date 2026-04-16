/**
 * 執行資料庫遷移（生產環境用）
 * 使用 drizzle-orm 內建 migrator，讀取 /migrations 目錄下的 SQL 檔案
 * 不依賴 drizzle-kit（devDependency），可在 --omit=dev 環境中執行
 */
import './utils/loadEnv'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'
import path from 'path'

async function runMigrations() {
  if (!process.env['DATABASE_URL']) {
    throw new Error('DATABASE_URL is not set')
  }

  const pool = new Pool({ connectionString: process.env['DATABASE_URL'] })
  const db = drizzle(pool)

  const migrationsFolder = process.env['MIGRATIONS_PATH']
    || path.resolve(__dirname, '../../migrations')
  console.log(`[migrate] Applying migrations from ${migrationsFolder}`)

  await migrate(db, { migrationsFolder })

  console.log('[migrate] Done ✓')
  await pool.end()
}

runMigrations().catch((err) => {
  console.error('[migrate] Failed:', err)
  process.exit(1)
})
