import { useState, useEffect, useCallback } from 'react'
import { vendorsApi, Vendor } from '../../api/admin'
import { useServerTable } from '../../hooks/useServerTable'
import { TableControls } from '../../components/TableControls'

export function VendorsPage() {
  const st = useServerTable<Vendor>({ defaultLimit: 25 })
  const [isActive, setIsActive] = useState('')
  const [needsReview, setNeedsReview] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Vendor | null>(null)

  const load = useCallback(async () => {
    st.setLoading(true)
    try {
      const result = await vendorsApi.list({
        ...st.params,
        isActive: isActive || undefined,
        needsReview: needsReview || undefined,
      })
      st.setData(result.items, result.total)
    } catch { } finally { st.setLoading(false) }
  }, [st.params, isActive, needsReview]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void load() }, [load])

  const handleIsActiveChange = (val: string) => { setIsActive(val); st.setPage(1) }
  const handleNeedsReviewChange = (val: string) => { setNeedsReview(val); st.setPage(1) }

  const handleDelete = async (id: string) => {
    if (!confirm('確定停用此廠商？')) return
    try { await vendorsApi.delete(id); void load() }
    catch (err) { alert((err as Error).message) }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-slate-800">委外廠商主檔</h1>
        <button onClick={() => { setEditing(null); setShowModal(true) }} className={BTN_PRIMARY}>+ 新增廠商</button>
      </div>

      <div className="flex gap-3 mb-4">
        <select value={isActive} onChange={e => handleIsActiveChange(e.target.value)} className={SELECT_CLS} style={{ width: 110 }}>
          <option value="">全部</option>
          <option value="true">啟用中</option>
          <option value="false">已停用</option>
        </select>
        <select value={needsReview} onChange={e => handleNeedsReviewChange(e.target.value)} className={SELECT_CLS} style={{ width: 130 }}>
          <option value="">全部審核狀態</option>
          <option value="true">需人工審核</option>
          <option value="false">已審核</option>
        </select>
      </div>

      <TableControls
        search={st.search} onSearch={st.setSearch}
        total={st.total} page={st.page} totalPages={st.totalPages}
        setPage={st.setPage} pageSize={st.limit} onPageSize={st.setLimit}
        placeholder="搜尋廠商名稱或代碼..."
      />

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">原始代碼</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">正規化名稱</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">來源標記</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">需審核</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">狀態</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {st.loading && <tr><td colSpan={6} className="text-center py-10 text-slate-400">載入中...</td></tr>}
            {!st.loading && st.items.length === 0 && <tr><td colSpan={6} className="text-center py-10 text-slate-400">尚無廠商</td></tr>}
            {st.items.map(item => (
              <tr key={item.id} className={`border-b border-slate-100 hover:bg-slate-50 ${!item.isActive ? 'opacity-50' : ''}`}>
                <td className="px-4 py-3 font-mono text-slate-700">{item.token}</td>
                <td className="px-4 py-3 text-slate-800 font-medium">{item.normalizedName}</td>
                <td className="px-4 py-3 text-slate-500 text-xs">{item.sourceFlags ?? '—'}</td>
                <td className="px-4 py-3">
                  {item.needsManualReview && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">需審核</span>
                  )}
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
        <VendorModal
          vendor={editing}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); void load() }}
        />
      )}
    </div>
  )
}

function VendorModal({ vendor, onClose, onSaved }: {
  vendor: Vendor | null; onClose: () => void; onSaved: () => void
}) {
  const [token, setToken] = useState(vendor?.token ?? '')
  const [normalizedName, setNormalizedName] = useState(vendor?.normalizedName ?? '')
  const [sourceFlags, setSourceFlags] = useState(vendor?.sourceFlags ?? '')
  const [needsManualReview, setNeedsManualReview] = useState(vendor?.needsManualReview ?? false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!token.trim() || !normalizedName.trim()) { setError('請填寫原始代碼與正規化名稱'); return }
    setSaving(true); setError(null)
    try {
      if (vendor) {
        await vendorsApi.update(vendor.id, { token, normalizedName, sourceFlags: sourceFlags || null, needsManualReview })
      } else {
        await vendorsApi.create({ token, normalizedName, sourceFlags: sourceFlags || null, needsManualReview })
      }
      onSaved()
    } catch (err) { setError((err as Error).message) }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
        <h2 className="font-bold text-slate-800 text-lg">{vendor ? '編輯廠商' : '新增廠商'}</h2>
        <div className="space-y-3">
          <Field label="原始代碼（token）"><input value={token} onChange={e => setToken(e.target.value)} className={INPUT_CLS} placeholder="VENDOR_001" /></Field>
          <Field label="正規化名稱"><input value={normalizedName} onChange={e => setNormalizedName(e.target.value)} className={INPUT_CLS} placeholder="XX 電子有限公司" /></Field>
          <Field label="來源標記（選填）"><input value={sourceFlags} onChange={e => setSourceFlags(e.target.value)} className={INPUT_CLS} /></Field>
          <Field label="需人工審核">
            <select value={String(needsManualReview)} onChange={e => setNeedsManualReview(e.target.value === 'true')} className={SELECT_CLS}>
              <option value="false">否</option>
              <option value="true">是</option>
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
