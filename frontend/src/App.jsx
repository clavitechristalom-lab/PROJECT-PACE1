import { useEffect, useState, lazy, Suspense } from 'react'
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ToastContainer, ErrorBoundary, Spinner } from './components/ui'
import { startRealtimeEngine, triggerDataSync } from './lib/realtimeSync'
import AppShell from './components/layout/AppShell'
import LoginPage from './pages/LoginPage'

// Resilient dynamic import with auto-retry and cache-recovery for Vite HMR/bundle shifts
const lazyRetry = (factory, retries = 2, delay = 400) => {
  return lazy(() =>
    new Promise((resolve, reject) => {
      const attempt = (attemptsLeft) => {
        factory()
          .then(resolve)
          .catch((err) => {
            console.warn(`Dynamic import retry (${attemptsLeft} remaining):`, err)
            if (attemptsLeft > 0) {
              setTimeout(() => {
                attempt(attemptsLeft - 1)
              }, delay)
            } else {
              const reloadKey = 'pace_chunk_failed_reload'
              const lastReload = sessionStorage.getItem(reloadKey)
              const now = Date.now()
              if (!lastReload || now - parseInt(lastReload, 10) > 8000) {
                sessionStorage.setItem(reloadKey, now.toString())
                window.location.reload()
                return
              }
              reject(err)
            }
          })
      }
      attempt(retries)
    })
  )
}

const DashboardPage = lazyRetry(() => import('./pages/DashboardPage'))
const EmployeeDashboard = lazyRetry(() => import('./pages/DashboardPage').then(m => ({ default: m.EmployeeDashboard })))
const CustomerDashboard = lazyRetry(() => import('./pages/CustomerDashboard'))
const ProductsPage = lazyRetry(() => import('./pages/ProductsPage'))
const CustomersPage = lazyRetry(() => import('./pages/CustomersPage'))
const SalesPage = lazyRetry(() => import('./pages/SalesPage'))
const InstallmentsPage = lazyRetry(() => import('./pages/InstallmentsPage'))
const PaymentsPage = lazyRetry(() => import('./pages/PaymentsPage'))
const PaymentSchedulePage = lazyRetry(() => import('./pages/PaymentSchedulePage'))
const EmployeesPage = lazyRetry(() => import('./pages/EmployeesPage'))
const AttendancePage = lazyRetry(() => import('./pages/AttendancePage'))
const PayrollPage = lazyRetry(() => import('./pages/PayrollPage'))
const ReportsPage = lazyRetry(() => import('./pages/ReportsPage'))
const TransactionsPage = lazyRetry(() => import('./pages/TransactionsPage'))
const NotificationsPage = lazyRetry(() => import('./pages/NotificationsPage'))
const QrScannerPage = lazyRetry(() => import('./pages/QrScannerPage'))
const QrMonitoringPage = lazyRetry(() => import('./pages/QrMonitoringPage'))
const QrRequestsPage = lazyRetry(() => import('./pages/QrRequestsPage'))
const SupportPage = lazyRetry(() => import('./pages/SupportPage'))
const UsersPage = lazyRetry(() => import('./pages/SystemPage').then(m => ({ default: m.UsersPage })))
const SystemLogsPage = lazyRetry(() => import('./pages/SystemPage').then(m => ({ default: m.SystemLogsPage })))
const BackupsPage = lazyRetry(() => import('./pages/SystemPage').then(m => ({ default: m.BackupsPage })))
const SettingsPage = lazyRetry(() => import('./pages/SystemPage').then(m => ({ default: m.SettingsPage })))
const StoragePage = lazyRetry(() => import('./pages/SystemPage').then(m => ({ default: m.StoragePage })))
const SystemAdminDashboard = lazyRetry(() => import('./pages/SystemAdminDashboard'))
const BranchesPage = lazyRetry(() => import('./pages/BranchesPage'))
const CarouselPage = lazyRetry(() => import('./pages/CarouselPage'))
const StoreSettingsPage = lazyRetry(() => import('./pages/StoreSettingsPage'))

// Synchronize initial URL hash with browser pathname or saved route if needed
if (typeof window !== 'undefined') {
  const pathname = window.location.pathname
  const hash = window.location.hash
  const search = window.location.search
  const hasSession = !!sessionStorage.getItem('pace_session')
  const savedPath = sessionStorage.getItem('pace_last_path')

  if (pathname && pathname !== '/' && (!hash || hash === '#/' || hash === '#')) {
    const newHash = '#' + pathname + search
    window.location.hash = newHash
    try {
      window.history.replaceState(null, '', '/' + newHash)
    } catch (_) {}
  } else if (hasSession && (!hash || hash === '#/' || hash === '#') && savedPath && savedPath !== '/' && savedPath !== '/login') {
    // Only restore saved path if there is an active session; otherwise let user land on login
    const newHash = '#' + (savedPath.startsWith('/') ? savedPath : '/' + savedPath)
    window.location.hash = newHash
    try {
      window.history.replaceState(null, '', '/' + newHash)
    } catch (_) {}
  }
}

