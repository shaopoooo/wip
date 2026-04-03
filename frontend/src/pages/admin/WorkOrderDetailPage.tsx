import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { workOrdersApi, WorkOrderDetail } from '../../api/admin'

const STATUS_LABEL: Record<string, string> = {
  pending: '待開工', in_progress: '進行中', completed: '已完工', cancelled: '已取消', split: '已拆單',
}
const LOG_STATUS: Record<string, string> = {
  in_progress: '作業中', completed: '已完成', auto_filled: '自動補填', abnormal: '異常',
}
const LOG_COLOR: Record<string, string> = {
  in_progress: 'bg-blue-100 text-blue-700',
  completed: 'bg-emerald-100 text-emerald-700',
  auto_filled: 'bg-amber-100 text-amber-800',
  abnormal: 'bg-red-100 text-red-600',
}

function formatTW(iso: string) {
  return new Date(iso).toLocaleString('zh-TW', {
    timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

export function WorkOrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [detail, setDetail] = useState<WorkOrderDetail | null>(null)
  const [qr, setQr] = useState<{ qrDataUrl: string; orderNumber: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [statusChanging, setStatusChanging] = useState(false)
  const printRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!id) return
    Promise.all([
      workOrdersApi.get(id),
      workOrdersApi.qrcode(id),
    ]).then(([d, q]) => {
      setDetail(d)
      setQr(q)
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

  const handlePrint = () => {
    window.print()
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

  return (
    <div className="p-6 max-w-4xl">
      <button onClick={() => navigate('/admin/work-orders')} className="text-slate-500 hover:text-slate-800 text-sm mb-4 cursor-pointer transition-colors">
        ← 返回工單列表
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Work order info */}
        <div className="lg:col-span-2 space-y-6">
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
                : wo.status === 'cancelled' ? 'bg-red-100 text-red-600'
                : 'bg-slate-100 text-slate-600'
              }`}>
                {STATUS_LABEL[wo.status] ?? wo.status}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <InfoRow label="計畫數量" value={String(wo.plannedQty)} />
              <InfoRow label="優先級" value={wo.priority === 'urgent' ? '急件' : '普通'} />
              <InfoRow label="路由" value={route?.name ?? '—'} />
              <InfoRow label="交期" value={wo.dueDate ?? '—'} />
              <InfoRow label="建立時間" value={formatTW(wo.createdAt)} />
            </div>

            {/* Status change */}
            {!['completed', 'split', 'cancelled'].includes(wo.status) && (
              <div className="mt-4 pt-4 border-t border-slate-100 flex gap-2">
                {wo.status !== 'cancelled' && (
                  <button
                    onClick={() => handleStatusChange('cancelled')}
                    disabled={statusChanging}
                    className="border border-red-300 text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                  >
                    取消工單
                  </button>
                )}
              </div>
            )}
          </div>

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
        </div>

        {/* Right: QR Code */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h2 className="font-semibold text-slate-800 mb-4">QR Code</h2>
            {qr ? (
              <div ref={printRef}>
                <img src={qr.qrDataUrl} alt={qr.orderNumber} className="w-full max-w-[200px] mx-auto block" />
                <p className="text-center font-mono text-sm font-bold text-slate-800 mt-2">{qr.orderNumber}</p>
                <p className="text-center text-xs text-slate-500 mt-0.5">{product.name}</p>
              </div>
            ) : (
              <p className="text-slate-400 text-sm text-center">無法產生 QR Code</p>
            )}
            <button
              onClick={handlePrint}
              className="w-full mt-4 bg-slate-800 hover:bg-slate-900 text-white py-2.5 rounded-lg text-sm font-semibold transition-colors cursor-pointer"
            >
              列印 QR Code
            </button>
          </div>
        </div>
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
