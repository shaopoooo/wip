import { useState } from 'react'
import { Modal } from './Modal'
import { workOrdersApi, SplitChildResult } from '../api/admin'

interface SplitChild {
  plannedQty: string
  priority: 'normal' | 'urgent'
  dueDate: string
}

interface Props {
  open: boolean
  onClose: () => void
  workOrderId: string
  orderNumber: string
  totalQty: number
  onSuccess: () => void
}

const REASON_LABEL: Record<string, string> = {
  rush: '急件抽出',
  batch_shipment: '分批出貨',
}

function blankChild(): SplitChild {
  return { plannedQty: '', priority: 'normal', dueDate: '' }
}

export function SplitModal({ open, onClose, workOrderId, orderNumber, totalQty, onSuccess }: Props) {
  const [reason, setReason] = useState<'rush' | 'batch_shipment'>('rush')
  const [note, setNote] = useState('')
  const [children, setChildren] = useState<SplitChild[]>([blankChild(), blankChild()])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<SplitChildResult[] | null>(null)

  const qtySum = children.reduce((s, c) => s + (parseInt(c.plannedQty, 10) || 0), 0)
  const qtyOk = qtySum === totalQty

  function updateChild(i: number, field: keyof SplitChild, value: string) {
    setChildren(prev => prev.map((c, idx) => idx === i ? { ...c, [field]: value } : c))
  }

  function addChild() {
    setChildren(prev => [...prev, blankChild()])
  }

  function removeChild(i: number) {
    if (children.length <= 2) return
    setChildren(prev => prev.filter((_, idx) => idx !== i))
  }

  async function handleSubmit() {
    setError(null)
    if (!qtyOk) {
      setError(`數量總和 (${qtySum}) 不等於母單數量 (${totalQty})`)
      return
    }
    setSubmitting(true)
    try {
      const res = await workOrdersApi.split(workOrderId, {
        splitReason: reason,
        splitNote: note.trim() || undefined,
        children: children.map(c => ({
          plannedQty: parseInt(c.plannedQty, 10),
          priority: c.priority,
          dueDate: c.dueDate || null,
        })),
      })
      setResult(res.children)
      onSuccess()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '拆單失敗，請稍後再試'
      setError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  function handleClose() {
    if (submitting) return
    setReason('rush')
    setNote('')
    setChildren([blankChild(), blankChild()])
    setError(null)
    setResult(null)
    onClose()
  }

  // ── Result view (after successful split) ──────────────────────────────────────

  if (result) {
    return (
      <Modal open={open} title="拆單完成" onClose={handleClose} size="lg">
        <p className="text-sm text-slate-600 mb-4">
          已成功拆分 <span className="font-mono font-bold">{orderNumber}</span>，建立 {result.length} 張子單。
        </p>
        <div className="space-y-4">
          {result.map(child => (
            <div key={child.id} className="border border-slate-200 rounded-xl p-4 flex gap-4 items-start">
              <img src={child.qrDataUrl} alt={child.orderNumber} className="w-24 h-24 shrink-0" />
              <div>
                <p className="font-mono font-bold text-slate-800">{child.orderNumber}</p>
                <p className="text-sm text-slate-500 mt-1">數量：{child.plannedQty}</p>
                <p className="text-sm text-slate-500">
                  優先級：{child.priority === 'urgent' ? '急件' : '普通'}
                </p>
                {child.dueDate && (
                  <p className="text-sm text-slate-500">交期：{child.dueDate}</p>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={() => window.print()}
            className="border border-slate-300 text-slate-700 hover:bg-slate-50 px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-colors"
          >
            列印子單 QR Code
          </button>
          <button
            onClick={handleClose}
            className="bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-colors"
          >
            關閉
          </button>
        </div>
      </Modal>
    )
  }

  // ── Input form ────────────────────────────────────────────────────────────────

  return (
    <Modal open={open} title={`拆單 — ${orderNumber}`} onClose={handleClose} size="lg">
      <div className="space-y-5">
        {/* Reason */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1.5">拆單原因</label>
          <div className="flex gap-3">
            {(['rush', 'batch_shipment'] as const).map(r => (
              <button
                key={r}
                onClick={() => setReason(r)}
                className={`flex-1 py-2 rounded-lg border text-sm font-semibold transition-colors cursor-pointer ${
                  reason === r
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {REASON_LABEL[r]}
              </button>
            ))}
          </div>
        </div>

        {/* Note */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1.5">備注（選填）</label>
          <input
            type="text"
            value={note}
            onChange={e => setNote(e.target.value)}
            maxLength={500}
            placeholder="如需說明原因可填寫"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Children */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-semibold text-slate-700">子單配置</label>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
              qtyOk ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
            }`}>
              總和 {qtySum} / {totalQty}
            </span>
          </div>

          <div className="space-y-3">
            {children.map((child, i) => (
              <div key={i} className="flex gap-2 items-start bg-slate-50 p-3 rounded-lg">
                <span className="w-5 h-5 bg-slate-300 text-slate-700 text-xs rounded-full flex items-center justify-center font-bold shrink-0 mt-1.5">
                  {String.fromCharCode(65 + i)}
                </span>
                <div className="flex-1 grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">數量 *</label>
                    <input
                      type="number"
                      min={1}
                      value={child.plannedQty}
                      onChange={e => updateChild(i, 'plannedQty', e.target.value)}
                      className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">優先級</label>
                    <select
                      value={child.priority}
                      onChange={e => updateChild(i, 'priority', e.target.value)}
                      className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="normal">普通</option>
                      <option value="urgent">急件</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">交期（選填）</label>
                    <input
                      type="date"
                      value={child.dueDate}
                      onChange={e => updateChild(i, 'dueDate', e.target.value)}
                      className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                {children.length > 2 && (
                  <button
                    onClick={() => removeChild(i)}
                    className="text-slate-400 hover:text-red-500 text-lg leading-none mt-1 shrink-0 cursor-pointer"
                    aria-label="移除"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>

          <button
            onClick={addChild}
            className="mt-2 text-sm text-blue-600 hover:text-blue-800 font-semibold cursor-pointer"
          >
            + 新增子單
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">
            {error}
          </div>
        )}

        {/* Warning */}
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs px-3 py-2 rounded-lg">
          注意：拆單後母單 QR Code 將立即失效，操作不可逆。
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={handleClose}
            disabled={submitting}
            className="border border-slate-300 text-slate-700 hover:bg-slate-50 px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-colors disabled:opacity-50"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !qtyOk}
            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-colors disabled:opacity-50"
          >
            {submitting ? '處理中...' : '確認拆單'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
