import { useEffect } from 'react'
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ToastContainer, ErrorBoundary, Spinner } from './components/ui'
import { startRealtimeEngine } from './lib/realtimeSync'
import AppShell from './components/layout/AppShell'
import LoginPage from './pages/LoginPage'
import DashboardPage, { EmployeeDashboard } from './pages/DashboardPage'
import CustomerDashboard from './pages/CustomerDashboard'
import ProductsPage from './pages/ProductsPage'
import CustomersPage from './pages/CustomersPage'
import SalesPage from './pages/SalesPage'
import InstallmentsPage from './pages/InstallmentsPage'
import PaymentsPage from './pages/PaymentsPage'
import PaymentSchedulePage from './pages/PaymentSchedulePage'
import EmployeesPage from './pages/EmployeesPage'
import AttendancePage from './pages/AttendancePage'
import PayrollPage from './pages/PayrollPage'
import ReportsPage from './pages/ReportsPage'
import TransactionsPage from './pages/TransactionsPage'
import NotificationsPage from './pages/NotificationsPage'
import QrScannerPage from './pages/QrScannerPage'
import QrMonitoringPage from './pages/QrMonitoringPage'
import QrRequestsPage from './pages/QrRequestsPage'
import SupportPage from './pages/SupportPage'
import { UsersPage, SystemLogsPage, BackupsPage, SettingsPage } from './pages/SystemPage'
import SystemAdminDashboard from './pages/SystemAdminDashboard'
import BranchesPage from './pages/BranchesPage'
import CarouselPage from './pages/CarouselPage'

// Synchronize initial URL hash with browser pathname or saved route if needed
if (typeof window !== 'undefined') {
  const pathname = window.location.pathname
  const hash = window.location.hash
  const search = window.location.search
  const savedPath = sessionStorage.getItem('pace_last_path') || localStorage.getItem('pace_last_path')

  if (pathname && pathname !== '/' && (!hash || hash === '#/' || hash === '#')) {
    const newHash = '#' + pathname + search
    window.location.hash = newHash
    try {
      window.history.replaceState(null, '', '/' + newHash)
    } catch (_) {}
  } else if ((!hash || hash === '#/' || hash === '#') && savedPath && savedPath !== '/' && savedPath !== '/login') {
    const newHash = '#' + (savedPath.startsWith('/') ? savedPath : '/' + savedPath)
    window.location.hash = newHash
    try {
      window.history.replaceState(null, '', '/' + newHash)
    } catch (_) {}
  }
}

function getDefaultDashboard(role) {
  if (role === 'Customer') return '/customer/dashboard'
  if (role === 'Employee') return '/employee/dashboard'
  return '/dashboard'
}

function canUserAccessPath(role, path) {
  if (!path || path === '/' || path === '/login') return false
  const cleanPath = path.split('?')[0]

  if (role === 'Customer') {
    return cleanPath.startsWith('/customer') || cleanPath === '/notifications'
  }
  if (role === 'Employee') {
    return cleanPath.startsWith('/employee') || cleanPath === '/employees' || cleanPath === '/notifications'
  }
  if (role === 'Store Administrator' || role === 'Store Admin') {
    const adminOnly = [
      '/branches', '/admin-dashboard', '/qr-monitoring', '/admin/qr-monitoring',
      '/admin/qr-requests', '/users', '/system-logs', '/backups', '/settings', '/payroll'
    ]
    return !adminOnly.includes(cleanPath)
  }
  if (role === 'Administrator') {
    return true
  }
  return false
}

function FullPageLoader() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#0f1f3d] gap-3 text-white">
      <Spinner className="w-10 h-10 text-[#2563eb]" />
      <p className="text-sm font-medium text-white/70">Verifying session with server...</p>
    </div>
  )
}

function RoutePersistenceTracker() {
  const location = useLocation()

  useEffect(() => {
    if (location.pathname && location.pathname !== '/' && location.pathname !== '/login') {
      const fullPath = location.pathname + location.search
      sessionStorage.setItem('pace_last_path', fullPath)
      localStorage.setItem('pace_last_path', fullPath)
    }
  }, [location])

  return null
}

