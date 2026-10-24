import { useState, useRef, useEffect, Suspense } from 'react'
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import {
  FiHome, FiPackage, FiUsers, FiShoppingCart, FiCreditCard,
  FiCalendar, FiUser, FiClock, FiFileText,
  FiBarChart2, FiSettings, FiShield, FiDatabase, FiActivity,
  FiSun, FiMoon, FiSearch, FiLogOut, FiMenu, FiChevronDown,
  FiCheckCircle, FiX, FiBell, FiCamera, FiLayers, FiMessageSquare, FiHardDrive
} from 'react-icons/fi'
import { useAuth } from '../../context/AuthContext'
import { NotificationBell, showToast, Spinner } from '../ui'
import { api } from '../../lib/api'
import { useRealtimeSync, triggerDataSync } from '../../lib/realtimeSync'
import { fastDeepEqual } from '../../lib/utils'
import { useTheme } from '../../context/ThemeContext'
import ProfileModal from './ProfileModal'
import CompanyConfigurationModal, { resolveLogoUrl } from '../CompanyConfigurationModal'
import EmployeePinVerificationModal from '../attendance/EmployeePinVerificationModal'
import FaceRecognitionAttendanceModal from '../attendance/FaceRecognitionAttendanceModal'
import { TbCurrencyPeso } from 'react-icons/tb'

const icons = {
  dashboard: <FiHome className="w-4 h-4 flex-shrink-0" />,
  products: <FiPackage className="w-4 h-4 flex-shrink-0" />,
  customers: <FiUser className="w-4 h-4 flex-shrink-0" />,
  sales: <FiShoppingCart className="w-4 h-4 flex-shrink-0" />,
  installment: <FiCreditCard className="w-4 h-4 flex-shrink-0" />,
  schedule: <FiCalendar className="w-4 h-4 flex-shrink-0" />,
  payments: <TbCurrencyPeso className="w-4 h-4 flex-shrink-0" />,
  employees: <FiUsers className="w-4 h-4 flex-shrink-0" />,
  payroll: <TbCurrencyPeso className="w-4 h-4 flex-shrink-0" />,
  attendance: <FiClock className="w-4 h-4 flex-shrink-0" />,
  qr: <FiCamera className="w-4 h-4 flex-shrink-0" />,
  reports: <FiBarChart2 className="w-4 h-4 flex-shrink-0" />,
  users: <FiShield className="w-4 h-4 flex-shrink-0" />,
  logs: <FiFileText className="w-4 h-4 flex-shrink-0" />,
  backup: <FiDatabase className="w-4 h-4 flex-shrink-0" />,
  settings: <FiSettings className="w-4 h-4 flex-shrink-0" />,
  history: <FiActivity className="w-4 h-4 flex-shrink-0" />,
  payslip: <FiFileText className="w-4 h-4 flex-shrink-0" />,
  notifications: <FiBell className="w-4 h-4 flex-shrink-0" />,
  support: <FiMessageSquare className="w-4 h-4 flex-shrink-0" />,
  storage: <FiHardDrive className="w-4 h-4 flex-shrink-0" />,
}

