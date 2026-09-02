import { useState, useEffect } from 'react'
import {
  FiActivity, FiCheckCircle, FiXCircle, FiAlertTriangle,
  FiUsers, FiShield, FiClock, FiRefreshCw, FiSearch,
  FiFilter, FiLayers, FiCalendar, FiMapPin, FiKey, FiX
} from 'react-icons/fi'
import { api } from '../../lib/api'
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
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [actionFilter, setActionFilter] = useState('All')

  const loadData = async () => {
    setLoading(true)
    try {
      const res = await api.admin.getQrMonitoring()
      if (res.success) {
        setStats(res.stats || {})
        setLogs(res.recent_logs || [])
      }
    } catch (err) {
      console.error('Failed to load QR monitoring stats:', err)
      showToast(err.message || 'Failed to load QR monitoring data', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isVisible) {
      loadData()
      const interval = setInterval(loadData, 15000)
      return () => clearInterval(interval)
    }
  }, [isVisible])

  if (!isVisible) return null

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
    <Modal
      title="QR ATTENDANCE MONITORING"
      onClose={onClose}
      size="2xl"
      footer={
        <div className="flex justify-between items-center w-full">
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
      <div className="space-y-6 pb-2">
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
          <Btn variant="outline" size="sm" onClick={loadData} icon={<FiRefreshCw className={loading ? 'animate-spin' : ''} />}>
            Live Sync
          </Btn>
        </div>

        {/* QR Request & Badges Real Database Statistic Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                <FiClock className="text-primary" /> Real-time QR Activity Log
              </h3>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search name, code, branch..."
                  className="px-3 py-1.5 rounded-xl border border-border bg-card text-foreground text-xs w-48 focus:outline-none focus:ring-1 focus:ring-primary"
                />

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="bg-card border border-border text-foreground rounded-xl px-2.5 py-1.5 text-xs font-semibold outline-none"
                >
                  <option value="All">All Statuses</option>
                  <option value="SUCCESS">SUCCESS</option>
                  <option value="FAILED">FAILED</option>
                  <option value="PENDING_PIN">PENDING PIN</option>
                </select>

                <select
                  value={actionFilter}
                  onChange={(e) => setActionFilter(e.target.value)}
                  className="bg-card border border-border text-foreground rounded-xl px-2.5 py-1.5 text-xs font-semibold outline-none"
                >
                  <option value="All">All Event Types</option>
                  <option value="ATTENDANCE_CREATED">ATTENDANCE CREATED</option>
                  <option value="QR_SCAN_SUCCESS">QR SCAN SUCCESS</option>
                  <option value="PIN_VERIFICATION_FAILED">PIN FAILED</option>
                  <option value="UNAUTHORIZED_BRANCH_SCAN">CROSS BRANCH</option>
                  <option value="REVOKED_QR_SCAN">REVOKED QR</option>
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
                        <span className="text-foreground font-medium">{log.branch}</span>
                        <span className="text-[10px] text-muted-foreground block">{log.department}</span>
                      </td>
                      <td className="py-2.5 px-3.5">
                        <span className="font-mono text-[11px] font-bold text-primary">
                          {log.action_type}
                        </span>
                      </td>
                      <td className="py-2.5 px-3.5">
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium">
                          {log.verification_method === 'QR + PIN' ? (
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
