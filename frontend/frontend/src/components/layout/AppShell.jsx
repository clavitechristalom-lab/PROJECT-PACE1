import { useState, useRef, useEffect } from 'react'
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import {
  FiHome, FiPackage, FiUsers, FiShoppingCart, FiCreditCard,
  FiCalendar, FiUser, FiClock, FiFileText,
  FiBarChart2, FiSettings, FiShield, FiDatabase, FiActivity,
  FiSun, FiMoon, FiSearch, FiLogOut, FiMenu, FiChevronDown,
  FiCheckCircle, FiX, FiBell, FiCamera, FiLayers, FiDollarSign
} from 'react-icons/fi'
import { useAuth } from '../../context/AuthContext'
import { NotificationBell, showToast } from '../ui'
import { api } from '../../lib/api'
import { useTheme } from '../../context/ThemeContext'
import ProfileModal from './ProfileModal'
import EmployeePinVerificationModal from '../attendance/EmployeePinVerificationModal'
import { TbCurrencyPeso } from 'react-icons/tb'

const icons = {
  dashboard: <FiHome className="w-4 h-4 flex-shrink-0" />,
  products: <FiPackage className="w-4 h-4 flex-shrink-0" />,
  customers: <FiUser className="w-4 h-4 flex-shrink-0" />,
  sales: <FiShoppingCart className="w-4 h-4 flex-shrink-0" />,
  installment: <FiCreditCard className="w-4 h-4 flex-shrink-0" />,
  schedule: <FiCalendar className="w-4 h-4 flex-shrink-0" />,
  payments: <FiDollarSign className="w-4 h-4 flex-shrink-0" />,
  employees: <FiUsers className="w-4 h-4 flex-shrink-0" />,
  payroll: <FiDollarSign className="w-4 h-4 flex-shrink-0" />,
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
}

