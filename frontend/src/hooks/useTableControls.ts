import { useState, useMemo } from 'react'

export function useTableControls<T>(
  items: T[],
  searchFn: (item: T, q: string) => boolean,
  defaultPageSize = 10,
) {
  const [search, setSearchRaw] = useState('')
  const [page, setPageRaw] = useState(1)
  const [pageSize, setPageSizeRaw] = useState(defaultPageSize)

  const filtered = useMemo(() => {
    const safe = items ?? []
    if (!search.trim()) return safe
    const q = search.toLowerCase()
    return safe.filter(item => searchFn(item, q))
  }, [items, search, searchFn])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const visible = useMemo(
    () => filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [filtered, currentPage, pageSize],
  )

  return {
    search,
    setSearch: (q: string) => { setSearchRaw(q); setPageRaw(1) },
    page: currentPage,
    setPage: setPageRaw,
    pageSize,
    setPageSize: (n: number) => { setPageSizeRaw(n); setPageRaw(1) },
    totalPages,
    total: filtered.length,
    visible,
  }
}
