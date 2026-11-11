import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FiFileText, FiSend, FiZap, FiUpload, FiX, FiEye,
  FiCalendar, FiCheckCircle, FiClock, FiAlertCircle, FiRefreshCw, FiArrowLeft, FiPrinter,
  FiUser, FiMapPin, FiPaperclip, FiArchive
} from 'react-icons/fi'
import { useAuth } from '../context/AuthContext'
import {
  PageHeader, Card, CardHeader, Btn, StatusBadge, Modal, showToast
} from '../components/ui'
import { api, STORAGE_BASE } from '../lib/api'
import { useRealtimeSync, triggerDataSync } from '../lib/realtimeSync'
import { fastDeepEqual } from '../lib/utils'

export const LEAVE_CATEGORIES = [
  'Excuse Letter',
  'Sick Leave',
  'Important Matter',
  'Maternity Leave',
  'Vacation Leave',
]

export function buildFormalLetterText({ category, from_date, to_date, reason, user }) {
  const todayStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  const empName = user?.employee
    ? `${user.employee.first_name || ''} ${user.employee.last_name || ''}`.trim()
    : (user?.name || 'Employee')
  const empCode = user?.employee?.employee_code || ''
  const position = user?.employee?.position || 'Staff'
  const department = user?.employee?.department || 'Operations'
  const branch = user?.employee?.branch?.name || (typeof user?.employee?.branch === 'string' ? user.employee.branch : 'Main Branch')

  const fmtRangeDate = (d) => {
    if (!d) return '________'
    const parsed = new Date(`${d}T00:00:00`)
    if (isNaN(parsed.getTime())) return d
    return parsed.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  }

  const startFormatted = fmtRangeDate(from_date)
  const endFormatted = fmtRangeDate(to_date || from_date)
  const datePhrase = from_date && to_date && from_date !== to_date
    ? `from ${startFormatted} to ${endFormatted}`
    : `on ${startFormatted}`

  const cleanReason = (reason || '').trim() || 'personal/medical circumstances requiring my immediate attention'

  let openingParagraph = ''
  let closingAssurance = ''

  switch (category) {
    case 'Sick Leave':
      openingParagraph = `I am writing to formally request a Sick Leave of absence ${datePhrase}. Unfortunately, I am unable to report for duty due to ${cleanReason}.`
      closingAssurance = `I have attached the relevant medical documentation/proof for your verification. I will keep management updated on my recovery and resume my duties promptly upon fitness to work.`
      break
    case 'Important Matter':
      openingParagraph = `I respectfully submit this letter to request an excused absence for an Urgent / Important Matter ${datePhrase}, specifically due to ${cleanReason}.`
      closingAssurance = `I have coordinated my pending tasks to ensure store operations remain uninterrupted during my brief absence.`
      break
    case 'Maternity Leave':
      openingParagraph = `I am formally applying for Maternity Leave effective ${datePhrase} in connection with ${cleanReason}.`
      closingAssurance = `I have prepared a complete turnover of my responsibilities and attached the supporting medical records for HR and payroll processing.`
      break
    case 'Vacation Leave':
      openingParagraph = `I would like to formally request approval for a Vacation Leave ${datePhrase} due to ${cleanReason}.`
      closingAssurance = `Prior to my scheduled leave, I will ensure that all assigned deliverables and branch duties are properly endorsed to my team.`
      break
    case 'Excuse Letter':
    default:
      openingParagraph = `Please accept this formal Excuse Letter regarding my absence/tardiness ${datePhrase} due to ${cleanReason}.`
      closingAssurance = `I sincerely apologize for any inconvenience this may have caused and assure management of my continued commitment to my duties at Z-LICZ.`
      break
  }

  return `${todayStr}

To: The Management & HR Department
Z-LICZ Furniture & Appliances Trading
Branch: ${branch}

SUBJECT: FORMAL ${category.toUpperCase()} — ${empName.toUpperCase()}${empCode ? ` (${empCode})` : ''}

Dear Z-LICZ Management,

${openingParagraph}

${closingAssurance}

Thank you very much for your kind consideration and understanding.

Respectfully yours,

${empName}
${position} — ${department}
${branch}`
}