function navByRole(role, onOpenConfig) {
  if (role === 'Employee') {
    return [
      { label: 'My Dashboard', path: '/employee/dashboard', icon: icons.dashboard },
      { label: 'My Attendance QR', path: '/employee/attendance', icon: icons.attendance },
      { label: 'My Payroll', path: '/employee/payroll', icon: icons.payroll },
      { label: 'My Payslips', path: '/employee/payslips', icon: icons.payslip },
    ]
  }

  if (role === 'Customer') {
    return [
      { label: 'My Dashboard', path: '/customer/dashboard', icon: icons.dashboard },
    ]
  }

  const business = {
    label: 'Business Management',
    icon: icons.sales,
    items: [
      { label: 'Products / Inventory', path: '/products', icon: icons.products },
      { label: 'Customers', path: '/customers', icon: icons.customers },
      { label: 'Sales Transactions', path: '/sales', icon: icons.sales },
      { label: 'Transaction History', path: '/transactions', icon: icons.history },
    ],
  }

  const installment = {
    label: 'Installment Monitoring',
    icon: icons.installment,
    items: [
      { label: 'Installment', path: '/installments', icon: icons.installment },
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
      { label: 'Branches', path: '/branches', icon: icons.products },
      { label: 'Users', path: '/users', icon: icons.users },
      { label: 'Carousel', path: '/settings/carousel', icon: icons.products },
      { label: 'System Logs', path: '/system-logs', icon: icons.logs },
      { label: 'Backup & Restore', path: '/backups', icon: icons.backup },
      { label: 'Storage Management', path: '/storage', icon: icons.storage },
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
    // Store Admins only see their branch employees
    base.push({
      label: 'Branch Staff',
      icon: icons.employees,
      items: [
        { label: 'Employees & QR', path: '/employees', icon: icons.employees }
      ],
    })
  }

  base.push({ label: isAdmin ? 'Attendance Logs' : 'Branch Attendance', path: '/attendance', icon: icons.attendance })

  base.push({ label: 'Reports', path: '/reports', icon: icons.reports })

  base.push({ label: 'Customer Support', path: '/admin/support', icon: icons.support })

  if (isAdmin) {
    base.push({ label: 'Company Configuration', action: onOpenConfig, icon: icons.settings })
    base.push(system)
  }

  return base
}

function SidebarGroup({ group, collapsed }) {
  const location = useLocation()
  const isActive = group.items.some(i => location.pathname === i.path || location.pathname.startsWith(`${i.path}/`))
  const [open, setOpen] = useState(isActive)

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
          {group.items.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              title={collapsed ? item.label : undefined}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 text-xs rounded-xl transition-all cursor-pointer ${location.pathname === item.path
                  ? 'bg-gradient-to-r from-blue-600 via-blue-600 to-indigo-700 text-white font-bold shadow-md shadow-blue-950/40 border border-blue-400/30'
                  : 'text-slate-700 dark:text-blue-100/70 hover:bg-blue-500/10 hover:text-blue-950 dark:hover:text-white'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span className={`flex-shrink-0 ${isActive ? 'text-white' : 'text-blue-700 dark:text-blue-400'}`}>{item.icon}</span>
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </>
              )}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  )
}

