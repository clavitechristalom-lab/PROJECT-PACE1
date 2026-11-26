import { useState, useRef, useEffect, Suspense } from 'react'
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import {
  FiHome, FiPackage, FiUsers, FiShoppingCart, FiCreditCard,
  FiCalendar, FiUser, FiClock, FiFileText,
  FiBarChart2, FiSettings, FiShield, FiDatabase, FiActivity,
  FiSun, FiMoon, FiSearch, FiLogOut, FiMenu, FiChevronDown,
  FiCheckCircle, FiX, FiBell, FiCamera, FiLayers, FiMessageSquare, FiHardDrive,
  FiGitBranch
} from 'react-icons/fi'
import { LuBuilding2 } from 'react-icons/lu'
import { useAuth } from '../../context/AuthContext'
import { useRealtimeConnection } from '../../context/RealtimeSyncContext'
import { NotificationBell, showToast, Spinner } from '../ui'
import { api } from '../../lib/api'
import { triggerDataSync } from '../../lib/realtimeSync'
import { fastDeepEqual } from '../../lib/utils'
import { useTheme } from '../../context/ThemeContext'
import CompanyConfigurationModal, { resolveLogoUrl } from '../CompanyConfigurationModal'
import EmployeePinVerificationModal from '../attendance/EmployeePinVerificationModal'
import FaceRecognitionAttendanceModal from '../attendance/FaceRecognitionAttendanceModal'
import { TbCurrencyPeso, TbCashBanknoteMove, TbCashRegister } from 'react-icons/tb'
import { isCollectorUser, isCashierUser } from '../../lib/employeeDepartment'

const icons = {
  dashboard: <FiHome className="w-4 h-4 flex-shrink-0" />,
  products: <FiPackage className="w-4 h-4 flex-shrink-0" />,
  categories: <FiLayers className="w-4 h-4 flex-shrink-0" />,
  customers: <FiUser className="w-4 h-4 flex-shrink-0" />,
  sales: <FiShoppingCart className="w-4 h-4 flex-shrink-0" />,
  installment: <FiCreditCard className="w-4 h-4 flex-shrink-0" />,
  schedule: <FiCalendar className="w-4 h-4 flex-shrink-0" />,
  payments: <TbCurrencyPeso className="w-4 h-4 flex-shrink-0" />,
  collectCash: <TbCashBanknoteMove className="w-4 h-4 flex-shrink-0" />,
  receiveCash: <TbCashRegister className="w-4 h-4 flex-shrink-0" />,
  employees: <FiUsers className="w-4 h-4 flex-shrink-0" />,
  payroll: <TbCurrencyPeso className="w-4 h-4 flex-shrink-0" />,
  attendance: <FiClock className="w-4 h-4 flex-shrink-0" />,
  qr: <FiCamera className="w-4 h-4 flex-shrink-0" />,
  reports: <FiBarChart2 className="w-4 h-4 flex-shrink-0" />,
  users: <FiShield className="w-4 h-4 flex-shrink-0" />,
  shield: <FiShield className="w-4 h-4 flex-shrink-0" />,
  branches: <LuBuilding2 className="w-4 h-4 flex-shrink-0" />,
  logs: <FiFileText className="w-4 h-4 flex-shrink-0" />,
  backup: <FiDatabase className="w-4 h-4 flex-shrink-0" />,
  settings: <FiSettings className="w-4 h-4 flex-shrink-0" />,
  history: <FiActivity className="w-4 h-4 flex-shrink-0" />,
  payslip: <FiFileText className="w-4 h-4 flex-shrink-0" />,
  notifications: <FiBell className="w-4 h-4 flex-shrink-0" />,
  support: <FiMessageSquare className="w-4 h-4 flex-shrink-0" />,
  storage: <FiHardDrive className="w-4 h-4 flex-shrink-0" />,
}

function isNavPathActive(itemPath, location, subPaths = []) {
  if (!itemPath || !location) return false
  const currentFull = location.pathname + (location.search || '')
  if (itemPath.includes('?')) {
    return currentFull === itemPath
  }
  if (location.search && location.search.length > 0) {
    const sp = new URLSearchParams(location.search)
    if (itemPath === '/products' && sp.get('view') === 'categories') {
      return false
    }
    if (itemPath !== '/products') {
      return false
    }
  }
  if (itemPath === '/dashboard') {
    return location.pathname === '/' || location.pathname === '/dashboard'
  }
  if (location.pathname === itemPath) return true
  if (itemPath !== '/' && location.pathname.startsWith(`${itemPath}/`)) return true
  if (subPaths?.some(sp => location.pathname === sp || location.pathname.startsWith(`${sp}/`))) return true
  return false
}

function navByRole(roleOrUser, onOpenConfig, pendingLettersCount = 0) {
  const userObj = roleOrUser && typeof roleOrUser === 'object' ? roleOrUser : null
  const role = userObj ? userObj.role : roleOrUser

  if (role === 'Employee') {
    const empItems = [
      { label: 'My Dashboard', path: '/employee/dashboard', icon: icons.dashboard },
    ]
    if (isCollectorUser(userObj)) {
      empItems.push({ label: 'Collect Cash', path: '/employee/collect-cash', icon: icons.collectCash })
    }
    if (isCashierUser(userObj)) {
      empItems.push({ label: 'Receive Cash', path: '/employee/receive-cash', icon: icons.receiveCash })
    }
    empItems.push(
      { label: 'My Attendance QR', path: '/employee/attendance', icon: icons.attendance },
      { label: 'My Payslips', path: '/employee/payslips', icon: icons.payslip },
      { label: 'Create Excuse / Leave Letter', path: '/employee/excuse-letter', icon: icons.logs },
    )
    return empItems
  }

  if (role === 'Customer') {
    return [
      { label: 'My Dashboard', path: '/customer/dashboard', icon: icons.dashboard },
      { label: 'Product List', path: '/customer/dashboard?tab=products', icon: icons.products },
      { label: 'Installments', path: '/customer/dashboard?tab=installments', icon: icons.installment },
      { label: 'Statements', path: '/customer/dashboard?tab=statements', icon: icons.payslip },
      { label: 'Payment Schedule', path: '/customer/dashboard?tab=schedule', icon: icons.schedule },
      { label: 'Customer Support', path: '/customer/dashboard?tab=support', icon: icons.support },
    ]
  }

  const business = {
    label: 'Business Management',
    icon: icons.sales,
    items: [
      { label: 'Products / Inventory', path: '/products', icon: icons.products },
      { label: 'Category Products', path: '/products?view=categories', icon: icons.categories },
      { label: 'Customers', path: '/customers', icon: icons.customers },
      { label: 'Sales Transactions', path: '/sales', icon: icons.sales },
      { label: 'Transaction History', path: '/transactions', icon: icons.history },
    ],
  }

  const installment = {
    label: 'Installment Monitoring',
    icon: icons.installment,
    items: [
      { label: 'Installments', path: '/installments', icon: icons.installment },
      { label: 'Payment Schedule', path: '/payment-schedule', icon: icons.schedule },
      { label: 'Payments', path: '/payments', icon: icons.payments },
    ],
  }

  const payroll = {
    label: 'Payroll & HR',
    icon: icons.payroll,
    items: [
      { label: 'Employees & QR Badges', path: '/employees', icon: icons.employees },
      { label: 'QR Requests', path: '/admin/qr-requests', icon: icons.qr },
      { label: 'Payroll', path: '/payroll', icon: icons.payroll },
    ],
  }

  const system = {
    label: 'System Management',
    icon: icons.settings,
    items: [
      { label: 'Admin Interface', path: '/admin-dashboard', icon: icons.shield },
      { label: 'Branches', path: '/branches', icon: icons.branches },
      { label: 'Users', path: '/users', icon: icons.users },
    ],
  }

  const isAdmin = role === 'Administrator'
  const isStoreAdmin = role === 'Store Administrator' || role === 'Store Admin'

  const base = [
    { label: 'Dashboard', path: '/dashboard', icon: icons.dashboard },
  ]

  base.push(business)
  base.push(installment)

  if (isAdmin) {
    base.push(payroll)
  } else if (isStoreAdmin) {
    // Store Admins see their branch staff, QR scanner, and store settings
    base.push({
      label: 'Branch Operations',
      icon: icons.employees,
      items: [
        { label: 'Employees & QR', path: '/employees', icon: icons.employees },
        { label: 'QR Attendance Scanner', path: '/store-admin/attendance/scanner', icon: icons.qr },
      ],
    })
  }

  base.push({ label: isAdmin ? 'Attendance Logs' : 'Branch Attendance', path: '/attendance', icon: icons.attendance })

  // Admin & Store Admin Excuse Letter menu item (dedicated, strictly separate from Customer Support)
  base.push({
    label: 'Excuse Letter',
    path: '/admin/excuse-letters',
    icon: icons.logs,
    badge: pendingLettersCount > 0 ? pendingLettersCount : null,
  })

  base.push({ label: 'Reports', path: '/reports', icon: icons.reports })

  base.push({ label: 'Customer Support', path: '/admin/support', icon: icons.support })

  if (isAdmin) {
    base.push(system)
  }

  return base
}

