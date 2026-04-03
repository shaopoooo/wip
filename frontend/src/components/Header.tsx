import { useNavigate, useLocation } from 'react-router-dom'

export function Header() {
  const navigate = useNavigate()
  const location = useLocation()
  
  const isScan = location.pathname === '/scan'
  const isCorrection = location.pathname === '/correction'
  const isSetup = location.pathname === '/setup'

  return (
    <div className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800 shrink-0">
      <div className="flex items-center gap-3">
        {isCorrection && (
          <button onClick={() => navigate('/scan')} className="text-slate-300 hover:text-white text-sm cursor-pointer transition-colors">
            ← 返回
          </button>
        )}
        <span className="text-white font-bold tracking-wide">
          {isScan ? 'WIP 掃描報工' : isCorrection ? '時間補正' : isSetup ? '裝置註冊' : 'WIP 系統'}
        </span>
      </div>
      
      {!isSetup && (
        <div className="flex items-center gap-2">
          {isScan && (
            <button onClick={() => navigate('/correction')} className="text-slate-300 hover:text-white border border-slate-600 hover:border-slate-400 px-3 py-1.5 rounded-lg text-sm transition-colors cursor-pointer">
              時間補正
            </button>
          )}
          <button onClick={() => navigate('/setup')} className="text-slate-300 hover:text-white border border-slate-600 hover:border-slate-400 px-3 py-1.5 rounded-lg text-sm transition-colors cursor-pointer">
            裝置重設
          </button>
          <button onClick={() => navigate('/admin')} className="text-slate-300 hover:text-white border border-slate-600 hover:border-slate-400 px-3 py-1.5 rounded-lg text-sm transition-colors cursor-pointer">
            管理後台
          </button>
        </div>
      )}
    </div>
  )
}
