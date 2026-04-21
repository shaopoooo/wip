const STATUS_LABEL: Record<string, string> = {
  pending: '待開工', in_progress: '進行中', manual_tracking: '人工追蹤',
  ready_to_ship: '待出貨', completed: '已完工', cancelled: '已取消', split: '已拆單',
}

export interface PrintWorkOrderData {
  orderNumber: string
  qrDataUrl: string
  productName: string
  modelNumber: string
  productDescription: string | null
  plannedQty: number
  orderQty: number | null
  dueDate: string | null
  priority: string
  status: string
  note: string | null
  createdAt: string
  routeName: string | null
  routeDescription: string | null
  steps: { stepOrder: number; stationName: string; stationCode: string | null; standardTime: number | null }[]
}

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function formatTW(iso: string) {
  return new Date(iso).toLocaleString('zh-TW', {
    timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

const PRINT_STYLES = `
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:"Microsoft JhengHei","PingFang TC",sans-serif;padding:10mm;font-size:11px;color:#333}
  @page{margin:8mm}
  .page{page-break-after:always}
  .page:last-child{page-break-after:auto}
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
  .no-print{margin-bottom:12px}
  @media print{.no-print{display:none}}
`

function buildPageHtml(item: PrintWorkOrderData): string {
  const stepsHtml = item.steps.length > 0
    ? item.steps.map(s =>
      `<tr><td class="c">${s.stepOrder}</td>` +
      `<td>${esc(s.stationName)}${s.stationCode ? ' (' + esc(s.stationCode) + ')' : ''}</td>` +
      `<td class="c">${s.standardTime != null ? s.standardTime + 's' : '-'}</td></tr>`
    ).join('')
    : '<tr><td colspan="3" style="padding:4px;text-align:center;color:#999">尚未設定</td></tr>'

  return `
<div class="page">
<div class="layout">
<div class="left">

<div class="hdr">
  <h1>${esc(item.orderNumber)}</h1>${item.priority === 'urgent' ? '<span class="urgent">!! 急件 !!</span>' : ''}
  <div class="sub">${esc(item.productName)} — ${esc(item.modelNumber)}</div>
</div>

<div class="sec">
  <div class="sec-t">工單資訊</div>
  <div class="grid">
    <div class="it"><label>訂單數量</label><br><span>${item.orderQty ?? '-'}</span></div>
    <div class="it"><label>製作數量</label><br><span>${item.plannedQty}</span></div>
    <div class="it"><label>優先級</label><br><span>${item.priority === 'urgent' ? '急件' : '普通'}</span></div>
    <div class="it"><label>交期</label><br><span>${item.dueDate ?? '-'}</span></div>
    <div class="it"><label>狀態</label><br><span>${STATUS_LABEL[item.status] ?? item.status}</span></div>
    <div class="it"><label>建立時間</label><br><span>${formatTW(item.createdAt)}</span></div>
  </div>
  ${item.note ? '<div style="margin-top:3px"><label style="color:#666;font-size:10px">工單備註</label><div class="note">' + esc(item.note) + '</div></div>' : ''}
</div>

</div>
<div class="right">
  <img src="${item.qrDataUrl}"/>
  <div class="num">${esc(item.orderNumber)}</div>
  <div class="product">${esc(item.modelNumber)}</div>
</div>
</div>

<div class="sec">
  <div class="sec-t">製程${item.routeName ? ' — ' + esc(item.routeName) : ''}</div>
  ${item.routeDescription ? '<div style="margin-bottom:4px"><label style="color:#666;font-size:10px">製程備註</label><div class="note">' + esc(item.routeDescription) + '</div></div>' : ''}
  ${item.productDescription ? '<div style="margin-bottom:4px"><label style="color:#666;font-size:10px">料號備註</label><div class="note">' + esc(item.productDescription) + '</div></div>' : ''}
  <table>
    <thead><tr><th class="c" style="width:35px">#</th><th>站點</th><th class="c" style="width:60px">工時</th></tr></thead>
    <tbody>${stepsHtml}</tbody>
  </table>
</div>
</div>`
}

/** Build full HTML document for printing (supports multiple work orders with page breaks) */
export function buildPrintHtml(items: PrintWorkOrderData[], showPrintButton = false): string {
  const pages = items.map(buildPageHtml).join('')
  const printBtn = showPrintButton
    ? `<div class="no-print"><button onclick="window.print()" style="background:#1e293b;color:white;border:none;padding:8px 24px;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer">列印 (${items.length} 張)</button></div>`
    : ''

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${items.length === 1 ? items[0]!.orderNumber : '列印工單'}</title>
<style>${PRINT_STYLES}</style></head><body>
${printBtn}
${pages}
</body></html>`
}

/** Open a new window and print work orders (used from detail page) */
export function openPrintWindow(items: PrintWorkOrderData[]): void {
  const win = window.open('', '_blank')
  if (!win) return
  win.document.write(buildPrintHtml(items))
  win.document.close()
  win.onload = () => { win.print() }
}
