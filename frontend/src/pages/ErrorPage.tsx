import { useRouteError, isRouteErrorResponse, useNavigate } from 'react-router-dom'

export function ErrorPage() {
  const error = useRouteError()
  const navigate = useNavigate()

  const is404 = isRouteErrorResponse(error) && error.status === 404
  const title = is404 ? '404 — 頁面不存在' : '發生錯誤'
  const message = is404
    ? '找不到您要的頁面，請確認網址是否正確。'
    : error instanceof Error
      ? error.message
      : '未知錯誤，請重新整理或聯絡系統管理員。'

  return (
    <div className="flex flex-col h-full items-center justify-center gap-6 px-8 text-center bg-slate-950">
      <div className="text-6xl text-slate-600">{is404 ? '🔍' : '⚠️'}</div>
      <div>
        <h1 className="text-2xl font-bold text-white">{title}</h1>
        <p className="text-slate-400 mt-2 text-sm max-w-sm">{message}</p>
      </div>
      <button
        onClick={() => navigate('/scan', { replace: true })}
        className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-semibold transition-colors cursor-pointer"
      >
        回掃描頁
      </button>
    </div>
  )
}
