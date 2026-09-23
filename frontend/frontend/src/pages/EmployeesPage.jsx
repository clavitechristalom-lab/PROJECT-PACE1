import { useState, useEffect, useRef, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  FiUser, FiUsers, FiPlus, FiEdit, FiTrash2, FiEye,
  FiPhone, FiMail, FiMapPin, FiKey, FiCamera, FiPrinter, FiCreditCard, FiCalendar, FiClock, FiShield,
  FiCheckCircle, FiAlertTriangle, FiX, FiSearch, FiFilter,
  FiDownload, FiRefreshCw, FiSlash, FiLayers, FiActivity,
  FiFileText, FiSmartphone
} from 'react-icons/fi'
import {
  Table, TR, TD, Badge, Btn, Modal, Input, Select, Textarea, ConfirmDialog,
  PageHeader, StatCard, Card, Pagination, showToast, StatusBadge,
  TabBar, LoadingState, ErrorAlert, TableSkeleton, EmptyState, confirmAction,
} from '../components/ui'
import { fmt, fmtDate, filterBySearch } from '../lib/utils'
import { api } from '../lib/api'
import { QRCodeSVG } from 'qrcode.react'
import EmployeeFinancialsTab from '../components/employees/EmployeeFinancialsTab'
import { TbCurrencyPeso } from 'react-icons/tb'
import { useAuth } from '../context/AuthContext'