function SidebarGroup({ group, collapsed }) {
  const location = useLocation()
  const isActive = group.items.some(i => isNavPathActive(i.path, location))
  const [open, setOpen] = useState(isActive)

  useEffect(() => {
    if (isActive) setOpen(true)
  }, [isActive])

  return (
    <div>
      <button
        onClick={() => !collapsed && setOpen(o => !o)}
        title={collapsed ? group.label : undefined}
        className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer rounded-xl mx-1 ${isActive ? 'text-blue-700 dark:text-blue-300' : 'text-slate-700 dark:text-blue-200/70 hover:text-blue-800 dark:hover:text-white hover:bg-blue-500/10'
          }`}
        style={{ width: collapsed ? 44 : 'calc(100% - 8px)' }}
      >
        <span className="flex-shrink-0 text-blue-700 dark:text-blue-400">{group.icon}</span>
        {!collapsed && (
          <>
            <span className="flex-1 text-left truncate">{group.label}</span>
            <FiChevronDown className={`w-3.5 h-3.5 transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`} />
          </>
        )}
      </button>
      {(open || collapsed) && (
        <div className={collapsed ? '' : 'ml-3 border-l border-blue-500/25 pl-2 space-y-0.5 mt-0.5'}>
          {group.items.map(item => {
            const active = isNavPathActive(item.path, location)
            return (
              <NavLink
                key={item.path}
                to={item.path}
                title={collapsed ? item.label : undefined}
                className={() =>
                  `flex items-center gap-2.5 px-3 py-2 text-xs rounded-xl transition-all cursor-pointer ${active
                    ? 'bg-gradient-to-r from-blue-600 via-blue-600 to-indigo-700 text-white font-bold shadow-md shadow-blue-950/40 border border-blue-400/30'
                    : 'text-slate-700 dark:text-blue-100/70 hover:bg-blue-500/10 hover:text-blue-950 dark:hover:text-white'
                  }`
                }
              >
                <span className={`flex-shrink-0 ${active ? 'text-white' : 'text-blue-700 dark:text-blue-400'}`}>{item.icon}</span>
                {!collapsed && <span className="truncate">{item.label}</span>}
              </NavLink>
            )
          })}
        </div>
      )}
    </div>
  )
}

function getCollapsedRailItems(roleOrUser, onOpenConfig, pendingLettersCount = 0) {
  const userObj = roleOrUser && typeof roleOrUser === 'object' ? roleOrUser : null
  const role = userObj ? userObj.role : roleOrUser

  if (role === 'Employee') {
    const rail = [
      { label: 'My Dashboard', path: '/employee/dashboard', icon: <FiHome className="w-5 h-5" /> },
    ]
    if (isCollectorUser(userObj)) {
      rail.push({ label: 'Collect Cash', path: '/employee/collect-cash', icon: <TbCashBanknoteMove className="w-5 h-5" /> })
    }
    if (isCashierUser(userObj)) {
      rail.push({ label: 'Receive Cash', path: '/employee/receive-cash', icon: <TbCashRegister className="w-5 h-5" /> })
    }
    rail.push(
      { label: 'My Attendance QR', path: '/employee/attendance', icon: <FiClock className="w-5 h-5" /> },
      { label: 'My Payslips', path: '/employee/payslips', icon: <FiFileText className="w-5 h-5" /> },
      { label: 'Create Excuse / Leave Letter', path: '/employee/excuse-letter', icon: <FiFileText className="w-5 h-5" /> },
    )
    return rail
  }

  if (role === 'Customer') {
    return [
      { label: 'My Dashboard', path: '/customer/dashboard', icon: <FiHome className="w-5 h-5" /> },
      { label: 'Product List', path: '/customer/dashboard?tab=products', icon: <LuBuilding2 className="w-5 h-5" /> },
      { label: 'Installments', path: '/customer/dashboard?tab=installments', icon: <FiCreditCard className="w-5 h-5" /> },
      { label: 'Statements', path: '/customer/dashboard?tab=statements', icon: <FiFileText className="w-5 h-5" /> },
      { label: 'Payment Schedule', path: '/customer/dashboard?tab=schedule', icon: <FiCalendar className="w-5 h-5" /> },
      { label: 'Customer Support', path: '/customer/dashboard?tab=support', icon: <FiMessageSquare className="w-5 h-5" /> },
    ]
  }

  const isAdmin = role === 'Administrator'
  const isStoreAdmin = role === 'Store Administrator' || role === 'Store Admin'

  const items = [
    // 1. Dashboard Home
    { label: 'Dashboard', path: '/dashboard', icon: <FiHome className="w-5 h-5" /> },

    // 2. Business Management / Sales
    { label: 'Sales Transactions', path: '/sales', icon: <FiShoppingCart className="w-5 h-5" /> },

    // 3. Products / Inventory & Category Products
    { label: 'Products / Inventory', path: '/products', icon: <FiPackage className="w-5 h-5" /> },
    { label: 'Category Products', path: '/products?view=categories', icon: <FiLayers className="w-5 h-5" /> },

    // 4. Customers
    { label: 'Customers', path: '/customers', icon: <FiUser className="w-5 h-5" /> },

    // 5. Transaction History / Activity
    { label: 'Transaction History', path: '/transactions', icon: <FiActivity className="w-5 h-5 stroke-[2.2]" /> },

    // 7. Installments
    { label: 'Installment Monitoring', path: '/installments', icon: <FiCreditCard className="w-5 h-5" /> },

    // 8. Payment Schedule
    { label: 'Payment Schedule', path: '/payment-schedule', icon: <FiCalendar className="w-5 h-5" /> },

    // 9. Payments (Peso)
    { label: 'Payments', path: '/payments', icon: <TbCurrencyPeso className="w-5 h-5 stroke-[2.2]" /> },

    // 10. Employees & QR Badges
    { label: 'Employees & QR Badges', path: '/employees', icon: <FiUsers className="w-5 h-5" /> },
  ]

  if (isAdmin) {
    // 13. QR Requests (Camera)
    items.push({ label: 'QR Requests', path: '/admin/qr-requests', icon: <FiCamera className="w-5 h-5" /> })

    // 14. Payroll & HR (Peso)
    items.push({ label: 'Payroll & HR', path: '/payroll', icon: <TbCurrencyPeso className="w-5 h-5 stroke-[2.2]" /> })
  } else if (isStoreAdmin) {
    items.push({ label: 'QR Attendance Scanner', path: '/store-admin/attendance/scanner', icon: <FiCamera className="w-5 h-5" /> })
  }

  // 15. Attendance (Clock)
  items.push({ label: 'Attendance Records', path: '/attendance', icon: <FiClock className="w-5 h-5" /> })

  // 15b. Excuse Letter (FileText)
  items.push({
    label: 'Excuse Letter',
    path: '/admin/excuse-letters',
    icon: <FiFileText className="w-5 h-5" />,
    badge: pendingLettersCount > 0 ? pendingLettersCount : null,
  })

  // 16. Reports (BarChart)
  items.push({ label: 'Reports', path: '/reports', icon: <FiBarChart2 className="w-5 h-5" /> })

  // 17. Customer Support (Chat)
  items.push({ label: 'Customer Support', path: '/admin/support', icon: <FiMessageSquare className="w-5 h-5" /> })

  // 18. System Management (Admin Interface, Branches, Users)
  if (isAdmin) {
    items.push({
      label: 'Admin Interface',
      path: '/admin-dashboard',
      icon: <FiSettings className="w-5 h-5" />,
    })
    items.push({
      label: 'Branches',
      path: '/branches',
      icon: <LuBuilding2 className="w-5 h-5" />,
    })
    items.push({
      label: 'Users',
      path: '/users',
      icon: <FiShield className="w-5 h-5" />,
    })
  }

  return items
}

function SidebarStoreAdminProfile({ user, collapsed = false, onNavigate }) {
  const displayName =
    user?.name ||
    (user?.employee ? `${user.employee.first_name || ''} ${user.employee.last_name || ''}`.trim() : '') ||
    user?.username ||
    'Store Admin'
  const branchName =
    user?.employee?.branch?.name ||
    (typeof user?.employee?.branch === 'string' && user.employee.branch) ||
    user?.employee?.branch_name ||
    user?.branch_name ||
    ''
  const avatarLetter = displayName ? displayName.charAt(0).toUpperCase() : 'S'

  if (collapsed) {
    return (
      <div className="p-2 border-t border-r border-blue-500/15 dark:border-blue-500/20 flex justify-center flex-shrink-0">
        <NavLink
          to="/store-admin/profile"
          onClick={() => onNavigate?.()}
          title={`Employee Profile — ${displayName}`}
          aria-label="Employee Profile"
          className={({ isActive }) => `relative w-11 h-11 rounded-[14px] font-bold text-xs flex items-center justify-center shadow-md transition-all cursor-pointer active:scale-95 group overflow-visible ${isActive
            ? 'bg-gradient-to-br from-blue-600 to-indigo-700 text-white ring-2 ring-blue-400/70 shadow-blue-600/35'
            : 'bg-gradient-to-br from-blue-600 to-indigo-700 text-white hover:brightness-110'
            }`}
        >
          {user?.profile_image ? (
            <img src={user.profile_image} alt={displayName} className="w-full h-full object-cover rounded-[14px]" />
          ) : (
            <span>{avatarLetter}</span>
          )}
          <span className="pointer-events-none absolute left-14 z-50 whitespace-nowrap rounded-lg bg-slate-900 dark:bg-slate-800 px-2.5 py-1 text-xs font-semibold text-white shadow-xl opacity-0 transition-opacity group-hover:opacity-100 hidden md:block">
            Employee Profile
          </span>
        </NavLink>
      </div>
    )
  }

  return (
    <div className="p-2.5 border-t border-r border-blue-500/15 dark:border-blue-500/20 flex-shrink-0">
      <NavLink
        to="/store-admin/profile"
        onClick={() => onNavigate?.()}
        className={({ isActive }) => `w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl border transition-all cursor-pointer text-left shadow-2xs group ${isActive
          ? 'bg-gradient-to-r from-blue-600 via-blue-600 to-indigo-700 border-blue-400/40 text-white shadow-md shadow-blue-950/30'
          : 'border-blue-500/20 bg-white/85 dark:bg-[#0c1b3a]/90 hover:bg-blue-50 dark:hover:bg-blue-500/15'
          }`}
      >
        {({ isActive }) => (
          <>
            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold overflow-hidden shadow-xs shrink-0 border ${isActive
              ? 'bg-white/20 border-white/40 text-white'
              : 'bg-gradient-to-br from-blue-600 to-indigo-700 border-blue-400/30 text-white'
              }`}>
              {user?.profile_image ? (
                <img src={user.profile_image} alt={displayName} className="w-full h-full object-cover" />
              ) : (
                avatarLetter
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className={`text-xs font-bold truncate leading-tight ${isActive ? 'text-white' : 'text-slate-900 dark:text-white'}`}>
                {displayName}
              </div>
              <div className={`text-[10px] font-semibold truncate leading-tight mt-0.5 ${isActive ? 'text-blue-100' : 'text-blue-700 dark:text-blue-300'}`}>
                Employee Profile{branchName ? ` • ${branchName}` : ''}
              </div>
            </div>
            <FiUser className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-white' : 'text-blue-600 dark:text-blue-400 opacity-75 group-hover:opacity-100'}`} />
          </>
        )}
      </NavLink>
    </div>
  )
}

