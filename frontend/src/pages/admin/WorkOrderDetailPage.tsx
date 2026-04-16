import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { workOrdersApi, routesApi, WorkOrderDetail, ProcessStep } from '../../api/admin'
import { SplitModal } from '../../components/SplitModal'

const STATUS_LABEL: Record<string, string> = {
  pending: '待開工', in_progress: '進行中', manual_tracking: '人工追蹤', ready_to_ship: '待出貨', completed: '已完工', cancelled: '已取消', split: '已拆單',
}
const LOG_STATUS: Record<string, string> = {
  in_progress: '作業中', completed: '已完成', auto_filled: '自動補填', abnormal: '異常', split: '拆單結轉',
}
const LOG_COLOR: Record<string, string> = {
  in_progress: 'bg-blue-100 text-blue-700',
  completed: 'bg-emerald-100 text-emerald-700',
  auto_filled: 'bg-amber-100 text-amber-800',
  abnormal: 'bg-red-100 text-red-600',
  split: 'bg-purple-100 text-purple-700',
}

function formatTW(iso: string) {
  return new Date(iso).toLocaleString('zh-TW', {
    timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

export function WorkOrderDetailPage() {
  const { orderNumber: id } = useParams<{ orderNumber: string }>()
  const navigate = useNavigate()
  const [detail, setDetail] = useState<WorkOrderDetail | null>(null)
  const [qr, setQr] = useState<{ qrDataUrl: string; orderNumber: string } | null>(null)
  const [routeSteps, setRouteSteps] = useState<ProcessStep[]>([])
  const [loading, setLoading] = useState(true)
  const [statusChanging, setStatusChanging] = useState(false)
  const [splitOpen, setSplitOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false)
  const [shipOpen, setShipOpen] = useState(false)

  useEffect(() => {
    if (!id) return
    Promise.all([
      workOrdersApi.get(id),
      workOrdersApi.qrcode(id),
    ]).then(([d, q]) => {
      setDetail(d)
      setQr(q)
      if (d.workOrder.routeId) {
        routesApi.steps(d.workOrder.routeId).then(setRouteSteps).catch(() => {})
      }
    }).finally(() => setLoading(false))
  }, [id])

  const handleStatusChange = async (status: string) => {
    if (!id) return
    setStatusChanging(true)
    try {
      const updated = await workOrdersApi.updateStatus(id, status)
      setDetail(prev => prev ? { ...prev, workOrder: { ...prev.workOrder, status: updated.status } } : prev)
    } finally {
      setStatusChanging(false)
    }
  }

  const reload = () => {
    if (!id) return
    Promise.all([
      workOrdersApi.get(id),
      workOrdersApi.qrcode(id),
    ]).then(([d, q]) => {
      setDetail(d)
      setQr(q)
      if (d.workOrder.routeId) {
        routesApi.steps(d.workOrder.routeId).then(setRouteSteps).catch(() => {})
      }
    })
  }

  const handleSplitSuccess = () => reload()

  const handleManualLog = async (stationId: string, stationName: string, stepOrder: number) => {
    if (!id || !detail) return
    // Count how many preceding steps are uncompleted
    const uncompleted = routeSteps.filter(s =>
      s.stepOrder < stepOrder && !completedStationIds.has(s.stationName)
    )
    const autoFillMsg = uncompleted.length > 0
      ? `\n\n前方有 ${uncompleted.length} 個未完成站點（${uncompleted.map(s => s.stationName).join('、')}）將一併自動補填。`
      : ''
    if (!confirm(`確定為「${stationName}」新增已完成紀錄？${autoFillMsg}`)) return
    try {
      await workOrdersApi.addManualLog(id, { stationId })
      reload()
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : '新增失敗')
    }
  }

  const handlePrint = () => {
    if (!detail || !qr) return
    const { workOrder: w, product: p, route: r } = detail

    const stepsHtml = routeSteps.length > 0
      ? routeSteps.map(s =>
        `<tr><td class="c">${s.stepOrder}</td>` +
        `<td>${s.stationName}${s.stationCode ? ' (' + s.stationCode + ')' : ''}</td>` +
        `<td class="c">${s.standardTime != null ? s.standardTime + 's' : '-'}</td></tr>`
      ).join('')
      : '<tr><td colspan="3" style="padding:4px;text-align:center;color:#999">尚未設定</td></tr>'

    const esc = (s: string) => s.replace(/</g, '&lt;')

    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${w.orderNumber}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:"Microsoft JhengHei","PingFang TC",sans-serif;padding:10mm;font-size:11px;color:#333}
  @page{margin:8mm}
  .layout{display:flex;gap:12px}
  .left{flex:1;min-width:0}
  .right{width:200px;text-align:center;border-left:1px solid #ddd;padding-left:12px;display:flex;flex-direction:column;align-items:center}
  .right img{width:180px;height:180px}
  .right .num{font-family:monospace;font-weight:bold;font-size:12px;margin-top:4px}
  .right .product{font-size:10px;color:#666;margin-top:2px}
  .hdr{border-bottom:2px solid #333;padding-bottom:6px;margin-bottom:8px}
  .hdr h1{font-size:18px;display:inline}
  .hdr .urgent{color:red;font-weight:bold;font-size:12px;margin-left:8px}
  .hdr .sub{color:#666;font-size:10px;margin-top:1px}
  .sec{margin-bottom:8px}
  .sec-t{font-size:12px;font-weight:bold;border-bottom:1px solid #aaa;padding-bottom:2px;margin-bottom:4px}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:2px 12px}
  .grid .it label{color:#666;font-size:10px}
  .grid .it span{font-weight:500}
  .note{background:#f5f5f5;padding:3px 6px;border-radius:3px;margin-top:2px;white-space:pre-wrap;font-size:10px;line-height:1.4}
  table{width:100%;border-collapse:collapse;font-size:10px}
  th{background:#f0f0f0;padding:2px 6px;border:1px solid #ccc;font-weight:600}
  td{padding:2px 6px;border:1px solid #ccc}
  .c{text-align:center}
</style></head><body>

<div class="layout">
<div class="left">

<div class="hdr">
  <h1>${w.orderNumber}</h1>${w.priority === 'urgent' ? '<span class="urgent">!! 急件 !!</span>' : ''}
  <div class="sub">${esc(p.name)} — ${esc(p.modelNumber)}</div>
</div>

<div class="sec">
  <div class="sec-t">工單資訊</div>
  <div class="grid">
    <div class="it"><label>訂單數量</label><br><span>${w.orderQty ?? '-'}</span></div>
    <div class="it"><label>製作數量</label><br><span>${w.plannedQty}</span></div>
    <div class="it"><label>優先級</label><br><span>${w.priority === 'urgent' ? '急件' : '普通'}</span></div>
    <div class="it"><label>交期</label><br><span>${w.dueDate ?? '-'}</span></div>
    <div class="it"><label>狀態</label><br><span>${STATUS_LABEL[w.status] ?? w.status}</span></div>
    <div class="it"><label>建立時間</label><br><span>${formatTW(w.createdAt)}</span></div>
  </div>
  ${w.note ? '<div style="margin-top:3px"><label style="color:#666;font-size:10px">工單備註</label><div class="note">' + esc(w.note) + '</div></div>' : ''}
</div>

</div>
<div class="right">
  <img src="${qr.qrDataUrl}"/>
  <div class="num">${w.orderNumber}</div>
  <div class="product">${esc(p.modelNumber)}</div>
</div>
</div>

<div class="sec">
  <div class="sec-t">製程${r?.name ? ' — ' + esc(r.name) : ''}</div>
  ${r?.description ? '<div style="margin-bottom:4px"><label style="color:#666;font-size:10px">製程備註</label><div class="note">' + esc(r.description) + '</div></div>' : ''}
  ${p.description ? '<div style="margin-bottom:4px"><label style="color:#666;font-size:10px">料號備註</label><div class="note">' + esc(p.description) + '</div></div>' : ''}
  <table>
    <thead><tr><th class="c" style="width:35px">#</th><th>站點</th><th class="c" style="width:60px">工時</th></tr></thead>
    <tbody>${stepsHtml}</tbody>
  </table>
</div>

</body></html>`)
    win.document.close()
    win.onload = () => { win.print() }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-slate-300 border-t-blue-600 rounded-full animate-spin" />
      </div>
    )
  }

  if (!detail) {
    return <div className="p-6 text-slate-500">工單不存在</div>
  }

  const { workOrder: wo, product, route, logs } = detail
  const canManualLog = wo.status === 'manual_tracking'
  // Build a set of completed station names for route step progress overlay
  const completedStationIds = new Set(logs.filter(l => l.status === 'completed' || l.status === 'auto_filled').map(l => l.stationName))
  const inProgressStationNames = new Set(logs.filter(l => l.status === 'in_progress').map(l => l.stationName))

  return (
    <div className="p-6 max-w-4xl">
      {editOpen && (
        <EditWorkOrderModal
          workOrder={wo}
          onClose={() => setEditOpen(false)}
          onSaved={() => { setEditOpen(false); reload() }}
        />
      )}
      {id && (
        <SplitModal
          open={splitOpen}
          onClose={() => setSplitOpen(false)}
          workOrderId={id}
          orderNumber={wo.orderNumber}
          totalQty={wo.plannedQty}
          onSuccess={handleSplitSuccess}
        />
      )}
      <button onClick={() => navigate('/admin/work-orders')} className="text-slate-500 hover:text-slate-800 text-sm mb-4 cursor-pointer transition-colors">
        ← 返回工單列表
      </button>

      <div className="space-y-6">
          {/* Header */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="font-mono font-bold text-xl text-slate-800">{wo.orderNumber}</p>
                <p className="text-slate-500 text-sm mt-0.5">{product.name} — {product.modelNumber}</p>
              </div>
              <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                wo.status === 'completed' ? 'bg-emerald-100 text-emerald-700'
                : wo.status === 'in_progress' ? 'bg-blue-100 text-blue-700'
                : wo.status === 'manual_tracking' ? 'bg-violet-100 text-violet-700'
                : wo.status === 'ready_to_ship' ? 'bg-orange-100 text-orange-700'
                : wo.status === 'cancelled' ? 'bg-red-100 text-red-600'
                : 'bg-slate-100 text-slate-600'
              }`}>
                {STATUS_LABEL[wo.status] ?? wo.status}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <InfoRow label="訂單數量" value={wo.orderQty != null ? String(wo.orderQty) : '—'} />
              <InfoRow label="製作數量" value={String(wo.plannedQty)} />
              <InfoRow label="優先級" value={wo.priority === 'urgent' ? '急件' : '普通'} />
              <InfoRow label="製程" value={route?.name ?? '—'} />
              <InfoRow label="交期" value={wo.dueDate ?? '—'} />
              <InfoRow label="建立時間" value={formatTW(wo.createdAt)} />
            </div>

            {wo.note && (
              <div className="mt-3 pt-3 border-t border-slate-100">
                <p className="text-slate-500 text-xs mb-1">工單備註</p>
                <p className="text-slate-700 text-sm whitespace-pre-wrap bg-slate-50 rounded-lg px-3 py-2">{wo.note}</p>
              </div>
            )}
            {(route?.description || product.description) && (
              <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
                {route?.description && (
                  <div>
                    <p className="text-slate-500 text-xs mb-1">製程備註</p>
                    <p className="text-slate-700 text-sm whitespace-pre-wrap bg-slate-50 rounded-lg px-3 py-2">{route.description}</p>
                  </div>
                )}
                {product.description && (
                  <div>
                    <p className="text-slate-500 text-xs mb-1">料號備註</p>
                    <p className="text-slate-700 text-sm whitespace-pre-wrap bg-slate-50 rounded-lg px-3 py-2">{product.description}</p>
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            {!['completed', 'split', 'cancelled'].includes(wo.status) && (
              <div className="mt-4 pt-4 border-t border-slate-100 flex gap-2">
                <button
                  onClick={() => setEditOpen(true)}
                  className="border border-blue-300 text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                >
                  編輯
                </button>
                <button
                  onClick={handlePrint}
                  className="border border-slate-300 text-slate-600 hover:bg-slate-50 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                >
                  列印工單
                </button>
                <button
                  onClick={() => setSplitOpen(true)}
                  className="border border-amber-400 text-amber-700 hover:bg-amber-50 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                >
                  拆單
                </button>
              </div>
            )}
          </div>

          {/* Route steps progress */}
          {routeSteps.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-2 flex-wrap">
                <h2 className="font-semibold text-slate-800">預計製程（{routeSteps.length} 步驟）</h2>
                <div className="flex items-center gap-2">
                  {canManualLog && <span className="text-xs text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full font-medium">點擊未完成站點新增歷程</span>}
                  {!['completed', 'cancelled', 'split', 'ready_to_ship'].includes(wo.status) && (
                    wo.status !== 'manual_tracking' ? (
                      <button
                        onClick={() => {
                          if (confirm('切換為「人工追蹤」後，可直接點選製程站點新增歷程。確定切換？')) {
                            handleStatusChange('manual_tracking')
                          }
                        }}
                        disabled={statusChanging}
                        className="border border-violet-300 text-violet-600 hover:bg-violet-50 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                      >
                        切為人工追蹤
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          if (confirm('確定切回「進行中」？切回後需透過掃描 QR Code 報工。')) {
                            handleStatusChange('in_progress')
                          }
                        }}
                        disabled={statusChanging}
                        className="border border-blue-300 text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                      >
                        切回進行中
                      </button>
                    )
                  )}
                  {wo.status === 'ready_to_ship' && (
                    <button
                      onClick={() => setShipOpen(true)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                    >
                      出貨
                    </button>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 p-4">
                {routeSteps.map((step, i) => {
                  const done = completedStationIds.has(step.stationName)
                  const active = inProgressStationNames.has(step.stationName)
                  const canClick = canManualLog && !done
                  return (
                    <div key={step.id} className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={!canClick}
                        onClick={() => canClick && handleManualLog(step.stationId, step.stationName, step.stepOrder)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                          done ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                          : active ? 'bg-blue-50 border-blue-300 text-blue-700'
                          : canClick ? 'bg-violet-50 border-violet-300 text-violet-700 hover:bg-violet-100 cursor-pointer'
                          : 'bg-slate-50 border-slate-200 text-slate-500'
                        } ${!canClick ? 'cursor-default' : ''}`}
                      >
                        <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                          done ? 'bg-emerald-500 text-white'
                          : active ? 'bg-blue-500 text-white'
                          : canClick ? 'bg-violet-500 text-white'
                          : 'bg-slate-300 text-slate-600'
                        }`}>{step.stepOrder}</span>
                        <span>{step.stationName}</span>
                        {done && <span className="text-emerald-600">✓</span>}
                        {active && <span className="text-blue-500 animate-pulse">●</span>}
                        {canClick && !done && !active && <span className="text-violet-400">+</span>}
                      </button>
                      {i < routeSteps.length - 1 && <span className="text-slate-300 text-xs">→</span>}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Station logs */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="font-semibold text-slate-800">站點歷程（{logs.length} 筆）</h2>
            </div>
            {logs.length === 0 ? (
              <p className="text-center text-slate-400 py-10 text-sm">尚無站點紀錄</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600">站點</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600">入站</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600">出站</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600">數量</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600">狀態</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(log => (
                    <tr key={log.id} className="border-t border-slate-100">
                      <td className="px-4 py-3 text-slate-800 font-medium">{log.stationName}{log.stationCode ? ` (${log.stationCode})` : ''}</td>
                      <td className="px-4 py-3 text-slate-600">{formatTW(log.checkInTime)}</td>
                      <td className="px-4 py-3 text-slate-600">{log.checkOutTime ? formatTW(log.checkOutTime) : '—'}</td>
                      <td className="px-4 py-3 text-slate-600">{log.actualQtyOut ?? log.actualQtyIn ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${LOG_COLOR[log.status] ?? 'bg-slate-100 text-slate-600'}`}>
                          {LOG_STATUS[log.status] ?? log.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Cancel — separated at bottom to prevent accidental clicks */}
          {!['completed', 'split', 'cancelled'].includes(wo.status) && (
            <div className="border border-red-200 rounded-xl p-4 bg-red-50/30">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-red-700">危險操作</p>
                  <p className="text-xs text-red-500 mt-0.5">取消工單後無法復原，相關 QR Code 將失效</p>
                </div>
                <button
                  onClick={() => setCancelConfirmOpen(true)}
                  disabled={statusChanging}
                  className="border border-red-300 text-red-600 hover:bg-red-100 px-4 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                >
                  取消工單
                </button>
              </div>
            </div>
          )}

          {/* Cancel confirmation modal */}
          {cancelConfirmOpen && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
                <h2 className="font-bold text-red-700 text-lg">確認取消工單</h2>
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm space-y-1">
                  <p><span className="text-slate-500">工單號：</span><span className="font-mono font-semibold text-slate-800">{wo.orderNumber}</span></p>
                  <p><span className="text-slate-500">料號：</span><span className="font-mono text-slate-800">{product.modelNumber}</span></p>
                  <p><span className="text-slate-500">數量：</span><span className="text-slate-800">{wo.plannedQty}</span></p>
                  {wo.dueDate && <p><span className="text-slate-500">交期：</span><span className="text-slate-800">{wo.dueDate}</span></p>}
                  {wo.priority === 'urgent' && <p className="text-red-600 font-semibold">⚠ 此為急件工單</p>}
                </div>
                <p className="text-sm text-slate-600">取消後工單狀態將變為「已取消」且無法復原，確定要繼續嗎？</p>
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setCancelConfirmOpen(false)}
                    className="flex-1 border border-slate-300 text-slate-600 py-2.5 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    返回
                  </button>
                  <button
                    onClick={async () => {
                      setCancelConfirmOpen(false)
                      await handleStatusChange('cancelled')
                    }}
                    disabled={statusChanging}
                    className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors cursor-pointer"
                  >
                    {statusChanging ? '處理中...' : '確認取消'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Ship modal */}
          {shipOpen && (
            <ShipModal
              workOrderId={wo.id}
              orderNumber={wo.orderNumber}
              existingNote={wo.note ?? ''}
              onClose={() => setShipOpen(false)}
              onShipped={() => { setShipOpen(false); reload() }}
            />
          )}
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-slate-500 text-xs">{label}</p>
      <p className="text-slate-800 font-medium mt-0.5">{value}</p>
    </div>
  )
}

// ── Ship Modal ───────────────────────────────────────────────────────────────

function ShipModal({ workOrderId, orderNumber, existingNote, onClose, onShipped }: {
  workOrderId: string; orderNumber: string; existingNote: string
  onClose: () => void; onShipped: () => void
}) {
  const [report, setReport] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleShip = async () => {
    if (!report.trim()) { setError('請填寫出貨報告'); return }
    setSaving(true)
    setError(null)
    try {
      const now = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })
      const shipNote = `\n\n── 出貨報告（${now}）──\n${report.trim()}`
      const newNote = (existingNote || '') + shipNote
      await workOrdersApi.update(workOrderId, { note: newNote })
      await workOrdersApi.updateStatus(workOrderId, 'completed')
      onShipped()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '出貨失敗')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
        <h2 className="font-bold text-emerald-700 text-lg">出貨確認 — {orderNumber}</h2>
        <p className="text-sm text-slate-600">填寫出貨報告後，工單將設為「已完工」。報告內容會附加在工單備註後方。</p>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">出貨報告</label>
          <textarea
            value={report}
            onChange={e => setReport(e.target.value)}
            rows={5}
            placeholder="出貨數量、收件人、物流方式、備註..."
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-emerald-500"
          />
        </div>
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 border border-slate-300 text-slate-600 py-2.5 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-colors cursor-pointer">
            取消
          </button>
          <button onClick={handleShip} disabled={saving} className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors cursor-pointer">
            {saving ? '處理中...' : '確認出貨'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Edit Work Order Modal ─────────────────────────────────────────────────────

import type { WorkOrder } from '../../api/admin'

const INPUT_CLS = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-blue-500'
const SELECT_CLS = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-blue-500'

function EditWorkOrderModal({ workOrder: wo, onClose, onSaved }: {
  workOrder: WorkOrder & { note?: string | null }
  onClose: () => void
  onSaved: () => void
}) {
  const [orderNumber, setOrderNumber] = useState(wo.orderNumber)
  const [orderQty, setOrderQty] = useState(wo.orderQty ?? wo.plannedQty)
  const [plannedQty, setPlannedQty] = useState(wo.plannedQty)
  const [priority, setPriority] = useState(wo.priority)
  const [dueDate, setDueDate] = useState(wo.dueDate ?? '')
  const [note, setNote] = useState(wo.note ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!orderNumber.trim()) {
      setError('工單號不可為空')
      return
    }
    if (orderQty < 1 || plannedQty < 1) {
      setError('數量必須大於 0')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await workOrdersApi.update(wo.id, {
        orderNumber: orderNumber.trim() !== wo.orderNumber ? orderNumber.trim() : undefined,
        orderQty,
        plannedQty,
        priority,
        dueDate: dueDate || null,
        note: note.trim() || null,
      })
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
        <h2 className="font-bold text-slate-800 text-lg">編輯工單 {wo.orderNumber}</h2>

        <div className="space-y-3">
          <label className="block">
            <span className="text-sm font-medium text-slate-700 block mb-1">工單號</span>
            <input value={orderNumber} onChange={e => setOrderNumber(e.target.value)} className={`${INPUT_CLS} font-mono`} />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm font-medium text-slate-700 block mb-1">訂單數量</span>
              <input type="number" min={1} value={orderQty} onChange={e => setOrderQty(Number(e.target.value))} className={INPUT_CLS} />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700 block mb-1">製作數量</span>
              <input type="number" min={1} value={plannedQty} onChange={e => setPlannedQty(Number(e.target.value))} className={INPUT_CLS} />
            </label>
          </div>

          <label className="block">
            <span className="text-sm font-medium text-slate-700 block mb-1">優先級</span>
            <select value={priority} onChange={e => setPriority(e.target.value)} className={SELECT_CLS}>
              <option value="normal">普通</option>
              <option value="urgent">急件</option>
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700 block mb-1">交期</span>
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={INPUT_CLS} />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700 block mb-1">備註</span>
            <textarea value={note} onChange={e => setNote(e.target.value)} className={INPUT_CLS} rows={3} placeholder="工單備註..." />
          </label>
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 border border-slate-300 text-slate-600 py-2.5 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-colors cursor-pointer">取消</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors cursor-pointer">
            {saving ? '儲存中...' : '儲存'}
          </button>
        </div>
      </div>
    </div>
  )
}
