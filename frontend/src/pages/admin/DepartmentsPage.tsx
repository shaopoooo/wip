import { useState, useEffect, useCallback } from 'react'
import { departmentsApi, Department } from '../../api/admin'
import { useTableControls } from '../../hooks/useTableControls'
import { TableControls } from '../../components/TableControls'

export function DepartmentsPage() {
  const [items, setItems] = useState<Department[]>([])
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Department | null>(null)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try { setItems(await departmentsApi.list()) } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const tc = useTableControls(items, (item, q) =>
    item.name.toLowerCase().includes(q) || item.code.toLowerCase().includes(q),
  )

  const openCreate = () => { setEditing(null); setName(''); setCode(''); setError(null); setShowModal(true) }
  const openEdit = (d: Department) => { setEditing(d); setName(d.name); setCode(d.code); setError(null); setShowModal(true) }

  const handleSave = async () => {
    if (!name.trim() || !code.trim()) { setError('請填寫產線名稱與代碼'); return }
    setSaving(true); setError(null)
    try {
      if (editing) {
        await departmentsApi.update(editing.id, { name, code })
      } else {
        await departmentsApi.create({ name, code })
      }
      setShowModal(false); load()
    } catch (err) { setError((err as Error).message) }
    finally { setSaving(false) }
  }

  const handleDelete = async (id: string, deptName: string) => {
    if (!confirm(`確定刪除產線「${deptName}」？`)) return
    try { await departmentsApi.delete(id); load() }
    catch (err) { alert((err as Error).message) }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-slate-800">產線管理</h1>
        <button onClick={openCreate} className={BTN_PRIMARY}>+ 新增產線</button>
      </div>

      <TableControls
        search={tc.search} onSearch={tc.setSearch}
        total={tc.total} page={tc.page} totalPages={tc.totalPages}
        setPage={tc.setPage} pageSize={tc.pageSize} onPageSize={tc.setPageSize}
        placeholder="搜尋產線名稱或代碼..."
      />

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">代碼</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">產線名稱</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={3} className="text-center py-10 text-slate-400">載入中...</td></tr>}
            {!loading && tc.visible.length === 0 && <tr><td colSpan={3} className="text-center py-10 text-slate-400">尚無產線</td></tr>}
            {tc.visible.map(item => (
              <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3 font-mono font-semibold text-slate-700">{item.code}</td>
                <td className="px-4 py-3 text-slate-800">{item.name}</td>
                <td className="px-4 py-3 text-right space-x-3">
                  <button onClick={() => openEdit(item)} className="text-blue-600 hover:text-blue-800 text-xs font-medium cursor-pointer">編輯</button>
                  <button onClick={() => handleDelete(item.id, item.name)} className="text-red-500 hover:text-red-700 text-xs font-medium cursor-pointer">刪除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h2 className="font-bold text-slate-800 text-lg">{editing ? '編輯產線' : '新增產線'}</h2>
            <div className="space-y-3">
              <Field label="產線名稱"><input value={name} onChange={e => setName(e.target.value)} className={INPUT_CLS} placeholder="主產線" /></Field>
              <Field label="代碼"><input value={code} onChange={e => setCode(e.target.value)} className={INPUT_CLS} placeholder="MAIN" /></Field>
            </div>
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowModal(false)} className="flex-1 border border-slate-300 text-slate-600 py-2.5 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-colors cursor-pointer">取消</button>
              <button onClick={handleSave} disabled={saving} className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors cursor-pointer">{saving ? '儲存中...' : '儲存'}</button>
            </div>
          </div>
        </div>
      )}
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

const INPUT_CLS = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-blue-500'
const BTN_PRIMARY = 'bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer'
