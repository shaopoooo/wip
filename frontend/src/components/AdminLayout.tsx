import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAdminAuth } from '../contexts/AdminAuthContext'

const NAV_ITEMS = [
  { to: '/admin/dashboard', label: '看板' },
  { to: '/admin/work-orders', label: '工單管理' },
  { to: '/admin/products', label: '產品型號' },
  { to: '/admin/stations', label: '站點管理' },
  { to: '/admin/groups', label: '組別管理' },
  { to: '/admin/equipment', label: '設備管理' },
  { to: '/admin/departments', label: '產線管理' },
  { to: '/admin/users', label: '管理員帳號' },
  { to: '/admin/roles', label: '角色管理' },
]

const QUICK_LINKS = [
  { to: '/dashboard', label: '看板', icon: '📊' },
  { to: '/scan', label: '掃描', icon: '📷' },
  { to: '/trace', label: '追溯', icon: '🔍' },
]

const FEEDBACK_URL = 'https://docs.google.com/document/d/1cQrHVc0TKEZPpw8pXte3oF0a_vNThMh9/edit?usp=sharing&ouid=113539140119952999185&rtpof=true&sd=true'

export function AdminLayout() {
  const { user, logout } = useAdminAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/admin/login', { replace: true })
  }

  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-52 bg-slate-800 flex flex-col shrink-0">
        <div className="px-4 py-4 border-b border-slate-700">
          <NavLink to="/admin" className="text-white font-bold text-sm hover:text-blue-300 transition-colors">
            WIP 管理後台
          </NavLink>
          <p className="text-slate-400 text-xs mt-0.5 truncate">{user?.username}</p>
          <div className="flex gap-1.5 mt-2">
            {QUICK_LINKS.map(link => (
              <a
                key={link.to}
                href={link.to}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 text-center bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white rounded px-1.5 py-1 text-[10px] transition-colors"
                title={link.label}
              >
                {link.icon} {link.label}
              </a>
            ))}
          </div>
          <a
            href={FEEDBACK_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="block mt-1.5 text-center bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white rounded px-1.5 py-1 text-[10px] transition-colors"
          >
            📋 Bug / 需求回報
          </a>
        </div>
        <nav className="flex-1 overflow-y-auto py-2">
          {NAV_ITEMS.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `block px-4 py-2.5 text-sm transition-colors ${isActive
                  ? 'bg-blue-600 text-white font-semibold'
                  : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="px-4 py-4 border-t border-slate-700">
          <button
            onClick={handleLogout}
            className="w-full text-slate-400 hover:text-red-400 text-xs transition-colors cursor-pointer"
          >
            登出
          </button>
        </div>
      </aside>

      {/* Content */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}

// ── ProtectedAdminRoute ────────────────────────────────────────────────────────

import { Navigate } from 'react-router-dom'
import { AdminAuthProvider } from '../contexts/AdminAuthContext'

function ProtectedContent() {
  const { user, loading } = useAdminAuth()

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-100">
        <div className="w-8 h-8 border-4 border-slate-300 border-t-blue-600 rounded-full animate-spin" />
      </div>
    )
  }

  if (!user) return <Navigate to="/admin/login" replace />

  return <AdminLayout />
}

export function ProtectedAdminLayout() {
  return (
    <AdminAuthProvider>
      <ProtectedContent />
    </AdminAuthProvider>
  )
}

export function AdminLoginLayout() {
  return (
    <AdminAuthProvider>
      <Outlet />
    </AdminAuthProvider>
  )
}
