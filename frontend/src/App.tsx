import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import { SetupPage } from './pages/SetupPage'
import { ScanPage } from './pages/ScanPage'
import { CorrectionPage } from './pages/CorrectionPage'
import { DashboardPage } from './pages/DashboardPage'
import { TracePage } from './pages/TracePage'
import { AdminPage } from './pages/AdminPage'
import { ErrorPage } from './pages/ErrorPage'
import { getStoredDeviceId } from './hooks/useDevice'

import { Layout } from './components/Layout'

const router = createBrowserRouter([
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
      { path: 'admin/*', element: <AdminPage /> },
      { path: '*', element: <Navigate to="/scan" replace /> },
    ]
  }
])

export function App() {
  return <RouterProvider router={router} />
}