export function printFormalLetter(letter, user) {
  if (!letter) return
  const printWindow = window.open('', '_blank')
  if (!printWindow) {
    showToast('Pop-up blocked. Please allow pop-ups to print letters.', 'error')
    return
  }

  const empName = user?.employee
    ? `${user.employee.first_name || ''} ${user.employee.last_name || ''}`.trim()
    : (user?.name || letter.employee_name || 'Employee')
  const empCode = user?.employee?.employee_code || letter.employee?.employee_code || ''
  const position = user?.employee?.position || letter.employee?.position || 'Staff'
  const department = user?.employee?.department || letter.employee?.department || 'Operations'
  const branch = user?.employee?.branch?.name || (typeof user?.employee?.branch === 'string' ? user.employee.branch : 'Main Branch')

  const fromDate = letter.start_date || letter.from_date ? String(letter.start_date || letter.from_date).slice(0, 10) : '—'
  const toDate = letter.end_date || letter.to_date ? String(letter.end_date || letter.to_date).slice(0, 10) : fromDate
  const totalDays = letter.total_days || 1

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Z-LICZ Business Letter — ${letter.category || 'Excuse Letter'} — ${empName}</title>
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
            <div class="sub">Formal Employee Letter Submission — ${branch}</div>
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
            ${letter.admin_remarks ? `<span style="margin-left: 12px; font-style: italic; color: #4b5563;">Management Remarks: "${letter.admin_remarks}"</span>` : ''}
          </div>
        </div>

        <div class="content">${letter.letter_body || letter.message || 'No letter body provided.'}</div>

        <div class="footer">
          <div>
            <div>Employee Signature:</div>
            <div class="sig-line">${empName}</div>
          </div>
          <div>
            <div>Management / HR Acknowledgment:</div>
            <div class="sig-line">Z-LICZ HR</div>
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

export default function ExcuseLetterPage({ embedded = false }) {
  const { user } = useAuth()
  const navigate = useNavigate()

  const todayIso = new Date().toISOString().slice(0, 10)
  const todayFormatted = new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  const [formData, setFormData] = useState({
    category: 'Excuse Letter',
    from_date: todayIso,
    to_date: todayIso,
    reason: '',
    message: '',
  })

  const [attachmentFile, setAttachmentFile] = useState(null)
  const [attachmentPreview, setAttachmentPreview] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [myLetters, setMyLetters] = useState([])
  const [loadingLetters, setLoadingLetters] = useState(false)
  const [viewLetterModal, setViewLetterModal] = useState(null)
  const [historyTab, setHistoryTab] = useState('active') // 'active' | 'archived'

  // Employee Auto-Generated Details
  const employeeName = user?.employee
    ? `${user.employee.first_name || ''} ${user.employee.last_name || ''}`.trim()
    : (user?.name || 'Employee')
  const employeeCode = user?.employee?.employee_code || (user?.employee_id ? `EMP-${user.employee_id}` : 'EMP-000')
  const employeeBranch = user?.employee?.branch?.name || (typeof user?.employee?.branch === 'string' ? user.employee.branch : 'Store Branch')
  const employeeDepartment = user?.employee?.department || 'Operations'
  const employeePosition = user?.employee?.position || 'Staff'

  // Calculate day/week span
  const durationInfo = (() => {
    if (!formData.from_date || !formData.to_date) return { days: 1, weeks: null }
    try {
      const start = new Date(`${formData.from_date}T00:00:00`)
      const end = new Date(`${formData.to_date}T00:00:00`)
      if (end < start) return { days: 1, weeks: null }
      const diffMs = end.getTime() - start.getTime()
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1
      const weeks = diffDays >= 7 ? Math.round((diffDays / 7) * 10) / 10 : null
      return { days: diffDays, weeks }
    } catch (_) {
      return { days: 1, weeks: null }
    }
  })()

  // Initialize form letter message once user is loaded
  useEffect(() => {
    const initial = {
      category: 'Excuse Letter',
      from_date: todayIso,
      to_date: todayIso,
      reason: '',
    }
    setFormData({
      ...initial,
      message: buildFormalLetterText({ ...initial, user }),
    })
  }, [user])

  // Cleanup attachment preview URL
  useEffect(() => {
    return () => {
      if (attachmentPreview) URL.revokeObjectURL(attachmentPreview)
    }
  }, [attachmentPreview])

  // Fetch submitted letters for this employee using dedicated employeeLetters API
  const loadLetters = async (tab = historyTab) => {
    setLoadingLetters(true)
    try {
      const params = tab === 'archived' ? { status: 'Archived' } : {}
      if (embedded) params.my_only = 1
      const res = await api.employeeLetters.getAll(params)
      const nextLetters = res?.letters || []
      setMyLetters(prev => (fastDeepEqual(prev, nextLetters) ? prev : nextLetters))
    } catch (err) {
      console.warn('Could not load excuse letters:', err)
    } finally {
      setLoadingLetters(false)
    }
  }

  useEffect(() => {
    loadLetters(historyTab)
  }, [user, historyTab])

  // Real-time synchronization
  useRealtimeSync(() => {
    loadLetters(historyTab)
  }, [user, historyTab], { module: 'employee_letters' })

  const handleAutoFieldChange = (field, value) => {
    setFormData(prev => {
      const next = { ...prev, [field]: value }
      if (field === 'from_date' && next.to_date && value > next.to_date) {
        next.to_date = value
      }
      next.message = buildFormalLetterText({
        category: next.category,
        from_date: next.from_date,
        to_date: next.to_date,
        reason: next.reason,
        user,
      })
      return next
    })
  }

  const handleRegenerate = () => {
    setFormData(prev => ({
      ...prev,
      message: buildFormalLetterText({
        category: prev.category,
        from_date: prev.from_date,
        to_date: prev.to_date,
        reason: prev.reason,
        user,
      }),
    }))
    showToast('Formal business letter regenerated', 'info')
  }

  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (attachmentPreview) URL.revokeObjectURL(attachmentPreview)
    setAttachmentFile(file)
    if (file.type.startsWith('image/')) {
      setAttachmentPreview(URL.createObjectURL(file))
    } else {
      setAttachmentPreview('')
    }
  }

  const handleReset = () => {
    const initial = {
      category: 'Excuse Letter',
      from_date: todayIso,
      to_date: todayIso,
      reason: '',
    }
    setFormData({
      ...initial,
      message: buildFormalLetterText({ ...initial, user }),
    })
    setAttachmentFile(null)
    if (attachmentPreview) {
      URL.revokeObjectURL(attachmentPreview)
      setAttachmentPreview('')
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!formData.from_date || !formData.to_date) {
      showToast('Please select both From Date and To Date', 'error')
      return
    }
    if (!formData.message?.trim()) {
      showToast('Letter content cannot be empty', 'error')
      return
    }

    setSubmitting(true)
    try {
      const payload = new FormData()
      payload.append('category', formData.category)
      payload.append('title', `${formData.category} (${formData.from_date} to ${formData.to_date})`)
      payload.append('start_date', formData.from_date)
      payload.append('end_date', formData.to_date)
      payload.append('reason', formData.reason || formData.category)
      payload.append('letter_body', formData.message)
      if (attachmentFile) {
        payload.append('attachment', attachmentFile)
      }

      await api.employeeLetters.create(payload)
      showToast(`${formData.category} submitted to Management!`, 'success')
      handleReset()
      triggerDataSync('employee_letters')
    } catch (err) {
      showToast(err.message || 'Failed to submit letter', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      {!embedded && (
        <PageHeader
          title="Create Excuse / Leave Letter"
          subtitle="Draft, auto-generate, and submit formal business letters to Z-LICZ Management & HR"
          action={
            <div className="flex items-center gap-2">
              <Btn
                variant="outline"
                size="sm"
                onClick={() => navigate('/employee/dashboard')}
                icon={<FiArrowLeft className="w-4 h-4" />}
              >
                Back to Dashboard
              </Btn>
            </div>
          }
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Letter Form Card */}
        <div className="lg:col-span-7 space-y-6">
          <Card noPad className="border border-border p-5 space-y-5">
            {/* Auto-Engine Hint Bar */}
            <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 text-blue-600 dark:text-blue-400 font-semibold text-xs">
                <FiZap className="w-4 h-4 shrink-0 text-blue-500" />
                <span>Auto-Create Letter Engine: Select your category, dates, and brief reason to auto-generate a formal letter.</span>
              </div>
              <button
                type="button"
                onClick={handleRegenerate}
                className="shrink-0 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs cursor-pointer transition-colors shadow-xs"
              >
                Regenerate Text
              </button>
            </div>

            {/* 1. AUTO-GENERATED DETAILS CARD (Submission Date, Employee ID, Name, Branch) */}
            <div className="p-4 rounded-xl bg-muted/40 border border-border space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <FiUser className="w-3.5 h-3.5 text-primary" />
                  Auto-Populated Employee Information
                </span>
                <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-mono font-bold text-[10px]">
                  Verified Profile
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-2.5 rounded-lg bg-card border border-border">
                  <div className="text-[10px] uppercase font-bold text-muted-foreground">Submission Date</div>
                  <div className="font-mono font-bold text-foreground mt-0.5">{todayFormatted}</div>
                </div>

                <div className="p-2.5 rounded-lg bg-card border border-border">
                  <div className="text-[10px] uppercase font-bold text-muted-foreground">Employee ID</div>
                  <div className="font-mono font-bold text-primary mt-0.5">{employeeCode}</div>
                </div>

                <div className="p-2.5 rounded-lg bg-card border border-border">
                  <div className="text-[10px] uppercase font-bold text-muted-foreground">Employee Name</div>
                  <div className="font-bold text-foreground mt-0.5 truncate">{employeeName}</div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground pt-1">
                <span className="flex items-center gap-1">
                  <FiMapPin className="w-3 h-3 text-muted-foreground/70" />
                  Branch: <strong className="text-foreground">{employeeBranch}</strong>
                </span>
                <span>&bull;</span>
                <span>
                  Role: <strong className="text-foreground">{employeePosition} ({employeeDepartment})</strong>
                </span>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              {/* 2. LEAVE TYPES (Selection / Dropdown for: Excuse Letter, Sick Leave, Important Matter) */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
                  Leave Type / Category *
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                  {LEAVE_CATEGORIES.map(cat => {
                    const active = formData.category === cat
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => handleAutoFieldChange('category', cat)}
                        className={`px-3 py-2.5 rounded-xl font-bold text-xs border text-center transition-all cursor-pointer ${
                          active
                            ? 'bg-primary text-primary-foreground border-primary shadow-xs ring-2 ring-primary/20'
                            : 'bg-card text-foreground border-border hover:bg-muted/70'
                        }`}
                      >
                        {cat}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* 3. DATE RANGE ("From [Date]" to "To [Date]" covering days or weeks) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                    From Date *
                  </label>
                  <input
                    type="date"
                    value={formData.from_date || ''}
                    max={formData.to_date || undefined}
                    onChange={e => handleAutoFieldChange('from_date', e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-mono text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                    To Date *
                  </label>
                  <input
                    type="date"
                    value={formData.to_date || ''}
                    min={formData.from_date || undefined}
                    onChange={e => handleAutoFieldChange('to_date', e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-mono text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                    Brief Reason / Context *
                  </label>
                  <input
                    type="text"
                    value={formData.reason || ''}
                    onChange={e => handleAutoFieldChange('reason', e.target.value)}
                    placeholder="e.g., High fever, personal errand..."
                    className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
                    required
                  />
                </div>
              </div>

              {/* Dynamic Span Indicator (Days / Weeks) */}
              <div className="p-2.5 rounded-lg bg-blue-500/5 border border-blue-500/15 flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 font-semibold">
                  <FiCalendar className="w-3.5 h-3.5" />
                  <span>
                    Leave Duration: <strong>{durationInfo.days} Day{durationInfo.days > 1 ? 's' : ''}</strong>
                    {durationInfo.weeks ? ` (${durationInfo.weeks} week${durationInfo.weeks > 1 ? 's' : ''})` : ''}
                  </span>
                </div>
                <span className="text-muted-foreground italic text-[10px]">
                  Sundays excluded from payroll absence deduction
                </span>
              </div>

              {/* 4. AUTO-GENERATED FORMAL BUSINESS LETTER (Editable) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    Formal Letter to Z-LICZ Management (Editable) *
                  </label>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    Freely customize or edit below
                  </span>
                </div>
                <textarea
                  rows={13}
                  value={formData.message || ''}
                  onChange={e => setFormData(prev => ({ ...prev, message: e.target.value }))}
                  className="w-full p-4 rounded-xl border border-border bg-card text-foreground font-mono text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary/30 resize-y"
                  required
                />
              </div>

              {/* 5. SUPPORTING FILE ATTACHMENT */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                  Supporting Proof / Document (Optional: Medical Certificate, Doctor's Note, Receipt, ID)
                </label>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                  <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-primary/50 bg-primary/5 hover:bg-primary/10 text-primary font-bold text-xs cursor-pointer transition-colors">
                    <FiUpload className="w-4 h-4" />
                    <span>{attachmentFile ? 'Change Attachment' : 'Attach Medical Cert / Document'}</span>
                    <input
                      type="file"
                      accept="image/*,.pdf,.doc,.docx"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </label>
                  {attachmentFile && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-muted border border-border text-xs">
                      <FiFileText className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span className="truncate max-w-[220px] font-medium">{attachmentFile.name}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setAttachmentFile(null)
                          if (attachmentPreview) {
                            URL.revokeObjectURL(attachmentPreview)
                            setAttachmentPreview('')
                          }
                        }}
                        className="p-1 text-muted-foreground hover:text-rose-500 rounded-lg cursor-pointer"
                        title="Remove attached file"
                      >
                        <FiX className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {attachmentPreview && (
                  <div className="mt-2.5 p-2 rounded-xl border border-border bg-muted/20 inline-block">
                    <img
                      src={attachmentPreview}
                      alt="Attachment Preview"
                      className="max-h-36 rounded-lg object-contain"
                    />
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
                <Btn
                  variant="outline"
                  type="button"
                  onClick={handleReset}
                  disabled={submitting}
                >
                  Reset Form
                </Btn>
                <Btn
                  variant="primary"
                  type="submit"
                  disabled={submitting}
                  icon={<FiSend className="w-4 h-4" />}
                >
                  {submitting ? 'Submitting...' : 'Submit to Management'}
                </Btn>
              </div>
            </form>
          </Card>
        </div>

        {/* Right Column: Submitted Letters History */}
        <div className="lg:col-span-5 space-y-4">
          <Card noPad className="border border-border">
            <CardHeader
              title="My Submitted Letters"
              action={
                <div className="flex items-center gap-2">
                  <div className="flex items-center bg-muted/60 p-0.5 rounded-lg border border-border text-[11px]">
                    <button
                      type="button"
                      onClick={() => setHistoryTab('active')}
                      className={`px-2 py-0.5 rounded-md font-bold transition-all cursor-pointer ${
                        historyTab === 'active'
                          ? 'bg-card text-foreground shadow-xs'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Active
                    </button>
                    <button
                      type="button"
                      onClick={() => setHistoryTab('archived')}
                      className={`px-2 py-0.5 rounded-md font-bold transition-all cursor-pointer flex items-center gap-1 ${
                        historyTab === 'archived'
                          ? 'bg-purple-600 text-white shadow-xs'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                      title="Letters moved to archive after 24 hours"
                    >
                      <FiArchive className="w-3 h-3" />
                      <span>Archived</span>
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => loadLetters(historyTab)}
                    disabled={loadingLetters}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer transition-colors"
                    title="Refresh letter history"
                  >
                    <FiRefreshCw className={`w-3.5 h-3.5 ${loadingLetters ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              }
            />
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-muted-foreground uppercase font-semibold text-[10px]">
                    <th className="py-2.5 px-3.5 text-left">Category / Dates</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                    <th className="py-2.5 px-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {myLetters.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="py-10 text-center text-muted-foreground">
                        {historyTab === 'archived' ? (
                          <FiArchive className="w-8 h-8 mx-auto text-purple-400/40 mb-2" />
                        ) : (
                          <FiFileText className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
                        )}
                        <p className="font-semibold text-xs">
                          {historyTab === 'archived' ? 'No archived letters found' : 'No submitted letters yet'}
                        </p>
                        <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                          {historyTab === 'archived'
                            ? 'Letters automatically move to archive 24 hours after submission.'
                            : 'Use the form on the left to submit an excuse or leave letter.'}
                        </p>
                      </td>
                    </tr>
                  ) : (
                    myLetters.map((item) => {
                      const startStr = item.start_date || item.from_date ? String(item.start_date || item.from_date).slice(0, 10) : '—'
                      const endStr = item.end_date || item.to_date ? String(item.end_date || item.to_date).slice(0, 10) : startStr

                      return (
                        <tr key={item.letter_id || item.id} className="border-b border-border hover:bg-muted/30">
                          <td className="py-3 px-3.5 space-y-1">
                            <div className="font-bold text-foreground">{item.category || item.title || item.topic}</div>
                            <div className="font-mono text-[11px] text-muted-foreground">
                              {startStr} {startStr !== endStr ? `→ ${endStr}` : ''}
                            </div>
                            {item.reason && (
                              <p className="text-[11px] text-muted-foreground/80 line-clamp-1 italic">
                                "{item.reason}"
                              </p>
                            )}
                          </td>
                          <td className="py-3 px-3 text-center align-middle space-y-1">
                            <StatusBadge status={item.status} />
                            {item.status === 'Approved' && (
                              <div>
                                <span
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                                    (item.leave_type === 'with_pay' || item.is_paid)
                                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                                      : 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30'
                                  }`}
                                >
                                  {(item.leave_type === 'with_pay' || item.is_paid) ? 'With Pay' : 'Without Pay'}
                                </span>
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-3 text-center align-middle">
                            <button
                              type="button"
                              onClick={() => setViewLetterModal(item)}
                              className="px-2.5 py-1 rounded-lg bg-primary/10 text-primary font-bold text-[11px] hover:bg-primary/20 cursor-pointer transition-colors"
                            >
                              View
                            </button>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>

      {/* Modal to View Full Submitted Letter Details */}
      {viewLetterModal && (
        <Modal
          open={!!viewLetterModal}
          onClose={() => setViewLetterModal(null)}
          title={`${viewLetterModal.category || 'Submitted Letter'} — ${viewLetterModal.status}`}
          size="lg"
        >
          <div className="space-y-4 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-muted/40 border border-border">
              <div>
                <span className="text-muted-foreground">Inclusive Dates: </span>
                <span className="font-mono font-bold text-foreground">
                  {viewLetterModal.start_date || viewLetterModal.from_date ? `${String(viewLetterModal.start_date || viewLetterModal.from_date).slice(0, 10)} to ${String(viewLetterModal.end_date || viewLetterModal.to_date || viewLetterModal.start_date || viewLetterModal.from_date).slice(0, 10)}` : 'N/A'}
                </span>
                <span className="ml-1 text-muted-foreground font-normal">
                  ({viewLetterModal.total_days || 1} day/s)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => printFormalLetter(viewLetterModal, user)}
                  title="Print Official Letter / Save as PDF"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs cursor-pointer transition-all active:scale-95"
                >
                  <FiPrinter className="w-3.5 h-3.5" />
                  <span>Print / PDF</span>
                </button>
                <span className="px-2.5 py-1 rounded-full bg-primary/10 text-primary font-bold">
                  {viewLetterModal.category || viewLetterModal.title || 'Excuse Letter'}
                </span>
                <StatusBadge status={viewLetterModal.status} />
                {viewLetterModal.status === 'Approved' && (
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                      (viewLetterModal.leave_type === 'with_pay' || viewLetterModal.is_paid)
                        ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                        : 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30'
                    }`}
                  >
                    {(viewLetterModal.leave_type === 'with_pay' || viewLetterModal.is_paid) ? 'Leave with Pay' : 'Leave without Pay'}
                  </span>
                )}
                {viewLetterModal.is_archived && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30">
                    <FiArchive className="w-3 h-3" />
                    <span>Archived</span>
                  </span>
                )}
              </div>
            </div>

            {/* Leave classification notice if Approved */}
            {viewLetterModal.status === 'Approved' && (
              <div
                className={`p-3 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs ${
                  (viewLetterModal.leave_type === 'with_pay' || viewLetterModal.is_paid)
                    ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-700 dark:text-emerald-300'
                    : 'bg-amber-500/10 border-amber-500/25 text-amber-700 dark:text-amber-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <FiCheckCircle className="w-4 h-4 shrink-0" />
                  <span className="font-semibold">
                    {(viewLetterModal.leave_type === 'with_pay' || viewLetterModal.is_paid)
                      ? 'Approved as Leave with Pay: Excused absence with NO salary deduction in weekly payroll.'
                      : 'Approved as Leave without Pay: Excused absence with wage deducted from weekly payroll.'}
                  </span>
                </div>
                <span className="font-mono font-bold whitespace-nowrap px-2 py-0.5 rounded bg-card/60 border border-border/50">
                  {(viewLetterModal.leave_type === 'with_pay' || viewLetterModal.is_paid) ? '₱0.00 Deduction' : 'Wage Deducted in Payroll'}
                </span>
              </div>
            )}

            <div className="p-4 rounded-xl border border-border bg-card font-mono whitespace-pre-wrap leading-relaxed text-foreground max-h-[360px] overflow-y-auto">
              {viewLetterModal.letter_body || viewLetterModal.message}
            </div>

            {(viewLetterModal.attachment_url || viewLetterModal.attachment_path) && (
              <div className="space-y-1.5 p-3 rounded-xl bg-muted/30 border border-border">
                <div className="text-[11px] font-bold uppercase text-muted-foreground">Attached Supporting Document</div>
                <a
                  href={viewLetterModal.attachment_url || `${STORAGE_BASE}/${viewLetterModal.attachment_path}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-primary font-bold hover:underline"
                >
                  <FiEye className="w-3.5 h-3.5" />
                  <span>Open Attachment in New Tab ({viewLetterModal.attachment_name || 'Document'}) ↗</span>
                </a>
              </div>
            )}

            {(viewLetterModal.admin_remarks || viewLetterModal.response) && (
              <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <div className="text-[11px] font-bold uppercase text-emerald-600 dark:text-emerald-400 mb-1">
                  Management Decision Remarks
                </div>
                <div className="text-foreground leading-relaxed">
                  {viewLetterModal.admin_remarks || viewLetterModal.response}
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}
