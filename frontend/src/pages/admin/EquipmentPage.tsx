import { useState, useEffect, useCallback } from 'react'
import {
  equipmentApi, stationsApi, departmentsApi, deviceTokensApi,
  Equipment, Station, Department, DeviceToken,
} from '../../api/admin'
import { useServerTable } from '../../hooks/useServerTable'
import { TableControls } from '../../components/TableControls'

type Tab = 'equipment' | 'tokens'

export function EquipmentPage() {
  const st = useServerTable<Equipment>({ defaultLimit: 25 })
  const [tab, setTab] = useState<Tab>('equipment')
  const [depts, setDepts] = useState<Department[]>([])
  const [selectedDept, setSelectedDept] = useState('')
  const [stations, setStations] = useState<Station[]>([])
  const [selectedStation, setSelectedStation] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('active')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Equipment | null>(null)

  useEffect(() => {
    departmentsApi.list().then(d => {
      setDepts(d)
      if (d.length > 0) setSelectedDept(d[0]!.id)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!selectedDept) return
    stationsApi.listAll(selectedDept).then(d => {
      setStations(d)
      setSelectedStation(d[0]?.id ?? '')
    }).catch(() => {})
  }, [selectedDept])

  const load = useCallback(async () => {
    if (!selectedStation) return
    st.setLoading(true)
    try {
      const result = await equipmentApi.list(selectedStation, {
        ...st.params,
        isActive: statusFilter !== 'all' ? (statusFilter === 'active' ? 'true' : 'false') : undefined,
      })
      st.setData(result.items, result.total)
    } catch { st.setData([], 0) } finally { st.setLoading(false) }
  }, [st.params, selectedStation, statusFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void load() }, [load])

  const handleStatusChange = (val: string) => {
    setStatusFilter(val as typeof statusFilter)
    st.setPage(1)
  }
  const handleStationChange = (val: string) => { setSelectedStation(val); st.setPage(1) }

  const handleDelete = async (id: string) => {
    if (!confirm('確定停用此設備？')) return
    await equipmentApi.delete(id)
    void load()
  }

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold text-slate-800 mb-4">設備管理</h1>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit mb-5">
        <button onClick={() => setTab('equipment')} className={TAB_CLS(tab === 'equipment')}>設備管理</button>
        <button onClick={() => setTab('tokens')} className={TAB_CLS(tab === 'tokens')}>裝置序號</button>
      </div>

      {tab === 'equipment' && (
        <>
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-3">
              <select value={selectedDept} onChange={e => setSelectedDept(e.target.value)} className={SELECT_CLS}>
                {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              <select value={selectedStation} onChange={e => handleStationChange(e.target.value)} className={SELECT_CLS}>
                {stations.length === 0 && <option value="">（無站點）</option>}
                {stations.map(s => <option key={s.id} value={s.id}>{s.name}{!s.isActive ? ' [停用]' : ''}</option>)}
              </select>
              <select value={statusFilter} onChange={e => handleStatusChange(e.target.value)} className={SELECT_CLS} style={{ width: 100 }}>
                <option value="all">全部</option>
                <option value="active">啟用中</option>
                <option value="inactive">已停用</option>
              </select>
            </div>
            <button onClick={() => { setEditing(null); setShowModal(true) }} className={BTN_PRIMARY}>+ 新增設備</button>
          </div>

          <TableControls
            search={st.search} onSearch={st.setSearch}
            total={st.total} page={st.page} totalPages={st.totalPages}
            setPage={st.setPage} pageSize={st.limit} onPageSize={st.setLimit}
            placeholder="搜尋設備名稱、型號或序號..."
          />

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">設備名稱</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">型號</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">序號</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">備註</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">狀態</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {st.loading && <tr><td colSpan={6} className="text-center py-10 text-slate-400">載入中...</td></tr>}
                {!st.loading && st.items.length === 0 && <tr><td colSpan={6} className="text-center py-10 text-slate-400">此站點尚無設備</td></tr>}
                {st.items.map(item => (
                  <tr key={item.id} className={`border-b border-slate-100 hover:bg-slate-50 ${!item.isActive ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3 font-medium text-slate-800">{item.name}</td>
                    <td className="px-4 py-3 text-slate-600">{item.model ?? '—'}</td>
                    <td className="px-4 py-3 font-mono text-slate-600">{item.serialNumber ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-500 max-w-xs truncate">{item.notes ?? '—'}</td>
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
            <EquipmentModal
              stations={stations.filter(s => s.isActive)}
              defaultStationId={selectedStation}
              equipment={editing}
              onClose={() => setShowModal(false)}
              onSaved={() => { setShowModal(false); void load() }}
            />
          )}
        </>
      )}

      {tab === 'tokens' && <DeviceTokensTab />}
    </div>
  )
}

// ── Equipment Modal ────────────────────────────────────────────────────────────

function EquipmentModal({ stations, defaultStationId, equipment, onClose, onSaved }: {
  stations: Station[]; defaultStationId: string; equipment: Equipment | null
  onClose: () => void; onSaved: () => void
}) {
  const [stationId, setStationId] = useState(equipment?.stationId ?? defaultStationId)
  const [name, setName] = useState(equipment?.name ?? '')
  const [model, setModel] = useState(equipment?.model ?? '')
  const [serialNumber, setSerialNumber] = useState(equipment?.serialNumber ?? '')
  const [notes, setNotes] = useState(equipment?.notes ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!name.trim()) { setError('請填寫設備名稱'); return }
    setSaving(true); setError(null)
    try {
      if (equipment) {
        await equipmentApi.update(equipment.id, { name, model: model || null, serialNumber: serialNumber || null, notes: notes || null })
      } else {
        await equipmentApi.create({ stationId, name, model: model || null, serialNumber: serialNumber || null, notes: notes || null })
      }
      onSaved()
    } catch (err) { setError((err as Error).message) }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
        <h2 className="font-bold text-slate-800 text-lg">{equipment ? '編輯設備' : '新增設備'}</h2>
        <div className="space-y-3">
          {!equipment && (
            <Field label="站點">
              <select value={stationId} onChange={e => setStationId(e.target.value)} className={SELECT_CLS}>
                {stations.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
          )}
          <Field label="設備名稱"><input value={name} onChange={e => setName(e.target.value)} className={INPUT_CLS} /></Field>
          <Field label="型號（選填）"><input value={model} onChange={e => setModel(e.target.value)} className={INPUT_CLS} /></Field>
          <Field label="序號（選填）"><input value={serialNumber} onChange={e => setSerialNumber(e.target.value)} className={INPUT_CLS} /></Field>
          <Field label="備註（選填）"><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className={INPUT_CLS} /></Field>
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

// ── Device Tokens Tab ──────────────────────────────────────────────────────────

function DeviceTokensTab() {
  const st = useServerTable<DeviceToken>({ defaultLimit: 25 })
  const [showModal, setShowModal] = useState(false)
  const [count, setCount] = useState(1)
  const [generating, setGenerating] = useState(false)
  const [newTokens, setNewTokens] = useState<DeviceToken[]>([])
  const [statusFilter, setStatusFilter] = useState<'all' | 'unused' | 'used'>('all')
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    st.setLoading(true)
    try {
      const isUsed = statusFilter === 'all' ? undefined : statusFilter === 'used' ? 'true' : 'false'
      const result = await deviceTokensApi.list({ ...st.params, isUsed })
      st.setData(result.items, result.total)
    } catch { } finally { st.setLoading(false) }
  }, [st.params, statusFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void load() }, [load])

  const handleStatusChange = (val: string) => {
    setStatusFilter(val as typeof statusFilter)
    st.setPage(1)
  }

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

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <select value={statusFilter} onChange={e => handleStatusChange(e.target.value)} className={SELECT_CLS} style={{ width: 110 }}>
            <option value="all">全部</option>
            <option value="unused">未使用</option>
            <option value="used">已使用</option>
          </select>
          <span className="text-slate-500 text-sm">每組序號只能綁定一個裝置，使用後即失效</span>
        </div>
        <button onClick={() => { setNewTokens([]); setError(null); setCount(1); setShowModal(true) }} className={BTN_PRIMARY}>
          + 批量產生序號
        </button>
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
              <th className="text-left px-4 py-3 font-semibold text-slate-600">瀏覽器</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">產生時間</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">使用時間</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {st.loading && <tr><td colSpan={7} className="text-center py-10 text-slate-400">載入中...</td></tr>}
            {!st.loading && st.items.length === 0 && <tr><td colSpan={7} className="text-center py-10 text-slate-400">尚無序號</td></tr>}
            {st.items.map(item => (
              <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3 font-mono font-bold text-slate-800 tracking-widest">{item.token}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${item.isUsed ? 'bg-slate-100 text-slate-500' : 'bg-emerald-100 text-emerald-700'}`}>
                    {item.isUsed ? '已使用' : '未使用'}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600">{item.deviceName ?? '—'}</td>
                <td className="px-4 py-3 text-slate-500 text-xs truncate max-w-[250px]" title={item.userAgent ?? ''}>{item.userAgent ?? '—'}</td>
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
                  <input type="number" min={1} max={20} value={count}
                    onChange={e => setCount(Math.min(20, Math.max(1, Number(e.target.value))))}
                    className={INPUT_CLS} />
                </div>
                {error && <p className="text-red-600 text-sm">{error}</p>}
                <div className="flex gap-3 pt-2">
                  <button onClick={() => setShowModal(false)} className="flex-1 border border-slate-300 text-slate-600 py-2.5 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-colors cursor-pointer">取消</button>
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
                      <button onClick={() => navigator.clipboard.writeText(t.token)} className="text-xs text-slate-500 hover:text-slate-800 cursor-pointer">複製</button>
                    </div>
                  ))}
                </div>
                <button onClick={() => setShowModal(false)} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors cursor-pointer">完成</button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false })
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700 block mb-1">{label}</span>
      {children}
    </label>
  )
}

const TAB_CLS = (active: boolean) => `px-4 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer ${active ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`
const SELECT_CLS = 'border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-blue-500'
const INPUT_CLS = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-blue-500'
const BTN_PRIMARY = 'bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer'
