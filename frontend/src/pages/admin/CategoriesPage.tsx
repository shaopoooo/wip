import { useState, useEffect, useCallback } from 'react'
import { categoriesApi, ProductCategory } from '../../api/admin'
import { useServerTable } from '../../hooks/useServerTable'
import { TableControls } from '../../components/TableControls'

export function CategoriesPage() {
  const st = useServerTable<ProductCategory>({ defaultLimit: 25 })
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<ProductCategory | null>(null)

  const load = useCallback(async () => {
    st.setLoading(true)
    try {
      const result = await categoriesApi.list(st.params)
      st.setData(result.items, result.total)
    } catch { } finally { st.setLoading(false) }
  }, [st.params]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void load() }, [load])

  const handleDelete = async (id: string) => {
    if (!confirm('確定停用此產品種類？')) return
    await categoriesApi.delete(id)
    void load()
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-slate-800">產品種類</h1>
        <button onClick={() => { setEditing(null); setShowModal(true) }} className={BTN_PRIMARY}>
          + 新增種類
        </button>
      </div>

      <TableControls
        search={st.search} onSearch={st.setSearch}
        total={st.total} page={st.page} totalPages={st.totalPages}
        setPage={st.setPage} pageSize={st.limit} onPageSize={st.setLimit}
        placeholder="搜尋名稱或代碼..."
      />

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">名稱</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">代碼</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">說明</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">排序</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {st.loading && <tr><td colSpan={5} className="text-center py-10 text-slate-400">載入中...</td></tr>}
            {!st.loading && st.items.length === 0 && <tr><td colSpan={5} className="text-center py-10 text-slate-400">尚無資料</td></tr>}
            {st.items.map(item => (
              <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-800">{item.name}</td>
                <td className="px-4 py-3 font-mono text-slate-600">{item.code ?? '—'}</td>
                <td className="px-4 py-3 text-slate-500">{item.description ?? '—'}</td>
                <td className="px-4 py-3 text-slate-500">{item.sortOrder}</td>
                <td className="px-4 py-3 text-right space-x-3">
                  <button onClick={() => { setEditing(item); setShowModal(true) }} className="text-blue-600 hover:text-blue-800 text-xs font-medium cursor-pointer">編輯</button>
                  <button onClick={() => handleDelete(item.id)} className="text-red-500 hover:text-red-700 text-xs font-medium cursor-pointer">停用</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <CategoryModal
          category={editing}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); void load() }}
        />
      )}
    </div>
  )
}

function CategoryModal({ category, onClose, onSaved }: {
  category: ProductCategory | null; onClose: () => void; onSaved: () => void
}) {
  const [name, setName] = useState(category?.name ?? '')
  const [code, setCode] = useState(category?.code ?? '')
  const [description, setDescription] = useState(category?.description ?? '')
  const [sortOrder, setSortOrder] = useState(category?.sortOrder ?? 0)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!name.trim()) { setError('請填寫名稱'); return }
    setSaving(true); setError(null)
    try {
      if (category) {
        await categoriesApi.update(category.id, { name, code: code || null, description: description || null, sortOrder })
      } else {
        await categoriesApi.create({ name, code: code || null, description: description || null, sortOrder })
      }
      onSaved()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
        <h2 className="font-bold text-slate-800 text-lg">{category ? '編輯種類' : '新增種類'}</h2>
        <div className="space-y-3">
          <Field label="名稱"><input value={name} onChange={e => setName(e.target.value)} className={INPUT_CLS} placeholder="軟板（FPC）" /></Field>
          <Field label="代碼（選填）"><input value={code} onChange={e => setCode(e.target.value)} className={INPUT_CLS} placeholder="FPC" /></Field>
          <Field label="說明（選填）"><input value={description} onChange={e => setDescription(e.target.value)} className={INPUT_CLS} /></Field>
          <Field label="排序"><input type="number" value={sortOrder} onChange={e => setSortOrder(Number(e.target.value))} className={INPUT_CLS} /></Field>
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

const INPUT_CLS = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-blue-500'
const BTN_PRIMARY = 'bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer'
