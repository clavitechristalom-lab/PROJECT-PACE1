import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react'
import {
  FiUser, FiShield, FiCheckCircle, FiAlertTriangle, FiEdit,
  FiSave, FiX, FiPhone, FiMail, FiMapPin, FiCreditCard, FiCalendar, FiClock, FiActivity, FiKey,
  FiSmartphone, FiPrinter, FiDownload, FiInfo, FiChevronDown, FiCamera, FiUploadCloud, FiXCircle, FiArrowUpRight,
  FiBarChart2, FiFileText, FiEye, FiTrendingDown
} from 'react-icons/fi'
import {
  Btn, Badge, StatusBadge, Input, Modal, TabBar, showToast, LoadingState, ErrorAlert, PageHeader, Card, StatCard, TableSkeleton, EmptyState
} from '../ui'
import { fmtDate, fmt } from '../../lib/utils'
import { api } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { useRealtimeSync, triggerDataSync, fastDeepEqual } from '../../lib/realtimeSync'
import { QRCodeSVG } from 'qrcode.react'
import { TbCurrencyPeso, TbFaceId, TbFaceId as Scan } from 'react-icons/tb'
import FaceRecognitionEnrollment from '../biometrics/FaceRecognitionEnrollment'
import EmployeePayslipModal from '../payslip/EmployeePayslipModal'
import ExcuseLetterPage from '../../pages/ExcuseLetterPage'

const DetailedPayrollViewModal = lazy(() =>
  import('../../pages/PayrollPage').then(m => ({ default: m.DetailedPayrollViewModal }))
)

/**
 * Official dark company ID card badge displaying employee photo, identity, and permanent QR code.
 */
function PermanentAttendanceBadge({ employee, user, branchName, qrSize = 170, qrId }) {
  const fullName = `${employee?.first_name || ''} ${employee?.last_name || ''}`.trim() || user?.name || '—'
  const initials = `${employee?.first_name?.[0] || ''}${employee?.last_name?.[0] || ''}` || fullName[0] || 'U'
  const profileImg = employee?.profile_image || user?.profile_image
  const resolvedBranch = branchName || employee?.branch?.name || (typeof employee?.branch === 'string' ? employee.branch : '') || ''
  const deptBranch = [employee?.department, resolvedBranch].filter(Boolean).join(' · ')

  return (
    <div className="w-80 max-w-full mx-auto bg-gradient-to-b from-slate-900 via-slate-800 to-slate-950 text-white rounded-3xl shadow-2xl border border-slate-700 overflow-hidden flex flex-col items-center p-6 text-center relative">
      <div className="w-12 h-1 bg-amber-400 rounded-full mb-3" />
      <span className="text-[10px] uppercase tracking-widest text-amber-300 font-bold">PERMANENT ATTENDANCE BADGE</span>
      <h4 className="text-xs text-slate-400 font-medium mt-0.5">Official Company ID</h4>

      <div className="w-20 h-20 rounded-2xl bg-slate-800 border-2 border-primary/40 flex items-center justify-center text-primary font-bold text-2xl my-3 shadow-inner overflow-hidden">
        {profileImg ? (
          <img src={profileImg} alt={fullName} className="w-full h-full object-cover" />
        ) : (
          <span>{initials}</span>
        )}
      </div>

      <h3 className="font-bold text-lg text-white leading-tight">{fullName}</h3>
      {employee?.position && (
        <p className="text-xs text-primary font-semibold mt-0.5">{employee.position}</p>
      )}
      {deptBranch && (
        <p className="text-[11px] text-slate-400 mt-0.5">{deptBranch}</p>
      )}

      <div className="mt-2.5 font-mono text-xs font-bold text-slate-200 bg-slate-800/80 px-3.5 py-1 rounded-full border border-slate-700">
        {employee?.employee_code || '—'}
      </div>

      <div className="mt-4 p-4 bg-white rounded-2xl shadow-xl border-2 border-slate-200">
        <QRCodeSVG
          id={qrId}
          value={employee?.qr_token || ''}
          size={qrSize}
          level="H"
          includeMargin={false}
        />
      </div>

      <div className="mt-4 flex items-center gap-1.5">
        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
        <span className="text-xs uppercase font-bold tracking-wider text-slate-200">
          Permanent Active QR
        </span>
      </div>
    </div>
  )
}

