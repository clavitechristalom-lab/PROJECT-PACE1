import { useState, useEffect, useMemo, useRef } from 'react'
import {
  FiUsers, FiActivity, FiSettings, FiBarChart2, FiDatabase,
  FiSearch, FiLock, FiCheckCircle, FiMonitor,
  FiToggleRight, FiToggleLeft, FiPlus, FiImage, FiTrash2,
  FiHardDrive, FiPackage, FiShield, FiRefreshCw, FiBriefcase, FiCpu
} from 'react-icons/fi'
import {
  PageHeader, Card, StatCard, Table, TR, TD, Badge, StatusBadge,
  Input, Select, LoadingState, ErrorAlert, TableSkeleton, EmptyState, TabBar, showToast,
  Btn, Modal, Pagination, showError, showWarning, confirmDelete
} from '../components/ui'
import { api } from '../lib/api'
import { triggerDataSync, useRealtimeSync } from '../lib/realtimeSync'
import { fmtDate } from '../lib/utils'

export default function SystemAdminDashboard() {
  const [activeTab, setActiveTab] = useState('metrics')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Carousel Modal State
  const [isCarouselModalOpen, setCarouselModalOpen] = useState(false)
  const [uploadingCarousel, setUploadingCarousel] = useState(false)
  const [carouselPreview, setCarouselPreview] = useState(null)
  const fileInputRef = useRef(null)

  // Metrics State
  const [metrics, setMetrics] = useState(null)

  // Users State
  const [users, setUsers] = useState([])
  const [userSearch, setUserSearch] = useState('')
  const [userRoleFilter, setUserRoleFilter] = useState('All')
  const [userStatusFilter, setUserStatusFilter] = useState('All')
  const [togglingUser, setTogglingUser] = useState(null)

  // Logs State
  const [logs, setLogs] = useState([])
  const [logSearch, setLogSearch] = useState('')
  const [logDateRange, setLogDateRange] = useState({ start: '', end: '' })
  const [clearingLogs, setClearingLogs] = useState(false)

  // Settings State
  const [settings, setSettings] = useState({
    site_name: 'Z-LICZ Appliances',
    maintenance_mode: false,
    debug_mode: false,
    default_language: 'EN',
  })
  const [siteNameInput, setSiteNameInput] = useState('Z-LICZ Appliances')
  const [savingSettings, setSavingSettings] = useState(false)
  const [savingSiteName, setSavingSiteName] = useState(false)

  // Carousel State
  const [carouselImages, setCarouselImages] = useState([])

  const loadData = async (tab, source) => {
    const isBg = source === 'timer' || source === 'database' || source === 'event' || source === 'sync' || source === 'focus';
    if (!isBg) setLoading(true)
    setError('')
    try {
      if (tab === 'metrics') {
        const data = await api.system.getSystemStats()
        setMetrics(data)
      } else if (tab === 'users') {
        const data = await api.system.getUsers()
        setUsers(data.users || [])
      } else if (tab === 'logs') {
        const data = await api.system.getLogs()
        setLogs(data.logs || [])
      } else if (tab === 'settings') {
        const data = await api.system.getSettings({ fresh: true })
        if (data) {
          const resolvedSiteName = data.site_name || data.company_name || data.name || 'Z-LICZ Appliances'
          setSettings(prev => ({
            ...prev,
            ...data,
            site_name: resolvedSiteName,
            maintenance_mode: Boolean(data.maintenance_mode),
            debug_mode: Boolean(data.debug_mode),
          }))
          setSiteNameInput(resolvedSiteName)
        }
      } else if (tab === 'carousel') {
        const data = await api.carouselImages.getAll()
        setCarouselImages(data || [])
      }
    } catch (err) {
      console.error(`Failed to load ${tab}:`, err)
      if (!isBg) setError(err.message || 'Failed to load data')
    } finally {
      if (!isBg) setLoading(false)
    }
  }

  useEffect(() => {
    loadData(activeTab)
  }, [activeTab])

  useRealtimeSync((source) => {
    loadData(activeTab, source)
  }, [activeTab], { module: 'system' })

  // --- Handlers ---
  const handleCarouselFileChange = (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      // Just preview the first one, but we'll show +N more in UI
      setCarouselPreview({
        url: URL.createObjectURL(files[0]),
        count: files.length
      });
    } else {
      setCarouselPreview(null);
    }
  };

  const handleCarouselUpload = async (e) => {
    e.preventDefault();
    const files = fileInputRef.current?.files;
    if (!files || files.length === 0) {
      showToast('Please select at least one image', 'error');
      return;
    }
    
    setUploadingCarousel(true);
    let successCount = 0;
    let limitReached = false;

    try {
      for (let i = 0; i < files.length; i++) {
        const formData = new FormData();
        formData.append('image', files[i]);
        
        try {
          await api.carouselImages.create(formData);
          successCount++;
        } catch (err) {
          if (err.message && err.message.includes('Maximum limit')) {
            limitReached = true;
            break; // Stop uploading more files
          }
          throw err; // Re-throw other errors
        }
      }

      if (limitReached) {
        showWarning('Limit Reached', `Uploaded ${successCount} images. Maximum limit of 10 carousel images reached.`);
      } else {
        showToast(`Successfully uploaded ${successCount} image(s)`, 'success');
      }
      
      closeCarouselModal();
      loadData('carousel');
    } catch (err) {
      console.error(err);
      showError('Upload Failed', err.message || 'Failed to upload image(s)');
    } finally {
      setUploadingCarousel(false);
    }
  }

  const handleToggleUserStatus = async (userRecord) => {
    setTogglingUser(userRecord.user_id)
    try {
      await api.system.updateUser(userRecord.user_id, {
        is_active: !userRecord.is_active
      })
      setUsers(users.map(u => u.user_id === userRecord.user_id ? { ...u, is_active: !u.is_active } : u))
      showToast('User status updated successfully', 'success')
      triggerDataSync('users')
    } catch (err) {
      showToast(err.message || 'Failed to update user status', 'error')
    } finally {
      setTogglingUser(null)
    }
  }

  const handleClearLogs = async () => {
    if (clearingLogs || logs.length === 0) return
    setClearingLogs(true)
    try {
      const res = await api.system.clearLogs()
      setLogs([])
      showToast(res?.message || 'All system audit logs cleared successfully', 'success')
      triggerDataSync('system')
    } catch (err) {
      console.error(err)
      showToast(err.message || 'Failed to clear system audit logs', 'error')
    } finally {
      setClearingLogs(false)
    }
  }

  const handleToggleSetting = async (key) => {
    const prevValue = Boolean(settings[key])
    const nextValue = !prevValue
    setSettings(prev => ({ ...prev, [key]: nextValue }))
    setSavingSettings(true)
    try {
      const res = await api.system.saveSettings({ [key]: nextValue })
      const saved = res?.settings || res?.data || { [key]: nextValue }
      const resolvedSiteName = saved.site_name || saved.company_name || saved.name || settings.site_name
      setSettings(prev => ({
        ...prev,
        ...saved,
        site_name: resolvedSiteName,
        maintenance_mode: Boolean(saved.maintenance_mode ?? (key === 'maintenance_mode' ? nextValue : prev.maintenance_mode)),
        debug_mode: Boolean(saved.debug_mode ?? (key === 'debug_mode' ? nextValue : prev.debug_mode)),
      }))
      window.dispatchEvent(new CustomEvent('system:settingsUpdated', { detail: { ...saved, site_name: resolvedSiteName } }))
      const label = key === 'maintenance_mode' ? 'Maintenance Mode' : 'Debug Mode'
      showToast(`${label} ${nextValue ? 'enabled' : 'disabled'}`, 'success')
      triggerDataSync('settings')
    } catch (err) {
      showToast(err?.message || 'Failed to save settings', 'error')
      setSettings(prev => ({ ...prev, [key]: prevValue }))
    } finally {
      setSavingSettings(false)
    }
  }

  const handleSaveSiteName = async (e) => {
    e?.preventDefault()
    const trimmed = siteNameInput.trim()
    if (!trimmed) {
      showToast('Site Name cannot be empty', 'warning')
      return
    }
    setSavingSiteName(true)
    try {
      const res = await api.system.saveSettings({ site_name: trimmed, company_name: trimmed })
      const saved = res?.settings || res?.data || { site_name: trimmed, company_name: trimmed }
      const resolvedSiteName = saved.site_name || saved.company_name || trimmed
      setSettings(prev => ({ ...prev, ...saved, site_name: resolvedSiteName, company_name: resolvedSiteName }))
      setSiteNameInput(resolvedSiteName)
      window.dispatchEvent(new CustomEvent('system:settingsUpdated', { detail: { ...saved, site_name: resolvedSiteName, company_name: resolvedSiteName } }))
      showToast(`Site Name updated to "${resolvedSiteName}"`, 'success')
      triggerDataSync('settings')
    } catch (err) {
      showToast(err?.message || 'Failed to update Site Name', 'error')
    } finally {
      setSavingSiteName(false)
    }
  }

  // --- Filtered Data ---
  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      const matchSearch = (u.username || '').toLowerCase().includes(userSearch.toLowerCase()) || 
                          (u.email || '').toLowerCase().includes(userSearch.toLowerCase())
      const matchRole = userRoleFilter === 'All' || (
        userRoleFilter === 'Store Administrator' || userRoleFilter === 'Store Admin'
          ? (u.role === 'Store Administrator' || u.role === 'Store Admin')
          : u.role === userRoleFilter
      )
      const matchStatus = userStatusFilter === 'All' || 
                          (userStatusFilter === 'Active' ? u.is_active : !u.is_active)
      return matchSearch && matchRole && matchStatus
    })
  }, [users, userSearch, userRoleFilter, userStatusFilter])

  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      const searchStr = logSearch.toLowerCase()
      const userName = (typeof log.user === 'object' ? log.user?.username : log.user) || log.user_username || ''
      const matchesSearch = !logSearch || 
        userName.toLowerCase().includes(searchStr) ||
        (log.action || '').toLowerCase().includes(searchStr) ||
        (log.module || '').toLowerCase().includes(searchStr) ||
        (log.description || '').toLowerCase().includes(searchStr)
        
      let matchesDate = true
      if (logDateRange.start || logDateRange.end) {
        const logDate = new Date(log.created_at || log.datetime)
        logDate.setHours(0, 0, 0, 0)
        
        if (logDateRange.start) {
          const start = new Date(logDateRange.start)
          start.setHours(0, 0, 0, 0)
          if (logDate < start) matchesDate = false
        }
        if (logDateRange.end) {
          const end = new Date(logDateRange.end)
          end.setHours(0, 0, 0, 0)
          if (logDate > end) matchesDate = false
        }
      }
      return matchesSearch && matchesDate
    })
  }, [logs, logSearch, logDateRange])

  const [userPage, setUserPage] = useState(1)
  const userPageSize = 10

  const paginatedUsers = useMemo(() => {
    const start = (userPage - 1) * userPageSize
    return filteredUsers.slice(start, start + userPageSize)
  }, [filteredUsers, userPage, userPageSize])

  const [logPage, setLogPage] = useState(1)
  const logPageSize = 15

  const paginatedLogs = useMemo(() => {
    const start = (logPage - 1) * logPageSize
    return filteredLogs.slice(start, start + logPageSize)
  }, [filteredLogs, logPage, logPageSize])

  useEffect(() => {
    setUserPage(1)
  }, [userSearch, userRoleFilter, userStatusFilter])

  useEffect(() => {
    setLogPage(1)
  }, [logSearch, logDateRange])

  // --- Views ---
  const renderMetrics = () => {
    if (loading && !metrics) {
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="h-24 bg-card animate-pulse rounded-xl" />
          <div className="h-24 bg-card animate-pulse rounded-xl" />
          <div className="h-24 bg-card animate-pulse rounded-xl" />
          <div className="h-24 bg-card animate-pulse rounded-xl" />
        </div>
      )
    }

    const userBreakdown = metrics?.user_breakdown || {}
    const catalogStats = metrics?.catalog_stats || {}
    const txStats = metrics?.transaction_stats || {}
    const serverHealth = metrics?.server_health || {}
    const activityTrend = Array.isArray(metrics?.activity_trend) ? metrics.activity_trend : []
    const dbTables = Array.isArray(metrics?.database_tables) ? metrics.database_tables : []
    const branchMetrics = Array.isArray(metrics?.branch_metrics) ? metrics.branch_metrics : []

    const maxTrendOps = Math.max(1, ...activityTrend.map(d => Number(d.total_ops) || 0))
    const totalWeekOps = activityTrend.reduce((sum, d) => sum + (Number(d.total_ops) || 0), 0)

    return (
      <div className="space-y-6">
        {/* Top 4 Core KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Total Users"
            value={metrics?.total_users || 0}
            sub={`${metrics?.verified_users ?? userBreakdown.verified ?? 0} verified accounts`}
            icon={<FiUsers className="text-blue-500" />}
            color="blue"
          />
          <StatCard
            title="Active Sessions"
            value={metrics?.active_sessions || 0}
            sub={`${metrics?.online_sessions ?? userBreakdown.online ?? 0} online • ${metrics?.active_24h ?? 0} in 24h`}
            icon={<FiMonitor className="text-sky-500" />}
            color="green"
          />
          <StatCard
            title="System Uptime"
            value={metrics?.uptime || 'Active'}
            sub="MySQL & API service online"
            icon={<FiActivity className="text-indigo-500" />}
            color="purple"
          />
          <StatCard
            title="Database Size"
            value={metrics?.database_size || '0 MB'}
            sub={`${metrics?.table_count || dbTables.length || 0} active schema tables`}
            icon={<FiDatabase className="text-cyan-500" />}
            color="yellow"
          />
        </div>

        {/* Advanced System Metrics Main Console */}
        <Card noPad className="border border-border overflow-hidden">
          {/* Header Banner */}
          <div className="p-4 sm:p-5 border-b border-border bg-muted/25 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shrink-0">
                <FiBarChart2 className="w-5 h-5" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-bold text-foreground">Advanced System Metrics</h3>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25 text-[10px] font-bold uppercase tracking-wider">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Optimal • Live Telemetry
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Real-time database storage distribution, 7-day operational load, runtime health, and multi-branch telemetry.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => loadData('metrics')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary font-bold text-xs transition-colors cursor-pointer"
              >
                <FiRefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>
          </div>

          <div className="p-4 sm:p-5 space-y-6">
            {/* 3 Subsystem Health Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 text-xs">
              {/* Catalog & Inventory Health */}
              <div className="p-3.5 rounded-2xl bg-muted/20 border border-border space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Catalog & Inventory
                  </span>
                  <FiPackage className="w-4 h-4 text-blue-500" />
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-xl font-bold font-mono text-foreground">
                    {catalogStats.total_products ?? 0}
                  </span>
                  <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                    {catalogStats.in_stock_products ?? 0} In Stock
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-border">
                  <span>{catalogStats.total_categories ?? 0} Categories</span>
                  <span>
                    {catalogStats.low_stock_products ?? 0} Low • {catalogStats.out_of_stock_products ?? 0} Out
                  </span>
                </div>
              </div>

              {/* Transaction & Ledger Throughput */}
              <div className="p-3.5 rounded-2xl bg-muted/20 border border-border space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Ledger & Transactions
                  </span>
                  <FiActivity className="w-4 h-4 text-emerald-500" />
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-xl font-bold font-mono text-foreground">
                    {txStats.total_sales ?? 0}
                  </span>
                  <span className="text-[11px] font-semibold text-primary">
                    +{txStats.sales_today ?? 0} Today
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-border">
                  <span>{txStats.active_installments ?? 0} Active Contracts</span>
                  <span>{txStats.total_payments ?? 0} Payments</span>
                </div>
              </div>

              {/* Audit & Security Telemetry */}
              <div className="p-3.5 rounded-2xl bg-muted/20 border border-border space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Audit & Backup Security
                  </span>
                  <FiShield className="w-4 h-4 text-indigo-500" />
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-xl font-bold font-mono text-foreground">
                    {txStats.audit_logs_total ?? 0}
                  </span>
                  <span className="text-[11px] font-semibold text-indigo-500">
                    +{txStats.audit_logs_today ?? 0} Events Today
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-border">
                  <span>{txStats.total_backups ?? 0} Backups</span>
                  <span className="truncate max-w-[130px]" title={txStats.latest_backup}>
                    {txStats.latest_backup || 'No backups'}
                  </span>
                </div>
              </div>
            </div>

            {/* 7-Day System Load & Operational Activity Chart */}
            <div className="p-4 rounded-2xl bg-card border border-border space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
                    7-Day System Load & Operational Activity ({totalWeekOps} Total Events)
                  </h4>
                  <p className="text-[11px] text-muted-foreground">
                    Daily breakdown of system audit events, POS sales, payment collections, and attendance scans.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-[11px]">
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <span className="w-2.5 h-2.5 rounded-xs bg-blue-500 inline-block" /> Audit Logs
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500 inline-block" /> Sales
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <span className="w-2.5 h-2.5 rounded-xs bg-amber-500 inline-block" /> Payments
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <span className="w-2.5 h-2.5 rounded-xs bg-purple-500 inline-block" /> Attendance
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-7 gap-2.5 pt-2 items-end h-44">
                {activityTrend.map((day) => {
                  const total = Number(day.total_ops) || 0
                  const barHeightPct = total > 0 ? Math.max(12, Math.round((total / maxTrendOps) * 100)) : 6
                  const auditH = total > 0 ? Math.round(((day.audit_events || 0) / total) * 100) : 0
                  const salesH = total > 0 ? Math.round(((day.sales || 0) / total) * 100) : 0
                  const payH = total > 0 ? Math.round(((day.payments || 0) / total) * 100) : 0
                  const attH = Math.max(0, 100 - auditH - salesH - payH)

                  return (
                    <div key={day.date} className="flex flex-col items-center h-full justify-end group">
                      <span className="font-mono text-[10px] font-bold text-foreground mb-1">
                        {total}
                      </span>
                      <div className="w-full max-w-[46px] h-28 bg-muted/40 rounded-xl p-1 flex items-end border border-border/60">
                        <div
                          className="w-full rounded-lg overflow-hidden flex flex-col justify-end transition-all duration-300"
                          style={{ height: `${barHeightPct}%` }}
                          title={`${day.label}: ${day.audit_events} Audit, ${day.sales} Sales, ${day.payments} Payments, ${day.attendance} Attendance`}
                        >
                          {total > 0 ? (
                            <>
                              {day.attendance > 0 && (
                                <div className="w-full bg-purple-500" style={{ height: `${Math.max(10, attH)}%` }} />
                              )}
                              {day.payments > 0 && (
                                <div className="w-full bg-amber-500" style={{ height: `${Math.max(10, payH)}%` }} />
                              )}
                              {day.sales > 0 && (
                                <div className="w-full bg-emerald-500" style={{ height: `${Math.max(10, salesH)}%` }} />
                              )}
                              {day.audit_events > 0 && (
                                <div className="w-full bg-blue-500" style={{ height: `${Math.max(15, auditH)}%` }} />
                              )}
                            </>
                          ) : (
                            <div className="w-full h-full bg-muted-foreground/20 rounded-lg" />
                          )}
                        </div>
                      </div>
                      <div className="text-[11px] font-bold text-foreground mt-1.5">{day.day_short}</div>
                      <div className="text-[10px] text-muted-foreground font-mono">{day.label}</div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Bottom 2-Column Telemetry Grid: User Role Breakdown + Multi-Branch Operational Telemetry */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
              {/* User Role Distribution */}
              <div className="p-4 rounded-2xl bg-card border border-border space-y-3">
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <div>
                    <h4 className="font-bold text-foreground uppercase tracking-wider text-xs flex items-center gap-1.5">
                      <FiUsers className="w-3.5 h-3.5 text-blue-500" />
                      <span>Account Role & Access Breakdown</span>
                    </h4>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Distribution across {metrics?.total_users || 0} registered system accounts.
                    </p>
                  </div>
                  <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-mono text-[10px] font-bold">
                    {userBreakdown.verified ?? 0} Verified
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {[
                    { label: 'Admins', count: userBreakdown.administrators ?? 0 },
                    { label: 'Store Admins', count: userBreakdown.store_admins ?? 0 },
                    { label: 'Employees', count: userBreakdown.employees ?? 0 },
                    { label: 'Customers', count: userBreakdown.customers ?? 0 },
                  ].map((roleItem) => (
                    <div key={roleItem.label} className="p-2.5 rounded-xl bg-muted/25 border border-border">
                      <span className="text-[10px] font-bold uppercase text-muted-foreground block">
                        {roleItem.label}
                      </span>
                      <div className="mt-0.5">
                        <span className="font-mono font-bold text-base text-foreground">{roleItem.count}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Multi-Branch Operational Telemetry */}
              <div className="p-4 rounded-2xl bg-card border border-border space-y-3">
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <div>
                    <h4 className="font-bold text-foreground uppercase tracking-wider text-xs flex items-center gap-1.5">
                      <FiBriefcase className="w-3.5 h-3.5 text-primary" />
                      <span>Multi-Branch Operational Telemetry</span>
                    </h4>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Live staff, customer, catalog, and transaction distribution by store branch.
                    </p>
                  </div>
                  <span className="font-mono text-[11px] font-bold text-muted-foreground">
                    {branchMetrics.length} Branches
                  </span>
                </div>

                <div className="divide-y divide-border rounded-xl border border-border overflow-hidden">
                  {branchMetrics.map((b) => (
                    <div key={b.id} className="px-3.5 py-2.5 bg-card flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-bold text-foreground flex items-center gap-2">
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: b.color || '#2b5ce6' }}
                          />
                          <span>{b.name}</span>
                        </div>
                        <div className="text-[10px] text-muted-foreground pl-4">{b.location}</div>
                      </div>
                      <div className="flex items-center gap-2 font-mono text-[11px]">
                        <span className="px-2 py-0.5 rounded-md bg-muted/60 border border-border text-foreground">
                          {b.employees_count} Staff
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-muted/60 border border-border text-foreground">
                          {b.customers_count} Cust
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-primary/10 border border-primary/20 text-primary font-bold">
                          {b.products_count} Prod
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-bold">
                          {b.sales_count} Sales
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>
    )
  }

  const renderUsers = () => (
    <div className="space-y-4">
      <Card noPad className="p-4 border border-border">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input 
              type="text" 
              placeholder="Search by name, username, or email..." 
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-card border border-border rounded-xl text-sm"
            />
          </div>
          <select value={userRoleFilter} onChange={(e) => setUserRoleFilter(e.target.value)} className="bg-card border border-border rounded-xl px-4 py-2 text-sm">
            <option value="All">All Roles</option>
            <option value="Administrator">Administrator</option>
            <option value="Store Administrator">Store Administrator</option>
            <option value="Employee">Employee</option>
            <option value="Customer">Customer</option>
          </select>
          <select value={userStatusFilter} onChange={(e) => setUserStatusFilter(e.target.value)} className="bg-card border border-border rounded-xl px-4 py-2 text-sm">
            <option value="All">All Status</option>
            <option value="Active">Active</option>
            <option value="Suspended">Suspended</option>
          </select>
        </div>
      </Card>
      <Card noPad className="border border-border">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-muted-foreground uppercase text-[11px] font-semibold text-left">
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Controls</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan="5" className="p-4 text-center"><div className="animate-pulse h-4 bg-muted w-32 mx-auto rounded" /></td></tr>
              ) : filteredUsers.length === 0 ? (
                <tr><td colSpan="5" className="p-8 text-center text-muted-foreground italic">No users found.</td></tr>
              ) : paginatedUsers.map(u => (
                <tr key={u.user_id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-mono text-muted-foreground">#{u.user_id}</td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-foreground">{u.username}</div>
                    <div className="text-xs text-muted-foreground">{u.email || 'No email provided'}</div>
                  </td>
                  <td className="px-4 py-3"><Badge>{u.role}</Badge></td>
                  <td className="px-4 py-3">
                    {u.is_active ? (
                      <span className="inline-flex items-center gap-1 text-blue-600 bg-blue-50 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800/60 px-2 py-0.5 rounded text-xs font-semibold"><FiCheckCircle /> Active</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-rose-600 bg-rose-50 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60 px-2 py-0.5 rounded text-xs font-semibold"><FiLock /> Suspended</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button 
                      onClick={() => handleToggleUserStatus(u)}
                      disabled={togglingUser === u.user_id}
                      className={`inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer border ${
                        u.is_active 
                          ? 'bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/60' 
                          : 'bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/60'
                      }`}
                    >
                      {togglingUser === u.user_id ? 'Wait...' : (u.is_active ? 'Suspend' : 'Activate')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredUsers.length > userPageSize && (
          <Pagination
            page={userPage}
            total={filteredUsers.length}
            pageSize={userPageSize}
            onChange={setUserPage}
          />
        )}
      </Card>
    </div>
  )

  const renderLogs = () => (
    <div className="space-y-4">
      <Card noPad className="p-4 border border-border">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input 
              type="text" 
              placeholder="Search actions, events, or IP..." 
              value={logSearch}
              onChange={(e) => setLogSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-card border border-border rounded-xl text-sm"
            />
          </div>
          <input 
            type="date" 
            value={logDateRange.start} 
            max={logDateRange.end || undefined}
            onChange={(e) => setLogDateRange({ ...logDateRange, start: e.target.value })} 
            className="bg-card border border-border rounded-xl px-4 py-2 text-sm"
          />
          <input 
            type="date" 
            value={logDateRange.end} 
            min={logDateRange.start || undefined}
            onChange={(e) => setLogDateRange({ ...logDateRange, end: e.target.value })} 
            className="bg-card border border-border rounded-xl px-4 py-2 text-sm"
          />
          <button
            type="button"
            onClick={handleClearLogs}
            disabled={clearingLogs || logs.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 text-rose-600 dark:text-rose-400 cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed shrink-0 shadow-xs"
            title={logs.length === 0 ? "No logs to clean" : "Clean all system audit logs"}
          >
            <FiTrash2 className="w-3.5 h-3.5" />
            <span>{clearingLogs ? 'Cleaning...' : 'Clean Logs'}</span>
          </button>
        </div>
      </Card>
      
      <Card noPad className="border border-border">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-muted-foreground uppercase text-[11px] font-semibold text-left">
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">IP Address</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan="4" className="p-4 text-center"><div className="animate-pulse h-4 bg-muted w-32 mx-auto rounded" /></td></tr>
              ) : filteredLogs.length === 0 ? (
                <tr><td colSpan="4" className="p-8 text-center text-muted-foreground italic">No logs found matching criteria.</td></tr>
              ) : paginatedLogs.map(l => (
                <tr key={l.log_id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground font-mono">{fmtDate(l.created_at || l.datetime, 'MMM DD, YYYY HH:mm:ss')}</td>
                  <td className="px-4 py-3 font-semibold text-foreground">{(typeof l.user === 'object' ? l.user?.username : l.user) || l.user_username || 'System'}</td>
                  <td className="px-4 py-3">
                    <div className="font-semibold">{l.action}</div>
                    <div className="text-xs text-muted-foreground truncate max-w-md">{l.description}</div>
                  </td>
                  <td className="px-4 py-3 font-mono text-muted-foreground text-xs">{l.ip_address || '127.0.0.1'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredLogs.length > logPageSize && (
          <Pagination
            page={logPage}
            total={filteredLogs.length}
            pageSize={logPageSize}
            onChange={setLogPage}
          />
        )}
      </Card>
    </div>
  )

  const renderCarousel = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-card p-5 rounded-2xl border border-border shadow-sm">
        <div>
          <h3 className="font-bold text-foreground">Carousel Management</h3>
          <p className="text-sm text-muted-foreground">Manage the active promotional images on the Customer Dashboard</p>
        </div>
        <Btn onClick={() => setCarouselModalOpen(true)} className="flex items-center gap-2">
          <FiPlus /> Add Images
        </Btn>
      </div>

      {carouselImages.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground bg-muted/20 rounded-xl border border-dashed border-border">
          <FiImage className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No images in the carousel yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {carouselImages.map(img => (
            <div key={img.id} className="relative group rounded-2xl overflow-hidden border border-border aspect-video bg-muted/30">
              <img 
                src={img.image_url} 
                alt="Carousel" 
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-3">
                <div className="flex items-center gap-3">
                  <label className="p-3 bg-blue-500 hover:bg-blue-600 text-white rounded-full transition-colors cursor-pointer" title="Replace Image">
                    <FiImage className="w-5 h-5" />
                    <input 
                      type="file" 
                      accept="image/*" 
                      className="hidden" 
                      onChange={async (e) => {
                        const file = e.target.files[0];
                        if (!file) return;
                        const formData = new FormData();
                        formData.append('image', file);
                        try {
                          setLoading(true);
                          await api.carouselImages.update(img.id, formData);
                          showToast('Image replaced successfully', 'success');
                          loadData('carousel');
                        } catch (err) {
                          showError('Replace Failed', err.message || 'Failed to replace image');
                        } finally {
                          setLoading(false);
                          e.target.value = '';
                        }
                      }}
                    />
                  </label>
                  <button 
                    onClick={async () => {
                      const confirmed = await confirmDelete(
                        'this carousel image',
                        'This image will be removed from the carousel.'
                      );
                      if (confirmed) {
                        try {
                          setLoading(true);
                          await api.carouselImages.delete(img.id);
                          showToast('Image deleted successfully', 'success');
                          loadData('carousel');
                        } catch (err) {
                          showError('Deletion Failed', err.message || 'Failed to delete image');
                        } finally {
                          setLoading(false);
                        }
                      }
                    }}
                    className="p-3 bg-red-500 hover:bg-red-600 text-white rounded-full transition-colors"
                    title="Delete Image"
                  >
                    <FiTrash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  const renderSettings = () => {
    const siteNameDirty = siteNameInput.trim() !== (settings.site_name || settings.company_name || '').trim()
    return (
      <div className="max-w-3xl space-y-6">
        <Card noPad className="border border-border overflow-hidden">
          <div className="p-4 border-b border-border bg-muted/30">
            <h3 className="font-bold text-foreground">Global Configuration</h3>
            <p className="text-xs text-muted-foreground">These settings affect the entire system and application state.</p>
          </div>
          <div className="p-6 space-y-6">
            <div className="flex items-center justify-between gap-4 border-b border-border pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-foreground">Maintenance Mode</span>
                  <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                    settings.maintenance_mode
                      ? 'bg-blue-500/15 text-blue-500 border-blue-500/30'
                      : 'bg-muted text-muted-foreground border-border'
                  }`}>
                    {settings.maintenance_mode ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Suspend access for all non-admin users. Administrators retain full access.
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={Boolean(settings.maintenance_mode)}
                aria-label="Toggle Maintenance Mode"
                onClick={() => handleToggleSetting('maintenance_mode')}
                disabled={savingSettings}
                className="text-3xl focus:outline-none transition-colors cursor-pointer disabled:opacity-50 shrink-0"
              >
                {settings.maintenance_mode ? <FiToggleRight className="text-blue-500" /> : <FiToggleLeft className="text-muted-foreground" />}
              </button>
            </div>

            <div className="flex items-center justify-between gap-4 border-b border-border pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-foreground">Debug Mode</span>
                  <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                    settings.debug_mode
                      ? 'bg-amber-500/15 text-amber-500 border-amber-500/30'
                      : 'bg-muted text-muted-foreground border-border'
                  }`}>
                    {settings.debug_mode ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Enable verbose API logging, response timing headers, and error stack traces.
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={Boolean(settings.debug_mode)}
                aria-label="Toggle Debug Mode"
                onClick={() => handleToggleSetting('debug_mode')}
                disabled={savingSettings}
                className="text-3xl focus:outline-none transition-colors cursor-pointer disabled:opacity-50 shrink-0"
              >
                {settings.debug_mode ? <FiToggleRight className="text-amber-500" /> : <FiToggleLeft className="text-muted-foreground" />}
              </button>
            </div>

            <form onSubmit={handleSaveSiteName} className="space-y-2">
              <label className="font-semibold text-sm text-foreground block">Site Name</label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={siteNameInput}
                  onChange={(e) => setSiteNameInput(e.target.value)}
                  maxLength={255}
                  placeholder="Enter application site name..."
                  className="flex-1 px-4 py-2 bg-background border border-border focus:border-primary rounded-xl text-sm text-foreground outline-none transition-colors"
                />
                <button
                  type="submit"
                  disabled={savingSiteName || !siteNameInput.trim() || !siteNameDirty}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold shadow-xs transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                >
                  <FiCheckCircle className="w-3.5 h-3.5" />
                  <span>{savingSiteName ? 'Saving...' : 'Save Site Name'}</span>
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Updates the global site and company display name across the dashboard, navigation bar, and browser tab title.
              </p>
            </form>
          </div>
        </Card>
      </div>
    )
  }

  const closeCarouselModal = () => {
    setCarouselModalOpen(false);
    setCarouselPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader 
        title="Admin Interface" 
        subtitle="Secure monitoring and management console. Adding data is strictly restricted."
      />

      <TabBar 
        tabs={[
          { id: 'metrics', label: 'System Status', icon: <FiBarChart2 /> },
          { id: 'users', label: 'User Management', icon: <FiUsers /> },
          { id: 'carousel', label: 'Carousel Images', icon: <FiImage /> },
          { id: 'logs', label: 'Audit Logs', icon: <FiActivity /> },
          { id: 'settings', label: 'Settings', icon: <FiSettings /> },
        ]}
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      {error && <ErrorAlert message={error} onRetry={() => loadData(activeTab)} />}

      <div className="min-h-[400px]">
        {activeTab === 'metrics' && renderMetrics()}
        {activeTab === 'users' && renderUsers()}
        {activeTab === 'carousel' && renderCarousel()}
        {activeTab === 'logs' && renderLogs()}
        {activeTab === 'settings' && renderSettings()}
      </div>

      {isCarouselModalOpen && (
        <Modal 
          onClose={closeCarouselModal} 
          title="Add Carousel Image"
          size="lg"
        >
          <form onSubmit={handleCarouselUpload} className="space-y-5">
            <div>
              <label className="block text-sm font-medium mb-3">Upload Promotion/Product Image(s)</label>
              <div className="relative flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-border rounded-xl bg-muted/20 hover:bg-muted/40 transition-colors overflow-hidden group">
                {carouselPreview ? (
                  <>
                    <img src={carouselPreview.url} alt="Preview" className="absolute inset-0 w-full h-full object-cover" />
                    {carouselPreview.count > 1 && (
                      <div className="absolute top-3 left-3 bg-blue-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg z-10">
                        +{carouselPreview.count - 1} more selected
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center gap-3 transition-opacity">
                      <span className="text-white font-medium bg-black/60 px-4 py-2 rounded-lg pointer-events-none">Change Images</span>
                      <button 
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          closeCarouselModal(); // Resets everything
                          setCarouselModalOpen(true); // Keep modal open
                        }}
                        className="text-white text-sm font-medium bg-red-500/80 hover:bg-red-600 px-4 py-2 rounded-lg z-10"
                      >
                        Clear Selection
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
                    <FiImage className="w-10 h-10 mb-3 opacity-50" />
                    <p className="text-sm font-semibold">Click to browse multiple</p>
                    <p className="text-xs mt-1">PNG, JPG, WEBP (Max 10MB each)</p>
                  </div>
                )}
                <input 
                  type="file" 
                  accept="image/*" 
                  multiple
                  ref={fileInputRef}
                  onChange={handleCarouselFileChange}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  required
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
              <Btn type="button" variant="secondary" onClick={closeCarouselModal}>
                Cancel
              </Btn>
              <Btn type="submit" disabled={uploadingCarousel || !carouselPreview}>
                {uploadingCarousel ? 'Uploading...' : `Upload ${carouselPreview?.count > 1 ? carouselPreview.count + ' Images' : 'Image'}`}
              </Btn>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