function Sidebar({ collapsed, settings, mobileOpen, onCloseMobile, onOpenConfig }) {
  const { user } = useAuth()
  const { isDark } = useTheme()
  const isLogoDark = isDark
  const location = useLocation()
  const [pendingLettersCount, setPendingLettersCount] = useState(0)
  const isStoreAdmin = user?.role === 'Store Administrator' || user?.role === 'Store Admin'

  // Real-time pending count for sidebar notification badge
  useEffect(() => {
    if (!user || user.role === 'Customer') return
    let isMounted = true
    const fetchSummary = async () => {
      try {
        const res = await api.employeeLetters.getSummary()
        if (isMounted && typeof res?.pending_count === 'number') {
          setPendingLettersCount(res.pending_count)
        }
      } catch (_) { }
    }
    fetchSummary()
    return () => { isMounted = false }
  }, [user])

  const navItems = user ? navByRole(user, onOpenConfig, pendingLettersCount) : []
  const railItems = user ? getCollapsedRailItems(user, onOpenConfig, pendingLettersCount) : []

  if (!user) return null

  const companyName = settings?.site_name || settings?.company_name || 'Z-LICZ'
  const siteName = settings?.site_name || settings?.company_name || 'Z-LICZ Appliances'

  const isItemActive = (item) => {
    if (item.action) return false
    return isNavPathActive(item.path, location, item.subPaths)
  }

  return (
    <>
      {/* ─── MOBILE DRAWER (SLIDES OUT ON TOGGLE ON MOBILE/TABLET) ─── */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 lg:hidden animate-[fadeIn_0.15s_ease]"
            onClick={onCloseMobile}
          />
          <aside
            className="sidebar-shell fixed inset-y-0 left-0 z-50 w-[260px] bg-[#F5F5F5] dark:bg-[#071328] border-r border-slate-300/80 dark:border-blue-500/20 shadow-2xl flex flex-col h-full overflow-hidden animate-[slideRight_0.2s_ease]"
          >
            {/* Drawer Logo */}
            <div className="brand-logo-shell relative flex flex-col items-center justify-center px-3 py-4 sm:py-5 border-b flex-shrink-0 overflow-hidden transition-colors duration-200">
              <button
                onClick={onCloseMobile}
                className={`absolute top-3 right-3 p-1.5 rounded-lg cursor-pointer transition-colors z-10 ${isLogoDark
                  ? 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                  : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                aria-label="Close menu"
              >
                <FiX className="w-5 h-5" />
              </button>
              <img
                src={resolveLogoUrl(settings?.logo_url || settings?.logo) || '/zlicz-logo.png'}
                alt="Z-LICZ Furniture & Appliances Trading"
                className="w-full max-w-[220px] h-24 sm:h-28 object-contain mx-auto drop-shadow-md"
                onError={(e) => {
                  if (e.currentTarget.src !== window.location.origin + '/zlicz-logo.png' && !e.currentTarget.src.endsWith('/zlicz-logo.png')) {
                    e.currentTarget.src = '/zlicz-logo.png'
                  }
                }}
              />
            </div>

            {/* Drawer Nav */}
            <nav className="flex-1 overflow-y-auto py-3 space-y-0.5 px-1.5" onClick={onCloseMobile}>
              {navItems.map((entry, i) =>
                entry.items ? (
                  <SidebarGroup key={i} group={entry} collapsed={false} />
                ) : entry.action ? (
                  <button
                    key={entry.label}
                    onClick={(e) => { e.preventDefault(); entry.action(); }}
                    className="w-full text-left flex items-center gap-2.5 px-3 py-2 text-xs rounded-xl transition-all cursor-pointer text-slate-700 dark:text-blue-100/70 hover:bg-blue-500/10 hover:text-blue-950 dark:hover:text-white"
                  >
                    <span className="flex-shrink-0 text-blue-700 dark:text-blue-400">{entry.icon}</span>
                    <span className="truncate flex-1">{entry.label}</span>
                  </button>
                ) : (
                  <NavLink
                    key={entry.path}
                    to={entry.path}
                    className={() => {
                      const active = isItemActive(entry)
                      return `flex items-center gap-2.5 px-3 py-2 text-xs rounded-xl transition-all cursor-pointer ${active
                        ? 'bg-gradient-to-r from-blue-600 via-blue-600 to-indigo-700 text-white font-bold shadow-md shadow-blue-950/40 border border-blue-400/30'
                        : 'text-slate-700 dark:text-blue-100/70 hover:bg-blue-500/10 hover:text-blue-950 dark:hover:text-white'
                        }`
                    }}
                  >
                    {() => {
                      const active = isItemActive(entry)
                      return (
                        <>
                          <span className={`flex-shrink-0 ${active ? 'text-white' : 'text-blue-700 dark:text-blue-400'}`}>{entry.icon}</span>
                          <span className="truncate flex-1">{entry.label}</span>
                          {entry.badge && (
                            <span className="text-[10px] font-bold font-mono bg-rose-600 text-white px-1.5 py-0.2 rounded-full shrink-0">
                              {entry.badge}
                            </span>
                          )}
                        </>
                      )
                    }}
                  </NavLink>
                )
              )}
            </nav>
            {isStoreAdmin && (
              <SidebarStoreAdminProfile
                user={user}
                collapsed={false}
                onNavigate={onCloseMobile}
              />
            )}
          </aside>
        </>
      )}

      {/* ─── SIDEBAR: TOGGLED BETWEEN ICON-ONLY MINI RAIL AND FULL EXPANDED SIDEBAR ─── */}
      {collapsed ? (
        /* Icon-Only Mini Sidebar */
        <aside
          className="sidebar-shell flex flex-col h-full overflow-hidden flex-shrink-0 select-none z-30 print:hidden transition-all duration-200 border-r-0 bg-[#F5F5F5] dark:bg-[#071328] w-[68px] min-w-[68px]"
        >
          {/* Mini Brand Logo Header */}
          <div className="brand-logo-shell h-14 flex items-center justify-center border-b border-r-0 flex-shrink-0 overflow-hidden transition-colors duration-200">
            <img
              src={resolveLogoUrl(settings?.logo_url || settings?.logo) || '/zlicz-logo.png'}
              alt="Z-LICZ"
              className="w-10 h-8 object-contain mx-auto drop-shadow-sm"
              onError={(e) => {
                if (e.currentTarget.src !== window.location.origin + '/zlicz-logo.png' && !e.currentTarget.src.endsWith('/zlicz-logo.png')) {
                  e.currentTarget.src = '/zlicz-logo.png'
                }
              }}
            />
          </div>
          <div className="flex-1 overflow-y-auto overflow-x-hidden py-3 px-2 flex flex-col items-center gap-2 border-r border-blue-500/15 dark:border-blue-500/20 [scrollbar-width:thin] [scrollbar-color:rgba(59,130,246,0.25)_transparent] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-blue-500/25 [&::-webkit-scrollbar-thumb]:rounded-full">
            {railItems.map((item, idx) => {
              const active = isItemActive(item)

              if (item.action) {
                return (
                  <button
                    key={`rail-action-${idx}`}
                    type="button"
                    onClick={item.action}
                    title={item.label}
                    className="relative w-11 h-11 rounded-[14px] text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 flex items-center justify-center cursor-pointer flex-shrink-0 transition-all active:scale-95 group"
                    aria-label={item.label}
                  >
                    <span className="flex items-center justify-center [&>svg]:w-5 [&>svg]:h-5 [&>svg]:stroke-[2.2] text-blue-600 dark:text-blue-400">
                      {item.icon}
                    </span>
                    <span className="pointer-events-none absolute left-14 z-50 whitespace-nowrap rounded-lg bg-slate-900 dark:bg-slate-800 px-2.5 py-1 text-xs font-semibold text-white shadow-xl opacity-0 transition-opacity group-hover:opacity-100 hidden md:block">
                      {item.label}
                    </span>
                  </button>
                )
              }

              return (
                <NavLink
                  key={`rail-link-${item.path}-${idx}`}
                  to={item.path}
                  title={item.label}
                  className={`relative w-11 h-11 rounded-[14px] flex items-center justify-center cursor-pointer flex-shrink-0 transition-all active:scale-95 group ${active
                    ? 'bg-gradient-to-b from-blue-600 via-blue-600 to-indigo-600 text-white shadow-[0_8px_20px_-4px_rgba(37,99,235,0.45)]'
                    : 'text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/30'
                    }`}
                  aria-label={item.label}
                >
                  <span className={`flex items-center justify-center [&>svg]:w-5 [&>svg]:h-5 [&>svg]:stroke-[2.2] ${active ? 'text-white' : 'text-blue-600 dark:text-blue-400'}`}>
                    {item.icon}
                  </span>
                  {item.badge ? (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-600 text-white text-[9px] font-bold rounded-full flex items-center justify-center shadow-xs">
                      {item.badge}
                    </span>
                  ) : null}
                  <span className="pointer-events-none absolute left-14 z-50 whitespace-nowrap rounded-lg bg-slate-900 dark:bg-slate-800 px-2.5 py-1 text-xs font-semibold text-white shadow-xl opacity-0 transition-opacity group-hover:opacity-100 hidden md:block">
                    {item.label}
                  </span>
                </NavLink>
              )
            })}
          </div>
          {isStoreAdmin && (
            <SidebarStoreAdminProfile
              user={user}
              collapsed={true}
            />
          )}
        </aside>
      ) : (
        /* Full Expanded Sidebar */
        <aside
          className="sidebar-shell flex flex-col h-full overflow-hidden flex-shrink-0 transition-all duration-200 select-none z-30 print:hidden border-r-0 bg-[#F5F5F5] dark:bg-[#071328] w-[240px] min-w-[240px]"
        >
          {/* Brand Logo Header */}
          <div className="brand-logo-shell flex flex-col items-center justify-center px-3 py-4 sm:py-5 border-b border-r-0 flex-shrink-0 overflow-hidden transition-colors duration-200">
            <img
              src={resolveLogoUrl(settings?.logo_url || settings?.logo) || '/zlicz-logo.png'}
              alt="Z-LICZ Furniture & Appliances Trading"
              className="w-full max-w-[216px] h-24 sm:h-28 object-contain mx-auto drop-shadow-md transition-transform duration-300 hover:scale-105"
              onError={(e) => {
                if (e.currentTarget.src !== window.location.origin + '/zlicz-logo.png' && !e.currentTarget.src.endsWith('/zlicz-logo.png')) {
                  e.currentTarget.src = '/zlicz-logo.png'
                }
              }}
            />
          </div>

          {/* Nav */}
          <nav className="flex-1 overflow-y-auto py-3 space-y-0.5 px-1.5 border-r border-blue-500/15 dark:border-blue-500/20">
            {navItems.map((entry, i) =>
              entry.items ? (
                <SidebarGroup key={i} group={entry} collapsed={false} />
              ) : entry.action ? (
                <button
                  key={entry.label}
                  onClick={(e) => { e.preventDefault(); entry.action(); }}
                  className="w-full text-left flex items-center gap-2.5 px-3 py-2 text-xs rounded-xl transition-all cursor-pointer text-slate-700 dark:text-blue-100/70 hover:bg-blue-500/10 hover:text-blue-950 dark:hover:text-white"
                >
                  <span className="flex-shrink-0 text-blue-700 dark:text-blue-400">{entry.icon}</span>
                  <span className="truncate flex-1">{entry.label}</span>
                </button>
              ) : (
                <NavLink
                  key={entry.path}
                  to={entry.path}
                  className={() => {
                    const active = isItemActive(entry)
                    return `flex items-center gap-2.5 px-3 py-2 text-xs rounded-xl transition-all cursor-pointer ${active
                      ? 'bg-gradient-to-r from-blue-600 via-blue-600 to-indigo-700 text-white font-bold shadow-md shadow-blue-950/40 border border-blue-400/30'
                      : 'text-slate-700 dark:text-blue-100/70 hover:bg-blue-500/10 hover:text-blue-950 dark:hover:text-white'
                      }`
                  }}
                >
                  {() => {
                    const active = isItemActive(entry)
                    return (
                      <>
                        <span className={`flex-shrink-0 ${active ? 'text-white' : 'text-blue-700 dark:text-blue-400'}`}>{entry.icon}</span>
                        <span className="truncate flex-1">{entry.label}</span>
                        {entry.badge && (
                          <span className="text-[10px] font-bold font-mono bg-rose-600 text-white px-1.5 py-0.2 rounded-full shrink-0">
                            {entry.badge}
                          </span>
                        )}
                      </>
                    )
                  }}
                </NavLink>
              )
            )}
          </nav>
          {isStoreAdmin && (
            <SidebarStoreAdminProfile
              user={user}
              collapsed={false}
            />
          )}
        </aside>
      )}
    </>
  )
}

function RealTimeClock({ isHeaderDark = false }) {
  const [time, setTime] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="hidden lg:flex flex-col items-end mr-4 text-right">
      <span className={`text-xs font-bold font-mono tracking-tight ${isHeaderDark ? 'text-white' : 'text-slate-900'}`}>
        {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </span>
      <span className={`text-[10px] font-semibold uppercase tracking-wider ${isHeaderDark ? 'text-blue-400' : 'text-blue-700'}`}>
        {time.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
      </span>
    </div>
  )
}

function Header({
  title,
  onToggle,
  notifs,
  unreadCount,
  onMarkAllRead,
  onNotificationClick,
  onRefreshNotifs,
  onOpenConfig,
}) {
  const { user, logout } = useAuth()
  const isStoreAdm = user?.role === 'Store Administrator' || user?.role === 'Store Admin'
  const { isDark, toggleMode } = useTheme()
  const isHeaderDark = isDark
  const [userOpen, setUserOpen] = useState(false)
  const userRef = useRef(null)
  const navigate = useNavigate()

  // Global Search State
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [groupedResults, setGroupedResults] = useState({})
  const [totalMatches, setTotalMatches] = useState(0)
  const [isSearching, setIsSearching] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const searchRef = useRef(null)
  const searchInputRef = useRef(null)
  const listRef = useRef(null)

  useEffect(() => {
    const fn = (e) => {
      if (userRef.current && !userRef.current.contains(e.target)) setUserOpen(false)
      if (searchRef.current && !searchRef.current.contains(e.target)) setSearchOpen(false)
    }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [])

  const getSearchIcon = (item) => {
    const t = (item.type || item.module || '').toLowerCase()
    if (t.includes('emp')) return <FiUsers className="w-4 h-4 text-blue-500" />
    if (t.includes('cust')) return <FiUser className="w-4 h-4 text-blue-500" />
    if (t.includes('prod')) return <FiPackage className="w-4 h-4 text-amber-500" />
    if (t.includes('sale') || t.includes('trans')) return <FiShoppingCart className="w-4 h-4 text-indigo-500" />
    if (t.includes('inst')) return <FiFileText className="w-4 h-4 text-purple-500" />
    if (t.includes('pay_rec') || t.includes('payment')) return <TbCurrencyPeso className="w-4 h-4 text-blue-500" />
    if (t.includes('att')) return <FiClock className="w-4 h-4 text-cyan-500" />
    if (t.includes('payroll') || t.includes('payslip')) return <FiCreditCard className="w-4 h-4 text-rose-500" />
    if (t.includes('usr') || t.includes('user')) return <FiShield className="w-4 h-4 text-amber-500" />
    if (t.includes('log')) return <FiActivity className="w-4 h-4 text-slate-500" />
    if (t.includes('backup')) return <FiDatabase className="w-4 h-4 text-blue-500" />
    if (t.includes('setting')) return <FiSettings className="w-4 h-4 text-blue-500" />
    return <FiLayers className="w-4 h-4 text-primary" />
  }

  useEffect(() => {
    const trimmed = searchQuery.trim()
    if (!trimmed) {
      setSearchResults([])
      setGroupedResults({})
      setTotalMatches(0)
      setIsSearching(false)
      return
    }

    const controller = new AbortController()
    setIsSearching(true)
    const delayDebounceFn = setTimeout(() => {
      api.search(trimmed, { signal: controller.signal })
        .then(res => {
          if (controller.signal.aborted) return
          const results = Array.isArray(res) ? res : (res?.results || [])
          const grouped = res?.grouped || {}
          setSearchResults(results)
          setGroupedResults(grouped)
          setTotalMatches(res?.total || results.length)
          setSelectedIndex(0)
        })
        .catch(err => {
          if (err?.name === 'AbortError') return
          console.error('Search error:', err)
          setSearchResults([])
          setGroupedResults({})
          setTotalMatches(0)
        })
        .finally(() => {
          if (!controller.signal.aborted) setIsSearching(false)
        })
    }, 300)

    return () => {
      clearTimeout(delayDebounceFn)
      controller.abort()
    }
  }, [searchQuery])

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(true)
        setTimeout(() => searchInputRef.current?.focus(), 50)
      }
      if (e.key === 'Escape' && searchOpen) {
        setSearchOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [searchOpen])

  const handleSelectResult = (item) => {
    if (!item) return
    setSearchOpen(false)
    setSearchQuery('')
    if (item.url) {
      navigate(item.url)
    }
  }

  const handleSearchKeyDown = (e) => {
    if (!searchResults.length) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(prev => (prev < searchResults.length - 1 ? prev + 1 : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : searchResults.length - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (searchResults[selectedIndex]) {
        handleSelectResult(searchResults[selectedIndex])
      }
    }
  }

  return (
    <header className="header-shell h-14 px-2.5 sm:px-4 flex items-center justify-between gap-2 sm:gap-4 flex-shrink-0 z-30 print:hidden min-w-0">
      {/* Left: toggle + title */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 shrink-0">
        <button
          onClick={onToggle}
          className={`w-8 h-8 rounded-xl border flex items-center justify-center transition-colors cursor-pointer shrink-0 ${isHeaderDark
            ? 'border-blue-500/20 bg-[#071328] text-blue-200 hover:bg-blue-500/20 hover:text-white'
            : 'border-slate-300/80 bg-white/75 text-blue-800 hover:bg-white hover:text-blue-950'
            }`}
          aria-label="Toggle sidebar"
        >
          <FiMenu className="w-4 h-4" />
        </button>
        <h1 className={`text-xs sm:text-sm font-bold truncate tracking-wide max-w-[100px] sm:max-w-[180px] md:max-w-xs ${isHeaderDark ? 'text-white' : 'text-slate-900'
          }`}>{title}</h1>
      </div>

      {/* Center: Live Global Search Bar */}
      <div className="relative flex-1 max-w-md hidden sm:block" ref={searchRef}>
        <div className="relative">
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              if (!searchOpen) setSearchOpen(true)
            }}
            onFocus={() => setSearchOpen(true)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search records across system..."
            className={`w-full h-9 pl-9 pr-8 text-xs rounded-xl border transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 ${isHeaderDark
              ? 'border-blue-500/25 bg-[#071328] text-slate-50 placeholder:text-blue-300/40'
              : 'border-slate-300/80 bg-white/75 text-slate-900 placeholder:text-slate-500'
              }`}
          />
          <div className={`absolute left-3 top-2.5 pointer-events-none ${isHeaderDark ? 'text-blue-400' : 'text-blue-600'
            }`}>
            {isSearching ? (
              <svg className="animate-spin w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              <FiSearch className="w-4 h-4" />
            )}
          </div>
          {searchQuery && (
            <div className="absolute right-2.5 top-2 flex items-center gap-1">
              <button
                type="button"
                onClick={() => { setSearchQuery(''); setSearchResults([]); setGroupedResults({}); }}
                className={`${isHeaderDark ? 'text-blue-300 hover:text-white' : 'text-blue-700 hover:text-slate-950'} p-0.5 rounded cursor-pointer`}
                title="Clear search query"
              >
                <FiX className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Global Search Dropdown Modal */}
        {searchOpen && (
          <div className="absolute top-11 left-0 right-0 !bg-white dark:!bg-[#071328] rounded-2xl border border-blue-500/30 shadow-2xl z-50 overflow-hidden max-h-[420px] flex flex-col animate-[slideUp_0.15s_ease]">
            <div className="p-2.5 border-b border-blue-500/20 !bg-blue-50/70 dark:!bg-blue-950/70 flex items-center justify-between text-[11px] text-blue-800 dark:text-blue-300">
              <span>
                {!searchQuery.trim()
                  ? 'Search products, customers, employees, branches & invoices'
                  : `${totalMatches} matching record${totalMatches === 1 ? '' : 's'} found`}
              </span>
              {isSearching && <span className="text-blue-600 dark:text-blue-400 font-medium animate-pulse">Searching...</span>}
            </div>

            <div className="overflow-y-auto flex-1 p-1 divide-y divide-blue-500/10 !bg-transparent" ref={listRef}>
              {searchQuery.trim().length >= 1 && searchResults.length === 0 && !isSearching && (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  <FiSearch className="w-8 h-8 mx-auto text-blue-500/30 mb-1" />
                  <p className="font-semibold text-slate-950 dark:text-white">No matching database records found</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Try searching by product name, SKU, customer, employee, invoice #, or branch.</p>
                </div>
              )}

              {Object.keys(groupedResults).map((groupCategory) => {
                const groupItems = groupedResults[groupCategory] || []
                if (!groupItems.length) return null

                return (
                  <div key={groupCategory} className="py-1">
                    <div className="px-3 py-1 text-[10px] font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wider flex items-center justify-between">
                      <span>{groupCategory}</span>
                      <span className="font-mono text-[9px] bg-blue-500/15 text-blue-800 dark:text-blue-200 px-1.5 py-0.2 rounded">{groupItems.length}</span>
                    </div>

                    {groupItems.map((item) => {
                      const flatIndex = searchResults.findIndex(r => r.id === item.id)
                      const isSelected = flatIndex === selectedIndex

                      return (
                        <div
                          key={item.id}
                          onClick={() => handleSelectResult(item)}
                          onMouseEnter={() => setSelectedIndex(flatIndex)}
                          className={`px-3 py-2 text-xs rounded-xl cursor-pointer flex items-center justify-between gap-3 transition-colors ${isSelected ? 'bg-gradient-to-r from-blue-600 to-indigo-700 text-white font-medium shadow-xs border border-blue-400/30' : 'hover:bg-blue-500/10 text-foreground'
                            }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="text-xs shrink-0">{getSearchIcon(item)}</span>
                            <div className="min-w-0">
                              <div className="font-semibold truncate flex items-center gap-1.5">
                                <span>{item.title}</span>
                              </div>
                              <div className={`text-[11px] truncate ${isSelected ? 'text-white/80' : 'text-muted-foreground'}`}>
                                {item.subtitle}
                              </div>
                            </div>
                          </div>

                          <span className={`text-[10px] font-mono shrink-0 ${isSelected ? 'text-white/80' : 'text-muted-foreground'}`}>
                            {item.module} →
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>

            {searchResults.length > 0 && (
              <div className="p-2 border-t border-blue-500/20 bg-blue-950/10 dark:bg-blue-950/30 flex items-center justify-between text-[10px] text-muted-foreground">
                <span className="flex items-center gap-2">
                  <span><kbd className="px-1 py-0.5 bg-muted rounded border border-border">↑</kbd> <kbd className="px-1 py-0.5 bg-muted rounded border border-border">↓</kbd> Navigate</span>
                  <span><kbd className="px-1 py-0.5 bg-muted rounded border border-border">↵</kbd> Select</span>
                  <span><kbd className="px-1 py-0.5 bg-muted rounded border border-border">Esc</kbd> Close</span>
                </span>
                <span className="text-[9px] text-blue-600 dark:text-blue-400 font-mono">Live Search</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-1 sm:gap-2 shrink-0">
        <RealTimeClock isHeaderDark={isHeaderDark} />

        {/* Mobile Search Button */}
        <button
          onClick={() => {
            setSearchOpen(true)
            setTimeout(() => searchInputRef.current?.focus(), 100)
          }}
          title="Search system"
          className={`sm:hidden w-8 h-8 flex items-center justify-center rounded-xl border transition-colors cursor-pointer text-base shadow-2xs shrink-0 focus:outline-none ${isHeaderDark
            ? 'border-blue-500/25 bg-[#071328] hover:bg-blue-500/20 text-blue-100'
            : 'border-slate-300/80 bg-white/75 hover:bg-white text-blue-900'
            }`}
        >
          <FiSearch className="w-4 h-4" />
        </button>

        {/* Dark/Light mode toggle */}
        <button
          onClick={toggleMode}
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          className={`w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-xl border transition-colors cursor-pointer text-base shadow-2xs shrink-0 focus:outline-none ${isHeaderDark
            ? 'border-blue-500/25 bg-[#071328] hover:bg-blue-500/20 text-blue-100'
            : 'border-slate-300/80 bg-white/75 hover:bg-white text-blue-900'
            }`}
        >
          {isDark ? (
            <FiSun className="w-4 h-4 text-amber-500 drop-shadow-[0_0_6px_rgba(245,158,11,0.5)]" />
          ) : (
            <FiMoon className="w-4 h-4 text-blue-700" />
          )}
        </button>

        {/* Real Notification Bell with Live DB Count & Dropdown */}
        <NotificationBell
          notifications={notifs}
          unreadCount={unreadCount}
          onMarkAllRead={onMarkAllRead}
          onNotificationClick={onNotificationClick}
          onViewAll={() => navigate(user?.role === 'Employee' ? '/employee/notifications' : '/notifications')}
          onRefresh={onRefreshNotifs}
          className={
            isHeaderDark
              ? 'border-blue-500/25 bg-[#071328] text-blue-200 hover:bg-blue-500/20 hover:text-white'
              : 'border-slate-300/80 bg-white/75 text-blue-800 hover:bg-white hover:text-blue-950'
          }
        />

        {/* User Menu */}
        <div className="relative shrink-0" ref={userRef}>
          <button
            onClick={() => setUserOpen(o => !o)}
            className={`flex items-center gap-1.5 p-1 sm:px-2.5 sm:py-1.5 rounded-xl border transition-colors cursor-pointer shadow-2xs shrink-0 focus:outline-none ${isHeaderDark
              ? 'border-blue-500/25 bg-[#071328] hover:bg-blue-500/20'
              : 'border-slate-300/80 bg-white/75 hover:bg-white'
              }`}
          >
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-600 to-indigo-700 border border-blue-400/30 flex items-center justify-center text-white text-xs font-bold overflow-hidden shadow-xs shrink-0">
              {isStoreAdm ? (
                <span>S</span>
              ) : user?.profile_image ? (
                <img src={user.profile_image} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                user?.name ? user.name[0] : 'U'
              )}
            </div>
            <div className="hidden sm:block text-left">
              {isStoreAdm ? (
                <div className={`text-xs font-semibold leading-tight ${isHeaderDark ? 'text-slate-100' : 'text-slate-900'
                  }`}>Store Admin</div>
              ) : (
                <>
                  <div className={`text-xs font-semibold leading-tight ${isHeaderDark ? 'text-slate-100' : 'text-slate-900'
                    }`}>{user?.name ? user.name.split(' ')[0] : 'User'}</div>
                  <div className={`text-[10px] font-mono leading-tight ${isHeaderDark ? 'text-blue-300/80' : 'text-blue-700'
                    }`}>{user?.role}</div>
                </>
              )}
            </div>
          </button>
          {userOpen && (
            <div className="absolute right-0 top-12 w-56 !bg-white dark:!bg-[#071328] rounded-2xl border border-blue-500/30 shadow-2xl z-40 overflow-hidden animate-[slideUp_0.15s_ease]">
              {!isStoreAdm && (
                <div className="px-4 py-3 border-b border-blue-500/20 !bg-blue-50/70 dark:!bg-blue-950/70">
                  <div className="text-xs font-bold text-slate-900 dark:text-white truncate">{user.name}</div>
                  <div className="text-[11px] text-blue-700 dark:text-blue-300 font-mono truncate">{user.username}</div>
                </div>
              )}
              <div className="p-1 space-y-0.5 !bg-transparent">
                {!isStoreAdm && (
                  <button
                    onClick={() => {
                      navigate('/profile')
                      setUserOpen(false)
                    }}
                    className="w-full text-left px-3 py-2 text-xs text-foreground hover:bg-blue-500/10 rounded-xl cursor-pointer flex items-center gap-2 font-medium transition-colors"
                  >
                    <FiUser className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    <span>Profile Information</span>
                  </button>
                )}
                {(user?.role === 'Administrator' || isStoreAdm) && (
                  <button
                    onClick={() => { onOpenConfig?.(); setUserOpen(false) }}
                    className="w-full text-left px-3 py-2 text-xs text-foreground hover:bg-blue-500/10 rounded-xl cursor-pointer flex items-center gap-2 font-medium transition-colors"
                  >
                    <FiSettings className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    <span>{isStoreAdm ? 'Branch Configuration' : 'Company Configuration'}</span>
                  </button>
                )}
                <button
                  onClick={async () => { await logout(); navigate('/login') }}
                  className="w-full text-left px-3 py-2 text-xs text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl cursor-pointer flex items-center gap-2 font-bold transition-colors border-t border-blue-500/20 mt-1"
                >
                  <FiLogOut className="w-3.5 h-3.5" />
                  <span>Logout</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

const ROUTE_TITLES = {
  '/dashboard': 'Dashboard',
  '/products': 'Products / Inventory',
  '/customers': 'Customers',
  '/sales': 'Sales Transactions',
  '/installments': 'Installment',
  '/payment-schedule': 'Payment Schedule',
  '/payments': 'Payments',
  '/employees': 'Employee Management',
  '/admin/qr-requests': 'QR Request Management',
  '/payroll/periods': 'Payroll Periods',
  '/payroll': 'Payroll Management',
  '/attendance': 'Attendance Records',
  '/attendance/qr': 'QR Attendance',
  '/store-admin/attendance/scanner': 'QR Attendance Terminal',
  '/store-admin/profile': 'Employee Profile',
  '/profile': 'My Profile',
  '/qr-monitoring': 'QR Attendance Monitoring',
  '/admin/qr-monitoring': 'QR Attendance Monitoring',
  '/reports': 'Reports',
  '/notifications': 'Notification Center',
  '/admin-dashboard': 'Admin Interface',
  '/branches': 'Branches Management',
  '/users': 'User Management',
  '/system-logs': 'System Logs',
  '/backups': 'Backup & Restore',
  '/settings': 'Settings',
  '/store-settings': 'Store Settings',
  '/employee/dashboard': 'My Dashboard',
  '/employee/collect-cash': 'Collect Cash',
  '/employee/receive-cash': 'Receive Cash',
  '/employee/excuse-letter': 'Create Excuse / Leave Letter',
  '/employee/notifications': 'Notification Center',
  '/employee/attendance': 'My Attendance',
  '/employee/payroll': 'My Payroll',
  '/employee/payslips': 'My Payslips',
  '/customer/dashboard': 'My Dashboard',
}

export default function AppShell() {
  const { user, logout } = useAuth()
  const { connected: wsConnected } = useRealtimeConnection()
  const [collapsed, setCollapsed] = useState(() => {
    return user?.role === 'Customer'
  })
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [notifs, setNotifs] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [pendingVerification, setPendingVerification] = useState(null)
  const [authVerificationMode, setAuthVerificationMode] = useState('face') // 'face' | 'pin'
  const [appSettings, setAppSettings] = useState(() => {
    try {
      const raw = sessionStorage.getItem('pace_cached_app_settings')
      if (!raw) return null
      const parsed = JSON.parse(raw)
      if (parsed?.ts && Date.now() - parsed.ts < 300000 && parsed.data) {
        return parsed.data
      }
    } catch (_) { }
    return null
  })
  const [maintenanceBlocked, setMaintenanceBlocked] = useState(null)
  const [configOpen, setConfigOpen] = useState(false)
  const latestNotifIdRef = useRef(null)
  const isLoadingDataRef = useRef(false)
  const settingsLoadedRef = useRef(Boolean(appSettings))
  const cancelledVerifIdsRef = useRef(new Set())
  const location = useLocation()
  const navigate = useNavigate()
  const productsSearch = location.pathname === '/products' ? new URLSearchParams(location.search) : null
  const pageTitle = productsSearch?.get('view') === 'categories'
    ? 'Category Products'
    : productsSearch?.get('category')
      ? `${productsSearch.get('category')} Products`
      : (ROUTE_TITLES[location.pathname] || 'Z-LICZ')

  useEffect(() => {
    setMobileMenuOpen(false)
  }, [location.pathname, location.search])

  const handleToggle = () => {
    setCollapsed(c => !c)
    setMobileMenuOpen(false)
  }

  const playNotificationChime = () => {
    try {
      if (typeof window === 'undefined') return
      if (localStorage.getItem('notif_sound') === 'disabled') return
      const AudioCtx = window.AudioContext || window.webkitAudioContext
      if (!AudioCtx) return
      const ctx = new AudioCtx()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(587.33, ctx.currentTime) // D5
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.08) // A5
      gain.gain.setValueAtTime(0.08, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start()
      osc.stop(ctx.currentTime + 0.35)
    } catch (_) { }
  }

  const applyNotificationsPayload = (res) => {
    if (!res) return
    const fetchedNotifs = res.notifications || []

    if (fetchedNotifs.length > 0) {
      const currentHighest = Math.max(...fetchedNotifs.map(n => n.id || n.notification_id || 0))

      if (latestNotifIdRef.current !== null && currentHighest > latestNotifIdRef.current) {
        const newNotifs = fetchedNotifs.filter(n => (n.id || n.notification_id || 0) > latestNotifIdRef.current)
        if (newNotifs.length > 0) {
          playNotificationChime()
          newNotifs.forEach(n => {
            showToast(`${n.title}: ${n.message}`, 'info')
          })
        }
      }

      latestNotifIdRef.current = Math.max(latestNotifIdRef.current || 0, currentHighest)
    }

    setNotifs(prev => fastDeepEqual(prev, fetchedNotifs) ? prev : fetchedNotifs)
    setUnreadCount(prev => prev === (res.unread_count || 0) ? prev : (res.unread_count || 0))
  }

  const applyPendingVerificationsPayload = (pRes) => {
    if (!pRes) return
    if (pRes.pending && pRes.pending.length > 0) {
      const activePending = pRes.pending.filter(item => !cancelledVerifIdsRef.current.has(item.id))
      if (activePending.length > 0) {
        const item = activePending[0]
        setPendingVerification(prev => {
          // Keep any manually-opened Store Admin terminal modal intact
          if (prev?.isManualTrigger) return prev
          // Only set initial verification mode when opening a NEW request, never overwrite user's PIN/Face choice on 5s polls
          if (!prev || prev.id !== item.id) {
            setAuthVerificationMode(item.has_registered_face ? 'face' : 'pin')
            return item
          }
          return prev
        })
      } else {
        setPendingVerification(prev => (prev?.isManualTrigger ? prev : null))
      }
    } else {
      setPendingVerification(prev => (prev?.isManualTrigger ? prev : null))
    }
  }

  const loadNotificationsOnly = async () => {
    if (!user) return
    try {
      const res = await api.notifications.getLatest({ limit: 30 })
      applyNotificationsPayload(res)
    } catch (_) { }
  }

  const pendingVerifInFlightRef = useRef(false)
  const queuedVerifCheckRef = useRef(false)
  const loadPendingVerificationsOnly = async () => {
    if (!user) return
    const checkVerifications =
      user.role === 'Employee' ||
      user.role === 'Store Administrator' ||
      user.role === 'Store Admin'
    if (!checkVerifications) return
    if (pendingVerifInFlightRef.current) {
      queuedVerifCheckRef.current = true
      return
    }
    pendingVerifInFlightRef.current = true
    queuedVerifCheckRef.current = false
    try {
      const pRes = await api.attendance.pendingVerifications()
      applyPendingVerificationsPayload(pRes)
    } catch (_) { }
    finally {
      pendingVerifInFlightRef.current = false
      if (queuedVerifCheckRef.current) {
        queuedVerifCheckRef.current = false
        loadPendingVerificationsOnly()
      }
    }
  }

  const loadData = async (options = {}) => {
    if (!user || isLoadingDataRef.current) return
    isLoadingDataRef.current = true
    const shouldLoadSettings = !settingsLoadedRef.current || options.includeSettings === true

    try {
      const checkVerifications =
        user.role === 'Employee' ||
        user.role === 'Store Administrator' ||
        user.role === 'Store Admin'

      // Sequential staggered boot loads so active page figures never contend with shell chrome fetches
      const notifRes = await api.notifications.getLatest({ limit: 30 }).catch(() => null)
      if (notifRes) applyNotificationsPayload(notifRes)

      if (shouldLoadSettings) {
        const settingsRes = await api.system.getSettings().catch(() => null)
        if (settingsRes) {
          setAppSettings(prev => fastDeepEqual(prev, settingsRes) ? prev : settingsRes)
          settingsLoadedRef.current = true
          try {
            sessionStorage.setItem('pace_cached_app_settings', JSON.stringify({ ts: Date.now(), data: settingsRes }))
          } catch (_) { }
        }
      }

      if (checkVerifications) {
        const verifRes = await api.attendance.pendingVerifications().catch(() => null)
        if (verifRes) applyPendingVerificationsPayload(verifRes)
      }
    } finally {
      isLoadingDataRef.current = false
    }
  }

  useEffect(() => {
    if (!user) return
    const bootTimer = setTimeout(() => {
      loadData({ includeSettings: !settingsLoadedRef.current })
    }, 450)
    return () => {
      clearTimeout(bootTimer)
    }
  }, [user])

  useEffect(() => {
    const handleNotifSync = () => {
      loadNotificationsOnly()
    }
    const handleVerifSync = () => {
      loadPendingVerificationsOnly()
    }
    const handleScanUpdate = (e) => {
      const detail = e?.detail || {}
      const reqId = detail.scan_log_id || detail.id
      if (detail.stage === 'pending_verification' || detail.status === 'PENDING') {
        loadPendingVerificationsOnly()
      } else if (
        reqId &&
        (detail.stage === 'rejected' || detail.stage === 'authorized' || detail.status === 'FAILED' || detail.status === 'CANCELLED' || detail.status === 'SUCCESS')
      ) {
        setPendingVerification(prev => {
          const prevId = prev?.scan_log_id || prev?.id
          if (prevId && Number(prevId) === Number(reqId)) {
            return null
          }
          return prev
        })
      }
    }
    const handleCrossTabPing = (msg) => {
      if (!msg || typeof msg !== 'object') return
      const reqId = msg.scan_log_id || msg.id
      if (msg.stage === 'pending_verification' || msg.status === 'PENDING') {
        loadPendingVerificationsOnly()
      } else if (
        reqId &&
        (msg.stage === 'rejected' || msg.stage === 'authorized' || msg.status === 'FAILED' || msg.status === 'CANCELLED' || msg.status === 'SUCCESS')
      ) {
        setPendingVerification(prev => {
          const prevId = prev?.scan_log_id || prev?.id
          if (prevId && Number(prevId) === Number(reqId)) {
            return null
          }
          return prev
        })
      }
    }
    const handleStoragePing = (e) => {
      if (e.key !== 'pace_pending_verif_ping' || !e.newValue) return
      try {
        handleCrossTabPing(JSON.parse(e.newValue))
      } catch (_) { }
    }
    const handleFocusOrVisible = () => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        loadPendingVerificationsOnly()
      }
    }
    const handleReturnToQr = (e) => {
      const reqId = e?.detail?.requestId
      if (reqId) {
        cancelledVerifIdsRef.current.add(reqId)
      }
      setPendingVerification(null)
    }
    let bc = null
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        bc = new BroadcastChannel('pace_attendance_verifications')
        bc.onmessage = (ev) => handleCrossTabPing(ev?.data)
      }
    } catch (_) { }

    window.addEventListener('pace:notifications-sync', handleNotifSync)
    window.addEventListener('pace:verifications-sync', handleVerifSync)
    window.addEventListener('pace:sync:attendance', handleVerifSync)
    window.addEventListener('pace:attendance-scan-update', handleScanUpdate)
    window.addEventListener('pace:return-to-qr-scan', handleReturnToQr)
    window.addEventListener('storage', handleStoragePing)
    window.addEventListener('focus', handleFocusOrVisible)
    document.addEventListener('visibilitychange', handleFocusOrVisible)
    const handleTriggerFaceAuth = (e) => {
      const detail = e?.detail || { id: 0, scanned_by: { employee: { first_name: 'Store', last_name: 'Admin' } } }
      if (detail.id && cancelledVerifIdsRef.current.has(detail.id)) return
      setAuthVerificationMode(detail.initialMode === 'pin' ? 'pin' : 'face')
      setPendingVerification({ ...detail, isManualTrigger: true })
    }
    window.addEventListener('pace:trigger-face-auth', handleTriggerFaceAuth)
    return () => {
      if (bc) {
        try { bc.close() } catch (_) { }
      }
      window.removeEventListener('pace:notifications-sync', handleNotifSync)
      window.removeEventListener('pace:verifications-sync', handleVerifSync)
      window.removeEventListener('pace:sync:attendance', handleVerifSync)
      window.removeEventListener('pace:attendance-scan-update', handleScanUpdate)
      window.removeEventListener('pace:return-to-qr-scan', handleReturnToQr)
      window.removeEventListener('storage', handleStoragePing)
      window.removeEventListener('focus', handleFocusOrVisible)
      document.removeEventListener('visibilitychange', handleFocusOrVisible)
      window.removeEventListener('pace:trigger-face-auth', handleTriggerFaceAuth)
    }
  }, [user])

  useEffect(() => {
    if (!user || wsConnected || pendingVerification) return
    const isEmployeeRole = user.role === 'Employee'
    const isStoreAdminRole = user.role === 'Store Administrator' || user.role === 'Store Admin'
    if (!isEmployeeRole && !isStoreAdminRole) return

    let stopped = false
    let timer = null
    const intervalMs = location.pathname.startsWith('/employee/attendance') ? 1500 : 2800

    const scheduleCheck = () => {
      if (stopped) return
      timer = setTimeout(async () => {
        if (stopped) return
        if (typeof document === 'undefined' || document.visibilityState === 'visible') {
          await loadPendingVerificationsOnly()
        }
        scheduleCheck()
      }, intervalMs)
    }

    scheduleCheck()

    return () => {
      stopped = true
      if (timer) clearTimeout(timer)
    }
  }, [user, wsConnected, pendingVerification, location.pathname])

  useEffect(() => {
    const handleSettingsUpdated = (e) => {
      if (e.detail) {
        setAppSettings(prev => {
          const next = { ...(prev || {}), ...e.detail }
          try {
            sessionStorage.setItem('pace_cached_app_settings', JSON.stringify({ ts: Date.now(), data: next }))
          } catch (_) { }
          return next
        })
        if (e.detail.maintenance_mode === false) {
          setMaintenanceBlocked(null)
        }
      }
    }
    const handleMaintenanceMode = (e) => {
      const detail = e?.detail || {}
      if (detail.active) {
        setMaintenanceBlocked({
          message: detail.message || 'The system is currently in Maintenance Mode. Access is temporarily suspended for non-admin users.',
          site_name: detail.site_name || appSettings?.site_name || appSettings?.company_name || 'Z-LICZ Appliances',
        })
      } else {
        setMaintenanceBlocked(null)
      }
    }
    window.addEventListener('system:settingsUpdated', handleSettingsUpdated)
    window.addEventListener('system:maintenanceMode', handleMaintenanceMode)
    return () => {
      window.removeEventListener('system:settingsUpdated', handleSettingsUpdated)
      window.removeEventListener('system:maintenanceMode', handleMaintenanceMode)
    }
  }, [appSettings?.site_name, appSettings?.company_name])

  useEffect(() => {
    const titleName = appSettings?.site_name || appSettings?.company_name
    if (titleName) {
      document.title = `${titleName} | ${pageTitle}`
    }
  }, [appSettings?.site_name, appSettings?.company_name, pageTitle])

  const handleMarkAllRead = async () => {
    try {
      await api.notifications.markAllAsRead()
      setNotifs(prev => prev.map(n => ({ ...n, is_read: true })))
      setUnreadCount(0)
      showToast('All notifications marked as read', 'success')
      triggerDataSync('notifications')
    } catch (err) {
      showToast(err.message || 'Failed to mark notifications read', 'error')
    }
  }

  const handleNotificationClick = async (notif) => {
    if (!notif.is_read) {
      try {
        await api.notifications.markAsRead(notif.id || notif.notification_id)
        setNotifs(prev => prev.map(n =>
          (n.id === notif.id || n.notification_id === notif.notification_id)
            ? { ...n, is_read: true }
            : n
        ))
        setUnreadCount(prev => Math.max(0, prev - 1))
        triggerDataSync('notifications')
      } catch (err) {
        // Continue navigation
      }
    }

    if (notif.action_url) {
      const role = String(user?.role || '').toLowerCase()
      let finalUrl = notif.action_url;
      if (role === 'customer') {
        if (finalUrl.startsWith('/products')) {
          const qs = finalUrl.includes('?') ? finalUrl.split('?')[1] : ''
          const prodId = new URLSearchParams(qs).get('id')
          finalUrl = prodId ? `/customer/dashboard?tab=products&product_id=${prodId}` : '/customer/dashboard?tab=products'
        } else if (finalUrl.startsWith('/installments')) {
          finalUrl = '/customer/dashboard?tab=installments'
        } else if (finalUrl.startsWith('/payments')) {
          finalUrl = '/customer/dashboard?tab=statements'
        } else if (finalUrl === '/support') {
          finalUrl = '/customer/dashboard?tab=support'
        }
      } else if (role === 'employee') {
        if (finalUrl === '/payroll' || finalUrl.startsWith('/payroll?') || finalUrl === '/employee/payroll') {
          finalUrl = '/employee/payslips'
        }
      } else if (finalUrl === '/support') {
        finalUrl = '/admin/support'
      }
      navigate(finalUrl)
    }
  }

  const roleRaw = (user?.role || 'user').toLowerCase()
  const isSystemAdmin = roleRaw === 'administrator' || roleRaw === 'admin'
  const isMaintenanceActive = Boolean(appSettings?.maintenance_mode || maintenanceBlocked)
  const isDebugActive = Boolean(appSettings?.debug_mode)
  const activeSiteName = maintenanceBlocked?.site_name || appSettings?.site_name || appSettings?.company_name || 'Z-LICZ Appliances'
  const roleClass = roleRaw.includes('store')
    ? 'role-store-admin role-store-administrator'
    : roleRaw.includes('admin')
      ? 'role-admin role-administrator'
      : `role-${roleRaw.replace(/\s+/g, '-')}`

  if (!isSystemAdmin && isMaintenanceActive) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50 dark:bg-[#081026] text-foreground">
        <div className="max-w-md w-full rounded-2xl border border-border bg-card shadow-xl p-8 text-center space-y-4">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-500">
            <FiShield className="w-8 h-8" />
          </div>
          <div className="space-y-1.5">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30">
              Maintenance Mode Active
            </span>
            <h1 className="text-xl font-bold text-foreground">{activeSiteName}</h1>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {maintenanceBlocked?.message || `${activeSiteName} is currently undergoing scheduled maintenance. Access for non-admin accounts is temporarily suspended.`}
            </p>
          </div>
          <div className="flex items-center justify-center gap-2 pt-2">
            <button
              type="button"
              onClick={async () => {
                try {
                  const fresh = await api.system.getSettings({ fresh: true })
                  if (fresh) {
                    setAppSettings(fresh)
                    if (!fresh.maintenance_mode) {
                      setMaintenanceBlocked(null)
                      showToast('System is back online!', 'success')
                      return
                    }
                  }
                  showToast('System is still in Maintenance Mode.', 'info')
                } catch (_) {
                  showToast('System is still in Maintenance Mode.', 'info')
                }
              }}
              className="px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold cursor-pointer"
            >
              Check Again
            </button>
            <button
              type="button"
              onClick={() => logout()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-border hover:bg-muted text-foreground text-xs font-semibold cursor-pointer"
            >
              <FiLogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`admin-shell ${roleClass} flex h-screen bg-slate-50 dark:bg-[#081026] text-foreground overflow-hidden font-sans print:block print:h-auto print:min-h-0 print:overflow-visible print:bg-white`}>
      <Sidebar
        collapsed={collapsed}
        settings={appSettings}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
        onOpenConfig={() => setConfigOpen(true)}
      />

      <div className="flex flex-col flex-1 min-w-0 overflow-x-hidden h-full print:block print:h-auto print:overflow-visible">
        <Header
          title={pageTitle}
          onToggle={handleToggle}
          notifs={notifs}
          unreadCount={unreadCount}
          onMarkAllRead={handleMarkAllRead}
          onNotificationClick={handleNotificationClick}
          onRefreshNotifs={loadNotificationsOnly}
          onOpenConfig={() => setConfigOpen(true)}
        />

        {isSystemAdmin && (isMaintenanceActive || isDebugActive) && (
          <div className="print:hidden px-4 py-2 border-b border-border bg-amber-500/10 text-xs flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              {isMaintenanceActive && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/30 font-bold text-[11px]">
                  <FiShield className="w-3.5 h-3.5" />
                  <span>Maintenance Mode Active (Non-admin access suspended)</span>
                </span>
              )}
              {isDebugActive && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 font-bold text-[11px]">
                  <FiActivity className="w-3.5 h-3.5" />
                  <span>Debug Mode Enabled (Verbose logging &amp; stack traces active)</span>
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => navigate('/admin-dashboard')}
              className="text-[11px] font-bold text-primary hover:underline cursor-pointer"
            >
              Manage Global Configuration
            </button>
          </div>
        )}

        <main className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-4 md:p-6 bg-transparent print:overflow-visible print:p-0 print:m-0">
          <div className="max-w-7xl mx-auto w-full min-w-0 print:max-w-none print:mx-0">
            <Suspense
              fallback={
                <div className="py-20 flex items-center justify-center">
                  <Spinner className="w-8 h-8 text-blue-600" />
                </div>
              }
            >
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>

      <CompanyConfigurationModal
        isOpen={configOpen}
        onClose={() => setConfigOpen(false)}
        currentSettings={appSettings}
        onSave={(updated) => {
          if (updated) {
            setAppSettings(prev => ({ ...(prev || {}), ...updated }))
          }
          loadData()
        }}
      />

      {pendingVerification && (() => {
        const resolveAuthRedirect = () => {
          if (user?.role === 'Employee') return '/employee/attendance'
          if (
            location.pathname.startsWith('/store-admin/attendance/scanner') ||
            location.pathname.startsWith('/attendance')
          ) {
            return null
          }
          return '/store-admin/attendance/scanner'
        }
        const finishVerificationUi = () => {
          setPendingVerification(null)
          const nextRoute = resolveAuthRedirect()
          if (nextRoute) navigate(nextRoute)
        }
        const notifyTerminalVerification = (reqId, detail = {}) => {
          if (typeof window === 'undefined' || !reqId) return
          const payload = {
            scan_log_id: Number(reqId),
            ...detail,
            ts: Date.now(),
          }
          window.dispatchEvent(new CustomEvent('pace:attendance-scan-update', {
            detail: payload
          }))
          try {
            localStorage.setItem('pace_pending_verif_ping', JSON.stringify(payload))
          } catch (_) { }
          try {
            if (typeof BroadcastChannel !== 'undefined') {
              const bc = new BroadcastChannel('pace_attendance_verifications')
              bc.postMessage(payload)
              bc.close()
            }
          } catch (_) { }
        }
        const cancelVerificationUi = () => {
          const reqId = pendingVerification?.scan_log_id || pendingVerification?.id
          if (reqId) {
            cancelledVerifIdsRef.current.add(reqId)
            api.attendance.rejectVerification({
              scan_log_id: reqId,
              reason: 'Attendance authorization cancelled by employee.'
            }).finally(() => {
              notifyTerminalVerification(reqId, {
                status: 'FAILED',
                stage: 'rejected',
                failure_reason: 'Attendance authorization cancelled by employee.',
              })
            })
          }
          finishVerificationUi()
        }

        return authVerificationMode === 'face' ? (
          <FaceRecognitionAttendanceModal
            isOpen={!!pendingVerification}
            request={pendingVerification}
            onClose={() => {
              const reqId = pendingVerification?.scan_log_id || pendingVerification?.id
              if (reqId) cancelledVerifIdsRef.current.add(reqId)
              finishVerificationUi()
            }}
            onCancel={cancelVerificationUi}
            onAuthorize={async (payload) => {
              const reqId = pendingVerification?.scan_log_id || pendingVerification?.id
              if (!reqId) throw new Error('Missing verification request ID.')
              const res = await api.attendance.approveVerification({
                scan_log_id: reqId,
                verification_type: 'FACE_RECOGNITION',
                face_verified: true,
                face_matched: payload?.face_matched === true,
                confidence: payload?.confidence
              })
              if (res && res.success === false) {
                throw new Error(res.message || 'Face authorization rejected.')
              }
              cancelledVerifIdsRef.current.add(reqId)
              notifyTerminalVerification(reqId, {
                status: 'SUCCESS',
                stage: 'authorized',
                action: res?.action,
                time: res?.time,
                date: res?.date,
                total_hours: res?.total_hours,
                overtime_hours: res?.overtime_hours,
                verification_type: 'FACE_RECOGNITION',
                face_verified: true,
                message: res?.message,
              })
              triggerDataSync('attendance')
            }}
            onSuccess={() => {
              const reqId = pendingVerification?.scan_log_id || pendingVerification?.id
              if (reqId) {
                cancelledVerifIdsRef.current.add(reqId)
                notifyTerminalVerification(reqId, {
                  status: 'SUCCESS',
                  stage: 'authorized',
                  verification_type: 'FACE_RECOGNITION',
                  face_verified: true,
                })
              }
              triggerDataSync('attendance')
            }}
            onSwitchToPin={() => setAuthVerificationMode('pin')}
          />
        ) : (
          <EmployeePinVerificationModal
            request={pendingVerification}
            onClose={() => {
              const reqId = pendingVerification?.scan_log_id || pendingVerification?.id
              if (reqId) cancelledVerifIdsRef.current.add(reqId)
              finishVerificationUi()
            }}
            onCancel={cancelVerificationUi}
            onSuccess={(approvedReqId, res) => {
              const reqId = approvedReqId || pendingVerification?.scan_log_id || pendingVerification?.id
              if (reqId) {
                cancelledVerifIdsRef.current.add(reqId)
                notifyTerminalVerification(reqId, {
                  status: 'SUCCESS',
                  stage: 'authorized',
                  action: res?.action,
                  time: res?.time,
                  date: res?.date,
                  total_hours: res?.total_hours,
                  overtime_hours: res?.overtime_hours,
                  verification_type: 'PIN',
                  face_verified: false,
                  message: res?.message,
                })
              }
              triggerDataSync('attendance')
              finishVerificationUi()
            }}
            onSwitchToFace={() => setAuthVerificationMode('face')}
          />
        )
      })()}
    </div>
  )
}
