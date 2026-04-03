import { useState } from 'react'

import { scanApi, type StationLog } from '../api'
import { getStoredDeviceId } from '../hooks/useDevice'
import { Modal } from '../components/Modal'

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  in_progress: '作業中',
  completed:   '已完成',
  auto_filled: '自動補填',
  abnormal:    '異常',
}

const STATUS_BADGE: Record<string, string> = {
  in_progress: 'bg-blue-100 text-blue-700',
  completed:   'bg-emerald-100 text-emerald-700',
  auto_filled: 'bg-amber-100 text-amber-800',
  abnormal:    'bg-red-100 text-red-700',
}

function formatDisplay(iso: string) {
  return new Date(iso).toLocaleString('zh-TW', {
    timeZone: 'Asia/Taipei',
    month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
    hour12: false,
  })
}

/** 將 Asia/Taipei 的 datetime-local 字串轉為 UTC ISO string */
function localToUtcIso(local: string): string {
  // local = "YYYY-MM-DDTHH:MM"，台灣 UTC+8
  const d = new Date(local + ':00+08:00')
  return d.toISOString()
}

/** 將 UTC ISO string 轉為 datetime-local input 的值（Taiwan 時間） */
function isoToLocal(iso: string): string {
  const d = new Date(iso)
  const offset = 8 * 60
  const local = new Date(d.getTime() + offset * 60 * 1000)
  return local.toISOString().slice(0, 16)
}

// ── CorrectionPage ────────────────────────────────────────────────────────────