export default function EmployeesPage({ branchFilter, embedded }) {
  const { user } = useAuth()
  const isAdmin = user?.role === 'Administrator'
  const isStoreAdmin = user?.role === 'Store Administrator' || user?.role === 'Store Admin'
  const isEmployee = user?.role === 'Employee'
  const [searchParams] = useSearchParams()
  const [employees, setEmployees] = useState([])
  const [branchesList, setBranchesList] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.branches.getAll()
      .then(data => setBranchesList(data.branches || []))
      .catch(err => console.error(err))
  }, [])
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [deptFilter, setDeptFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [page, setPage] = useState(1)
  const pageSize = 10

  // Modals
  const [addModal, setAddModal] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [deleteItem, setDeleteItem] = useState(null)
  const [detailItem, setDetailItem] = useState(null)
  const [detailTab, setDetailTab] = useState('profile')
  const [detailLoading, setDetailLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formTab, setFormTab] = useState('personal')
  const [pageTab, setPageTab] = useState('directory') // 'directory' | 'qr_management'
  const [generateModalEmp, setGenerateModalEmp] = useState(null)
  const [viewQrEmp, setViewQrEmp] = useState(null)

  // PIN & QR Management State
  const [pinModalOpen, setPinModalOpen] = useState(false)
  const [pinEmployee, setPinEmployee] = useState(null)
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [pinSaving, setPinSaving] = useState(false)
  const [qrActionLoading, setQrActionLoading] = useState(false)
  const printBadgeRef = useRef(null)

  // Form State
  const emptyForm = {
    employee_code: '', first_name: '', middle_name: '', last_name: '',
    gender: 'Male', birth_date: '', date_of_birth: '', marital_status: 'Single',
    tin_number: '', sss_number: '', philhealth_number: '', pagibig_number: '',
    position: '', branch_id: '',
    pay_type: 'Cash', ewallet_provider: 'Gcash', ewallet_account_no: '', bank_name: 'BDO', bank_account_no: '',
    basic_salary: '', phone: '', email: '',
    address: '', hire_date: '', working_hours: '8 AM to 5 PM',
    status: 'Active', notes: '', attendance_pin: '',
    emergency_contact_name: '', emergency_contact_relation: '', emergency_contact_phone: ''
  }
  const [form, setForm] = useState(emptyForm)

  const loadEmployees = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await api.employees.getAll({
        search: search || undefined,
        
        status: statusFilter !== 'All' ? statusFilter : undefined,
        branch_id: branchFilter || undefined,
      })
      setEmployees(data.employees || [])
    } catch (err) {
      console.error('Failed to load employees:', err)
      setError(err.message || 'Failed to fetch employees')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadEmployees()
  }, [deptFilter, statusFilter])

  useEffect(() => {
    const id = searchParams.get('id')
    if (id) {
      openDetail({ employee_id: id })
    }
  }, [searchParams])

  const handleSave = async (e) => {
    e.preventDefault()
    if (!form.first_name || !form.last_name || !form.position || !form.basic_salary) {
      showToast('Please fill in required fields (Name, Position, Salary)', 'error')
      return
    }

    if (form.attendance_pin && !/^\d{4,6}$/.test(form.attendance_pin)) {
      showToast('Attendance PIN must be 4 to 6 digits', 'error')
      return
    }

    setSaving(true)
    try {
      const payload = {
        ...form,
        basic_salary: parseFloat(form.basic_salary) || 0,
      }

      if (editItem) {
        const res = await api.employees.update(editItem.employee_id, payload)
        if (res.employee) {
          setEmployees(prev => prev.map(emp => emp.employee_id === editItem.employee_id ? res.employee : emp))
        } else {
          loadEmployees()
        }
        showToast('Employee updated successfully', 'success')
      } else {
        const res = await api.employees.create(payload)
        if (res.employee) {
          setEmployees(prev => [res.employee, ...prev])
        } else {
          loadEmployees()
        }
        showToast('Employee registered successfully', 'success')
      }
      setAddModal(false)
      setEditItem(null)
      setForm(emptyForm)
    } catch (err) {
      console.error('Failed to save employee:', err)
      showToast(err.message || 'Failed to save employee', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteItem) return
    const confirmed = await confirmAction('Delete Employee?', `Are you sure you want to delete ${deleteItem.first_name} ${deleteItem.last_name}? This cannot be undone.`, 'Yes, Delete')
    if (!confirmed) return

    setSaving(true)
    try {
      await api.employees.delete(deleteItem.employee_id)
      setEmployees(prev => prev.filter(emp => emp.employee_id !== deleteItem.employee_id))
      showToast('Employee record deleted successfully', 'success')
      setDeleteItem(null)
    } catch (err) {
      showToast(err.message || 'Failed to delete employee', 'error')
    } finally {
      setSaving(false)
    }
  }

  const openEdit = (emp) => {
    setEditItem(emp)
    setForm({
      employee_code: emp.employee_code || '',
      first_name: emp.first_name || '',
      middle_name: emp.middle_name || '',
      last_name: emp.last_name || '',
      gender: emp.gender || 'Male',
      birth_date: emp.birth_date || '',
      date_of_birth: emp.date_of_birth || emp.birth_date || '',
      marital_status: emp.marital_status || 'Single',
      tin_number: emp.tin_number || '',
      sss_number: emp.sss_number || '',
      philhealth_number: emp.philhealth_number || '',
      pagibig_number: emp.pagibig_number || '',
      position: emp.position || '',
      
      branch_id: emp.branch_id || '',
      pay_type: emp.pay_type || 'Cash',
      ewallet_provider: emp.ewallet_provider || 'Gcash',
      ewallet_account_no: emp.ewallet_account_no || emp.phone || '',
      bank_name: emp.bank_name || 'BDO',
      bank_account_no: emp.bank_account_no || '',
      basic_salary: emp.basic_salary?.toString() || '',
      phone: emp.phone || '',
      email: emp.email || '',
      address: emp.address || '',
      hire_date: emp.hire_date || '',
      working_hours: emp.working_hours || '8 AM to 5 PM',
      status: emp.status || 'Active',
      notes: emp.notes || '',
      attendance_pin: '',
      emergency_contact_name: emp.emergency_contact_name || '',
      emergency_contact_relation: emp.emergency_contact_relation || '',
      emergency_contact_phone: emp.emergency_contact_phone || '',
    })
    setFormTab('personal')
    setAddModal(true)
  }

  const openDetail = async (emp, initialTab = 'profile') => {
    setDetailItem(null)
    setDetailTab(initialTab)
    setDetailLoading(true)
    try {
      const data = await api.employees.getById(emp.employee_id)
      setDetailItem(data)
    } catch (err) {
      showToast(err.message || 'Failed to load employee details', 'error')
    } finally {
      setDetailLoading(false)
    }
  }

  const openQrBadge = (emp) => {
    openDetail(emp, 'qr')
  }

  const handleOpenGenerateModal = (emp) => {
    setGenerateModalEmp(emp)
  }

  const handleConfirmGenerateQr = async () => {
    if (!generateModalEmp) return
    setQrActionLoading(true)
    try {
      const res = await api.employees.generateQr(generateModalEmp.employee_id)
      showToast(res.message || 'Permanent QR code generated successfully.', 'success')
      setGenerateModalEmp(null)
      loadEmployees()
    } catch (err) {
      showToast(err.message || 'Failed to generate QR code', 'error')
    } finally {
      setQrActionLoading(false)
    }
  }

  const handleRevokeQrAdmin = async (emp) => {
    const confirmed = await confirmAction('Revoke QR Code?', `Are you sure you want to REVOKE the attendance QR code for ${emp.first_name} ${emp.last_name}? Attendance scanning will be blocked.`, 'Yes, Revoke')
    if (!confirmed) return
    setQrActionLoading(true)
    try {
      const res = await api.employees.revokeQr(emp.employee_id)
      showToast(res.message || 'QR code successfully revoked.', 'success')
      loadEmployees()
    } catch (err) {
      showToast(err.message || 'Failed to revoke QR code', 'error')
    } finally {
      setQrActionLoading(false)
    }
  }

  const handleReissueQrAdmin = async (emp) => {
    const confirmed = await confirmAction('Generate New QR?', `Are you sure you want to ISSUE A NEW permanent QR code for ${emp.first_name} ${emp.last_name}? The previous QR code will immediately be invalidated.`, 'Yes, Generate')
    if (!confirmed) return
    setQrActionLoading(true)
    try {
      const res = await api.employees.reissueQr(emp.employee_id)
      showToast(res.message || 'New permanent QR code issued successfully.', 'success')
      loadEmployees()
    } catch (err) {
      showToast(err.message || 'Failed to reissue QR code', 'error')
    } finally {
      setQrActionLoading(false)
    }
  }

  const handleOpenViewQrBadge = (emp) => {
    setViewQrEmp(emp)
  }

  const handleGenerateQr = async () => {
    if (!detailItem?.employee) return
    setQrActionLoading(true)
    try {
      const res = await api.employees.generateQr(detailItem.employee.employee_id)
      showToast(res.message || 'Permanent QR code generated successfully.', 'success')
      setDetailItem(prev => ({
        ...prev,
        employee: {
          ...prev.employee,
          qr_token: res.qr_token,
          qr_active: res.qr_active,
          qr_generated_at: res.qr_generated_at,
        }
      }))
      loadEmployees()
    } catch (err) {
      showToast(err.message || 'Failed to generate QR code', 'error')
    } finally {
      setQrActionLoading(false)
    }
  }

  const handleRegenerateQr = async () => {
    if (!detailItem?.employee) return
    const confirmed = await confirmAction('Regenerate QR Code?', `Are you sure you want to regenerate this QR code? The previous QR code will immediately become invalid.`, 'Yes, Regenerate')
    if (!confirmed) return

    setQrActionLoading(true)
    try {
      const res = await api.employees.regenerateQr(detailItem.employee.employee_id)
      showToast(res.message || 'Permanent QR token regenerated successfully.', 'success')
      setDetailItem(prev => ({
        ...prev,
        employee: {
          ...prev.employee,
          qr_token: res.qr_token,
          qr_active: res.qr_active,
          qr_generated_at: res.qr_generated_at,
        }
      }))
      loadEmployees()
    } catch (err) {
      showToast(err.message || 'Failed to regenerate QR code', 'error')
    } finally {
      setQrActionLoading(false)
    }
  }

  const handleToggleQr = async () => {
    if (!detailItem?.employee) return
    const newActive = !detailItem.employee.qr_active
    setQrActionLoading(true)
    try {
      const res = await api.employees.toggleQr(detailItem.employee.employee_id, newActive)
      showToast(res.message, 'success')
      setDetailItem(prev => ({
        ...prev,
        employee: {
          ...prev.employee,
          qr_active: res.qr_active,
        }
      }))
      loadEmployees()
    } catch (err) {
      showToast(err.message || 'Failed to toggle QR status', 'error')
    } finally {
      setQrActionLoading(false)
    }
  }

  const [verifyLoading, setVerifyLoading] = useState(false)

  const handleToggleVerify = async (empId, shouldVerify) => {
    setVerifyLoading(true)
    try {
      if (shouldVerify) {
        const res = await api.employees.verify(empId)
        showToast(res.message || 'Employee account verified successfully.', 'success')
      } else {
        const res = await api.employees.unverify(empId)
        showToast(res.message || 'Account verification revoked.', 'info')
      }
      if (detailItem) {
        setDetailItem(prev => ({
          ...prev,
          employee: {
            ...prev.employee,
            information_verified: shouldVerify,
            information_verified_at: shouldVerify ? new Date().toISOString() : null,
          }
        }))
      }
      loadEmployees()
    } catch (err) {
      showToast(err.message || 'Failed to update verification status', 'error')
    } finally {
      setVerifyLoading(false)
    }
  }

  const handleDownloadQr = () => {
    if (!detailItem?.employee?.qr_token) return
    const svgEl = document.getElementById('employee-badge-qr-code')
    if (!svgEl) return
    const svgData = new XMLSerializer().serializeToString(svgEl)
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `QR_${detailItem.employee.employee_code || detailItem.employee.employee_id}.svg`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    showToast('Permanent QR code SVG downloaded', 'success')
  }

  const handleOpenPinModal = (emp) => {
    setPinEmployee(emp)
    setNewPin('')
    setConfirmPin('')
    setPinModalOpen(true)
  }

  const handleSavePin = async (e) => {
    e.preventDefault()
    if (!pinEmployee) return

    if (!/^\d{4,6}$/.test(newPin)) {
      showToast('PIN must be between 4 and 6 numeric digits', 'error')
      return
    }

    if (newPin !== confirmPin) {
      showToast('PIN confirmation does not match', 'error')
      return
    }

    setPinSaving(true)
    try {
      await api.employees.setPin(pinEmployee.employee_id, newPin)
      showToast(`Attendance PIN successfully set for ${pinEmployee.first_name}`, 'success')
      setPinModalOpen(false)
      if (detailItem && detailItem.employee.employee_id === pinEmployee.employee_id) {
        setDetailItem(prev => ({
          ...prev,
          employee: {
            ...prev.employee,
            has_pin: true,
            pin_failed_attempts: 0,
            pin_locked_until: null,
          }
        }))
      }
      loadEmployees()
    } catch (err) {
      showToast(err.message || 'Failed to set PIN', 'error')
    } finally {
      setPinSaving(false)
    }
  }

  const handlePrintBadge = () => {
    window.print()
  }

  const filtered = useMemo(() => {
    return filterBySearch(employees, search, ['first_name', 'last_name', 'employee_code', 'position', 'branch_id'])
  }, [employees, search])

  const total = filtered.length
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize)

  // Live aggregates
  const totalEmployees = employees.length
  const activeCount = employees.filter(e => e.status === 'Active').length
  const totalPayrollBase = employees.filter(e => e.status === 'Active').reduce((acc, e) => acc + (parseFloat(e.basic_salary) || 0), 0)
  const uniqueBranches = new Set(employees.map(e => e.branch_id).filter(Boolean)).size

  return (
    <div className={`space-y-6 ${embedded ? 'pb-2 animate-fadeIn' : 'pb-12 animate-fadeIn'}`}>
      {!embedded && (
        <PageHeader
          title="Employee Management"
          subtitle="Manage organizational personnel, permanent QR badges, attendance PINs, and payroll assignments"
          action={
            (isAdmin || isStoreAdmin) && (
              <button
                onClick={() => { setEditItem(null); setFormTab('personal'); setForm(emptyForm); setAddModal(true) }}
                className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs rounded-xl shadow-xs transition-all cursor-pointer hover:shadow-md active:scale-98"
              >
                <FiPlus className="w-4 h-4" />
                <span>Add Employee</span>
              </button>
            )
          }
        />
      )}

      <TabBar
        tabs={[
          { id: 'directory', label: 'Employee Directory', icon: <FiUsers className="w-4 h-4" /> },
          { id: 'qr_management', label: 'Employee QR Management', icon: <FiShield className="w-4 h-4" /> },
        ]}
        activeTab={pageTab}
        onChange={setPageTab}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard title="Total Staff" value={totalEmployees.toString()} sub="registered personnel" icon={<FiUsers className="w-5 h-5" />} color="blue" />
        <StatCard title="Active Employees" value={activeCount.toString()} sub="on active duty" icon={<FiCheckCircle className="w-5 h-5 text-emerald-500" />} color="green" />
        <StatCard title="Total Monthly Base" value={fmt(totalPayrollBase)} sub="active payroll base" icon={<TbCurrencyPeso className="w-5 h-5 text-indigo-500" />} color="indigo" />
        <StatCard title="Branches" value={uniqueBranches.toString()} sub="active branches" icon={<FiLayers className="w-5 h-5 text-purple-500" />} color="purple" />
      </div>

      {error && <ErrorAlert message={error} onRetry={loadEmployees} />}

      {/* Filters */}
      <Card noPad className="p-3.5 border border-border">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search by employee code, name, branch, position..."
              className="w-full pl-9 pr-8 py-2 rounded-xl border border-border bg-card text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-muted-foreground/70"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <FiX className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex gap-2">
            <select
              value={deptFilter}
              onChange={e => { setDeptFilter(e.target.value); setPage(1) }}
              className="border border-border rounded-xl px-3 py-2 text-xs font-semibold text-foreground bg-card cursor-pointer"
            >
              <option value="All">All Branches</option>
              {branchesList.map(b => <option key={b.branch_id} value={b.branch_id}>{b.name}</option>)}
            </select>
            <select
              value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
              className="border border-border rounded-xl px-3 py-2 text-xs font-semibold text-foreground bg-card cursor-pointer"
            >
              <option value="All">All Statuses</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Main Tab Content */}
      {pageTab === 'qr_management' ? (
        <Card noPad className="border border-border overflow-hidden">
          {loading ? (
            <TableSkeleton rows={6} cols={11} />
          ) : paginated.length === 0 ? (
            <EmptyState
              icon={<FiShield className="w-12 h-12 text-muted-foreground/30 mx-auto" />}
              title="No employee records found"
              description="Register employees to manage and issue permanent attendance QR codes."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/50 text-muted-foreground uppercase font-semibold text-[11px]">
                    <th className="py-3 px-4 text-left">Employee ID</th>
                    <th className="py-3 px-4 text-left">Employee Name</th>
                    <th className="py-3 px-4 text-left">Position</th>
                    
                    <th className="py-3 px-4 text-left">Branch</th>
                    <th className="py-3 px-4 text-center">QR Status</th>
                    <th className="py-3 px-4 text-left">Issued Date</th>
                    <th className="py-3 px-4 text-left">Issued By</th>
                    <th className="py-3 px-4 text-left">Last Scan</th>
                    <th className="py-3 px-4 text-center">Attendance Status</th>
                    {!isEmployee && <th className="py-3 px-4 text-center">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {paginated.map((emp, i) => {
                    const isQrActive = emp.qr_token && emp.qr_active
                    const isQrRevoked = emp.qr_token && !emp.qr_active
                    const isNotGenerated = !emp.qr_token

                    return (
                      <tr key={emp.employee_id} className={`hover:bg-muted/40 transition-colors ${i % 2 === 1 ? 'bg-muted/10' : ''}`}>
                        <td className="py-3 px-4 font-mono font-bold text-foreground">
                          {emp.employee_code}
                        </td>
                        <td className="py-3 px-4 font-semibold text-foreground">
                          {emp.first_name} {emp.last_name}
                        </td>
                        <td className="py-3 px-4 text-muted-foreground">{emp.position}</td>
                        
                        <td className="py-3 px-4 font-medium text-foreground">{emp.branch?.name || 'Unassigned'}</td>
                        <td className="py-3 px-4 text-center">
                          {isQrActive && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/30">
                              <FiCheckCircle className="w-3 h-3" /> ACTIVE
                            </span>
                          )}
                          {isQrRevoked && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-500 border border-rose-500/30">
                              <FiX className="w-3 h-3" /> REVOKED
                            </span>
                          )}
                          {isNotGenerated && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/30">
                              NOT GENERATED
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-muted-foreground font-mono text-[11px]">{emp.issued_date || '—'}</td>
                        <td className="py-3 px-4 text-muted-foreground">{emp.issued_by || '—'}</td>
                        <td className="py-3 px-4 text-muted-foreground font-mono text-[11px]">{emp.last_scan || 'Never'}</td>
                        <td className="py-3 px-4 text-center">
                          <StatusBadge status={emp.attendance_status || 'No Attendance'} />
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5 flex-wrap">
                            {isNotGenerated && isAdmin && (
                              <button
                                type="button"
                                onClick={() => handleOpenGenerateModal(emp)}
                                className="px-3 py-1 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-[11px] transition shadow-xs cursor-pointer"
                              >
                                Generate QR
                              </button>
                            )}
                            {isQrActive && isAdmin && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleOpenViewQrBadge(emp)}
                                  className="px-2.5 py-1 rounded-lg bg-secondary hover:bg-secondary/80 text-foreground font-semibold text-[11px] transition border border-border cursor-pointer"
                                >
                                  View QR
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleOpenViewQrBadge(emp)}
                                  className="px-2.5 py-1 rounded-lg bg-secondary hover:bg-secondary/80 text-foreground font-semibold text-[11px] transition border border-border cursor-pointer"
                                >
                                  Print QR
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRevokeQrAdmin(emp)}
                                  className="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-500 font-bold text-[11px] transition border border-rose-500/40 cursor-pointer"
                                >
                                  Revoke QR
                                </button>
                              </>
                            )}
                            {isQrRevoked && isAdmin && (
                              <button
                                type="button"
                                onClick={() => handleReissueQrAdmin(emp)}
                                className="px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-[11px] transition shadow-xs cursor-pointer"
                              >
                                Issue New QR
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : (
        /* Table */
        <Card noPad className="border border-border overflow-hidden">
          {loading ? (
            <TableSkeleton rows={6} cols={8} />
          ) : paginated.length === 0 ? (
            <EmptyState
              icon={<FiUsers className="w-12 h-12 text-muted-foreground/30 mx-auto" />}
              title="No employees found"
              description={search || deptFilter !== 'All' ? 'Try adjusting your search query or filters' : 'Add your first employee to get started'}
              action={
                !isAdmin ? (
                  <button
                    onClick={() => { setEditItem(null); setFormTab('personal'); setForm(emptyForm); setAddModal(true) }}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 bg-primary text-primary-foreground font-bold text-xs rounded-xl cursor-pointer"
                  >
                    <FiPlus className="w-4 h-4" />
                    <span>Add Employee</span>
                  </button>
                ) : null
              }
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/50 text-muted-foreground uppercase font-semibold text-[11px]">
                      <th className="py-3 px-4 text-left">Code</th>
                      <th className="py-3 px-4 text-left">Employee Name</th>
                      <th className="py-3 px-4 text-left">Position</th>
                      
                      <th className="py-3 px-4 text-center">Permanent QR & PIN</th>
                      <th className="py-3 px-4 text-center">Verification</th>
                      <th className="py-3 px-4 text-right">Basic Salary</th>
                      <th className="py-3 px-4 text-center">Status</th>
                      {!isEmployee && <th className="py-3 px-4 text-center">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {paginated.map((emp, i) => (
                      <tr key={emp.employee_id} className={`hover:bg-muted/40 transition-colors ${i % 2 === 1 ? 'bg-muted/10' : ''}`}>
                        <td className="py-3 px-4 font-mono font-bold text-foreground">
                          <div className="flex items-center gap-1.5">
                            <FiUser className="w-3.5 h-3.5 text-primary shrink-0" />
                            <span>{emp.employee_code}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div>
                            <div className="font-semibold text-foreground">{emp.first_name} {emp.middle_name ? `${emp.middle_name}. ` : ''}{emp.last_name}</div>
                            <div className="text-[11px] text-muted-foreground">{emp.email || emp.phone}</div>
                          </div>
                        </td>
                        <td className="py-3 px-4 font-medium text-foreground">{emp.position}</td>
                        <td className="py-3 px-4"><Badge text={emp.branch?.name || 'Unassigned'} variant="neutral" /></td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5 flex-wrap">
                            {!emp.qr_token ? (
                              <span className="inline-flex items-center text-[10px] font-mono px-2 py-0.5 rounded-full border bg-amber-500/10 text-amber-500 border-amber-500/30">
                                QR Not Issued
                              </span>
                            ) : (
                              <span className={`inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full border ${emp.qr_active ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30' : 'bg-rose-500/10 text-rose-500 border-rose-500/30'}`}>
                                <FiCheckCircle className="w-3 h-3" />
                                <span>QR {emp.qr_active ? 'Active' : 'Disabled'}</span>
                              </span>
                            )}
                            <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                              <FiKey className="w-2.5 h-2.5" />
                              <span>{emp.has_pin ? 'PIN Set' : 'Default'}</span>
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center">
                          {(emp.account_verified || emp.information_verified || emp.is_verified) ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-300">
                              <FiCheckCircle className="w-3 h-3 text-emerald-600" />
                              <span>Verified</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200">
                              <FiAlertTriangle className="w-3 h-3 text-amber-600" />
                              <span>Unverified</span>
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-foreground">
                          {fmt(emp.basic_salary)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <StatusBadge status={emp.status} />
                        </td>
                        {!isEmployee && (
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {isAdmin && (
                              <button
                                onClick={() => openQrBadge(emp)}
                                title="View Permanent QR Badge"
                                className="p-1.5 rounded-lg border border-border hover:bg-muted text-foreground transition-colors cursor-pointer"
                              >
                                <FiCamera className="w-3.5 h-3.5 text-primary" />
                              </button>
                            )}
                            <button
                              onClick={() => openDetail(emp)}
                              title="View profile ledger"
                              className="p-1.5 rounded-lg border border-border hover:bg-muted text-foreground transition-colors cursor-pointer"
                            >
                              <FiEye className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => openEdit(emp)}
                              title="Edit employee"
                              className="p-1.5 rounded-lg border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                            >
                              <FiEdit className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setDeleteItem(emp)}
                              title="Delete employee"
                              className="p-1.5 rounded-lg border border-border hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 text-muted-foreground transition-colors cursor-pointer"
                            >
                              <FiTrash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Card>
      )}

      {paginated.length > 0 && (
        <Pagination total={total} page={page} pageSize={pageSize} onChange={setPage} />
      )}

      {/* Add / Edit Modal */}
      {addModal && (
        <Modal
          isOpen={true}
          title={editItem ? `Edit Employee — ${editItem.employee_code}` : 'Register New Employee'}
          onClose={() => { setAddModal(false); setEditItem(null) }}
          size="lg"
        >
          <form onSubmit={handleSave} className="space-y-4 text-xs">
            <TabBar
              tabs={[
                { id: 'personal', label: '1. Personal Info', icon: <FiUser className="w-3.5 h-3.5" /> },
                { id: 'government', label: '2. Government IDs', icon: <FiShield className="w-3.5 h-3.5" /> },
                { id: 'employment', label: '3. Employment & Rate', icon: <TbCurrencyPeso className="w-3.5 h-3.5" /> },
                { id: 'emergency', label: '4. Emergency Contact', icon: <FiPhone className="w-3.5 h-3.5" /> },
              ]}
              active={formTab}
              onChange={setFormTab}
            />

            {formTab === 'personal' && (
              <div className="space-y-3 mt-2">
                <div className="grid grid-cols-3 gap-2.5">
                  <div>
                    <label className="block font-bold text-muted-foreground mb-1">First Name *</label>
                    <input
                      type="text"
                      value={form.first_name}
                      onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))}
                      placeholder="First name"
                      required
                      className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-muted-foreground mb-1">Middle Name</label>
                    <input
                      type="text"
                      value={form.middle_name}
                      onChange={e => setForm(f => ({ ...f, middle_name: e.target.value }))}
                      placeholder="Middle name"
                      className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-muted-foreground mb-1">Last Name *</label>
                    <input
                      type="text"
                      value={form.last_name}
                      onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))}
                      placeholder="Last name"
                      required
                      className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2.5">
                  <div>
                    <label className="block font-bold text-muted-foreground mb-1">Gender</label>
                    <select
                      value={form.gender}
                      onChange={e => setForm(f => ({ ...f, gender: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-semibold"
                    >
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-bold text-muted-foreground mb-1">Date of Birth</label>
                    <input
                      type="date"
                      value={form.date_of_birth}
                      onChange={e => setForm(f => ({ ...f, date_of_birth: e.target.value, birth_date: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-muted-foreground mb-1">Marital Status</label>
                    <select
                      value={form.marital_status}
                      onChange={e => setForm(f => ({ ...f, marital_status: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-semibold"
                    >
                      <option value="Single">Single</option>
                      <option value="Married">Married</option>
                      <option value="Widowed">Widowed</option>
                      <option value="Separated">Separated</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block font-bold text-muted-foreground mb-1">Phone Number</label>
                    <input
                      type="text"
                      value={form.phone}
                      onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                      placeholder="0917XXXXXXX"
                      className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-muted-foreground mb-1">Email Address</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                      placeholder="employee@company.com"
                      className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-muted-foreground mb-1">Residential Address</label>
                  <input
                    type="text"
                    value={form.address}
                    onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                    placeholder="Street, Barangay, City, Province"
                    className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground"
                  />
                </div>
              </div>
            )}

            {formTab === 'government' && (
              <div className="space-y-3 mt-2">
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block font-bold text-muted-foreground mb-1">TIN Number</label>
                    <input
                      type="text"
                      value={form.tin_number}
                      onChange={e => setForm(f => ({ ...f, tin_number: e.target.value }))}
                      placeholder="000-000-000-000"
                      className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-muted-foreground mb-1">SSS Number</label>
                    <input
                      type="text"
                      value={form.sss_number}
                      onChange={e => setForm(f => ({ ...f, sss_number: e.target.value }))}
                      placeholder="00-0000000-0"
                      className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block font-bold text-muted-foreground mb-1">PhilHealth Number</label>
                    <input
                      type="text"
                      value={form.philhealth_number}
                      onChange={e => setForm(f => ({ ...f, philhealth_number: e.target.value }))}
                      placeholder="00-000000000-0"
                      className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-muted-foreground mb-1">Pag-IBIG Number</label>
                    <input
                      type="text"
                      value={form.pagibig_number}
                      onChange={e => setForm(f => ({ ...f, pagibig_number: e.target.value }))}
                      placeholder="0000-0000-0000"
                      className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-mono"
                    />
                  </div>
                </div>
              </div>
            )}

            {formTab === 'employment' && (
              <div className="space-y-3 mt-2">
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block font-bold text-muted-foreground mb-1">Position / Job Title *</label>
                    <input
                      type="text"
                      value={form.position}
                      onChange={e => setForm(f => ({ ...f, position: e.target.value }))}
                      placeholder="e.g. Sales Executive"
                      required
                      className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-semibold"
                    />
                  </div>
                  <div>
                    
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2.5">
                  <div>
                    <label className="block font-bold text-muted-foreground mb-1">Branch Location</label>
                    <select
                      value={form.branch_id}
                      onChange={e => setForm(f => ({ ...f, branch_id: e.target.value }))}
                      disabled={isStoreAdmin}
                      className={`w-full bg-muted/50 border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary transition-colors appearance-none ${isStoreAdmin ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <option value="">{isStoreAdmin ? 'Auto-assigned to your branch' : 'Unassigned'}</option>
                      {!isStoreAdmin && branchesList.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block font-bold text-muted-foreground mb-1">Basic Monthly Salary (PHP) *</label>
                    <input
                      type="number"
                      step="0.01"
                      value={form.basic_salary}
                      onChange={e => setForm(f => ({ ...f, basic_salary: e.target.value }))}
                      placeholder="0.00"
                      required
                      className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-muted-foreground mb-1">Pay Distribution Type</label>
                    <select
                      value={form.pay_type}
                      onChange={e => setForm(f => ({ ...f, pay_type: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-semibold"
                    >
                      <option value="Cash">Cash</option>
                      <option value="E-Wallet">E-Wallet (GCash / Maya)</option>
                      <option value="Bank">Bank Deposit</option>
                    </select>
                  </div>
                </div>

                {form.pay_type === 'E-Wallet' && (
                  <div className="grid grid-cols-2 gap-2.5 p-2.5 bg-muted/30 rounded-xl border border-border">
                    <div>
                      <label className="block font-bold text-muted-foreground mb-1">E-Wallet Provider</label>
                      <select
                        value={form.ewallet_provider}
                        onChange={e => setForm(f => ({ ...f, ewallet_provider: e.target.value }))}
                        className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-semibold"
                      >
                        <option value="Gcash">GCash</option>
                        <option value="Maya">Maya</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-bold text-muted-foreground mb-1">Account / Mobile No.</label>
                      <input
                        type="text"
                        value={form.ewallet_account_no}
                        onChange={e => setForm(f => ({ ...f, ewallet_account_no: e.target.value }))}
                        placeholder="0917XXXXXXX"
                        className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-mono"
                      />
                    </div>
                  </div>
                )}

                {form.pay_type === 'Bank' && (
                  <div className="grid grid-cols-2 gap-2.5 p-2.5 bg-muted/30 rounded-xl border border-border">
                    <div>
                      <label className="block font-bold text-muted-foreground mb-1">Bank Name</label>
                      <input
                        type="text"
                        value={form.bank_name}
                        onChange={e => setForm(f => ({ ...f, bank_name: e.target.value }))}
                        placeholder="e.g. BDO, BPI, UnionBank"
                        className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-muted-foreground mb-1">Account Number</label>
                      <input
                        type="text"
                        value={form.bank_account_no}
                        onChange={e => setForm(f => ({ ...f, bank_account_no: e.target.value }))}
                        placeholder="Bank Account Number"
                        className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-mono"
                      />
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2.5">
                  <div>
                    <label className="block font-bold text-muted-foreground mb-1">Hire Date</label>
                    <input
                      type="date"
                      value={form.hire_date}
                      onChange={e => setForm(f => ({ ...f, hire_date: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-muted-foreground mb-1">Status</label>
                    <select
                      value={form.status}
                      onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-semibold"
                    >
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-bold text-muted-foreground mb-1">Attendance PIN</label>
                    <input
                      type="text"
                      value={form.attendance_pin}
                      onChange={e => setForm(f => ({ ...f, attendance_pin: e.target.value }))}
                      placeholder={editItem ? 'Leave blank to keep current' : 'Default: 1234'}
                      className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-mono"
                      maxLength={6}
                    />
                  </div>
                </div>
              </div>
            )}

            {formTab === 'emergency' && (
              <div className="space-y-3 mt-2">
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block font-bold text-muted-foreground mb-1">Contact Person Name</label>
                    <input
                      type="text"
                      value={form.emergency_contact_name}
                      onChange={e => setForm(f => ({ ...f, emergency_contact_name: e.target.value }))}
                      placeholder="e.g. Maria Santos"
                      className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-muted-foreground mb-1">Relationship</label>
                    <input
                      type="text"
                      value={form.emergency_contact_relation}
                      onChange={e => setForm(f => ({ ...f, emergency_contact_relation: e.target.value }))}
                      placeholder="Spouse, Mother, Sibling"
                      className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground"
                    />
                  </div>
                </div>
                <div>
                  <label className="block font-bold text-muted-foreground mb-1">Emergency Phone Number</label>
                  <input
                    type="text"
                    value={form.emergency_contact_phone}
                    onChange={e => setForm(f => ({ ...f, emergency_contact_phone: e.target.value }))}
                    placeholder="0918XXXXXXX"
                    className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-mono"
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => { setAddModal(false); setEditItem(null) }}
                className="flex items-center gap-1 px-4 py-2 rounded-xl border border-border hover:bg-muted font-semibold cursor-pointer"
              >
                <FiX className="w-3.5 h-3.5" />
                <span>Cancel</span>
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold cursor-pointer"
              >
                <FiCheckCircle className="w-3.5 h-3.5" />
                <span>{saving ? 'Saving...' : editItem ? 'Update Employee' : 'Register Employee'}</span>
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Employee Detail Drawer / Modal */}
      {(detailItem || detailLoading) && (
        <Modal
          isOpen={true}
          title={detailItem ? `${detailItem.employee.first_name} ${detailItem.employee.last_name} (${detailItem.employee.employee_code})` : 'Loading Employee Records...'}
          onClose={() => setDetailItem(null)}
          size="lg"
        >
          {detailLoading || !detailItem ? (
            <LoadingState message="Fetching complete employee employment records..." />
          ) : (
            <div className="space-y-4 text-xs">
              <TabBar
                tabs={[
                  { id: 'profile', label: 'Employment Profile', icon: <FiUser className="w-3.5 h-3.5" /> },
                  { id: 'qr', label: 'Permanent QR Badge', icon: <FiCamera className="w-3.5 h-3.5" /> },
                  { id: 'attendance', label: `Attendance (${detailItem.attendance?.length || 0})`, icon: <FiClock className="w-3.5 h-3.5" /> },
                  { id: 'payroll', label: `Payroll (${detailItem.payroll?.length || 0})`, icon: <TbCurrencyPeso className="w-3.5 h-3.5" /> },
                  { id: 'financials', label: 'Financial Settings', icon: <TbCurrencyPeso className="w-3.5 h-3.5" /> },
                ]}
                active={detailTab}
                onChange={setDetailTab}
              />

              {/* Financial Settings Tab */}
              {detailTab === 'financials' && (
                <div className="pt-2">
                  <EmployeeFinancialsTab employeeId={detailItem.employee.employee_id} />
                </div>
              )}

              {/* QR & Security Badge Tab */}
              {detailTab === 'qr' && (
                <div className="space-y-5">
                  {!detailItem.employee.qr_token ? (
                    <div className="p-8 border-2 border-dashed border-border rounded-2xl text-center space-y-3 bg-muted/20">
                      <div className="w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center mx-auto border border-amber-500/20">
                        <FiCamera className="w-7 h-7" />
                      </div>
                      <div className="space-y-1">
                        <div className="inline-flex items-center text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border border-amber-300">
                          QR Status: Not Generated
                        </div>
                        <h4 className="font-bold text-sm text-foreground mt-2">No Permanent QR Code Issued Yet</h4>
                        <p className="text-xs text-muted-foreground max-w-md mx-auto">
                          Each employee requires a unique permanent UUID QR code to record attendance at company tablets. Click below to issue their official QR badge.
                        </p>
                      </div>
                      <div>
                        {isAdmin && (
                          <button
                            onClick={handleGenerateQr}
                            disabled={qrActionLoading}
                            className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground font-bold text-xs rounded-xl shadow-xs cursor-pointer"
                          >
                            <FiCamera className="w-4 h-4" />
                            <span>{qrActionLoading ? 'Generating...' : 'Generate Permanent QR Badge'}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
                      {/* Printable ID Card Badge */}
                      <div className="md:col-span-6 flex justify-center">
                        <div
                          ref={printBadgeRef}
                          className="w-72 bg-gradient-to-b from-slate-900 via-slate-800 to-slate-950 text-white rounded-2xl shadow-xl border border-slate-700 overflow-hidden flex flex-col items-center p-5 text-center relative"
                        >
                          <div className="w-12 h-1 bg-amber-400 rounded-full mb-3" />
                          <span className="text-[9px] uppercase tracking-widest text-amber-300 font-bold">PROJECT PACE STORE</span>
                          <h4 className="text-xs text-slate-300 font-medium">Official Employee Badge</h4>

                          <div className="w-16 h-16 rounded-full bg-slate-700 border-2 border-amber-400 flex items-center justify-center text-amber-300 my-3 shadow-inner">
                            <FiUser className="w-8 h-8" />
                          </div>

                          <h3 className="font-bold text-base text-white leading-tight">
                            {detailItem.employee.first_name} {detailItem.employee.last_name}
                          </h3>
                          <p className="text-xs text-amber-300 font-semibold mt-0.5">{detailItem.employee.position}</p>
                          <p className="text-[11px] text-slate-400">{detailItem.employee.department} · {detailItem.employee.branch?.name || 'Unassigned'}</p>
                          <div className="mt-1 font-mono text-xs font-bold text-slate-300 bg-slate-800 px-2.5 py-0.5 rounded-full border border-slate-700">
                            {detailItem.employee.employee_code}
                          </div>

                          {/* QR Code Container */}
                          <div className="mt-4 p-3 bg-white rounded-xl shadow-md border-2 border-slate-200">
                            <QRCodeSVG
                              id="employee-badge-qr-code"
                              value={detailItem.employee.qr_token}
                              size={120}
                              level="H"
                              includeMargin={false}
                            />
                          </div>

                          <div className="mt-3 flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-full ${detailItem.employee.qr_active ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`} />
                            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-300">
                              QR Status: {detailItem.employee.qr_active ? 'Active' : 'Disabled'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* QR Management Controls */}
                      <div className="md:col-span-6 space-y-3">
                        <div className="p-3.5 bg-muted/20 rounded-xl border border-border space-y-2.5">
                          <div className="flex items-center justify-between">
                            <h4 className="font-bold text-xs text-foreground">Badge Security Settings</h4>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${detailItem.employee.qr_active ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                              {detailItem.employee.qr_active ? 'Active' : 'Disabled'}
                            </span>
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            This unique permanent QR code identifies this employee on attendance tablets. Attendance requires entering their personal PIN.
                          </p>

                          <div className="flex items-center justify-between p-2.5 bg-card rounded-xl border border-border text-xs">
                            <div>
                              <span className="font-bold block text-foreground">Attendance PIN</span>
                              <span className="text-muted-foreground text-[11px]">
                                {detailItem.employee.has_pin ? 'Secure PIN Configured' : 'Default PIN active (1234)'}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleOpenPinModal(detailItem.employee)}
                              className="px-3 py-1 text-xs font-semibold rounded-lg border border-border hover:bg-muted cursor-pointer"
                            >
                              {detailItem.employee.has_pin ? 'Reset PIN' : 'Set PIN'}
                            </button>
                          </div>
                        </div>

                        <div className="p-3.5 bg-card rounded-xl border border-border space-y-2">
                          <h4 className="font-bold text-[10px] uppercase tracking-widest text-muted-foreground">Badge Actions</h4>
                          <div className="flex flex-col gap-2">
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                type="button"
                                onClick={handleDownloadQr}
                                className="flex items-center justify-center gap-1 px-3 py-1.5 rounded-xl border border-border hover:bg-muted font-semibold cursor-pointer"
                              >
                                <FiDownload className="w-3.5 h-3.5" />
                                <span>Download QR</span>
                              </button>
                              <button
                                type="button"
                                onClick={handlePrintBadge}
                                className="flex items-center justify-center gap-1 px-3 py-1.5 rounded-xl border border-border hover:bg-muted font-semibold cursor-pointer"
                              >
                                <FiPrinter className="w-3.5 h-3.5" />
                                <span>Print Badge</span>
                              </button>
                            </div>

                            {isAdmin && (
                              <button
                                type="button"
                                onClick={handleToggleQr}
                                disabled={qrActionLoading}
                                className={`flex items-center justify-center gap-1 px-3 py-1.5 rounded-xl font-bold cursor-pointer ${detailItem.employee.qr_active ? 'bg-rose-600 text-white' : 'bg-emerald-600 text-white'
                                  }`}
                              >
                                {detailItem.employee.qr_active ? <FiSlash className="w-3.5 h-3.5" /> : <FiCheckCircle className="w-3.5 h-3.5" />}
                                <span>{detailItem.employee.qr_active ? 'Disable QR Access' : 'Enable QR Access'}</span>
                              </button>
                            )}

                            {/* Refresh UUID Action */}
                            {isAdmin && (
                              <button
                                onClick={handleRegenerateQr}
                                disabled={qrActionLoading}
                                title="Regenerate QR UUID"
                                className="flex items-center justify-center gap-1 px-3 py-1.5 rounded-xl border border-border hover:bg-muted font-semibold text-muted-foreground hover:text-foreground cursor-pointer"
                              >
                                <FiRefreshCw className="w-3.5 h-3.5" />
                                <span>Regenerate QR UUID</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {detailTab === 'profile' && (
                <div className="space-y-3">
                  <div className="flex gap-3 items-center bg-card p-3.5 rounded-2xl border border-border">
                    <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary text-2xl shrink-0 shadow-2xs">
                      <FiUser className="w-7 h-7" />
                    </div>
                    <div className="flex-1">
                      <p className="font-bold text-base text-foreground leading-tight uppercase">{detailItem.employee.first_name} {detailItem.employee.last_name}</p>
                      <p className="text-muted-foreground text-xs mt-0.5 font-medium">{detailItem.employee.position} · {detailItem.employee.department} · {detailItem.employee.branch?.name || 'Unassigned'}</p>
                      <div className="mt-1.5 flex items-center gap-2">
                        <StatusBadge status={detailItem.employee.status} />
                        <Badge text={`${detailItem.employee.pay_type} Rate`} variant="neutral" />
                      </div>
                    </div>
                  </div>

                  {/* Verification Control */}
                  <div className={`p-3 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 ${detailItem.employee.information_verified
                      ? 'bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900 text-emerald-900 dark:text-emerald-200'
                      : 'bg-amber-50/80 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900 text-amber-900 dark:text-amber-200'
                    }`}>
                    <div className="flex items-center gap-2.5">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${detailItem.employee.information_verified ? 'bg-emerald-200 text-emerald-900' : 'bg-amber-200 text-amber-900'
                        }`}>
                        {detailItem.employee.information_verified ? <FiCheckCircle className="w-4 h-4" /> : <FiAlertTriangle className="w-4 h-4" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-xs">Account Verification:</span>
                          <span className={`text-[10px] font-bold px-2 py-0.2 rounded-full ${detailItem.employee.information_verified ? 'bg-emerald-200 text-emerald-900' : 'bg-amber-200 text-amber-900'
                            }`}>
                            {detailItem.employee.information_verified ? 'Officially Verified' : 'Pending Verification'}
                          </span>
                        </div>
                        <p className="text-[10px] opacity-80 mt-0.5">
                          {detailItem.employee.information_verified && detailItem.employee.information_verified_at
                            ? `Verified by Administrator on ${fmtDate(detailItem.employee.information_verified_at)}`
                            : 'Only authorized administrators can verify employee accounts.'}
                        </p>
                      </div>
                    </div>

                    <div>
                      {detailItem.employee.information_verified ? (
                        <button
                          type="button"
                          onClick={() => handleToggleVerify(detailItem.employee.employee_id, false)}
                          disabled={verifyLoading}
                          className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-[11px] cursor-pointer"
                        >
                          Revoke Verification
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleToggleVerify(detailItem.employee.employee_id, true)}
                          disabled={verifyLoading}
                          className="px-3 py-1 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-[11px] cursor-pointer"
                        >
                          Verify Account (Admin)
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 p-3 bg-muted/20 rounded-xl border border-border">
                    <div><span className="text-[10px] uppercase font-bold text-muted-foreground block mb-0.5">Employee ID</span> <p className="font-mono font-bold text-foreground">{detailItem.employee.employee_code}</p></div>
                    <div><span className="text-[10px] uppercase font-bold text-muted-foreground block mb-0.5">Hire Date</span> <p className="font-mono text-foreground">{detailItem.employee.hire_date || '—'}</p></div>
                    <div><span className="text-[10px] uppercase font-bold text-muted-foreground block mb-0.5">Contact No.</span> <p className="font-mono text-foreground">{detailItem.employee.phone || '—'}</p></div>
                    <div><span className="text-[10px] uppercase font-bold text-muted-foreground block mb-0.5">Email Address</span> <p className="text-foreground">{detailItem.employee.email || '—'}</p></div>
                    <div className="col-span-2"><span className="text-[10px] uppercase font-bold text-muted-foreground block mb-0.5">Residential Address</span> <p className="text-foreground">{detailItem.employee.address || '—'}</p></div>
                  </div>

                  <div className="grid grid-cols-3 gap-2.5">
                    <div className="p-3 border border-border rounded-xl bg-card text-center">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground">Basic Salary</span>
                      <p className="text-base font-bold font-mono text-primary mt-0.5">{fmt(detailItem.employee.basic_salary)}</p>
                    </div>
                    <div className="p-3 border border-border rounded-xl bg-card text-center">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground">Daily Rate</span>
                      <p className="text-base font-bold font-mono text-emerald-600 mt-0.5">{fmt(detailItem.employee.daily_rate || 0)}</p>
                    </div>
                    <div className="p-3 border border-border rounded-xl bg-card text-center">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground">Hourly Rate</span>
                      <p className="text-base font-bold font-mono text-amber-600 mt-0.5">{fmt(detailItem.employee.hourly_rate || 0)}</p>
                    </div>
                  </div>
                </div>
              )}

              {detailTab === 'attendance' && (
                <div className="max-h-72 overflow-y-auto border border-border rounded-xl">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 border-b border-border sticky top-0 text-muted-foreground">
                      <tr>
                        <th className="py-2 px-3 text-left">Date</th>
                        <th className="py-2 px-3 text-left">Time In</th>
                        <th className="py-2 px-3 text-left">Time Out</th>
                        <th className="py-2 px-3 text-right">Hours</th>
                        <th className="py-2 px-3 text-right">OT</th>
                        <th className="py-2 px-3 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {detailItem.attendance?.length === 0 ? (
                        <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">No attendance entries found</td></tr>
                      ) : (
                        detailItem.attendance.map(a => (
                          <tr key={a.attendance_id} className="hover:bg-muted/20">
                            <td className="py-2 px-3 font-mono">{a.attendance_date}</td>
                            <td className="py-2 px-3 font-mono">{a.time_in || '—'}</td>
                            <td className="py-2 px-3 font-mono">{a.time_out || '—'}</td>
                            <td className="py-2 px-3 font-mono text-right">{a.total_hours}h</td>
                            <td className="py-2 px-3 font-mono text-right text-amber-600">{a.overtime_hours}h</td>
                            <td className="py-2 px-3 text-center"><StatusBadge status={a.status} /></td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {detailTab === 'payroll' && (
                <div className="max-h-72 overflow-y-auto border border-border rounded-xl">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 border-b border-border sticky top-0 text-muted-foreground">
                      <tr>
                        <th className="py-2 px-3 text-left">Period</th>
                        <th className="py-2 px-3 text-right">Gross Pay</th>
                        <th className="py-2 px-3 text-right">Deductions</th>
                        <th className="py-2 px-3 text-right">Net Pay</th>
                        <th className="py-2 px-3 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {detailItem.payroll?.length === 0 ? (
                        <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">No payroll records found</td></tr>
                      ) : (
                        detailItem.payroll.map(p => (
                          <tr key={p.payroll_id} className="hover:bg-muted/20">
                            <td className="py-2 px-3 font-mono font-semibold">{p.period_name}</td>
                            <td className="py-2 px-3 font-mono text-right">{fmt(p.gross_pay)}</td>
                            <td className="py-2 px-3 font-mono text-right text-rose-500">- {fmt(p.total_deductions)}</td>
                            <td className="py-2 px-3 font-mono text-right font-bold text-emerald-600">{fmt(p.net_pay)}</td>
                            <td className="py-2 px-3 text-center"><StatusBadge status={p.status} /></td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex justify-end pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setDetailItem(null)}
                  className="flex items-center gap-1 px-4 py-1.5 rounded-xl border border-border hover:bg-muted font-semibold cursor-pointer"
                >
                  <FiX className="w-3.5 h-3.5" />
                  <span>Close</span>
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* Set / Reset Attendance PIN Modal */}
      {pinModalOpen && pinEmployee && (
        <Modal
          isOpen={true}
          title={`Set Attendance PIN: ${pinEmployee.first_name} ${pinEmployee.last_name}`}
          onClose={() => setPinModalOpen(false)}
          size="sm"
        >
          <form onSubmit={handleSavePin} className="space-y-3.5 text-xs">
            <div className="p-3 bg-muted/30 border border-border rounded-xl space-y-1">
              <span className="font-bold block flex items-center gap-1 text-foreground">
                <FiKey className="w-3.5 h-3.5 text-primary" />
                <span>Security Notice:</span>
              </span>
              <p className="text-muted-foreground">The PIN must be 4 to 6 numeric digits. It is securely hashed using bcrypt in the database.</p>
            </div>

            <div>
              <label className="block font-bold text-muted-foreground mb-1">New Attendance PIN (4-6 digits)</label>
              <input
                type="password"
                maxLength={6}
                value={newPin}
                onChange={e => setNewPin(e.target.value.replace(/\D/g, ''))}
                placeholder="e.g. 4821"
                required
                autoFocus
                className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-mono text-center tracking-widest text-base"
              />
            </div>

            <div>
              <label className="block font-bold text-muted-foreground mb-1">Confirm Attendance PIN</label>
              <input
                type="password"
                maxLength={6}
                value={confirmPin}
                onChange={e => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                placeholder="Re-enter PIN"
                required
                className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-mono text-center tracking-widest text-base"
              />
            </div>

            {newPin && confirmPin && newPin !== confirmPin && (
              <p className="text-xs font-semibold text-rose-600">PINs do not match</p>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setPinModalOpen(false)}
                className="px-3.5 py-1.5 rounded-xl border border-border hover:bg-muted font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={pinSaving || !newPin || newPin !== confirmPin}
                className="px-4 py-1.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold cursor-pointer"
              >
                {pinSaving ? 'Saving PIN...' : 'Save & Secure PIN'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Generate Permanent QR Modal (Admin Only) */}
      {generateModalEmp && (
        <Modal
          isOpen={true}
          title="GENERATE PERMANENT ATTENDANCE QR"
          onClose={() => setGenerateModalEmp(null)}
          size="md"
        >
          <div className="space-y-4 text-xs">
            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2.5">
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Employee:</span>
                <span className="font-bold text-slate-100">{generateModalEmp.first_name} {generateModalEmp.last_name}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Employee ID:</span>
                <span className="font-mono font-bold text-primary-400">{generateModalEmp.employee_code}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Position:</span>
                <span className="font-semibold text-slate-200">{generateModalEmp.position}</span>
              </div>
              
              <div className="flex justify-between items-center bg-muted/30 p-2.5 rounded-lg border border-border text-xs">
                <span className="text-slate-400">Branch:</span>
                <span className="font-semibold text-emerald-400">{generateModalEmp.branch?.name || 'Unassigned'}</span>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-primary-500/10 border border-primary-500/20 text-primary-300">
              <p className="font-medium text-center leading-relaxed">
                "This permanent QR code will be assigned to this employee and used for attendance verification."
              </p>
            </div>

            <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-800">
              <Btn variant="outline" onClick={() => setGenerateModalEmp(null)} disabled={qrActionLoading}>
                Cancel
              </Btn>
              <Btn variant="primary" onClick={handleConfirmGenerateQr} disabled={qrActionLoading} icon={<FiShield />}>
                {qrActionLoading ? 'Generating QR...' : 'Generate QR'}
              </Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* View & Print Permanent QR Badge Modal */}
      {viewQrEmp && (
        <Modal
          isOpen={true}
          title={`Attendance QR Badge: ${viewQrEmp.first_name} ${viewQrEmp.last_name}`}
          onClose={() => setViewQrEmp(null)}
          size="md"
        >
          <div className="space-y-4 text-xs">
            <div className="max-w-xs mx-auto p-6 rounded-2xl bg-white text-slate-900 shadow-2xl border border-slate-200 text-center space-y-3 print:border-none print:shadow-none">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 border-b border-slate-200 pb-2">
                Official Permanent Attendance Badge
              </div>

              <div className="p-3 bg-white rounded-xl inline-block shadow-inner border border-slate-100">
                <QRCodeSVG
                  value={viewQrEmp.qr_token || 'NO_TOKEN'}
                  size={190}
                  level="H"
                  includeMargin={true}
                />
              </div>

              <div>
                <h3 className="text-base font-black text-slate-900">{viewQrEmp.first_name} {viewQrEmp.last_name}</h3>
                <p className="text-xs font-mono font-bold text-primary-600">{viewQrEmp.employee_code}</p>
                <p className="text-[11px] text-slate-600 font-semibold mt-0.5">{viewQrEmp.position} • {viewQrEmp.branch?.name || 'Unassigned'}</p>
              </div>

              <div className="pt-2 border-t border-slate-200 text-[10px] text-slate-500 font-mono">
                Status: {viewQrEmp.qr_active ? 'ACTIVE PERMANENT' : 'REVOKED'}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              <Btn variant="outline" onClick={() => window.print()} icon={<FiPrinter />}>
                Print QR
              </Btn>
              <Btn variant="primary" onClick={() => setViewQrEmp(null)}>
                Done
              </Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete confirmation */}
      {deleteItem && (
        <ConfirmDialog
          title="Delete Employee"
          message={`Are you sure you want to remove employee "${deleteItem.first_name} ${deleteItem.last_name}" (${deleteItem.employee_code})? This action cannot be undone.`}
          confirmLabel={saving ? "Deleting..." : "Delete Employee"}
          danger
          onConfirm={handleDelete}
          onCancel={() => setDeleteItem(null)}
        />
      )}
    </div>
  )
}
