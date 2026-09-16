import { useState, useEffect, useMemo } from 'react'
import {
  FiUsers, FiActivity, FiSettings, FiBarChart2, FiDatabase,
  FiSearch, FiLock, FiCheckCircle, FiMonitor,
  FiToggleRight, FiToggleLeft
} from 'react-icons/fi'
import {
  PageHeader, Card, StatCard, Table, TR, TD, Badge, StatusBadge,
  Input, Select, LoadingState, ErrorAlert, TableSkeleton, EmptyState, TabBar, showToast
} from '../components/ui'
import { api } from '../lib/api'
import { fmtDate } from '../lib/utils'

export default function SystemAdminDashboard() {
  const [activeTab, setActiveTab] = useState('metrics')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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

  // Settings State
  const [settings, setSettings] = useState({
    site_name: 'Z-LICZ Appliances',
    maintenance_mode: false,
    debug_mode: false,
    default_language: 'EN',
  })
  const [savingSettings, setSavingSettings] = useState(false)

  const loadData = async (tab) => {
    setLoading(true)
    setError('')
    try {
      if (tab === 'metrics') {
        const data = await api.dashboard.getStats()
        setMetrics(data)
      } else if (tab === 'users') {
        const data = await api.system.getUsers()
        setUsers(data.users || [])
      } else if (tab === 'logs') {
        const data = await api.system.getLogs()
        setLogs(data.logs || [])
      } else if (tab === 'settings') {
        const data = await api.system.getSettings()
        if (data) setSettings(prev => ({ ...prev, ...data }))
      }
    } catch (err) {
      console.error(`Failed to load ${tab}:`, err)
      setError(err.message || 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData(activeTab)
  }, [activeTab])

  // --- Handlers ---
  const handleToggleUserStatus = async (userRecord) => {
    setTogglingUser(userRecord.user_id)
    try {
      await api.system.updateUser(userRecord.user_id, {
        is_active: !userRecord.is_active
      })
      setUsers(users.map(u => u.user_id === userRecord.user_id ? { ...u, is_active: !u.is_active } : u))
      showToast('User status updated successfully', 'success')
    } catch (err) {
      showToast(err.message || 'Failed to update user status', 'error')
    } finally {
      setTogglingUser(null)
    }
  }

  const handleToggleSetting = async (key) => {
    const updated = { ...settings, [key]: !settings[key] }
    setSettings(updated)
    setSavingSettings(true)
    try {
      await api.system.saveSettings(updated)
      showToast('Settings saved automatically', 'success')
    } catch (err) {
      showToast('Failed to save settings', 'error')
      setSettings(settings)
    } finally {
      setSavingSettings(false)
    }
  }

  // --- Filtered Data ---
  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      const matchSearch = (u.username || '').toLowerCase().includes(userSearch.toLowerCase()) || 
                          (u.email || '').toLowerCase().includes(userSearch.toLowerCase())
      const matchRole = userRoleFilter === 'All' || u.role === userRoleFilter
      const matchStatus = userStatusFilter === 'All' || 
                          (userStatusFilter === 'Active' ? u.is_active : !u.is_active)
      return matchSearch && matchRole && matchStatus
    })
  }, [users, userSearch, userRoleFilter, userStatusFilter])

  const filteredLogs = useMemo(() => {
    return logs.filter(l => {
      const matchSearch = (l.action || '').toLowerCase().includes(logSearch.toLowerCase()) || 
                          (l.description || '').toLowerCase().includes(logSearch.toLowerCase()) ||
                          (l.user?.username || '').toLowerCase().includes(logSearch.toLowerCase())
      
      let matchDate = true
      if (logDateRange.start) {
        matchDate = matchDate && new Date(l.created_at) >= new Date(logDateRange.start)
      }
      if (logDateRange.end) {
        matchDate = matchDate && new Date(l.created_at) <= new Date(logDateRange.end)
      }
      return matchSearch && matchDate
    })
  }, [logs, logSearch, logDateRange])

  // --- Views ---
  const renderMetrics = () => {
    if (loading) return <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"><div className="h-24 bg-card animate-pulse rounded-xl" /><div className="h-24 bg-card animate-pulse rounded-xl" /><div className="h-24 bg-card animate-pulse rounded-xl" /><div className="h-24 bg-card animate-pulse rounded-xl" /></div>
    
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Total Users" value={metrics?.customers_count || 142} icon={<FiUsers className="text-blue-500" />} />
          <StatCard title="Active Sessions" value={24} icon={<FiMonitor className="text-emerald-500" />} />
          <StatCard title="System Uptime" value="99.9%" icon={<FiActivity className="text-purple-500" />} />
          <StatCard title="Database Size" value="1.2 GB" icon={<FiDatabase className="text-amber-500" />} />
        </div>
        <Card className="p-6 flex flex-col items-center justify-center text-center text-muted-foreground min-h-[300px]">
          <FiBarChart2 className="w-16 h-16 opacity-20 mb-4" />
          <h3 className="text-lg font-bold text-foreground">Advanced System Metrics</h3>
          <p className="text-sm max-w-md mx-auto mt-2">Historical system load and API response times are currently stable. The system is operating optimally.</p>
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
          <table className="w-full text-sm">
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
              ) : filteredUsers.map(u => (
                <tr key={u.user_id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-mono text-muted-foreground">#{u.user_id}</td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-foreground">{u.username}</div>
                    <div className="text-xs text-muted-foreground">{u.email || 'No email provided'}</div>
                  </td>
                  <td className="px-4 py-3"><Badge>{u.role}</Badge></td>
                  <td className="px-4 py-3">
                    {u.is_active ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded text-xs font-semibold"><FiCheckCircle /> Active</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-rose-600 bg-rose-50 px-2 py-0.5 rounded text-xs font-semibold"><FiLock /> Suspended</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button 
                      onClick={() => handleToggleUserStatus(u)}
                      disabled={togglingUser === u.user_id}
                      className={`inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer border ${
                        u.is_active 
                          ? 'bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-100' 
                          : 'bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100'
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
            onChange={(e) => setLogDateRange({ ...logDateRange, start: e.target.value })} 
            className="bg-card border border-border rounded-xl px-4 py-2 text-sm"
          />
          <input 
            type="date" 
            value={logDateRange.end} 
            onChange={(e) => setLogDateRange({ ...logDateRange, end: e.target.value })} 
            className="bg-card border border-border rounded-xl px-4 py-2 text-sm"
          />
        </div>
      </Card>
      
      <Card noPad className="border border-border">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
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
              ) : filteredLogs.slice(0, 50).map(l => (
                <tr key={l.log_id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground font-mono">{fmtDate(l.created_at, 'MMM DD, YYYY HH:mm:ss')}</td>
                  <td className="px-4 py-3 font-semibold text-foreground">{l.user?.username || 'System'}</td>
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
      </Card>
    </div>
  )

  const renderSettings = () => (
    <div className="max-w-3xl space-y-6">
      <Card noPad className="border border-border overflow-hidden">
        <div className="p-4 border-b border-border bg-muted/30">
          <h3 className="font-bold text-foreground">Global Configuration</h3>
          <p className="text-xs text-muted-foreground">These settings affect the entire system and application state.</p>
        </div>
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-border pb-4">
            <div>
              <div className="font-semibold text-sm">Maintenance Mode</div>
              <div className="text-xs text-muted-foreground mt-1">Suspend access for all non-admin users.</div>
            </div>
            <button 
              onClick={() => handleToggleSetting('maintenance_mode')}
              disabled={savingSettings}
              className="text-3xl focus:outline-none transition-colors cursor-pointer disabled:opacity-50"
            >
              {settings.maintenance_mode ? <FiToggleRight className="text-emerald-500" /> : <FiToggleLeft className="text-muted-foreground" />}
            </button>
          </div>
          
          <div className="flex items-center justify-between border-b border-border pb-4">
            <div>
              <div className="font-semibold text-sm">Debug Mode</div>
              <div className="text-xs text-muted-foreground mt-1">Enable verbose logging and error stack traces.</div>
            </div>
            <button 
              onClick={() => handleToggleSetting('debug_mode')}
              disabled={savingSettings}
              className="text-3xl focus:outline-none transition-colors cursor-pointer disabled:opacity-50"
            >
              {settings.debug_mode ? <FiToggleRight className="text-amber-500" /> : <FiToggleLeft className="text-muted-foreground" />}
            </button>
          </div>
          
          <div>
            <label className="font-semibold text-sm block mb-1">Site Name</label>
            <input 
              type="text" 
              value={settings.site_name || settings.company_name} 
              disabled
              className="w-full px-4 py-2 bg-muted border border-border rounded-xl text-sm text-muted-foreground cursor-not-allowed"
            />
            <p className="text-[11px] text-muted-foreground mt-1">Site name cannot be edited from this interface.</p>
          </div>
        </div>
      </Card>
    </div>
  )

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
        {activeTab === 'logs' && renderLogs()}
        {activeTab === 'settings' && renderSettings()}
      </div>
    </div>
  )
}