function navByRole(role) {
  if (role === 'Employee') {
    return [
      { label: 'My Dashboard', path: '/employee/dashboard', icon: icons.dashboard },
      { label: 'My Attendance QR', path: '/employee/attendance', icon: icons.attendance },
      { label: 'My Payroll', path: '/employee/payroll', icon: icons.payroll },
      { label: 'My Payslips', path: '/employee/payslips', icon: icons.payslip },
      {
        label: 'My Details',
        icon: icons.employees,
        items: [
          { label: 'Employees & QR', path: '/employees', icon: icons.employees }
        ],
      }
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
      { label: 'Installment Accounts', path: '/installments', icon: icons.installment },
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
      { label: 'System Logs', path: '/system-logs', icon: icons.logs },
      { label: 'Backup & Restore', path: '/backups', icon: icons.backup },
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

  if (isAdmin) {
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
        className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer rounded-xl mx-1 ${
          isActive ? 'text-white' : 'text-white/50 hover:text-white/80'
        }`}
        style={{ width: collapsed ? 44 : 'calc(100% - 8px)' }}
      >
        <span className="flex-shrink-0">{group.icon}</span>
        {!collapsed && (
          <>
            <span className="flex-1 text-left truncate">{group.label}</span>
            <FiChevronDown className={`w-3.5 h-3.5 transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`} />
          </>
        )}
      </button>
      {(open || collapsed) && (
        <div className={collapsed ? '' : 'ml-3 border-l border-white/10 pl-2 space-y-0.5 mt-0.5'}>
          {group.items.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              title={collapsed ? item.label : undefined}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 text-xs rounded-xl transition-colors cursor-pointer ${
                  location.pathname === item.path
                    ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                    : 'text-white/60 hover:bg-white/5 hover:text-white'
                }`
              }
            >
              {item.icon}
              {!collapsed && <span className="truncate">{item.label}</span>}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  )
}

function Sidebar({ collapsed }) {
  const { user } = useAuth()
  const navItems = user ? navByRole(user.role) : []

  if (!user || user.role === 'Customer') return null

  return (
    <aside
      className="flex flex-col h-full overflow-hidden flex-shrink-0 transition-[width] duration-200"
      style={{ width: collapsed ? 64 : 240, background: '#0f1f3d' }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 py-4 border-b border-white/10 flex-shrink-0">
        <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm flex-shrink-0 shadow-xs">P</div>
        {!collapsed && (
          <div className="overflow-hidden">
            <div className="text-white font-bold text-sm tracking-wide leading-tight">PROJECT PACE</div>
            <div className="text-white/40 text-[9px] font-mono leading-tight truncate">Z-LICZ Appliances</div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 space-y-0.5 px-1.5">
        {navItems.map((entry, i) =>
          entry.items ? (
            <SidebarGroup key={i} group={entry} collapsed={collapsed} />
          ) : (
            <NavLink
              key={entry.path}
              to={entry.path}
              title={collapsed ? entry.label : undefined}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 text-xs rounded-xl transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                    : 'text-white/60 hover:bg-white/5 hover:text-white'
                }`
              }
            >
              <span className="flex-shrink-0">{entry.icon}</span>
              {!collapsed && <span className="truncate flex-1">{entry.label}</span>}
              {!collapsed && entry.badge && (
                <span className="text-[10px] font-bold font-mono bg-rose-500 text-white px-1.5 py-0.2 rounded-full shrink-0">
                  {entry.badge}
                </span>
              )}
            </NavLink>
          )
        )}
      </nav>
    </aside>
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
      <span className="text-xs font-bold font-mono text-foreground tracking-tight">
        {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </span>
      <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
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
}) {
  const { user, logout } = useAuth()
  const { theme, toggleMode } = useTheme()
  const [userOpen, setUserOpen] = useState(false)
  const userRef = useRef(null)
  const navigate = useNavigate()
  const isDark = theme === 'dark'

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
    if (t.includes('cust')) return <FiUser className="w-4 h-4 text-emerald-500" />
    if (t.includes('prod')) return <FiPackage className="w-4 h-4 text-amber-500" />
    if (t.includes('sale') || t.includes('trans')) return <FiShoppingCart className="w-4 h-4 text-indigo-500" />
    if (t.includes('inst')) return <FiFileText className="w-4 h-4 text-purple-500" />
    if (t.includes('pay_rec') || t.includes('payment')) return <TbCurrencyPeso className="w-4 h-4 text-emerald-500" />
    if (t.includes('att')) return <FiClock className="w-4 h-4 text-cyan-500" />
    if (t.includes('payroll') || t.includes('payslip')) return <FiCreditCard className="w-4 h-4 text-rose-500" />
    if (t.includes('usr') || t.includes('user')) return <FiShield className="w-4 h-4 text-amber-500" />
    if (t.includes('log')) return <FiActivity className="w-4 h-4 text-slate-500" />
    if (t.includes('backup')) return <FiDatabase className="w-4 h-4 text-emerald-500" />
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
    <header className="h-14 border-b border-border bg-card px-4 flex items-center justify-between gap-4 flex-shrink-0 z-30">
      {/* Left: toggle + title */}
      <div className="flex items-center gap-3">
        {user?.role !== 'Customer' && (
          <button
            onClick={onToggle}
            className="w-8 h-8 rounded-xl hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            aria-label="Toggle sidebar"
          >
            <FiMenu className="w-4 h-4" />
          </button>
        )}
        <h1 className="text-sm font-bold text-foreground truncate">{title}</h1>
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
            className="w-full h-9 pl-9 pr-16 text-xs rounded-xl border border-border bg-muted/40 text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
          />
          <div className="absolute left-3 top-2.5 text-muted-foreground pointer-events-none">
            {isSearching ? (
              <svg className="animate-spin w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24">
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
                className="text-muted-foreground hover:text-foreground p-0.5 rounded cursor-pointer"
                title="Clear search query"
              >
                <FiX className="w-3.5 h-3.5" />
              </button>
            )}
            <kbd className="hidden lg:inline-block px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground bg-muted border border-border rounded shadow-2xs">
              Ctrl+K
            </kbd>
          </div>
        </div>

        {/* Global Search Dropdown Modal */}
        {searchOpen && (
          <div className="absolute top-11 left-0 right-0 bg-card rounded-2xl border border-border shadow-2xl z-50 overflow-hidden max-h-[420px] flex flex-col animate-[slideUp_0.15s_ease]">
            <div className="p-2.5 border-b border-border bg-muted/30 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>
                {searchQuery.trim().length < 2
                  ? 'Type at least 2 characters to search MySQL database...'
                  : `${totalMatches} matching record${totalMatches === 1 ? '' : 's'} found`}
              </span>
              {isSearching && <span className="text-primary font-medium animate-pulse">Searching database...</span>}
            </div>

            <div className="overflow-y-auto flex-1 p-1 divide-y divide-border/50" ref={listRef}>
              {searchQuery.trim().length >= 2 && searchResults.length === 0 && !isSearching && (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  <FiSearch className="w-8 h-8 mx-auto text-muted-foreground/30 mb-1" />
                  <p className="font-semibold text-foreground">No matching database records found</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Try searching by employee name, code, customer, SKU, invoice #, or log keyword.</p>
                </div>
              )}

              {Object.keys(groupedResults).map((groupCategory) => {
                const groupItems = groupedResults[groupCategory] || []
                if (!groupItems.length) return null

                return (
                  <div key={groupCategory} className="py-1">
                    <div className="px-3 py-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
                      <span>{groupCategory}</span>
                      <span className="font-mono text-[9px] bg-muted px-1.5 py-0.2 rounded text-foreground">{groupItems.length}</span>
                    </div>

                    {groupItems.map((item) => {
                      const flatIndex = searchResults.findIndex(r => r.id === item.id)
                      const isSelected = flatIndex === selectedIndex

                      return (
                        <div
                          key={item.id}
                          onClick={() => handleSelectResult(item)}
                          onMouseEnter={() => setSelectedIndex(flatIndex)}
                          className={`px-3 py-2 text-xs rounded-xl cursor-pointer flex items-center justify-between gap-3 transition-colors ${
                            isSelected ? 'bg-primary text-primary-foreground font-medium shadow-xs' : 'hover:bg-muted text-foreground'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="text-xs shrink-0">{getSearchIcon(item)}</span>
                            <div className="min-w-0">
                              <div className="font-semibold truncate flex items-center gap-1.5">
                                <span>{item.title}</span>
                              </div>
                              <div className={`text-[11px] truncate ${isSelected ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                                {item.subtitle}
                              </div>
                            </div>
                          </div>

                          <span className={`text-[10px] font-mono shrink-0 ${isSelected ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
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
              <div className="p-2 border-t border-border bg-muted/20 flex items-center justify-between text-[10px] text-muted-foreground">
                <span className="flex items-center gap-2">
                  <span><kbd className="px-1 py-0.5 bg-muted rounded border border-border">↑</kbd> <kbd className="px-1 py-0.5 bg-muted rounded border border-border">↓</kbd> Navigate</span>
                  <span><kbd className="px-1 py-0.5 bg-muted rounded border border-border">↵</kbd> Select</span>
                  <span><kbd className="px-1 py-0.5 bg-muted rounded border border-border">Esc</kbd> Close</span>
                </span>
                <span className="text-[9px] text-muted-foreground font-mono">Live Search</span>
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
          className="sm:hidden w-9 h-9 flex items-center justify-center rounded-xl border border-border bg-muted/40 hover:bg-muted text-foreground transition-colors cursor-pointer text-base shadow-2xs"
        >
          <FiSearch className="w-4 h-4" />
        </button>

        {/* Dark/Light mode toggle */}
        <button
          onClick={toggleMode}
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          className="w-9 h-9 flex items-center justify-center rounded-xl border border-border bg-muted/40 hover:bg-muted text-foreground transition-colors cursor-pointer text-base shadow-2xs"
        >
          {isDark ? <FiSun className="w-4 h-4 text-amber-500" /> : <FiMoon className="w-4 h-4 text-slate-700 dark:text-slate-300" />}
        </button>

        {/* Real Notification Bell with Live DB Count & Dropdown */}
        <NotificationBell 
          notifications={notifs} 
          unreadCount={unreadCount}
          onMarkAllRead={onMarkAllRead}
          onNotificationClick={onNotificationClick}
          onViewAll={() => navigate('/notifications')}
          onRefresh={onRefreshNotifs}
        />

        {/* User Menu */}
        <div className="relative" ref={userRef}>
          <button
            onClick={() => setUserOpen(o => !o)}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl border border-border bg-muted/30 hover:bg-muted transition-colors cursor-pointer shadow-2xs"
          >
            <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-bold overflow-hidden shadow-xs shrink-0">
              {user?.profile_image ? (
                <img src={user.profile_image} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                user?.name ? user.name[0] : 'U'
              )}
            </div>
            <div className="hidden sm:block text-left">
              <div className="text-xs font-semibold text-foreground leading-tight">{user?.name ? user.name.split(' ')[0] : 'User'}</div>
              <div className="text-[10px] text-muted-foreground font-mono leading-tight">{user?.role}</div>
            </div>
          </button>
          {userOpen && (
            <div className="absolute right-0 top-12 w-56 bg-card rounded-2xl border border-border shadow-2xl z-40 overflow-hidden animate-[slideUp_0.15s_ease]">
              <div className="px-4 py-3 border-b border-border bg-muted/40">
                <div className="text-xs font-bold text-foreground truncate">{user.name}</div>
                <div className="text-[11px] text-muted-foreground font-mono truncate">{user.username}</div>
              </div>
              <div className="p-1 space-y-0.5">
                <button
                  onClick={() => { onOpenProfile?.(); setUserOpen(false) }}
                  className="w-full text-left px-3 py-2 text-xs text-foreground hover:bg-muted rounded-xl cursor-pointer flex items-center gap-2 font-medium transition-colors"
                >
                  <FiUser className="w-3.5 h-3.5 text-primary" />
                  <span>Profile Information</span>
                </button>
                <button
                  onClick={() => { navigate('/notifications'); setUserOpen(false) }}
                  className="w-full text-left px-3 py-2 text-xs text-foreground hover:bg-muted rounded-xl cursor-pointer flex items-center gap-2 font-medium transition-colors"
                >
                  <FiBell className="w-3.5 h-3.5 text-primary" />
                  <span>Notifications</span>
                </button>
                <button
                  onClick={() => { navigate('/settings'); setUserOpen(false) }}
                  className="w-full text-left px-3 py-2 text-xs text-foreground hover:bg-muted rounded-xl cursor-pointer flex items-center gap-2 font-medium transition-colors"
                >
                  <FiSettings className="w-3.5 h-3.5 text-primary" />
                  <span>Settings</span>
                </button>
                <button
                  onClick={() => { logout(); navigate('/login') }}
                  className="w-full text-left px-3 py-2 text-xs text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl cursor-pointer flex items-center gap-2 font-bold transition-colors border-t border-border mt-1"
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
  '/installments': 'Installment Accounts',
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
  '/employee/dashboard': 'My Dashboard',
  '/employee/notifications': 'Notification Center',
  '/employee/attendance': 'My Attendance',
  '/employee/payroll': 'My Payroll',
  '/employee/payslips': 'My Payslips',
  '/customer/dashboard': 'My Dashboard',
}

export default function AppShell() {
  const [collapsed, setCollapsed] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [notifs, setNotifs] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [pendingVerification, setPendingVerification] = useState(null) // New State for PIN verification
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()

  const loadData = async () => {
    if (!user) return
    try {
      const res = await api.notifications.getLatest({ limit: 15 })
      setNotifs(res.notifications || [])
      setUnreadCount(res.unread_count || 0)
    } catch (e) {
      // Background notifications failure should not break app
    }

    // New: Poll for pending attendance verifications if Employee
    if (user.role === 'Employee' || user.role === 'Store Administrator' || user.role === 'Store Admin') {
      try {
        const pRes = await api.attendance.pendingVerifications()
        if (pRes.pending && pRes.pending.length > 0) {
          // If there's a new pending request that we aren't currently showing, show it
          if (!pendingVerification || pendingVerification.id !== pRes.pending[0].id) {
            setPendingVerification(pRes.pending[0])
          }
        }
      } catch (e) {
        // Ignored
      }
    }
  }

  useEffect(() => {
    loadData()
    const timer = setInterval(loadData, 10000) // Lowered to 10s for better responsiveness
    return () => clearInterval(timer)
  }, [user])

  const handleMarkAllRead = async () => {
    try {
      await api.notifications.markAllAsRead()
      setNotifs(prev => prev.map(n => ({ ...n, is_read: true })))
      setUnreadCount(0)
      showToast('All notifications marked as read', 'success')
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
      } catch (err) {
        // Continue navigation
      }
    }

    if (notif.action_url) {
      navigate(notif.action_url)
    } else {
      navigate('/notifications')
    }
  }

  const pageTitle = ROUTE_TITLES[location.pathname] || 'Project PACE'

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden font-sans">
      <Sidebar 
        collapsed={collapsed} 
      />

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Header
          title={pageTitle}
          onToggle={() => setCollapsed(c => !c)}
          onOpenProfile={() => setProfileOpen(true)}
          notifs={notifs}
          unreadCount={unreadCount}
          onMarkAllRead={handleMarkAllRead}
          onNotificationClick={handleNotificationClick}
          onRefreshNotifs={loadData}
        />

        <main className="flex-1 overflow-y-auto p-4 md:p-6 bg-background">
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>

      <ProfileModal 
        isOpen={profileOpen} 
        onClose={() => setProfileOpen(false)} 
      />

      <EmployeePinVerificationModal
        request={pendingVerification}
        onClose={() => setPendingVerification(null)}
        onSuccess={() => setPendingVerification(null)}
      />
    </div>
  )
}
