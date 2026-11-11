import { useState, useEffect, useCallback, useRef } from 'react'
import {
  FiActivity, FiCheckCircle, FiXCircle, FiAlertTriangle,
  FiUsers, FiShield, FiClock, FiRefreshCw, FiSearch,
  FiFilter, FiLayers, FiCalendar, FiMapPin, FiKey, FiX
} from 'react-icons/fi'
import { api } from '../../lib/api'
import { useRealtimeSync, fastDeepEqual } from '../../lib/realtimeSync'
import {
  Card, StatCard, Badge, StatusBadge, SearchBar,
  Table, TR, TD, TableSkeleton, EmptyState, Btn, Modal, showToast
} from '../ui'

export default function QrMonitoringModal({ open, isOpen, onClose }) {
  const isVisible = open || isOpen

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
  const inFlightRef = useRef(false)

  const resolveBranchName = useCallback((item, branchList = branches) => {
    const raw = item?.branch
    if (raw && typeof raw === 'object' && raw.name) return raw.name
    if (raw && !/^\d+$/.test(String(raw).trim())) return String(raw)
    const idLookup = item?.branch_id ?? (raw && /^\d+$/.test(String(raw).trim()) ? Number(raw) : null)
    if (idLookup !== null && idLookup !== undefined) {
      const matched = branchList.find(b => String(b.id) === String(idLookup))
      if (matched?.name) return matched.name
    }
    return raw ? String(raw) : 'Unassigned'
  }, [branches])

  const loadData = useCallback(async (silent = false, signal) => {
    const isSilent = silent === true
    if (inFlightRef.current && isSilent) return
    inFlightRef.current = true
    if (!isSilent) setLoading(true)
    try {
      const [res, branchRes] = await Promise.all([
        api.system.getQrMonitoring({ signal }),
        branches.length === 0 ? api.branches.getAll({ signal }).catch(() => null) : Promise.resolve(null),
      ])
      if (signal?.aborted) return
      if (res.success) {
        const nextStats = res.stats || {}
        const nextLogs = res.recent_logs || []
        const nextBranches = Array.isArray(res.branches) && res.branches.length > 0
          ? res.branches
          : (Array.isArray(branchRes?.branches) ? branchRes.branches : [])
        setStats(prev => (fastDeepEqual(prev, nextStats) ? prev : nextStats))
        setLogs(prev => (fastDeepEqual(prev, nextLogs) ? prev : nextLogs))
        if (nextBranches.length > 0) {
          setBranches(prev => (fastDeepEqual(prev, nextBranches) ? prev : nextBranches))
        }
      }
    } catch (err) {
      if (err?.name === 'AbortError') return
      console.error('Failed to load QR monitoring stats:', err)
      if (!isSilent) showToast(err.message || 'Failed to load QR monitoring data', 'error')
    } finally {
      inFlightRef.current = false
      if (!isSilent) setLoading(false)
    }
  }, [branches.length])

  useEffect(() => {
    if (isVisible) {
      loadData(false)
    }
  }, [isVisible, loadData])

  useRealtimeSync((_source, signal) => {
    if (isVisible) {
      loadData(true, signal)
    }
  }, [isVisible, loadData], { module: 'employees', enabled: isVisible })

  if (!isVisible) return null

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
          String(item.verification_method || '').toLowerCase().includes('face recognized') ||
          String(item.verification_method || '').toLowerCase().includes('face recognition'))) ||
      (actionFilter === 'FACE_VERIFICATION_FAILED' &&
        item.status === 'FAILED' &&
        String(item.failure_reason || '').toLowerCase().includes('face'))

    return matchesSearch && matchesBranch && matchesStatus && matchesAction
  })

  return (
    <Modal
      title="QR ATTENDANCE MONITORING"
      onClose={onClose}
      size="xl"
      footer={
        <div className="flex justify-between items-center w-full gap-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Live MySQL Database Sync Active</span>
          </div>
          <Btn variant="outline" size="sm" onClick={onClose} icon={<FiX className="w-3.5 h-3.5" />}>
            Close Monitoring
          </Btn>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Header summary & Live Sync Button */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 rounded-2xl bg-muted/20 border border-border">
          <div>
            <div className="flex items-center gap-2 text-primary text-xs font-semibold uppercase tracking-wider mb-0.5">
              <FiShield /> System Administration • Live Activity
            </div>
            <p className="text-xs text-muted-foreground">
              Real-time organization-wide QR security metrics, branch scan attempts, and audit trail.
            </p>
          </div>
          <Btn variant="outline" size="sm" onClick={() => loadData(false)} icon={<FiRefreshCw className={loading ? 'animate-spin' : ''} />}>
            Live Sync
          </Btn>
        </div>

        {/* QR Request & Badges Real Database Statistic Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
          <StatCard
            title="Total Employees"
            value={stats.total_employees?.toString() || '0'}
            icon={<FiUsers className="text-primary" />}
            sub="Registered staff"
            color="blue"
          />
          <StatCard
            title="Active QR Badges"
            value={stats.active_qr?.toString() || stats.qr_generated?.toString() || '0'}
            icon={<FiShield className="text-emerald-500" />}
            sub="Issued by admin"
            color="green"
          />
          <StatCard
            title="Pending Requests"
            value={stats.pending_requests?.toString() || '0'}
            icon={<FiClock className="text-amber-500" />}
            sub="Awaiting verification"
            color="yellow"
          />
          <StatCard
            title="Revoked / Rejected"
            value={((stats.revoked_qr || 0) + (stats.rejected_requests || 0)).toString()}
            icon={<FiXCircle className="text-rose-500" />}
            sub="Blocked or rejected"
            color="red"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          <StatCard
            title="Today's QR Scans"
            value={stats.today_scans?.toString() || '0'}
            icon={<FiActivity className="text-indigo-500" />}
            sub="Terminal punch attempts"
            color="indigo"
          />
          <StatCard
            title="Successful Scans"
            value={stats.successful_scans?.toString() || '0'}
            icon={<FiCheckCircle className="text-emerald-500" />}
            sub="Verified & recorded"
            color="green"
          />
          <StatCard
            title="Failed Scans"
            value={stats.failed_scans?.toString() || '0'}
            icon={<FiAlertTriangle className="text-rose-500" />}
            sub="Rejections / PIN errors"
            color="red"
          />
        </div>

        {/* Filter Bar & Activity Table */}
        <Card noPad className="border border-border overflow-hidden">
          <div className="p-4 border-b border-border space-y-3">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5 whitespace-nowrap shrink-0">
                <FiClock className="text-primary shrink-0" />
                <span>Real-time QR Activity Log</span>
              </h3>

              <div className="flex flex-wrap lg:flex-nowrap items-center gap-2 min-w-0">
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search name, code, branch..."
                  className="px-2.5 py-1.5 rounded-xl border border-border bg-card text-foreground text-xs w-full sm:w-40 focus:outline-none focus:ring-1 focus:ring-primary"
                />

                <select
                  value={branchFilter}
                  onChange={(e) => setBranchFilter(e.target.value)}
                  className="bg-card border border-border text-foreground rounded-xl px-2.5 py-1.5 text-xs font-semibold outline-none cursor-pointer max-w-[140px] shrink-0"
                >
                  <option value="All">All Branches</option>
                  {branchOptions.map(b => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="bg-card border border-border text-foreground rounded-xl px-2.5 py-1.5 text-xs font-semibold outline-none cursor-pointer shrink-0"
                >
                  <option value="All">All Statuses</option>
                  <option value="SUCCESS">SUCCESS</option>
                  <option value="FAILED">FAILED</option>
                </select>

                <select
                  value={actionFilter}
                  onChange={(e) => setActionFilter(e.target.value)}
                  className="bg-card border border-border text-foreground rounded-xl px-2.5 py-1.5 text-xs font-semibold outline-none cursor-pointer max-w-[165px] shrink-0"
                >
                  <option value="All">All Event Types</option>
                  <option value="ATTENDANCE_TIME_IN">ATTENDANCE TIME IN</option>
                  <option value="ATTENDANCE_TIME_OUT">ATTENDANCE TIME OUT</option>
                  <option value="FACE_RECOGNITION">FACE RECOGNITION</option>
                  <option value="FACE_VERIFICATION_FAILED">FACE FAILED</option>
                  <option value="PENDING_VERIFICATION">PENDING VERIFICATION</option>
                  <option value="PIN_VERIFICATION_FAILED">PIN FAILED</option>
                  <option value="UNAUTHORIZED_BRANCH_SCAN">CROSS BRANCH</option>
                  <option value="REVOKED_QR_SCAN">REVOKED QR</option>
                  <option value="INVALID_QR">INVALID QR</option>
                  <option value="REJECTED">REJECTED ACCOUNT</option>
                </select>
              </div>
            </div>
          </div>

          {loading && logs.length === 0 ? (
            <TableSkeleton rows={5} cols={7} />
          ) : filteredLogs.length === 0 ? (
            <EmptyState
              title="No QR activity records found"
              description="All employee attendance scan attempts and terminal interactions will appear here in real time."
              icon={<FiShield className="w-10 h-10 text-muted-foreground/40 mx-auto" />}
            />
          ) : (
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted/90 backdrop-blur-xs border-b border-border z-10">
                  <tr className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
                    <th className="py-2.5 px-3.5 text-left">Employee</th>
                    <th className="py-2.5 px-3.5 text-left">Branch</th>
                    <th className="py-2.5 px-3.5 text-left">Action / Event</th>
                    <th className="py-2.5 px-3.5 text-left">Verification</th>
                    <th className="py-2.5 px-3.5 text-left">Scanned By</th>
                    <th className="py-2.5 px-3.5 text-center">Status</th>
                    <th className="py-2.5 px-3.5 text-left">Details / Reason</th>
                    <th className="py-2.5 px-3.5 text-left">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredLogs.map(log => (
                    <tr key={log.id} className="hover:bg-muted/30 text-xs transition-colors">
                      <td className="py-2.5 px-3.5">
                        <div className="font-semibold text-foreground">{log.employee_name}</div>
                        <div className="text-[11px] font-mono text-muted-foreground">{log.employee_code}</div>
                      </td>
                      <td className="py-2.5 px-3.5">
                        <span className="text-foreground font-medium">{resolveBranchName(log)}</span>
                        <span className="text-[10px] text-muted-foreground block">{log.department}</span>
                      </td>
                      <td className="py-2.5 px-3.5">
                        <span className="font-mono text-[11px] font-bold text-primary">
                          {log.action_type}
                        </span>
                      </td>
                      <td className="py-2.5 px-3.5">
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium">
                          {log.face_verified || String(log.verification_method || '').includes('Face Recognition') ? (
                            <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓ QR + Face Recognition</span>
                          ) : log.verification_method === 'Face Failed' ? (
                            <span className="text-rose-500 font-bold">✗ Face Failed</span>
                          ) : log.verification_method === 'QR + PIN' ? (
                            <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓ QR + PIN</span>
                          ) : log.verification_method === 'QR Only' ? (
                            <span className="text-amber-500">QR Step</span>
                          ) : (
                            <span className="text-rose-500">Failed</span>
                          )}
                        </span>
                      </td>
                      <td className="py-2.5 px-3.5">
                        <span className="text-foreground font-medium text-[11px]">{log.scanned_by || 'Store Admin'}</span>
                      </td>
                      <td className="py-2.5 px-3.5 text-center">
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
                      </td>
                      <td className="py-2.5 px-3.5 max-w-xs">
                        {log.failure_reason ? (
                          <span className="text-rose-500 text-[11px] font-medium">{log.failure_reason}</span>
                        ) : (
                          <span className="text-muted-foreground text-[11px] font-mono">{log.ip_address || 'Terminal Verified'}</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3.5 whitespace-nowrap font-mono text-[11px] text-muted-foreground">
                        {log.scan_time}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </Modal>
  )
}
