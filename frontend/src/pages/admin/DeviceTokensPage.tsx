import { useState, useEffect, useCallback } from 'react'
import { deviceTokensApi, DeviceToken } from '../../api/admin'
import { useServerTable } from '../../hooks/useServerTable'
import { TableControls } from '../../components/TableControls'

export function DeviceTokensPage() {
  const st = useServerTable<DeviceToken>({ defaultLimit: 25 })
  const [isUsed, setIsUsed] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [count, setCount] = useState(1)
  const [generating, setGenerating] = useState(false)
  const [newTokens, setNewTokens] = useState<DeviceToken[]>([])
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    st.setLoading(true)
    try {
      const result = await deviceTokensApi.list({ ...st.params, isUsed: isUsed || undefined })
      st.setData(result.items, result.total)
    } catch { } finally { st.setLoading(false) }
  }, [st.params, isUsed]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void load() }, [load])

  const handleIsUsedChange = (val: string) => { setIsUsed(val); st.setPage(1) }

  const handleGenerate = async () => {
    if (count < 1 || count > 20) { setError('數量需介於 1 到 20'); return }
    setGenerating(true); setError(null)
    try {
      const created = await deviceTokensApi.generateBatch(count)
      setNewTokens(created)
      void load()
    } catch (err) { setError((err as Error).message) }
    finally { setGenerating(false) }
  }

  const handleRevoke = async (id: string, token: string) => {
    if (!confirm(`確定撤銷序號「${token}」？`)) return
    try { await deviceTokensApi.revoke(id); void load() }
    catch (err) { alert((err as Error).message) }
  }

  const handleCloseModal = () => { setShowModal(false); setNewTokens([]) }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800">裝置序號管理</h1>
          <p className="text-slate-500 text-sm mt-0.5">每組序號只能綁定一個裝置，使用後即失效</p>
        </div>
        <button onClick={() => { setNewTokens([]); setError(null); setCount(1); setShowModal(true) }} className={BTN_PRIMARY}>
          + 批量產生序號
        </button>
      </div>

      <div className="flex gap-3 mb-4">
        <select value={isUsed} onChange={e => handleIsUsedChange(e.target.value)} className={SELECT_CLS} style={{ width: 110 }}>
          <option value="">全部</option>
          <option value="false">未使用</option>
          <option value="true">已使用</option>
        </select>
      </div>

      <TableControls
        search={st.search} onSearch={st.setSearch}
        total={st.total} page={st.page} totalPages={st.totalPages}
        setPage={st.setPage} pageSize={st.limit} onPageSize={st.setLimit}
        placeholder="搜尋序號或裝置名稱..."
      />

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">序號</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">狀態</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">綁定裝置</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">產生時間</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">使用時間</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {st.loading && <tr><td colSpan={6} className="text-center py-10 text-slate-400">載入中...</td></tr>}
            {!st.loading && st.items.length === 0 && <tr><td colSpan={6} className="text-center py-10 text-slate-400">尚無序號，請批量產生</td></tr>}
            {st.items.map(item => (
              <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3 font-mono font-semibold text-slate-800 tracking-widest">{item.token}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    item.isUsed ? 'bg-slate-100 text-slate-500' : 'bg-emerald-100 text-emerald-700'
                  }`}>
                    {item.isUsed ? '已使用' : '未使用'}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600">{item.deviceName ?? '—'}</td>
                <td className="px-4 py-3 text-slate-500 text-xs">{formatDate(item.createdAt)}</td>
                <td className="px-4 py-3 text-slate-500 text-xs">{item.usedAt ? formatDate(item.usedAt) : '—'}</td>
                <td className="px-4 py-3 text-right">
                  {!item.isUsed && (
                    <button onClick={() => handleRevoke(item.id, item.token)} className="text-red-500 hover:text-red-700 text-xs font-medium cursor-pointer">撤銷</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            {newTokens.length === 0 ? (
              <>
                <h2 className="font-bold text-slate-800 text-lg">批量產生序號</h2>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">產生數量（1–20）</label>
                  <input
                    type="number" min={1} max={20}
                    value={count}
                    onChange={e => setCount(Math.min(20, Math.max(1, Number(e.target.value))))}
                    className={INPUT_CLS}
                  />
                </div>
                {error && <p className="text-red-600 text-sm">{error}</p>}
                <div className="flex gap-3 pt-2">
                  <button onClick={handleCloseModal} className="flex-1 border border-slate-300 text-slate-600 py-2.5 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-colors cursor-pointer">取消</button>
                  <button onClick={handleGenerate} disabled={generating} className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors cursor-pointer">{generating ? '產生中...' : '產生'}</button>
                </div>
              </>
            ) : (
              <>
                <h2 className="font-bold text-slate-800 text-lg">已產生 {newTokens.length} 組序號</h2>
                <p className="text-slate-500 text-sm">請將序號發放給裝置操作人員，每組只能使用一次。</p>
                <div className="bg-slate-50 rounded-xl p-4 space-y-2 max-h-72 overflow-y-auto">
                  {newTokens.map(t => (
                    <div key={t.id} className="flex items-center justify-between">
                      <span className="font-mono text-lg font-bold text-blue-700 tracking-widest">{t.token}</span>
                      <button
                        onClick={() => navigator.clipboard.writeText(t.token)}
                        className="text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
                      >
                        複製
                      </button>
                    </div>
                  ))}
                </div>
                <button onClick={handleCloseModal} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors cursor-pointer">完成</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false })
}

const SELECT_CLS = 'border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-blue-500'
const INPUT_CLS = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-blue-500'
const BTN_PRIMARY = 'bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer'