export default function ProfileModal() {
  const isVisible = true
  const { user, verifySession } = useAuth()
  const fileInputRef = useRef(null)
  const inFlightRef = useRef(false)
  const [employee, setEmployee] = useState(null)
  const isAdmin = user?.role === 'Administrator' || user?.role === 'Admin' || user?.role === 'System Administrator' || employee?.position === 'System Administrator' || employee?.position === 'Administrator'
  const isCustomer = user?.role === 'Customer'
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [isUploadingImage, setIsUploadingImage] = useState(false)
  const [activeTab, setActiveTab] = useState('profile')
  const [showDisplayQrModal, setShowDisplayQrModal] = useState(false)

  // Attendance & timesheet state
  const [myAttendance, setMyAttendance] = useState([])
  const [attendanceStats, setAttendanceStats] = useState(null)
  const [loadingAttendance, setLoadingAttendance] = useState(false)

  // Personal payslips state (Store Admin)
  const [myPayrolls, setMyPayrolls] = useState([])
  const [loadingPayrolls, setLoadingPayrolls] = useState(false)
  const [selectedPayslip, setSelectedPayslip] = useState(null)
  const [viewPayrollRecord, setViewPayrollRecord] = useState(null)
  const [proofLightboxRecord, setProofLightboxRecord] = useState(null)

  // Verification states
  const [verificationModalOpen, setVerificationModalOpen] = useState(false)
  const [verificationDetailsOpen, setVerificationDetailsOpen] = useState(false)
  const [verificationLoading, setVerificationLoading] = useState(false)
  const [verificationError, setVerificationError] = useState('')

  // QR Request state
  const [qrRequestModalOpen, setQrRequestModalOpen] = useState(false)
  const [submittingRequest, setSubmittingRequest] = useState(false)

  // Edit form state (restricted to allowed self-service fields)
  const [editForm, setEditForm] = useState({
    phone: '',
    email: '',
    address: '',
    pay_type: 'Cash',
    ewallet_provider: 'GCash',
    ewallet_account_name: '',
    ewallet_account_no: '',
    bank_name: 'BDO',
    bank_account_name: '',
    bank_account_no: '',
    emergency_contact_name: '',
    emergency_contact_relation: '',
    emergency_contact_phone: '',
  })

  const [branchesList, setBranchesList] = useState([])

  const [pinForm, setPinForm] = useState({ current_pin: '', new_pin: '', confirm_pin: '' })
  const [pinLoading, setPinLoading] = useState(false)
  const [pinError, setPinError] = useState('')
  const [pinSuccess, setPinSuccess] = useState('')

  // Backup PIN accordion
  const [showPinBackup, setShowPinBackup] = useState(false)

  useEffect(() => {
    if (isVisible) {
      api.branches.getAll()
        .then(res => {
          setBranchesList(res.branches || res.data || res || [])
        })
        .catch(err => console.error("Error fetching branches:", err))
    }
  }, [isVisible])

  useEffect(() => {
    if ((activeTab === 'attendance_log' || activeTab === 'timesheet_summary') && isVisible) {
      setLoadingAttendance(true)
      api.employees.getMeAttendance()
        .then(res => {
          setMyAttendance(res.attendance || res.records || [])
          setAttendanceStats(res.stats || null)
        })
        .catch(err => showToast(err.message || 'Failed to fetch attendance', 'error'))
        .finally(() => setLoadingAttendance(false))
    } else if (activeTab === 'payslips' && isVisible) {
      setLoadingPayrolls(true)
      api.payroll.getMePayroll()
        .then(res => setMyPayrolls(res.payroll || []))
        .catch(err => showToast(err.message || 'Failed to fetch payslips', 'error'))
        .finally(() => setLoadingPayrolls(false))
    }
  }, [activeTab, isVisible])

  const loadProfile = useCallback(async (silent = false, signal) => {
    if (!isVisible) return
    const isSilent = silent === true
    if (inFlightRef.current && isSilent) return
    inFlightRef.current = true
    if (!isSilent) {
      setLoading(true)
      setError('')
    }
    try {
      if (isCustomer && user?.customer_id) {
        const res = await api.customers.getById(user.customer_id, { signal })
        if (signal?.aborted) return
        if (res?.customer || res) {
          const custData = res.customer || res
          setEmployee(prev => (fastDeepEqual(prev, custData) ? prev : custData))
          if (!isSilent) {
            setEditForm({
              customer_code: custData.customer_code || '',
              first_name: custData.first_name || '',
              middle_name: custData.middle_name || '',
              last_name: custData.last_name || '',
              gender: custData.gender || 'Male',
              date_of_birth: custData.date_of_birth || '',
              marital_status: custData.marital_status || 'Single',
              status: custData.status || 'Active',
              notes: custData.notes || '',
              branch_id: custData.branch_id || custData.branch || '',
              phone: custData.phone || '',
              email: custData.email || '',
              address: custData.address || '',
            })
          }
        } else if (!isSilent) {
          setError('Customer information was not found.')
        }
      } else {
        const res = await api.employees.getMe({ signal })
        if (signal?.aborted) return
        if (res?.employee) {
          setEmployee(prev => (fastDeepEqual(prev, res.employee) ? prev : res.employee))
          if (!isSilent) {
            const rawPt = String(res.employee.pay_type || '').toLowerCase()
            let normalizedPayType = 'Cash'
            if (['e-wallet', 'ewallet', 'gcash', 'maya', 'paymaya'].includes(rawPt)) {
              normalizedPayType = 'E-Wallet'
            } else if (['online bank', 'bank', 'bank transfer'].includes(rawPt)) {
              normalizedPayType = 'Online Bank'
            } else if (rawPt === 'cash') {
              normalizedPayType = 'Cash'
            }
            const fullNameDefault = `${res.employee.first_name || ''} ${res.employee.last_name || ''}`.trim()
            setEditForm({
              phone: res.employee.phone || '',
              email: res.employee.email || '',
              address: res.employee.address || '',
              gender: res.employee.gender || 'Male',
              birth_date: res.employee.birth_date || res.employee.date_of_birth || '',
              date_of_birth: res.employee.date_of_birth || res.employee.birth_date || '',
              marital_status: res.employee.marital_status || 'Single',
              pay_type: normalizedPayType,
              ewallet_provider: res.employee.ewallet_provider || 'GCash',
              ewallet_account_name: res.employee.ewallet_account_name || fullNameDefault,
              ewallet_account_no: res.employee.ewallet_account_no || res.employee.phone || '',
              bank_name: res.employee.bank_name || 'BDO',
              bank_account_name: res.employee.bank_account_name || fullNameDefault,
              bank_account_no: res.employee.bank_account_no || '',
              emergency_contact_name: res.employee.emergency_contact_name || '',
              emergency_contact_relation: res.employee.emergency_contact_relation || '',
              emergency_contact_phone: res.employee.emergency_contact_phone || '',
              branch_id: res.employee.branch_id || res.employee.branch?.id || '',
            })
          }
        } else if (!isSilent) {
          setError('Employee information was not found.')
        }
      }
    } catch (err) {
      if (err?.name === 'AbortError') return
      console.error('Failed to load profile:', err)
      if (!isSilent) {
        if (err.status === 401) {
          setError('Your session has expired. Please log in again.')
        } else if (err.status === 404) {
          setError(isCustomer ? 'Customer information was not found.' : 'Employee information was not found for this account.')
        } else {
          setError(err.message || 'Unable to load profile information.')
        }
      }
    } finally {
      inFlightRef.current = false
      if (!isSilent) setLoading(false)
    }
  }, [isVisible, isCustomer, user?.customer_id])

  useEffect(() => {
    if (isVisible) {
      setIsEditing(false)
      setActiveTab('profile')
      setShowDisplayQrModal(false)
      setVerificationModalOpen(false)
      setVerificationDetailsOpen(false)
      setVerificationError('')
      setPinForm({ current_pin: '', new_pin: '', confirm_pin: '' })
      setPinError('')
      setPinSuccess('')
      loadProfile(false)
    }
  }, [isVisible, loadProfile])

  useRealtimeSync((_source, signal) => {
    if (!isVisible || isEditing) return
    loadProfile(true, signal)
    if ((activeTab === 'attendance_log' || activeTab === 'timesheet_summary') && !isCustomer) {
      api.employees.getMeAttendance({ signal })
        .then(res => {
          if (signal?.aborted) return
          const list = res.attendance || res.records || []
          setMyAttendance(prev => (fastDeepEqual(prev, list) ? prev : list))
          if (res.stats) {
            setAttendanceStats(prev => (fastDeepEqual(prev, res.stats) ? prev : res.stats))
          }
        })
        .catch(() => { })
    } else if (activeTab === 'payslips' && !isCustomer) {
      api.payroll.getMePayroll({}, { signal })
        .then(res => {
          if (signal?.aborted) return
          const list = res.payroll || []
          setMyPayrolls(prev => (fastDeepEqual(prev, list) ? prev : list))
        })
        .catch(() => { })
    }
  }, [isVisible, isEditing, activeTab, isCustomer, loadProfile], { module: 'profile', enabled: isVisible })

  const handleConfirmVerify = async () => {
    setVerificationLoading(true)
    setVerificationError('')
    try {
      const res = await api.employees.verifyAccount()
      if (res?.success || res?.verified) {
        showToast(res.message || 'Employee account successfully verified.', 'success')
        const verifiedTime = res.verified_at || res.account_verified_at || new Date().toISOString()
        setEmployee(prev => ({
          ...prev,
          ...(res.employee || {}),
          account_verified: true,
          account_verified_at: verifiedTime,
          information_verified: true,
          information_verified_at: verifiedTime,
          is_verified: true,
          verified_at: verifiedTime,
        }))
        setVerificationModalOpen(false)
        triggerDataSync('profile')
      } else {
        setVerificationError(res?.message || 'Verification failed. Please contact administrator.')
      }
    } catch (err) {
      console.error('Verification error:', err)
      if (err.status === 422 && err.message?.includes('not linked')) {
        setVerificationError('This user account is not linked to an employee record. Please contact the administrator.')
      } else if (err.status === 404) {
        setVerificationError('The employee information associated with this account could not be found.')
      } else {
        setVerificationError(err.message || 'Failed to verify account. Please try again.')
      }
    } finally {
      setVerificationLoading(false)
    }
  }

  const handleSaveEdit = async (e) => {
    e?.preventDefault()
    if (editForm.phone && editForm.phone.length !== 11) {
      showToast('Contact phone must be exactly 11 digits (e.g. 09123456789)', 'error')
      return
    }
    if (!isCustomer && !isAdmin) {
      if (editForm.pay_type === 'E-Wallet') {
        if (!editForm.ewallet_provider || !editForm.ewallet_account_name || !editForm.ewallet_account_no) {
          showToast('Please enter your E-Wallet Provider, Account Name, and Account/Mobile Number.', 'error')
          return
        }
      } else if (editForm.pay_type === 'Online Bank') {
        if (!editForm.bank_name || !editForm.bank_account_name || !editForm.bank_account_no) {
          showToast('Please enter your Bank Name, Account Name, and Bank Account Number.', 'error')
          return
        }
      }
    }
    setSaving(true)
    try {
      let res;
      if (isCustomer && user?.customer_id) {
        res = await api.customers.update(user.customer_id, editForm)
        triggerDataSync('profile')
      } else {
        res = await api.employees.updateMe(editForm)
        triggerDataSync('profile')
      }
      showToast(res.message || 'Profile details updated successfully.', 'success')
      setEmployee(prev => ({
        ...prev,
        ...(res.employee || {}),
        ...editForm,
      }))
      setIsEditing(false)
    } catch (err) {
      showToast(err.message || 'Failed to update profile', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleChangePin = async (e) => {
    e.preventDefault()
    setPinError('')
    setPinSuccess('')

    if (employee?.has_pin && !pinForm.current_pin) {
      setPinError('Current PIN is required.')
      return
    }
    if (!pinForm.new_pin || pinForm.new_pin.length < 4 || pinForm.new_pin.length > 6 || !/^\d+$/.test(pinForm.new_pin)) {
      setPinError('New PIN must be 4 to 6 numeric digits.')
      return
    }
    if (pinForm.new_pin !== pinForm.confirm_pin) {
      setPinError('New PINs do not match.')
      return
    }

    setPinLoading(true)
    try {
      const res = await api.employees.updateMyPin({
        current_pin: pinForm.current_pin,
        new_pin: pinForm.new_pin,
      })
      if (res.success) {
        setPinSuccess(res.message || 'PIN updated successfully.')
        setPinForm({ current_pin: '', new_pin: '', confirm_pin: '' })
        triggerDataSync('profile')
        showToast('Security PIN updated successfully.', 'success')
      } else {
        setPinError(res.message || 'Failed to update PIN.')
      }
    } catch (err) {
      console.error('Update PIN error:', err)
      setPinError(err.message || 'An error occurred while updating your PIN.')
    } finally {
      setPinLoading(false)
    }
  }

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      showToast('Please select a valid image file', 'error')
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      showToast('Image size should be less than 5MB', 'error')
      return
    }

    setIsUploadingImage(true)
    const formData = new FormData()
    formData.append('image', file)

    try {
      const res = await api.auth.uploadProfileImage(formData)
      showToast(res.message || 'Profile image updated', 'success')
      triggerDataSync('profile')
      await verifySession() // Refresh user payload with new image URL
    } catch (err) {
      showToast(err.message || 'Failed to upload image', 'error')
    } finally {
      setIsUploadingImage(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleSubmitQrRequest = async () => {
    setSubmittingRequest(true)
    try {
      const res = await api.qrRequests.create()
      if (res.success) {
        showToast(res.message || 'Your QR code request has been submitted to the Administrator.', 'success')
        setQrRequestModalOpen(false)
        triggerDataSync('qr_requests')
        loadProfile(true)
      } else {
        showToast(res.message || 'Failed to submit request', 'error')
      }
    } catch (err) {
      showToast(err.message || 'Failed to submit QR request', 'error')
    } finally {
      setSubmittingRequest(false)
    }
  }


  const isVerified = Boolean(
    employee?.account_verified ||
    employee?.information_verified ||
    employee?.is_verified
  )
  const verifiedTimestamp = employee?.account_verified_at || employee?.information_verified_at || employee?.verified_at
  const hasActiveQr = Boolean(employee?.qr_token && employee?.qr_active)

  const handleCancelEdit = () => {
    if (employee) {
      if (isCustomer) {
        setEditForm({
          customer_code: employee.customer_code || '',
          first_name: employee.first_name || '',
          middle_name: employee.middle_name || '',
          last_name: employee.last_name || '',
          status: employee.status || 'Active',
          notes: employee.notes || '',
          branch: employee.branch || '',
          phone: employee.phone || '',
          email: employee.email || '',
          address: employee.address || '',
        })
      } else {
        setEditForm({
          phone: employee.phone || '',
          email: employee.email || '',
          address: employee.address || '',
          gender: employee.gender || 'Male',
          birth_date: employee.birth_date || employee.date_of_birth || '',
          date_of_birth: employee.date_of_birth || employee.birth_date || '',
          marital_status: employee.marital_status || 'Single',
          pay_type: employee.pay_type || 'Cash',
          ewallet_provider: employee.ewallet_provider || 'Gcash',
          ewallet_account_no: employee.ewallet_account_no || employee.phone || '',
          bank_name: employee.bank_name || 'BDO',
          bank_account_no: employee.bank_account_no || '',
          emergency_contact_name: employee.emergency_contact_name || '',
          emergency_contact_relation: employee.emergency_contact_relation || '',
          emergency_contact_phone: employee.emergency_contact_phone || '',
          branch_id: employee.branch_id || employee.branch?.id || '',
        })
      }
    }
    setIsEditing(false)
  }

  const editActionButtons = isEditing ? (
    <>
      <Btn variant="outline" size="sm" onClick={handleCancelEdit} disabled={saving} icon={<FiX className="w-3.5 h-3.5" />}>
        Cancel
      </Btn>
      <Btn variant="primary" size="sm" onClick={handleSaveEdit} disabled={saving} icon={<FiSave className="w-3.5 h-3.5" />}>
        {saving ? 'Saving...' : 'Save Changes'}
      </Btn>
    </>
  ) : (
    activeTab === 'profile' && !isAdmin ? (
      <Btn variant="outline" size="sm" onClick={() => setIsEditing(true)} disabled={loading || !employee} icon={<FiEdit className="w-3.5 h-3.5" />}>
        Edit Profile
      </Btn>
    ) : null
  )

  const formatTimeDisplay = (val) => {
    if (!val || val === '—') return '—'
    if (/AM|PM/i.test(val)) return val
    const parsed = new Date(`2000-01-01T${val}`)
    return isNaN(parsed.getTime()) ? val : parsed.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  }

  const timesheetSummaryRows = useMemo(() => {
    const map = {}
    myAttendance.forEach(a => {
      const dateStr = String(a.attendance_date || '').slice(0, 10)
      const monthKey = dateStr.length >= 7 ? dateStr.slice(0, 7) : 'Unknown'
      if (!map[monthKey]) {
        let monthLabel = monthKey
        if (/^\d{4}-\d{2}$/.test(monthKey)) {
          const d = new Date(`${monthKey}-01T00:00:00`)
          if (!isNaN(d.getTime())) {
            monthLabel = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
          }
        }
        map[monthKey] = {
          monthKey,
          monthLabel,
          presentCount: 0,
          lateCount: 0,
          absentCount: 0,
          lateMinutes: 0,
          totalHours: 0,
          overtimeHours: 0,
        }
      }
      const row = map[monthKey]
      const st = String(a.status || '')
      if (st === 'Absent') row.absentCount += 1
      else if (st === 'Present' || st === 'Late' || st === 'COMPLETE') row.presentCount += 1
      if (st === 'Late') row.lateCount += 1
      row.lateMinutes += Number(a.late_minutes || 0)
      row.totalHours += Number(a.total_hours || 0)
      row.overtimeHours += Number(a.overtime_hours || 0)
    })
    return Object.values(map).sort((a, b) => b.monthKey.localeCompare(a.monthKey))
  }, [myAttendance])

  const computedTimesheetTotals = useMemo(() => {
    return timesheetSummaryRows.reduce((acc, r) => ({
      presentCount: acc.presentCount + r.presentCount,
      lateCount: acc.lateCount + r.lateCount,
      absentCount: acc.absentCount + r.absentCount,
      lateMinutes: acc.lateMinutes + r.lateMinutes,
      totalHours: acc.totalHours + r.totalHours,
      overtimeHours: acc.overtimeHours + r.overtimeHours,
    }), {
      presentCount: 0,
      lateCount: 0,
      absentCount: 0,
      lateMinutes: 0,
      totalHours: 0,
      overtimeHours: 0,
    })
  }, [timesheetSummaryRows])

  const handleOpenMyPayslip = async (p) => {
    try {
      const data = await api.payroll.getMePayslip(p.payroll_id || p.id)
      setSelectedPayslip(data.record)
    } catch (err) {
      showToast(err.message || 'Failed to fetch payslip details', 'error')
    }
  }

  const isEmployee = (user?.role || '').trim().toLowerCase() === 'employee'
  const isStoreAdminRole = user?.role === 'Store Administrator' || user?.role === 'Store Admin'
  const pageTitle = isStoreAdminRole
    ? 'Employee Profile'
    : 'My Profile'
  const branchLabel =
    employee?.branch?.name ||
    (typeof employee?.branch === 'string' && employee.branch) ||
    user?.employee?.branch?.name ||
    (typeof user?.employee?.branch === 'string' && user.employee.branch) ||
    user?.branch_name ||
    ''
  const subtitleText = isEmployee
    ? 'Manage your account information and face recognition settings'
    : isStoreAdminRole
      ? 'Manage your profile, attendance QR, attendance log, timesheet summary, payslips, excuse letters, and face recognition'
      : 'Manage your account information, attendance QR, attendance log, and face recognition'
  const pageSubtitle = branchLabel
    ? `${branchLabel} — ${subtitleText}`
    : subtitleText

  return (
    <div className="space-y-6">
      <PageHeader
        title={pageTitle}
        subtitle={pageSubtitle}
        action={editActionButtons ? <div className="flex items-center gap-2.5">{editActionButtons}</div> : null}
      />
      <Card noPad className="p-4 sm:p-6 border border-border space-y-5">
        {loading ? (
          <LoadingState message="Loading employee information..." />
        ) : error ? (
          <div className="space-y-4 py-4">
            <ErrorAlert message={error} onRetry={loadProfile} />
          </div>
        ) : !employee ? (
          <div className="text-center py-8 text-muted-foreground text-xs">
            Employee information was not found.
          </div>
        ) : (
          <div className="space-y-4 text-xs">
            {/* Tab Navigation for Employees Only */}
            {!isCustomer && (
              <TabBar
                tabs={[
                  { id: 'profile', label: 'My Profile Information', icon: <FiUser className="w-3.5 h-3.5" /> },
                  ...(isAdmin || isEmployee ? [] : [{ id: 'attendance_qr', label: 'Attendance QR', icon: <FiSmartphone className="w-3.5 h-3.5" /> }]),
                  ...(isStoreAdminRole ? [
                    { id: 'attendance_log', label: 'My Attendance Log', icon: <FiCalendar className="w-3.5 h-3.5" /> },
                    { id: 'timesheet_summary', label: 'My Timesheet Summary', icon: <FiBarChart2 className="w-3.5 h-3.5" /> },
                    { id: 'payslips', label: 'My Payslips', icon: <TbCurrencyPeso className="w-3.5 h-3.5" /> },
                    { id: 'excuse_letter', label: 'Create Excuse / Leave Letter', icon: <FiFileText className="w-3.5 h-3.5" /> },
                  ] : []),
                  ...(isAdmin || isCustomer ? [] : [{ id: 'security', label: 'Face Recognition', icon: <TbFaceId className="w-3.5 h-3.5" /> }]),
                ]}
                activeTab={activeTab}
                onChange={setActiveTab}
              />
            )}

            {/* TAB 1: PROFILE INFORMATION */}
            {activeTab === 'profile' && (() => {
              const fullDisplayName = `${employee.first_name || ''} ${employee.middle_name ? `${employee.middle_name} ` : ''}${employee.last_name || ''}`.trim() || user?.name || 'User'
              const codeSuffix = !isCustomer && employee.employee_code
                ? ` (${employee.employee_code})`
                : employee.customer_code
                  ? ` (${employee.customer_code})`
                  : ''
              const directoryName = `${(employee.last_name || '').toUpperCase()}${employee.last_name && employee.first_name ? ', ' : ''}${employee.first_name || ''}${employee.middle_name ? ` ${employee.middle_name}` : ''}`.trim() || fullDisplayName
              const resolvedBranch =
                branchesList.find(b => b.id == employee.branch_id)?.name ||
                employee.branch?.name ||
                (typeof employee.branch === 'string' && employee.branch) ||
                '—'
              const qrIsActive = hasActiveQr || employee.qr_status === 'ACTIVE'
              const qrIsRequested = employee.qr_status === 'REQUESTED'

              return (
              <div className="space-y-4">
                {/* Hero Profile Summary Card */}
                <div className="p-5 sm:p-7 rounded-2xl border border-border bg-slate-50/70 dark:bg-card/70 shadow-2xs">
                  <div className="mb-5">
                    <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                      {fullDisplayName}{codeSuffix}
                    </h2>
                    {(employee.email || user?.email || user?.username) && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {employee.email || user?.email || user?.username}
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-[184px_1fr_1fr] gap-6 items-start">
                    {/* Left Column: Square Rounded Photo */}
                    <div className="relative group w-44 h-44 sm:w-[184px] sm:h-[184px] rounded-2xl bg-primary/10 border border-border flex items-center justify-center text-primary overflow-hidden shadow-xs shrink-0">
                      {(employee?.profile_image || user?.profile_image) ? (
                        <img src={employee?.profile_image || user?.profile_image} alt={fullDisplayName} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-3xl font-bold tracking-wide">
                          {employee?.first_name?.[0]}{employee?.last_name?.[0]}
                        </span>
                      )}

                      <label className="absolute inset-0 bg-black/50 text-white flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity">
                        {isUploadingImage ? (
                          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                          <>
                            <FiCamera className="w-6 h-6 mb-1" />
                            <span className="text-[10px] font-bold uppercase tracking-wider">Change Photo</span>
                          </>
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          ref={fileInputRef}
                          onChange={handleImageUpload}
                          disabled={isUploadingImage}
                        />
                      </label>
                    </div>

                    {/* Middle Column: Identity Details */}
                    <div className="space-y-4">
                      <div>
                        <div className="text-[11px] font-medium text-muted-foreground">Name</div>
                        <div className="text-sm font-medium text-foreground mt-0.5">{directoryName}</div>
                      </div>
                      <div>
                        <div className="text-[11px] font-medium text-muted-foreground">
                          {isCustomer ? 'Customer Code' : isStoreAdminRole ? 'Store Admin ID' : 'Employee ID'}
                        </div>
                        <div className="text-sm font-medium text-foreground mt-0.5 font-mono">
                          {isCustomer ? (employee.customer_code || '—') : (employee.employee_code || '—')}
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] font-medium text-muted-foreground">Branch</div>
                        <div className="text-sm font-medium text-foreground mt-0.5">{resolvedBranch}</div>
                      </div>
                      <div>
                        <div className="text-[11px] font-medium text-muted-foreground">
                          {isCustomer ? 'Account status' : 'Position'}
                        </div>
                        <div className="text-sm font-medium text-foreground mt-0.5">
                          {isCustomer ? (employee.status || 'Active') : (employee.position || user?.role || '—')}
                        </div>
                      </div>
                    </div>

                    {/* Right Column: Role, Status Pills & Progress */}
                    <div className="space-y-4">
                      <div>
                        <div className="text-[11px] font-medium text-muted-foreground">
                          {isCustomer ? 'Contact phone' : 'Department'}
                        </div>
                        <div className="text-sm font-medium text-foreground mt-0.5">
                          {isCustomer ? (employee.phone || '—') : (employee.department || 'Store Administration')}
                        </div>
                      </div>

                      {!isCustomer && !isAdmin && (
                        <>
                          <div>
                            <div className="text-[11px] font-medium text-muted-foreground">Account verification</div>
                            <div className="flex items-center gap-2.5 flex-wrap mt-1">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold ${
                                isVerified
                                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                                  : 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'
                              }`}>
                                {isVerified ? 'Verified' : 'Pending'}
                              </span>
                              {isVerified ? (
                                <button
                                  type="button"
                                  onClick={() => setVerificationDetailsOpen(true)}
                                  className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                                >
                                  <span>Verification details</span>
                                  <FiArrowUpRight className="w-3.5 h-3.5" />
                                </button>
                              ) : (
                                <span className="text-xs text-muted-foreground">Pending administrator review</span>
                              )}
                            </div>
                          </div>

                          {!isEmployee && (
                            <div>
                              <div className="text-[11px] font-medium text-muted-foreground">Attendance QR status</div>
                              <div className="flex items-center gap-2.5 flex-wrap mt-1">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold ${
                                  qrIsActive
                                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                                    : qrIsRequested
                                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300'
                                      : 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300'
                                }`}>
                                  {qrIsActive ? 'Active' : qrIsRequested ? 'Requested' : (employee.qr_status === 'REVOKED' ? 'Revoked' : 'Not Issued')}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => qrIsActive ? setShowDisplayQrModal(true) : setActiveTab('attendance_qr')}
                                  className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                                >
                                  <span>{qrIsActive ? 'Display QR' : 'Manage QR'}</span>
                                  <FiArrowUpRight className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Form & Profile Sections */}
                <div className="grid grid-cols-1 gap-4">
                  {/* Personal Information */}
                  <div className="p-4 bg-card rounded-2xl border border-border space-y-3">
                    <h4 className="font-bold uppercase tracking-wider text-muted-foreground text-[11px] flex items-center gap-1.5 border-b border-border pb-2">
                      <FiUser className="w-3.5 h-3.5 text-primary" />
                      <span>Personal Information</span>
                    </h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-0.5">Gender</div>
                        {isEditing && !isCustomer ? (
                          <div className="relative">
                            <select
                              value={editForm.gender || ''}
                              onChange={e => setEditForm(p => ({ ...p, gender: e.target.value }))}
                              className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground text-sm font-medium focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all appearance-none cursor-pointer"
                            >
                              <option value="">Select...</option>
                              <option value="Male">Male</option>
                              <option value="Female">Female</option>
                              <option value="Other">Other</option>
                            </select>
                            <FiChevronDown className="w-3.5 h-3.5 text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                          </div>
                        ) : (
                          <div className="font-semibold text-foreground">{employee.gender || '—'}</div>
                        )}
                      </div>
                      <div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-0.5">Birthdate</div>
                        {isEditing && !isCustomer ? (
                          <input
                            type="date"
                            max={new Date().toISOString().split('T')[0]}
                            value={editForm.birth_date || editForm.date_of_birth ? new Date(editForm.birth_date || editForm.date_of_birth).toISOString().split('T')[0] : ''}
                            onChange={e => setEditForm(p => ({ ...p, birth_date: e.target.value, date_of_birth: e.target.value }))}
                            className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground text-sm font-medium focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all cursor-pointer"
                          />
                        ) : (
                          <div className="font-semibold text-foreground">{employee.birth_date || employee.date_of_birth ? fmtDate(employee.birth_date || employee.date_of_birth).split(',')[0] : '—'}</div>
                        )}
                      </div>
                      {!isCustomer && (
                        <>
                          <div>
                            <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-0.5">Marital Status</div>
                            {isEditing ? (
                              <div className="relative">
                                <select
                                  value={editForm.marital_status || ''}
                                  onChange={e => setEditForm(p => ({ ...p, marital_status: e.target.value }))}
                                  className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground text-sm font-medium focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all appearance-none cursor-pointer"
                                >
                                  <option value="">Select...</option>
                                  <option value="Single">Single</option>
                                  <option value="Married">Married</option>
                                  <option value="Divorced">Divorced</option>
                                  <option value="Widowed">Widowed</option>
                                </select>
                                <FiChevronDown className="w-3.5 h-3.5 text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                              </div>
                            ) : (
                              <div className="font-semibold text-foreground">{employee.marital_status || '—'}</div>
                            )}
                          </div>
                          <div>
                            <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-0.5">Position</div>
                            <div className="font-semibold text-foreground">{employee.position || '—'}</div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Employment Information */}
                  {!isCustomer && (
                    <div className="p-4 bg-card rounded-2xl border border-border space-y-3">
                      <h4 className="font-bold uppercase tracking-wider text-muted-foreground text-[11px] flex items-center gap-1.5 border-b border-border pb-2">
                        <FiActivity className="w-3.5 h-3.5 text-primary" />
                        <span>Employment Information</span>
                      </h4>
                      {isAdmin ? (
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-0.5">Employee ID</div>
                            <div className="font-bold text-foreground font-mono">{employee.employee_code || '—'}</div>
                          </div>
                          <div>
                            <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-0.5">Department</div>
                            <div className="font-semibold text-foreground">{employee.department || 'Administration'}</div>
                          </div>
                          <div>
                            <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-0.5">Position</div>
                            <div className="font-semibold text-foreground">{employee.position || 'System Administrator'}</div>
                          </div>
                          <div>
                            <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-0.5">Working Hours</div>
                            <div className="font-semibold text-foreground">{employee.working_hours || '8 AM to 5 PM'}</div>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-0.5">Employee ID</div>
                            <div className="font-bold text-foreground font-mono">{employee.employee_code || '—'}</div>
                          </div>
                          <div>
                            <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-0.5">Branch</div>
                            <div className="font-semibold text-foreground">{branchesList.find(b => b.id == employee.branch_id)?.name || employee.branch?.name || '—'}</div>
                          </div>
                          <div>
                            <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-0.5">Department</div>
                            <div className="font-semibold text-foreground">{employee.department || '—'}</div>
                          </div>
                          <div>
                            <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-0.5">Working Hours</div>
                            <div className="font-semibold text-foreground">{employee.working_hours || '—'}</div>
                          </div>
                          <div>
                            <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-0.5">Position</div>
                            <div className="font-semibold text-foreground">{employee.position || '—'}</div>
                          </div>
                          <div>
                            <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-0.5">Salary</div>
                            <div className="font-semibold text-foreground font-mono">{employee.basic_salary ? fmt(employee.basic_salary) : '—'}</div>
                          </div>
                          <div className="col-span-2">
                            <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-0.5">Preferred Payout Method</div>
                            <div className="font-semibold text-foreground">{employee.pay_type || 'Cash'}</div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Employee Payroll Payout Preferences */}
                  {!isCustomer && !isAdmin && (
                    <div className="p-4 bg-card rounded-2xl border border-border space-y-3.5">
                      <div className="flex items-center justify-between border-b border-border pb-2">
                        <h4 className="font-bold uppercase tracking-wider text-muted-foreground text-[11px] flex items-center gap-1.5">
                          <FiCreditCard className="w-3.5 h-3.5 text-primary" />
                          <span>Payroll Payout Preference</span>
                        </h4>
                        {!isEditing && (
                          <button
                            type="button"
                            onClick={() => setIsEditing(true)}
                            className="text-[11px] font-bold text-primary hover:underline cursor-pointer flex items-center gap-1"
                          >
                            <FiEdit className="w-3 h-3" /> Change Payout Method
                          </button>
                        )}
                      </div>

                      {isEditing ? (
                        <div className="space-y-4">
                          <div>
                            <label className="block text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
                              Select Preferred Payout Method *
                            </label>
                            <div className="grid grid-cols-3 gap-2.5">
                              {['Cash', 'E-Wallet', 'Online Bank'].map((method) => {
                                const isSelected = (editForm.pay_type || 'Cash') === method
                                return (
                                  <button
                                    key={method}
                                    type="button"
                                    onClick={() => setEditForm(p => ({ ...p, pay_type: method }))}
                                    className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                                      isSelected
                                        ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                                        : 'bg-muted/30 text-foreground border-border hover:bg-muted'
                                    }`}
                                  >
                                    {method === 'Cash' && <TbCurrencyPeso className="w-4 h-4" />}
                                    {method === 'E-Wallet' && <FiSmartphone className="w-3.5 h-3.5" />}
                                    {method === 'Online Bank' && <FiCreditCard className="w-3.5 h-3.5" />}
                                    <span>{method}</span>
                                  </button>
                                )
                              })}
                            </div>
                          </div>

                          {editForm.pay_type === 'E-Wallet' && (
                            <div className="p-3.5 rounded-xl bg-blue-500/5 border border-blue-500/20 space-y-3">
                              <div className="flex items-center justify-between flex-wrap gap-2">
                                <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                                  E-Wallet Account Details
                                </span>
                                <div className="flex items-center gap-1.5">
                                  {['GCash', 'Maya', 'GrabPay', 'ShopeePay'].map(prov => (
                                    <button
                                      key={prov}
                                      type="button"
                                      onClick={() => setEditForm(p => ({ ...p, ewallet_provider: prov }))}
                                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold border cursor-pointer transition ${
                                        (editForm.ewallet_provider || '') === prov
                                          ? 'bg-blue-600 text-white border-blue-600'
                                          : 'bg-card text-muted-foreground border-border hover:text-foreground'
                                      }`}
                                    >
                                      {prov}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div>
                                  <label className="block text-[10px] font-bold text-muted-foreground uppercase mb-1">Provider Name *</label>
                                  <input
                                    type="text"
                                    value={editForm.ewallet_provider || ''}
                                    onChange={e => setEditForm(p => ({ ...p, ewallet_provider: e.target.value }))}
                                    placeholder="e.g. GCash, Maya"
                                    className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground text-xs font-semibold focus:ring-2 focus:ring-primary outline-none"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[10px] font-bold text-muted-foreground uppercase mb-1">Account Name *</label>
                                  <input
                                    type="text"
                                    value={editForm.ewallet_account_name || ''}
                                    onChange={e => setEditForm(p => ({ ...p, ewallet_account_name: e.target.value }))}
                                    placeholder="Full Registered Name"
                                    className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground text-xs font-semibold focus:ring-2 focus:ring-primary outline-none"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[10px] font-bold text-muted-foreground uppercase mb-1">Account / Mobile No. *</label>
                                  <input
                                    type="text"
                                    value={editForm.ewallet_account_no || ''}
                                    onChange={e => setEditForm(p => ({ ...p, ewallet_account_no: e.target.value }))}
                                    placeholder="09XXXXXXXXX"
                                    className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground text-xs font-mono font-semibold focus:ring-2 focus:ring-primary outline-none"
                                  />
                                </div>
                              </div>
                            </div>
                          )}

                          {editForm.pay_type === 'Online Bank' && (
                            <div className="p-3.5 rounded-xl bg-indigo-500/5 border border-indigo-500/20 space-y-3">
                              <div className="flex items-center justify-between flex-wrap gap-2">
                                <span className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                                  Online Bank Account Details
                                </span>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {['BDO', 'BPI', 'UnionBank', 'Metrobank', 'Landbank'].map(bnk => (
                                    <button
                                      key={bnk}
                                      type="button"
                                      onClick={() => setEditForm(p => ({ ...p, bank_name: bnk }))}
                                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold border cursor-pointer transition ${
                                        (editForm.bank_name || '') === bnk
                                          ? 'bg-indigo-600 text-white border-indigo-600'
                                          : 'bg-card text-muted-foreground border-border hover:text-foreground'
                                      }`}
                                    >
                                      {bnk}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div>
                                  <label className="block text-[10px] font-bold text-muted-foreground uppercase mb-1">Bank Name *</label>
                                  <input
                                    type="text"
                                    value={editForm.bank_name || ''}
                                    onChange={e => setEditForm(p => ({ ...p, bank_name: e.target.value }))}
                                    placeholder="e.g. BDO, BPI, UnionBank"
                                    className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground text-xs font-semibold focus:ring-2 focus:ring-primary outline-none"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[10px] font-bold text-muted-foreground uppercase mb-1">Account Name *</label>
                                  <input
                                    type="text"
                                    value={editForm.bank_account_name || ''}
                                    onChange={e => setEditForm(p => ({ ...p, bank_account_name: e.target.value }))}
                                    placeholder="Account Holder Name"
                                    className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground text-xs font-semibold focus:ring-2 focus:ring-primary outline-none"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[10px] font-bold text-muted-foreground uppercase mb-1">Account Number *</label>
                                  <input
                                    type="text"
                                    value={editForm.bank_account_no || ''}
                                    onChange={e => setEditForm(p => ({ ...p, bank_account_no: e.target.value }))}
                                    placeholder="Account Number"
                                    className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground text-xs font-mono font-semibold focus:ring-2 focus:ring-primary outline-none"
                                  />
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-2.5">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">Preferred Payout Method</span>
                            <Badge
                              text={employee.pay_type || 'Cash'}
                              color={
                                ['E-Wallet', 'Ewallet', 'GCash', 'PayMaya'].includes(employee.pay_type)
                                  ? 'blue'
                                  : ['Online Bank', 'Bank', 'Bank Transfer'].includes(employee.pay_type)
                                  ? 'indigo'
                                  : 'green'
                              }
                            />
                          </div>
                          {['E-Wallet', 'Ewallet', 'GCash', 'PayMaya'].includes(employee.pay_type) && (
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-border/60 text-xs">
                              <div>
                                <div className="text-[10px] text-muted-foreground uppercase font-bold">Provider</div>
                                <div className="font-bold text-foreground">{employee.ewallet_provider || 'GCash'}</div>
                              </div>
                              <div>
                                <div className="text-[10px] text-muted-foreground uppercase font-bold">Account Name</div>
                                <div className="font-semibold text-foreground">{employee.ewallet_account_name || `${employee.first_name || ''} ${employee.last_name || ''}`}</div>
                              </div>
                              <div>
                                <div className="text-[10px] text-muted-foreground uppercase font-bold">Account / Mobile No.</div>
                                <div className="font-mono font-bold text-primary">{employee.ewallet_account_no || employee.phone || '—'}</div>
                              </div>
                            </div>
                          )}
                          {['Online Bank', 'Bank', 'Bank Transfer'].includes(employee.pay_type) && (
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-border/60 text-xs">
                              <div>
                                <div className="text-[10px] text-muted-foreground uppercase font-bold">Bank Name</div>
                                <div className="font-bold text-foreground">{employee.bank_name || '—'}</div>
                              </div>
                              <div>
                                <div className="text-[10px] text-muted-foreground uppercase font-bold">Account Name</div>
                                <div className="font-semibold text-foreground">{employee.bank_account_name || `${employee.first_name || ''} ${employee.last_name || ''}`}</div>
                              </div>
                              <div>
                                <div className="text-[10px] text-muted-foreground uppercase font-bold">Account Number</div>
                                <div className="font-mono font-bold text-primary">{employee.bank_account_no || '—'}</div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Contact Details (Editable) */}
                <div className="p-4 bg-card rounded-2xl border border-border space-y-4">
                  <h4 className="font-bold uppercase tracking-wider text-muted-foreground text-[11px] flex items-center gap-1.5 border-b border-border pb-2">
                    <FiPhone className="w-3.5 h-3.5 text-primary" />
                    <span>Contact Information</span>
                  </h4>

                  {isEditing ? (
                    <div className="space-y-4">
                      {/* Row 0: Name (Customer Only) */}
                      {isCustomer && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-[11px] font-bold text-muted-foreground mb-1.5">First Name *</label>
                            <input
                              type="text"
                              required
                              value={editForm.first_name || ''}
                              onChange={e => setEditForm(p => ({ ...p, first_name: e.target.value }))}
                              className="w-full px-3 py-2.5 rounded-xl border border-border bg-black/5  text-foreground text-sm font-medium focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-bold text-muted-foreground mb-1.5">Last Name *</label>
                            <input
                              type="text"
                              required
                              value={editForm.last_name || ''}
                              onChange={e => setEditForm(p => ({ ...p, last_name: e.target.value }))}
                              className="w-full px-3 py-2.5 rounded-xl border border-border bg-black/5  text-foreground text-sm font-medium focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
                            />
                          </div>
                        </div>
                      )}

                      {/* Row 1: Contact & Email */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[11px] font-bold text-muted-foreground mb-1.5">Contact Phone (11 digits)</label>
                          <input
                            type="tel"
                            maxLength={11}
                            value={editForm.phone}
                            onChange={e => setEditForm(p => ({ ...p, phone: e.target.value.replace(/\D/g, '').slice(0, 11) }))}
                            placeholder="09XXXXXXXXX"
                            className="w-full px-3 py-2.5 rounded-xl border border-border bg-black/5 text-foreground text-sm font-medium font-mono focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-muted-foreground mb-1.5">Email Address</label>
                          <input
                            type="email"
                            value={editForm.email}
                            onChange={e => setEditForm(p => ({ ...p, email: e.target.value }))}
                            className="w-full px-3 py-2.5 rounded-xl border border-border bg-black/5  text-foreground text-sm font-medium focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
                          />
                        </div>
                      </div>

                      {/* Row 2: Address and Branch */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[11px] font-bold text-muted-foreground mb-1.5">Home Address</label>
                          <input
                            type="text"
                            value={editForm.address}
                            onChange={e => setEditForm(p => ({ ...p, address: e.target.value }))}
                            className="w-full px-3 py-2.5 rounded-xl border border-border bg-black/5  text-foreground text-sm font-medium focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
                          />
                        </div>
                        {!isAdmin && (
                          <div>
                            <label className="block text-[11px] font-bold text-muted-foreground mb-1.5">Branch</label>
                            <div className="relative">
                              <select
                                name="branch_id"
                                value={editForm.branch_id || ''}
                                onChange={e => setEditForm(p => ({ ...p, branch_id: e.target.value }))}
                                className="w-full px-3 py-2.5 rounded-xl border border-border bg-black/5 text-foreground text-sm font-medium focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all appearance-none"
                              >
                                <option value="">Select a Branch...</option>
                                {branchesList.map(branch => (
                                  <option key={branch.id} value={branch.id}>{branch.name}</option>
                                ))}
                              </select>
                              <FiChevronDown className="w-3.5 h-3.5 text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Row 1: Contact & Email */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <div className="text-[11px] font-bold text-muted-foreground mb-1.5">Contact Phone</div>
                          <div className="w-full px-3 py-2.5 rounded-xl border border-border bg-black/5  text-foreground text-sm font-medium">
                            {employee.phone || '—'}
                          </div>
                        </div>
                        <div>
                          <div className="text-[11px] font-bold text-muted-foreground mb-1.5">Email Address</div>
                          <div className="w-full px-3 py-2.5 rounded-xl border border-border bg-black/5  text-foreground text-sm font-medium">
                            {employee.email || '—'}
                          </div>
                        </div>
                      </div>

                      {/* Row 2: Address and Branch */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <div className="text-[11px] font-bold text-muted-foreground mb-1.5">Home Address</div>
                          <div className="w-full px-3 py-2.5 rounded-xl border border-border bg-black/5  text-foreground text-sm font-medium">
                            {employee.address || '—'}
                          </div>
                        </div>
                        {!isAdmin && (
                          <div>
                            <div className="text-[11px] font-bold text-muted-foreground mb-1.5">Branch</div>
                            <div className="w-full px-3 py-2.5 rounded-xl border border-border bg-black/5 text-foreground text-sm font-medium flex justify-between items-center overflow-hidden">
                              <span className="truncate pr-2">{branchesList.find(b => b.id == employee.branch_id)?.name || employee.branch?.name || '—'}</span>
                              <FiChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              )
            })()}

            {/* TAB 2: ATTENDANCE QR (STORE ADMIN VIEW - SECTIONS 4 & 5) */}
            {activeTab === 'attendance_qr' && !isEmployee && (
              <div className="space-y-4 py-2">
                {hasActiveQr || employee.qr_status === 'ACTIVE' ? (
                  /* STATE 5: ACTIVE */
                  <div className="space-y-4 text-center">
                    {/* Active Ready Banner */}
                    <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-center space-y-1.5">
                      <div>
                        <span className="inline-flex items-center gap-1 text-[11px] font-mono font-bold px-3 py-0.5 rounded-full bg-blue-500/20 text-blue-500 border border-blue-500/30">
                          <FiCheckCircle className="w-3.5 h-3.5" /> QR Status: ACTIVE
                        </span>
                      </div>
                      <h3 className="text-base font-bold text-blue-600 dark:text-blue-400">Attendance QR Code Ready</h3>
                      <p className="text-xs text-muted-foreground">
                        Your account has been verified and your permanent QR code has been issued by the Administrator.
                      </p>
                    </div>

                    {/* Official Company ID QR Badge */}
                    <div className="pt-2">
                      <PermanentAttendanceBadge
                        employee={employee}
                        user={user}
                        branchName={branchesList.find(b => b.id == employee.branch_id)?.name || branchLabel}
                        qrSize={170}
                      />
                    </div>

                    {/* Display My QR Button */}
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => setShowDisplayQrModal(true)}
                        className="px-6 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs shadow-md transition flex items-center gap-2 mx-auto cursor-pointer"
                      >
                        <FiSmartphone className="w-4 h-4" />
                        <span>Display My QR</span>
                      </button>
                    </div>
                  </div>
                ) : employee.qr_status === 'REQUESTED' ? (
                  /* STATE 2: REQUESTED */
                  <div className="p-8 text-center space-y-4 rounded-2xl bg-card border border-border shadow-sm">
                    <div className="w-14 h-14 rounded-2xl bg-blue-500/10 text-blue-500 border border-blue-500/20 flex items-center justify-center mx-auto text-2xl">
                      <FiClock />
                    </div>
                    <div>
                      <span className="inline-flex items-center gap-1.5 text-[10px] font-mono font-bold px-3 py-1 rounded-full bg-blue-500/10 text-blue-500 border border-blue-500/30">
                        <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping" />
                        QR Status: REQUESTED
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-foreground">QR Request Submitted</h3>
                    <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
                      {user?.role === 'Store Administrator' || user?.role === 'Store Admin'
                        ? "Your QR code request has been submitted to the Administrator and is waiting for account verification."
                        : "Your QR code request has been submitted to the Administrator. Your account is currently waiting for verification."}
                    </p>
                    <div className="pt-2">
                      <Btn variant="outline" size="sm" disabled className="opacity-70 cursor-not-allowed mx-auto" icon={<FiCheckCircle />}>
                        Request Submitted
                      </Btn>
                    </div>
                  </div>
                ) : employee.qr_status === 'UNDER_REVIEW' ? (
                  /* STATE 3: UNDER REVIEW */
                  <div className="p-8 text-center space-y-4 rounded-2xl bg-card border border-border shadow-sm">
                    <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 flex items-center justify-center mx-auto text-2xl">
                      <FiShield />
                    </div>
                    <div>
                      <span className="inline-flex items-center gap-1.5 text-[10px] font-mono font-bold px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-500 border border-indigo-500/30">
                        <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                        QR Status: UNDER REVIEW
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-foreground">Account Verification in Progress</h3>
                    <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
                      An Administrator is currently verifying your account information.
                    </p>
                  </div>
                ) : employee.qr_status === 'REJECTED' ? (
                  /* STATE 4: REJECTED */
                  <div className="p-8 text-center space-y-4 rounded-2xl bg-card border border-rose-500/30 shadow-sm">
                    <div className="w-14 h-14 rounded-2xl bg-rose-500/10 text-rose-500 border border-rose-500/20 flex items-center justify-center mx-auto text-2xl">
                      <FiXCircle />
                    </div>
                    <div>
                      <span className="inline-flex items-center text-[10px] font-mono font-bold px-3 py-1 rounded-full bg-rose-500/10 text-rose-500 border border-rose-500/30">
                        QR Status: REJECTED
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-rose-600 dark:text-rose-400">QR Request Rejected</h3>
                    {employee.qr_rejection_reason && (
                      <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-500 font-medium max-w-md mx-auto">
                        <span className="font-bold block text-[10px] uppercase">Reason:</span>
                        {employee.qr_rejection_reason}
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
                      Please contact the Administrator or verify your details and request again.
                    </p>
                    <div className="pt-2">
                      <Btn variant="primary" size="sm" onClick={() => setQrRequestModalOpen(true)} icon={<FiSmartphone />}>
                        Request Again
                      </Btn>
                    </div>
                  </div>
                ) : (
                  /* STATE 1: NOT GENERATED */
                  <div className="p-8 text-center space-y-4 rounded-2xl bg-muted/20 border border-border">
                    <div className="w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-500 border border-amber-500/20 flex items-center justify-center mx-auto text-2xl">
                      <FiSmartphone />
                    </div>
                    <div>
                      <span className="inline-flex items-center text-[10px] font-mono font-bold px-3 py-1 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/30">
                        QR Status: NOT GENERATED
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-foreground">Attendance QR Code Not Yet Issued</h3>
                    <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
                      "Your permanent QR code has not been generated by an Administrator yet."
                    </p>
                    <div className="pt-2">
                      <Btn variant="primary" size="sm" onClick={() => setQrRequestModalOpen(true)} icon={<FiSmartphone />}>
                        Request QR Code
                      </Btn>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: ATTENDANCE LOG (STORE ADMIN ONLY) */}
            {activeTab === 'attendance_log' && (
              <div className="space-y-4">
                <div className="p-4 bg-card rounded-2xl border border-border">
                  <h4 className="font-bold text-sm text-foreground mb-4">My Attendance Log</h4>

                  {loadingAttendance ? (
                    <div className="py-8 text-center text-muted-foreground text-xs animate-pulse">Loading attendance records...</div>
                  ) : myAttendance.length === 0 ? (
                    <div className="py-8 text-center text-muted-foreground text-xs">No attendance records found.</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs whitespace-nowrap">
                        <thead>
                          <tr className="border-b border-border text-muted-foreground">
                            <th className="py-2 pr-4 font-semibold">Date</th>
                            <th className="py-2 px-4 font-semibold">Time In</th>
                            <th className="py-2 px-4 font-semibold">Time Out</th>
                            <th className="py-2 px-4 font-semibold">Status</th>
                            <th className="py-2 pl-4 font-semibold">Hours</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {myAttendance.map((record, index) => (
                            <tr key={record.attendance_id || record.id || index} className="hover:bg-muted/30">
                              <td className="py-2 pr-4 font-mono">{record.attendance_date}</td>
                              <td className="py-2 px-4">{formatTimeDisplay(record.time_in)}</td>
                              <td className="py-2 px-4">{formatTimeDisplay(record.time_out)}</td>
                              <td className="py-2 px-4">
                                <Badge text={record.status || 'Present'} variant={record.status === 'Absent' ? 'danger' : record.status === 'Late' ? 'warning' : 'success'} />
                              </td>
                              <td className="py-2 pl-4 font-semibold">{record.total_hours ? `${Number(record.total_hours).toFixed(1)}h` : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 4: MY TIMESHEET SUMMARY (STORE ADMIN ONLY) */}
            {activeTab === 'timesheet_summary' && isStoreAdminRole && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <StatCard
                    title="Days Present"
                    value={String(attendanceStats?.present_count ?? computedTimesheetTotals.presentCount)}
                    sub={`${computedTimesheetTotals.absentCount} absent day(s)`}
                    icon={<FiCheckCircle className="w-5 h-5 text-emerald-500" />}
                    color="green"
                  />
                  <StatCard
                    title="Late Incidents"
                    value={String(attendanceStats?.late_count ?? computedTimesheetTotals.lateCount)}
                    sub={`${computedTimesheetTotals.lateMinutes} total late mins`}
                    icon={<FiAlertTriangle className="w-5 h-5 text-amber-500" />}
                    color="amber"
                  />
                  <StatCard
                    title="Total Shift Hours"
                    value={`${Number(attendanceStats?.total_hours ?? computedTimesheetTotals.totalHours).toFixed(1)}h`}
                    sub="recorded duty hours"
                    icon={<FiClock className="w-5 h-5 text-blue-500" />}
                    color="blue"
                  />
                  <StatCard
                    title="Total Overtime"
                    value={`${Number(attendanceStats?.overtime_hours ?? computedTimesheetTotals.overtimeHours).toFixed(1)}h`}
                    sub="logged overtime hours"
                    icon={<FiBarChart2 className="w-5 h-5 text-purple-500" />}
                    color="purple"
                  />
                </div>

                <div className="p-4 bg-card rounded-2xl border border-border">
                  <div className="flex items-center justify-between gap-2 mb-4">
                    <div>
                      <h4 className="font-bold text-sm text-foreground">My Timesheet Summary</h4>
                      <p className="text-[11px] text-muted-foreground">Monthly attendance summary for your Store Administrator profile</p>
                    </div>
                  </div>

                  {loadingAttendance ? (
                    <TableSkeleton rows={4} cols={7} />
                  ) : timesheetSummaryRows.length === 0 ? (
                    <EmptyState
                      icon={<FiBarChart2 className="w-10 h-10 text-muted-foreground/30 mx-auto" />}
                      title="No timesheet summary data"
                      description="Your timesheet metrics will appear here once attendance punches are recorded."
                    />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs min-w-[680px]">
                        <thead>
                          <tr className="border-b border-border bg-muted/50 text-muted-foreground uppercase font-semibold text-[11px]">
                            <th className="py-3 px-4 text-left">Month / Period</th>
                            <th className="py-3 px-4 text-right">Days Present</th>
                            <th className="py-3 px-4 text-right">Late Incidents</th>
                            <th className="py-3 px-4 text-right">Absences</th>
                            <th className="py-3 px-4 text-right">Late Minutes</th>
                            <th className="py-3 px-4 text-right">Total Shift Hrs</th>
                            <th className="py-3 px-4 text-right">Total Overtime</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {timesheetSummaryRows.map((ts, idx) => (
                            <tr key={ts.monthKey || idx} className="hover:bg-muted/30 transition-colors">
                              <td className="py-3 px-4 font-bold text-foreground">{ts.monthLabel}</td>
                              <td className="py-3 px-4 text-right font-mono font-bold text-emerald-600">{ts.presentCount}</td>
                              <td className="py-3 px-4 text-right font-mono font-bold text-amber-600">{ts.lateCount}</td>
                              <td className="py-3 px-4 text-right font-mono font-bold text-rose-600">{ts.absentCount}</td>
                              <td className="py-3 px-4 text-right font-mono">{ts.lateMinutes}m</td>
                              <td className="py-3 px-4 text-right font-mono font-bold text-foreground">{ts.totalHours.toFixed(1)}h</td>
                              <td className="py-3 px-4 text-right font-mono font-bold text-blue-600">{ts.overtimeHours.toFixed(1)}h</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 5: MY PAYSLIPS (STORE ADMIN ONLY) */}
            {activeTab === 'payslips' && isStoreAdminRole && (() => {
              const totalBasePay = myPayrolls.reduce((sum, p) => sum + Number(p.weekly_base_pay ?? p.basic_salary ?? 0), 0)
              const totalWorkHrs = myPayrolls.reduce((sum, p) => sum + Number(p.work_hours ?? p.regular_hours ?? 0), 0)
              const totalDed = myPayrolls.reduce((sum, p) => sum + Number(p.total_deductions ?? 0), 0)
              const totalTakeHome = myPayrolls.reduce((sum, p) => sum + Number(p.net_pay ?? 0), 0)

              return (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <StatCard
                      title="Total Base Pay"
                      value={fmt(totalBasePay)}
                      sub={`${myPayrolls.length} payroll record(s)`}
                      icon={<TbCurrencyPeso className="w-5 h-5 text-blue-500" />}
                      color="blue"
                    />
                    <StatCard
                      title="Total Work Hours"
                      value={`${totalWorkHrs.toFixed(1)} hrs`}
                      sub="verified payroll hours"
                      icon={<FiClock className="w-5 h-5 text-emerald-500" />}
                      color="green"
                    />
                    <StatCard
                      title="Total Deductions"
                      value={`- ${fmt(totalDed)}`}
                      sub="statutory & tardiness"
                      icon={<FiTrendingDown className="w-5 h-5 text-rose-500" />}
                      color="red"
                    />
                    <StatCard
                      title="Total Net Take-Home"
                      value={fmt(totalTakeHome)}
                      sub="cumulative net payout"
                      icon={<FiCreditCard className="w-5 h-5 text-emerald-500" />}
                      color="green"
                    />
                  </div>

                  <div className="p-4 bg-card rounded-2xl border border-border">
                    <div className="mb-4">
                      <h4 className="font-bold text-sm text-foreground">My Payslips</h4>
                      <p className="text-[11px] text-muted-foreground">View and print your official weekly pay stubs</p>
                    </div>

                    {loadingPayrolls ? (
                      <TableSkeleton rows={4} cols={8} />
                    ) : myPayrolls.length === 0 ? (
                      <EmptyState
                        icon={<TbCurrencyPeso className="w-10 h-10 text-muted-foreground/30 mx-auto" />}
                        title="No payslips found"
                        description="Your official payroll records will appear here once payroll has been generated."
                      />
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs min-w-[820px]">
                          <thead>
                            <tr className="border-b border-border bg-muted/50 text-muted-foreground uppercase font-semibold text-[11px]">
                              <th className="py-3 px-3 text-left">Period</th>
                              <th className="py-3 px-3 text-left">Payout Method</th>
                              <th className="py-3 px-3 text-right">Weekly Base</th>
                              <th className="py-3 px-3 text-right">Work Hrs</th>
                              <th className="py-3 px-3 text-right">Deductions</th>
                              <th className="py-3 px-3 text-right">Net Pay</th>
                              <th className="py-3 px-3 text-center">Status</th>
                              <th className="py-3 px-3 text-center">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {myPayrolls.map((p, idx) => (
                              <tr key={p.payroll_id || p.id || idx} className="hover:bg-muted/30 transition-colors">
                                <td className="py-3 px-3">
                                  <div className="font-bold text-foreground">{p.period_name || 'Payroll Period'}</div>
                                  {p.period_dates && (
                                    <div className="text-[10px] font-mono text-muted-foreground">{p.period_dates}</div>
                                  )}
                                </td>
                                <td className="py-3 px-3">
                                  <span className="font-semibold text-foreground">{p.payout_method || p.pay_type || 'Cash'}</span>
                                  {p.proof_of_payment && (
                                    <button
                                      type="button"
                                      onClick={() => setProofLightboxRecord(p)}
                                      className="block text-[10px] font-bold text-emerald-600 hover:underline mt-0.5 cursor-pointer"
                                    >
                                      View Proof
                                    </button>
                                  )}
                                </td>
                                <td className="py-3 px-3 text-right font-mono font-semibold">{fmt(p.weekly_base_pay ?? p.basic_salary ?? 0)}</td>
                                <td className="py-3 px-3 text-right font-mono">{Number(p.work_hours ?? p.regular_hours ?? 0).toFixed(1)}h</td>
                                <td className="py-3 px-3 text-right font-mono text-rose-600">{fmt(p.total_deductions ?? 0)}</td>
                                <td className="py-3 px-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">{fmt(p.net_pay ?? 0)}</td>
                                <td className="py-3 px-3 text-center">
                                  <StatusBadge status={p.status} />
                                </td>
                                <td className="py-3 px-3 text-center whitespace-nowrap">
                                  <div className="inline-flex items-center justify-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => setViewPayrollRecord(p)}
                                      title="View detailed payroll & attendance metrics"
                                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 font-semibold cursor-pointer transition-colors"
                                    >
                                      <FiEye className="w-3.5 h-3.5" />
                                      <span>View</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleOpenMyPayslip(p)}
                                      title="View itemized payslip"
                                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-xl border border-border bg-background hover:bg-muted font-semibold cursor-pointer transition-colors"
                                    >
                                      <FiFileText className="w-3.5 h-3.5 text-primary" />
                                      <span>Slip</span>
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )
            })()}

            {/* TAB 6: CREATE EXCUSE / LEAVE LETTER (STORE ADMIN ONLY) */}
            {activeTab === 'excuse_letter' && isStoreAdminRole && (
              <ExcuseLetterPage embedded />
            )}
          </div>
        )}

        {/* TAB: FACE RECOGNITION (SECURITY) */}
        {activeTab === 'security' && (
          <div className="space-y-4">
            {/* Standard Biometric Face Recognition Enrollment Flow */}
            <FaceRecognitionEnrollment
              existingImage={employee?.face_biometric_image || user?.face_biometric_image}
              faceBiometricImage={employee?.face_biometric_image || user?.face_biometric_image}
              employee={employee}
              onSuccess={async (payload) => {
                const biometricUrl = payload?.face_biometric_image || payload?.imageUrl
                if (biometricUrl) {
                  setEmployee(prev => prev ? ({ ...prev, face_biometric_image: biometricUrl }) : prev)
                }
                await verifySession()
              }}
            />

            {/* COLLAPSIBLE ACCORDION: ATTENDANCE PIN (BACKUP OPTION) */}
            <div className="p-4 bg-card rounded-2xl border border-border shadow-2xs">
              <button
                type="button"
                onClick={() => setShowPinBackup(!showPinBackup)}
                className="w-full flex items-center justify-between text-left cursor-pointer group"
              >
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-muted flex items-center justify-center text-muted-foreground group-hover:text-foreground transition-colors">
                    <FiKey className="w-4 h-4" />
                  </div>
                  <div>
                    <h5 className="font-bold text-xs text-foreground group-hover:text-primary transition-colors">
                      Attendance PIN (Backup Authorization)
                    </h5>
                    <p className="text-[11px] text-muted-foreground">
                      Optional 4-6 digit numeric PIN to authorize attendance if camera is unavailable
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-md bg-muted text-muted-foreground">
                    {employee?.has_pin ? 'PIN Set' : 'No PIN'}
                  </span>
                  <FiChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${showPinBackup ? 'rotate-180' : ''}`} />
                </div>
              </button>

              {showPinBackup && (
                <div className="pt-4 mt-3 border-t border-border animate-[fadeIn_0.2s_ease-out]">
                  {pinSuccess && (
                    <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-xs font-semibold flex items-center gap-2">
                      <FiCheckCircle /> {pinSuccess}
                    </div>
                  )}

                  {pinError && (
                    <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs font-semibold flex items-center gap-2">
                      <FiAlertTriangle /> {pinError}
                    </div>
                  )}

                  <form onSubmit={handleChangePin} className="max-w-xs space-y-4">
                    {employee?.has_pin && (
                      <div>
                        <label className="block text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-1">Current PIN</label>
                        <input
                          type="password"
                          maxLength={6}
                          value={pinForm.current_pin}
                          onChange={e => setPinForm(p => ({ ...p, current_pin: e.target.value.replace(/\D/g, '') }))}
                          className="w-full px-3 py-2 rounded-xl border border-border bg-black/5 dark:bg-black/40 text-foreground text-sm font-mono tracking-widest focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
                          placeholder="••••"
                        />
                      </div>
                    )}
                    <div>
                      <label className="block text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-1">New PIN (4-6 digits)</label>
                      <input
                        type="password"
                        maxLength={6}
                        value={pinForm.new_pin}
                        onChange={e => setPinForm(p => ({ ...p, new_pin: e.target.value.replace(/\D/g, '') }))}
                        className="w-full px-3 py-2 rounded-xl border border-border bg-black/5 dark:bg-black/40 text-foreground text-sm font-mono tracking-widest focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
                        placeholder="••••"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-1">Confirm New PIN</label>
                      <input
                        type="password"
                        maxLength={6}
                        value={pinForm.confirm_pin}
                        onChange={e => setPinForm(p => ({ ...p, confirm_pin: e.target.value.replace(/\D/g, '') }))}
                        className="w-full px-3 py-2 rounded-xl border border-border bg-black/5 dark:bg-black/40 text-foreground text-sm font-mono tracking-widest focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
                        placeholder="••••"
                      />
                    </div>
                    <div className="pt-1">
                      <Btn variant="primary" type="submit" className="w-full" disabled={pinLoading}>
                        {pinLoading ? 'Updating PIN...' : 'Update PIN'}
                      </Btn>
                    </div>
                  </form>
                </div>
              )}
            </div>
          </div>
        )}
        {isEditing && (
          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            {editActionButtons}
          </div>
        )}
      </Card>

      {/* REQUEST ATTENDANCE QR CODE MODAL (FROM PROFILE MODAL) */}
      {qrRequestModalOpen && employee && (
        <Modal
          title="REQUEST ATTENDANCE QR CODE"
          onClose={() => setQrRequestModalOpen(false)}
          size="lg"
          footer={
            <div className="flex justify-end gap-3 w-full">
              <Btn variant="outline" size="sm" onClick={() => setQrRequestModalOpen(false)} disabled={submittingRequest}>
                Cancel
              </Btn>
              <Btn
                variant="primary"
                size="sm"
                onClick={handleSubmitQrRequest}
                disabled={submittingRequest}
                icon={<FiCheckCircle />}
              >
                {submittingRequest ? 'Submitting...' : 'Submit Request'}
              </Btn>
            </div>
          }
        >
          <div className="space-y-4 py-1">
            <div className="p-3.5 rounded-2xl bg-primary/10 border border-primary/20 text-xs text-primary font-medium flex items-center gap-2">
              <FiInfo className="text-base shrink-0" />
              <span>
                {user?.role === 'Store Administrator' || user?.role === 'Store Admin'
                  ? "Your account must be verified by an Administrator before an attendance QR code can be issued."
                  : "Please verify that your employee information is correct before submitting your QR code request."}
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-card border border-border space-y-3 text-xs">
              <span className="text-[10px] uppercase font-bold text-muted-foreground block border-b border-border pb-1.5">
                {user?.role === 'Store Administrator' || user?.role === 'Store Admin' ? 'Store Administrator Information' : 'Employee Information'}
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase font-bold block">
                    {user?.role === 'Store Administrator' || user?.role === 'Store Admin' ? 'Store Admin ID' : 'Employee ID'}
                  </span>
                  <span className="font-mono font-bold text-primary">{employee.employee_code}</span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase font-bold block">
                    {user?.role === 'Store Administrator' || user?.role === 'Store Admin' ? 'Full Name' : 'Employee Name'}
                  </span>
                  <span className="font-semibold text-foreground">{employee.first_name} {employee.last_name}</span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase font-bold block">Position</span>
                  <span className="text-foreground">{employee.position}</span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase font-bold block">Department</span>
                  <span className="text-foreground">{employee.department}</span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase font-bold block">Branch</span>
                  <span className="font-semibold text-foreground">{employee.branch?.name || (typeof employee.branch === 'string' ? employee.branch : '') || '—'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase font-bold block">Phone</span>
                  <span className="text-foreground font-mono">{employee.phone || '09XXXXXXXXX'}</span>
                </div>
              </div>
              <div className="pt-1">
                <span className="text-[10px] text-muted-foreground uppercase font-bold block">Email</span>
                <span className="text-foreground">{employee.email}</span>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Full-Screen Phone Display My QR Modal */}
      {showDisplayQrModal && employee && hasActiveQr && (
        <Modal
          title="PERMANENT ATTENDANCE QR"
          onClose={() => setShowDisplayQrModal(false)}
          size="lg"
        >
          <div className="p-2 text-center space-y-4">
            <PermanentAttendanceBadge
              employee={employee}
              user={user}
              branchName={branchesList.find(b => b.id == employee.branch_id)?.name || branchLabel}
              qrSize={200}
            />
            <div className="p-3 rounded-xl bg-blue-500/10 text-blue-500 border border-blue-500/20 text-xs font-medium max-w-md mx-auto">
              Present this permanent QR code to the Store Administrator terminal scanner for attendance verification.
            </div>
            <div className="pt-3 flex justify-end border-t border-border">
              <Btn variant="primary" onClick={() => setShowDisplayQrModal(false)}>
                Done / Close
              </Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* Verification Details Sub-Modal */}
      {verificationDetailsOpen && (
        <Modal
          title="Account Verification Details"
          onClose={() => setVerificationDetailsOpen(false)}
          size="lg"
        >
          <div className="space-y-3 text-xs">
            <div className="p-3 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-xl text-blue-800 dark:text-blue-300 flex items-start gap-2">
              <FiCheckCircle className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-sm">Account Fully Verified</div>
                <div className="text-xs mt-0.5 opacity-90">
                  This user account is verified against employee record {employee?.employee_code}.
                </div>
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <Btn variant="outline" size="sm" onClick={() => setVerificationDetailsOpen(false)} icon={<FiX className="w-3.5 h-3.5" />}>
                Close
              </Btn>
            </div>
          </div>
        </Modal>
      )}
      {/* Store Admin Detailed Payroll View Modal */}
      {viewPayrollRecord && (
        <Suspense fallback={null}>
          <DetailedPayrollViewModal
            isOpen={!!viewPayrollRecord}
            onClose={() => setViewPayrollRecord(null)}
            record={viewPayrollRecord}
            allPayroll={myPayrolls}
            onOpenPayslip={(rec) => {
              setViewPayrollRecord(null)
              handleOpenMyPayslip(rec)
            }}
          />
        </Suspense>
      )}

      {/* Store Admin Personal Payslip Modal */}
      {selectedPayslip && (
        <EmployeePayslipModal payslip={selectedPayslip} onClose={() => setSelectedPayslip(null)} />
      )}

      {/* Payout Proof Lightbox */}
      {proofLightboxRecord && (
        <Modal
          title={`Proof of Payment — ${proofLightboxRecord.period_name || 'Payslip'}`}
          onClose={() => setProofLightboxRecord(null)}
          size="md"
        >
          <div className="space-y-4 text-center">
            <img
              src={proofLightboxRecord.proof_of_payment}
              alt="Proof of Payment"
              className="max-h-[65vh] w-auto mx-auto rounded-xl border border-border object-contain"
            />
            <div className="flex justify-end">
              <Btn variant="outline" size="sm" onClick={() => setProofLightboxRecord(null)}>
                Close
              </Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
