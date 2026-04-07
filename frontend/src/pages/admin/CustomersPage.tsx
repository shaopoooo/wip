import { useState, useEffect, useCallback } from 'react'
import { customersApi, Customer } from '../../api/admin'
import { useServerTable } from '../../hooks/useServerTable'
import { TableControls } from '../../components/TableControls'

export function CustomersPage() {
  const st = useServerTable<Customer>({ defaultLimit: 25 })
  const [isActive, setIsActive] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Customer | null>(null)

  const load = useCallback(async () => {
    st.setLoading(true)
    try {
      const result = await customersApi.list({ ...st.params, isActive: isActive || undefined })
      st.setData(result.items, result.total)
    } catch { } finally { st.setLoading(false) }
  }, [st.params, isActive]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void load() }, [load])

  const handleIsActiveChange = (val: string) => {
    setIsActive(val)
    st.setPage(1)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('確定停用此客戶？')) return
    try { await customersApi.delete(id); void load() }
    catch (err) { alert((err as Error).message) }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-slate-800">客戶主檔</h1>
        <button onClick={() => { setEditing(null); setShowModal(true) }} className={BTN_PRIMARY}>+ 新增客戶</button>
      </div>

      <div className="flex gap-3 mb-4">
        <select value={isActive} onChange={e => handleIsActiveChange(e.target.value)} className={SELECT_CLS} style={{ width: 110 }}>
          <option value="">全部</option>
          <option value="true">啟用中</option>
          <option value="false">已停用</option>
        </select>
      </div>

      <TableControls
        search={st.search} onSearch={st.setSearch}
        total={st.total} page={st.page} totalPages={st.totalPages}
        setPage={st.setPage} pageSize={st.limit} onPageSize={st.setLimit}
        placeholder="搜尋客戶代碼或名稱..."
      />

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">客戶代碼</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">名稱</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">費用檔數</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">需對照名稱</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">狀態</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {st.loading && <tr><td colSpan={6} className="text-center py-10 text-slate-400">載入中...</td></tr>}
            {!st.loading && st.items.length === 0 && <tr><td colSpan={6} className="text-center py-10 text-slate-400">尚無客戶</td></tr>}
            {st.items.map(item => (
              <tr key={item.id} className={`border-b border-slate-100 hover:bg-slate-50 ${!item.isActive ? 'opacity-50' : ''}`}>
                <td className="px-4 py-3 font-mono font-semibold text-slate-700">{item.code}</td>
                <td className="px-4 py-3 text-slate-800">{item.name ?? '—'}</td>
                <td className="px-4 py-3 text-slate-600">{item.costFileCount}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${item.needsNameMapping ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                    {item.needsNameMapping ? '待對照' : '已完成'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${item.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {item.isActive ? '啟用' : '停用'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right space-x-3">
                  <button onClick={() => { setEditing(item); setShowModal(true) }} className="text-blue-600 hover:text-blue-800 text-xs font-medium cursor-pointer">編輯</button>
                  {item.isActive && <button onClick={() => handleDelete(item.id)} className="text-red-500 hover:text-red-700 text-xs font-medium cursor-pointer">停用</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <CustomerModal
          customer={editing}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); void load() }}
        />
      )}
    </div>
  )
}

function CustomerModal({ customer, onClose, onSaved }: {
  customer: Customer | null; onClose: () => void; onSaved: () => void
}) {
  const [code, setCode] = useState(customer?.code ?? '')
  const [name, setName] = useState(customer?.name ?? '')
  const [costFileCount, setCostFileCount] = useState(customer?.costFileCount ?? 0)
  const [needsNameMapping, setNeedsNameMapping] = useState(customer?.needsNameMapping ?? true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!code.trim()) { setError('請填寫客戶代碼'); return }
    setSaving(true); setError(null)
    try {
      if (customer) {
        await customersApi.update(customer.id, { code, name: name || null, costFileCount, needsNameMapping })
      } else {
        await customersApi.create({ code, name: name || null, costFileCount, needsNameMapping })
      }
      onSaved()
    } catch (err) { setError((err as Error).message) }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
        <h2 className="font-bold text-slate-800 text-lg">{customer ? '編輯客戶' : '新增客戶'}</h2>
        <div className="space-y-3">
          <Field label="客戶代碼"><input value={code} onChange={e => setCode(e.target.value)} className={INPUT_CLS} placeholder="022" /></Field>
          <Field label="名稱（選填）"><input value={name} onChange={e => setName(e.target.value)} className={INPUT_CLS} placeholder="客戶全名" /></Field>
          <Field label="費用檔數"><input type="number" min={0} value={costFileCount} onChange={e => setCostFileCount(Number(e.target.value))} className={INPUT_CLS} /></Field>
          <Field label="需對照名稱">
            <select value={String(needsNameMapping)} onChange={e => setNeedsNameMapping(e.target.value === 'true')} className={SELECT_CLS}>
              <option value="true">是</option>
              <option value="false">否</option>
            </select>
          </Field>
        </div>
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 border border-slate-300 text-slate-600 py-2.5 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-colors cursor-pointer">取消</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors cursor-pointer">{saving ? '儲存中...' : '儲存'}</button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700 block mb-1">{label}</span>
      {children}
    </label>
  )
}

const SELECT_CLS = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-blue-500'
const INPUT_CLS = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-blue-500'
const BTN_PRIMARY = 'bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer'
