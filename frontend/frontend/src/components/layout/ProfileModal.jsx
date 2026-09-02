import { useState, useEffect } from 'react'
import {
  FiUser, FiShield, FiCheckCircle, FiAlertTriangle, FiEdit,
  FiSave, FiX, FiPhone, FiMail, FiMapPin, FiCreditCard, FiCalendar, FiClock, FiActivity, FiKey,
  FiSmartphone, FiPrinter, FiDownload, FiInfo, FiChevronDown
} from 'react-icons/fi'
import {
  Btn, Badge, Input, Modal, TabBar, showToast, LoadingState, ErrorAlert
} from '../ui'
import { fmtDate, fmt } from '../../lib/utils'
import { api } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { QRCodeSVG } from 'qrcode.react'
import { TbCurrencyPeso } from 'react-icons/tb'

export default function ProfileModal({ open, isOpen, onClose }) {
  const isVisible = open || isOpen
  const { user } = useAuth()
  const isAdmin = user?.role === 'Administrator'
  const [employee, setEmployee] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState('profile')
  const [showDisplayQrModal, setShowDisplayQrModal] = useState(false)

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
    ewallet_provider: 'Gcash',
    ewallet_account_no: '',
    bank_name: 'BDO',
    bank_account_no: '',
    emergency_contact_name: '',
    emergency_contact_relation: '',
    emergency_contact_phone: '',
  })

  const loadProfile = async () => {
    if (!isVisible) return
    setLoading(true)
    setError('')
    try {
      const res = await api.employees.getMe()
      if (res?.employee) {
        setEmployee(res.employee)
        setEditForm({
          phone: res.employee.phone || '',
          email: res.employee.email || '',
          address: res.employee.address || '',
          pay_type: res.employee.pay_type || 'Cash',
          ewallet_provider: res.employee.ewallet_provider || 'Gcash',
          ewallet_account_no: res.employee.ewallet_account_no || res.employee.phone || '',
          bank_name: res.employee.bank_name || 'BDO',
          bank_account_no: res.employee.bank_account_no || '',
          emergency_contact_name: res.employee.emergency_contact_name || '',
          emergency_contact_relation: res.employee.emergency_contact_relation || '',
          emergency_contact_phone: res.employee.emergency_contact_phone || '',
        })
      } else {
        setError('Employee information was not found.')
      }
    } catch (err) {
      console.error('Failed to load profile:', err)
      if (err.status === 401) {
        setError('Your session has expired. Please log in again.')
      } else if (err.status === 404) {
        setError('Employee information was not found for this account.')
      } else {
        setError(err.message || 'Unable to load employee information.')
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isVisible) {
      setIsEditing(false)
      setActiveTab('profile')
      setShowDisplayQrModal(false)
      setVerificationModalOpen(false)
      setVerificationDetailsOpen(false)
      setVerificationError('')
      loadProfile()
    }
  }, [isVisible])

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
    setSaving(true)
    try {
      const res = await api.employees.updateMe(editForm)
      showToast(res.message || 'Profile details updated successfully.', 'success')
      setEmployee(prev => ({
        ...prev,
        ...editForm,
      }))
      setIsEditing(false)
    } catch (err) {
      showToast(err.message || 'Failed to update profile', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleSubmitQrRequest = async () => {
    setSubmittingRequest(true)
    try {
      const res = await api.qrRequests.create()
      if (res.success) {
        showToast(res.message || 'Your QR code request has been submitted to the Administrator.', 'success')
        setQrRequestModalOpen(false)
        loadProfile()
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

  if (!isVisible) return null

  return (
    <>
      <Modal
        title="MY PROFILE"
        onClose={onClose}
        size="lg"
        footer={
          <div className="flex justify-between items-center w-full flex-wrap gap-2">
            <div />
            <div className="flex gap-2">
              {isEditing ? (
                <>
                  <Btn variant="outline" size="sm" onClick={() => {
                    if (employee) {
                      setEditForm({
                        phone: employee.phone || '',
                        email: employee.email || '',
                        address: employee.address || '',
                        pay_type: employee.pay_type || 'Cash',
                        ewallet_provider: employee.ewallet_provider || 'Gcash',
                        ewallet_account_no: employee.ewallet_account_no || employee.phone || '',
                        bank_name: employee.bank_name || 'BDO',
                        bank_account_no: employee.bank_account_no || '',
                      })
                    }
                    setIsEditing(false)
                  }} disabled={saving} icon={<FiX className="w-3.5 h-3.5" />}>
                    Cancel
                  </Btn>
                  <Btn variant="primary" size="sm" onClick={handleSaveEdit} disabled={saving} icon={<FiSave className="w-3.5 h-3.5" />}>
                    {saving ? 'Saving...' : 'Save Changes'}
                  </Btn>
                </>
              ) : (
                <>
                  {activeTab === 'profile' && !isAdmin && (
                    <Btn variant="outline" size="sm" onClick={() => setIsEditing(true)} disabled={loading || !employee} icon={<FiEdit className="w-3.5 h-3.5" />}>
                      Edit Profile
                    </Btn>
                  )}
                  <Btn variant="outline" size="sm" onClick={onClose} icon={<FiX className="w-3.5 h-3.5" />}>
                    Close
                  </Btn>
                </>
              )}
            </div>
          </div>
        }
      >
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
            {/* Tab Navigation */}
            <TabBar
              tabs={[
                { id: 'profile', label: 'My Profile Information', icon: <FiUser className="w-3.5 h-3.5" /> },
                { id: 'attendance_qr', label: 'Attendance QR', icon: <FiSmartphone className="w-3.5 h-3.5" /> },
              ]}
              activeTab={activeTab}
              onChange={setActiveTab}
            />

            {/* TAB 1: PROFILE INFORMATION */}
            {activeTab === 'profile' && (
              <div className="space-y-4">
                {/* Quick Profile Summary Header */}
                <div className="flex items-center gap-4 p-4 bg-muted/20 rounded-2xl border border-border">
                  <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary text-2xl shrink-0 shadow-2xs">
                    <FiUser className="w-7 h-7" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-base text-foreground truncate">
                        {employee.first_name} {employee.middle_name ? `${employee.middle_name} ` : ''}{employee.last_name}
                      </h3>
                      {isVerified ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-800 px-2.5 py-0.5 rounded-full shadow-2xs">
                          <FiCheckCircle className="w-3 h-3" />
                          <span>Verified</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 px-2.5 py-0.5 rounded-full shadow-2xs">
                          <FiAlertTriangle className="w-3 h-3" />
                          <span>Not Verified</span>
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground font-medium mt-0.5">
                      {employee.position} · {employee.department} · {employee.branch}
                    </p>
                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-[11px] font-bold bg-muted px-2 py-0.5 rounded-lg border border-border">
                        ID: {employee.employee_code}
                      </span>
                      <Badge text={employee.status || 'Active'} variant="success" icon={<FiCheckCircle className="w-3 h-3" />} />
                    </div>
                  </div>
                </div>

                {/* Account Verification Banner */}
                <div className={`p-4 rounded-2xl border ${
                  isVerified 
                    ? 'bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/60' 
                    : 'bg-amber-50/40 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/60'
                }`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      {isVerified ? (
                        <FiCheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                      ) : (
                        <FiAlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                      )}
                      <div>
                        <h4 className="font-bold text-foreground text-xs uppercase tracking-wider">Account Verification</h4>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {isVerified 
                            ? `This user account is verified and linked to employee record (${employee.employee_code}).`
                            : 'Your account is pending administrator review and verification.'
                          }
                        </p>
                        {verifiedTimestamp && (
                          <p className="text-[11px] text-muted-foreground font-mono mt-1">
                            Verified Date: {fmtDate(verifiedTimestamp)}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-2 shrink-0">
                      {isVerified && (
                        <button
                          onClick={() => setVerificationDetailsOpen(true)}
                          className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-border bg-card hover:bg-muted text-foreground cursor-pointer flex items-center gap-1.5 transition-colors"
                        >
                          <FiShield className="w-3.5 h-3.5 text-emerald-500" />
                          <span>Details</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Form & Profile Sections */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Personal Information */}
                  <div className="p-4 bg-card rounded-2xl border border-border space-y-3">
                    <h4 className="font-bold uppercase tracking-wider text-muted-foreground text-[11px] flex items-center gap-1.5 border-b border-border pb-2">
                      <FiUser className="w-3.5 h-3.5 text-primary" />
                      <span>Personal Information</span>
                    </h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-0.5">Gender</div>
                        <div className="font-semibold text-foreground">{employee.gender || '—'}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-0.5">Birthdate</div>
                        <div className="font-semibold text-foreground">{employee.birth_date || employee.date_of_birth ? fmtDate(employee.birth_date || employee.date_of_birth).split(',')[0] : '—'}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-0.5">Marital Status</div>
                        <div className="font-semibold text-foreground">{employee.marital_status || '—'}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-0.5">Position</div>
                        <div className="font-semibold text-foreground">{employee.position || '—'}</div>
                      </div>
                    </div>
                  </div>

                  {/* Employment Information */}
                  <div className="p-4 bg-card rounded-2xl border border-border space-y-3">
                    <h4 className="font-bold uppercase tracking-wider text-muted-foreground text-[11px] flex items-center gap-1.5 border-b border-border pb-2">
                      <FiActivity className="w-3.5 h-3.5 text-primary" />
                      <span>Employment Information</span>
                    </h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-0.5">Employee ID</div>
                        <div className="font-bold text-foreground font-mono">{employee.employee_code}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-0.5">Branch</div>
                        <div className="font-semibold text-foreground">{employee.branch || '—'}</div>
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
                        <div className="font-semibold text-foreground">{employee.basic_salary ? <span className="flex items-center gap-0.5"><TbCurrencyPeso className="w-3.5 h-3.5" /> {fmt(employee.basic_salary)}</span> : '—'}</div>
                      </div>
                      <div className="col-span-2">
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-0.5">Pay Type</div>
                        <div className="font-semibold text-foreground">{employee.pay_type || '—'}</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Contact Details (Editable) */}
                <div className="p-4 bg-card rounded-2xl border border-border space-y-4">
                  <h4 className="font-bold uppercase tracking-wider text-muted-foreground text-[11px] flex items-center gap-1.5 border-b border-border pb-2">
                    <FiPhone className="w-3.5 h-3.5 text-primary" />
                    <span>Contact & Payment Information</span>
                  </h4>

                  {isEditing ? (
                    <div className="space-y-4">
                      {/* Row 1: Contact & Email */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[11px] font-bold text-muted-foreground mb-1.5">Contact Phone</label>
                          <input
                            type="text"
                            value={editForm.phone}
                            onChange={e => setEditForm(p => ({ ...p, phone: e.target.value }))}
                            className="w-full px-3 py-2.5 rounded-xl border border-border bg-black/5 dark:bg-black/20 text-foreground text-sm font-medium focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-muted-foreground mb-1.5">Email Address</label>
                          <input
                            type="email"
                            value={editForm.email}
                            onChange={e => setEditForm(p => ({ ...p, email: e.target.value }))}
                            className="w-full px-3 py-2.5 rounded-xl border border-border bg-black/5 dark:bg-black/20 text-foreground text-sm font-medium focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
                          />
                        </div>
                      </div>

                      {/* Row 2: Address */}
                      <div>
                        <label className="block text-[11px] font-bold text-muted-foreground mb-1.5">Home Address</label>
                        <input
                          type="text"
                          value={editForm.address}
                          onChange={e => setEditForm(p => ({ ...p, address: e.target.value }))}
                          className="w-full px-3 py-2.5 rounded-xl border border-border bg-black/5 dark:bg-black/20 text-foreground text-sm font-medium focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
                        />
                      </div>

                      {/* Row 3: Payment & Time (Read-only in Edit Mode) */}
                      <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
                        <div>
                          <label className="block text-[11px] font-bold text-muted-foreground mb-1.5">Pay Type</label>
                          <div className="relative">
                            <select
                              value={editForm.pay_type}
                              onChange={e => setEditForm(p => ({ ...p, pay_type: e.target.value }))}
                              className="w-full px-3 py-2.5 rounded-xl border border-border bg-black/5 dark:bg-black/20 text-foreground text-sm font-medium focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all appearance-none"
                            >
                              <option value="Cash">Cash</option>
                              <option value="GCash">GCash</option>
                              <option value="Bank Transfer">Bank Transfer</option>
                            </select>
                            <FiChevronDown className="w-3.5 h-3.5 text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                          </div>
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-muted-foreground mb-1.5">Account/Reference</label>
                          {editForm.pay_type === 'GCash' ? (
                            <input
                              type="text"
                              value={editForm.ewallet_account_no}
                              onChange={e => setEditForm(p => ({ ...p, ewallet_account_no: e.target.value }))}
                              placeholder="GCash Number"
                              className="w-full px-3 py-2.5 rounded-xl border border-border bg-black/5 dark:bg-black/20 text-foreground text-sm font-medium focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
                            />
                          ) : editForm.pay_type === 'Bank Transfer' ? (
                            <input
                              type="text"
                              value={editForm.bank_account_no}
                              onChange={e => setEditForm(p => ({ ...p, bank_account_no: e.target.value }))}
                              placeholder="Bank Account No."
                              className="w-full px-3 py-2.5 rounded-xl border border-border bg-black/5 dark:bg-black/20 text-foreground text-sm font-medium focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
                            />
                          ) : (
                            <div className="w-full px-3 py-2.5 rounded-xl border border-border bg-black/5 dark:bg-black/20 text-foreground text-sm font-medium cursor-not-allowed">
                              N/A
                            </div>
                          )}
                        </div>
                        <div>
                          <div className="text-[11px] font-bold text-muted-foreground mb-1.5">Time In</div>
                          <div className="w-full px-3 py-2.5 rounded-xl border border-border bg-black/5 dark:bg-black/20 text-foreground text-sm font-medium flex justify-between items-center cursor-not-allowed">
                            <span>{employee.today_attendance?.time_in ? new Date(`2000-01-01T${employee.today_attendance.time_in}`).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—'}</span>
                            <FiClock className="w-3.5 h-3.5 text-muted-foreground" />
                          </div>
                        </div>
                        <div>
                          <div className="text-[11px] font-bold text-muted-foreground mb-1.5">Time Out</div>
                          <div className="w-full px-3 py-2.5 rounded-xl border border-border bg-black/5 dark:bg-black/20 text-foreground text-sm font-medium flex justify-between items-center cursor-not-allowed">
                            <span>{employee.today_attendance?.time_out ? new Date(`2000-01-01T${employee.today_attendance.time_out}`).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—'}</span>
                            <FiClock className="w-3.5 h-3.5 text-muted-foreground" />
                          </div>
                        </div>
                        <div>
                          <div className="text-[11px] font-bold text-muted-foreground mb-1.5">Branch</div>
                          <div className="w-full px-3 py-2.5 rounded-xl border border-border bg-black/5 dark:bg-black/20 text-foreground text-sm font-medium flex justify-between items-center overflow-hidden cursor-not-allowed">
                            <span className="truncate pr-2">{employee.branch || '—'}</span>
                            <FiChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Row 1: Contact & Email */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <div className="text-[11px] font-bold text-muted-foreground mb-1.5">Contact Phone</div>
                          <div className="w-full px-3 py-2.5 rounded-xl border border-border bg-black/5 dark:bg-black/20 text-foreground text-sm font-medium">
                            {employee.phone || '—'}
                          </div>
                        </div>
                        <div>
                          <div className="text-[11px] font-bold text-muted-foreground mb-1.5">Email Address</div>
                          <div className="w-full px-3 py-2.5 rounded-xl border border-border bg-black/5 dark:bg-black/20 text-foreground text-sm font-medium">
                            {employee.email || '—'}
                          </div>
                        </div>
                      </div>

                      {/* Row 2: Address */}
                      <div>
                        <div className="text-[11px] font-bold text-muted-foreground mb-1.5">Home Address</div>
                        <div className="w-full px-3 py-2.5 rounded-xl border border-border bg-black/5 dark:bg-black/20 text-foreground text-sm font-medium">
                          {employee.address || '—'}
                        </div>
                      </div>

                      {/* Row 3: Payment & Time */}
                      <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
                        <div>
                          <div className="text-[11px] font-bold text-muted-foreground mb-1.5">Pay Type</div>
                          <div className="w-full px-3 py-2.5 rounded-xl border border-border bg-black/5 dark:bg-black/20 text-foreground text-sm font-medium flex justify-between items-center">
                            <span>{employee.pay_type || '—'}</span>
                            <FiChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                          </div>
                        </div>
                        <div>
                          <div className="text-[11px] font-bold text-muted-foreground mb-1.5">Account/Reference</div>
                          <div className="w-full px-3 py-2.5 rounded-xl border border-border bg-black/5 dark:bg-black/20 text-foreground text-sm font-medium">
                            {employee.pay_type === 'GCash' ? (employee.ewallet_account_no || '—') 
                              : employee.pay_type === 'Bank Transfer' ? (employee.bank_account_no || '—') 
                              : employee.pay_type === 'Cash' ? 'N/A' : '—'}
                          </div>
                        </div>
                        <div>
                          <div className="text-[11px] font-bold text-muted-foreground mb-1.5">Time In</div>
                          <div className="w-full px-3 py-2.5 rounded-xl border border-border bg-black/5 dark:bg-black/20 text-foreground text-sm font-medium flex justify-between items-center">
                            <span>{employee.today_attendance?.time_in ? new Date(`2000-01-01T${employee.today_attendance.time_in}`).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—'}</span>
                            <FiClock className="w-3.5 h-3.5 text-muted-foreground" />
                          </div>
                        </div>
                        <div>
                          <div className="text-[11px] font-bold text-muted-foreground mb-1.5">Time Out</div>
                          <div className="w-full px-3 py-2.5 rounded-xl border border-border bg-black/5 dark:bg-black/20 text-foreground text-sm font-medium flex justify-between items-center">
                            <span>{employee.today_attendance?.time_out ? new Date(`2000-01-01T${employee.today_attendance.time_out}`).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—'}</span>
                            <FiClock className="w-3.5 h-3.5 text-muted-foreground" />
                          </div>
                        </div>
                        <div>
                          <div className="text-[11px] font-bold text-muted-foreground mb-1.5">Branch</div>
                          <div className="w-full px-3 py-2.5 rounded-xl border border-border bg-black/5 dark:bg-black/20 text-foreground text-sm font-medium flex justify-between items-center overflow-hidden">
                            <span className="truncate pr-2">{employee.branch || '—'}</span>
                            <FiChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 2: ATTENDANCE QR (EMPLOYEE PHONE VIEW - SECTIONS 4 & 5) */}
            {activeTab === 'attendance_qr' && (
              <div className="space-y-4 py-2">
                {hasActiveQr || employee.qr_status === 'ACTIVE' ? (
                  /* STATE 5: ACTIVE */
                  <div className="space-y-4 text-center">
                    {/* Active Ready Banner */}
                    <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-center space-y-1.5">
                      <div>
                        <span className="inline-flex items-center gap-1 text-[11px] font-mono font-bold px-3 py-0.5 rounded-full bg-emerald-500/20 text-emerald-500 border border-emerald-500/30">
                          <FiCheckCircle className="w-3.5 h-3.5" /> QR Status: ACTIVE
                        </span>
                      </div>
                      <h3 className="text-base font-bold text-emerald-600 dark:text-emerald-400">Attendance QR Code Ready</h3>
                      <p className="text-xs text-muted-foreground">
                        "Your account has been verified and your permanent QR code has been issued by the Administrator."
                      </p>
                    </div>

                    {/* Display My QR Button */}
                    <div className="py-2">
                      <button
                        type="button"
                        onClick={() => setShowDisplayQrModal(true)}
                        className="px-6 py-3 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-sm shadow-md transition flex items-center gap-2 mx-auto cursor-pointer"
                      >
                        <FiSmartphone className="w-4 h-4" />
                        <span>Display My QR</span>
                      </button>
                    </div>

                    {/* Inline QR Badge */}
                    <div className="max-w-xs mx-auto p-5 rounded-2xl bg-card border border-border shadow-md space-y-3">
                      <div className="p-3 bg-white rounded-xl inline-block shadow-inner border border-slate-100">
                        <QRCodeSVG
                          value={employee.qr_token}
                          size={180}
                          level="H"
                          includeMargin={true}
                        />
                      </div>
                      <div>
                        <h4 className="font-bold text-sm text-foreground">{employee.first_name} {employee.last_name}</h4>
                        <p className="font-mono text-xs font-bold text-primary">{employee.employee_code}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{employee.position} · {employee.branch || 'Main Branch'}</p>
                      </div>
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
                      "An Administrator is currently verifying your account information."
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
          </div>
        )}
      </Modal>

      {/* REQUEST ATTENDANCE QR CODE MODAL (FROM PROFILE MODAL) */}
      {qrRequestModalOpen && employee && (
        <Modal
          title="REQUEST ATTENDANCE QR CODE"
          onClose={() => setQrRequestModalOpen(false)}
          size="md"
          footer={
            <div className="flex justify-end gap-2 w-full">
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

            <div className="p-4 rounded-2xl bg-card border border-border space-y-2.5 text-xs">
              <span className="text-[10px] uppercase font-bold text-muted-foreground block border-b border-border pb-1">
                {user?.role === 'Store Administrator' || user?.role === 'Store Admin' ? 'Store Administrator Information' : 'Employee Information'}
              </span>
              <div className="grid grid-cols-2 gap-2.5">
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
                  <span className="font-semibold text-foreground">{employee.branch || 'Main Branch'}</span>
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
          size="sm"
        >
          <div className="p-4 text-center space-y-4">
            <div className="p-4 bg-white rounded-2xl shadow-xl border-2 border-slate-200 inline-block">
              <QRCodeSVG
                value={employee.qr_token}
                size={220}
                level="H"
                includeMargin={true}
              />
            </div>
            <div>
              <h3 className="text-base font-black text-foreground">{employee.first_name} {employee.last_name}</h3>
              <p className="font-mono text-xs font-bold text-primary">{employee.employee_code}</p>
              <p className="text-xs text-muted-foreground">{employee.position} · {employee.branch || 'Main Branch'}</p>
            </div>
            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 text-[11px] font-medium">
              Present this permanent QR code to the Store Administrator terminal scanner for attendance verification.
            </div>
            <div className="pt-2">
              <Btn variant="primary" className="w-full" onClick={() => setShowDisplayQrModal(false)}>
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
          size="sm"
        >
          <div className="space-y-3 text-xs">
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl text-emerald-800 dark:text-emerald-300 flex items-start gap-2">
              <FiCheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
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
    </>
  )
}
