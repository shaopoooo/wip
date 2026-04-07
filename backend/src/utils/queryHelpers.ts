import { SQL, asc, desc, ilike, sql } from 'drizzle-orm'
import { PgColumn } from 'drizzle-orm/pg-core'

// ── Pagination ─────────────────────────────────────────────────────────────────

export interface PageParams {
  page: number
  limit: number
  offset: number
  sortDir: 'asc' | 'desc'
  sortBy: string
  search: string
}

export function parsePage(query: Record<string, unknown>): PageParams {
  const page = Math.max(1, Number(query['page'] ?? 1))
  const limit = Math.min(200, Math.max(1, Number(query['limit'] ?? 25)))
  const offset = (page - 1) * limit
  const sortDir: 'asc' | 'desc' = query['sort_dir'] === 'asc' ? 'asc' : 'desc'
  const sortBy = String(query['sort_by'] ?? '')
  const search = String(query['search'] ?? '').trim()
  return { page, limit, offset, sortDir, sortBy, search }
}

export function buildOrder(col: PgColumn, dir: 'asc' | 'desc') {
  return dir === 'asc' ? asc(col) : desc(col)
}

export function searchCond(col: PgColumn, term: string): SQL {
  return ilike(col, `%${term}%`)
}

export interface PagedResult<T> {
  items: T[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export function pagedResult<T>(items: T[], total: number, page: number, limit: number): PagedResult<T> {
  return { items, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) }
}

/** Convenience: sql fragment for COUNT(*) column */
export const countCol = sql<number>`count(*)::int`
