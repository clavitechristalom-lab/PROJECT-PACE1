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
  Table, TR, TD, TableSkeleton, EmptyState, Btn, showToast, Pagination
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
  const [branches, setBranches] = useState([])
  const [search, setSearch] = useState('')
  const [branchFilter, setBranchFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [actionFilter, setActionFilter] = useState('All')

  const resolveBranchName = (item, branchList = branches) => {
    const raw = item?.branch
    if (raw && typeof raw === 'object' && raw.name) return raw.name
    if (raw && !/^\d+$/.test(String(raw).trim())) return String(raw)
    const idLookup = item?.branch_id ?? (raw && /^\d+$/.test(String(raw).trim()) ? Number(raw) : null)
    if (idLookup !== null && idLookup !== undefined) {
      const matched = branchList.find(b => String(b.id) === String(idLookup))
      if (matched?.name) return matched.name
    }
    return raw ? String(raw) : 'Unassigned'
  }

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const [res, branchRes] = await Promise.all([
        api.system.getQrMonitoring(),
        branches.length === 0 ? api.branches.getAll().catch(() => null) : Promise.resolve(null),
      ])
      if (res.success) {
        setStats(res.stats || {})
        setLogs(res.recent_logs || [])
        const nextBranches = Array.isArray(res.branches) && res.branches.length > 0
          ? res.branches
          : (Array.isArray(branchRes?.branches) ? branchRes.branches : [])
        if (nextBranches.length > 0) setBranches(nextBranches)
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
  }, [], { module: 'qr_monitoring' })

  if (!isAdmin) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-500 text-4xl mb-4">
          <FiShield />
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-2">403 FORBIDDEN</h1>
        <p className="text-muted-foreground max-w-md text-sm">
          Access to the QR Monitoring Center is restricted to Administrators only.
        </p>
      </div>
    )
  }

  const branchOptions = Array.from(new Set([
    ...branches.map(b => b.name).filter(Boolean),
    ...logs.map(l => resolveBranchName(l)).filter(b => b && b !== 'Unassigned' && !/^\d+$/.test(b)),
  ])).sort()

  const filteredLogs = logs.filter(item => {
    const branchLabel = resolveBranchName(item)
    const s = search.toLowerCase()
    const matchesSearch = !search ||
      item.employee_name?.toLowerCase().includes(s) ||
      item.employee_code?.toLowerCase().includes(s) ||
      branchLabel.toLowerCase().includes(s) ||
      item.action_type?.toLowerCase().includes(s) ||
      item.verification_method?.toLowerCase().includes(s)

    const matchesBranch = branchFilter === 'All' || branchLabel === branchFilter
    const matchesStatus =
      statusFilter === 'All' ||
      item.status === statusFilter ||
      (statusFilter === 'PENDING' && item.status === 'PENDING_PIN')
    const matchesAction =
      actionFilter === 'All' ||
      item.action_type === actionFilter ||
      (actionFilter === 'PIN_VERIFICATION_FAILED' &&
        (item.action_type === 'PIN_VERIFICATION' || item.action_type === 'PENDING_VERIFICATION') &&
        item.status === 'FAILED' &&
        String(item.failure_reason || '').toLowerCase().includes('pin')) ||
      (actionFilter === 'FACE_RECOGNITION' &&
        (item.face_verified === true ||
          String(item.verification_method || '').toLowerCase().includes('face recognition'))) ||
      (actionFilter === 'FACE_VERIFICATION_FAILED' &&
        item.status === 'FAILED' &&
        String(item.failure_reason || '').toLowerCase().includes('face'))

    return matchesSearch && matchesBranch && matchesStatus && matchesAction
  })

  const [page, setPage] = useState(1)
  const pageSize = 15

  const paginatedLogs = filteredLogs.slice((page - 1) * pageSize, page * pageSize)

  useEffect(() => {
    setPage(1)
  }, [search, branchFilter, statusFilter, actionFilter])

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2 text-primary text-xs font-semibold uppercase tracking-wider mb-1">
            <FiShield /> System Administration
          </div>
          <h1 className="text-2xl font-bold text-foreground">QR Attendance Monitoring</h1>
          <p className="text-xs text-muted-foreground">
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
      <Card className="p-6 space-y-4">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <h2 className="text-base font-bold text-foreground flex items-center gap-2 whitespace-nowrap shrink-0">
            <FiClock className="text-primary shrink-0" />
            <span>Real-time QR Activity Log</span>
          </h2>

          <div className="flex flex-wrap lg:flex-nowrap items-center gap-2.5 min-w-0">
            <SearchBar
              value={search}
              onChange={setSearch}
              placeholder="Search employee, branch, or action..."
              className="w-full sm:w-52 text-xs"
            />

            <select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className="bg-card border border-border text-foreground rounded-xl px-3 py-2 text-xs font-semibold focus:ring-1 focus:ring-primary outline-none cursor-pointer max-w-[160px] shrink-0"
            >
              <option value="All">All Branches</option>
              {branchOptions.map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-card border border-border text-foreground rounded-xl px-3 py-2 text-xs font-semibold focus:ring-1 focus:ring-primary outline-none cursor-pointer shrink-0"
            >
              <option value="All">All Statuses</option>
              <option value="SUCCESS">SUCCESS</option>
              <option value="FAILED">FAILED</option>
              <option value="PENDING">PENDING</option>
            </select>

            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="bg-card border border-border text-foreground rounded-xl px-3 py-2 text-xs font-semibold focus:ring-1 focus:ring-primary outline-none cursor-pointer max-w-[180px] shrink-0"
            >
              <option value="All">All Event Types</option>
              <option value="ATTENDANCE_TIME_IN">ATTENDANCE TIME IN</option>
              <option value="ATTENDANCE_TIME_OUT">ATTENDANCE TIME OUT</option>
              <option value="FACE_RECOGNITION">FACE RECOGNITION</option>
              <option value="FACE_VERIFICATION_FAILED">FACE FAILED</option>
              <option value="PENDING_VERIFICATION">PENDING VERIFICATION</option>
              <option value="UNAUTHORIZED_BRANCH_SCAN">CROSS BRANCH</option>
              <option value="REVOKED_QR_SCAN">REVOKED QR</option>
              <option value="INVALID_QR">INVALID QR</option>
              <option value="REJECTED">REJECTED ACCOUNT</option>
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
                <tr className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
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
                {paginatedLogs.map(log => (
                  <TR key={log.id} className="hover:bg-muted/40 text-xs">
                    <TD className="py-3 px-4">
                      <div className="font-semibold text-foreground">{log.employee_name}</div>
                      <div className="text-[11px] font-mono text-muted-foreground">{log.employee_code}</div>
                    </TD>
                    <TD className="py-3 px-4">
                      <span className="text-foreground font-medium">{resolveBranchName(log)}</span>
                      <span className="text-[10px] text-muted-foreground block">{log.department}</span>
                    </TD>
                    <TD className="py-3 px-4">
                      <span className="font-mono text-[11px] font-bold text-primary">
                        {log.action_type}
                      </span>
                    </TD>
                    <TD className="py-3 px-4">
                      <span className="inline-flex items-center gap-1 text-[11px] text-foreground font-medium">
                        {log.face_verified || String(log.verification_method || '').includes('Face Recognition') ? (
                          <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓ QR + Face Recognition</span>
                        ) : log.verification_method === 'Face Failed' ? (
                          <span className="text-rose-600 dark:text-rose-400 font-bold">✗ Face Failed</span>
                        ) : log.verification_method === 'QR + PIN' ? (
                          <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓ QR + PIN</span>
                        ) : log.verification_method === 'QR Only' ? (
                          <span className="text-amber-600 dark:text-amber-400">QR Step</span>
                        ) : (
                          <span className="text-rose-600 dark:text-rose-400">Failed</span>
                        )}
                      </span>
                    </TD>
                    <TD className="py-3 px-4">
                      <span className="text-foreground font-medium text-[11px]">{log.scanned_by || 'Store Administrator'}</span>
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
                        <span className="text-rose-600 dark:text-rose-400 text-[11px]">{log.failure_reason}</span>
                      ) : (
                        <span className="text-muted-foreground text-[11px] font-mono">{log.ip_address || 'Terminal Verified'}</span>
                      )}
                    </TD>
                    <TD className="py-3 px-4 whitespace-nowrap font-mono text-[11px] text-muted-foreground">
                      {log.scan_time}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </div>
        )}
        {filteredLogs.length > pageSize && (
          <div className="pt-2">
            <Pagination
              page={page}
              total={filteredLogs.length}
              pageSize={pageSize}
              onChange={setPage}
            />
          </div>
        )}
      </Card>
    </div>
  )
}