function Sidebar({ collapsed, settings, mobileOpen, onCloseMobile, onOpenConfig }) {
  const { user } = useAuth()
  const navItems = user ? navByRole(user.role, onOpenConfig) : []

  if (!user || user.role === 'Customer') return null

  const companyName = settings?.company_name || 'Z-LICZ'
  const siteName = 'Z-LICZ Appliances'

  return (
    <>
      {/* Mobile Drawer Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 lg:hidden animate-[fadeIn_0.15s_ease]"
          onClick={onCloseMobile}
        />
      )}

      <aside
        className={`sidebar-shell flex flex-col h-full overflow-hidden flex-shrink-0 transition-all duration-200 print:hidden ${mobileOpen
          ? 'fixed inset-y-0 left-0 z-50 shadow-2xl flex'
          : 'hidden lg:flex'
          }`}
        style={{ width: mobileOpen ? 260 : (collapsed ? 64 : 240) }}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-blue-500/15 flex-shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            {resolveLogoUrl(settings?.logo_url || settings?.logo) ? (
              <img
                src={resolveLogoUrl(settings?.logo_url || settings?.logo)}
                alt="Logo"
                className="w-8 h-8 rounded-xl object-contain flex-shrink-0 shadow-xs bg-white p-0.5"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
            ) : (
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-600 via-indigo-600 to-slate-900 border border-blue-400/30 flex items-center justify-center text-white font-bold text-sm flex-shrink-0 shadow-xs">
                {(companyName || 'P').charAt(0).toUpperCase()}
              </div>
            )}
            {(!collapsed || mobileOpen) && (
              <div className="overflow-hidden">
                <div className="text-slate-900 dark:text-white font-bold text-sm tracking-wide leading-tight truncate">{companyName}</div>
                <div className="text-blue-700 dark:text-blue-300/80 text-[9px] font-mono leading-tight truncate">{siteName}</div>
              </div>
            )}
          </div>
          {mobileOpen && (
            <button
              onClick={onCloseMobile}
              className="lg:hidden text-blue-800 dark:text-blue-200 hover:text-foreground p-1 rounded-lg hover:bg-blue-500/15 cursor-pointer"
              aria-label="Close menu"
            >
              <FiX className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 space-y-0.5 px-1.5" onClick={() => { if (mobileOpen) onCloseMobile() }}>
          {navItems.map((entry, i) =>
            entry.items ? (
              <SidebarGroup key={i} group={entry} collapsed={collapsed && !mobileOpen} />
            ) : entry.action ? (
              <button
                key={entry.label}
                onClick={(e) => { e.preventDefault(); entry.action(); }}
                title={collapsed && !mobileOpen ? entry.label : undefined}
                className="w-full text-left flex items-center gap-2.5 px-3 py-2 text-xs rounded-xl transition-all cursor-pointer text-slate-700 dark:text-blue-100/70 hover:bg-blue-500/10 hover:text-blue-950 dark:hover:text-white"
              >
                <span className="flex-shrink-0 text-blue-700 dark:text-blue-400">{entry.icon}</span>
                {(!collapsed || mobileOpen) && <span className="truncate flex-1">{entry.label}</span>}
              </button>
            ) : (
              <NavLink
                key={entry.path}
                to={entry.path}
                title={collapsed && !mobileOpen ? entry.label : undefined}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 px-3 py-2 text-xs rounded-xl transition-all cursor-pointer ${isActive
                    ? 'bg-gradient-to-r from-blue-600 via-blue-600 to-indigo-700 text-white font-bold shadow-md shadow-blue-950/40 border border-blue-400/30'
                    : 'text-slate-700 dark:text-blue-100/70 hover:bg-blue-500/10 hover:text-blue-950 dark:hover:text-white'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <span className={`flex-shrink-0 ${isActive ? 'text-white' : 'text-blue-700 dark:text-blue-400'}`}>{entry.icon}</span>
                    {(!collapsed || mobileOpen) && <span className="truncate flex-1">{entry.label}</span>}
                    {(!collapsed || mobileOpen) && entry.badge && (
                      <span className="text-[10px] font-bold font-mono bg-rose-600 text-white px-1.5 py-0.2 rounded-full shrink-0">
                        {entry.badge}
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            )
          )}
        </nav>
      </aside>
    </>
  )
}

function RealTimeClock() {
  const [time, setTime] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="hidden lg:flex flex-col items-end mr-4 text-right">
      <span className="text-xs font-bold font-mono text-slate-900 dark:text-white tracking-tight">
        {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </span>
      <span className="text-[10px] text-blue-700 dark:text-blue-400 font-semibold uppercase tracking-wider">
        {time.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
      </span>
    </div>
  )
}

function Header({
  title,
  onToggle,
  onOpenProfile,
  notifs,
  unreadCount,
  onMarkAllRead,
  onNotificationClick,
  onRefreshNotifs,
  onOpenConfig,
}) {
  const { user, logout } = useAuth()
  const { isDark, toggleMode } = useTheme()
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
    if (!searchQuery.trim() || searchQuery.trim().length < 2) {
      setSearchResults([])
      setGroupedResults({})
      setTotalMatches(0)
      setIsSearching(false)
      return
    }

    setIsSearching(true)
    const delayDebounceFn = setTimeout(() => {
      api.search(searchQuery.trim())
        .then(res => {
          const results = Array.isArray(res) ? res : (res?.results || [])
          const grouped = res?.grouped || {}
          setSearchResults(results)
          setGroupedResults(grouped)
          setTotalMatches(res?.total || results.length)
          setSelectedIndex(0)
        })
        .catch(err => {
          console.error('Search error:', err)
          setSearchResults([])
          setGroupedResults({})
          setTotalMatches(0)
        })
        .finally(() => setIsSearching(false))
    }, 280)

    return () => clearTimeout(delayDebounceFn)
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
    <header className="header-shell h-14 px-4 flex items-center justify-between gap-4 flex-shrink-0 z-30 print:hidden">
      {/* Left: toggle + title */}
      <div className="flex items-center gap-3">
        {user?.role !== 'Customer' && (
          <button
            onClick={onToggle}
            className="w-8 h-8 rounded-xl border border-blue-500/20 bg-blue-50 dark:bg-[#071328] hover:bg-blue-500/20 flex items-center justify-center text-blue-800 dark:text-blue-200 hover:text-blue-950 dark:hover:text-white transition-colors cursor-pointer"
            aria-label="Toggle sidebar"
          >
            <FiMenu className="w-4 h-4" />
          </button>
        )}
        <h1 className="text-sm font-bold text-slate-900 dark:text-white truncate tracking-wide">{title}</h1>
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
            placeholder="Search records across system (Ctrl+K)..."
            className="w-full h-9 pl-9 pr-16 text-xs rounded-xl border border-blue-500/25 dark:border-blue-500/25 bg-blue-50/80 dark:bg-[#071328] text-slate-900 dark:text-slate-50 placeholder:text-blue-700/50 dark:placeholder:text-blue-300/40 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all"
          />
          <div className="absolute left-3 top-2.5 text-blue-600 dark:text-blue-400 pointer-events-none">
            {isSearching ? (
              <svg className="animate-spin w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              <FiSearch className="w-4 h-4" />
            )}
          </div>
          <div className="absolute right-2.5 top-2 flex items-center gap-1">
            {searchQuery && (
              <button
                type="button"
                onClick={() => { setSearchQuery(''); setSearchResults([]); setGroupedResults({}); }}
                className="text-blue-700 dark:text-blue-300 hover:text-foreground p-0.5 rounded cursor-pointer"
                title="Clear search query"
              >
                <FiX className="w-3.5 h-3.5" />
              </button>
            )}
            <kbd className="hidden lg:inline-block px-1.5 py-0.5 text-[10px] font-mono text-blue-700 dark:text-blue-300 bg-blue-100/60 dark:bg-blue-900/40 border border-blue-500/25 rounded shadow-2xs">
              Ctrl+K
            </kbd>
          </div>
        </div>

        {/* Global Search Dropdown Modal */}
        {searchOpen && (
          <div className="absolute top-11 left-0 right-0 !bg-white dark:!bg-[#071328] rounded-2xl border border-blue-500/30 shadow-2xl z-50 overflow-hidden max-h-[420px] flex flex-col animate-[slideUp_0.15s_ease]">
            <div className="p-2.5 border-b border-blue-500/20 !bg-blue-50/70 dark:!bg-blue-950/70 flex items-center justify-between text-[11px] text-blue-800 dark:text-blue-300">
              <span>
                {searchQuery.trim().length < 2
                  ? 'Type at least 2 characters to search MySQL database...'
                  : `${totalMatches} matching record${totalMatches === 1 ? '' : 's'} found`}
              </span>
              {isSearching && <span className="text-blue-600 dark:text-blue-400 font-medium animate-pulse">Searching database...</span>}
            </div>

            <div className="overflow-y-auto flex-1 p-1 divide-y divide-blue-500/10 !bg-transparent" ref={listRef}>
              {searchQuery.trim().length >= 2 && searchResults.length === 0 && !isSearching && (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  <FiSearch className="w-8 h-8 mx-auto text-blue-500/30 mb-1" />
                  <p className="font-semibold text-slate-950 dark:text-white">No matching database records found</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Try searching by employee name, code, customer, SKU, invoice #, or log keyword.</p>
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
      <div className="flex items-center gap-2">
        <RealTimeClock />

        {/* Mobile Search Button */}
        <button
          onClick={() => {
            setSearchOpen(true)
            setTimeout(() => searchInputRef.current?.focus(), 100)
          }}
          title="Search system"
          className="sm:hidden w-9 h-9 flex items-center justify-center rounded-xl border border-blue-500/25 bg-blue-50/50 dark:bg-blue-950/40 hover:bg-blue-500/20 text-blue-900 dark:text-blue-100 transition-colors cursor-pointer text-base shadow-2xs"
        >
          <FiSearch className="w-4 h-4" />
        </button>

        {/* Dark/Light mode toggle */}
        <button
          onClick={toggleMode}
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          className="w-9 h-9 flex items-center justify-center rounded-xl border border-blue-500/25 bg-blue-50/50 dark:bg-blue-950/40 hover:bg-blue-500/20 text-blue-900 dark:text-blue-100 transition-colors cursor-pointer text-base shadow-2xs"
        >
          {isDark ? <FiSun className="w-4 h-4 text-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.6)]" /> : <FiMoon className="w-4 h-4 text-blue-700 dark:text-blue-300" />}
        </button>

        {/* Real Notification Bell with Live DB Count & Dropdown */}
        <NotificationBell
          notifications={notifs}
          unreadCount={unreadCount}
          onMarkAllRead={onMarkAllRead}
          onNotificationClick={onNotificationClick}
          onViewAll={() => navigate(user?.role === 'Employee' ? '/employee/notifications' : '/notifications')}
          onRefresh={onRefreshNotifs}
        />

        {/* User Menu */}
        <div className="relative" ref={userRef}>
          <button
            onClick={() => setUserOpen(o => !o)}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl border border-blue-500/25 bg-blue-50/80 dark:bg-[#071328] hover:bg-blue-500/20 transition-colors cursor-pointer shadow-2xs"
          >
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-600 to-indigo-700 border border-blue-400/30 flex items-center justify-center text-white text-xs font-bold overflow-hidden shadow-xs shrink-0">
              {user?.profile_image ? (
                <img src={user.profile_image} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                user?.name ? user.name[0] : 'U'
              )}
            </div>
            <div className="hidden sm:block text-left">
              <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 leading-tight">{user?.name ? user.name.split(' ')[0] : 'User'}</div>
              <div className="text-[10px] text-blue-700 dark:text-blue-300/80 font-mono leading-tight">{user?.role}</div>
            </div>
          </button>
          {userOpen && (
            <div className="absolute right-0 top-12 w-56 !bg-white dark:!bg-[#071328] rounded-2xl border border-blue-500/30 shadow-2xl z-40 overflow-hidden animate-[slideUp_0.15s_ease]">
              <div className="px-4 py-3 border-b border-blue-500/20 !bg-blue-50/70 dark:!bg-blue-950/70">
                <div className="text-xs font-bold text-slate-900 dark:text-white truncate">{user.name}</div>
                <div className="text-[11px] text-blue-700 dark:text-blue-300 font-mono truncate">{user.username}</div>
              </div>
              <div className="p-1 space-y-0.5 !bg-transparent">
                <button
                  onClick={() => { onOpenProfile?.(); setUserOpen(false) }}
                  className="w-full text-left px-3 py-2 text-xs text-foreground hover:bg-blue-500/10 rounded-xl cursor-pointer flex items-center gap-2 font-medium transition-colors"
                >
                  <FiUser className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  <span>Profile Information</span>
                </button>
                <button
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent('open:notifications'))
                    setUserOpen(false)
                  }}
                  className="w-full text-left px-3 py-2 text-xs text-foreground hover:bg-blue-500/10 rounded-xl cursor-pointer flex items-center gap-2 font-medium transition-colors"
                >
                  <FiBell className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  <span>Notifications</span>
                </button>
                {(user?.role === 'Administrator' || user?.role === 'Store Administrator' || user?.role === 'Store Admin') && (
                  <button
                    onClick={() => { onOpenConfig?.(); setUserOpen(false) }}
                    className="w-full text-left px-3 py-2 text-xs text-foreground hover:bg-blue-500/10 rounded-xl cursor-pointer flex items-center gap-2 font-medium transition-colors"
                  >
                    <FiSettings className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    <span>{(user?.role === 'Store Administrator' || user?.role === 'Store Admin') ? 'Branch Configuration' : 'Company Configuration'}</span>
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
  '/sales/create': 'Create Sale',
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
  '/qr-monitoring': 'QR Attendance Monitoring',
  '/admin/qr-monitoring': 'QR Attendance Monitoring',
  '/reports': 'Reports',
  '/notifications': 'Notification Center',
  '/users': 'User Management',
  '/system-logs': 'System Logs',
  '/backups': 'Backup & Restore',
  '/settings': 'Settings',
  '/store-settings': 'Store Settings',
  '/employee/dashboard': 'My Dashboard',
  '/employee/notifications': 'Notification Center',
  '/employee/attendance': 'My Attendance',
  '/employee/payroll': 'My Payroll',
  '/employee/payslips': 'My Payslips',
  '/customer/dashboard': 'My Dashboard',
}

export default function AppShell() {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [notifs, setNotifs] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [pendingVerification, setPendingVerification] = useState(null)
  const [authVerificationMode, setAuthVerificationMode] = useState('face') // 'face' | 'pin'
  const [appSettings, setAppSettings] = useState(null)
  const [configOpen, setConfigOpen] = useState(false)
  const latestNotifIdRef = useRef(null)
  const isLoadingDataRef = useRef(false)
  const settingsLoadedRef = useRef(false)
  const cancelledVerifIdsRef = useRef(new Set())
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const pageTitle = ROUTE_TITLES[location.pathname] || 'Z-LICZ'

  useEffect(() => {
    setMobileMenuOpen(false)
  }, [location.pathname])

  const handleToggle = () => {
    if (window.innerWidth < 1024) {
      setMobileMenuOpen(prev => !prev)
    } else {
      setCollapsed(c => !c)
    }
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

  const loadData = async (options = {}) => {
    if (!user || isLoadingDataRef.current) return
    isLoadingDataRef.current = true
    const shouldLoadSettings = !settingsLoadedRef.current || options.includeSettings === true

    try {
      const checkVerifications =
        user.role === 'Employee' ||
        user.role === 'Store Administrator' ||
        user.role === 'Store Admin'

      const [notifTask, settingsTask, verifTask] = await Promise.allSettled([
        api.notifications.getLatest({ limit: 30 }),
        shouldLoadSettings ? api.system.getSettings() : Promise.resolve(null),
        checkVerifications ? api.attendance.pendingVerifications() : Promise.resolve(null),
      ])

      if (notifTask.status === 'fulfilled' && notifTask.value) {
        const res = notifTask.value
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

      if (shouldLoadSettings && settingsTask.status === 'fulfilled' && settingsTask.value) {
        setAppSettings(prev => fastDeepEqual(prev, settingsTask.value) ? prev : settingsTask.value)
        settingsLoadedRef.current = true
      }

      if (checkVerifications && verifTask.status === 'fulfilled' && verifTask.value) {
        const pRes = verifTask.value
        if (pRes.pending && pRes.pending.length > 0) {
          const activePending = pRes.pending.filter(item => !cancelledVerifIdsRef.current.has(item.id))
          if (activePending.length > 0) {
            setPendingVerification(prev => (!prev || prev.id !== activePending[0].id ? activePending[0] : prev))
          } else {
            setPendingVerification(null)
          }
        } else {
          setPendingVerification(null)
        }
      }
    } finally {
      isLoadingDataRef.current = false
    }
  }

  useEffect(() => {
    settingsLoadedRef.current = false
    loadData({ includeSettings: true })
  }, [user])

  useEffect(() => {
    const handleNotifSync = () => {
      loadData()
    }
    const handleVerifSync = () => {
      loadData()
    }
    const handleReturnToQr = (e) => {
      const reqId = e?.detail?.requestId
      if (reqId) {
        cancelledVerifIdsRef.current.add(reqId)
      }
      setPendingVerification(null)
    }
    window.addEventListener('pace:notifications-sync', handleNotifSync)
    window.addEventListener('pace:verifications-sync', handleVerifSync)
    window.addEventListener('pace:return-to-qr-scan', handleReturnToQr)
    const handleTriggerFaceAuth = (e) => {
      const detail = e?.detail || { id: 0, scanned_by: { employee: { first_name: 'Store', last_name: 'Admin' } } }
      if (detail.id && cancelledVerifIdsRef.current.has(detail.id)) return
      setAuthVerificationMode('face')
      setPendingVerification(detail)
    }
    window.addEventListener('pace:trigger-face-auth', handleTriggerFaceAuth)
    return () => {
      window.removeEventListener('pace:notifications-sync', handleNotifSync)
      window.removeEventListener('pace:verifications-sync', handleVerifSync)
      window.removeEventListener('pace:return-to-qr-scan', handleReturnToQr)
      window.removeEventListener('pace:trigger-face-auth', handleTriggerFaceAuth)
    }
  }, [user])

  useEffect(() => {
    const handleSettingsUpdated = (e) => {
      if (e.detail) {
        setAppSettings(prev => ({ ...(prev || {}), ...e.detail }))
      }
    }
    window.addEventListener('system:settingsUpdated', handleSettingsUpdated)
    return () => window.removeEventListener('system:settingsUpdated', handleSettingsUpdated)
  }, [])

  useEffect(() => {
    if (appSettings?.company_name) {
      document.title = `${appSettings.company_name} | ${pageTitle}`
    }
  }, [appSettings?.company_name, pageTitle])

  useRealtimeSync((source) => {
    loadData({ includeSettings: source === 'database' || source === 'mutation' })
  }, [user], { periodic: true })

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
      let finalUrl = notif.action_url;
      if (user?.role === 'Customer' && finalUrl.startsWith('/products?id=')) {
        finalUrl = finalUrl.replace('/products?id=', '/customer/dashboard?product_id=');
      }
      navigate(finalUrl)
    }
  }

  return (
    <div className="admin-shell flex h-screen bg-transparent text-foreground overflow-hidden font-sans">
      <Sidebar
        collapsed={collapsed}
        settings={appSettings}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
        onOpenConfig={() => setConfigOpen(true)}
      />

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Header
          title={pageTitle}
          onToggle={handleToggle}
          onOpenProfile={() => setProfileOpen(true)}
          notifs={notifs}
          unreadCount={unreadCount}
          onMarkAllRead={handleMarkAllRead}
          onNotificationClick={handleNotificationClick}
          onRefreshNotifs={loadData}
          onOpenConfig={() => setConfigOpen(true)}
        />

        <main className="flex-1 overflow-y-auto p-4 md:p-6 bg-transparent">
          <div className="max-w-7xl mx-auto">
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

      <ProfileModal
        isOpen={profileOpen}
        onClose={() => setProfileOpen(false)}
      />

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

      {pendingVerification && (
        authVerificationMode === 'face' ? (
          <FaceRecognitionAttendanceModal
            isOpen={!!pendingVerification}
            request={pendingVerification}
            onClose={() => {
              const reqId = pendingVerification?.id
              if (reqId) cancelledVerifIdsRef.current.add(reqId)
              setPendingVerification(null)
              navigate('/attendance?tab=punch')
            }}
            onCancel={() => {
              const reqId = pendingVerification?.id
              if (reqId) {
                cancelledVerifIdsRef.current.add(reqId)
                api.attendance.rejectVerification({
                  scan_log_id: reqId,
                  reason: 'Attendance authorization cancelled by employee.'
                }).catch(() => {})
              }
              setPendingVerification(null)
              navigate('/attendance?tab=punch')
            }}
            onAuthorize={async (payload) => {
              const reqId = pendingVerification?.id
              try {
                if (reqId) {
                  cancelledVerifIdsRef.current.add(reqId)
                  await api.attendance.approveVerification({
                    scan_log_id: reqId,
                    verification_type: 'FACE_RECOGNITION',
                    face_verified: true,
                    face_matched: payload?.face_matched ?? true,
                    confidence: payload?.confidence
                  })
                }
              } catch (err) {
                console.error('Attendance approval error:', err)
              }
              setPendingVerification(null)
            }}
            onSuccess={() => {
              const reqId = pendingVerification?.id
              if (reqId) cancelledVerifIdsRef.current.add(reqId)
              setPendingVerification(null)
            }}
            onSwitchToPin={() => setAuthVerificationMode('pin')}
          />
        ) : (
          <EmployeePinVerificationModal
            request={pendingVerification}
            onClose={() => {
              const reqId = pendingVerification?.id
              if (reqId) cancelledVerifIdsRef.current.add(reqId)
              setPendingVerification(null)
            }}
            onCancel={() => {
              const reqId = pendingVerification?.id
              if (reqId) {
                cancelledVerifIdsRef.current.add(reqId)
                api.attendance.rejectVerification({
                  scan_log_id: reqId,
                  reason: 'Attendance authorization cancelled by employee.'
                }).catch(() => {})
              }
              setPendingVerification(null)
              navigate('/attendance?tab=punch')
            }}
            onSuccess={() => {
              const reqId = pendingVerification?.id
              if (reqId) cancelledVerifIdsRef.current.add(reqId)
              setPendingVerification(null)
            }}
            onSwitchToFace={() => setAuthVerificationMode('face')}
          />
        )
      )}
    </div>
  )
}
