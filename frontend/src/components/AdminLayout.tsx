import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAdminAuth } from '../contexts/AdminAuthContext'

const NAV_ITEMS = [
  { to: '/admin/work-orders', label: '工單管理' },
  { to: '/admin/products', label: '產品型號' },
  { to: '/admin/routes', label: '工序路由' },
  { to: '/admin/stations', label: '站點管理' },
  { to: '/admin/groups', label: '組別管理' },
  { to: '/admin/equipment', label: '設備管理' },
  { to: '/admin/users', label: '管理員帳號' },
  { to: '/admin/roles', label: '角色管理' },
]

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
        <div className="px-4 py-5 border-b border-slate-700">
          <p className="text-white font-bold text-sm">WIP 管理後台</p>
          <p className="text-slate-400 text-xs mt-0.5 truncate">{user?.username}</p>
        </div>
        <nav className="flex-1 overflow-y-auto py-2">
          {NAV_ITEMS.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `block px-4 py-2.5 text-sm transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white font-semibold'
                    : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="px-4 py-4 border-t border-slate-700 space-y-2">
          <NavLink
            to="/"
            className="block text-slate-400 hover:text-white text-xs text-center transition-colors"
          >
            ← 回掃描頁
          </NavLink>
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
