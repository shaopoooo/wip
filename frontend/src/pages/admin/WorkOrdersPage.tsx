import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { workOrdersApi, productsApi, departmentsApi, WorkOrderRow, Product, Department } from '../../api/admin'
import { useServerTable } from '../../hooks/useServerTable'
import { TableControls } from '../../components/TableControls'

const STATUS_LABEL: Record<string, string> = {
  pending: '待開工',
  in_progress: '進行中',
  completed: '已完工',
  cancelled: '已取消',
  split: '已拆單',
}

const STATUS_COLOR: Record<string, string> = {
  pending: 'bg-slate-100 text-slate-600',
  in_progress: 'bg-blue-100 text-blue-700',
  completed: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-red-100 text-red-600',
  split: 'bg-amber-100 text-amber-700',
}

export function WorkOrdersPage() {
  const navigate = useNavigate()
  const st = useServerTable<WorkOrderRow>({ defaultLimit: 25 })
  const [depts, setDepts] = useState<Department[]>([])
  const [selectedDept, setSelectedDept] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [routeFilter, setRouteFilter] = useState('')
  const [showCreate, setShowCreate] = useState(false)

  useEffect(() => {
    departmentsApi.list().then(d => {
      setDepts(d)
      if (d.length > 0) setSelectedDept(d[0]!.id)
    }).catch(() => {})
  }, [])

  const load = useCallback(async () => {
    if (!selectedDept) return
    st.setLoading(true)
    try {
      const result = await workOrdersApi.list({
        ...st.params,
        departmentId: selectedDept,
        status: statusFilter || undefined,
        routeFilter: routeFilter || undefined,
      })
      st.setData(result.items, result.total)
    } catch { } finally { st.setLoading(false) }
  }, [st.params, selectedDept, statusFilter, routeFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void load() }, [load])

  const handleDeptChange = (val: string) => { setSelectedDept(val); st.setPage(1) }
  const handleStatusChange = (val: string) => { setStatusFilter(val); st.setPage(1) }
  const handleRouteFilterChange = (val: string) => { setRouteFilter(val); st.setPage(1) }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-slate-800">工單管理</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer"
        >
          + 建立工單
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <select value={selectedDept} onChange={e => handleDeptChange(e.target.value)} className={SELECT_CLS} style={{ maxWidth: 180 }}>
          {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select value={statusFilter} onChange={e => handleStatusChange(e.target.value)} className={SELECT_CLS} style={{ maxWidth: 140 }}>
          <option value="">全部狀態</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={routeFilter} onChange={e => handleRouteFilterChange(e.target.value)} className={SELECT_CLS} style={{ maxWidth: 140 }}>
          <option value="">全部製程</option>
          <option value="set">已設定製程</option>
          <option value="unset">未設定製程</option>
        </select>
      </div>

      <TableControls
        search={st.search} onSearch={st.setSearch}
        total={st.total} page={st.page} totalPages={st.totalPages}
        setPage={st.setPage} pageSize={st.limit} onPageSize={st.setLimit}
        placeholder="搜尋工單號或產品..."
      />

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <SortTh col="order_number" label="工單號" sortBy={st.sortBy} sortDir={st.sortDir} onToggle={st.toggleSort} />
              <th className="text-left px-4 py-3 font-semibold text-slate-600">製程 / 料號</th>
              <SortTh col="order_qty" label="訂單數量" sortBy={st.sortBy} sortDir={st.sortDir} onToggle={st.toggleSort} />
              <th className="text-left px-4 py-3 font-semibold text-slate-600">製作數量</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">狀態</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">優先</th>
              <SortTh col="due_date" label="交期" sortBy={st.sortBy} sortDir={st.sortDir} onToggle={st.toggleSort} />
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {st.loading && (
              <tr><td colSpan={8} className="text-center py-10 text-slate-400">載入中...</td></tr>
            )}
            {!st.loading && st.items.length === 0 && (
              <tr><td colSpan={8} className="text-center py-10 text-slate-400">目前無工單</td></tr>
            )}
            {st.items.map(({ workOrder: wo, product }) => (
              <tr key={wo.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3 font-mono font-semibold text-slate-800">{wo.orderNumber}</td>
                <td className="px-4 py-3 font-mono text-slate-800">{product.modelNumber}<span className="text-slate-400 ml-1 text-xs font-sans">{product.name}</span></td>
                <td className="px-4 py-3 text-slate-700">{wo.orderQty ?? '—'}</td>
                <td className="px-4 py-3 text-slate-500">{wo.plannedQty}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLOR[wo.status] ?? 'bg-slate-100 text-slate-600'}`}>
                    {STATUS_LABEL[wo.status] ?? wo.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {wo.priority === 'urgent' ? <span className="text-xs font-semibold text-red-600">急件</span> : <span className="text-xs text-slate-400">普通</span>}
                </td>
                <td className="px-4 py-3 text-slate-500 text-xs">{wo.dueDate ?? '—'}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => navigate(`/admin/work-orders/${wo.id}`)}
                    className="text-blue-600 hover:text-blue-800 text-xs font-medium cursor-pointer"
                  >
                    詳情 / QR →
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <CreateWorkOrderModal
          depts={depts}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); void load() }}
        />
      )}
    </div>
  )
}

// ── CreateWorkOrderModal ───────────────────────────────────────────────────────

function CreateWorkOrderModal({
  depts, onClose, onCreated,
}: {
  depts: Department[]; onClose: () => void; onCreated: () => void
}) {
  const [deptId, setDeptId] = useState(depts[0]?.id ?? '')
  const [productId, setProductId] = useState('')
  const [orderQty, setOrderQty] = useState(1)
  const [plannedQty, setPlannedQty] = useState<number | ''>('')
  const [priority, setPriority] = useState<'normal' | 'urgent'>('normal')
  const [dueDate, setDueDate] = useState('')
  const [note, setNote] = useState('')
  const [products, setProducts] = useState<Product[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // fuzzy search state
  const [searchText, setSearchText] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)

  useEffect(() => {
    if (!deptId) return
    productsApi.listAll(deptId).then(d => {
      setProducts(d)
    }).catch(() => {})
    // reset when dept changes
    setProductId('')
    setSearchText('')
  }, [deptId])

  const filteredProducts = searchText.trim()
    ? products.filter(p =>
        p.modelNumber.toLowerCase().includes(searchText.toLowerCase()) ||
        p.name.toLowerCase().includes(searchText.toLowerCase())
      ).slice(0, 5)
    : products.slice(0, 5)

  const selectedProduct = products.find(p => p.id === productId)

  const handleSelectProduct = (p: Product) => {
    setProductId(p.id)
    setSearchText(p.modelNumber)
    setShowDropdown(false)
  }

  const handleSubmit = async () => {
    if (!productId) {
      setError('物料編號不正確，請重新輸入並從下拉選單中選擇')
      return
    }
    if (!deptId || orderQty < 1) {
      setError('請填寫所有必填欄位')
      return
    }
    setSaving(true); setError(null)
    try {
      await workOrdersApi.create({
        departmentId: deptId, productId, orderQty,
        plannedQty: plannedQty !== '' ? plannedQty : undefined,
        priority, dueDate: dueDate || null,
        note: note.trim() || null,
      })
      onCreated()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
        <h2 className="font-bold text-slate-800 text-lg">建立工單</h2>

        <div className="space-y-3">
          <Field label="部門">
            <select value={deptId} onChange={e => setDeptId(e.target.value)} className={SELECT_CLS}>
              {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </Field>
          <Field label="物料編號">
            <div className="relative">
              <input
                value={searchText}
                onChange={e => { setSearchText(e.target.value); setShowDropdown(true); setProductId(''); setError(null) }}
                onFocus={() => { if (!productId) setShowDropdown(true) }}
                onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                className={`${INPUT_CLS} ${searchText.trim() && !productId ? 'border-red-300' : ''}`}
                placeholder="輸入物料編號搜尋..."
                autoComplete="off"
              />
              {showDropdown && !productId && filteredProducts.length > 0 && (
                <ul className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {filteredProducts.map(p => (
                    <li
                      key={p.id}
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => handleSelectProduct(p)}
                      className="px-3 py-2 text-sm cursor-pointer hover:bg-blue-50 flex justify-between items-center"
                    >
                      <span className="font-mono">{p.modelNumber}</span>
                      <span className="text-slate-400 text-xs truncate ml-2">{p.name}</span>
                    </li>
                  ))}
                </ul>
              )}
              {showDropdown && !productId && searchText.trim() && filteredProducts.length === 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-sm text-slate-400">
                  找不到符合的產品
                </div>
              )}
            </div>
            {searchText.trim() && !productId && !showDropdown && (
              <p className="text-xs text-red-500 mt-1">物料編號不正確，請重新輸入並從下拉選單中選擇</p>
            )}
            {selectedProduct && (
              <p className="text-xs text-slate-500 mt-1">
                {selectedProduct.name}
                {selectedProduct.routeId
                  ? <span className="text-emerald-600 ml-2">已設定製程</span>
                  : <span className="text-red-500 ml-2">未設定製程</span>
                }
              </p>
            )}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="訂單數量">
              <input type="number" min={1} value={orderQty} onChange={e => setOrderQty(Number(e.target.value))} className={INPUT_CLS} />
            </Field>
            <Field label="製作數量（選填）">
              <input type="number" min={1} value={plannedQty} onChange={e => setPlannedQty(e.target.value === '' ? '' : Number(e.target.value))} className={INPUT_CLS} placeholder="同訂單數量" />
            </Field>
          </div>
          <Field label="優先級">
            <select value={priority} onChange={e => setPriority(e.target.value as 'normal' | 'urgent')} className={SELECT_CLS}>
              <option value="normal">普通</option>
              <option value="urgent">急件</option>
            </select>
          </Field>
          <Field label="交期（選填）">
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={INPUT_CLS} />
          </Field>
          <Field label="備註（選填）">
            <textarea value={note} onChange={e => setNote(e.target.value)} className={INPUT_CLS} rows={2} placeholder="工單備註..." />
          </Field>
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 border border-slate-300 text-slate-600 py-2.5 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-colors cursor-pointer">取消</button>
          <button onClick={handleSubmit} disabled={saving} className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors cursor-pointer">
            {saving ? '建立中...' : '建立工單'}
          </button>
        </div>
      </div>
    </div>
  )
}

const SELECT_CLS = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-blue-500'
const INPUT_CLS = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-blue-500'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700 block mb-1">{label}</span>
      {children}
    </label>
  )
}

function SortTh({ col, label, sortBy, sortDir, onToggle }: {
  col: string; label: string; sortBy: string; sortDir: 'asc' | 'desc'; onToggle: (col: string) => void
}) {
  const active = sortBy === col
  return (
    <th
      className="text-left px-4 py-3 font-semibold text-slate-600 cursor-pointer select-none hover:bg-slate-100 transition-colors"
      onClick={() => onToggle(col)}
    >
      {label}
      <span className="ml-1 text-xs">{active ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}</span>
    </th>
  )
}
