import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ToastContainer, ErrorBoundary, Spinner } from './components/ui'
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
import { UsersPage, SystemLogsPage, BackupsPage, SettingsPage } from './pages/SystemPage'
import SystemAdminDashboard from './pages/SystemAdminDashboard'
import BranchesPage from './pages/BranchesPage'

function FullPageLoader() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#0f1f3d] gap-3 text-white">
      <Spinner className="w-10 h-10 text-[#2563eb]" />
      <p className="text-sm font-medium text-white/70">Verifying session with server...</p>
    </div>
  )
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

  if (roles && !roles.includes(user.role)) {
    return <Navigate to={user.role === 'Customer' ? '/customer/dashboard' : (user.role === 'Employee' ? '/employee/dashboard' : '/dashboard')} replace />
  }

  return children
}

function PublicRoute({ children }) {
  const { user, checkingAuth } = useAuth()

  if (checkingAuth) {
    return <FullPageLoader />
  }

  if (user) {
    return <Navigate to={user.role === 'Customer' ? '/customer/dashboard' : (user.role === 'Employee' ? '/employee/dashboard' : '/dashboard')} replace />
  }

  return children
}

function RootRedirect() {
  const { user, checkingAuth } = useAuth()

  if (checkingAuth) {
    return <FullPageLoader />
  }

  if (user) {
    return <Navigate to={user.role === 'Customer' ? '/customer/dashboard' : (user.role === 'Employee' ? '/employee/dashboard' : '/dashboard')} replace />
  }

  return <Navigate to="/login" replace />
}

function AppRoutes() {
  return (
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
        <Route path="/dashboard" element={<RequireAuth roles={['Administrator', 'Store Administrator']}><DashboardPage /></RequireAuth>} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/customers" element={<CustomersPage />} />
        <Route path="/sales" element={<SalesPage />} />
        <Route path="/transactions" element={<TransactionsPage />} />
        <Route path="/installments" element={<InstallmentsPage />} />
        <Route path="/payment-schedule" element={<PaymentSchedulePage />} />
        <Route path="/payments" element={<PaymentsPage />} />
        <Route path="/employees" element={<RequireAuth roles={['Administrator', 'Store Administrator', 'Store Admin', 'Employee']}><EmployeesPage /></RequireAuth>} />
        <Route path="/admin/qr-requests" element={<RequireAuth roles={['Administrator']}><QrRequestsPage /></RequireAuth>} />
        <Route path="/attendance" element={<AttendancePage />} />
        <Route path="/attendance/qr" element={<AttendancePage />} />
        <Route path="/payroll" element={<RequireAuth roles={['Administrator']}><PayrollPage /></RequireAuth>} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/employee/dashboard" element={<RequireAuth roles={['Employee']}><EmployeeDashboard /></RequireAuth>} />
        <Route path="/employee/attendance" element={<AttendancePage />} />
        <Route path="/employee/payroll" element={<PayrollPage />} />
        <Route path="/employee/payslips" element={<PayrollPage />} />
        <Route path="/employee/notifications" element={<NotificationsPage />} />

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
        
        {/* Customer Route inside AppShell */}
        <Route path="/customer/dashboard" element={<RequireAuth roles={['Customer']}><CustomerDashboard /></RequireAuth>} />
      </Route>


      <Route path="/" element={<RootRedirect />} />
      <Route path="*" element={<RootRedirect />} />
    </Routes>
  )
}

export default function App() {
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
