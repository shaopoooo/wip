import { useState, useEffect, useCallback } from 'react'
import { rolesApi, Role } from '../../api/admin'

export function RolesPage() {
  const [items, setItems] = useState<Role[]>([])
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try { setItems(await rolesApi.list()) } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const handleCreate = async () => {
    if (!name.trim()) { setError('請填寫角色名稱'); return }
    setSaving(true); setError(null)
    try {
      await rolesApi.create({ name, description: description || undefined })
      setShowModal(false); setName(''); setDescription('')
      load()
    } catch (err) { setError((err as Error).message) }
    finally { setSaving(false) }
  }

  const handleDelete = async (id: string, roleName: string) => {
    if (!confirm(`確定刪除角色「${roleName}」？`)) return
    try { await rolesApi.delete(id); load() }
    catch (err) { alert((err as Error).message) }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-slate-800">角色管理</h1>
        <button onClick={() => setShowModal(true)} className={BTN_PRIMARY}>+ 新增角色</button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">角色名稱</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">說明</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={3} className="text-center py-10 text-slate-400">載入中...</td></tr>}
            {!loading && items.length === 0 && <tr><td colSpan={3} className="text-center py-10 text-slate-400">尚無角色</td></tr>}
            {items.map(item => (
              <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-800">{item.name}</td>
                <td className="px-4 py-3 text-slate-500">{item.description ?? '—'}</td>
                <td className="px-4 py-3 text-right">
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
            <h2 className="font-bold text-slate-800 text-lg">新增角色</h2>
            <div className="space-y-3">
              <Field label="角色名稱"><input value={name} onChange={e => setName(e.target.value)} className={INPUT_CLS} placeholder="manager" /></Field>
              <Field label="說明（選填）"><input value={description} onChange={e => setDescription(e.target.value)} className={INPUT_CLS} /></Field>
            </div>
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowModal(false)} className="flex-1 border border-slate-300 text-slate-600 py-2.5 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-colors cursor-pointer">取消</button>
              <button onClick={handleCreate} disabled={saving} className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors cursor-pointer">{saving ? '儲存中...' : '建立'}</button>
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
