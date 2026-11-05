import { useState, useEffect, useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  FiTrendingDown, FiCreditCard, FiUsers,
  FiGift, FiZap, FiFileText, FiCheckCircle, FiEye,
  FiPrinter, FiX, FiCalendar, FiPlus, FiAlertCircle, FiSearch, FiShield,
  FiRefreshCw, FiLock, FiClock, FiAlertTriangle, FiTrendingUp, FiUser
} from 'react-icons/fi'
import {
  LuShieldCheck, LuBuilding, LuBuilding2, LuUser as LuUserIcon, LuUsers as LuUsersIcon, LuSearch,
  LuCheck, LuCheckCheck, LuClock, LuCalendar, LuTrendingDown as LuTrendingDownIcon, LuLock,
  LuX, LuRefreshCw, LuCoins, LuPercent, LuFileText, LuCircleAlert as LuAlertCircleIcon, LuSparkles
} from 'react-icons/lu'
import {
  Btn, Badge, StatusBadge, Input, Select, Modal,
  Table, TR, TD, PageHeader, StatCard, Card, Pagination, showToast, confirmAction, showLoading, closeLoading,
  TabBar, LoadingState, ErrorAlert, TableSkeleton, EmptyState,
} from '../components/ui'
import { fmt, fastDeepEqual } from '../lib/utils'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import { useRealtimeSync, triggerDataSync, SyncButton } from '../lib/realtimeSync'
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'
import { TbCurrencyPeso } from 'react-icons/tb'
import EmployeePayslipModal from '../components/payslip/EmployeePayslipModal'
import PayrollWorkflowModal from '../components/payroll/PayrollWorkflowModal'