export function CorrectionPage() {

  const deviceId = getStoredDeviceId()

  const [orderInput, setOrderInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [logs, setLogs] = useState<StationLog[] | null>(null)
  const [orderNumber, setOrderNumber] = useState<string | null>(null)

  const [selected, setSelected] = useState<StationLog | null>(null)
  const [editIn, setEditIn] = useState(false)
  const [editOut, setEditOut] = useState(false)
  const [formIn, setFormIn] = useState('')
  const [formOut, setFormOut] = useState('')
  const [formReason, setFormReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitDone, setSubmitDone] = useState(false)

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    const val = orderInput.trim()
    if (!val || !deviceId) return
    setLoading(true)
    setError(null)
    setLogs(null)
    setOrderNumber(null)
    try {
      const data = await scanApi.logs(val, deviceId)
      setLogs(data.logs)
      setOrderNumber(data.orderNumber)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const openCorrection = (log: StationLog) => {
    setSelected(log)
    setEditIn(false)
    setEditOut(false)
    setFormIn(isoToLocal(log.checkInTime))
    setFormOut(log.checkOutTime ? isoToLocal(log.checkOutTime) : '')
    setFormReason('')
    setSubmitError(null)
    setSubmitDone(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selected || !deviceId) return
    if (!formReason.trim()) { setSubmitError('請填寫修正原因'); return }

    setSubmitting(true)
    setSubmitError(null)
    try {
      await scanApi.correct(
        selected.id,
        {
          checkInTime: editIn && formIn ? localToUtcIso(formIn) : undefined,
          checkOutTime: editOut && formOut ? localToUtcIso(formOut) : undefined,
          reason: formReason.trim(),
        },
        deviceId,
      )
      setSubmitDone(true)
      // 重新載入 logs
      if (orderNumber) {
        const data = await scanApi.logs(orderNumber, deviceId)
        setLogs(data.logs)
      }
    } catch (err) {
      setSubmitError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-6 max-w-2xl mx-auto w-full">

        {/* Search */}
        <form onSubmit={handleSearch} className="flex gap-2 mb-6">
          <input
            value={orderInput}
            onChange={(e) => setOrderInput(e.target.value)}
            autoComplete="off"
            autoCapitalize="characters"
            placeholder="工單號碼 WO-FPC-2026-001"
            className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 text-base"
          />
          <button
            type="submit"
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-5 py-3 rounded-lg font-semibold transition-colors cursor-pointer"
          >
            查詢
          </button>
        </form>

        {/* Error */}
        {error && (
          <div className="bg-red-900/50 border border-red-700 text-red-200 rounded-xl px-4 py-3 mb-4 text-sm">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex justify-center py-12">
            <div className="w-10 h-10 border-4 border-slate-600 border-t-white rounded-full animate-spin" />
          </div>
        )}

        {/* Log list */}
        {logs && (
          <div>
            <p className="text-slate-400 text-sm mb-3">
              {orderNumber} — 共 {logs.length} 筆站別紀錄
            </p>
            {logs.length === 0 && (
              <p className="text-slate-500 text-center py-8">此工單尚無站別紀錄</p>
            )}
            <div className="space-y-2">
              {logs.map((log) => (
                <button
                  key={log.id}
                  onClick={() => openCorrection(log)}
                  className="w-full bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl px-4 py-3 text-left transition-colors cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-white font-semibold">{log.stationName}{log.stationCode ? ` · ${log.stationCode}` : ''}</p>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_BADGE[log.status] ?? 'bg-slate-600 text-slate-200'}`}>
                      {STATUS_LABEL[log.status] ?? log.status}
                    </span>
                  </div>
                  <p className="text-slate-400 text-sm mt-1">
                    入站：{formatDisplay(log.checkInTime)}
                    {log.checkOutTime ? `　出站：${formatDisplay(log.checkOutTime)}` : '　（尚未出站）'}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Correction Modal */}
      <Modal open={!!selected} onClose={() => !submitting && setSelected(null)} size="lg">
        {selected && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <p className="text-slate-500 text-xs font-semibold uppercase tracking-widest">時間補正</p>
              <p className="text-slate-900 font-bold text-lg mt-0.5">{selected.stationName}</p>
            </div>

            <div className="space-y-3">
              {/* 入站時間 */}
              <div className="border border-slate-200 rounded-xl p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-500 text-xs font-medium">入站時間</p>
                    <p className="text-slate-800 font-semibold text-sm mt-0.5">{formatDisplay(selected.checkInTime)}</p>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={editIn}
                      onChange={(e) => {
                        setEditIn(e.target.checked)
                        if (e.target.checked && !formIn) setFormIn(isoToLocal(selected.checkInTime))
                      }}
                      className="w-4 h-4 accent-blue-600 cursor-pointer"
                    />
                    <span className="text-slate-600 text-sm">修正</span>
                  </label>
                </div>
                {editIn && (
                  <input
                    type="datetime-local"
                    value={formIn}
                    onChange={(e) => setFormIn(e.target.value)}
                    className="mt-2 block w-full border border-blue-300 rounded-lg px-3 py-2 text-slate-800 text-base focus:outline-none focus:border-blue-500"
                  />
                )}
              </div>

              {/* 出站時間 */}
              <div className="border border-slate-200 rounded-xl p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-500 text-xs font-medium">出站時間</p>
                    <p className="text-slate-800 font-semibold text-sm mt-0.5">
                      {selected.checkOutTime ? formatDisplay(selected.checkOutTime) : '（尚未出站）'}
                    </p>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={editOut}
                      onChange={(e) => {
                        setEditOut(e.target.checked)
                        if (e.target.checked && !formOut && selected.checkOutTime) {
                          setFormOut(isoToLocal(selected.checkOutTime))
                        }
                      }}
                      className="w-4 h-4 accent-blue-600 cursor-pointer"
                    />
                    <span className="text-slate-600 text-sm">修正</span>
                  </label>
                </div>
                {editOut && (
                  <input
                    type="datetime-local"
                    value={formOut}
                    onChange={(e) => setFormOut(e.target.value)}
                    className="mt-2 block w-full border border-blue-300 rounded-lg px-3 py-2 text-slate-800 text-base focus:outline-none focus:border-blue-500"
                  />
                )}
              </div>

              {/* 原因 */}
              <label className="block">
                <span className="text-slate-600 text-sm font-medium">修正原因 <span className="text-red-500">*</span></span>
                <textarea
                  value={formReason}
                  onChange={(e) => setFormReason(e.target.value)}
                  rows={3}
                  placeholder="請說明補正原因，例如：漏掃描補填"
                  className="mt-1 block w-full border border-slate-300 rounded-lg px-3 py-2.5 text-slate-800 text-sm focus:outline-none focus:border-blue-500 resize-none"
                />
              </label>
            </div>

            {submitError && (
              <p className="text-red-600 text-sm">{submitError}</p>
            )}

            {submitDone && (
              <p className="text-emerald-600 text-sm font-semibold">✓ 補正成功</p>
            )}

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => setSelected(null)}
                disabled={submitting}
                className="flex-1 border border-slate-300 text-slate-600 hover:bg-slate-50 py-3 rounded-xl font-semibold transition-colors cursor-pointer disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-semibold transition-colors cursor-pointer disabled:opacity-50"
              >
                {submitting ? '送出中...' : '確認補正'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </>
  )
}
