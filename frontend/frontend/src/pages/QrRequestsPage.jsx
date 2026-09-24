import { useState, useEffect } from 'react'
import {
  FiCheckCircle, FiXCircle, FiAlertTriangle, FiShield,
  FiClock, FiRefreshCw, FiSearch, FiFilter, FiUser,
  FiCheck, FiX, FiInfo, FiLayers, FiFileText, FiCamera,
  FiMapPin, FiMail, FiPhone, FiLock, FiAlertCircle
} from 'react-icons/fi'
import { api } from '../lib/api'
import { useRealtimeSync, triggerDataSync } from '../lib/realtimeSync'
import {
  Card, StatCard, Badge, StatusBadge, SearchBar,
  Table, TR, TD, TableSkeleton, EmptyState, Btn, Modal, showToast, PageHeader, Pagination, showLoading, closeLoading
} from '../components/ui'
import { useAuth } from '../context/AuthContext'

export default function QrRequestsPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'Administrator'

  const [loading, setLoading] = useState(true)
  const [requests, setRequests] = useState([])
  const [summary, setSummary] = useState({
    total: 0,
    pending: 0,
    under_review: 0,
    approved: 0,
    rejected: 0,
  })

  // Filters
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [roleFilter, setRoleFilter] = useState('All')
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState({ current_page: 1, last_page: 1, total: 0, per_page: 15 })

  // Review Modal State
  const [selectedRequest, setSelectedRequest] = useState(null)
  const [reviewModalOpen, setReviewModalOpen] = useState(false)
  const [reviewLoading, setReviewLoading] = useState(false)

  // 7-Point Verification Checklist State
  const [checklist, setChecklist] = useState({
    identity_verified: false,
    employee_info_verified: false,
    position_verified: false,
    department_verified: false,
    branch_verified: false,
    account_active: false,
    attendance_authorized: false,
  })

  // Rejection Modal State
  const [rejectModalOpen, setRejectModalOpen] = useState(false)
  const [rejectionReason, setRejectionReason] = useState('')
  const [rejecting, setRejecting] = useState(false)

  // Approval Confirmation Modal State
  const [approveModalOpen, setApproveModalOpen] = useState(false)
  const [approving, setApproving] = useState(false)

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const params = { page }
      if (search) params.search = search
      if (statusFilter !== 'All') params.status = statusFilter
      if (roleFilter !== 'All') params.role = roleFilter

      const res = await api.qrRequests.getAll(params)

      if (res.success) {
        setRequests(res.requests || [])
        setSummary(res.summary || {})
        if (res.pagination) {
          setPagination(res.pagination)
        }
      }
    } catch (err) {
      console.error('Failed to load QR requests:', err)
      if (!silent) showToast(err.message || 'Failed to load QR requests', 'error')
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [page, statusFilter, roleFilter])

  useRealtimeSync(() => {
    loadData(true)
  }, [page, statusFilter, roleFilter, search])

  const handleSearchSubmit = (e) => {
    e?.preventDefault()
    setPage(1)
    loadData()
  }

  const openReviewModal = async (reqItem) => {
    setSelectedRequest(reqItem)
    setReviewModalOpen(true)
    setChecklist({
      identity_verified: reqItem.status === 'APPROVED',
      employee_info_verified: reqItem.status === 'APPROVED',
      position_verified: reqItem.status === 'APPROVED',
      department_verified: reqItem.status === 'APPROVED',
      branch_verified: reqItem.status === 'APPROVED',
      account_active: reqItem.status === 'APPROVED',
      attendance_authorized: reqItem.status === 'APPROVED',
    })

    // Automatically mark under review if pending
    if (reqItem.status === 'PENDING') {
      try {
        await api.qrRequests.review(reqItem.request_id)
        loadData(true)
      } catch (e) {
        console.error('Auto review failed:', e)
      }
    }
  }

  const handleChecklistToggle = (key) => {
    setChecklist(prev => ({
      ...prev,
      [key]: !prev[key],
    }))
  }

  const handleCheckAll = () => {
    const allChecked = Object.values(checklist).every(Boolean)
    setChecklist({
      identity_verified: !allChecked,
      employee_info_verified: !allChecked,
      position_verified: !allChecked,
      department_verified: !allChecked,
      branch_verified: !allChecked,
      account_active: !allChecked,
      attendance_authorized: !allChecked,
    })
  }

  const allChecklistVerified = Object.values(checklist).every(Boolean)

  const handleOpenApproveModal = () => {
    if (!allChecklistVerified) {
      showToast('Please complete and verify all 7 checklist items before approving.', 'error')
      return
    }
    setApproveModalOpen(true)
  }

  const handleConfirmApprove = async () => {
    if (!selectedRequest) return
    setApproving(true)
    showLoading('Approving QR request...')
    try {
      const res = await api.qrRequests.approve(selectedRequest.request_id, checklist)
      if (res.success) {
        showToast(`QR Request ${selectedRequest.request_code} approved! Permanent QR is now ACTIVE.`, 'success')
        setApproveModalOpen(false)
        setReviewModalOpen(false)
        loadData(true)
        triggerDataSync('qr_requests')
        triggerDataSync('employees')
        triggerDataSync('attendance')
      } else {
        showToast(res.message || 'Approval failed', 'error')
      }
    } catch (err) {
      showToast(err.message || 'Failed to approve QR request', 'error')
    } finally {
      setApproving(false)
      closeLoading()
    }
  }

  const handleOpenRejectModal = () => {
    setRejectionReason('')
    setRejectModalOpen(true)
  }

  const handleConfirmReject = async () => {
    if (!selectedRequest) return
    if (!rejectionReason.trim()) {
      showToast('Please enter a rejection reason.', 'error')
      return
    }

    setRejecting(true)
    showLoading('Rejecting QR request...')
    try {
      const res = await api.qrRequests.reject(selectedRequest.request_id, rejectionReason.trim())
      if (res.success) {
        showToast(`QR Request ${selectedRequest.request_code} rejected.`, 'info')
        setRejectModalOpen(false)
        setReviewModalOpen(false)
        loadData(true)
        triggerDataSync('qr_requests')
        triggerDataSync('employees')
      } else {
        showToast(res.message || 'Rejection failed', 'error')
      }
    } catch (err) {
      showToast(err.message || 'Failed to reject QR request', 'error')
    } finally {
      setRejecting(false)
      closeLoading()
    }
  }

  if (!isAdmin) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-500 text-4xl mb-4">
          <FiShield />
        </div>
        <h1 className="text-2xl font-bold text-slate-100 mb-2">403 FORBIDDEN</h1>
        <p className="text-slate-400 max-w-md text-sm">
          Access to QR Request Management is restricted to System Administrators only.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="QR Attendance Request Management"
        subtitle="Review account information, perform 7-point security verification, and issue permanent attendance QR badges."
      />

      {/* 5 Real Database Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <StatCard
          title="Total Requests"
          value={summary.total?.toString() || '0'}
          sub="All submissions"
          icon={<FiFileText className="w-5 h-5 text-primary" />}
          color="blue"
        />
        <StatCard
          title="Pending Verification"
          value={summary.pending?.toString() || '0'}
          sub="Awaiting admin review"
          icon={<FiClock className="w-5 h-5 text-amber-500" />}
          color="yellow"
        />
        <StatCard
          title="Under Review"
          value={summary.under_review?.toString() || '0'}
          sub="Verification in progress"
          icon={<FiShield className="w-5 h-5 text-indigo-500" />}
          color="indigo"
        />
        <StatCard
          title="Approved & Issued"
          value={summary.approved?.toString() || '0'}
          sub="Active QR generated"
          icon={<FiCheckCircle className="w-5 h-5 text-emerald-500" />}
          color="green"
        />
        <StatCard
          title="Rejected Requests"
          value={summary.rejected?.toString() || '0'}
          sub="Verification failed"
          icon={<FiXCircle className="w-5 h-5 text-rose-500" />}
          color="red"
        />
      </div>

      {/* Filter & Search Bar */}
      <Card noPad className="p-3.5 border border-border">
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
          <form onSubmit={handleSearchSubmit} className="flex-1 w-full relative">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search request code, name, employee ID, branch..."
              className="w-full pl-9 pr-8 py-2 rounded-xl border border-border bg-card text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
            />
            {search && (
              <button
                type="button"
                onClick={() => { setSearch(''); setPage(1); loadData(); }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <FiX className="w-3.5 h-3.5" />
              </button>
            )}
          </form>

          <div className="flex gap-2 w-full sm:w-auto flex-wrap">
            <select
              value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
              className="border border-border rounded-xl px-3 py-2 text-xs font-semibold text-foreground bg-card cursor-pointer outline-none"
            >
              <option value="All">All Statuses</option>
              <option value="PENDING">PENDING</option>
              <option value="UNDER_REVIEW">UNDER REVIEW</option>
              <option value="APPROVED">APPROVED</option>
              <option value="REJECTED">REJECTED</option>
            </select>

            <select
              value={roleFilter}
              onChange={e => { setRoleFilter(e.target.value); setPage(1); }}
              className="border border-border rounded-xl px-3 py-2 text-xs font-semibold text-foreground bg-card cursor-pointer outline-none"
            >
              <option value="All">All Roles</option>
              <option value="Employee">Employees</option>
              <option value="Store Admin">Store Administrators</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Requests Table */}
      <Card noPad className="border border-border overflow-hidden">
        {loading ? (
          <TableSkeleton rows={6} cols={10} />
        ) : requests.length === 0 ? (
          <EmptyState
            icon={<FiFileText className="w-12 h-12 text-muted-foreground/30 mx-auto" />}
            title="No QR requests found"
            description={search || statusFilter !== 'All' ? 'Try adjusting your filters or search keywords.' : 'Submitted QR requests from Employees and Store Administrators will appear here.'}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/50 text-muted-foreground uppercase font-semibold text-[11px]">
                    <th className="py-3 px-4 text-left">Request ID</th>
                    <th className="py-3 px-4 text-left">Employee ID</th>
                    <th className="py-3 px-4 text-left">Name</th>
                    <th className="py-3 px-4 text-left">Role</th>
                    <th className="py-3 px-4 text-left">Position</th>
                    <th className="py-3 px-4 text-left">Department</th>
                    <th className="py-3 px-4 text-left">Branch</th>
                    <th className="py-3 px-4 text-left">Request Date</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {requests.map((r, i) => (
                    <tr key={r.request_id || i} className={`hover:bg-muted/40 transition-colors ${i % 2 === 1 ? 'bg-muted/10' : ''}`}>
                      <td className="py-3 px-4 font-mono font-bold text-primary">{r.request_code}</td>
                      <td className="py-3 px-4 font-mono text-foreground font-semibold">{r.employee_id}</td>
                      <td className="py-3 px-4 font-semibold text-foreground">{r.name}</td>
                      <td className="py-3 px-4">
                        <Badge
                          variant={r.role === 'Store Administrator' || r.role === 'Store Admin' ? 'info' : 'neutral'}
                          text={r.role}
                        />
                      </td>
                      <td className="py-3 px-4 text-foreground">{r.position}</td>
                      <td className="py-3 px-4 text-muted-foreground">{r.department}</td>
                      <td className="py-3 px-4 font-medium text-foreground">{r.branch}</td>
                      <td className="py-3 px-4 text-muted-foreground font-mono whitespace-nowrap">
                        {r.request_date} {r.request_time}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <Badge
                          variant={
                            r.status === 'APPROVED'
                              ? 'success'
                              : r.status === 'REJECTED'
                              ? 'danger'
                              : r.status === 'UNDER_REVIEW'
                              ? 'info'
                              : 'warning'
                          }
                        >
                          {r.status === 'UNDER_REVIEW' ? 'UNDER REVIEW' : r.status}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <Btn
                          variant={r.status === 'APPROVED' ? 'outline' : 'primary'}
                          size="xs"
                          onClick={() => openReviewModal(r)}
                        >
                          {r.status === 'APPROVED' ? 'View Details' : 'Review'}
                        </Btn>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pagination.total > pagination.per_page && (
              <Pagination
                total={pagination.total}
                page={page}
                pageSize={pagination.per_page}
                onChange={setPage}
              />
            )}
          </>
        )}
      </Card>

      {/* ─── MODAL 1: VERIFY QR REQUEST (REVIEW MODAL) ─── */}
      {reviewModalOpen && selectedRequest && (
        <Modal
          title="VERIFY QR REQUEST"
          onClose={() => setReviewModalOpen(false)}
          size="lg"
          footer={
            <div className="flex justify-between items-center w-full gap-3">
              <Btn
                variant="danger"
                size="sm"
                onClick={handleOpenRejectModal}
                disabled={selectedRequest.status === 'APPROVED'}
                icon={<FiXCircle />}
              >
                Reject Request
              </Btn>

              <div className="flex gap-2">
                <Btn variant="outline" size="sm" onClick={() => setReviewModalOpen(false)}>
                  Close
                </Btn>
                {selectedRequest.status !== 'APPROVED' && (
                  <Btn
                    variant="primary"
                    size="sm"
                    onClick={handleOpenApproveModal}
                    disabled={!allChecklistVerified}
                    icon={<FiCheckCircle />}
                  >
                    Approve & Generate QR
                  </Btn>
                )}
              </div>
            </div>
          }
        >
          <div className="space-y-5">
            {/* Request Badge Header */}
            <div className="flex items-center justify-between p-3.5 rounded-2xl bg-muted/30 border border-border">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm">
                  <FiUser />
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-primary block">
                    QR Request Code: {selectedRequest.request_code}
                  </span>
                  <h3 className="text-sm font-bold text-foreground">{selectedRequest.name}</h3>
                </div>
              </div>
              <Badge
                variant={
                  selectedRequest.status === 'APPROVED'
                    ? 'success'
                    : selectedRequest.status === 'REJECTED'
                    ? 'danger'
                    : selectedRequest.status === 'UNDER_REVIEW'
                    ? 'info'
                    : 'warning'
                }
              >
                {selectedRequest.status}
              </Badge>
            </div>

            {/* Account Information Card */}
            <div className="p-4 rounded-2xl bg-card border border-border space-y-3">
              <span className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground flex items-center gap-1.5">
                <FiInfo className="text-primary" /> Account Information
              </span>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase font-bold block">Name</span>
                  <span className="font-semibold text-foreground">{selectedRequest.name}</span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase font-bold block">User ID</span>
                  <span className="font-mono font-bold text-primary">{selectedRequest.employee_id}</span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase font-bold block">Role</span>
                  <span className="font-semibold text-foreground">{selectedRequest.role}</span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase font-bold block">Position</span>
                  <span className="font-medium text-foreground">{selectedRequest.position}</span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase font-bold block">Department</span>
                  <span className="font-medium text-foreground">{selectedRequest.department}</span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase font-bold block">Branch</span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">{selectedRequest.branch}</span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase font-bold block">Phone</span>
                  <span className="font-mono text-foreground">{selectedRequest.phone || '09XXXXXXXXX'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase font-bold block">Email</span>
                  <span className="font-medium text-foreground">{selectedRequest.email}</span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase font-bold block">Account Status</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">{selectedRequest.account_status || 'ACTIVE'}</span>
                </div>
              </div>

              {selectedRequest.address && (
                <div className="text-xs pt-1 border-t border-border">
                  <span className="text-[10px] text-muted-foreground uppercase font-bold block">Address</span>
                  <span className="text-foreground">{selectedRequest.address}</span>
                </div>
              )}
            </div>

            {/* Rejection notice if previously rejected */}
            {selectedRequest.status === 'REJECTED' && selectedRequest.rejection_reason && (
              <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs space-y-1">
                <span className="font-bold uppercase tracking-wider text-[10px] block">Previous Rejection Reason:</span>
                <p>{selectedRequest.rejection_reason}</p>
              </div>
            )}

            {/* 7-Point Verification Checklist */}
            <div className="p-4 rounded-2xl bg-muted/20 border border-border space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                    <FiShield className="text-primary" /> Administrator Security Verification Checklist
                  </h4>
                  <p className="text-[11px] text-muted-foreground">
                    You must verify all 7 criteria before approving and generating a permanent QR badge.
                  </p>
                </div>
                {selectedRequest.status !== 'APPROVED' && (
                  <button
                    type="button"
                    onClick={handleCheckAll}
                    className="text-[11px] font-bold text-primary hover:underline cursor-pointer"
                  >
                    {allChecklistVerified ? 'Uncheck All' : 'Verify All'}
                  </button>
                )}
              </div>

              <div className="space-y-2 pt-1">
                {[
                  { key: 'identity_verified', label: 'Identity information verified' },
                  { key: 'employee_info_verified', label: 'Employee/Staff information verified' },
                  { key: 'position_verified', label: 'Position verified' },
                  { key: 'department_verified', label: 'Department verified' },
                  { key: 'branch_verified', label: 'Branch verified' },
                  { key: 'account_active', label: 'Account is active' },
                  { key: 'attendance_authorized', label: 'User is authorized for attendance' },
                ].map(item => (
                  <label
                    key={item.key}
                    className={`flex items-center gap-2.5 p-2.5 rounded-xl border transition-all cursor-pointer ${
                      checklist[item.key]
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-foreground font-semibold'
                        : 'bg-card border-border text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checklist[item.key]}
                      onChange={() => handleChecklistToggle(item.key)}
                      disabled={selectedRequest.status === 'APPROVED'}
                      className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                    />
                    <span className="text-xs">{item.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* ─── MODAL 2: APPROVE QR REQUEST (CONFIRMATION MODAL) ─── */}
      {approveModalOpen && selectedRequest && (
        <Modal
          title="APPROVE QR REQUEST"
          onClose={() => setApproveModalOpen(false)}
          size="md"
          footer={
            <div className="flex justify-end gap-2 w-full">
              <Btn variant="outline" size="sm" onClick={() => setApproveModalOpen(false)} disabled={approving}>
                Cancel
              </Btn>
              <Btn
                variant="primary"
                size="sm"
                onClick={handleConfirmApprove}
                disabled={approving}
                icon={<FiCheckCircle />}
              >
                {approving ? 'Generating QR...' : 'Approve & Generate QR'}
              </Btn>
            </div>
          }
        >
          <div className="space-y-4 text-center py-2">
            <div className="w-14 h-14 rounded-full bg-emerald-500/20 text-emerald-500 border-2 border-emerald-500/40 flex items-center justify-center mx-auto text-2xl shadow-lg">
              <FiCheckCircle />
            </div>

            <div className="space-y-1">
              <h3 className="text-base font-bold text-foreground">Confirm QR Issuance</h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                After approval, a permanent cryptographic QR code will be generated and assigned to this account.
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-muted/30 border border-border text-xs space-y-1.5 text-left">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Employee:</span>
                <span className="font-bold text-foreground">{selectedRequest.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Role:</span>
                <span className="font-semibold text-foreground">{selectedRequest.role}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Branch:</span>
                <span className="font-semibold text-foreground">{selectedRequest.branch}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Request ID:</span>
                <span className="font-mono font-bold text-primary">{selectedRequest.request_code}</span>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* ─── MODAL 3: REJECT QR REQUEST (WITH REASON) ─── */}
      {rejectModalOpen && selectedRequest && (
        <Modal
          title="REJECT QR REQUEST"
          onClose={() => setRejectModalOpen(false)}
          size="md"
          footer={
            <div className="flex justify-end gap-2 w-full">
              <Btn variant="outline" size="sm" onClick={() => setRejectModalOpen(false)} disabled={rejecting}>
                Cancel
              </Btn>
              <Btn
                variant="danger"
                size="sm"
                onClick={handleConfirmReject}
                disabled={rejecting || !rejectionReason.trim()}
                icon={<FiXCircle />}
              >
                {rejecting ? 'Rejecting...' : 'Confirm Rejection'}
              </Btn>
            </div>
          }
        >
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-500 text-xs font-medium">
              <FiAlertCircle className="text-base shrink-0" />
              <span>Please state the specific reason why this QR request is being rejected.</span>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground block">
                Rejection Reason <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={3}
                value={rejectionReason}
                onChange={e => setRejectionReason(e.target.value)}
                placeholder="e.g. Employee information does not match company records."
                className="w-full p-3 rounded-xl border border-border bg-card text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-rose-500/30 outline-none"
              />
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
