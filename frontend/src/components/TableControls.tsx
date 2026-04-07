interface Props {
  search: string
  onSearch: (q: string) => void
  total: number
  page: number
  totalPages: number
  setPage: (p: number) => void
  pageSize: number
  onPageSize: (n: number) => void
  placeholder?: string
}

export function TableControls({
  search, onSearch, total, page, totalPages, setPage, pageSize, onPageSize, placeholder = '搜尋...',
}: Props) {
  return (
    <div className="flex items-center gap-3 mb-4 flex-wrap">
      {/* Search */}
      <div className="relative flex-1 min-w-[180px] max-w-xs">
        <input
          type="text"
          value={search}
          onChange={e => onSearch(e.target.value)}
          placeholder={placeholder}
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm pl-8 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />
        <span className="absolute left-2.5 top-2.5 text-slate-400 text-sm select-none">🔍</span>
        {search && (
          <button
            onClick={() => onSearch('')}
            className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
          >
            ✕
          </button>
        )}
      </div>

      <div className="flex items-center gap-3 ml-auto">
        {/* Page size */}
        <div className="flex items-center gap-1.5 text-sm text-slate-600">
          <span>每頁</span>
          <select
            value={pageSize}
            onChange={e => onPageSize(Number(e.target.value))}
            className="border border-slate-300 rounded px-2 py-1 text-sm focus:outline-none"
          >
            {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <span className="text-slate-400">共 {total} 筆</span>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="px-2.5 py-1 text-sm border border-slate-300 rounded disabled:opacity-40 hover:bg-slate-50 cursor-pointer transition-colors"
            >
              ←
            </button>
            <span className="text-sm text-slate-600 px-2 whitespace-nowrap">
              {page} / {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
              className="px-2.5 py-1 text-sm border border-slate-300 rounded disabled:opacity-40 hover:bg-slate-50 cursor-pointer transition-colors"
            >
              →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/** Sortable table header cell — wire to useServerTable's toggleSort/sortBy/sortDir */
export function SortTh({
  col, label, sortBy, sortDir, toggleSort, className = '',
}: {
  col: string
  label: string
  sortBy: string
  sortDir: 'asc' | 'desc'
  toggleSort: (col: string) => void
  className?: string
}) {
  const active = sortBy === col
  return (
    <th
      onClick={() => toggleSort(col)}
      className={`text-left px-4 py-3 font-semibold cursor-pointer select-none hover:bg-slate-100 transition-colors whitespace-nowrap ${active ? 'text-blue-600' : 'text-slate-600'} ${className}`}
    >
      {label}
      <span className="ml-1 text-xs">
        {active
          ? (sortDir === 'asc' ? '▲' : '▼')
          : <span className="text-slate-300">⇅</span>
        }
      </span>
    </th>
  )
}