function RequireAuth({ children, roles }) {
  const { user, checkingAuth } = useAuth()
  const location = useLocation()

  if (checkingAuth) {
    return <FullPageLoader />
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (roles) {
    const userRole = user.role ? user.role.trim() : ''
    if (!roles.includes(userRole)) {
      return <Navigate to={getDefaultDashboard(userRole)} replace />
    }
  }

  return children
}

function PublicRoute({ children }) {
  const { user, checkingAuth } = useAuth()

  if (checkingAuth) {
    return <FullPageLoader />
  }

  if (user) {
    const saved = sessionStorage.getItem('pace_last_path') || localStorage.getItem('pace_last_path')
    if (saved && canUserAccessPath(user.role, saved)) {
      return <Navigate to={saved} replace />
    }
    return <Navigate to={getDefaultDashboard(user.role)} replace />
  }

  return children
}

function RootRedirect() {
  const { user, checkingAuth } = useAuth()

  if (checkingAuth) {
    return <FullPageLoader />
  }

  if (user) {
    const saved = sessionStorage.getItem('pace_last_path') || localStorage.getItem('pace_last_path')
    if (saved && canUserAccessPath(user.role, saved)) {
      return <Navigate to={saved} replace />
    }
    return <Navigate to={getDefaultDashboard(user.role)} replace />
  }

  return <Navigate to="/login" replace />
}

function AppRoutes() {
  return (
    <>
      <RoutePersistenceTracker />
      <Routes>
        <Route
          path="/login"
          element={
            <PublicRoute>
              <LoginPage />
            </PublicRoute>
          }
        />

        <Route element={<RequireAuth><AppShell /></RequireAuth>}>
          <Route path="/dashboard" element={<RequireAuth roles={['Administrator', 'Store Administrator', 'Store Admin']}><DashboardPage /></RequireAuth>} />
          <Route path="/products" element={<RequireAuth roles={['Administrator', 'Store Administrator', 'Store Admin']}><ProductsPage /></RequireAuth>} />
          <Route path="/customers" element={<RequireAuth roles={['Administrator', 'Store Administrator', 'Store Admin']}><CustomersPage /></RequireAuth>} />
          <Route path="/sales" element={<RequireAuth roles={['Administrator', 'Store Administrator', 'Store Admin']}><SalesPage /></RequireAuth>} />
          <Route path="/transactions" element={<RequireAuth roles={['Administrator', 'Store Administrator', 'Store Admin']}><TransactionsPage /></RequireAuth>} />
          <Route path="/installments" element={<RequireAuth roles={['Administrator', 'Store Administrator', 'Store Admin']}><InstallmentsPage /></RequireAuth>} />
          <Route path="/payment-schedule" element={<RequireAuth roles={['Administrator', 'Store Administrator', 'Store Admin']}><PaymentSchedulePage /></RequireAuth>} />
          <Route path="/payments" element={<RequireAuth roles={['Administrator', 'Store Administrator', 'Store Admin']}><PaymentsPage /></RequireAuth>} />
          <Route path="/employees" element={<RequireAuth roles={['Administrator', 'Store Administrator', 'Store Admin', 'Employee']}><EmployeesPage /></RequireAuth>} />
          <Route path="/admin/qr-requests" element={<RequireAuth roles={['Administrator']}><QrRequestsPage /></RequireAuth>} />
          <Route path="/attendance" element={<RequireAuth roles={['Administrator', 'Store Administrator', 'Store Admin']}><AttendancePage /></RequireAuth>} />
          <Route path="/attendance/qr" element={<RequireAuth roles={['Administrator', 'Store Administrator', 'Store Admin']}><AttendancePage /></RequireAuth>} />
          <Route path="/payroll" element={<RequireAuth roles={['Administrator']}><PayrollPage /></RequireAuth>} />
          <Route path="/reports" element={<RequireAuth roles={['Administrator', 'Store Administrator', 'Store Admin']}><ReportsPage /></RequireAuth>} />
          <Route path="/support" element={<RequireAuth roles={['Administrator', 'Store Administrator', 'Store Admin']}><SupportPage /></RequireAuth>} />
          <Route path="/notifications" element={<RequireAuth><NotificationsPage /></RequireAuth>} />
          <Route path="/employee/dashboard" element={<RequireAuth roles={['Employee']}><EmployeeDashboard /></RequireAuth>} />
          <Route path="/employee/attendance" element={<RequireAuth roles={['Employee']}><AttendancePage /></RequireAuth>} />
          <Route path="/employee/payroll" element={<RequireAuth roles={['Employee']}><PayrollPage /></RequireAuth>} />
          <Route path="/employee/payslips" element={<RequireAuth roles={['Employee']}><PayrollPage /></RequireAuth>} />
          <Route path="/employee/notifications" element={<RequireAuth roles={['Employee']}><NotificationsPage /></RequireAuth>} />

          {/* Store Administrator QR Attendance Terminal */}
          <Route path="/store-admin/attendance/scanner" element={<RequireAuth roles={['Store Administrator', 'Store Admin']}><QrScannerPage /></RequireAuth>} />

          {/* Administrator only routes */}
          <Route path="/branches" element={<RequireAuth roles={['Administrator']}><BranchesPage /></RequireAuth>} />
          <Route path="/admin-dashboard" element={<RequireAuth roles={['Administrator']}><SystemAdminDashboard /></RequireAuth>} />
          <Route path="/qr-monitoring" element={<RequireAuth roles={['Administrator']}><QrMonitoringPage /></RequireAuth>} />
          <Route path="/admin/qr-monitoring" element={<RequireAuth roles={['Administrator']}><QrMonitoringPage /></RequireAuth>} />
          <Route path="/users" element={<RequireAuth roles={['Administrator']}><UsersPage /></RequireAuth>} />
          <Route path="/system-logs" element={<RequireAuth roles={['Administrator']}><SystemLogsPage /></RequireAuth>} />
          <Route path="/backups" element={<RequireAuth roles={['Administrator']}><BackupsPage /></RequireAuth>} />
          <Route path="/settings" element={<RequireAuth roles={['Administrator']}><SettingsPage /></RequireAuth>} />
          <Route path="/settings/carousel" element={<RequireAuth roles={['Administrator']}><CarouselPage /></RequireAuth>} />
          
          {/* Customer Route inside AppShell */}
          <Route path="/customer/dashboard" element={<RequireAuth roles={['Customer']}><CustomerDashboard /></RequireAuth>} />
        </Route>

        <Route path="/" element={<RootRedirect />} />
        <Route path="*" element={<RootRedirect />} />
      </Routes>
    </>
  )
}

export default function App() {
  useEffect(() => {
    const cleanup = startRealtimeEngine()
    return cleanup
  }, [])

  return (
    <ErrorBoundary>
      <AuthProvider>
        <HashRouter>
          <AppRoutes />
          <ToastContainer />
        </HashRouter>
      </AuthProvider>
    </ErrorBoundary>
  )
}