function getDefaultDashboard(role) {
  const r = (role || '').trim().toLowerCase()
  if (r === 'customer') return '/customer/dashboard'
  if (r === 'employee') return '/employee/dashboard'
  return '/dashboard'
}

function canUserAccessPath(role, path) {
  if (!path || path === '/' || path === '/login') return false
  const cleanPath = path.split('?')[0]
  const r = (role || '').trim().toLowerCase()

  if (r === 'customer') {
    return cleanPath.startsWith('/customer') || cleanPath === '/notifications'
  }
  if (r === 'employee') {
    return cleanPath.startsWith('/employee') || cleanPath === '/notifications'
  }
  if (r === 'store administrator' || r === 'store admin') {
    if (cleanPath.startsWith('/customer') || cleanPath.startsWith('/employee')) return false
    const adminOnly = [
      '/branches', '/admin-dashboard', '/qr-monitoring', '/admin/qr-monitoring',
      '/admin/qr-requests', '/users', '/system-logs', '/backups', '/settings', '/storage', '/system', '/payroll'
    ]
    return !adminOnly.includes(cleanPath)
  }
  if (r === 'administrator' || r === 'admin') {
    if (cleanPath.startsWith('/customer') || cleanPath.startsWith('/employee')) return false
    return true
  }
  return false
}

function FullPageLoader() {
  const [timedOut, setTimedOut] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      // If still loading after 12s, clear stale session and show login
      sessionStorage.removeItem('pace_session')
      window.dispatchEvent(new CustomEvent('auth:expired'))
      setTimedOut(true)
    }, 12000)
    return () => clearTimeout(timer)
  }, [])

  if (timedOut) {
    return <Navigate to="/login" replace />
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3" style={{ background: '#f4f6f9' }}>
      <Spinner className="w-10 h-10 text-[#2563eb]" />
      <p className="text-sm font-medium" style={{ color: '#64748b' }}>Verifying session...</p>
    </div>
  )
}

function RoutePersistenceTracker() {
  const location = useLocation()

  useEffect(() => {
    const publicSections = ['/', '/login', '/home', '/appliances', '/furniture', '/about', '/support']
    if (location.pathname && !publicSections.includes(location.pathname)) {
      const fullPath = location.pathname + location.search
      sessionStorage.setItem('pace_last_path', fullPath)
    }

    // Check for payment redirect query params
    const searchParams = new URLSearchParams(window.location.search || location.search)
    const paymentStatus = searchParams.get('payment_status')
    const ref = searchParams.get('ref')
    if (paymentStatus === 'success' && ref) {
      triggerDataSync('payments')
      triggerDataSync('sales')
      triggerDataSync('installments')
      try {
        window.history.replaceState(null, '', window.location.pathname + window.location.hash)
      } catch (_) {}
    }
  }, [location])

  return null
}

