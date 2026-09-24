import { useState, useEffect } from 'react'
import {
  FiActivity, FiCheckCircle, FiXCircle, FiAlertTriangle,
  FiUsers, FiShield, FiClock, FiRefreshCw, FiSearch,
  FiFilter, FiLayers, FiCalendar, FiMapPin, FiKey
} from 'react-icons/fi'
import { api } from '../lib/api'
import { useRealtimeSync } from '../lib/realtimeSync'
import {
  Card, StatCard, Badge, StatusBadge, SearchBar,
  Table, TR, TD, TableSkeleton, EmptyState, Btn, showToast
} from '../components/ui'
import { useAuth } from '../context/AuthContext'

export default function QrMonitoringPage() {
  const { user } = useAuth()
  const isAdmin = user && user.role === 'Administrator'

  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    total_employees: 0,
    qr_generated: 0,
    qr_not_generated: 0,
    active_qr: 0,
    revoked_qr: 0,
    today_scans: 0,
    successful_scans: 0,
    failed_scans: 0,
  })
  const [logs, setLogs] = useState([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [actionFilter, setActionFilter] = useState('All')

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const res = await api.admin.getQrMonitoring()
      if (res.success) {
        setStats(res.stats || {})
        setLogs(res.recent_logs || [])
      }
    } catch (err) {
      console.error('Failed to load QR monitoring stats:', err)
      if (!silent) showToast(err.message || 'Failed to load QR monitoring data', 'error')
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  useRealtimeSync(() => {
    loadData(true)
  }, [])

  if (!isAdmin) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-500 text-4xl mb-4">
          <FiShield />
        </div>
        <h1 className="text-2xl font-bold text-slate-100 mb-2">403 FORBIDDEN</h1>
        <p className="text-slate-400 max-w-md text-sm">
          Access to the QR Monitoring Center is restricted to Administrators only.
        </p>
      </div>
    )
  }

  const filteredLogs = logs.filter(item => {
    const s = search.toLowerCase()
    const matchesSearch = !search ||
      item.employee_name?.toLowerCase().includes(s) ||
      item.employee_code?.toLowerCase().includes(s) ||
      item.branch?.toLowerCase().includes(s) ||
      item.action_type?.toLowerCase().includes(s)

    const matchesStatus = statusFilter === 'All' || item.status === statusFilter
    const matchesAction = actionFilter === 'All' || item.action_type === actionFilter

    return matchesSearch && matchesStatus && matchesAction
  })

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2 text-primary-400 text-xs font-semibold uppercase tracking-wider mb-1">
            <FiShield /> System Administration
          </div>
          <h1 className="text-2xl font-bold text-slate-100">QR Attendance Monitoring</h1>
          <p className="text-xs text-slate-400">
            Real-time organizational QR security metrics, branch scan activity, and audit logs.
          </p>
        </div>

        <Btn variant="outline" size="sm" onClick={loadData} icon={<FiRefreshCw className={loading ? 'animate-spin' : ''} />}>
          Live Sync
        </Btn>
      </div>

      {/* 8 Real Database Statistic Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          title="Total Employees"
          value={stats.total_employees}
          icon={<FiUsers className="text-primary-400" />}
          sub="Registered in system"
        />
        <StatCard
          title="QR Generated"
          value={stats.qr_generated}
          icon={<FiShield className="text-emerald-400" />}
          sub={`${stats.active_qr} active`}
        />
        <StatCard
          title="QR Not Generated"
          value={stats.qr_not_generated}
          icon={<FiAlertTriangle className="text-amber-400" />}
          sub="Awaiting admin issue"
        />
        <StatCard
          title="Revoked QR"
          value={stats.revoked_qr}
          icon={<FiXCircle className="text-rose-400" />}
          sub="Blocked access"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Today's QR Scans"
          value={stats.today_scans}
          icon={<FiActivity className="text-blue-400" />}
          sub="Terminal scan attempts"
        />
        <StatCard
          title="Successful Scans"
          value={stats.successful_scans}
          icon={<FiCheckCircle className="text-emerald-400" />}
          sub="Verified & recorded"
        />
        <StatCard
          title="Failed Scans"
          value={stats.failed_scans}
          icon={<FiAlertTriangle className="text-rose-400" />}
          sub="Security rejects / PIN errors"
        />
      </div>

      {/* Filter Bar & Live Activity Table */}
      <Card className="p-6 border-slate-800 bg-slate-900/60 shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <FiClock className="text-primary-400" /> Real-time QR Activity Log
          </h2>

          <div className="flex flex-wrap items-center gap-3">
            <SearchBar
              value={search}
              onChange={setSearch}
              placeholder="Search employee, branch, or action..."
              className="w-full sm:w-64 text-xs"
            />

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 text-slate-300 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-primary-500 outline-none"
            >
              <option value="All">All Statuses</option>
              <option value="SUCCESS">SUCCESS</option>
              <option value="FAILED">FAILED</option>
              <option value="PENDING_PIN">PENDING PIN</option>
            </select>

            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 text-slate-300 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-primary-500 outline-none"
            >
              <option value="All">All Event Types</option>
              <option value="ATTENDANCE_CREATED">ATTENDANCE CREATED</option>
              <option value="QR_SCAN_SUCCESS">QR SCAN SUCCESS</option>
              <option value="PIN_VERIFICATION_FAILED">PIN FAILED</option>
              <option value="UNAUTHORIZED_BRANCH_SCAN">CROSS BRANCH SCAN</option>
              <option value="REVOKED_QR_SCAN">REVOKED QR</option>
            </select>
          </div>
        </div>

        {loading && logs.length === 0 ? (
          <TableSkeleton rows={6} />
        ) : filteredLogs.length === 0 ? (
          <EmptyState
            title="No QR activity records found"
            description="All employee attendance scan attempts and terminal interactions will appear here in real time."
            icon={<FiShield />}
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <thead>
                <tr className="border-b border-slate-800 text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                  <th className="py-3 px-4 text-left">Employee</th>
                  <th className="py-3 px-4 text-left">Branch</th>
                  <th className="py-3 px-4 text-left">Action / Event</th>
                  <th className="py-3 px-4 text-left">Verification</th>
                  <th className="py-3 px-4 text-left">Scanned By</th>
                  <th className="py-3 px-4 text-left">Status</th>
                  <th className="py-3 px-4 text-left">Details / Reason</th>
                  <th className="py-3 px-4 text-left">Scan Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map(log => (
                  <TR key={log.id} className="hover:bg-slate-800/40 text-xs">
                    <TD className="py-3 px-4">
                      <div className="font-semibold text-slate-200">{log.employee_name}</div>
                      <div className="text-[11px] font-mono text-slate-400">{log.employee_code}</div>
                    </TD>
                    <TD className="py-3 px-4">
                      <span className="text-slate-300 font-medium">{log.branch}</span>
                      <span className="text-[10px] text-slate-400 block">{log.department}</span>
                    </TD>
                    <TD className="py-3 px-4">
                      <span className="font-mono text-[11px] font-bold text-primary-400">
                        {log.action_type}
                      </span>
                    </TD>
                    <TD className="py-3 px-4">
                      <span className="inline-flex items-center gap-1 text-[11px] text-slate-300 font-medium">
                        {log.verification_method === 'QR + PIN' ? (
                          <span className="text-emerald-400 font-bold">✓ QR + PIN</span>
                        ) : log.verification_method === 'QR Only' ? (
                          <span className="text-amber-400">QR Step</span>
                        ) : (
                          <span className="text-rose-400">Failed</span>
                        )}
                      </span>
                    </TD>
                    <TD className="py-3 px-4">
                      <span className="text-slate-300 font-medium text-[11px]">{log.scanned_by || 'Store Admin'}</span>
                    </TD>
                    <TD className="py-3 px-4">
                      <Badge
                        variant={
                          log.status === 'SUCCESS'
                            ? 'success'
                            : log.status === 'FAILED'
                            ? 'danger'
                            : 'warning'
                        }
                      >
                        {log.status}
                      </Badge>
                    </TD>
                    <TD className="py-3 px-4 max-w-xs">
                      {log.failure_reason ? (
                        <span className="text-rose-400 text-[11px]">{log.failure_reason}</span>
                      ) : (
                        <span className="text-slate-400 text-[11px] font-mono">{log.ip_address || 'Terminal Verified'}</span>
                      )}
                    </TD>
                    <TD className="py-3 px-4 whitespace-nowrap font-mono text-[11px] text-slate-300">
                      {log.scan_time}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  )
}
