import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import { SetupPage } from './pages/SetupPage'
import { ScanPage } from './pages/ScanPage'
import { CorrectionPage } from './pages/CorrectionPage'
import { DashboardPage } from './pages/DashboardPage'
import { TracePage } from './pages/TracePage'
import { ErrorPage } from './pages/ErrorPage'
import { Layout } from './components/Layout'

// Admin
import { ProtectedAdminLayout, AdminLoginLayout } from './components/AdminLayout'
import { LoginPage } from './pages/admin/LoginPage'
import { WorkOrdersPage } from './pages/admin/WorkOrdersPage'
import { WorkOrderDetailPage } from './pages/admin/WorkOrderDetailPage'
import { ProductsPage } from './pages/admin/ProductsPage'
import { CategoriesPage } from './pages/admin/CategoriesPage'
import { StationsPage } from './pages/admin/StationsPage'
import { GroupsPage } from './pages/admin/GroupsPage'
import { EquipmentPage } from './pages/admin/EquipmentPage'
import { RolesPage } from './pages/admin/RolesPage'
import { UsersPage } from './pages/admin/UsersPage'
import { DepartmentsPage } from './pages/admin/DepartmentsPage'
import { PrintPage } from './pages/admin/PrintPage'
import { RoutesPage } from './pages/admin/RoutesPage'

const router = createBrowserRouter([
  // ── Admin login (standalone) ───────────────────────────────────────────────
  {
    element: <AdminLoginLayout />,
    children: [
      { path: '/admin/login', element: <LoginPage /> },
      { path: '/admin/print', element: <PrintPage /> },
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
      { path: '/admin/categories', element: <CategoriesPage /> },
      { path: '/admin/stations', element: <StationsPage /> },
      { path: '/admin/groups', element: <GroupsPage /> },
      { path: '/admin/equipment', element: <EquipmentPage /> },
      { path: '/admin/departments', element: <DepartmentsPage /> },
      { path: '/admin/routes', element: <RoutesPage /> },
      { path: '/admin/roles', element: <RolesPage /> },
      { path: '/admin/users', element: <UsersPage /> },
    ],
  },

  // ── Main PWA layout ────────────────────────────────────────────────────────
  {
    path: '/',
    element: <Layout />,
    errorElement: <ErrorPage />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'setup', element: <SetupPage /> },
      { path: 'scan', element: <ScanPage /> },
      { path: 'correction', element: <CorrectionPage /> },
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'trace', element: <TracePage /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])

export function App() {
  return <RouterProvider router={router} />
}
