import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { workOrdersApi } from '../../api/admin'

interface PrintItem {
  orderNumber: string
  qrDataUrl: string
  productName: string
  modelNumber: string
  plannedQty: number
  dueDate: string | null
  priority: string
}

export function PrintPage() {
  const [searchParams] = useSearchParams()
  const ids = searchParams.get('ids')?.split(',').filter(Boolean) ?? []
  const [items, setItems] = useState<PrintItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (ids.length === 0) { setLoading(false); return }
    workOrdersApi.print(ids)
      .then(data => setItems(data as PrintItem[]))
      .finally(() => setLoading(false))
  }, [ids.join(',')])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-4 border-slate-300 border-t-blue-600 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <>
      {/* Print button (hidden in print mode) */}
      <div className="p-4 print:hidden">
        <button
          onClick={() => window.print()}
          className="bg-slate-800 hover:bg-slate-900 text-white px-6 py-2.5 rounded-lg text-sm font-semibold cursor-pointer transition-colors"
        >
          列印 ({items.length} 張)
        </button>
      </div>

      {/* Print layout */}
      <div className="grid grid-cols-3 gap-4 p-4 print:p-0 print:gap-2">
        {items.map(item => (
          <div
            key={item.orderNumber}
            className="border border-slate-200 rounded-lg p-3 text-center print:border-slate-400 print:rounded-none print:break-inside-avoid"
          >
            <img src={item.qrDataUrl} alt={item.orderNumber} className="w-40 h-40 mx-auto" />
            <p className="font-mono font-bold text-sm mt-2">{item.orderNumber}</p>
            <p className="text-xs text-slate-600 mt-0.5">{item.productName}</p>
            <p className="text-xs text-slate-500">{item.modelNumber}</p>
            <div className="flex justify-between text-xs text-slate-500 mt-1">
              <span>數量: {item.plannedQty}</span>
              {item.dueDate && <span>交期: {item.dueDate}</span>}
              {item.priority === 'urgent' && <span className="text-red-600 font-semibold">急件</span>}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
