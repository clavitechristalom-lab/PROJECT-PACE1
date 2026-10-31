import { useState, useEffect, useMemo } from 'react'
import {
  FiFileText, FiCheckCircle, FiXCircle, FiClock, FiSearch,
  FiCalendar, FiUser, FiEye, FiPrinter, FiRefreshCw, FiAlertCircle,
  FiPaperclip, FiMapPin, FiMessageSquare, FiDownload, FiArchive, FiRotateCcw,
  FiFilter, FiChevronDown
} from 'react-icons/fi'
import { useAuth } from '../context/AuthContext'
import {
  PageHeader, Card, Btn, StatusBadge, Modal, showToast, Spinner
} from '../components/ui'
import { api, STORAGE_BASE } from '../lib/api'
import { useRealtimeSync, triggerDataSync } from '../lib/realtimeSync'
import { fastDeepEqual } from '../lib/utils'

export const ADMIN_CATEGORIES = [
  'All',
  'Excuse Letter',
  'Sick Leave',
  'Important Matter',
  'Maternity Leave',
  'Vacation Leave',
]

export function printAdminLetter(letter) {
  if (!letter) return
  const printWindow = window.open('', '_blank')
  if (!printWindow) {
    showToast('Pop-up blocked. Please allow pop-ups to print letters.', 'error')
    return
  }

  const empName = letter.employee
    ? `${letter.employee.first_name || ''} ${letter.employee.last_name || ''}`.trim()
    : (letter.user?.name || 'Employee')
  const empCode = letter.employee?.employee_code || ''
  const position = letter.employee?.position || 'Staff'
  const department = letter.employee?.department || 'Operations'
  const branch = letter.employee?.branch?.name || (typeof letter.employee?.branch === 'string' ? letter.employee.branch : 'Main Branch')
  const fromDate = letter.start_date ? String(letter.start_date).slice(0, 10) : '—'
  const toDate = letter.end_date ? String(letter.end_date).slice(0, 10) : fromDate
  const totalDays = letter.total_days || 1

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Z-LICZ Formal Letter — ${letter.category || 'Excuse Letter'} — ${empName}</title>
        <style>
          body {
            font-family: 'Times New Roman', Times, serif;
            padding: 48px;
            color: #111827;
            line-height: 1.7;
            max-width: 800px;
            margin: 0 auto;
          }
          .header {
            border-bottom: 2px solid #111827;
            padding-bottom: 16px;
            margin-bottom: 28px;
            display: flex;
            align-items: center;
            justify-content: space-between;
          }
          .company { font-size: 20px; font-weight: bold; letter-spacing: 1px; }
          .sub { font-size: 13px; color: #4b5563; }
          .meta-box {
            background: #f9fafb;
            border: 1px solid #e5e7eb;
            border-radius: 6px;
            padding: 12px 16px;
            margin-bottom: 24px;
            font-size: 13px;
          }
          .content {
            white-space: pre-wrap;
            font-size: 14px;
            margin-bottom: 36px;
          }
          .status-stamp {
            display: inline-block;
            padding: 6px 14px;
            border: 2px solid;
            border-radius: 4px;
            font-weight: bold;
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-top: 12px;
          }
          .status-Approved { color: #059669; border-color: #059669; }
          .status-Pending { color: #d97706; border-color: #d97706; }
          .status-Rejected { color: #dc2626; border-color: #dc2626; }
          .footer {
            margin-top: 48px;
            display: flex;
            justify-content: space-between;
            font-size: 13px;
          }
          .sig-line {
            width: 200px;
            border-top: 1px solid #111827;
            margin-top: 40px;
            text-align: center;
            font-size: 12px;
            color: #4b5563;
          }
          @media print {
            body { padding: 0; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="company">Z-LICZ FURNITURE & APPLIANCES TRADING</div>
            <div class="sub">Human Resources & Personnel Management — ${branch}</div>
          </div>
          <div style="text-align: right; font-size: 12px; color: #4b5563;">
            Letter ID: #${letter.letter_id || letter.id || 'N/A'}<br/>
            Printed: ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </div>
        </div>

        <div class="meta-box">
          <strong>Employee:</strong> ${empName} (${empCode || 'No Code'}) &bull; 
          <strong>Position:</strong> ${position} &bull; 
          <strong>Department:</strong> ${department}<br/>
          <strong>Category:</strong> ${letter.category || 'Excuse Letter'} &bull; 
          <strong>Inclusive Dates:</strong> ${fromDate} to ${toDate} (${totalDays} day${totalDays > 1 ? 's' : ''})<br/>
          <strong>Reason:</strong> ${letter.reason || 'N/A'}
          <div>
            <span class="status-stamp status-${letter.status}">${letter.status}</span>
            ${letter.admin_remarks ? `<span style="margin-left: 12px; font-style: italic; color: #4b5563;">Remarks: "${letter.admin_remarks}"</span>` : ''}
          </div>
        </div>

        <div class="content">${letter.letter_body || letter.message || 'No letter body provided.'}</div>

        <div class="footer">
          <div>
            <div>Submitted By:</div>
            <div class="sig-line">${empName}</div>
          </div>
          <div>
            <div>Reviewed & Acknowledged By:</div>
            <div class="sig-line">Z-LICZ Management / HR</div>
          </div>
        </div>
        <script>
          window.onload = function() { window.print(); }
        </script>
      </body>
    </html>
  `)
  printWindow.document.close()
}

export default function AdminExcuseLettersPage() {
  const { user } = useAuth()
  const [letters, setLetters] = useState([])
  const [counts, setCounts] = useState({ categories: {}, statuses: {} })
  const [loading, setLoading] = useState(true)

  // Filters
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All') // 'All' | 'Pending' | 'Approved' | 'Rejected'
  const [searchTerm, setSearchTerm] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // Modals
  const [activeLetter, setActiveLetter] = useState(null)
  const [reviewModalOpen, setReviewModalOpen] = useState(false)
  const [reviewDecision, setReviewDecision] = useState('Approved')
  const [leaveType, setLeaveType] = useState('with_pay') // 'with_pay' | 'without_pay'
  const [adminRemarks, setAdminRemarks] = useState('')
  const [submittingReview, setSubmittingReview] = useState(false)

  const [previewAttachment, setPreviewAttachment] = useState(null)

  // Fetch letters
  const loadData = async () => {
    try {
      const params = {}
      if (selectedCategory !== 'All') params.category = selectedCategory
      if (statusFilter !== 'All') params.status = statusFilter
      if (searchTerm.trim()) params.search = searchTerm.trim()
      if (dateFrom) params.from_date = dateFrom
      if (dateTo) params.to_date = dateTo

      const res = await api.employeeLetters.getAll(params)
      const nextLetters = res?.letters || []
      const nextCounts = res?.counts || { categories: {}, statuses: {} }

      setLetters(prev => (fastDeepEqual(prev, nextLetters) ? prev : nextLetters))
      setCounts(prev => (fastDeepEqual(prev, nextCounts) ? prev : nextCounts))
    } catch (err) {
      console.warn('Could not load excuse letters:', err)
      showToast(err.message || 'Failed to load excuse letters', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [selectedCategory, statusFilter, dateFrom, dateTo])

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      loadData()
    }, 300)
    return () => clearTimeout(timer)
  }, [searchTerm])

  // Real-time synchronization
  useRealtimeSync(() => {
    loadData()
  }, [selectedCategory, statusFilter, searchTerm, dateFrom, dateTo])

  // Handle Review submission
  const handleReviewSubmit = async (e) => {
    if (e) e.preventDefault()
    if (!activeLetter) return

    setSubmittingReview(true)
    try {
      const payload = {
        status: reviewDecision,
        leave_type: reviewDecision === 'Approved' ? leaveType : undefined,
        admin_remarks: adminRemarks.trim() || undefined,
      }

      await api.employeeLetters.update(activeLetter.letter_id || activeLetter.id, payload)

      const leaveTypeFormatted = leaveType === 'with_pay' ? 'Leave with Pay (₱0.00 Deduction)' : 'Leave without Pay (Wage Deducted)'
      const successMsg = reviewDecision === 'Approved'
        ? `Letter approved as ${leaveTypeFormatted}! Payroll & attendance synchronized.`
        : `Letter marked as ${reviewDecision}.`

      showToast(successMsg, 'success')
      setReviewModalOpen(false)
      setActiveLetter(null)
      setAdminRemarks('')

      triggerDataSync('employee_letters')
      triggerDataSync('attendance')
      triggerDataSync('payroll')
      triggerDataSync('notifications')

      loadData()
    } catch (err) {
      showToast(err.message || 'Failed to update letter status', 'error')
    } finally {
      setSubmittingReview(false)
    }
  }

  // Open review modal with specific preset decision and leave type
  const openReviewModal = (letter, decision = 'Approved', presetLeaveType = null) => {
    setActiveLetter(letter)
    setReviewDecision(decision)
    const initialLt = presetLeaveType || (letter.leave_type === 'without_pay' ? 'without_pay' : 'with_pay')
    setLeaveType(initialLt)
    setAdminRemarks(letter.admin_remarks || '')
    setReviewModalOpen(true)
  }

  // Handle archive letter
  const handleArchive = async (letter) => {
    try {
      await api.employeeLetters.archive(letter.letter_id || letter.id)
      showToast(`Letter #${letter.letter_id || letter.id} moved to archive.`, 'success')
      triggerDataSync('employee_letters')
      loadData()
      if (activeLetter && (activeLetter.letter_id === letter.letter_id || activeLetter.id === letter.id)) {
        setActiveLetter(prev => ({ ...prev, is_archived: true, archived_at: new Date().toISOString() }))
      }
    } catch (err) {
      showToast(err.message || 'Failed to archive letter', 'error')
    }
  }

  // Handle restore letter from archive
  const handleUnarchive = async (letter) => {
    try {
      await api.employeeLetters.unarchive(letter.letter_id || letter.id)
      showToast(`Letter #${letter.letter_id || letter.id} restored from archive.`, 'success')
      triggerDataSync('employee_letters')
      loadData()
      if (activeLetter && (activeLetter.letter_id === letter.letter_id || activeLetter.id === letter.id)) {
        setActiveLetter(prev => ({ ...prev, is_archived: false, archived_at: null }))
      }
    } catch (err) {
      showToast(err.message || 'Failed to restore letter', 'error')
    }
  }

  // Render attachment link or preview button
  const renderAttachmentCell = (letter) => {
    if (!letter.attachment_path && !letter.attachment_url) {
      return <span className="text-muted-foreground/60 italic text-[11px]">No file</span>
    }

    const fullUrl = letter.attachment_url || `${STORAGE_BASE}/${letter.attachment_path}`
    const fileName = letter.attachment_name || 'Document'
    const isImage = /\.(jpg|jpeg|png|webp|gif)$/i.test(fileName) || /\.(jpg|jpeg|png|webp|gif)$/i.test(fullUrl)

    return (
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setPreviewAttachment({ url: fullUrl, name: fileName, isImage })}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 font-bold text-[11px] cursor-pointer transition-colors"
          title={`View attached ${fileName}`}
        >
          <FiPaperclip className="w-3 h-3" />
          <span className="truncate max-w-[110px]">{fileName}</span>
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Excuse Letter & Leave Management"
        subtitle="Review, approve, and manage employee excuse letters and leave requests across store branches"
      />

      {/* Automated Payroll System Callout */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-600/10 via-indigo-600/10 to-transparent border border-blue-500/20 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-xl bg-blue-600/20 flex items-center justify-center shrink-0 text-blue-600 dark:text-blue-400 mt-0.5">
            <FiCheckCircle className="w-4 h-4" />
          </div>
          <div>
            <div className="font-bold text-foreground">
              Automated Payroll & Attendance Integration Active
            </div>
            <div className="text-muted-foreground mt-0.5">
              Approving an excuse or leave letter automatically marks the exact inclusive work dates as <strong className="text-foreground">Absent</strong> in the attendance records and feeds into payroll calculations.
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="px-3 py-1 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 font-bold text-xs border border-amber-500/30">
            {counts.statuses?.pending || 0} Pending Review
          </span>
          <span className="px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold text-xs border border-emerald-500/30">
            {counts.statuses?.approved || 0} Approved
          </span>
          <button
            type="button"
            onClick={() => setStatusFilter(statusFilter === 'Archived' ? 'All' : 'Archived')}
            className={`px-3 py-1 rounded-full font-bold text-xs border flex items-center gap-1.5 transition-all cursor-pointer ${
              statusFilter === 'Archived'
                ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                : 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30 hover:bg-purple-500/25'
            }`}
            title="View letters archived automatically after 24 hours"
          >
            <FiArchive className="w-3.5 h-3.5" />
            <span>{counts.statuses?.archived || 0} Archived</span>
          </button>
        </div>
      </div>

      {/* Sub-Categories / Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-border">
        {ADMIN_CATEGORIES.map((cat) => {
          const active = selectedCategory === cat
          const count = cat === 'All' ? counts.statuses?.all || 0 : counts.categories?.[cat] || 0

          return (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-4 py-2.5 rounded-xl font-bold text-xs whitespace-nowrap transition-all cursor-pointer flex items-center gap-2 border ${
                active
                  ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                  : 'bg-card text-foreground border-border hover:bg-muted/60'
              }`}
            >
              <span>{cat}</span>
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
                  active
                    ? 'bg-white/20 text-white'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Filter and Search Bar */}
      <Card noPad className="p-4 border border-border">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 text-xs">
          {/* Search box */}
          <div className="lg:col-span-5 relative">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search employee name, ID code, reason, or letter..."
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-border bg-card text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {/* Status selector dropdown */}
          <div className="lg:col-span-3 relative">
            <FiFilter className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none transition-colors ${
              statusFilter === 'Archived' ? 'text-purple-600 dark:text-purple-400' : 'text-muted-foreground'
            }`} />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by letter status"
              className={`w-full pl-9 pr-8 py-2 rounded-xl border text-xs font-semibold focus:outline-none focus:ring-2 cursor-pointer appearance-none transition-colors ${
                statusFilter === 'Archived'
                  ? 'border-purple-500/50 bg-purple-500/10 text-purple-600 dark:text-purple-400 focus:ring-purple-500/30 font-bold'
                  : 'border-border bg-card text-foreground focus:ring-primary/30'
              }`}
            >
              <option value="All" className="bg-card text-foreground">All Statuses ({counts.statuses?.all || 0})</option>
              <option value="Pending" className="bg-card text-foreground">Pending Review ({counts.statuses?.pending || 0})</option>
              <option value="Approved" className="bg-card text-foreground">Approved ({counts.statuses?.approved || 0})</option>
              <option value="Rejected" className="bg-card text-foreground">Rejected ({counts.statuses?.rejected || 0})</option>
              <option value="Archived" className="bg-card text-foreground font-bold text-purple-600">Archived ({counts.statuses?.archived || 0})</option>
            </select>
            <FiChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none text-muted-foreground" />
          </div>

          {/* From Date */}
          <div className="lg:col-span-2">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
              title="Filter by Start Date"
            />
          </div>

          {/* To Date */}
          <div className="lg:col-span-2">
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
              title="Filter by End Date"
            />
          </div>
        </div>
      </Card>

      {/* Main Submissions Table */}
      <Card noPad className="border border-border overflow-hidden">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3">
            <Spinner className="w-8 h-8 text-primary" />
            <p className="text-xs text-muted-foreground">Loading employee excuse letters...</p>
          </div>
        ) : letters.length === 0 ? (
          <div className="py-20 text-center text-muted-foreground space-y-2">
            <FiFileText className="w-10 h-10 mx-auto text-muted-foreground/30" />
            <div className="font-bold text-sm text-foreground">
              {statusFilter === 'Archived' ? 'No Archived Letters' : 'No Submissions Found'}
            </div>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              {searchTerm || selectedCategory !== 'All' || statusFilter !== 'All'
                ? (statusFilter === 'Archived' ? 'Letters older than 24 hours or manually archived will appear here.' : 'Try adjusting your search criteria or category filter tab.')
                : 'No employee excuse or leave letters have been submitted yet.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-muted-foreground uppercase font-semibold text-[10px]">
                  <th className="py-3 px-4 text-left">Employee</th>
                  <th className="py-3 px-3 text-left">Category & Branch</th>
                  <th className="py-3 px-3 text-left">Date Range & Duration</th>
                  <th className="py-3 px-4 text-left">Reason / Context</th>
                  <th className="py-3 px-3 text-center">Attachment</th>
                  <th className="py-3 px-3 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {letters.map((letter) => {
                  const empName = letter.employee
                    ? `${letter.employee.first_name || ''} ${letter.employee.last_name || ''}`.trim()
                    : (letter.user?.name || `Employee #${letter.employee_id}`)
                  const empCode = letter.employee?.employee_code || ''
                  const branchName = letter.employee?.branch?.name || (typeof letter.employee?.branch === 'string' ? letter.employee.branch : 'Store Branch')
                  const startStr = letter.start_date ? String(letter.start_date).slice(0, 10) : '—'
                  const endStr = letter.end_date ? String(letter.end_date).slice(0, 10) : startStr
                  const days = letter.total_days || 1

                  return (
                    <tr key={letter.letter_id || letter.id} className="hover:bg-muted/30 transition-colors">
                      {/* Employee details */}
                      <td className="py-3.5 px-4 align-top">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary font-bold flex items-center justify-center shrink-0 text-xs">
                            {empName.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-bold text-foreground">{empName}</div>
                            <div className="text-[11px] font-mono text-muted-foreground">
                              {empCode || `ID #${letter.employee_id}`}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Category & Branch */}
                      <td className="py-3.5 px-3 align-top space-y-1">
                        <span className="inline-block px-2.5 py-0.5 rounded-md bg-primary/10 text-primary font-bold text-[11px]">
                          {letter.category || 'Excuse Letter'}
                        </span>
                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <FiMapPin className="w-3 h-3 text-muted-foreground/70 shrink-0" />
                          <span className="truncate max-w-[130px]">{branchName}</span>
                        </div>
                      </td>

                      {/* Date Range & Duration */}
                      <td className="py-3.5 px-3 align-top space-y-1">
                        <div className="font-mono font-bold text-foreground">
                          {startStr} {startStr !== endStr ? `→ ${endStr}` : ''}
                        </div>
                        <div className="inline-flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400 font-semibold">
                          <FiCalendar className="w-3 h-3" />
                          <span>{days} Day{days > 1 ? 's' : ''} ({days >= 6 ? `${Math.round((days / 6) * 10) / 10} wk` : 'Excused'})</span>
                        </div>
                      </td>

                      {/* Reason */}
                      <td className="py-3.5 px-4 align-top max-w-[260px]">
                        <p className="text-foreground line-clamp-2 leading-relaxed font-medium">
                          {letter.reason || 'No brief reason specified'}
                        </p>
                        {letter.admin_remarks && (
                          <div className="mt-1 text-[11px] text-muted-foreground italic flex items-center gap-1">
                            <span className="font-bold text-emerald-600 dark:text-emerald-400 not-italic">Remarks:</span>
                            <span className="truncate">{letter.admin_remarks}</span>
                          </div>
                        )}
                      </td>

                      {/* Attachment file */}
                      <td className="py-3.5 px-3 align-middle text-center">
                        {renderAttachmentCell(letter)}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-3 align-middle text-center">
                        <div className="flex flex-col items-center gap-1">
                          <StatusBadge status={letter.status} />
                          {letter.status === 'Approved' && (
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                                (letter.leave_type === 'with_pay' || letter.is_paid)
                                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                                  : 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30'
                              }`}
                            >
                              {(letter.leave_type === 'with_pay' || letter.is_paid) ? 'With Pay' : 'Without Pay'}
                            </span>
                          )}
                          {letter.is_archived && (
                            <span
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30"
                              title={`Archived: ${letter.archived_at ? new Date(letter.archived_at).toLocaleString() : 'Past 24 Hours'}`}
                            >
                              <FiArchive className="w-2.5 h-2.5" />
                              <span>Archived</span>
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 align-middle text-right space-x-1.5 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => {
                            setActiveLetter(letter)
                            setReviewDecision(letter.status === 'Approved' ? 'Approved' : 'Approved')
                            setLeaveType(letter.leave_type === 'without_pay' ? 'without_pay' : 'with_pay')
                            setAdminRemarks(letter.admin_remarks || '')
                            setReviewModalOpen(true)
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-card border border-border hover:bg-muted text-foreground font-bold text-xs inline-flex items-center gap-1 cursor-pointer transition-colors shadow-xs"
                          title="View Full Letter Details"
                        >
                          <FiEye className="w-3.5 h-3.5 text-muted-foreground" />
                          <span>Details</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => printAdminLetter(letter)}
                          className="p-1.5 rounded-lg bg-card border border-border hover:bg-muted text-foreground cursor-pointer transition-colors"
                          title="Print Letter / Export PDF"
                        >
                          <FiPrinter className="w-3.5 h-3.5 text-muted-foreground" />
                        </button>

                        {letter.is_archived ? (
                          <button
                            type="button"
                            onClick={() => handleUnarchive(letter)}
                            className="p-1.5 rounded-lg bg-card border border-border hover:bg-purple-500/15 text-purple-600 dark:text-purple-400 cursor-pointer transition-colors"
                            title="Restore Letter from Archive"
                          >
                            <FiRotateCcw className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleArchive(letter)}
                            className="p-1.5 rounded-lg bg-card border border-border hover:bg-purple-500/15 text-muted-foreground hover:text-purple-600 dark:hover:text-purple-400 cursor-pointer transition-colors"
                            title="Move Letter to Archive"
                          >
                            <FiArchive className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {letter.status === 'Pending' && (
                          <>
                            <button
                              type="button"
                              onClick={() => openReviewModal(letter, 'Approved', letter.leave_type || 'with_pay')}
                              className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs inline-flex items-center gap-1 cursor-pointer transition-colors shadow-xs active:scale-95"
                              title="Approve Letter & Select Leave Type (Leave with Pay vs Leave without Pay)"
                            >
                              <FiCheckCircle className="w-3.5 h-3.5" />
                              <span>Approve</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => openReviewModal(letter, 'Rejected')}
                              className="px-2.5 py-1.5 rounded-lg bg-rose-600/10 hover:bg-rose-600/20 text-rose-600 dark:text-rose-400 font-bold text-xs inline-flex items-center gap-1 cursor-pointer transition-colors active:scale-95"
                              title="Reject Letter"
                            >
                              <FiXCircle className="w-3.5 h-3.5" />
                              <span>Reject</span>
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Comprehensive Details & Review Modal */}
      {reviewModalOpen && activeLetter && (
        <Modal
          open={reviewModalOpen}
          onClose={() => setReviewModalOpen(false)}
          title={`Letter Details — #${activeLetter.letter_id || activeLetter.id} (${activeLetter.category || 'Excuse Letter'})`}
          size="lg"
        >
          <div className="space-y-5 text-xs">
            {/* Header info badge card */}
            <div className="p-4 rounded-xl bg-muted/40 border border-border space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary font-bold flex items-center justify-center text-sm">
                    {(activeLetter.employee?.first_name || activeLetter.user?.name || 'EM').slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-foreground">
                      {activeLetter.employee
                        ? `${activeLetter.employee.first_name || ''} ${activeLetter.employee.last_name || ''}`.trim()
                        : (activeLetter.user?.name || 'Employee')}
                    </h3>
                    <p className="text-muted-foreground text-[11px]">
                      {activeLetter.employee?.position || 'Staff'} &bull; {activeLetter.employee?.department || 'Operations'} &bull;{' '}
                      <span className="font-semibold text-foreground">
                        {activeLetter.employee?.branch?.name || (typeof activeLetter.employee?.branch === 'string' ? activeLetter.employee.branch : 'Store Branch')}
                      </span>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => printAdminLetter(activeLetter)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs cursor-pointer transition-all active:scale-95"
                  >
                    <FiPrinter className="w-3.5 h-3.5" />
                    <span>Print Official Letter</span>
                  </button>
                  {activeLetter.is_archived ? (
                    <button
                      type="button"
                      onClick={() => handleUnarchive(activeLetter)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-600/15 hover:bg-purple-600/25 text-purple-600 dark:text-purple-400 border border-purple-500/30 font-bold text-xs cursor-pointer transition-colors shadow-xs active:scale-95"
                      title="Restore this letter from archive"
                    >
                      <FiRotateCcw className="w-3.5 h-3.5" />
                      <span>Restore</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleArchive(activeLetter)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-card hover:bg-muted border border-border text-muted-foreground hover:text-foreground font-bold text-xs cursor-pointer transition-colors shadow-xs active:scale-95"
                      title="Move this letter to archive"
                    >
                      <FiArchive className="w-3.5 h-3.5" />
                      <span>Archive</span>
                    </button>
                  )}
                  <StatusBadge status={activeLetter.status} />
                  {activeLetter.status === 'Approved' && (
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                      (activeLetter.leave_type === 'with_pay' || activeLetter.is_paid)
                        ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                        : 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30'
                    }`}>
                      {(activeLetter.leave_type === 'with_pay' || activeLetter.is_paid) ? 'Leave with Pay' : 'Leave without Pay'}
                    </span>
                  )}
                  {activeLetter.is_archived && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30">
                      <FiArchive className="w-3 h-3" />
                      <span>Archived</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Dates and Reason row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-border/60 text-xs">
                <div>
                  <div className="text-[10px] uppercase font-bold text-muted-foreground">Category</div>
                  <div className="font-bold text-primary mt-0.5">{activeLetter.category || 'Excuse Letter'}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase font-bold text-muted-foreground">Inclusive Date Range</div>
                  <div className="font-mono font-bold text-foreground mt-0.5">
                    {activeLetter.start_date ? String(activeLetter.start_date).slice(0, 10) : '—'} to{' '}
                    {activeLetter.end_date ? String(activeLetter.end_date).slice(0, 10) : '—'}
                    <span className="ml-1 text-muted-foreground font-normal">({activeLetter.total_days || 1} day/s)</span>
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase font-bold text-muted-foreground">Submission Date</div>
                  <div className="font-mono text-muted-foreground mt-0.5">
                    {activeLetter.created_at ? new Date(activeLetter.created_at).toLocaleString() : 'N/A'}
                  </div>
                </div>
              </div>
            </div>

            {/* Complete Letter Body */}
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                Full Formal Letter Body
              </div>
              <div className="p-4 rounded-xl border border-border bg-card font-mono text-xs whitespace-pre-wrap leading-relaxed text-foreground max-h-[260px] overflow-y-auto">
                {activeLetter.letter_body || activeLetter.message || 'No letter body available.'}
              </div>
            </div>

            {/* Attached Supporting File */}
            {(activeLetter.attachment_path || activeLetter.attachment_url) && (
              <div className="p-3.5 rounded-xl bg-muted/30 border border-border space-y-2">
                <div className="text-[11px] font-bold uppercase text-muted-foreground flex items-center justify-between">
                  <span>Attached Proof / Document</span>
                  <a
                    href={activeLetter.attachment_url || `${STORAGE_BASE}/${activeLetter.attachment_path}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary font-bold hover:underline"
                  >
                    <FiDownload className="w-3.5 h-3.5" />
                    <span>Download / Open ↗</span>
                  </a>
                </div>
                {/\.(jpg|jpeg|png|webp|gif)$/i.test(activeLetter.attachment_path || '') ? (
                  <div className="rounded-lg overflow-hidden border border-border max-h-[200px] flex items-center justify-center bg-black/5">
                    <img
                      src={activeLetter.attachment_url || `${STORAGE_BASE}/${activeLetter.attachment_path}`}
                      alt="Attachment Preview"
                      className="max-h-[200px] object-contain cursor-pointer"
                      onClick={() => setPreviewAttachment({
                        url: activeLetter.attachment_url || `${STORAGE_BASE}/${activeLetter.attachment_path}`,
                        name: activeLetter.attachment_name || 'Document',
                        isImage: true,
                      })}
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-foreground font-medium">
                    <FiPaperclip className="w-4 h-4 text-primary" />
                    <span>{activeLetter.attachment_name || 'Attached Document File'}</span>
                  </div>
                )}
              </div>
            )}

            {/* Review Decision Form */}
            {(() => {
              const activeEmployeeSalary = Number(activeLetter?.employee?.basic_salary || activeLetter?.user?.employee?.basic_salary || 3000)
              const activeDailyRate = activeEmployeeSalary > 0 ? (activeEmployeeSalary / 6) : 500
              const activeTotalDays = Number(activeLetter?.total_days || 1)
              const activeTotalDeduction = activeTotalDays * activeDailyRate

              return (
                <form onSubmit={handleReviewSubmit} className="pt-3 border-t border-border space-y-4">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    Management Decision & Leave Classification
                  </div>

                  {/* Action Choice: Approve vs Reject */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setReviewDecision('Approved')}
                      className={`flex-1 py-2.5 px-3 rounded-xl font-bold text-xs border flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                        reviewDecision === 'Approved'
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                          : 'bg-card text-foreground border-border hover:bg-muted'
                      }`}
                    >
                      <FiCheckCircle className="w-4 h-4" />
                      <span>Approve Letter</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setReviewDecision('Rejected')}
                      className={`flex-1 py-2.5 px-3 rounded-xl font-bold text-xs border flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                        reviewDecision === 'Rejected'
                          ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
                          : 'bg-card text-foreground border-border hover:bg-muted'
                      }`}
                    >
                      <FiXCircle className="w-4 h-4" />
                      <span>Reject Letter</span>
                    </button>
                  </div>

                  {/* Leave Type Selection when Approved */}
                  {reviewDecision === 'Approved' && (
                    <div className="space-y-2.5 p-3.5 rounded-xl bg-muted/40 border border-border">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-foreground uppercase tracking-wide">
                          Select Leave Classification:
                        </span>
                        <span className="text-[11px] font-mono text-muted-foreground">
                          Daily Rate: ₱{activeDailyRate.toFixed(2)} &bull; {activeTotalDays} Day{activeTotalDays > 1 ? 's' : ''}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {/* Option 1: Leave with Pay */}
                        <div
                          onClick={() => setLeaveType('with_pay')}
                          className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all flex flex-col justify-between ${
                            leaveType === 'with_pay'
                              ? 'border-emerald-500 bg-emerald-500/10 shadow-xs ring-2 ring-emerald-500/20'
                              : 'border-border bg-card hover:bg-muted/50'
                          }`}
                        >
                          <div className="flex items-start gap-2.5">
                            <input
                              type="radio"
                              id="lt_with_pay"
                              name="leaveTypeSelection"
                              value="with_pay"
                              checked={leaveType === 'with_pay'}
                              onChange={() => setLeaveType('with_pay')}
                              className="mt-0.5 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                            />
                            <div>
                              <label htmlFor="lt_with_pay" className="font-bold text-xs text-foreground flex items-center gap-1.5 cursor-pointer">
                                <span>Leave with Pay</span>
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                                  Paid Leave
                                </span>
                              </label>
                              <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                                Marks absence as excused/paid. Recorded as absent in attendance, but <strong>NO wage deduction</strong> is applied to weekly payroll (base pay remains intact for these dates).
                              </p>
                            </div>
                          </div>
                          <div className="mt-3 pt-2.5 border-t border-border/60 flex items-center justify-between text-[11px]">
                            <span className="text-muted-foreground">Payroll Deduction:</span>
                            <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                              ₱0.00 (Base Pay Intact)
                            </span>
                          </div>
                        </div>

                        {/* Option 2: Leave without Pay */}
                        <div
                          onClick={() => setLeaveType('without_pay')}
                          className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all flex flex-col justify-between ${
                            leaveType === 'without_pay'
                              ? 'border-amber-500 bg-amber-500/10 shadow-xs ring-2 ring-amber-500/20'
                              : 'border-border bg-card hover:bg-muted/50'
                          }`}
                        >
                          <div className="flex items-start gap-2.5">
                            <input
                              type="radio"
                              id="lt_without_pay"
                              name="leaveTypeSelection"
                              value="without_pay"
                              checked={leaveType === 'without_pay'}
                              onChange={() => setLeaveType('without_pay')}
                              className="mt-0.5 text-amber-600 focus:ring-amber-500 cursor-pointer"
                            />
                            <div>
                              <label htmlFor="lt_without_pay" className="font-bold text-xs text-foreground flex items-center gap-1.5 cursor-pointer">
                                <span>Leave without Pay</span>
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-600 dark:text-amber-400">
                                  Unpaid Leave
                                </span>
                              </label>
                              <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                                Marks absence as unexcused/unpaid. Recorded as absent, and the system <strong>automatically computes and subtracts an absence deduction</strong> from weekly payroll.
                              </p>
                            </div>
                          </div>
                          <div className="mt-3 pt-2.5 border-t border-border/60 flex items-center justify-between text-[11px]">
                            <span className="text-muted-foreground">Payroll Deduction:</span>
                            <span className="font-mono font-bold text-rose-600 dark:text-rose-400">
                              -₱{activeTotalDeduction.toFixed(2)} ({activeTotalDays}d @ ₱{activeDailyRate.toFixed(2)})
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Rejection Notice */}
                  {reviewDecision === 'Rejected' && (
                    <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-600 dark:text-rose-400 space-y-1">
                      <div className="font-bold flex items-center gap-1.5">
                        <FiAlertCircle className="w-4 h-4" />
                        <span>Rejecting Excuse / Leave Letter</span>
                      </div>
                      <p className="text-[11px] leading-relaxed">
                        This letter will be marked as Rejected. Missed work days will be recorded as unexcused absences and automatically deducted from weekly payroll.
                      </p>
                    </div>
                  )}

                  <div>
                    <label className="block text-[11px] font-bold text-muted-foreground uppercase mb-1">
                      Admin Remarks / Notes to Employee
                    </label>
                    <textarea
                      rows={2}
                      value={adminRemarks}
                      onChange={(e) => setAdminRemarks(e.target.value)}
                      placeholder={
                        reviewDecision === 'Approved'
                          ? (leaveType === 'with_pay' ? 'e.g., Approved with Pay. Medical certificate verified.' : 'e.g., Approved without Pay per leave policy.')
                          : 'e.g., Insufficient notice or unverified supporting documents...'
                      }
                      className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <Btn
                      variant="outline"
                      size="sm"
                      type="button"
                      onClick={() => setReviewModalOpen(false)}
                      disabled={submittingReview}
                    >
                      Cancel
                    </Btn>
                    <Btn
                      variant={reviewDecision === 'Approved' ? 'primary' : 'danger'}
                      size="sm"
                      type="submit"
                      disabled={submittingReview}
                      icon={reviewDecision === 'Approved' ? <FiCheckCircle className="w-4 h-4" /> : <FiXCircle className="w-4 h-4" />}
                    >
                      {submittingReview
                        ? 'Saving...'
                        : (reviewDecision === 'Approved'
                            ? `Confirm Approval (${leaveType === 'with_pay' ? 'With Pay' : 'Without Pay'})`
                            : 'Confirm Rejection')}
                    </Btn>
                  </div>
                </form>
              )
            })()}
          </div>
        </Modal>
      )}

      {/* Attachment Preview Modal */}
      {previewAttachment && (
        <Modal
          open={!!previewAttachment}
          onClose={() => setPreviewAttachment(null)}
          title={`Supporting Proof: ${previewAttachment.name}`}
          size="lg"
        >
          <div className="space-y-4 text-center">
            {previewAttachment.isImage ? (
              <div className="max-h-[70vh] overflow-auto rounded-xl border border-border p-2 bg-black/5 flex items-center justify-center">
                <img
                  src={previewAttachment.url}
                  alt={previewAttachment.name}
                  className="max-h-[65vh] w-auto object-contain rounded-lg shadow-sm"
                />
              </div>
            ) : (
              <div className="p-8 border border-dashed border-border rounded-xl space-y-3">
                <FiPaperclip className="w-12 h-12 mx-auto text-primary" />
                <p className="font-bold text-foreground text-sm">{previewAttachment.name}</p>
                <p className="text-xs text-muted-foreground">Document file attachment</p>
                <a
                  href={previewAttachment.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground font-bold text-xs"
                >
                  <FiDownload className="w-4 h-4" />
                  <span>Download / Open Document</span>
                </a>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}
