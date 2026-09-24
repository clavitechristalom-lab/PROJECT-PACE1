import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FiBell, FiBellOff, FiCheckCircle, FiMail, FiAlertTriangle,
  FiShield, FiClock, FiUser, FiLock, FiPackage,
  FiShoppingCart, FiCreditCard, FiSettings, FiTrash2, FiEye,
  FiSearch, FiX, FiFilter, FiArrowRight
} from 'react-icons/fi'
import {
  Btn, Badge, Card, SearchBar, PageHeader, StatCard,
  Pagination, TabBar, showToast, LoadingState, ErrorAlert, EmptyState, TableSkeleton
} from '../components/ui'
import { fmtDate } from '../lib/utils'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { useRealtimeSync, triggerDataSync } from '../lib/realtimeSync'
import { TbCurrencyPeso } from 'react-icons/tb'

const MODULE_CATEGORIES = [
  'All',
  'Account',
  'Attendance',
  'Payroll',
  'Inventory',
  'Sales',
  'Payments',
  'Installments',
  'Security',
  'System',
  'Users',
]

const PRIORITIES = ['All', 'Critical', 'High', 'Normal', 'Low']

export default function NotificationsPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Filter States
  const [statusFilter, setStatusFilter] = useState('all')
  const [moduleFilter, setModuleFilter] = useState('All')
  const [priorityFilter, setPriorityFilter] = useState('All')
  const [search, setSearch] = useState('')

  // Pagination & Counts
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [lastPage, setLastPage] = useState(1)
  const [unreadCount, setUnreadCount] = useState(0)
  const [criticalCount, setCriticalCount] = useState(0)
  const [highCount, setHighCount] = useState(0)

  // Sound preference state
  const [soundEnabled, setSoundEnabled] = useState(() => {
    return localStorage.getItem('notif_sound') !== 'disabled'
  })

  const loadNotifications = async (targetPage = page, silent = false) => {
    if (!silent) setLoading(true)
    if (!silent) setError('')
    try {
      const res = await api.notifications.getAll({
        page: targetPage,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        module: moduleFilter !== 'All' ? moduleFilter : undefined,
        priority: priorityFilter !== 'All' ? priorityFilter : undefined,
        search: search.trim() || undefined,
        per_page: 15,
      })

      if (res) {
        setNotifications(res.notifications || [])
        setTotal(res.total || 0)
        setLastPage(res.last_page || 1)
        setUnreadCount(res.unread_count || 0)
        setCriticalCount(res.critical_count || 0)
        setHighCount(res.high_count || 0)
      }
    } catch (err) {
      console.error('Failed to load notifications:', err)
      if (!silent) setError(err.message || 'Failed to load notifications')
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      loadNotifications(1)
      setPage(1)
    }, search ? 280 : 0)
    return () => clearTimeout(timer)
  }, [statusFilter, moduleFilter, priorityFilter, search])

  useRealtimeSync(() => {
    loadNotifications(page, true)
  }, [page, statusFilter, moduleFilter, priorityFilter, search])

  // Mark single read/unread
  const handleToggleRead = async (n) => {
    try {
      if (n.is_read) {
        await api.notifications.markAsUnread(n.id)
        setNotifications(prev => prev.map(item => item.id === n.id ? { ...item, is_read: false } : item))
        setUnreadCount(prev => prev + 1)
        showToast('Marked as unread', 'info')
      } else {
        await api.notifications.markAsRead(n.id)
        setNotifications(prev => prev.map(item => item.id === n.id ? { ...item, is_read: true } : item))
        setUnreadCount(prev => Math.max(0, prev - 1))
        showToast('Marked as read', 'success')
      }
      triggerDataSync('notifications')
    } catch (err) {
      showToast(err.message || 'Failed to update notification', 'error')
    }
  }

  // Mark all as read
  const handleMarkAllRead = async () => {
    try {
      const res = await api.notifications.markAllAsRead()
      setNotifications(prev => prev.map(item => ({ ...item, is_read: true })))
      setUnreadCount(0)
      showToast(res.message || 'All notifications marked as read', 'success')
      triggerDataSync('notifications')
    } catch (err) {
      showToast(err.message || 'Failed to mark all as read', 'error')
    }
  }

  // Clear all read
  const handleClearRead = async () => {
    try {
      const res = await api.notifications.clearAllRead()
      setNotifications(prev => prev.filter(item => !item.is_read))
      showToast(res.message || 'Cleared read notifications', 'info')
      triggerDataSync('notifications')
    } catch (err) {
      showToast(err.message || 'Failed to clear notifications', 'error')
    }
  }

  // Delete single
  const handleDelete = async (id) => {
    try {
      await api.notifications.delete(id)
      setNotifications(prev => prev.filter(item => item.id !== id))
      showToast('Notification deleted', 'info')
      triggerDataSync('notifications')
    } catch (err) {
      showToast(err.message || 'Failed to delete notification', 'error')
    }
  }

  // Navigate to record
  const handleItemClick = async (n) => {
    if (!n.is_read) {
      api.notifications.markAsRead(n.id).catch(() => {})
      setNotifications(prev => prev.map(item => item.id === n.id ? { ...item, is_read: true } : item))
      setUnreadCount(prev => Math.max(0, prev - 1))
    }
    if (n.action_url) {
      navigate(n.action_url)
    }
  }

  const toggleSound = () => {
    const next = !soundEnabled
    setSoundEnabled(next)
    localStorage.setItem('notif_sound', next ? 'enabled' : 'disabled')
    showToast(`Notification sound ${next ? 'enabled' : 'disabled'}`, 'info')
  }

  const getPriorityStyle = (p) => {
    switch (String(p).toLowerCase()) {
      case 'critical':
        return {
          badge: 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/80 dark:text-rose-300 dark:border-rose-700',
          label: 'CRITICAL',
        }
      case 'high':
        return {
          badge: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/80 dark:text-amber-300 dark:border-amber-700',
          label: 'HIGH',
        }
      case 'low':
        return {
          badge: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
          label: 'LOW',
        }
      default:
        return {
          badge: 'bg-primary/10 text-primary border-primary/20',
          label: 'NORMAL',
        }
    }
  }

  const renderModuleIcon = (mod) => {
    const m = String(mod || '').toLowerCase()
    if (m.includes('attendance')) return <FiClock className="w-5 h-5 text-amber-500" />
    if (m.includes('payroll')) return <TbCurrencyPeso className="w-5 h-5 text-emerald-500" />
    if (m.includes('user') || m.includes('account')) return <FiUser className="w-5 h-5 text-blue-500" />
    if (m.includes('security')) return <FiShield className="w-5 h-5 text-rose-500" />
    if (m.includes('inventory') || m.includes('product')) return <FiPackage className="w-5 h-5 text-indigo-500" />
    if (m.includes('sale')) return <FiShoppingCart className="w-5 h-5 text-teal-500" />
    if (m.includes('payment') || m.includes('installment')) return <FiCreditCard className="w-5 h-5 text-purple-500" />
    if (m.includes('system') || m.includes('backup')) return <FiSettings className="w-5 h-5 text-slate-500" />
    return <FiBell className="w-5 h-5 text-primary" />
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notification Center"
        subtitle="Live system activity, employee attendance, payroll releases, inventory alerts, and security logs"
        action={
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={toggleSound}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border bg-card hover:bg-muted font-semibold text-xs text-foreground cursor-pointer shadow-2xs transition-colors"
            >
              {soundEnabled ? <FiBell className="w-3.5 h-3.5 text-primary" /> : <FiBellOff className="w-3.5 h-3.5 text-muted-foreground" />}
              <span>{soundEnabled ? 'Sound ON' : 'Sound OFF'}</span>
            </button>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
              >
                <FiCheckCircle className="w-3.5 h-3.5" />
                <span>Mark All Read</span>
              </button>
            )}
          </div>
        }
      />

      {/* Stats Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard title="Total Alerts" value={total.toString()} sub="in your notification log" icon={<FiBell className="w-5 h-5" />} color="blue" />
        <StatCard title="Unread" value={unreadCount.toString()} sub="requiring attention" icon={<FiMail className="w-5 h-5 text-indigo-500" />} color="indigo" />
        <StatCard title="Critical / High" value={(criticalCount + highCount).toString()} sub="priority actions" icon={<FiAlertTriangle className="w-5 h-5 text-rose-500" />} color="purple" />
        <StatCard title="Role Scope" value={user?.role || 'User'} sub="authorized events only" icon={<FiShield className="w-5 h-5 text-emerald-500" />} color="green" />
      </div>

      {error && <ErrorAlert message={error} onRetry={() => loadNotifications(page)} />}

      {/* Filters Toolbar */}
      <Card noPad className="p-3.5 border border-border space-y-3">
        <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
          <div className="flex-1 w-full relative">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && loadNotifications(1)}
              placeholder="Search notifications by title, message... (Press Enter)"
              className="w-full pl-9 pr-8 py-2 rounded-xl border border-border bg-card text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-muted-foreground/70"
            />
            {search && (
              <button
                onClick={() => { setSearch(''); loadNotifications(1); }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <FiX className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex gap-2 w-full md:w-auto flex-wrap sm:flex-nowrap">
            <select
              value={moduleFilter}
              onChange={e => setModuleFilter(e.target.value)}
              className="border border-border rounded-xl px-3 py-2 text-xs font-semibold bg-card text-foreground cursor-pointer w-full sm:w-auto"
            >
              {MODULE_CATEGORIES.map(m => (
                <option key={m} value={m}>{m === 'All' ? 'All Categories' : m}</option>
              ))}
            </select>

            <select
              value={priorityFilter}
              onChange={e => setPriorityFilter(e.target.value)}
              className="border border-border rounded-xl px-3 py-2 text-xs font-semibold bg-card text-foreground cursor-pointer w-full sm:w-auto"
            >
              {PRIORITIES.map(p => (
                <option key={p} value={p}>{p === 'All' ? 'All Priorities' : `${p} Priority`}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Status Tabs */}
        <div className="pt-2 border-t border-border flex items-center justify-between flex-wrap gap-2">
          <div className="flex gap-1.5">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                statusFilter === 'all' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground'
              }`}
            >
              All ({total})
            </button>
            <button
              onClick={() => setStatusFilter('unread')}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                statusFilter === 'unread' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground'
              }`}
            >
              <span>Unread</span>
              {unreadCount > 0 && (
                <span className="text-[10px] bg-rose-500 text-white px-1.5 rounded-full font-mono">
                  {unreadCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setStatusFilter('read')}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                statusFilter === 'read' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground'
              }`}
            >
              Read
            </button>
          </div>

          <button
            onClick={handleClearRead}
            className="text-xs text-muted-foreground hover:text-rose-600 font-semibold transition-colors cursor-pointer"
          >
            Clear read notifications
          </button>
        </div>
      </Card>

      {/* Notifications List */}
      <Card noPad className="border border-border overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-4">
            <LoadingState message="Fetching system notifications..." />
          </div>
        ) : notifications.length === 0 ? (
          <EmptyState
            icon={<FiBell className="w-12 h-12 text-muted-foreground/30 mx-auto" />}
            title="No notifications found"
            description={
              search || statusFilter !== 'all' || moduleFilter !== 'All'
                ? 'Try adjusting your filters or search query.'
                : 'You have no system notifications at this time.'
            }
          />
        ) : (
          <div className="divide-y divide-border">
            {notifications.map(n => {
              const pStyle = getPriorityStyle(n.priority)
              const isUnread = !n.is_read

              return (
                <div
                  key={n.id}
                  className={`p-4 transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 hover:bg-muted/40 ${
                    isUnread ? 'bg-primary/5 dark:bg-primary/10' : ''
                  }`}
                >
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-card border border-border flex items-center justify-center shrink-0 shadow-2xs relative">
                      {renderModuleIcon(n.module)}
                      {isUnread && (
                        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-rose-500 rounded-full ring-2 ring-card" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-foreground">
                          {n.title}
                        </span>
                        <span className="text-[10px] font-semibold bg-muted text-muted-foreground px-2 py-0.2 rounded border border-border">
                          {n.module}
                        </span>
                        {n.priority && n.priority !== 'normal' && (
                          <span className={`text-[10px] font-bold px-2 py-0.2 rounded border ${pStyle.badge}`}>
                            {pStyle.label}
                          </span>
                        )}
                        {isUnread && (
                          <span className="text-[9px] font-bold text-rose-600 dark:text-rose-400 bg-rose-100 dark:bg-rose-950/60 px-1.5 py-0.2 rounded-full border border-rose-300">
                            NEW
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {n.message}
                      </p>

                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground/80 font-mono">
                        <span>{n.time_ago || n.time}</span>
                        <span>•</span>
                        <span>{n.time}</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 w-full sm:w-auto justify-end shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/60">
                    {n.action_url && (
                      <button
                        onClick={() => handleItemClick(n)}
                        className="flex items-center gap-1 px-3 py-1 bg-primary text-primary-foreground font-bold text-xs rounded-lg cursor-pointer"
                      >
                        <span>View</span>
                        <FiArrowRight className="w-3 h-3" />
                      </button>
                    )}

                    <button
                      onClick={() => handleToggleRead(n)}
                      title={n.is_read ? "Mark as unread" : "Mark as read"}
                      className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-border hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                    >
                      {n.is_read ? 'Mark Unread' : 'Mark Read'}
                    </button>

                    <button
                      onClick={() => handleDelete(n.id)}
                      title="Delete notification"
                      className="p-1.5 rounded-lg border border-border hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 text-muted-foreground transition-colors cursor-pointer"
                    >
                      <FiTrash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Pagination */}
        {total > 15 && (
          <div className="p-3 border-t border-border bg-muted/20">
            <Pagination
              page={page}
              pageSize={15}
              total={total}
              onChange={(p) => {
                setPage(p)
                loadNotifications(p)
              }}
            />
          </div>
        )}
      </Card>
    </div>
  )
}
