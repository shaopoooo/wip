import { useState, useEffect, useMemo, useCallback } from 'react'

export interface ServerTableParams {
  page: number
  limit: number
  search: string
  sortBy: string
  sortDir: 'asc' | 'desc'
}

export interface ServerTableResult<T> {
  items: T[]
  total: number
  totalPages: number
  loading: boolean
  page: number
  setPage: (p: number) => void
  limit: number
  setLimit: (l: number) => void
  search: string
  setSearch: (s: string) => void
  sortBy: string
  setSortBy: (by: string) => void
  sortDir: 'asc' | 'desc'
  setSortDir: (d: 'asc' | 'desc') => void
  /** Stable params object — use as useEffect/useCallback dep to trigger re-fetch */
  params: ServerTableParams
  /** Toggle sort: if same column flip dir, else set column + asc */
  toggleSort: (col: string) => void
  setData: (items: T[], total: number) => void
  setLoading: (l: boolean) => void
}

export function useServerTable<T>(options?: {
  defaultLimit?: number
  defaultSortBy?: string
  defaultSortDir?: 'asc' | 'desc'
}): ServerTableResult<T> {
  const [page, setPageState] = useState(1)
  const [limit, setLimitState] = useState(options?.defaultLimit ?? 25)
  const [search, setSearchState] = useState('')
  const [sortBy, setSortByState] = useState(options?.defaultSortBy ?? '')
  const [sortDir, setSortDirState] = useState<'asc' | 'desc'>(options?.defaultSortDir ?? 'asc')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [items, setItemsState] = useState<T[]>([])
  const [total, setTotalState] = useState(0)
  const [loading, setLoadingState] = useState(false)

  // Debounce search 300ms
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  // Stable params — only updates when values actually change
  const params = useMemo<ServerTableParams>(
    () => ({ page, limit, search: debouncedSearch, sortBy, sortDir }),
    [page, limit, debouncedSearch, sortBy, sortDir],
  )

  const setPage = useCallback((p: number) => setPageState(p), [])
  const setLimit = useCallback((l: number) => { setLimitState(l); setPageState(1) }, [])
  const setSearch = useCallback((s: string) => { setSearchState(s); setPageState(1) }, [])
  const setSortBy = useCallback((by: string) => { setSortByState(by); setPageState(1) }, [])
  const setSortDir = useCallback((d: 'asc' | 'desc') => { setSortDirState(d); setPageState(1) }, [])

  const toggleSort = useCallback((col: string) => {
    setSortByState(prev => {
      if (prev === col) {
        setSortDirState(d => d === 'asc' ? 'desc' : 'asc')
        setPageState(1)
        return col
      }
      setSortDirState('asc')
      setPageState(1)
      return col
    })
  }, [])

  const setData = useCallback((newItems: T[], newTotal: number) => {
    setItemsState(newItems)
    setTotalState(newTotal)
  }, [])

  const setLoading = useCallback((l: boolean) => setLoadingState(l), [])

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / limit)), [total, limit])

  return {
    items, total, totalPages, loading,
    page, setPage,
    limit, setLimit,
    search, setSearch,
    sortBy, setSortBy,
    sortDir, setSortDir,
    params, toggleSort,
    setData, setLoading,
  }
}
