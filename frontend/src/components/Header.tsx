import { useNavigate, useLocation } from 'react-router-dom'

const NAV_LINKS = [
  { to: '/dashboard', label: '看板' },
  { to: '/scan', label: '掃描' },
  { to: '/trace', label: '追溯' },
]

export function Header() {
  const navigate = useNavigate()
  const location = useLocation()

  const isSetup = location.pathname === '/setup'

  return (
    <div className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800 shrink-0">
      <div className="flex items-center gap-4">
        <span
          onClick={() => navigate('/dashboard')}
          className="text-white font-bold tracking-wide cursor-pointer hover:text-blue-300 transition-colors"
        >
          WIP
        </span>
        {!isSetup && (
          <nav className="flex items-center gap-1">
            {NAV_LINKS.map(link => (
              <button
                key={link.to}
                onClick={() => navigate(link.to)}
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors cursor-pointer ${
                  location.pathname === link.to
                    ? 'bg-slate-700 text-white font-semibold'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                {link.label}
              </button>
            ))}
          </nav>
        )}
      </div>

      {!isSetup && (
        <div className="flex items-center gap-2">
          {location.pathname === '/scan' && (
            <button onClick={() => navigate('/correction')} className="text-slate-300 hover:text-white border border-slate-600 hover:border-slate-400 px-3 py-1.5 rounded-lg text-sm transition-colors cursor-pointer">
              時間補正
            </button>
          )}
          <button onClick={() => navigate('/setup')} className="text-slate-300 hover:text-white border border-slate-600 hover:border-slate-400 px-3 py-1.5 rounded-lg text-sm transition-colors cursor-pointer">
            裝置設定
          </button>
          <button onClick={() => navigate('/admin')} className="text-slate-300 hover:text-white border border-slate-600 hover:border-slate-400 px-3 py-1.5 rounded-lg text-sm transition-colors cursor-pointer">
            管理後台
          </button>
        </div>
      )}
    </div>
  )
}
