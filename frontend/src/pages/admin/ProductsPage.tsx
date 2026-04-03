import { useState, useEffect, useCallback } from 'react'
import { productsApi, departmentsApi, Product, Department } from '../../api/admin'

export function ProductsPage() {
  const [depts, setDepts] = useState<Department[]>([])
  const [selectedDept, setSelectedDept] = useState('')
  const [items, setItems] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)

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
      const data = await productsApi.listByDept(selectedDept)
      setItems(data)
    } finally {
      setLoading(false)
    }
  }, [selectedDept])

  useEffect(() => { load() }, [load])

  const handleDelete = async (id: string) => {
    if (!confirm('確定停用此產品？')) return
    await productsApi.delete(id)
    load()
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-slate-800">產品型號</h1>
        <button onClick={() => { setEditing(null); setShowModal(true) }} className={BTN_PRIMARY}>
          + 新增產品
        </button>
      </div>

      <div className="flex gap-3 mb-4">
        <select value={selectedDept} onChange={e => setSelectedDept(e.target.value)} className={SELECT_CLS}>
          {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">產品名稱</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">物料編號</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">說明</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={4} className="text-center py-10 text-slate-400">載入中...</td></tr>}
            {!loading && items.length === 0 && <tr><td colSpan={4} className="text-center py-10 text-slate-400">尚無產品</td></tr>}
            {items.map(item => (
              <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-800">{item.name}</td>
                <td className="px-4 py-3 font-mono text-slate-600">{item.modelNumber}</td>
                <td className="px-4 py-3 text-slate-500">{item.description ?? '—'}</td>
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
        <ProductModal
          depts={depts}
          defaultDeptId={selectedDept}
          product={editing}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load() }}
        />
      )}
    </div>
  )
}

function ProductModal({ depts, defaultDeptId, product, onClose, onSaved }: {
  depts: Department[]
  defaultDeptId: string
  product: Product | null
  onClose: () => void
  onSaved: () => void
}) {
  const [deptId, setDeptId] = useState(product?.departmentId ?? defaultDeptId)
  const [name, setName] = useState(product?.name ?? '')
  const [modelNumber, setModelNumber] = useState(product?.modelNumber ?? '')
  const [description, setDescription] = useState(product?.description ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!name.trim() || !modelNumber.trim()) { setError('請填寫產品名稱與物料編號'); return }
    setSaving(true)
    setError(null)
    try {
      if (product) {
        await productsApi.update(product.id, { name, modelNumber, description: description || null })
      } else {
        await productsApi.create({ departmentId: deptId, name, modelNumber, description: description || null })
      }
      onSaved()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalWrapper title={product ? '編輯產品' : '新增產品'}>
      <div className="space-y-3">
        {!product && (
          <Field label="部門">
            <select value={deptId} onChange={e => setDeptId(e.target.value)} className={SELECT_CLS}>{depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
          </Field>
        )}
        <Field label="產品名稱"><input value={name} onChange={e => setName(e.target.value)} className={INPUT_CLS} placeholder="FPC 軟板 A款" /></Field>
        <Field label="物料編號"><input value={modelNumber} onChange={e => setModelNumber(e.target.value)} className={INPUT_CLS} placeholder="FPC-A-001" /></Field>
        <Field label="說明（選填）"><input value={description} onChange={e => setDescription(e.target.value)} className={INPUT_CLS} /></Field>
      </div>
      {error && <p className="text-red-600 text-sm mt-3">{error}</p>}
      <ModalActions onClose={onClose} onSave={handleSave} saving={saving} />
    </ModalWrapper>
  )
}

// ── Shared ────────────────────────────────────────────────────────────────────

function ModalWrapper({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
        <h2 className="font-bold text-slate-800 text-lg">{title}</h2>
        {children}
      </div>
    </div>
  )
}

function ModalActions({ onClose, onSave, saving }: { onClose: () => void; onSave: () => void; saving: boolean }) {
  return (
    <div className="flex gap-3 pt-2">
      <button onClick={onClose} className="flex-1 border border-slate-300 text-slate-600 py-2.5 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-colors cursor-pointer">取消</button>
      <button onClick={onSave} disabled={saving} className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors cursor-pointer">{saving ? '儲存中...' : '儲存'}</button>
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