function SupportRouteDispatcher() {
  const { user, checkingAuth } = useAuth()
  if (checkingAuth) return <FullPageLoader />
  if (!user) {
    return (
      <PublicRoute>
        <LoginPage />
      </PublicRoute>
    )
  }
  const role = (user.role || '').trim().toLowerCase()
  if (role === 'administrator' || role === 'admin' || role === 'store administrator' || role === 'store admin') {
    return <Navigate to="/admin/support" replace />
  }
  return <Navigate to={getDefaultDashboard(user.role)} replace />
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
    const userRole = (user.role || '').trim().toLowerCase()
    const allowed = roles.map(r => r.trim().toLowerCase())
    if (!allowed.includes(userRole)) {
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
    const saved = sessionStorage.getItem('pace_last_path')
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
    const saved = sessionStorage.getItem('pace_last_path')
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
      <Suspense fallback={<FullPageLoader />}>
      <Routes>
        <Route
          path="/login"
          element={
            <PublicRoute>
              <LoginPage />
            </PublicRoute>
          }
        />
        <Route
          path="/home"
          element={
            <PublicRoute>
              <LoginPage />
            </PublicRoute>
          }
        />
        <Route
          path="/appliances"
          element={
            <PublicRoute>
              <LoginPage />
            </PublicRoute>
          }
        />
        <Route
          path="/furniture"
          element={
            <PublicRoute>
              <LoginPage />
            </PublicRoute>
          }
        />
        <Route
          path="/about"
          element={
            <PublicRoute>
              <LoginPage />
            </PublicRoute>
          }
        />
        <Route
          path="/support"
          element={<SupportRouteDispatcher />}
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
          <Route path="/employees" element={<RequireAuth roles={['Administrator', 'Store Administrator', 'Store Admin']}><EmployeesPage /></RequireAuth>} />
          <Route path="/admin/qr-requests" element={<RequireAuth roles={['Administrator']}><QrRequestsPage /></RequireAuth>} />
          <Route path="/attendance" element={<RequireAuth roles={['Administrator', 'Store Administrator', 'Store Admin']}><AttendancePage /></RequireAuth>} />
          <Route path="/attendance/qr" element={<RequireAuth roles={['Administrator', 'Store Administrator', 'Store Admin']}><AttendancePage /></RequireAuth>} />
          <Route path="/payroll" element={<RequireAuth roles={['Administrator']}><PayrollPage /></RequireAuth>} />
          <Route path="/reports" element={<RequireAuth roles={['Administrator', 'Store Administrator', 'Store Admin']}><ReportsPage /></RequireAuth>} />
          <Route path="/admin/support" element={<RequireAuth roles={['Administrator', 'Store Administrator', 'Store Admin']}><SupportPage /></RequireAuth>} />
          <Route path="/support" element={<RequireAuth roles={['Administrator', 'Store Administrator', 'Store Admin']}><SupportPage /></RequireAuth>} />
          <Route path="/notifications" element={<RequireAuth><NotificationsPage /></RequireAuth>} />
          <Route path="/employee/dashboard" element={<RequireAuth roles={['Employee']}><EmployeeDashboard /></RequireAuth>} />
          <Route path="/employee/attendance" element={<RequireAuth roles={['Employee']}><AttendancePage /></RequireAuth>} />
          <Route path="/employee/payroll" element={<RequireAuth roles={['Employee']}><PayrollPage /></RequireAuth>} />
          <Route path="/employee/payslips" element={<RequireAuth roles={['Employee']}><PayrollPage /></RequireAuth>} />
          <Route path="/employee/notifications" element={<RequireAuth roles={['Employee']}><NotificationsPage /></RequireAuth>} />

          {/* Store Administrator QR Attendance Terminal */}
          <Route path="/store-admin/attendance/scanner" element={<RequireAuth roles={['Store Administrator', 'Store Admin']}><QrScannerPage /></RequireAuth>} />
          <Route path="/store-settings" element={<RequireAuth roles={['Store Administrator', 'Store Admin']}><StoreSettingsPage /></RequireAuth>} />

          {/* Administrator only routes */}
          <Route path="/branches" element={<RequireAuth roles={['Administrator']}><BranchesPage /></RequireAuth>} />
          <Route path="/admin-dashboard" element={<RequireAuth roles={['Administrator']}><SystemAdminDashboard /></RequireAuth>} />
          <Route path="/qr-monitoring" element={<RequireAuth roles={['Administrator']}><QrMonitoringPage /></RequireAuth>} />
          <Route path="/admin/qr-monitoring" element={<RequireAuth roles={['Administrator']}><QrMonitoringPage /></RequireAuth>} />
          <Route path="/users" element={<RequireAuth roles={['Administrator']}><UsersPage /></RequireAuth>} />
          <Route path="/system-logs" element={<RequireAuth roles={['Administrator']}><SystemLogsPage /></RequireAuth>} />
          <Route path="/backups" element={<RequireAuth roles={['Administrator']}><BackupsPage /></RequireAuth>} />
          <Route path="/storage" element={<RequireAuth roles={['Administrator']}><StoragePage /></RequireAuth>} />
          <Route path="/system" element={<RequireAuth roles={['Administrator']}><UsersPage /></RequireAuth>} />
          <Route path="/settings" element={<RequireAuth roles={['Administrator']}><SettingsPage /></RequireAuth>} />
          <Route path="/settings/carousel" element={<RequireAuth roles={['Administrator']}><CarouselPage /></RequireAuth>} />
          
          {/* Customer Route inside AppShell */}
          <Route path="/customer/dashboard" element={<RequireAuth roles={['Customer']}><CustomerDashboard /></RequireAuth>} />
        </Route>

        <Route path="/" element={<RootRedirect />} />
        <Route path="*" element={<RootRedirect />} />
      </Routes>
      </Suspense>
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
