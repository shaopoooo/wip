import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { workOrdersApi, productsApi, routesApi, departmentsApi, WorkOrderRow, Product, ProcessRoute, Department } from '../../api/admin'

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
  const [depts, setDepts] = useState<Department[]>([])
  const [selectedDept, setSelectedDept] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [rows, setRows] = useState<WorkOrderRow[]>([])
  const [loading, setLoading] = useState(false)
  const [showCreate, setShowCreate] = useState(false)

  useEffect(() => {
    departmentsApi.list().then(d => {
      setDepts(d)
      if (d.length > 0) setSelectedDept(d[0]!.id)
    }).catch(() => {})
  }, [])

  const load = useCallback(async () => {
    if (!selectedDept) return
    setLoading(true)
    try {
      const data = await workOrdersApi.list({ departmentId: selectedDept, status: statusFilter || undefined, limit: 50 })
      setRows(data.items)
    } finally {
      setLoading(false)
    }
  }, [selectedDept, statusFilter])

  useEffect(() => { load() }, [load])

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
        <select
          value={selectedDept}
          onChange={e => setSelectedDept(e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:border-blue-500"
        >
          {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:border-blue-500"
        >
          <option value="">全部狀態</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">工單號</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">產品</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">數量</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">狀態</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">優先</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">交期</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7} className="text-center py-10 text-slate-400">載入中...</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={7} className="text-center py-10 text-slate-400">目前無工單</td></tr>
            )}
            {rows.map(({ workOrder: wo, product }) => (
              <tr key={wo.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3 font-mono font-semibold text-slate-800">{wo.orderNumber}</td>
                <td className="px-4 py-3 text-slate-700">{product.name}<span className="text-slate-400 ml-1 text-xs">{product.modelNumber}</span></td>
                <td className="px-4 py-3 text-slate-700">{wo.plannedQty}</td>
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
          onCreated={() => { setShowCreate(false); load() }}
        />
      )}
    </div>
  )
}

// ── CreateWorkOrderModal ───────────────────────────────────────────────────────

function CreateWorkOrderModal({
  depts,
  onClose,
  onCreated,
}: {
  depts: Department[]
  onClose: () => void
  onCreated: () => void
}) {
  const [deptId, setDeptId] = useState(depts[0]?.id ?? '')
  const [productId, setProductId] = useState('')
  const [routeId, setRouteId] = useState('')
  const [plannedQty, setPlannedQty] = useState(1)
  const [priority, setPriority] = useState<'normal' | 'urgent'>('normal')
  const [dueDate, setDueDate] = useState('')
  const [products, setProducts] = useState<Product[]>([])
  const [routes, setRoutes] = useState<ProcessRoute[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!deptId) return
    productsApi.listByDept(deptId).then(d => { setProducts(d); setProductId(d[0]?.id ?? '') }).catch(() => {})
    routesApi.listByDept(deptId).then(d => { setRoutes(d); setRouteId(d[0]?.id ?? '') }).catch(() => {})
  }, [deptId])

  const handleSubmit = async () => {
    if (!deptId || !productId || !routeId || plannedQty < 1) {
      setError('請填寫所有必填欄位')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await workOrdersApi.create({
        departmentId: deptId,
        productId,
        routeId,
        plannedQty,
        priority,
        dueDate: dueDate || null,
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
          <Field label="產品型號">
            <select value={productId} onChange={e => setProductId(e.target.value)} className={SELECT_CLS}>
              {products.length === 0 && <option value="">（無產品）</option>}
              {products.map(p => <option key={p.id} value={p.id}>{p.name} — {p.modelNumber}</option>)}
            </select>
          </Field>
          <Field label="工序路由">
            <select value={routeId} onChange={e => setRouteId(e.target.value)} className={SELECT_CLS}>
              {routes.length === 0 && <option value="">（無路由）</option>}
              {routes.map(r => <option key={r.id} value={r.id}>{r.name} v{r.version}</option>)}
            </select>
          </Field>
          <Field label="計畫數量">
            <input type="number" min={1} value={plannedQty} onChange={e => setPlannedQty(Number(e.target.value))} className={INPUT_CLS} />
          </Field>
          <Field label="優先級">
            <select value={priority} onChange={e => setPriority(e.target.value as 'normal' | 'urgent')} className={SELECT_CLS}>
              <option value="normal">普通</option>
              <option value="urgent">急件</option>
            </select>
          </Field>
          <Field label="交期（選填）">
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={INPUT_CLS} />
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
