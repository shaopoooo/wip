import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { authApi, AdminUser, AdminApiError } from '../api/admin'

interface AdminAuthContextValue {
  user: AdminUser | null
  loading: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null)

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null)
  const [loading, setLoading] = useState(true)

  // On mount, try to fetch current user via access token cookie
  useEffect(() => {
    authApi.me()
      .then(data => setUser(data.user))
      .catch(() => {
        // Try refresh
        authApi.refresh()
          .then(data => setUser(data.user))
          .catch(() => setUser(null))
      })
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    const data = await authApi.login(username, password)
    setUser(data.user)
  }, [])

  const logout = useCallback(async () => {
    await authApi.logout()
    setUser(null)
  }, [])

  return (
    <AdminAuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AdminAuthContext.Provider>
  )
}

export function useAdminAuth(): AdminAuthContextValue {
  const ctx = useContext(AdminAuthContext)
  if (!ctx) throw new Error('useAdminAuth must be used inside AdminAuthProvider')
  return ctx
}

export function isAdminApiError(err: unknown): err is AdminApiError {
  return err instanceof AdminApiError
}
