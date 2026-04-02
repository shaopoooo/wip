/**
 * 環境變數載入工具
 *
 * 命名規則：
 *   production  → .env
 *   development → .env.dev
 *
 * NODE_ENV 由外層（npm script / Docker）負責設定，dotenv 只補充未設定的變數。
 */
import dotenv from 'dotenv'

const envFile = process.env['NODE_ENV'] === 'production' ? '.env' : '.env.dev'
dotenv.config({ path: envFile })