export default function PayrollPage() {
  const [searchParams] = useSearchParams()
  const { user } = useAuth()
  const isStoreAdmin = user?.role === 'Store Administrator' || user?.role === 'Store Admin'
  const userBranchName = user?.employee?.branch?.name || (typeof user?.employee?.branch === 'string' ? user.employee.branch : '') || user?.branch?.name || (typeof user?.branch === 'string' ? user.branch : '') || ''

  const [branches, setBranches] = useState([])
  const [branchFilter, setBranchFilter] = useState(isStoreAdmin ? (userBranchName || 'All') : 'All')

  const [payroll, setPayroll] = useState(() => {
    try {
      const saved = sessionStorage.getItem('pace_cached_payroll')
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })
  const [periods, setPeriods] = useState(() => {
    try {
      const saved = sessionStorage.getItem('pace_cached_periods')
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })
  const [selectedPeriodId, setSelectedPeriodId] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(() => {
    return !sessionStorage.getItem('pace_cached_payroll')
  })
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 10

  // Modals
  const [payslip, setPayslip] = useState(null)
  const [viewRecord, setViewRecord] = useState(null)
  const [viewModalOpen, setViewModalOpen] = useState(false)
  const [workflowModal, setWorkflowModal] = useState(false)
  const [govContributionsModal, setGovContributionsModal] = useState(false)
  const [newPeriodModal, setNewPeriodModal] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)

  // Payout Release & Proof of Payment Modal / Lightbox State
  const [payModalRecord, setPayModalRecord] = useState(null)
  const [payProofFile, setPayProofFile] = useState(null)
  const [payProofPreview, setPayProofPreview] = useState('')
  const [payingPayroll, setPayingPayroll] = useState(false)
  const [proofLightboxRecord, setProofLightboxRecord] = useState(null)

  const handleOpenPayModal = (record) => {
    if (payProofPreview) URL.revokeObjectURL(payProofPreview)
    setPayProofFile(null)
    setPayProofPreview('')
    setPayModalRecord(record)
  }

  const handlePayProofChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (payProofPreview) URL.revokeObjectURL(payProofPreview)
    setPayProofFile(file)
    setPayProofPreview(URL.createObjectURL(file))
  }

  const handleClosePayModal = () => {
    if (payProofPreview) URL.revokeObjectURL(payProofPreview)
    setPayProofFile(null)
    setPayProofPreview('')
    setPayModalRecord(null)
  }

  const handleOpenViewModal = (record) => {
    setViewRecord(record)
    setViewModalOpen(true)
  }

  // Generate Payroll Modal State
  const [generateModal, setGenerateModal] = useState(false)
  const [generatePeriodId, setGeneratePeriodId] = useState('')
  const [generateScope, setGenerateScope] = useState('all') // 'all' | 'single'
  const [modalBranch, setModalBranch] = useState(isStoreAdmin ? (userBranchName || 'All') : 'All')
  const [generateEmployeeId, setGenerateEmployeeId] = useState('')
  const [recalculateExisting, setRecalculateExisting] = useState(true)
  const [requireAttendance, setRequireAttendance] = useState(false)
  const [employeeList, setEmployeeList] = useState([])
  const [unprocessedEmployees, setUnprocessedEmployees] = useState([])
  const [eligibleCount, setEligibleCount] = useState(0)

  // Gov Tax Deduction State (SSS, Philhealth, Pag-ibig)
  const [govTaxDeductionPreset, setGovTaxDeductionPreset] = useState('all')
  const [deductSss, setDeductSss] = useState(true)
  const [deductPhilhealth, setDeductPhilhealth] = useState(true)
  const [deductPagibig, setDeductPagibig] = useState(true)

  const handleGovTaxPresetChange = (preset) => {
    setGovTaxDeductionPreset(preset)
    if (preset === 'sss') {
      setDeductSss(true); setDeductPhilhealth(false); setDeductPagibig(false)
    } else if (preset === 'philhealth') {
      setDeductSss(false); setDeductPhilhealth(true); setDeductPagibig(false)
    } else if (preset === 'pagibig') {
      setDeductSss(false); setDeductPhilhealth(false); setDeductPagibig(true)
    } else if (preset === 'none') {
      setDeductSss(false); setDeductPhilhealth(false); setDeductPagibig(false)
    } else if (preset === 'all') {
      setDeductSss(true); setDeductPhilhealth(true); setDeductPagibig(true)
    }
  }

  const handleToggleDeduction = (type, val) => {
    if (type === 'sss') setDeductSss(Boolean(val))
    else if (type === 'philhealth') setDeductPhilhealth(Boolean(val))
    else if (type === 'pagibig') setDeductPagibig(Boolean(val))
  }

  const selectedEmp = useMemo(
    () => employeeList.find(e => String(e.employee_id) === String(generateEmployeeId)),
    [employeeList, generateEmployeeId]
  )

  // New Period Form
  const [periodName, setPeriodName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [payDate, setPayDate] = useState('')

  // Common Filters
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [weeklyOffset, setWeeklyOffset] = useState(0)

  // Helper to calculate weekly cutoff range (Monday to Saturday, 6 working days)
  const getWeeklyCutoffRange = (offsetWeeks = 0) => {
    const now = new Date()
    const dayOfWeek = now.getDay() // 0 = Sun, 1 = Mon ... 6 = Sat
    const diffToMon = now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1) + (offsetWeeks * 7)
    const mon = new Date(now.getFullYear(), now.getMonth(), diffToMon)
    const sat = new Date(mon)
    sat.setDate(mon.getDate() + 5)
    const fmtYMD = (d) => {
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      return `${y}-${m}-${day}`
    }
    const fmtLabel = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    return {
      fromDate: fmtYMD(mon),
      toDate: fmtYMD(sat),
      label: `${fmtLabel(mon)} - ${fmtLabel(sat)}, ${sat.getFullYear()}`
    }
  }

  const handleSelectWeeklyCycle = (offset) => {
    setWeeklyOffset(offset)
    const range = getWeeklyCutoffRange(offset)
    setFromDate(range.fromDate)
    setToDate(range.toDate)
    setPage(1)
    const matching = periods.find(p =>
      (p.start_date === range.fromDate && p.end_date === range.toDate) ||
      (p.period_name && p.period_name.includes(range.fromDate))
    )
    const pId = matching ? matching.period_id.toString() : ''
    setSelectedPeriodId(pId)
    loadData(pId || undefined, { fromDate: range.fromDate, toDate: range.toDate, branch: branchFilter, status: filterStatus })
  }

  // Fetch branches on mount
  useEffect(() => {
    let mounted = true
    api.branches.getAll()
      .then(res => {
        if (!mounted) return
        const bList = Array.isArray(res) ? res : (res?.branches || [])
        setBranches(bList)
      })
      .catch(err => {
        console.warn('Could not fetch branches for payroll:', err)
      })
    return () => { mounted = false }
  }, [])

  // Auto-sync branchFilter and modalBranch for Store Admin when user profile loads
  useEffect(() => {
    if (isStoreAdmin && userBranchName) {
      setBranchFilter(userBranchName)
      setModalBranch(userBranchName)
    }
  }, [isStoreAdmin, userBranchName])

  const inFlightRef = useRef(false)

  const loadData = async (targetPeriodId, customParams = {}, silent = false, signal) => {
    const isBg = silent || payroll.length > 0
    if (inFlightRef.current && silent) return
    inFlightRef.current = true
    if (!isBg) setLoading(true)
    if (!isBg) setError('')
    try {
      const activeBranch = customParams.branch !== undefined ? customParams.branch : branchFilter
      const branchParam = (activeBranch && activeBranch !== 'All') ? activeBranch : undefined

      if (user?.role === 'Employee') {
        const data = await api.payroll.getMePayroll({
          period_id: targetPeriodId !== undefined ? (targetPeriodId || undefined) : (selectedPeriodId || undefined),
          from_date: customParams.fromDate !== undefined ? (customParams.fromDate || undefined) : (fromDate || undefined),
          to_date: customParams.toDate !== undefined ? (customParams.toDate || undefined) : (toDate || undefined),
          status: customParams.status !== undefined ? (customParams.status || undefined) : (filterStatus || undefined),
        }, { signal })
        if (signal?.aborted) return
        const newPay = data?.payroll || []
        setPayroll(prev => fastDeepEqual(prev, newPay) ? prev : newPay)
        setViewRecord(prev => {
          if (!prev) return null
          const updated = newPay.find(p => p.payroll_id === prev.payroll_id)
          return updated ? (fastDeepEqual(prev, updated) ? prev : updated) : prev
        })
        if (periods.length === 0) {
          const periodsData = await api.payroll.getPeriods({ signal }).catch(() => ({ periods: [] }))
          const newPer = periodsData?.periods || []
          setPeriods(prev => fastDeepEqual(prev, newPer) ? prev : newPer)
        }
        try {
          sessionStorage.setItem('pace_cached_payroll', JSON.stringify(newPay))
        } catch (e) { }
      } else {
        const data = await api.payroll.getAll({
          period_id: targetPeriodId !== undefined ? (targetPeriodId || undefined) : (selectedPeriodId || undefined),
          from_date: customParams.fromDate !== undefined ? (customParams.fromDate || undefined) : (fromDate || undefined),
          to_date: customParams.toDate !== undefined ? (customParams.toDate || undefined) : (toDate || undefined),
          status: customParams.status !== undefined ? (customParams.status || undefined) : (filterStatus || undefined),
          branch: branchParam,
        }, { signal })
        if (signal?.aborted) return
        const newPay = data?.payroll || []
        const newPer = data?.periods || []
        const newUnp = data?.unprocessed_employees || []
        setPayroll(prev => fastDeepEqual(prev, newPay) ? prev : newPay)
        setPeriods(prev => fastDeepEqual(prev, newPer) ? prev : newPer)
        setUnprocessedEmployees(prev => fastDeepEqual(prev, newUnp) ? prev : newUnp)
        setEligibleCount(data?.eligible_count || 0)
        setViewRecord(prev => {
          if (!prev) return null
          const updated = newPay.find(p => p.payroll_id === prev.payroll_id)
          return updated ? (fastDeepEqual(prev, updated) ? prev : updated) : prev
        })
        try {
          sessionStorage.setItem('pace_cached_payroll', JSON.stringify(newPay))
          sessionStorage.setItem('pace_cached_periods', JSON.stringify(newPer))
        } catch (e) { }
        if (!selectedPeriodId && data?.periods?.length > 0 && targetPeriodId === undefined) {
          setSelectedPeriodId(data.periods[0].period_id.toString())
        }
      }
    } catch (err) {
      if (err?.name === 'AbortError') return
      console.error('Failed to load payroll:', err)
      if (!isBg) setError(err.message || 'Failed to fetch payroll records')
    } finally {
      inFlightRef.current = false
      if (!isBg) setLoading(false)
    }
  }

  const loadEmployees = async (targetBranch) => {
    try {
      const activeBranch = targetBranch !== undefined
        ? targetBranch
        : (isStoreAdmin ? userBranchName : (branchFilter !== 'All' ? branchFilter : undefined))
      const branchParam = (activeBranch && activeBranch !== 'All') ? activeBranch : undefined
      const res = await api.payroll.getEligibleEmployees({
        branch: branchParam,
      })
      const employees = res?.employees || []
      setEmployeeList(employees)
    } catch (e) {
      console.error('Failed to load active employees:', e)
    }
  }

  useEffect(() => {
    loadData()
    if (user?.role !== 'Employee') {
      loadEmployees()
    }
  }, [])

  // On-demand click-driven synchronization
  const { sync: syncPayroll, isSyncing: isSyncingPayroll } = useRealtimeSync(
    (_, signal) => loadData(selectedPeriodId, { branch: branchFilter, fromDate, toDate, status: filterStatus }, false, signal),
    [],
    { module: 'payroll' }
  )

  useEffect(() => {
    const id = searchParams.get('id')
    if (id) {
      openPayslip({ payroll_id: id })
    }
  }, [searchParams])

  const handlePeriodChange = (id) => {
    setSelectedPeriodId(id)
    loadData(id, { branch: branchFilter, fromDate, toDate, status: filterStatus })
  }

  // All "Generate Payroll" triggers open the 4-step Payroll Generation, Calculation & Approval workflow
  const handleOpenGenerateModal = () => {
    setWorkflowModal(true)
  }

  const handleGenerateSubmit = async (e) => {
    if (e) e.preventDefault()

    setGenerating(true)
    showLoading('Calculating and generating payroll for employees...')
    try {
      const targetBranch = modalBranch !== 'All' ? modalBranch : (branchFilter !== 'All' ? branchFilter : undefined)
      const res = await api.payroll.generate(
        user?.user_id || 1,
        generatePeriodId || undefined,
        {
          branch: targetBranch,
          employee_id: generateScope === 'all' ? undefined : generateEmployeeId,
          recalculate: recalculateExisting,
          require_attendance: requireAttendance,
          include_sss: deductSss,
          include_philhealth: deductPhilhealth,
          include_pagibig: deductPagibig,
        }
      )
      showToast(res.message || 'Payroll generated successfully for employees', 'success')
      setGenerateModal(false)

      // Refresh periods in case a new period was auto-created by backend
      const periodsData = await api.payroll.getPeriods().catch(() => ({ periods: [] }))
      if (periodsData.periods?.length > 0) {
        setPeriods(periodsData.periods)
        const targetId = res.period?.period_id ? res.period.period_id.toString() : periodsData.periods[0].period_id.toString()
        setSelectedPeriodId(targetId)
        await loadData(targetId, { branch: targetBranch }, true)
      } else {
        await loadData(selectedPeriodId, { branch: targetBranch }, true)
      }

      triggerDataSync('payroll')
    } catch (err) {
      showToast(err.message || 'Failed to generate payroll', 'error')
    } finally {
      setGenerating(false)
      closeLoading()
    }
  }

  const handleGenerate = async () => {
    handleOpenGenerateModal()
  }

  const handleGenerate13thMonth = async () => {
    const confirmed = await confirmAction('Generate 13th Month Pay', 'Are you sure you want to generate 13th Month Pay? This is typically done at the end of the year.', 'Yes, Generate')
    if (!confirmed) return

    setGenerating(true)
    showLoading('Processing 13th Month Pay...')
    try {
      const res = await api.payroll.generate13thMonth(user?.user_id || 1, {
        branch: branchFilter !== 'All' ? branchFilter : undefined,
      })
      showToast(res.message || '13th Month Pay generated successfully', 'success')
      loadData(undefined, { branch: branchFilter }, true)
      triggerDataSync('payroll')
    } catch (err) {
      showToast(err.message || 'Failed to generate 13th month pay', 'error')
    } finally {
      setGenerating(false)
      closeLoading()
    }
  }

  const handleApprove = async (payrollId) => {
    const confirmed = await confirmAction('Approve Payroll', 'Are you sure you want to approve this payroll record?', 'Yes, Approve')
    if (!confirmed) return

    showLoading('Approving payroll...')
    try {
      await api.payroll.approve(payrollId, user?.user_id || 1)
      setPayroll(prev => prev.map(p => p.payroll_id === payrollId ? { ...p, status: 'Approved' } : p))
      showToast('Payroll record approved', 'success')
      triggerDataSync('payroll')
    } catch (err) {
      showToast(err.message || 'Failed to approve payroll', 'error')
    } finally {
      closeLoading()
    }
  }

  const handleMarkPaid = (recordOrId) => {
    const rec = typeof recordOrId === 'object'
      ? recordOrId
      : payroll.find(p => p.payroll_id === recordOrId)
    if (rec) {
      handleOpenPayModal(rec)
    }
  }

  const handleConfirmPaySubmit = async (e) => {
    if (e) e.preventDefault()
    if (!payModalRecord) return

    const method = payModalRecord.payout_method || payModalRecord.pay_type || 'Cash'
    setPayingPayroll(true)
    try {
      let body = { payout_method: method }
      if (payProofFile) {
        const fd = new FormData()
        fd.append('payout_method', method)
        fd.append('proof_of_payment', payProofFile)
        body = fd
      }

      const res = await api.payroll.markPaid(payModalRecord.payroll_id, body)
      const proofUrl = res?.proof_of_payment || payModalRecord.proof_of_payment || null

      setPayroll(prev => prev.map(p =>
        p.payroll_id === payModalRecord.payroll_id
          ? { ...p, status: 'Paid', payout_method: method, proof_of_payment: proofUrl }
          : p
      ))
      showToast('Payroll marked as Paid & payout recorded!', 'success')
      handleClosePayModal()
      triggerDataSync('payroll')
    } catch (err) {
      showToast(err.message || 'Failed to update payroll status', 'error')
    } finally {
      setPayingPayroll(false)
    }
  }

  const handleCreatePeriod = async (e) => {
    e.preventDefault()
    if (!periodName || !startDate || !endDate) {
      showToast('Please fill in period name and date range', 'error')
      return
    }

    setSaving(true)
    showLoading('Creating payroll period...')
    try {
      const res = await api.payroll.createPeriod({
        period_name: periodName,
        start_date: startDate,
        end_date: endDate,
        pay_date: payDate || null,
        status: 'Open',
        user_id: user?.user_id || 1,
      })
      showToast('New payroll period created', 'success')
      setNewPeriodModal(false)
      setPeriodName('')
      setStartDate('')
      setEndDate('')
      setPayDate('')
      loadData(res.period?.period_id ? res.period.period_id.toString() : undefined, { branch: branchFilter }, true)
      triggerDataSync('payroll')
    } catch (err) {
      showToast(err.message || 'Failed to create period', 'error')
    } finally {
      setSaving(false)
      closeLoading()
    }
  }

  const openPayslip = async (p) => {
    try {
      if (user?.role === 'Employee') {
        const data = await api.payroll.getMePayslip(p.payroll_id)
        setPayslip(data.record)
      } else if (['Administrator', 'Admin'].includes(user?.role)) {
        // Admin gets the same professional payslip view
        const data = await api.payroll.getPayslip(p.payroll_id)
        setPayslip(data.record)
      } else {
        const data = await api.payroll.getPayslip(p.payroll_id)
        setPayslip(data.record)
      }
    } catch (err) {
      showToast(err.message || 'Failed to fetch payslip details', 'error')
    }
  }

  const handleSearchFilters = () => {
    setPage(1)
    loadData(selectedPeriodId, { fromDate, toDate, status: filterStatus, branch: branchFilter })
  }

  const displayed = useMemo(() => {
    let list = selectedPeriodId
      ? payroll.filter(p => p.period_id?.toString() === selectedPeriodId)
      : payroll
    if (branchFilter && branchFilter !== 'All') {
      list = list.filter(p => (p.branch || '').toLowerCase() === branchFilter.toLowerCase())
    }
    if (search.trim()) {
      const q = search.toLowerCase().trim()
      list = list.filter(p => {
        const name = (p.employee_name || '').toLowerCase()
        const code = (p.employee_code || '').toLowerCase()
        const dept = (p.department || '').toLowerCase()
        const pos = (p.position || '').toLowerCase()
        const br = (p.branch || '').toLowerCase()
        return name.includes(q) || code.includes(q) || dept.includes(q) || pos.includes(q) || br.includes(q)
      })
    }
    return list
  }, [payroll, selectedPeriodId, branchFilter, search])

  const isManager = ['Administrator', 'Admin', 'Store Administrator', 'Store Admin'].includes(user?.role)

  const total = displayed.length
  const paginated = displayed.slice((page - 1) * pageSize, page * pageSize)

  // Live aggregates for weekly payroll
  const totalWeeklyBase = displayed.reduce((acc, p) => acc + (p.weekly_base_pay || p.basic_salary || 0), 0)
  const totalWorkHours = displayed.reduce((acc, p) => acc + (p.work_hours ?? p.regular_hours ?? 0), 0)
  const totalAbsenceDays = displayed.reduce((acc, p) => acc + (p.absence_days || 0), 0)
  const totalAbsenceDeductions = displayed.reduce((acc, p) => acc + (p.absence_deduction || 0), 0)
  const totalLateMinutes = displayed.reduce((acc, p) => acc + (p.late_minutes || 0), 0)
  const totalLateDeductions = displayed.reduce((acc, p) => acc + (p.late_deduction || p.late_penalty || 0), 0)
  const totalUndertimeMinutes = displayed.reduce((acc, p) => acc + (p.undertime_minutes || 0), 0)
  const totalUndertimeDeductions = displayed.reduce((acc, p) => acc + (p.undertime_deduction || 0), 0)
  const totalLateAndUtDeds = totalLateDeductions + totalUndertimeDeductions
  const totalGross = displayed.reduce((acc, p) => acc + (p.gross_pay || 0), 0)
  const totalDeductions = displayed.reduce((acc, p) => acc + (p.total_deductions || 0), 0)
  const totalNet = displayed.reduce((acc, p) => acc + (p.net_pay || 0), 0)

  // Group by department for chart
  const deptSummary = useMemo(() => {
    return Object.values(displayed.reduce((acc, p) => {
      const dept = p.department || 'General'
      if (!acc[dept]) acc[dept] = { department: dept, Net: 0, Deductions: 0, Gross: 0 }
      acc[dept].Net += (p.net_pay || 0)
      acc[dept].Deductions += (p.total_deductions || 0)
      acc[dept].Gross += (p.gross_pay || 0)
      return acc
    }, {}))
  }, [displayed])

  return (
    <div className="space-y-6">
      {user?.role !== 'Employee' ? (
        <PageHeader
          title="Payroll & Compensation"
          subtitle="Manage weekly salary generation, statutory deductions, approval, and payslips"
          action={
            isManager ? (
              <div className="flex flex-wrap items-center gap-2">
                <SyncButton sync={syncPayroll} isSyncing={isSyncingPayroll} label="Sync" />
                <button
                  type="button"
                  id="btn-gov-contributions-modal"
                  onClick={() => setGovContributionsModal(true)}
                  className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs cursor-pointer shadow-md shadow-emerald-600/20 transition-all active:scale-95 border border-emerald-400/30"
                  title="Open Philippine Government Contributions & Tax Deduction Modal"
                >
                  <LuShieldCheck className="w-4 h-4 text-emerald-100" />
                  <span>Contributions &amp; Tax</span>
                </button>
                <button
                  type="button"
                  id="btn-generate-payroll"
                  onClick={() => setWorkflowModal(true)}
                  disabled={generating}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs cursor-pointer shadow-md transition-all active:scale-95 disabled:opacity-50"
                  title="Open Multi-Step Payroll Calculation & Approval Workflow"
                >
                  <FiZap className="w-4 h-4 text-amber-300" />
                  <span>Generate Payroll</span>
                </button>
                <button
                  type="button"
                  onClick={handleGenerate13thMonth}
                  disabled={generating}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold text-xs cursor-pointer shadow-2xs transition-colors disabled:opacity-50"
                >
                  <FiGift className="w-4 h-4" />
                  <span>{generating ? 'Processing...' : '13th Month Pay'}</span>
                </button>
              </div>
            ) : null
          }
        />
      ) : (
        <PageHeader
          title="My Payslips"
          subtitle="View and download your official company pay stubs and salary history"
          action={
            <SyncButton sync={syncPayroll} isSyncing={isSyncingPayroll} label="Sync" />
          }
        />
      )}

      {/* Weekly Cutoff Cycle Switcher Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-primary/10 rounded-2xl border border-emerald-500/20 shadow-2xs">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
            <FiCalendar className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-bold text-foreground flex items-center gap-2">
              <span>Weekly Payroll Cutoff Cycle</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                Mon - Sat &bull; 6 Working Days (48h Standard)
              </span>
            </div>
            <div className="text-[11px] text-muted-foreground">
              Selected Cycle: <strong className="text-foreground">{getWeeklyCutoffRange(weeklyOffset).label}</strong>
            </div>
          </div>
        </div>

        {/* Quick Weekly Cycle Buttons */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {[
            { label: 'This Week', offset: 0 },
            { label: 'Last Week', offset: -1 },
            { label: '2 Weeks Ago', offset: -2 },
            { label: 'Next Week', offset: 1 },
          ].map(cycle => (
            <button
              key={cycle.offset}
              type="button"
              onClick={() => handleSelectWeeklyCycle(cycle.offset)}
              className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer text-xs ${
                weeklyOffset === cycle.offset
                  ? 'bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-500/30'
                  : 'bg-card hover:bg-muted text-muted-foreground hover:text-foreground border border-border'
              }`}
            >
              {cycle.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => handleSelectWeeklyCycle(weeklyOffset - 1)}
            title="Previous Week"
            className="px-2.5 py-1.5 rounded-xl bg-card hover:bg-muted text-muted-foreground hover:text-foreground border border-border cursor-pointer font-bold text-xs"
          >
            &larr; Prev
          </button>
          <button
            type="button"
            onClick={() => handleSelectWeeklyCycle(weeklyOffset + 1)}
            title="Next Week"
            className="px-2.5 py-1.5 rounded-xl bg-card hover:bg-muted text-muted-foreground hover:text-foreground border border-border cursor-pointer font-bold text-xs"
          >
            Next &rarr;
          </button>
        </div>
      </div>

      {/* 6 Weekly Payroll Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard
          title="Weekly Base Pay"
          value={fmt(totalWeeklyBase)}
          sub="standard 6-day Mon-Sat base"
          icon={<TbCurrencyPeso className="w-5 h-5 text-blue-500" />}
          color="blue"
        />
        <StatCard
          title="Total Work Hours"
          value={`${totalWorkHours.toFixed(1)} hrs`}
          sub="actual rendered time"
          icon={<FiClock className="w-5 h-5 text-emerald-500" />}
          color="green"
        />
        <StatCard
          title="Total Absences"
          value={`${totalAbsenceDays} days`}
          sub={`-${fmt(totalAbsenceDeductions)} (-₱500/day)`}
          icon={<FiAlertCircle className="w-5 h-5 text-rose-500" />}
          color="red"
        />
        <StatCard
          title="Late & Undertime"
          value={`${totalLateMinutes}m / ${totalUndertimeMinutes}m`}
          sub={`-${fmt(totalLateAndUtDeds)} tardiness`}
          icon={<FiAlertTriangle className="w-5 h-5 text-amber-500" />}
          color="amber"
        />
        <StatCard
          title="Total Deductions"
          value={`- ${fmt(totalDeductions)}`}
          sub="statutory, absence & late"
          icon={<FiTrendingDown className="w-5 h-5 text-rose-500" />}
          color="red"
        />
        <StatCard
          title="Final Take-Home Pay"
          value={fmt(totalNet)}
          sub="total net take-home payout"
          icon={<FiCreditCard className="w-5 h-5 text-emerald-500" />}
          color="green"
        />
      </div>

      {/* Payroll Summary Chart (Admin Only) */}
      {user?.role !== 'Employee' && displayed.length > 0 && (
        <Card noPad className="p-4 border border-border">
          <h3 className="text-xs font-bold text-foreground mb-4 uppercase tracking-wide">Payroll Distribution by Department</h3>
          <div className="h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={deptSummary} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="department" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={v => `₱${v >= 1000 ? (v / 1000) + 'k' : v}`} />
                <Tooltip
                  formatter={(value) => fmt(value)}
                  contentStyle={{ borderRadius: '12px', border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))', color: 'hsl(var(--foreground))', fontSize: '12px' }}
                  cursor={{ fill: 'hsl(var(--muted) / 0.4)' }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '11px' }} />
                <Bar dataKey="Net" name="Net Pay" fill="#10b981" barSize={32} />
                <Line dataKey="Gross" name="Gross Pay" type="monotone" stroke="#8b5cf6" strokeWidth={3} dot={false} activeDot={{ r: 6 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {error && <ErrorAlert message={error} onRetry={loadData} />}

      {/* Filters */}
      <Card noPad className="p-3.5 border border-border">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3 items-end">
          {user?.role !== 'Employee' && (
            <div className="sm:col-span-2 lg:col-span-2">
              <label className="text-[11px] font-bold text-muted-foreground uppercase mb-1 block">Employee Search</label>
              <div className="relative">
                <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search name, code, branch, dept..."
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(1); }}
                  className="w-full pl-9 pr-8 py-1.5 text-xs border border-border rounded-lg bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-muted-foreground/70"
                />
                {search && (
                  <button type="button" onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer">
                    <FiX className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          )}
          {user?.role !== 'Employee' && (
            <div>
              <label className="text-[11px] font-bold text-muted-foreground uppercase mb-1 block">
                Branch {isStoreAdmin ? '(Assigned)' : ''}
              </label>
              <select
                value={branchFilter}
                disabled={isStoreAdmin}
                onChange={e => {
                  const val = e.target.value
                  setBranchFilter(val)
                  setPage(1)
                  loadData(selectedPeriodId, { fromDate, toDate, status: filterStatus, branch: val })
                  loadEmployees(val)
                }}
                className="w-full px-3 py-1.5 text-xs border border-border rounded-lg bg-card text-foreground cursor-pointer disabled:opacity-75 focus:outline-none focus:ring-2 focus:ring-primary/20"
                title={isStoreAdmin ? `Locked to ${userBranchName || 'assigned branch'}` : 'Filter by branch'}
              >
                <option value="All">All Branches</option>
                {branches.map(b => (
                  <option key={b.id || b.branch_id || b.name} value={b.name}>{b.name}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="text-[11px] font-bold text-muted-foreground uppercase mb-1 block">From Date</label>
            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="w-full px-3 py-1.5 text-xs border border-border rounded-lg bg-card text-foreground" />
          </div>
          <div>
            <label className="text-[11px] font-bold text-muted-foreground uppercase mb-1 block">To Date</label>
            <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="w-full px-3 py-1.5 text-xs border border-border rounded-lg bg-card text-foreground" />
          </div>
          <div>
            <label className="text-[11px] font-bold text-muted-foreground uppercase mb-1 block">Payroll Period</label>
            <select value={selectedPeriodId} onChange={e => handlePeriodChange(e.target.value)} className="w-full px-3 py-1.5 text-xs border border-border rounded-lg bg-card text-foreground">
              <option value="">All Periods</option>
              {periods.map(prd => <option key={prd.period_id} value={prd.period_id}>{prd.period_name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-bold text-muted-foreground uppercase mb-1 block">Status</label>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="w-full px-3 py-1.5 text-xs border border-border rounded-lg bg-card text-foreground">
              <option value="">All</option>
              <option value="Paid">Paid</option>
              <option value="Approved">Approved</option>
              <option value="Processing">Processing</option>
              <option value="Pending">Pending</option>
            </select>
          </div>
          <div className={user?.role === 'Employee' ? '' : 'sm:col-span-1'}>
            <button onClick={handleSearchFilters} className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground font-semibold text-xs rounded-lg hover:bg-primary/90 transition-all cursor-pointer shadow-sm">
              <FiSearch className="w-3.5 h-3.5" />
              <span>Search</span>
            </button>
          </div>
        </div>
      </Card>

      {/* Unprocessed Eligible Employees Alert Banner */}
      {user?.role !== 'Employee' && unprocessedEmployees.length > 0 && selectedPeriodId && (
        <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-start gap-2.5">
            <FiAlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-xs">
                {unprocessedEmployees.length} Eligible Employee{unprocessedEmployees.length > 1 ? 's' : ''} not yet generated for this period{branchFilter !== 'All' ? ` (${branchFilter})` : ''}
              </div>
              <div className="text-[11px] opacity-80 mt-0.5">
                Missing from period: <span className="font-medium">{unprocessedEmployees.map(e => `${e.employee_name}${e.branch ? ` • ${e.branch}` : ''}`).join(', ')}</span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setWorkflowModal(true)}
            className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shrink-0 cursor-pointer shadow-sm transition-all active:scale-95 flex items-center gap-1.5"
          >
            <FiZap className="w-3.5 h-3.5" />
            <span>Generate Payroll Now</span>
          </button>
        </div>
      )}

      {/* Table */}
      <Card noPad className="border border-border overflow-hidden">
        {loading ? (
          <TableSkeleton rows={6} cols={12} />
        ) : paginated.length === 0 ? (
          <EmptyState
            icon={<TbCurrencyPeso className="w-12 h-12 text-muted-foreground/30 mx-auto" />}
            title="No payroll entries found for this period"
            description="Click 'Generate Payroll' to automatically compute salaries and deductions for active employees."
            action={
              isManager ? (
                <button
                  type="button"
                  onClick={handleOpenGenerateModal}
                  disabled={generating}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl cursor-pointer shadow-md transition-all active:scale-95 disabled:opacity-50"
                >
                  <FiZap className="w-4 h-4 text-amber-300" />
                  <span>{generating ? 'Generating...' : 'Generate Payroll Now'}</span>
                </button>
              ) : null
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[1260px]">
                <thead>
                  <tr className="border-b border-border bg-muted/50 text-muted-foreground uppercase font-semibold text-[11px]">
                    <th className="py-3 px-3 text-left">Code</th>
                    <th className="py-3 px-4 text-left">Employee Name</th>
                    <th className="py-3 px-3 text-left">Branch</th>
                    <th className="py-3 px-3 text-left">Payout Method</th>
                    <th className="py-3 px-3 text-right">Weekly Base Pay</th>
                    <th className="py-3 px-3 text-right">Total Work Hours</th>
                    <th className="py-3 px-3 text-right">Total Absences</th>
                    <th className="py-3 px-3 text-right">Total Late</th>
                    <th className="py-3 px-3 text-right">Total Undertime</th>
                    <th className="py-3 px-3 text-right">Total Deductions</th>
                    <th className="py-3 px-3 text-right">Final Take-Home Pay</th>
                    <th className="py-3 px-3 text-center min-w-[110px]">Status</th>
                    <th className="py-3 px-3 text-center min-w-[95px]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {paginated.map((p, i) => {
                    const payoutMethod = p.payout_method || p.pay_type || 'Cash'
                    const isDigitalPayout = payoutMethod === 'E-Wallet' || payoutMethod === 'Online Bank'
                    return (
                    <tr key={p.payroll_id || i} className={`hover:bg-muted/40 transition-colors ${i % 2 === 1 ? 'bg-muted/10' : ''}`}>
                      <td className="py-3 px-3 font-mono font-bold text-foreground">{p.employee_code}</td>
                      <td className="py-3 px-4 font-semibold text-foreground">
                        <div>{p.employee_name}</div>
                        <div className="text-[10px] text-muted-foreground font-normal">
                           {p.position || 'Staff'}{p.department ? ` • ${p.department}` : ''}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-left">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 max-w-[190px] truncate" title={p.branch || 'Unassigned'}>
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"></span>
                          <span className="truncate">{p.branch || 'Unassigned'}</span>
                        </span>
                      </td>
                      <td className="py-3 px-3 text-left">
                        <div className="flex flex-col gap-0.5">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold w-fit border ${
                            payoutMethod === 'E-Wallet'
                              ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20'
                              : payoutMethod === 'Online Bank'
                                ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20'
                                : 'bg-muted text-foreground border-border'
                          }`}>
                            <FiCreditCard className="w-3 h-3 shrink-0" />
                            <span>
                              {payoutMethod === 'E-Wallet'
                                ? `E-Wallet (${p.ewallet_provider || 'GCash/Maya'})`
                                : payoutMethod === 'Online Bank'
                                  ? `Bank (${p.bank_name || 'Online'})`
                                  : 'Cash'}
                            </span>
                          </span>
                          {payoutMethod === 'E-Wallet' && (p.ewallet_account_no || p.ewallet_account_name) && (
                            <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[175px]" title={`${p.ewallet_account_name || ''} • ${p.ewallet_account_no || ''}`}>
                              {p.ewallet_account_name ? `${p.ewallet_account_name} • ` : ''}{p.ewallet_account_no}
                            </span>
                          )}
                          {payoutMethod === 'Online Bank' && (p.bank_account_no || p.bank_account_name) && (
                            <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[175px]" title={`${p.bank_account_name || ''} • ${p.bank_account_no || ''}`}>
                              {p.bank_account_name ? `${p.bank_account_name} • ` : ''}{p.bank_account_no}
                            </span>
                          )}
                          {p.proof_of_payment && (
                            <button
                              type="button"
                              onClick={() => setProofLightboxRecord(p)}
                              className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer w-fit mt-0.5"
                            >
                              <FiEye className="w-3 h-3" />
                              <span>View Proof of Payment</span>
                            </button>
                          )}
                        </div>
                      </td>
                      {/* Weekly Base Pay */}
                      <td className="py-3 px-3 text-right font-mono">
                        <div className="font-bold text-foreground">{fmt(p.weekly_base_pay || p.basic_salary)}</div>
                        <div className="text-[10px] text-muted-foreground">{fmt(p.daily_rate || 500)}/d</div>
                      </td>
                      {/* Total Work Hours */}
                      <td className="py-3 px-3 text-right font-mono">
                        <div className="font-semibold text-foreground">{Number(p.work_hours ?? p.regular_hours ?? 0)}h</div>
                        <div className="text-[10px] text-muted-foreground">of 48h std</div>
                      </td>
                      {/* Total Absences */}
                      <td className="py-3 px-3 text-right font-mono">
                        <div className={`font-semibold ${p.absence_days > 0 ? 'text-rose-600 dark:text-rose-400 font-bold' : 'text-muted-foreground'}`}>
                          {p.absence_days > 0 ? `${p.absence_days}d` : '0d'}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {p.absence_deduction > 0 ? `-${fmt(p.absence_deduction)}` : 'No absence'}
                        </div>
                      </td>
                      {/* Total Late */}
                      <td className="py-3 px-3 text-right font-mono">
                        <div className={`font-semibold ${p.late_minutes > 0 ? 'text-amber-600 dark:text-amber-400 font-bold' : 'text-muted-foreground'}`}>
                          {p.late_minutes > 0 ? `${p.late_minutes}m` : '0m'}
                        </div>
                        <div className="text-[10px] text-rose-500">
                          {p.late_deduction > 0 || p.late_penalty > 0 ? `-${fmt(p.late_deduction || p.late_penalty)}` : 'On time'}
                        </div>
                      </td>
                      {/* Total Undertime */}
                      <td className="py-3 px-3 text-right font-mono">
                        <div className={`font-semibold ${p.undertime_minutes > 0 ? 'text-amber-600 dark:text-amber-400 font-bold' : 'text-muted-foreground'}`}>
                          {p.undertime_minutes > 0 ? `${p.undertime_minutes}m` : '0m'}
                        </div>
                        <div className="text-[10px] text-rose-500">
                          {p.undertime_deduction > 0 ? `-${fmt(p.undertime_deduction)}` : 'Full shift'}
                        </div>
                      </td>
                      {/* Total Deductions */}
                      <td className="py-3 px-3 text-right font-mono font-bold text-rose-600 dark:text-rose-400">
                        -{fmt(p.total_deductions)}
                      </td>
                      {/* Final Take-Home Pay (Net Pay) */}
                      <td className="py-3 px-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                        {fmt(p.net_pay)}
                      </td>
                      <td className="py-3 px-3 text-center whitespace-nowrap align-middle"><StatusBadge status={p.status} /></td>
                      <td className="py-2.5 px-3 text-center align-middle whitespace-nowrap">
                        <div className="flex flex-col items-center justify-center gap-1 w-[94px] mx-auto">
                          {/* Upper: VIEW */}
                          <button
                            type="button"
                            id={`btn-view-payroll-${p.payroll_id || i}`}
                            onClick={() => handleOpenViewModal(p)}
                            title="View detailed payroll & attendance metrics"
                            className="w-full inline-flex items-center justify-center gap-1.5 px-2 py-1 text-xs rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 font-semibold cursor-pointer transition-all shadow-2xs active:scale-95"
                          >
                            <FiEye className="w-3.5 h-3.5" />
                            <span>View</span>
                          </button>

                          {/* Middle: SLIP */}
                          <button
                            type="button"
                            onClick={() => openPayslip(p)}
                            title="View itemized payslip"
                            className="w-full inline-flex items-center justify-center gap-1.5 px-2 py-1 text-xs rounded-lg border border-border hover:bg-muted font-semibold cursor-pointer transition-all shadow-2xs active:scale-95"
                          >
                            <FiFileText className="w-3.5 h-3.5" />
                            <span>Slip</span>
                          </button>

                          {/* View Proof of Payment button for Employee & Admin */}
                          {p.proof_of_payment && (
                            <button
                              type="button"
                              onClick={() => setProofLightboxRecord(p)}
                              title="View Proof of Payment Receipt"
                              className="w-full inline-flex items-center justify-center gap-1 px-2 py-1 text-[11px] rounded-lg bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25 font-bold cursor-pointer transition-all shadow-2xs active:scale-95"
                            >
                              <FiCheckCircle className="w-3 h-3 shrink-0" />
                              <span>View Proof</span>
                            </button>
                          )}

                          {/* Bottom: PAY / UPLOAD PROOF (or APPROVE) */}
                          {isManager && (p.status === 'Approved' || (p.status === 'Paid' && isDigitalPayout && !p.proof_of_payment)) && (
                            <button
                              type="button"
                              onClick={() => handleMarkPaid(p)}
                              title={p.status === 'Paid' ? 'Upload Proof of Payment' : 'Release Payout & Upload Proof'}
                              className="w-full inline-flex items-center justify-center gap-1.5 px-2 py-1 text-xs rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 font-bold cursor-pointer transition-all shadow-2xs active:scale-95"
                            >
                              <FiCreditCard className="w-3.5 h-3.5" />
                              <span>{p.status === 'Paid' ? 'Add Proof' : 'Pay'}</span>
                            </button>
                          )}
                          {isManager && p.status === 'Draft' && (
                            <button
                              type="button"
                              onClick={() => handleApprove(p.payroll_id)}
                              title="Approve payroll"
                              className="w-full inline-flex items-center justify-center gap-1.5 px-2 py-1 text-xs rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 font-bold cursor-pointer transition-all shadow-2xs active:scale-95"
                            >
                              <FiCheckCircle className="w-3.5 h-3.5" />
                              <span>Approve</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )})}
                </tbody>
              </table>
            </div>
            <Pagination total={total} page={page} pageSize={pageSize} onChange={setPage} />
          </>
        )}
      </Card>

      {/* Payslip Modal */}
      {payslip && (
        <EmployeePayslipModal payslip={payslip} onClose={() => setPayslip(null)} />
      )}

      {/* Admin Release Payout & Proof of Payment Upload Modal */}
      {payModalRecord && (
        <Modal
          isOpen={true}
          title={`Release Payroll Payout — ${payModalRecord.employee_name}`}
          onClose={handleClosePayModal}
          size="md"
        >
          <form onSubmit={handleConfirmPaySubmit} className="space-y-4 text-xs">
            <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 flex items-center justify-between">
              <div>
                <div className="text-[10px] font-bold uppercase text-emerald-800 dark:text-emerald-300">Net Payout Amount</div>
                <div className="text-lg font-mono font-extrabold text-emerald-600 dark:text-emerald-400">{fmt(payModalRecord.net_pay)}</div>
                <div className="text-[11px] text-muted-foreground">{payModalRecord.employee_code} &bull; {payModalRecord.period_name || 'Current Period'}</div>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-bold uppercase text-muted-foreground block">Saved Payout Preference</span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-card border border-emerald-500/30 text-foreground mt-1">
                  <FiCreditCard className="w-3.5 h-3.5 text-emerald-600" />
                  <span>{payModalRecord.payout_method || payModalRecord.pay_type || 'Cash'}</span>
                </span>
              </div>
            </div>

            {/* Saved Account Details for E-Wallet or Online Bank */}
            {(payModalRecord.pay_type === 'E-Wallet' || payModalRecord.payout_method === 'E-Wallet') && (
              <div className="p-3.5 rounded-xl border border-border bg-muted/30 space-y-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Employee E-Wallet Account Details</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <span className="text-[10px] text-muted-foreground block">Provider</span>
                    <span className="font-bold text-foreground">{payModalRecord.ewallet_provider || 'GCash / Maya'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground block">Account Name</span>
                    <span className="font-semibold text-foreground">{payModalRecord.ewallet_account_name || payModalRecord.employee_name}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground block">Account / Mobile No.</span>
                    <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{payModalRecord.ewallet_account_no || 'Not Provided'}</span>
                  </div>
                </div>
              </div>
            )}

            {(payModalRecord.pay_type === 'Online Bank' || payModalRecord.payout_method === 'Online Bank') && (
              <div className="p-3.5 rounded-xl border border-border bg-muted/30 space-y-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Employee Online Bank Account Details</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <span className="text-[10px] text-muted-foreground block">Bank Name</span>
                    <span className="font-bold text-foreground">{payModalRecord.bank_name || 'Online Bank'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground block">Account Name</span>
                    <span className="font-semibold text-foreground">{payModalRecord.bank_account_name || payModalRecord.employee_name}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground block">Account Number</span>
                    <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{payModalRecord.bank_account_no || 'Not Provided'}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Proof of Payment Image Upload */}
            <div className="space-y-2">
              <label className="block font-bold text-foreground uppercase text-[11px] tracking-wider">
                Proof of Payment Receipt Image {((payModalRecord.pay_type || payModalRecord.payout_method) === 'E-Wallet' || (payModalRecord.pay_type || payModalRecord.payout_method) === 'Online Bank') ? '*' : '(Optional for Cash)'}
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={handlePayProofChange}
                className="w-full text-xs text-muted-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-emerald-600 file:text-white hover:file:bg-emerald-700 cursor-pointer border border-border rounded-xl p-1.5 bg-card"
              />
              {payProofPreview && (
                <div className="p-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 flex items-center gap-3">
                  <img
                    src={payProofPreview}
                    alt="Receipt Preview"
                    className="w-24 h-24 object-cover rounded-lg border border-border shadow-xs shrink-0"
                  />
                  <div className="space-y-1 min-w-0">
                    <div className="font-bold text-emerald-700 dark:text-emerald-300 truncate">{payProofFile?.name}</div>
                    <p className="text-[11px] text-muted-foreground">
                      Instant preview ready. This receipt image will be saved to the employee&apos;s payroll record so they can view it anytime.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-border">
              <button
                type="button"
                onClick={handleClosePayModal}
                disabled={payingPayroll}
                className="px-4 py-2 rounded-xl border border-border hover:bg-muted font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={payingPayroll}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50"
              >
                <FiCheckCircle className="w-4 h-4" />
                <span>{payingPayroll ? 'Saving Payout...' : 'Confirm Paid & Save Receipt'}</span>
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Fast Lightbox Modal for Viewing Uploaded Proof of Payment */}
      {proofLightboxRecord && (
        <Modal
          isOpen={true}
          title={`Proof of Payment — ${proofLightboxRecord.employee_name}`}
          onClose={() => setProofLightboxRecord(null)}
          size="lg"
        >
          <div className="space-y-4 text-xs">
            <div className="p-3 rounded-xl bg-muted/40 border border-border flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-bold text-foreground text-sm">{proofLightboxRecord.employee_name} ({proofLightboxRecord.employee_code})</div>
                <div className="text-muted-foreground text-[11px]">
                  Period: {proofLightboxRecord.period_name || proofLightboxRecord.period_dates || 'Payroll Cutoff'} &bull; Payout Method: <strong>{proofLightboxRecord.payout_method || proofLightboxRecord.pay_type || 'Cash'}</strong>
                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] uppercase text-muted-foreground font-bold block">Net Paid</span>
                <span className="font-mono font-extrabold text-base text-emerald-600 dark:text-emerald-400">{fmt(proofLightboxRecord.net_pay)}</span>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-black/5 dark:bg-black/40 p-3 flex items-center justify-center max-h-[65vh] overflow-auto">
              <img
                src={proofLightboxRecord.proof_of_payment}
                alt="Proof of Payment Receipt"
                className="max-w-full max-h-[60vh] object-contain rounded-lg shadow-md"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <a
                href={proofLightboxRecord.proof_of_payment}
                target="_blank"
                rel="noreferrer"
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
              >
                Open Original Image
              </a>
              <button
                type="button"
                onClick={() => setProofLightboxRecord(null)}
                className="px-4 py-2 rounded-xl border border-border hover:bg-muted font-semibold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* New Period Modal */}
      {newPeriodModal && (
        <Modal
          isOpen={true}
          title="Create New Payroll Period"
          onClose={() => setNewPeriodModal(false)}
          size="lg"
        >
          <form onSubmit={handleCreatePeriod} className="space-y-4 text-xs">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] text-muted-foreground uppercase font-bold">Quick Presets:</span>
              <button
                type="button"
                onClick={() => {
                  const now = new Date()
                  const dayOfWeek = now.getDay()
                  const diffToMon = now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1)
                  const mon = new Date(now)
                  mon.setDate(diffToMon)
                  const sun = new Date(mon)
                  sun.setDate(mon.getDate() + 6)
                  const fmtYMD = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
                  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
                  setPeriodName(`Weekly: ${monthNames[mon.getMonth()]} ${String(mon.getDate()).padStart(2, '0')} - ${monthNames[sun.getMonth()]} ${String(sun.getDate()).padStart(2, '0')}, ${sun.getFullYear()}`)
                  setStartDate(fmtYMD(mon))
                  setEndDate(fmtYMD(sun))
                  setPayDate(fmtYMD(sun))
                }}
                className="px-2 py-0.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold cursor-pointer transition-all"
              >
                📅 Weekly (Current Week)
              </button>
              <button
                type="button"
                onClick={() => {
                  const now = new Date()
                  const y = now.getFullYear()
                  const m = String(now.getMonth() + 1).padStart(2, '0')
                  const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
                  setPeriodName(`${monthNames[now.getMonth()]}-${y} (1st Half)`)
                  setStartDate(`${y}-${m}-01`)
                  setEndDate(`${y}-${m}-15`)
                  setPayDate(`${y}-${m}-15`)
                }}
                className="px-2 py-0.5 rounded-lg border border-border bg-card hover:bg-muted text-[10px] font-semibold text-muted-foreground cursor-pointer transition-all"
              >
                1st Half (1st–15th)
              </button>
              <button
                type="button"
                onClick={() => {
                  const now = new Date()
                  const y = now.getFullYear()
                  const m = String(now.getMonth() + 1).padStart(2, '0')
                  const lastDay = new Date(y, now.getMonth() + 1, 0).getDate()
                  const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
                  setPeriodName(`${monthNames[now.getMonth()]}-${y} (2nd Half)`)
                  setStartDate(`${y}-${m}-16`)
                  setEndDate(`${y}-${m}-${lastDay}`)
                  setPayDate(`${y}-${m}-${lastDay}`)
                }}
                className="px-2 py-0.5 rounded-lg border border-border bg-card hover:bg-muted text-[10px] font-semibold text-muted-foreground cursor-pointer transition-all"
              >
                2nd Half (16th–End)
              </button>
            </div>

            <div>
              <label className="block font-bold text-muted-foreground mb-1">Period Name *</label>
              <input
                type="text"
                value={periodName}
                onChange={e => setPeriodName(e.target.value)}
                placeholder="e.g. SEP-2026 (1st Half)"
                required
                className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div>
                <label className="block font-bold text-muted-foreground mb-1">Start Date *</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-mono"
                />
              </div>
              <div>
                <label className="block font-bold text-muted-foreground mb-1">End Date *</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-mono"
                />
              </div>
              <div>
                <label className="block font-bold text-muted-foreground mb-1">Payout Date</label>
                <input
                  type="date"
                  value={payDate}
                  onChange={e => setPayDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-mono"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-border">
              <button
                type="button"
                onClick={() => setNewPeriodModal(false)}
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
                <span>{saving ? 'Creating...' : 'Create Period'}</span>
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Multi-Step Payroll Calculation & Approval Workflow Modal */}
      <PayrollWorkflowModal
        isOpen={workflowModal}
        onClose={() => setWorkflowModal(false)}
        branches={branches}
        periods={periods}
        currentPeriodId={selectedPeriodId}
        isStoreAdmin={isStoreAdmin}
        userBranchName={userBranchName}
        onSuccess={() => {
          loadData(selectedPeriodId, { branch: branchFilter }, true)
          triggerDataSync('payroll')
        }}
      />

      {/* Standalone Philippine Government Contributions & Tax Modal */}
      <GovernmentContributionsModal
        isOpen={govContributionsModal}
        onClose={() => setGovContributionsModal(false)}
        branches={branches}
        userBranch={userBranchName}
        selectedPeriodId={selectedPeriodId}
        onApproved={(res) => {
          // Optimistically update payroll state in < 1 second (< 1000ms target)
          if (res?.employee_id !== undefined) {
            const empId = Number(res.employee_id)
            const sssAmt = Number(res.sss_amount || 0)
            const phicAmt = Number(res.philhealth_amount || 0)
            const pagibigAmt = Number(res.pagibig_amount || 0)
            const taxAmt = Number(res.tax_amount || 0)
            const statutorySum = sssAmt + phicAmt + pagibigAmt + taxAmt

            setPayroll((prev) =>
              prev.map((item) => {
                if (Number(item.employee_id) === empId) {
                  // Keep attendance, loan and custom non-statutory deductions
                  const otherDeductions = Math.max(
                    0,
                    (Number(item.total_deductions) || 0) -
                    (Number(item.sss_deduction) || 0) -
                    (Number(item.philhealth_deduction) || 0) -
                    (Number(item.pagibig_deduction) || 0) -
                    (Number(item.withholding_tax_deduction) || 0)
                  )
                  const newTotalDeductions = Math.round((otherDeductions + statutorySum) * 100) / 100
                  const newGross = Number(item.gross_pay || 0)
                  const newNetPay = Math.max(0, Math.round((newGross - newTotalDeductions) * 100) / 100)

                  return {
                    ...item,
                    sss_deduction: sssAmt,
                    philhealth_deduction: phicAmt,
                    pagibig_deduction: pagibigAmt,
                    withholding_tax_deduction: taxAmt,
                    total_deductions: newTotalDeductions,
                    net_pay: newNetPay,
                  }
                }
                return item
              })
            )

            setViewRecord((prev) => {
              if (prev && Number(prev.employee_id) === empId) {
                const otherDeductions = Math.max(
                  0,
                  (Number(prev.total_deductions) || 0) -
                  (Number(prev.sss_deduction) || 0) -
                  (Number(prev.philhealth_deduction) || 0) -
                  (Number(prev.pagibig_deduction) || 0) -
                  (Number(prev.withholding_tax_deduction) || 0)
                )
                const newTotalDeductions = Math.round((otherDeductions + statutorySum) * 100) / 100
                const newGross = Number(prev.gross_pay || 0)
                const newNetPay = Math.max(0, Math.round((newGross - newTotalDeductions) * 100) / 100)

                return {
                  ...prev,
                  sss_deduction: sssAmt,
                  philhealth_deduction: phicAmt,
                  pagibig_deduction: pagibigAmt,
                  withholding_tax_deduction: taxAmt,
                  total_deductions: newTotalDeductions,
                  net_pay: newNetPay,
                }
              }
              return prev
            })
          }
          loadData(selectedPeriodId, { branch: branchFilter }, true)
          triggerDataSync('payroll')
        }}
      />

      {/* Comprehensive Detailed Payroll & Attendance Metrics Modal */}
      <DetailedPayrollViewModal
        isOpen={viewModalOpen}
        onClose={() => {
          setViewModalOpen(false)
          setViewRecord(null)
        }}
        record={viewRecord}
        allPayroll={payroll}
        periods={periods}
        onOpenPayslip={(rec) => {
          setViewModalOpen(false)
          openPayslip(rec)
        }}
      />
    </div>
  )
}

// ─── Standalone Government Contributions & Tax Deduction & Payroll Sync Modal ───
export function GovernmentContributionsModal({
  isOpen,
  onClose,
  branches = [],
  userBranch = '',
  selectedPeriodId = '',
  onApproved
}) {
  const [selectedBranch, setSelectedBranch] = useState('All')
  const [searchQuery, setSearchQuery] = useState('')
  const [employeeList, setEmployeeList] = useState([])
  const [loadingEmployees, setLoadingEmployees] = useState(false)
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('')

  // Statutory Contribution Toggles & Schedule Split
  const [includeSss, setIncludeSss] = useState(true)
  const [includePhilhealth, setIncludePhilhealth] = useState(true)
  const [includePagibig, setIncludePagibig] = useState(true)
  // Schedule: strictly weekly cutoff basis per system requirements
  const [cutoffType, setCutoffType] = useState('weekly')

  const handleToggleStatutory = (type) => {
    if (type === 'sss') {
      setIncludeSss(prev => !prev)
    } else if (type === 'philhealth') {
      setIncludePhilhealth(prev => !prev)
    } else if (type === 'pagibig') {
      setIncludePagibig(prev => !prev)
    }
  }

  // Current Employee DB Financials / Active Ledger Deductions
  const [activeLedgerDeductions, setActiveLedgerDeductions] = useState([])
  const [loadingFinancials, setLoadingFinancials] = useState(false)

  // Strict Approval Gate Process State
  const [approving, setApproving] = useState(false)
  const [approvalResult, setApprovalResult] = useState(null)
  const [errorMessage, setErrorMessage] = useState('')

  // Initialize and sync branch when modal opens
  useEffect(() => {
    if (isOpen) {
      if (userBranch && userBranch !== 'All') {
        setSelectedBranch(userBranch)
      } else {
        setSelectedBranch('All')
      }
      setSearchQuery('')
      setSelectedEmployeeId('')
      setApprovalResult(null)
      setErrorMessage('')
      setIncludeSss(true)
      setIncludePhilhealth(true)
      setIncludePagibig(true)
      setCutoffType('weekly')
      fetchEmployees(userBranch || 'All')
    }
  }, [isOpen, userBranch])

  // Fetch employees when branch filter changes
  const fetchEmployees = async (branchToFilter) => {
    setLoadingEmployees(true)
    setErrorMessage('')
    try {
      const params = {}
      if (branchToFilter && branchToFilter !== 'All') {
        params.branch = branchToFilter
      }
      const res = await api.payroll.getEligibleEmployees(params)
      const list = res?.employees || (Array.isArray(res) ? res : [])
      setEmployeeList(list)
    } catch (err) {
      console.error('Error fetching eligible employees for contributions:', err)
      setErrorMessage('Failed to load eligible employees. Please try again.')
    } finally {
      setLoadingEmployees(false)
    }
  }

  const handleBranchChange = (newBranch) => {
    setSelectedBranch(newBranch)
    setSelectedEmployeeId('')
    setApprovalResult(null)
    fetchEmployees(newBranch)
  }

  // Filter employees based on search query (Name, Code, Position, Dept, Branch)
  const filteredEmployees = useMemo(() => {
    if (!searchQuery.trim()) return employeeList
    const q = searchQuery.toLowerCase().trim()
    return employeeList.filter((emp) => {
      const name = `${emp.first_name || ''} ${emp.last_name || ''}`.toLowerCase()
      const code = (emp.employee_code || '').toLowerCase()
      const pos = (emp.position || '').toLowerCase()
      const dept = (emp.department || '').toLowerCase()
      const br = (emp.branch_name || '').toLowerCase()
      return name.includes(q) || code.includes(q) || pos.includes(q) || dept.includes(q) || br.includes(q)
    })
  }, [employeeList, searchQuery])

  // Selected Employee Details
  const selectedEmployee = useMemo(() => {
    return employeeList.find((e) => String(e.employee_id) === String(selectedEmployeeId)) || null
  }, [employeeList, selectedEmployeeId])

  // Fetch active ledger deductions when employee is chosen
  useEffect(() => {
    if (selectedEmployeeId) {
      setApprovalResult(null)
      setErrorMessage('')
      setLoadingFinancials(true)
      api.employees?.getFinancials(selectedEmployeeId)
        .then((data) => {
          const deductions = data?.deductions || []
          setActiveLedgerDeductions(deductions)
        })
        .catch((err) => {
          console.warn('Could not fetch existing ledger deductions:', err)
          setActiveLedgerDeductions([])
        })
        .finally(() => {
          setLoadingFinancials(false)
        })
    } else {
      setActiveLedgerDeductions([])
    }
  }, [selectedEmployeeId])

  // Statutory Contributions Computation (Weekly / Semi-Monthly / Monthly Split)
  const computation = useMemo(() => {
    if (!selectedEmployee) {
      return {
        monthlyBase: 0,
        cutoffBase: 0,
        sss: 0,
        philhealth: 0,
        pagibig: 0,
        calculatedSss: 0,
        calculatedPhilhealth: 0,
        calculatedPagibig: 0,
        total: 0,
        netRemaining: 0,
        multiplierLabel: '50% Semi-Monthly Split',
      }
    }

    const monthlySalary = Number(selectedEmployee.basic_salary) || (Number(selectedEmployee.daily_rate) ? Number(selectedEmployee.daily_rate) * 26 : 0)

    // Schedule Apportioning Multipliers:
    // weekly: 25% (0.25)
    // semi-monthly: 50% (0.50)
    // monthly: 100% (1.00)
    let multiplier = 0.5
    let multiplierLabel = '50% Semi-Monthly Cutoff Split'
    if (cutoffType === 'weekly') {
      multiplier = 0.25
      multiplierLabel = '25% Weekly Payroll Split'
    } else if (cutoffType === 'monthly') {
      multiplier = 1.0
      multiplierLabel = '100% Full Monthly Share'
    }

    const basePay = Math.round(monthlySalary * multiplier * 100) / 100

    // 1. SSS: 4.5% statutory employee share (apportioned by cycle multiplier)
    const monthlySss = Math.round(monthlySalary * 0.045 * 100) / 100
    const calculatedSss = Math.round(monthlySss * multiplier * 100) / 100

    // 2. PhilHealth: 2.5% statutory employee share (apportioned by cycle multiplier)
    const monthlyPhilhealth = Math.round(monthlySalary * 0.025 * 100) / 100
    const calculatedPhilhealth = Math.round(monthlyPhilhealth * multiplier * 100) / 100

    // 3. Pag-IBIG (HDMF): 2% of basic pay, capped by statutory ceiling:
    // Monthly: ₱200.00 | Semi-monthly (50%): ₱100.00 | Weekly (25%): ₱50.00
    const pagibigCap = cutoffType === 'weekly' ? 50.00 : (cutoffType === 'monthly' ? 200.00 : 100.00)
    const rawPagibig = Math.round(basePay * 0.02 * 100) / 100
    const calculatedPagibig = basePay > 0 ? Math.min(pagibigCap, rawPagibig) : 0

    // Standard Statutory Contributions:
    const sss_amount = includeSss ? calculatedSss : 0
    const philhealth_amount = includePhilhealth ? calculatedPhilhealth : 0
    const pagibig_amount = includePagibig ? calculatedPagibig : 0

    const total_deductions = Math.round((sss_amount + philhealth_amount + pagibig_amount) * 100) / 100
    const netRemaining = Math.max(0, Math.round((basePay - total_deductions) * 100) / 100)

    return {
      monthlyBase: monthlySalary,
      cutoffBase: basePay,
      sss: sss_amount,
      philhealth: philhealth_amount,
      pagibig: pagibig_amount,
      calculatedSss,
      calculatedPhilhealth,
      calculatedPagibig,
      total: total_deductions,
      netRemaining,
      multiplierLabel,
    }
  }, [selectedEmployee, includeSss, includePhilhealth, includePagibig, cutoffType])

  // Check if current employee already has active approved statutory deductions in database
  const hasApprovedStatutoryInDb = useMemo(() => {
    return activeLedgerDeductions.some((d) =>
      d.is_active && ['SSS Contribution', 'PhilHealth Contribution', 'Pag-IBIG (HDMF)'].includes(d.name)
    )
  }, [activeLedgerDeductions])

  // Strict Approval Gate: Handle "Approve & Apply Deductions"
  const handleApprove = async () => {
    if (!selectedEmployee) {
      setErrorMessage('Please select a target employee first.')
      return
    }

    setApproving(true)
    setErrorMessage('')

    // Immediate optimistic state update (< 1000ms target)
    const optimisticDeductions = []
    if (includeSss && computation.sss > 0) {
      optimisticDeductions.push({ id: 'opt-sss', name: 'SSS Contribution', amount: computation.sss, is_active: true })
    }
    if (includePhilhealth && computation.philhealth > 0) {
      optimisticDeductions.push({ id: 'opt-ph', name: 'PhilHealth Contribution', amount: computation.philhealth, is_active: true })
    }
    if (includePagibig && computation.pagibig > 0) {
      optimisticDeductions.push({ id: 'opt-pi', name: 'Pag-IBIG (HDMF)', amount: computation.pagibig, is_active: true })
    }
    const nonStatutory = activeLedgerDeductions.filter(
      (d) => !['SSS Contribution', 'PhilHealth Contribution', 'Pag-IBIG (HDMF)', 'Withholding Tax'].includes(d.name)
    )
    setActiveLedgerDeductions([...optimisticDeductions, ...nonStatutory])

    if (typeof onApproved === 'function') {
      onApproved({
        employee_id: selectedEmployee.employee_id,
        sss_amount: computation.sss,
        philhealth_amount: computation.philhealth,
        pagibig_amount: computation.pagibig,
        total_statutory_deductions: computation.total,
        cutoff_type: cutoffType,
        optimistic: true,
      })
    }

    try {
      const payload = {
        employee_id: selectedEmployee.employee_id,
        cutoff_type: cutoffType,
        include_sss: includeSss,
        include_philhealth: includePhilhealth,
        include_pagibig: includePagibig,
        custom_sss: computation.sss,
        custom_philhealth: computation.philhealth,
        custom_pagibig: computation.pagibig,
        period_id: selectedPeriodId || undefined,
      }

      const res = await api.payroll.approveContributions(payload)

      if (res && res.success) {
        setApprovalResult(res)
        showToast(`Statutory deductions approved & synchronized for ${selectedEmployee.full_name}!`, 'success')
        triggerDataSync('payroll')

        if (res.active_deductions) {
          setActiveLedgerDeductions(res.active_deductions)
        } else {
          api.employees?.getFinancials(selectedEmployee.employee_id)
            .then((d) => setActiveLedgerDeductions(d?.deductions || []))
            .catch(() => {})
        }

        if (typeof onApproved === 'function') {
          onApproved(res)
        }
      } else {
        throw new Error(res?.message || 'Approval failed. Please try again.')
      }
    } catch (err) {
      console.error('Statutory approval failed:', err)
      setErrorMessage(err.message || 'Failed to approve statutory deductions.')
    } finally {
      setApproving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md animate-[fadeIn_0.2s_ease]">
      {/* Rounded-3xl container with slate-950 background and glowing emerald accents */}
      <div
        className="relative w-full max-w-4xl max-h-[92vh] flex flex-col bg-slate-950 text-slate-100 border border-emerald-500/30 rounded-3xl shadow-[0_0_50px_rgba(16,185,129,0.18)] overflow-hidden animate-[scaleUp_0.2s_ease]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="gov-modal-title"
      >
        {/* Header Section */}
        <div className="flex items-center justify-between px-6 py-4.5 border-b border-emerald-500/20 bg-slate-900/80 backdrop-blur-md">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-emerald-600 via-emerald-500 to-teal-400 text-slate-950 flex items-center justify-center shadow-lg shadow-emerald-500/25">
              <LuShieldCheck className="w-6 h-6 stroke-[2.2]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="gov-modal-title" className="text-base font-bold text-slate-100 tracking-tight">
                  Philippine Government Contributions &amp; Tax Deduction
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                  <LuSparkles className="w-3 h-3 text-emerald-400" /> Statutory Sync Engine
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Strict Approval Gate: Configure, calculate, and synchronize SSS, PhilHealth, &amp; Pag-IBIG employee shares directly into the database payroll ledger.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-2xl text-slate-400 hover:text-slate-100 hover:bg-slate-800/80 transition-colors cursor-pointer"
            title="Close Modal"
          >
            <LuX className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Error Alert */}
          {errorMessage && (
            <div className="flex items-start gap-2.5 p-3.5 rounded-2xl bg-rose-950/50 border border-rose-500/30 text-rose-300 text-xs">
              <LuAlertCircleIcon className="w-4 h-4 mt-0.5 shrink-0 text-rose-400" />
              <div className="flex-1 font-medium">{errorMessage}</div>
              <button
                type="button"
                onClick={() => setErrorMessage('')}
                className="text-slate-400 hover:text-slate-200"
              >
                <LuX className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Strict Approval Gate Notice or Approved Result Banner */}
          {approvalResult ? (
            <div className="p-4.5 rounded-2xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-200 shadow-md space-y-2.5 animate-[fadeIn_0.2s_ease]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-bold text-emerald-300">
                  <LuCheckCheck className="w-5 h-5 text-emerald-400 shrink-0" />
                  <span>Contributions Approved &amp; Synchronized to Database Ledger!</span>
                </div>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 uppercase tracking-wide">
                  Active Ledger Updated
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                The statutory deductions (Total: <strong className="text-emerald-400 font-mono">{fmt(approvalResult.total_statutory_deductions)}</strong>) have been written directly to <code className="px-1.5 py-0.5 rounded bg-slate-900 border border-emerald-500/30 text-emerald-300 font-mono text-[11px]">employee_deductions</code> and synced with open payroll ledger records.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                {approvalResult.applied_deductions?.map((d, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-500/15 text-xs font-mono font-bold text-emerald-300 border border-emerald-500/30"
                  >
                    <span>{d.name}:</span>
                    <span className="text-emerald-400">-{fmt(d.amount)}</span>
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-3.5 rounded-2xl bg-amber-950/40 border border-amber-500/30 text-amber-200 flex items-start gap-3 text-xs">
              <LuClock className="w-4 h-4 text-amber-400 mt-0.5 shrink-0 animate-pulse" />
              <div className="flex-1 leading-relaxed">
                <strong className="text-amber-300 font-semibold">Strict Approval Gate Active:</strong> Statutory contributions and taxes do <strong className="text-white">NOT</strong> automatically deduct from the employee's payroll ledger or net pay upon initial calculation. They remain in preview mode until you click <strong className="text-emerald-400">"Approve &amp; Apply Deductions"</strong> below.
              </div>
            </div>
          )}

          {/* 4-Step Clean Workflow Container */}
          <div className="space-y-5">
            {/* Steps 1 & 2: Select Branch & Search Employee */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Step 1: Select Branch */}
              <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2">
                <label className="text-xs font-bold text-slate-200 flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center text-xs font-bold">1</span>
                    <span>Select Branch</span>
                  </span>
                  <span className="text-[11px] text-slate-400 font-normal">{branches.length} branches</span>
                </label>
                <div className="relative">
                  <select
                    value={selectedBranch}
                    onChange={(e) => handleBranchChange(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs font-medium border border-slate-800 rounded-xl bg-slate-900 text-slate-100 focus:outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20 cursor-pointer"
                  >
                    <option value="All">All Branches</option>
                    {branches.map((b) => {
                      const bName = typeof b === 'string' ? b : (b.name || b.branch_name)
                      return (
                        <option key={b.id || bName} value={bName}>
                          {bName}
                        </option>
                      )
                    })}
                  </select>
                </div>
              </div>

              {/* Step 2: Search Employee / Code / Position */}
              <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2">
                <label className="text-xs font-bold text-slate-200 flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center text-xs font-bold">2</span>
                    <span>Search Employee / Code / Position</span>
                  </span>
                  <span className="text-[11px] text-slate-400 font-normal">{filteredEmployees.length} matching</span>
                </label>
                <div className="relative">
                  <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-400/60 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search by full name, EMP code, position, dept..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-8 py-2.5 text-xs border border-slate-800 rounded-xl bg-slate-900 text-slate-100 focus:outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20 placeholder:text-slate-500"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 cursor-pointer"
                    >
                      <LuX className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Step 3: Select Target Employee */}
            <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3">
              <label className="text-xs font-bold text-slate-200 flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center text-xs font-bold">3</span>
                  <span>Select Target Employee</span>
                </span>
                {loadingEmployees && (
                  <span className="text-[11px] text-emerald-400 flex items-center gap-1.5 animate-pulse">
                    <LuRefreshCw className="w-3 h-3 animate-spin" /> Loading employees...
                  </span>
                )}
              </label>

              <select
                value={selectedEmployeeId}
                onChange={(e) => setSelectedEmployeeId(e.target.value)}
                disabled={loadingEmployees || filteredEmployees.length === 0}
                className="w-full px-3.5 py-2.5 text-xs font-medium border border-slate-800 rounded-xl bg-slate-900 text-slate-100 focus:outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20 cursor-pointer disabled:opacity-50"
              >
                <option value="">-- Choose Employee ({filteredEmployees.length} available) --</option>
                {filteredEmployees.map((emp) => (
                  <option key={emp.employee_id} value={emp.employee_id}>
                    {emp.full_name} ({emp.employee_code}) - {emp.position} • {emp.branch_name}
                  </option>
                ))}
              </select>

              {/* Selected Target Employee Detail Card */}
              {selectedEmployee && (
                <div className="p-4.5 rounded-2xl border border-emerald-500/30 bg-slate-950/80 shadow-md space-y-3.5 transition-all animate-[fadeIn_0.15s_ease]">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
                    <div className="flex items-center gap-3.5">
                      <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 text-emerald-400 font-extrabold text-sm flex items-center justify-center border border-emerald-500/30 shrink-0">
                        {selectedEmployee.first_name?.[0]}{selectedEmployee.last_name?.[0]}
                      </div>
                      <div>
                        <div className="text-sm font-bold text-slate-100 flex items-center gap-2">
                          <span>{selectedEmployee.full_name}</span>
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-emerald-500/15 text-emerald-300 font-bold border border-emerald-500/30">
                            {selectedEmployee.employee_code}
                          </span>
                        </div>
                        <div className="text-xs text-slate-400 flex flex-wrap items-center gap-2 mt-0.5">
                          <span>{selectedEmployee.position}</span>
                          <span>&bull;</span>
                          <span>{selectedEmployee.department || 'Operations'}</span>
                          <span>&bull;</span>
                          <span className="font-semibold text-emerald-400/90">{selectedEmployee.branch_name}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 block uppercase font-bold tracking-wider">Basic Salary</span>
                      <span className="text-sm font-mono font-bold text-emerald-400">
                        {fmt(selectedEmployee.basic_salary || (selectedEmployee.daily_rate * 26))}
                      </span>
                      <span className="text-[10px] text-slate-500 block">
                        Cutoff Base ({cutoffType}): <strong className="text-slate-300 font-mono">{fmt(computation.cutoffBase)}</strong>
                      </span>
                    </div>
                  </div>

                  {/* Statutory Identification Numbers */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                    <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block font-medium">SSS No.</span>
                      <span className="font-mono font-semibold text-slate-200">{selectedEmployee.sss_number || 'Not Configured'}</span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block font-medium">PhilHealth No.</span>
                      <span className="font-mono font-semibold text-slate-200">{selectedEmployee.philhealth_number || 'Not Configured'}</span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block font-medium">Pag-IBIG MID</span>
                      <span className="font-mono font-semibold text-slate-200">{selectedEmployee.pagibig_number || 'Not Configured'}</span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block font-medium">TIN No.</span>
                      <span className="font-mono font-semibold text-slate-200">{selectedEmployee.tin_number || 'Not Configured'}</span>
                    </div>
                  </div>

                  {/* Current Active Database Ledger Status */}
                  <div className="pt-2 border-t border-slate-800/80 text-[11px]">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-slate-400 font-semibold flex items-center gap-1.5">
                        <LuLock className="w-3.5 h-3.5 text-emerald-400" />
                        Current Active Ledger Deductions (<code className="text-emerald-300">employee_deductions</code>):
                      </span>
                      {hasApprovedStatutoryInDb ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                          <LuCheck className="w-3 h-3" /> Statutory Synced
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                          <LuClock className="w-3 h-3" /> Pending Approval Gate
                        </span>
                      )}
                    </div>
                    {activeLedgerDeductions.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {activeLedgerDeductions.map((d) => (
                          <span
                            key={d.id}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-mono border ${
                              ['SSS Contribution', 'PhilHealth Contribution', 'Pag-IBIG (HDMF)'].includes(d.name)
                                ? 'bg-emerald-950/40 text-emerald-300 border-emerald-500/30'
                                : 'bg-slate-900 text-slate-300 border-slate-800'
                            }`}
                          >
                            <span className="font-semibold">{d.name}:</span>
                            <span className="text-rose-400 font-bold">-{fmt(d.amount)}</span>
                            {d.is_active && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-slate-500 text-[11px] italic">No active deductions currently saved in employee database ledger.</span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Step 4: Statutory Deductions Selection & Cycle Apportioning */}
            <div className="p-4.5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <label className="text-xs font-bold text-slate-200 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center text-xs font-bold">4</span>
                  <span>Statutory Deductions Selection &amp; Deduction Schedule</span>
                </label>

                {/* Schedule Selector: Weekly / Semi-Monthly / Monthly Split */}
                <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-950 border border-slate-800 text-[11px] self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => setCutoffType('semi-monthly')}
                    className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                      cutoffType === 'semi-monthly'
                        ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-slate-950 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Semi-Monthly (50% Split)
                  </button>
                  <button
                    type="button"
                    onClick={() => setCutoffType('weekly')}
                    className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                      cutoffType === 'weekly'
                        ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-slate-950 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Weekly (25% Split)
                  </button>
                  <button
                    type="button"
                    onClick={() => setCutoffType('monthly')}
                    className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                      cutoffType === 'monthly'
                        ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-slate-950 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Full Monthly (100%)
                  </button>
                </div>
              </div>

              {/* 3 Statutory Cards (SSS, PhilHealth, Pag-IBIG) */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                {/* SSS Contribution */}
                <div
                  onClick={() => handleToggleStatutory('sss')}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer select-none ${
                    includeSss
                      ? 'border-emerald-500/50 bg-slate-950 shadow-[0_0_20px_rgba(16,185,129,0.1)] ring-1 ring-emerald-500/20'
                      : 'border-slate-800 bg-slate-900/40 opacity-60 hover:opacity-80'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        id="checkbox-statutory-sss"
                        checked={includeSss}
                        onChange={() => handleToggleStatutory('sss')}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded text-emerald-500 focus:ring-emerald-500 w-4 h-4 mt-0.5 cursor-pointer accent-emerald-500"
                      />
                      <div>
                        <div className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                          <span>SSS Contribution</span>
                          <span className="px-1.5 py-0.2 rounded text-[9px] bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                            4.5%
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-0.5 leading-snug">
                          Social Security System mandatory employee share.
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className={`font-mono font-bold text-xs block ${includeSss ? 'text-rose-400' : 'text-slate-500'}`}>
                        {includeSss ? `-${fmt(computation.sss)}` : '-₱0.00'}
                      </span>
                    </div>
                  </div>
                  <div className="mt-3 pt-2 border-t border-slate-800 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                    <span>{cutoffType === 'weekly' ? '1.125% Weekly' : (cutoffType === 'monthly' ? '4.5% Monthly' : '2.25% Half')}</span>
                    <span>{selectedEmployee?.sss_number || 'SSS Registered'}</span>
                  </div>
                </div>

                {/* PhilHealth Contribution */}
                <div
                  onClick={() => handleToggleStatutory('philhealth')}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer select-none ${
                    includePhilhealth
                      ? 'border-teal-500/50 bg-slate-950 shadow-[0_0_20px_rgba(20,184,166,0.1)] ring-1 ring-teal-500/20'
                      : 'border-slate-800 bg-slate-900/40 opacity-60 hover:opacity-80'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        id="checkbox-statutory-philhealth"
                        checked={includePhilhealth}
                        onChange={() => handleToggleStatutory('philhealth')}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded text-teal-500 focus:ring-teal-500 w-4 h-4 mt-0.5 cursor-pointer accent-teal-500"
                      />
                      <div>
                        <div className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                          <span>PhilHealth Premium</span>
                          <span className="px-1.5 py-0.2 rounded text-[9px] bg-teal-500/20 text-teal-300 font-bold border border-teal-500/30">
                            2.5%
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-0.5 leading-snug">
                          Universal Health Care statutory employee insurance share.
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className={`font-mono font-bold text-xs block ${includePhilhealth ? 'text-rose-400' : 'text-slate-500'}`}>
                        {includePhilhealth ? `-${fmt(computation.philhealth)}` : '-₱0.00'}
                      </span>
                    </div>
                  </div>
                  <div className="mt-3 pt-2 border-t border-slate-800 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                    <span>{cutoffType === 'weekly' ? '0.625% Weekly' : (cutoffType === 'monthly' ? '2.5% Monthly' : '1.25% Half')}</span>
                    <span>{selectedEmployee?.philhealth_number || 'PHIC Registered'}</span>
                  </div>
                </div>

                {/* Pag-IBIG (HDMF) Contribution */}
                <div
                  onClick={() => handleToggleStatutory('pagibig')}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer select-none ${
                    includePagibig
                      ? 'border-amber-500/50 bg-slate-950 shadow-[0_0_20px_rgba(245,158,11,0.1)] ring-1 ring-amber-500/20'
                      : 'border-slate-800 bg-slate-900/40 opacity-60 hover:opacity-80'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        id="checkbox-statutory-pagibig"
                        checked={includePagibig}
                        onChange={() => handleToggleStatutory('pagibig')}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded text-amber-500 focus:ring-amber-500 w-4 h-4 mt-0.5 cursor-pointer accent-amber-500"
                      />
                      <div>
                        <div className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                          <span>Pag-IBIG / HDMF</span>
                          <span className="px-1.5 py-0.2 rounded text-[9px] bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
                            Cap ₱{cutoffType === 'weekly' ? '50' : (cutoffType === 'monthly' ? '200' : '100')}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-0.5 leading-snug">
                          HDMF statutory housing fund (2% capped by statutory ceiling).
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className={`font-mono font-bold text-xs block ${includePagibig ? 'text-rose-400' : 'text-slate-500'}`}>
                        {includePagibig ? `-${fmt(computation.pagibig)}` : '-₱0.00'}
                      </span>
                    </div>
                  </div>
                  <div className="mt-3 pt-2 border-t border-slate-800 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                    <span>2% Statutory Cap</span>
                    <span>{selectedEmployee?.pagibig_number || 'HDMF Registered'}</span>
                  </div>
                </div>
              </div>

              {/* Live Computation Summary & Net Take-Home Preview Bar */}
              <div className="p-4.5 rounded-2xl bg-slate-950 border border-emerald-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-inner">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider block">
                      Computed Statutory Total ({computation.multiplierLabel})
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                      Pending Approval Gate
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5 mt-1">
                    <span className="text-xl font-mono font-extrabold text-rose-400">
                      -{fmt(computation.total)}
                    </span>
                    <span className="text-xs text-slate-400 font-mono">
                      deducted from {fmt(computation.cutoffBase)} cycle base pay
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-4 self-end sm:self-auto border-t sm:border-t-0 sm:border-l border-slate-800 pt-3 sm:pt-0 sm:pl-4">
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">Estimated Net Take-Home</span>
                    <span className="text-lg font-mono font-extrabold text-emerald-400">
                      {fmt(computation.netRemaining)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer & Primary Action Button */}
        <div className="px-6 py-4.5 border-t border-emerald-500/20 bg-slate-900/80 backdrop-blur-md flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
          <div className="text-xs text-slate-400 flex items-center gap-2">
            <LuShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              Securely writes directly to <strong className="text-emerald-300 font-mono">employee_deductions</strong> &amp; synchronizes active payroll ledger.
            </span>
          </div>

          <div className="flex items-center gap-2.5 self-end sm:self-auto">
            <button
              type="button"
              onClick={onClose}
              disabled={approving}
              className="px-4 py-2.5 text-xs font-semibold rounded-2xl border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              type="button"
              id="btn-approve-contributions"
              onClick={handleApprove}
              disabled={approving || !selectedEmployee}
              className="flex items-center gap-2 px-5 py-2.5 text-xs font-extrabold rounded-2xl bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-slate-950 shadow-lg shadow-emerald-500/25 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {approving ? (
                <>
                  <LuRefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                  <span>Approving &amp; Applying Deductions...</span>
                </>
              ) : (
                <>
                  <LuCheckCheck className="w-4 h-4 text-slate-950 stroke-[2.5]" />
                  <span>Approve &amp; Apply Deductions</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Standalone Detailed Payroll & Attendance Metrics Modal ─────────────────
export function DetailedPayrollViewModal({
  isOpen,
  onClose,
  record,
  allPayroll = [],
  periods = [],
  onOpenPayslip
}) {
  const [activeFilter, setActiveFilter] = useState('Weekly')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [detailedPayslip, setDetailedPayslip] = useState(null)
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [dailyMatrix, setDailyMatrix] = useState(null)
  const [loadingMatrix, setLoadingMatrix] = useState(false)

  const FILTER_OPTIONS = [
    'Daily',
    'Weekly',
    'Monthly',
    'Quarterly',
    '3 Months',
    '6 Months',
    '9 Months',
    '1 Year'
  ]

  // When modal opens or record changes, fetch full itemized payslip details
  useEffect(() => {
    if (isOpen && record?.payroll_id) {
      setLoadingDetails(true)
      setActiveFilter('Weekly')

      api.payroll.getPayslip(record.payroll_id)
        .then((res) => {
          if (res?.record) {
            setDetailedPayslip(res.record)
            if (res.record.daily_matrix) {
              setDailyMatrix(res.record.daily_matrix)
            }
            const sDate = res.record.start_date || res.record.from_date || ''
            const eDate = res.record.end_date || res.record.to_date || res.record.pay_date || ''
            setCustomFrom(sDate)
            setCustomTo(eDate)
          } else {
            setDetailedPayslip(record)
            if (record?.daily_matrix) {
              setDailyMatrix(record.daily_matrix)
            }
          }
        })
        .catch((err) => {
          console.warn('Could not fetch itemized payslip details, using base record:', err)
          setDetailedPayslip(record)
          if (record?.daily_matrix) {
            setDailyMatrix(record.daily_matrix)
          }
        })
        .finally(() => {
          setLoadingDetails(false)
        })
    } else if (!isOpen) {
      setDetailedPayslip(null)
      setDailyMatrix(null)
    }
  }, [isOpen, record?.payroll_id])

  // Active base record (fallback to record if detailedPayslip is loading)
  const activeRecord = detailedPayslip || record || {}

  // Fetch live daily attendance matrix for active employee whenever date range changes
  useEffect(() => {
    if (!isOpen || !activeRecord?.employee_id || !customFrom) return
    let isCancelled = false
    setLoadingMatrix(true)

    api.payroll.getDailyMatrix(activeRecord.employee_id, { from_date: customFrom, to_date: customTo })
      .then((res) => {
        if (!isCancelled && res?.matrix) {
          setDailyMatrix(res.matrix)
        }
      })
      .catch((err) => {
        console.warn('Could not refresh daily matrix:', err)
      })
      .finally(() => {
        if (!isCancelled) setLoadingMatrix(false)
      })

    return () => { isCancelled = true }
  }, [isOpen, activeRecord?.employee_id, customFrom, customTo])

  // Calculate reference end date
  const baseEndDateStr = activeRecord.end_date || activeRecord.to_date || activeRecord.pay_date || new Date().toISOString().slice(0, 10)

  // Handle filter selection and update custom date inputs
  const handleFilterSelect = (filterName) => {
    setActiveFilter(filterName)
    const end = baseEndDateStr ? new Date(baseEndDateStr) : new Date()
    const start = new Date(end)

    switch (filterName) {
      case 'Daily':
        break
      case 'Weekly':
        start.setDate(start.getDate() - 6)
        break
      case 'Monthly':
        start.setDate(start.getDate() - 29)
        break
      case 'Quarterly':
      case '3 Months':
        start.setMonth(start.getMonth() - 3)
        break
      case '6 Months':
        start.setMonth(start.getMonth() - 6)
        break
      case '9 Months':
        start.setMonth(start.getMonth() - 9)
        break
      case '1 Year':
        start.setFullYear(start.getFullYear() - 1)
        break
      default:
        start.setDate(start.getDate() - 29)
        break
    }

    const fmtDate = (d) => {
      try {
        return d.toISOString().slice(0, 10)
      } catch {
        return ''
      }
    }

    setCustomFrom(fmtDate(start))
    setCustomTo(fmtDate(end))
  }

  // Resolve itemized deductions
  const resolvedDeductions = useMemo(() => {
    const p = activeRecord
    const list = [...(p.deductions || [])]
    const hasType = (t) => list.some(d => (d.deduction_type || d.name || '').toLowerCase().includes(t.toLowerCase()))

    if (Array.isArray(p.absence_breakdown) && p.absence_breakdown.length > 0) {
      p.absence_breakdown.forEach((ab, idx) => {
        const catName = ab.category || 'Absence'
        if (!hasType(catName)) {
          list.push({
            deduction_id: `d-abs-${ab.report_id || idx}`,
            deduction_type: catName,
            description: `${catName}: ${ab.reason || 'Leave'} (${ab.days}d: ${ab.from_date} to ${ab.to_date})`,
            amount: Number(ab.amount || 0)
          })
        }
      })
    } else if (!hasType('absence') && Number(p.absence_deduction) > 0) {
      list.push({
        deduction_id: 'd-abs',
        deduction_type: 'Absences',
        description: `Absences (${p.absence_days || 0} day(s) missed)`,
        amount: Number(p.absence_deduction)
      })
    }
    if (!hasType('late') && Number(p.late_penalty || p.late_deduction) > 0) {
      list.push({
        deduction_id: 'd-late',
        deduction_type: 'Late Penalty',
        description: `Late Penalty (${p.late_minutes || 0} mins tardy)`,
        amount: Number(p.late_penalty || p.late_deduction)
      })
    }
    if (!hasType('undertime') && Number(p.undertime_deduction) > 0) {
      list.push({
        deduction_id: 'd-ut',
        deduction_type: 'Undertime',
        description: `Undertime (${p.undertime_minutes || 0} mins / ${p.undertime_hours || 0}h)`,
        amount: Number(p.undertime_deduction)
      })
    }
    if (!hasType('sss') && Number(p.sss_deduction) > 0) {
      list.push({
        deduction_id: 'd-sss',
        deduction_type: 'SSS',
        description: 'SSS Mandatory Contribution (4.5%)',
        amount: Number(p.sss_deduction)
      })
    }
    if (!hasType('philhealth') && Number(p.philhealth_deduction) > 0) {
      list.push({
        deduction_id: 'd-ph',
        deduction_type: 'PhilHealth',
        description: 'PhilHealth Mandatory Contribution (2.5%)',
        amount: Number(p.philhealth_deduction)
      })
    }
    if (!hasType('pag-ibig') && !hasType('hdmf') && Number(p.pagibig_deduction) > 0) {
      list.push({
        deduction_id: 'd-hdmf',
        deduction_type: 'Pag-IBIG',
        description: 'Pag-IBIG (HDMF) Statutory Contribution',
        amount: Number(p.pagibig_deduction)
      })
    }
    if (!hasType('tax') && Number(p.withholding_tax_deduction) > 0) {
      list.push({
        deduction_id: 'd-tax',
        deduction_type: 'Withholding Tax',
        description: 'BIR Withholding Tax Deduction',
        amount: Number(p.withholding_tax_deduction)
      })
    }
    return list
  }, [activeRecord])

  // Multiplier / Scale calculation across the selected timeframe
  const metrics = useMemo(() => {
    const p = activeRecord
    const dailyRate = Number(p.daily_rate || (p.weekly_base_pay ? p.weekly_base_pay / 6 : (p.basic_salary && p.basic_salary <= 1000 ? p.basic_salary : 500.00)))
    const weeklyBasePay = Number(p.weekly_base_pay || dailyRate * 6)
    const hourlyRate = Number(p.hourly_rate || (dailyRate > 0 ? dailyRate / 8 : 62.50))
    const minuteRate = Number(p.minute_rate || (hourlyRate > 0 ? hourlyRate / 60 : 1.0417))
    const basicMonthly = Number(p.monthly_rate || dailyRate * 26)

    // Strict Zero Hours Rule Detection:
    // If work_hours == 0 or regular_hours == 0, base pay, gross pay, deductions, and net pay evaluate strictly to 0.00
    const isZeroHours = (p.work_hours !== undefined && p.work_hours !== null)
      ? Number(p.work_hours) === 0
      : (p.regular_hours !== undefined && p.regular_hours !== null ? Number(p.regular_hours) === 0 : false)

    // Base period values (single weekly period cutoff)
    const baseRegHours = Number(p.work_hours ?? p.regular_hours ?? 0)
    const baseOtHours = isZeroHours ? 0 : Number(p.overtime_hours || 0)
    const baseOtPay = isZeroHours ? 0 : Number(p.overtime_pay || 0)
    const baseAllowance = isZeroHours ? 0 : Number(p.allowance || 0)
    const baseGross = isZeroHours ? 0 : Number(p.gross_pay ?? (p.basic_pay ?? (baseRegHours > 0 ? (baseRegHours * hourlyRate) : 0)))
    const baseDeductions = isZeroHours ? 0 : Number(p.total_deductions ?? 0)
    const baseNet = isZeroHours ? 0 : Number(p.net_pay ?? (baseGross - baseDeductions))

    const baseLateMins = isZeroHours ? 0 : Number(p.late_minutes || 0)
    const baseLatePen = isZeroHours ? 0 : Number(p.late_penalty || p.late_deduction || 0)
    const baseUtMins = isZeroHours ? 0 : Number(p.undertime_minutes || 0)
    const baseUtHours = isZeroHours ? 0 : Number(p.undertime_hours || (baseUtMins / 60))
    const baseUtDed = isZeroHours ? 0 : Number(p.undertime_deduction || 0)
    const baseAbsentDays = Number(p.absence_days || 0)
    const baseAbsentDed = isZeroHours ? 0 : (p.absence_deduction !== undefined && p.absence_deduction !== null ? Number(p.absence_deduction) : Number(baseAbsentDays * dailyRate))

    if (activeFilter === 'Weekly') {
      return {
        isZeroHours,
        isScaled: false,
        scaleLabel: 'Weekly Cutoff Actuals (Monday to Saturday • 48h Standard)',
        workHours: baseRegHours,
        workDays: isZeroHours ? 0 : Math.min(6, Math.max(0, 6 - baseAbsentDays)),
        overtimeHours: baseOtHours,
        overtimePay: baseOtPay,
        allowance: baseAllowance,
        grossPay: baseGross,
        totalDeductions: baseDeductions,
        netPay: baseNet,
        lateMinutes: baseLateMins,
        latePenalty: baseLatePen,
        undertimeMinutes: baseUtMins,
        undertimeHours: baseUtHours,
        undertimeDeduction: baseUtDed,
        absenceDays: baseAbsentDays,
        absenceDeduction: baseAbsentDed,
        dailyRate,
        hourlyRate,
        minuteRate,
        weeklyBasePay: isZeroHours ? 0 : weeklyBasePay,
        basicMonthly
      }
    }

    if (activeFilter === 'Daily') {
      return {
        isZeroHours,
        isScaled: true,
        scaleLabel: 'Pro-rated Single Day (8h standard shift)',
        workHours: isZeroHours ? 0 : 8.0,
        workDays: isZeroHours ? 0 : 1,
        overtimeHours: isZeroHours ? 0 : Math.round((baseOtHours / 6) * 10) / 10,
        overtimePay: isZeroHours ? 0 : Math.round(baseOtPay / 6),
        allowance: isZeroHours ? 0 : Math.round(baseAllowance / 6),
        grossPay: isZeroHours ? 0 : Math.round(dailyRate),
        totalDeductions: isZeroHours ? 0 : Math.round(baseDeductions / 6),
        netPay: isZeroHours ? 0 : Math.round(dailyRate - (baseDeductions / 6)),
        lateMinutes: isZeroHours ? 0 : Math.round(baseLateMins / 6),
        latePenalty: isZeroHours ? 0 : Math.round(baseLatePen / 6),
        undertimeMinutes: isZeroHours ? 0 : Math.round(baseUtMins / 6),
        undertimeHours: isZeroHours ? 0 : Math.round(((baseUtMins / 6) / 60) * 10) / 10,
        undertimeDeduction: isZeroHours ? 0 : Math.round(baseUtDed / 6),
        absenceDays: 0,
        absenceDeduction: 0,
        dailyRate,
        hourlyRate,
        minuteRate,
        weeklyBasePay: isZeroHours ? 0 : weeklyBasePay,
        basicMonthly
      }
    }

    if (activeFilter === 'Monthly') {
      return {
        isZeroHours,
        isScaled: true,
        scaleLabel: 'Aggregated Monthly Projection (4 Weekly Cycles)',
        workHours: isZeroHours ? 0 : baseRegHours * 4,
        workDays: isZeroHours ? 0 : 24,
        overtimeHours: isZeroHours ? 0 : Math.round(baseOtHours * 4 * 10) / 10,
        overtimePay: isZeroHours ? 0 : Math.round(baseOtPay * 4),
        allowance: isZeroHours ? 0 : Math.round(baseAllowance * 4),
        grossPay: isZeroHours ? 0 : Math.round(baseGross * 4),
        totalDeductions: isZeroHours ? 0 : Math.round(baseDeductions * 4),
        netPay: isZeroHours ? 0 : Math.round(baseNet * 4),
        lateMinutes: isZeroHours ? 0 : Math.round(baseLateMins * 4),
        latePenalty: isZeroHours ? 0 : Math.round(baseLatePen * 4),
        undertimeMinutes: isZeroHours ? 0 : Math.round(baseUtMins * 4),
        undertimeHours: isZeroHours ? 0 : Math.round((baseUtHours * 4) * 10) / 10,
        undertimeDeduction: isZeroHours ? 0 : Math.round(baseUtDed * 4),
        absenceDays: isZeroHours ? 0 : Math.round(baseAbsentDays * 4),
        absenceDeduction: isZeroHours ? 0 : Math.round(baseAbsentDed * 4),
        dailyRate,
        hourlyRate,
        minuteRate,
        weeklyBasePay: isZeroHours ? 0 : weeklyBasePay,
        basicMonthly
      }
    }

    // Timeframe scale factors relative to 1 week
    let factor = 1.0
    let label = ''

    switch (activeFilter) {
      case 'Quarterly':
      case '3 Months':
        factor = 12.0
        label = 'Aggregated 3-Month Quarter (12 weekly cutoffs)'
        break
      case '6 Months':
        factor = 24.0
        label = 'Aggregated 6-Month Half Year (24 weekly cutoffs)'
        break
      case '9 Months':
        factor = 36.0
        label = 'Aggregated 9-Month Period (36 weekly cutoffs)'
        break
      case '1 Year':
        factor = 52.0
        label = 'Annual 1-Year Cumulative (52 weekly cutoffs)'
        break
      default:
        factor = 1.0
        label = 'Normalized Metric'
        break
    }

    return {
      isZeroHours,
      isScaled: true,
      scaleLabel: label,
      workHours: isZeroHours ? 0 : Math.round(baseRegHours * factor),
      workDays: isZeroHours ? 0 : Math.round((baseRegHours / 8) * factor),
      overtimeHours: isZeroHours ? 0 : Math.round(baseOtHours * factor * 10) / 10,
      overtimePay: isZeroHours ? 0 : Math.round(baseOtPay * factor),
      allowance: isZeroHours ? 0 : Math.round(baseAllowance * factor),
      grossPay: isZeroHours ? 0 : Math.round(baseGross * factor),
      totalDeductions: isZeroHours ? 0 : Math.round(baseDeductions * factor),
      netPay: isZeroHours ? 0 : Math.round(baseNet * factor),
      lateMinutes: isZeroHours ? 0 : Math.round(baseLateMins * factor),
      latePenalty: isZeroHours ? 0 : Math.round(baseLatePen * factor),
      undertimeMinutes: isZeroHours ? 0 : Math.round(baseUtMins * factor),
      undertimeHours: isZeroHours ? 0 : Math.round((baseUtHours * factor) * 10) / 10,
      undertimeDeduction: isZeroHours ? 0 : Math.round(baseUtDed * factor),
      absenceDays: isZeroHours ? 0 : Math.round(baseAbsentDays * factor),
      absenceDeduction: isZeroHours ? 0 : Math.round(baseAbsentDed * factor),
      dailyRate,
      hourlyRate,
      minuteRate,
      weeklyBasePay: isZeroHours ? 0 : weeklyBasePay,
      basicMonthly
    }
  }, [activeRecord, activeFilter])

  // Guaranteed Day 1 to Day 6 Tabular Attendance Matrix
  const resolvedMatrix = useMemo(() => {
    if (dailyMatrix && Array.isArray(dailyMatrix.days) && dailyMatrix.days.length === 6) {
      return dailyMatrix
    }
    if (activeRecord?.daily_matrix && Array.isArray(activeRecord.daily_matrix.days) && activeRecord.daily_matrix.days.length === 6) {
      return activeRecord.daily_matrix
    }

    const sDateStr = customFrom || activeRecord?.start_date || activeRecord?.from_date || new Date().toISOString().slice(0, 10)
    const startDate = new Date(sDateStr)
    const days = []
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

    for (let i = 0; i < 6; i++) {
      const d = new Date(startDate)
      d.setDate(startDate.getDate() + i)
      const dateStr = d.toISOString().slice(0, 10)
      const shortDate = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      const dayName = d.toLocaleDateString('en-US', { weekday: 'short' }) || dayNames[i]

      days.push({
        day_number: i + 1,
        day_label: `DAY ${i + 1}`,
        day_name: dayName,
        date: dateStr,
        short_date: shortDate,
        full_date: `${dayName}, ${shortDate}`,
        has_record: false,
        status: 'Absent',
        time_in: null,
        time_out: null,
        time_in_raw: null,
        time_out_raw: null,
        work_hours: 0,
        late_minutes: 0,
        undertime_minutes: 0,
        overtime_hours: 0,
        is_absent: true,
        absence_score: 1.0,
        remarks: ''
      })
    }

    return {
      cycle_start: sDateStr,
      cycle_end: days[5]?.date,
      days,
      summary: {
        total_work_hours: metrics.workHours || 0,
        total_late_minutes: metrics.lateMinutes || 0,
        total_undertime_minutes: metrics.undertimeMinutes || 0,
        total_overtime_hours: metrics.overtimeHours || 0,
        total_absent_days: metrics.absenceDays || 0,
        days_present: metrics.workDays || 0,
        standard_hours: 48,
        standard_days: 6
      }
    }
  }, [dailyMatrix, activeRecord?.daily_matrix, customFrom, activeRecord?.start_date, metrics])

  if (!isOpen || !record) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-[fadeIn_0.2s_ease]">
      <div
        className="relative w-full max-w-4xl max-h-[92vh] flex flex-col bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-[scaleUp_0.2s_ease]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="view-payroll-modal-title"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card/70 backdrop-blur-md">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-sky-500 text-white flex items-center justify-center font-bold text-base shadow-md border border-white/10 shrink-0">
              {activeRecord.employee_name
                ? activeRecord.employee_name.split(' ').map(n => n[0]).slice(0, 2).join('')
                : 'EP'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="view-payroll-modal-title" className="text-base font-bold text-foreground">
                  {activeRecord.employee_name || 'Employee Payroll Record'}
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                  {activeRecord.employee_code || 'EMP-000'}
                </span>
                <StatusBadge status={activeRecord.status || 'Draft'} />
              </div>
              <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-2 mt-0.5">
                <span>{activeRecord.position || 'Staff'}</span>
                <span>•</span>
                <span>{activeRecord.department || 'Operations'}</span>
                <span>•</span>
                <span className="font-semibold text-foreground/80">{activeRecord.branch || 'Branch'}</span>
                <span>•</span>
                <span className="text-blue-500 font-medium">{activeRecord.period_name || 'Current Period'}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
              title="Close Modal"
            >
              <FiX className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Zero Hours Engine Rule Alert */}
          {metrics.isZeroHours && (
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-500 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-500 flex items-center justify-center shrink-0">
                  <FiAlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-foreground">Zero Working Hours Engine Rule Active</h4>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    No rendered working hours recorded for this weekly cycle (0.00 hrs). Salary, overtime, deductions, and net pay strictly evaluate to ₱0.00.
                  </p>
                </div>
              </div>
              <span className="px-3 py-1 rounded-full text-xs bg-amber-500/20 text-amber-400 font-mono font-bold shrink-0 self-start sm:self-auto">
                ₱0.00 Salary
              </span>
            </div>
          )}

          {/* 1. DATE RANGE & FILTER SELECTOR */}
          <div className="p-4 rounded-2xl bg-muted/40 border border-border/80 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label className="text-xs font-bold text-foreground flex items-center gap-2">
                <FiCalendar className="w-4 h-4 text-blue-500" />
                <span>Date Range &amp; Timeframe View</span>
                {loadingDetails && (
                  <span className="text-[11px] text-blue-500 flex items-center gap-1 animate-pulse">
                    <FiRefreshCw className="w-3 h-3 animate-spin" /> Fetching details...
                  </span>
                )}
              </label>
              <span className="text-[11px] text-muted-foreground font-mono">
                {metrics.scaleLabel}
              </span>
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
              {FILTER_OPTIONS.map((fName) => {
                const isActive = activeFilter === fName
                return (
                  <button
                    key={fName}
                    type="button"
                    onClick={() => handleFilterSelect(fName)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                      isActive
                        ? 'bg-blue-600 text-white shadow-xs font-bold ring-2 ring-blue-500/30'
                        : 'bg-card text-muted-foreground hover:text-foreground hover:bg-muted border border-border'
                    }`}
                  >
                    {fName}
                  </button>
                )
              })}
            </div>

            {/* Custom Date Range Inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-border/50 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground font-semibold shrink-0">From Date:</span>
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground font-semibold shrink-0">To Date:</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
            </div>
          </div>

          {/* 2. ATTENDANCE METRICS SECTION */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <FiClock className="w-4 h-4 text-emerald-500" />
                <span>Attendance &amp; Time Tracking Metrics</span>
              </h3>
              <div className="flex items-center gap-2">
                <span className="text-[10px] px-2.5 py-0.5 rounded-full font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  Standard Store: Weekly Cycle (6 workdays • Mon-Sat • 48h/wk)
                </span>
              </div>
            </div>

            {/* DAILY TABULAR MATRIX (DAY 1 TO DAY 6) */}
            <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-xs">
              <div className="px-4 py-3 bg-muted/40 border-b border-border flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-xs font-bold text-foreground tracking-wide">
                    Daily Tabular Attendance Matrix (DAY 1 – DAY 6)
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                    Live Database Logs
                  </span>
                  {loadingMatrix && (
                    <span className="text-[10px] text-blue-500 flex items-center gap-1 animate-pulse">
                      <FiRefreshCw className="w-3 h-3 animate-spin" /> Syncing live logs...
                    </span>
                  )}
                </div>
                <span className="text-[11px] text-muted-foreground font-mono">
                  Weekly Range: {resolvedMatrix.cycle_start || customFrom || '...'} to {resolvedMatrix.cycle_end || customTo || '...'}
                </span>
              </div>

              <div className="overflow-x-auto scrollbar-thin">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="py-2.5 px-3.5 font-bold text-muted-foreground uppercase tracking-wider text-[10px] w-48 min-w-[180px] sticky left-0 bg-muted/95 backdrop-blur-xs z-10 border-r border-border">
                        Metric / Workday
                      </th>
                      {resolvedMatrix.days.map((day) => (
                        <th key={day.day_label} className="py-2.5 px-3 text-center min-w-[125px] border-r border-border/60">
                          <div className="font-bold text-foreground text-xs">{day.day_label}</div>
                          <div className="text-[10px] font-mono text-muted-foreground font-medium">
                            {day.day_name} • {day.short_date}
                          </div>
                        </th>
                      ))}
                      <th className="py-2.5 px-3.5 text-center font-bold text-foreground text-xs min-w-[135px] bg-muted/50">
                        <div>WEEKLY TOTAL</div>
                        <div className="text-[10px] font-normal text-muted-foreground font-mono">6 Workdays</div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {/* ROW 1: TOTAL WORK HOURS */}
                    <tr className="hover:bg-muted/20 transition-colors">
                      <td className="py-3 px-3.5 font-medium text-foreground sticky left-0 bg-card/95 backdrop-blur-xs z-10 border-r border-border">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-md bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                            <FiClock className="w-3.5 h-3.5" />
                          </div>
                          <div>
                            <div className="font-bold text-xs text-foreground">TOTAL WORK HOURS</div>
                            <div className="text-[10px] text-muted-foreground">Rendered shift time &amp; punches</div>
                          </div>
                        </div>
                      </td>
                      {resolvedMatrix.days.map((day) => {
                        const hasHours = day.work_hours > 0
                        return (
                          <td key={day.day_label} className="py-2.5 px-3 text-center border-r border-border/60 align-top">
                            <div className={`font-mono text-sm font-bold ${hasHours ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground/60'}`}>
                              {day.work_hours.toFixed(2)} <span className="text-[10px] font-sans font-normal">hrs</span>
                            </div>
                            <div className="mt-1 text-[10px] font-mono text-muted-foreground space-y-0.5">
                              <div>In: <strong className="text-foreground">{day.time_in || '--'}</strong></div>
                              <div>Out: <strong className="text-foreground">{day.time_out || '--'}</strong></div>
                            </div>
                            {day.overtime_hours > 0 && (
                              <span className="inline-block mt-1 px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                +{day.overtime_hours}h OT
                              </span>
                            )}
                          </td>
                        )
                      })}
                      <td className="py-2.5 px-3.5 text-center bg-muted/20 align-top">
                        <div className="font-mono text-base font-black text-emerald-600 dark:text-emerald-400">
                          {metrics.workHours} <span className="text-xs font-sans font-normal">hrs</span>
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          ~{metrics.workDays} of 6 workdays
                        </div>
                        <div className="text-[10px] font-mono font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                          +{fmt(metrics.grossPay)} Gross
                        </div>
                      </td>
                    </tr>

                    {/* ROW 2: TOTAL LATE */}
                    <tr className="hover:bg-muted/20 transition-colors">
                      <td className="py-3 px-3.5 font-medium text-foreground sticky left-0 bg-card/95 backdrop-blur-xs z-10 border-r border-border">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-md bg-rose-500/15 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                            <FiClock className="w-3.5 h-3.5" />
                          </div>
                          <div>
                            <div className="font-bold text-xs text-foreground">TOTAL LATE</div>
                            <div className="text-[10px] text-muted-foreground">Arrival tardiness &amp; time</div>
                          </div>
                        </div>
                      </td>
                      {resolvedMatrix.days.map((day) => {
                        const isLate = day.late_minutes > 0
                        const dayLateDed = isLate ? Math.round(day.late_minutes * (metrics.minuteRate || 1.0417) * 100) / 100 : 0
                        return (
                          <td key={day.day_label} className="py-2.5 px-3 text-center border-r border-border/60 align-top">
                            <div className={`font-mono text-sm font-bold ${isLate ? 'text-rose-600 dark:text-rose-400' : 'text-muted-foreground/60'}`}>
                              {day.late_minutes} <span className="text-[10px] font-sans font-normal">mins</span>
                            </div>
                            <div className="mt-1 text-[10px] text-muted-foreground font-mono">
                              {day.time_in ? (
                                <span>In: {day.time_in}</span>
                              ) : (
                                <span className="italic opacity-60">No Punch</span>
                              )}
                            </div>
                            {isLate ? (
                              <div className="mt-1 font-mono text-[10px] font-bold text-rose-500">
                                -{fmt(dayLateDed)}
                              </div>
                            ) : (
                              <span className="inline-block mt-1 text-[9px] font-semibold text-emerald-600 dark:text-emerald-400">
                                {day.time_in ? 'On-time' : '--'}
                              </span>
                            )}
                          </td>
                        )
                      })}
                      <td className="py-2.5 px-3.5 text-center bg-muted/20 align-top">
                        <div className="font-mono text-base font-black text-rose-600 dark:text-rose-400">
                          {metrics.lateMinutes} <span className="text-xs font-sans font-normal">mins</span>
                        </div>
                        <div className="text-[10px] font-mono font-bold text-rose-500 mt-1">
                          -{fmt(metrics.latePenalty)} Tardiness
                        </div>
                      </td>
                    </tr>

                    {/* ROW 3: TOTAL ABSENCES */}
                    <tr className="hover:bg-muted/20 transition-colors">
                      <td className="py-3 px-3.5 font-medium text-foreground sticky left-0 bg-card/95 backdrop-blur-xs z-10 border-r border-border">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                            <FiAlertTriangle className="w-3.5 h-3.5" />
                          </div>
                          <div>
                            <div className="font-bold text-xs text-foreground">TOTAL ABSENCES</div>
                            <div className="text-[10px] text-muted-foreground">Status &amp; leave category</div>
                          </div>
                        </div>
                      </td>
                      {resolvedMatrix.days.map((day) => {
                        const statusColor = 
                          day.status === 'Present' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' :
                          day.status === 'Late' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' :
                          day.status === 'Half Day' ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20' :
                          day.status === 'Absent' ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20' :
                          'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'

                        return (
                          <td key={day.day_label} className="py-2.5 px-3 text-center border-r border-border/60 align-top">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusColor}`}>
                              {day.status}
                            </span>
                            <div className="mt-1 text-[10px] font-mono text-muted-foreground">
                              {day.absence_score > 0 ? (
                                <span className="text-rose-500 font-semibold">{day.absence_score}d missed</span>
                              ) : (
                                <span className="text-emerald-600 dark:text-emerald-400">0d missed</span>
                              )}
                            </div>
                            {day.remarks && (
                              <div className="mt-1 text-[9px] text-muted-foreground truncate max-w-[110px] mx-auto" title={day.remarks}>
                                {day.remarks}
                              </div>
                            )}
                          </td>
                        )
                      })}
                      <td className="py-2.5 px-3.5 text-center bg-muted/20 align-top">
                        <div className="font-mono text-base font-black text-rose-600 dark:text-rose-400">
                          {metrics.absenceDays} <span className="text-xs font-sans font-normal">day(s)</span>
                        </div>
                        <div className="text-[10px] font-mono font-bold text-rose-500 mt-1">
                          -{fmt(metrics.absenceDeduction)} Absence
                        </div>
                      </td>
                    </tr>

                    {/* ROW 4: TOTAL UNDERTIME */}
                    <tr className="hover:bg-muted/20 transition-colors">
                      <td className="py-3 px-3.5 font-medium text-foreground sticky left-0 bg-card/95 backdrop-blur-xs z-10 border-r border-border">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-md bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                            <FiTrendingDown className="w-3.5 h-3.5" />
                          </div>
                          <div>
                            <div className="font-bold text-xs text-foreground">TOTAL UNDERTIME</div>
                            <div className="text-[10px] text-muted-foreground">Early departure minutes</div>
                          </div>
                        </div>
                      </td>
                      {resolvedMatrix.days.map((day) => {
                        const hasUt = day.undertime_minutes > 0
                        const dayUtDed = hasUt ? Math.round((day.undertime_minutes / 60) * (metrics.hourlyRate || 62.5) * 100) / 100 : 0
                        return (
                          <td key={day.day_label} className="py-2.5 px-3 text-center border-r border-border/60 align-top">
                            <div className={`font-mono text-sm font-bold ${hasUt ? 'text-blue-600 dark:text-blue-400' : 'text-muted-foreground/60'}`}>
                              {day.undertime_minutes} <span className="text-[10px] font-sans font-normal">mins</span>
                            </div>
                            <div className="mt-1 text-[10px] text-muted-foreground font-mono">
                              {day.time_out ? (
                                <span>Out: {day.time_out}</span>
                              ) : (
                                <span className="italic opacity-60">No Punch</span>
                              )}
                            </div>
                            {hasUt ? (
                              <div className="mt-1 font-mono text-[10px] font-bold text-rose-500">
                                -{fmt(dayUtDed)}
                              </div>
                            ) : (
                              <span className="inline-block mt-1 text-[9px] font-semibold text-emerald-600 dark:text-emerald-400">
                                {day.time_out ? 'Full Shift' : '--'}
                              </span>
                            )}
                          </td>
                        )
                      })}
                      <td className="py-2.5 px-3.5 text-center bg-muted/20 align-top">
                        <div className="font-mono text-base font-black text-blue-600 dark:text-blue-400">
                          {metrics.undertimeMinutes} <span className="text-xs font-sans font-normal">mins</span>
                        </div>
                        <div className="text-[10px] font-mono font-bold text-rose-500 mt-1">
                          -{fmt(metrics.undertimeDeduction)} Undertime
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* 4 Required Metric Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {/* Total Work Hours */}
              <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 space-y-1 relative overflow-hidden">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">
                    Total Work Hours
                  </span>
                  <div className="w-7 h-7 rounded-lg bg-emerald-500/15 text-emerald-500 flex items-center justify-center">
                    <FiClock className="w-3.5 h-3.5" />
                  </div>
                </div>
                <div className="text-2xl font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  {metrics.workHours} <span className="text-xs font-sans font-normal opacity-80">hrs</span>
                </div>
                <p className="text-[10px] text-muted-foreground font-medium pt-1 border-t border-emerald-500/20">
                  ~{metrics.workDays} of 6 workdays • Standard 8h/day (Mon-Sat)
                </p>
              </div>

              {/* Total Undertime */}
              <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 space-y-1 relative overflow-hidden">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">
                    Total Undertime
                  </span>
                  <div className="w-7 h-7 rounded-lg bg-amber-500/15 text-amber-500 flex items-center justify-center">
                    <FiAlertTriangle className="w-3.5 h-3.5" />
                  </div>
                </div>
                <div className="text-2xl font-mono font-bold text-amber-600 dark:text-amber-400">
                  {metrics.undertimeMinutes} <span className="text-xs font-sans font-normal opacity-80">mins</span>
                </div>
                <p className="text-[10px] text-muted-foreground font-medium pt-1 border-t border-amber-500/20">
                  {metrics.undertimeHours > 0 ? `${metrics.undertimeHours}h logged` : 'No undertime'} • Deduction: <strong className="text-rose-500 font-mono">-{fmt(metrics.undertimeDeduction)}</strong>
                </p>
              </div>

              {/* Total Late */}
              <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/5 space-y-1 relative overflow-hidden">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">
                    Total Late
                  </span>
                  <div className="w-7 h-7 rounded-lg bg-rose-500/15 text-rose-500 flex items-center justify-center">
                    <FiClock className="w-3.5 h-3.5" />
                  </div>
                </div>
                <div className="text-2xl font-mono font-bold text-rose-600 dark:text-rose-400">
                  {metrics.lateMinutes} <span className="text-xs font-sans font-normal opacity-80">mins</span>
                </div>
                <p className="text-[10px] text-muted-foreground font-medium pt-1 border-t border-rose-500/20">
                  Tardiness penalty: <strong className="text-rose-500 font-mono">-{fmt(metrics.latePenalty)}</strong> ({metrics.lateMinutes}m @ ₱{metrics.minuteRate ? metrics.minuteRate.toFixed(2) : '1.04'}/m)
                </p>
              </div>

              {/* Total Absent */}
              <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/5 space-y-1 relative overflow-hidden">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">
                    Total Absent
                  </span>
                  <div className="w-7 h-7 rounded-lg bg-rose-500/15 text-rose-500 flex items-center justify-center">
                    <FiAlertCircle className="w-3.5 h-3.5" />
                  </div>
                </div>
                <div className="text-2xl font-mono font-bold text-rose-600 dark:text-rose-400">
                  {metrics.absenceDays} <span className="text-xs font-sans font-normal opacity-80">day(s)</span>
                </div>
                <p className="text-[10px] text-muted-foreground font-medium pt-1 border-t border-rose-500/20">
                  Absence deduction: <strong className="text-rose-500 font-mono">-{fmt(metrics.absenceDeduction)}</strong> (-{fmt(metrics.dailyRate || 500)}/d)
                </p>
              </div>
            </div>

            {/* Overtime & Rates Sub-bar */}
            <div className="p-3 rounded-xl bg-card border border-border flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-4">
                <span className="text-muted-foreground flex items-center gap-1.5 font-medium">
                  <FiTrendingUp className="w-3.5 h-3.5 text-amber-500" />
                  Overtime Logged:
                </span>
                <span className="font-mono font-bold text-foreground">
                  {metrics.overtimeHours} hrs
                </span>
                <span className="text-muted-foreground">•</span>
                <span className="text-muted-foreground">OT Premium Pay:</span>
                <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
                  +{fmt(metrics.overtimePay)}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-muted-foreground">Weekly Base:</span>
                <span className="font-mono font-bold text-foreground">{fmt(metrics.weeklyBasePay)}</span>
                <span className="text-muted-foreground">•</span>
                <span className="text-muted-foreground">Daily Rate:</span>
                <span className="font-mono font-bold text-foreground">{fmt(metrics.dailyRate)}/day</span>
                <span className="text-muted-foreground">•</span>
                <span className="text-muted-foreground">Hourly:</span>
                <span className="font-mono font-bold text-foreground">{fmt(metrics.hourlyRate)}/hr</span>
              </div>
            </div>
          </div>

          {/* 3. DEDUCTIONS BREAKDOWN */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <FiTrendingDown className="w-4 h-4 text-rose-500" />
                <span>Itemized Deductions Breakdown</span>
              </h3>
              <span className="text-xs font-mono font-bold text-rose-600 dark:text-rose-400">
                Total: -{fmt(metrics.totalDeductions)}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Statutory Deductions */}
              <div className="p-4 rounded-xl border border-blue-500/20 bg-blue-500/5 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-border/60">
                  <span className="text-xs font-bold text-foreground flex items-center gap-2">
                    <FiShield className="w-4 h-4 text-blue-500" />
                    <span>Statutory &amp; Government Contributions</span>
                  </span>
                  <span className="text-[10px] text-blue-500 font-bold uppercase">Mandatory</span>
                </div>

                <div className="space-y-2 text-xs">
                  {/* SSS */}
                  <div className="flex items-center justify-between p-2 rounded-lg bg-card border border-border">
                    <div>
                      <div className="font-bold text-foreground flex items-center gap-2">
                        <span>SSS Contribution</span>
                        <span className="px-1.5 py-0.2 rounded text-[9px] bg-blue-500/15 text-blue-600 font-bold">4.5%</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {activeRecord.sss_number || 'SSS Registered'}
                      </span>
                    </div>
                    <span className={`font-mono font-bold ${Number(activeRecord.sss_deduction || 0) > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400 dark:text-slate-500'}`}>
                      -{fmt(Number(activeRecord.sss_deduction || 0))}
                    </span>
                  </div>

                  {/* PhilHealth */}
                  <div className="flex items-center justify-between p-2 rounded-lg bg-card border border-border">
                    <div>
                      <div className="font-bold text-foreground flex items-center gap-2">
                        <span>PhilHealth Contribution</span>
                        <span className="px-1.5 py-0.2 rounded text-[9px] bg-emerald-500/15 text-emerald-600 font-bold">2.5%</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {activeRecord.philhealth_number || 'PHIC Registered'}
                      </span>
                    </div>
                    <span className={`font-mono font-bold ${Number(activeRecord.philhealth_deduction || 0) > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400 dark:text-slate-500'}`}>
                      -{fmt(Number(activeRecord.philhealth_deduction || 0))}
                    </span>
                  </div>

                  {/* Pag-IBIG */}
                  <div className="flex items-center justify-between p-2 rounded-lg bg-card border border-border">
                    <div>
                      <div className="font-bold text-foreground flex items-center gap-2">
                        <span>Pag-IBIG Fund</span>
                        <span className="px-1.5 py-0.2 rounded text-[9px] bg-amber-500/15 text-amber-600 font-bold">HDMF</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {activeRecord.pagibig_number || 'HDMF Registered'}
                      </span>
                    </div>
                    <span className={`font-mono font-bold ${Number(activeRecord.pagibig_deduction || 0) > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400 dark:text-slate-500'}`}>
                      -{fmt(Number(activeRecord.pagibig_deduction || 0))}
                    </span>
                  </div>

                  {/* Withholding Tax */}
                  <div className="flex items-center justify-between p-2 rounded-lg bg-card border border-border">
                    <div>
                      <div className="font-bold text-foreground flex items-center gap-2">
                        <span>BIR Withholding Tax</span>
                        <span className="px-1.5 py-0.2 rounded text-[9px] bg-purple-500/15 text-purple-600 font-bold">TRAIN</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {activeRecord.tin_number || 'TIN Registered'}
                      </span>
                    </div>
                    <span className={`font-mono font-bold ${Number(activeRecord.withholding_tax_deduction || 0) > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400 dark:text-slate-500'}`}>
                      -{fmt(Number(activeRecord.withholding_tax_deduction || 0))}
                    </span>
                  </div>
                </div>
              </div>

              {/* Attendance & Other Deductions */}
              <div className="p-4 rounded-xl border border-rose-500/20 bg-rose-500/5 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-border/60">
                  <span className="text-xs font-bold text-foreground flex items-center gap-2">
                    <FiAlertCircle className="w-4 h-4 text-rose-500" />
                    <span>Attendance Penalties &amp; Other</span>
                  </span>
                  <span className="text-[10px] text-rose-500 font-bold uppercase">Itemized</span>
                </div>

                <div className="space-y-2 text-xs">
                  {/* Absences */}
                  <div className="p-2.5 rounded-lg bg-card border border-border space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-bold text-foreground">Absences Deduction</div>
                        <span className="text-[10px] text-muted-foreground">
                          {metrics.absenceDays} day(s) missed {metrics.dailyRate > 0 ? `(${fmt(metrics.dailyRate)}/day)` : ''}
                        </span>
                      </div>
                      <span className="font-mono font-bold text-rose-600 dark:text-rose-400">
                        -{fmt(metrics.absenceDeduction)}
                      </span>
                    </div>

                    {/* Dynamic Itemized Message Reports Breakdown */}
                    {Array.isArray(activeRecord?.absence_breakdown) && activeRecord.absence_breakdown.length > 0 && (
                      <div className="pt-2 border-t border-border/60 space-y-1.5">
                        <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">
                          Excuses &amp; Leaves Itemized:
                        </div>
                        {activeRecord.absence_breakdown.map((ab, idx) => {
                          const isPaid = ab.is_paid || Number(ab.amount) === 0 || ab.leave_type === 'Leave with Pay'
                          return (
                            <div key={idx} className="flex items-center justify-between text-[11px] p-1.5 rounded bg-muted/40">
                              <div className="flex flex-col">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-primary/10 text-primary border border-primary/20">
                                    {ab.category}
                                  </span>
                                  <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold border ${
                                    isPaid
                                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                                      : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                                  }`}>
                                    {isPaid ? 'With Pay' : 'Without Pay'}
                                  </span>
                                  <span className="font-medium text-foreground">{ab.reason}</span>
                                </div>
                                <span className="text-[10px] text-muted-foreground">
                                  {ab.days} day(s) &bull; {ab.from_date} to {ab.to_date}
                                </span>
                              </div>
                              <span className={`font-mono font-bold ${isPaid ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                {isPaid ? '₱0.00 (Paid Leave)' : `-${fmt(ab.amount)}`}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {/* Late Penalty */}
                  <div className="flex items-center justify-between p-2 rounded-lg bg-card border border-border">
                    <div>
                      <div className="font-bold text-foreground">Late Tardiness Penalty</div>
                      <span className="text-[10px] text-muted-foreground">
                        {metrics.lateMinutes} minutes tardy
                      </span>
                    </div>
                    <span className="font-mono font-bold text-rose-600 dark:text-rose-400">
                      -{fmt(metrics.latePenalty)}
                    </span>
                  </div>

                  {/* Undertime */}
                  <div className="flex items-center justify-between p-2 rounded-lg bg-card border border-border">
                    <div>
                      <div className="font-bold text-foreground">Undertime Penalty</div>
                      <span className="text-[10px] text-muted-foreground">
                        {metrics.undertimeMinutes} mins early departure
                      </span>
                    </div>
                    <span className="font-mono font-bold text-rose-600 dark:text-rose-400">
                      -{fmt(metrics.undertimeDeduction)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 4. COMPLETE PAYROLL SUMMARY */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <TbCurrencyPeso className="w-4 h-4 text-emerald-500" />
              <span>Complete Payroll Summary &amp; Net Payout</span>
            </h3>

            {/* 3 Main Aggregate Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Gross Pay */}
              <div className="p-4 rounded-xl border border-border bg-card space-y-1">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                  Total Gross Earnings
                </span>
                <div className="text-xl font-mono font-bold text-foreground">
                  {fmt(metrics.grossPay)}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Basic Pay + OT ({fmt(metrics.overtimePay)}) + Allowances ({fmt(metrics.allowance)})
                </p>
              </div>

              {/* Total Deductions */}
              <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/5 space-y-1">
                <span className="text-[10px] font-bold text-rose-500 uppercase tracking-wider block">
                  Total Deductions
                </span>
                <div className="text-xl font-mono font-bold text-rose-600 dark:text-rose-400">
                  -{fmt(metrics.totalDeductions)}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Statutory, attendance tardiness &amp; missed shift penalties
                </p>
              </div>

              {/* Net Take-Home Pay */}
              <div className="p-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 space-y-1 shadow-sm">
                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block">
                  Net Take-Home Pay
                </span>
                <div className="text-2xl font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  {fmt(metrics.netPay)}
                </div>
                <p className="text-[10px] text-emerald-700/80 dark:text-emerald-300/80 font-medium">
                  Direct net payable to employee
                </p>
              </div>
            </div>

            {/* Employee Rates & Payment Metadata */}
            <div className="p-4 rounded-xl bg-card border border-border/80 text-xs flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-4">
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase block font-semibold">Monthly Basic</span>
                  <span className="font-mono font-bold text-foreground">{fmt(metrics.basicMonthly)}</span>
                </div>
                <div className="border-l border-border/60 pl-4">
                  <span className="text-[10px] text-muted-foreground uppercase block font-semibold">Daily Rate</span>
                  <span className="font-mono font-bold text-foreground">{fmt(metrics.dailyRate)}</span>
                </div>
                <div className="border-l border-border/60 pl-4">
                  <span className="text-[10px] text-muted-foreground uppercase block font-semibold">Hourly Rate</span>
                  <span className="font-mono font-bold text-foreground">{fmt(metrics.hourlyRate)}</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-right">
                  <span className="text-[10px] text-muted-foreground uppercase block font-semibold">Disbursement Mode</span>
                  <span className="font-semibold text-foreground">{activeRecord.pay_type || 'Cash'}</span>
                </div>
                <div className="border-l border-border/60 pl-3 text-right">
                  <span className="text-[10px] text-muted-foreground uppercase block font-semibold">Approved By</span>
                  <span className="font-semibold text-foreground">{activeRecord.approved_by || 'Management'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-border bg-card/60 backdrop-blur-md flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            <FiShield className="w-4 h-4 text-blue-500 shrink-0" />
            <span>
              Official payroll and attendance record for <strong className="text-foreground">{activeRecord.employee_name}</strong>
            </span>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            {typeof onOpenPayslip === 'function' && (
              <button
                type="button"
                onClick={() => onOpenPayslip(activeRecord)}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl border border-border hover:bg-muted text-foreground transition-colors cursor-pointer"
              >
                <FiFileText className="w-3.5 h-3.5" />
                <span>Open Itemized Payslip</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-md transition-all active:scale-95 cursor-pointer"
            >
              Done / Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

