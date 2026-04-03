import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import { SetupPage } from './pages/SetupPage'
import { ScanPage } from './pages/ScanPage'
import { CorrectionPage } from './pages/CorrectionPage'
import { DashboardPage } from './pages/DashboardPage'
import { TracePage } from './pages/TracePage'
import { ErrorPage } from './pages/ErrorPage'
import { getStoredDeviceId } from './hooks/useDevice'
import { Layout } from './components/Layout'

// Admin
import { ProtectedAdminLayout, AdminLoginLayout } from './components/AdminLayout'
import { LoginPage } from './pages/admin/LoginPage'
import { WorkOrdersPage } from './pages/admin/WorkOrdersPage'
import { WorkOrderDetailPage } from './pages/admin/WorkOrderDetailPage'
import { ProductsPage } from './pages/admin/ProductsPage'
import { RoutesPage } from './pages/admin/RoutesPage'
import { StationsPage } from './pages/admin/StationsPage'
import { GroupsPage } from './pages/admin/GroupsPage'
import { EquipmentPage } from './pages/admin/EquipmentPage'
import { RolesPage } from './pages/admin/RolesPage'
import { UsersPage } from './pages/admin/UsersPage'
import { PrintPage } from './pages/admin/PrintPage'

const router = createBrowserRouter([
  // ── Admin login (standalone, shares AdminAuthProvider) ────────────────────
  {
    element: <AdminLoginLayout />,
    children: [
      { path: '/admin/login', element: <LoginPage /> },
    ],
  },

  // ── Admin protected area ──────────────────────────────────────────────────
  {
    element: <ProtectedAdminLayout />,
    children: [
      { path: '/admin', element: <Navigate to="/admin/work-orders" replace /> },
      { path: '/admin/work-orders', element: <WorkOrdersPage /> },
      { path: '/admin/work-orders/:id', element: <WorkOrderDetailPage /> },
      { path: '/admin/products', element: <ProductsPage /> },
      { path: '/admin/routes', element: <RoutesPage /> },
      { path: '/admin/stations', element: <StationsPage /> },
      { path: '/admin/groups', element: <GroupsPage /> },
      { path: '/admin/equipment', element: <EquipmentPage /> },
      { path: '/admin/roles', element: <RolesPage /> },
      { path: '/admin/users', element: <UsersPage /> },
      { path: '/admin/print', element: <PrintPage /> },
    ],
  },

  // ── Main PWA layout ────────────────────────────────────────────────────────
  {
    path: '/',
    element: <Layout />,
    errorElement: <ErrorPage />,
    children: [
      { index: true, element: <Navigate to={getStoredDeviceId() ? '/scan' : '/setup'} replace /> },
      { path: 'setup', element: <SetupPage /> },
      { path: 'scan', element: <ScanPage /> },
      { path: 'correction', element: <CorrectionPage /> },
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'trace', element: <TracePage /> },
      { path: '*', element: <Navigate to="/scan" replace /> },
    ],
  },
])

export function App() {
  return <RouterProvider router={router} />
}
