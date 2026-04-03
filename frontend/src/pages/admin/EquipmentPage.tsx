import { useState, useEffect, useCallback } from 'react'
import { equipmentApi, stationsApi, departmentsApi, Equipment, Station, Department } from '../../api/admin'

export function EquipmentPage() {
  const [depts, setDepts] = useState<Department[]>([])
  const [selectedDept, setSelectedDept] = useState('')
  const [stations, setStations] = useState<Station[]>([])
  const [selectedStation, setSelectedStation] = useState('')
  const [items, setItems] = useState<Equipment[]>([])
  const [loading, setLoading] = useState(false)
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
    stationsApi.listByDept(selectedDept).then(d => {
      const active = d.filter(s => s.isActive)
      setStations(active)
      setSelectedStation(active[0]?.id ?? '')
    }).catch(() => {})
  }, [selectedDept])

  const load = useCallback(async () => {
    if (!selectedStation) return
    setLoading(true)
    try {
      const data = await equipmentApi.listByStation(selectedStation)
      setItems(data)
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [selectedStation])

  useEffect(() => { load() }, [load])

  const handleDelete = async (id: string) => {
    if (!confirm('確定停用此設備？')) return
    await equipmentApi.delete(id)
    load()
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-slate-800">設備管理</h1>
        <button onClick={() => { setEditing(null); setShowModal(true) }} className={BTN_PRIMARY}>+ 新增設備</button>
      </div>

      <div className="flex gap-3 mb-4">
        <select value={selectedDept} onChange={e => setSelectedDept(e.target.value)} className={SELECT_CLS}>
          {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select value={selectedStation} onChange={e => setSelectedStation(e.target.value)} className={SELECT_CLS}>
          {stations.length === 0 && <option value="">（無站點）</option>}
          {stations.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">設備名稱</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">型號</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">序號</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={4} className="text-center py-10 text-slate-400">載入中...</td></tr>}
            {!loading && items.length === 0 && <tr><td colSpan={4} className="text-center py-10 text-slate-400">此站點尚無設備</td></tr>}
            {items.map(item => (
              <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-800">{item.name}</td>
                <td className="px-4 py-3 text-slate-600">{item.model ?? '—'}</td>
                <td className="px-4 py-3 font-mono text-slate-600">{item.serialNumber ?? '—'}</td>
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
        <EquipmentModal
          stations={stations}
          defaultStationId={selectedStation}
          equipment={editing}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load() }}
        />
      )}
    </div>
  )
}

function EquipmentModal({ stations, defaultStationId, equipment, onClose, onSaved }: {
  stations: Station[]; defaultStationId: string; equipment: Equipment | null
  onClose: () => void; onSaved: () => void
}) {
  const [stationId, setStationId] = useState(equipment?.stationId ?? defaultStationId)
  const [name, setName] = useState(equipment?.name ?? '')
  const [model, setModel] = useState(equipment?.model ?? '')
  const [serialNumber, setSerialNumber] = useState(equipment?.serialNumber ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!name.trim()) { setError('請填寫設備名稱'); return }
    setSaving(true); setError(null)
    try {
      if (equipment) {
        await equipmentApi.update(equipment.id, { name, model: model || null, serialNumber: serialNumber || null })
      } else {
        await equipmentApi.create({ stationId, name, model: model || null, serialNumber: serialNumber || null })
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
              <select value={stationId} onChange={e => setStationId(e.target.value)} className={SELECT_CLS}>{stations.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
            </Field>
          )}
          <Field label="設備名稱"><input value={name} onChange={e => setName(e.target.value)} className={INPUT_CLS} /></Field>
          <Field label="型號（選填）"><input value={model} onChange={e => setModel(e.target.value)} className={INPUT_CLS} /></Field>
          <Field label="序號（選填）"><input value={serialNumber} onChange={e => setSerialNumber(e.target.value)} className={INPUT_CLS} /></Field>
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
