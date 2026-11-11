import React, { useState, useEffect, useMemo } from 'react'
import {
  FiCheckCircle, FiAlertCircle, FiX, FiChevronRight, FiChevronLeft,
  FiUser, FiLayers, FiCreditCard, FiCheck, FiSearch,
  FiClock, FiTrendingDown, FiDollarSign, FiCalendar, FiArrowRight,
  FiPrinter, FiFileText, FiPlus, FiMinus, FiAlertTriangle, FiLock,
  FiUsers
} from 'react-icons/fi'
import { TbCurrencyPeso } from 'react-icons/tb'
import { api } from '../../lib/api'
import { showToast } from '../../lib/swal'
import { fmt } from '../../lib/utils'
import { useAuth } from '../../context/AuthContext'
import zliczLogo from '../../assets/zlicz-logo.png'

export default function PayrollWorkflowModal({
  isOpen,
  onClose,
  branches = [],
  periods = [],
  currentPeriodId = '',
  isStoreAdmin = false,
  userBranchName = '',
  onSuccess
}) {
  const { user } = useAuth()
  // Wizard Step: 1 = Branch, 2 = Employee, 3 = Attendance & Time, 4 = Review & Approval
  const [currentStep, setCurrentStep] = useState(1)

  // Step 1: Branch Selection
  const [selectedBranch, setSelectedBranch] = useState('')
  const [branchEmployees, setBranchEmployees] = useState([])
  const [loadingBranchEmployees, setLoadingBranchEmployees] = useState(false)

  // Step 2: Employee Selection & Period / Cutoff Dates
  const [employeeSearch, setEmployeeSearch] = useState('')
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('')
  const [selectedPeriodId, setSelectedPeriodId] = useState(currentPeriodId || '')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  // Step 3: Attendance & Time Inputs (Standard Weekly Schedule: 48h, 6 days)
  const [workHours, setWorkHours] = useState('48')
  const [absenceDays, setAbsenceDays] = useState('0')
  const [lateMinutes, setLateMinutes] = useState('0')
  const [undertimeMinutes, setUndertimeMinutes] = useState('0')
  const [overtimeHours, setOvertimeHours] = useState('0')

  // Step 4: Government Contributions & Taxes
  const [includeSss, setIncludeSss] = useState(true)
  const [includePagibig, setIncludePagibig] = useState(true)
  const [includePhilhealth, setIncludePhilhealth] = useState(true)
  const [includeTax, setIncludeTax] = useState(false)
  const [includeCustomDeductions, setIncludeCustomDeductions] = useState(true)
  const [includeLoans, setIncludeLoans] = useState(true)

  // Statutory Deduction Toggle Handler
  const handleToggleStatutory = (type) => {
    if (type === 'sss') {
      setIncludeSss(prev => !prev)
    } else if (type === 'philhealth') {
      setIncludePhilhealth(prev => !prev)
    } else if (type === 'pagibig') {
      setIncludePagibig(prev => !prev)
    }
  }



  // Step 5: Review & Preview State
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [previewData, setPreviewData] = useState(null)
  const [previewError, setPreviewError] = useState('')
  const [approving, setApproving] = useState(false)
  const [approvalResult, setApprovalResult] = useState(null)
  const [notes, setNotes] = useState('')
  const [viewingPayslip, setViewingPayslip] = useState(false)
  const [proofFile, setProofFile] = useState(null)
  const [proofPreview, setProofPreview] = useState('')

  const handleProofFileChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (proofPreview) URL.revokeObjectURL(proofPreview)
    setProofFile(file)
    setProofPreview(URL.createObjectURL(file))
  }

  const clearProofFile = () => {
    if (proofPreview) URL.revokeObjectURL(proofPreview)
    setProofFile(null)
    setProofPreview('')
  }

  // Initialize or sync branch when modal opens
  useEffect(() => {
    if (!isOpen) {
      setCurrentStep(1)
      setSelectedEmployeeId('')
      setPreviewData(null)
      setApprovalResult(null)
      setNotes('')
      setWorkHours('48')
      setAbsenceDays('0')
      setLateMinutes('0')
      setUndertimeMinutes('0')
      setOvertimeHours('0')
      setViewingPayslip(false)
      clearProofFile()
      return
    }

    const initialBranch = isStoreAdmin
      ? userBranchName || (branches[0]?.name || '')
      : (branches[0]?.name || '')

    if (initialBranch) {
      setSelectedBranch(initialBranch)
      fetchBranchEmployees(initialBranch)
    }

    if (currentPeriodId) {
      setSelectedPeriodId(currentPeriodId)
    } else if (periods.length > 0) {
      const openPeriod = periods.find(p => p.status === 'Open') || periods[0]
      setSelectedPeriodId(openPeriod?.period_id?.toString() || '')
    }
  }, [isOpen, isStoreAdmin, userBranchName, branches, currentPeriodId, periods])

  // Helper to calculate current week's dates (Monday to Saturday, 6 working days)
  const getWeeklyDates = () => {
    const now = new Date()
    const dayOfWeek = now.getDay() // 0 = Sun, 1 = Mon ... 6 = Sat
    const diffToMon = now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1)
    const mon = new Date(now.getFullYear(), now.getMonth(), diffToMon)
    const sat = new Date(mon)
    sat.setDate(mon.getDate() + 5)
    const fmtYMD = (d) => {
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      return `${y}-${m}-${day}`
    }
    return { from: fmtYMD(mon), to: fmtYMD(sat) }
  }

  // Sync fromDate and toDate with selected period or weekly default
  useEffect(() => {
    if (selectedPeriodId === 'auto_weekly') {
      const { from, to } = getWeeklyDates()
      setFromDate(from)
      setToDate(to)
      return
    }

    if (selectedPeriodId) {
      const prd = periods.find(p => String(p.period_id) === String(selectedPeriodId))
      if (prd?.start_date && prd?.end_date) {
        setFromDate(prd.start_date)
        setToDate(prd.end_date)
        return
      }
    }

    // Default to current weekly cutoff (Mon-Sat, 6 days) if no period dates available
    const { from, to } = getWeeklyDates()
    setFromDate(from)
    setToDate(to)
  }, [selectedPeriodId, periods, isOpen])

  // Calculate covered days count
  const daysCount = useMemo(() => {
    if (!fromDate || !toDate) return 0
    const d1 = new Date(fromDate)
    const d2 = new Date(toDate)
    const diff = Math.round((d2 - d1) / (1000 * 60 * 60 * 24)) + 1
    return isNaN(diff) || diff < 0 ? 0 : diff
  }, [fromDate, toDate])

  // Detect if current mode is Weekly Salary (Default true for Weekly Payroll Cycle)
  const isWeekly = useMemo(() => {
    if (selectedPeriodId === 'auto_weekly') return true
    if (previewData?.period?.is_weekly !== undefined) return Boolean(previewData.period.is_weekly)
    if (previewData?.calculation?.is_weekly !== undefined) return Boolean(previewData.calculation.is_weekly)
    const prd = periods.find(p => String(p.period_id) === String(selectedPeriodId))
    if (prd?.period_name && prd.period_name.toLowerCase().includes('monthly') && !prd.period_name.toLowerCase().includes('weekly')) return false
    return true
  }, [selectedPeriodId, previewData, periods])

  // Fetch active employees dynamically when branch is selected
  const fetchBranchEmployees = async (branchName) => {
    if (!branchName) return
    setLoadingBranchEmployees(true)
    try {
      const res = await api.payroll.getEligibleEmployees({
        branch: branchName !== 'All' ? branchName : undefined,
      })
      const emps = res?.employees || []
      setBranchEmployees(emps)
      // Reset selected employee if not in current branch list
      setSelectedEmployeeId(prev => {
        if (prev === 'all') return 'all'
        const stillExists = emps.some(e => String(e.employee_id) === String(prev))
        return stillExists ? prev : ''
      })
    } catch (err) {
      console.error('Failed to load branch employees:', err)
      showToast('Could not load employees for this branch', 'error')
    } finally {
      setLoadingBranchEmployees(false)
    }
  }

  // Handle Branch Change
  const handleBranchChange = (branchName) => {
    setSelectedBranch(branchName)
    setSelectedEmployeeId('')
    setPreviewData(null)
    fetchBranchEmployees(branchName)
  }

  // Is "Select All Employees" active
  const isAllEmployees = selectedEmployeeId === 'all'

  // Filtered employees for search
  const filteredEmployees = useMemo(() => {
    if (!employeeSearch.trim()) return branchEmployees
    const q = employeeSearch.toLowerCase()
    return branchEmployees.filter(emp =>
      (emp.full_name && emp.full_name.toLowerCase().includes(q)) ||
      (emp.employee_code && emp.employee_code.toLowerCase().includes(q)) ||
      (emp.position && emp.position.toLowerCase().includes(q)) ||
      (emp.department && emp.department.toLowerCase().includes(q))
    )
  }, [branchEmployees, employeeSearch])

  // Selected Employee object (only for single employee mode)
  const selectedEmployee = useMemo(() => {
    if (isAllEmployees) return null
    return branchEmployees.find(e => String(e.employee_id) === String(selectedEmployeeId)) || null
  }, [branchEmployees, selectedEmployeeId, isAllEmployees])

  const resolveWorkflowEmployeeRates = (e) => {
    const rawDr = Number(e?.daily_rate || 0)
    const rawBasic = Number(e?.basic_salary || 0)
    const dailyRate = (rawDr >= 100 && rawDr <= 500)
      ? rawDr
      : ((rawBasic >= 2600 && rawBasic <= 13000) ? round2(rawBasic / 26) : 500)
    const monthlyBasic = round2(dailyRate * 26)
    const hourlyRate = round2(dailyRate / 8)
    const weeklyBase = round2(dailyRate * 6)
    return { monthlyBasic, dailyRate, hourlyRate, weeklyBase }
  }

  // Aggregate metrics for batch processing mode
  const batchMetrics = useMemo(() => {
    const emps = filteredEmployees || []
    let totalBasic = 0
    let totalDaily = 0
    let totalHourly = 0
    let totalBasePay = 0
    emps.forEach((e) => {
      const { monthlyBasic, dailyRate, hourlyRate, weeklyBase } = resolveWorkflowEmployeeRates(e)
      totalBasic += monthlyBasic
      totalDaily += dailyRate
      totalHourly += hourlyRate
      totalBasePay += isWeekly ? weeklyBase : monthlyBasic / 2
    })
    return {
      totalCount: emps.length,
      totalBasic: round2(totalBasic),
      totalDaily: round2(totalDaily),
      totalHourly: round2(totalHourly),
      totalBasePay: round2(totalBasePay),
    }
  }, [filteredEmployees, isWeekly])

  // Batch attendance aggregates across all filtered employees
  const batchAttendanceSummary = useMemo(() => {
    if (!isAllEmployees) return null
    if (previewData?.employees && Array.isArray(previewData.employees)) {
      return previewData.employees.reduce((acc, emp) => {
        const c = emp.calculation || {}
        acc.totalHours += Number(c.work_hours || 0)
        acc.totalAbsences += Number(c.absence_days || 0)
        acc.totalAbsenceDeduction += Number(c.absence_deduction || 0)
        acc.totalLateMinutes += Number(c.late_minutes || 0)
        acc.totalLatePenalty += Number(c.late_penalty || 0)
        acc.totalUndertimeMinutes += Number(c.undertime_minutes || 0)
        acc.totalUndertimeDeduction += Number(c.undertime_deduction || 0)
        acc.totalAttendanceDeductions += Number(c.absence_deduction || 0) + Number(c.late_penalty || 0) + Number(c.undertime_deduction || 0)
        acc.totalSss += Number(c.sss || 0)
        acc.totalPhilhealth += Number(c.philhealth || 0)
        acc.totalPagibig += Number(c.pagibig || 0)
        acc.totalTax += Number(c.withholding_tax || 0)
        return acc
      }, {
        totalHours: 0,
        totalAbsences: 0,
        totalAbsenceDeduction: 0,
        totalLateMinutes: 0,
        totalLatePenalty: 0,
        totalUndertimeMinutes: 0,
        totalUndertimeDeduction: 0,
        totalAttendanceDeductions: 0,
        totalSss: 0,
        totalPhilhealth: 0,
        totalPagibig: 0,
        totalTax: 0,
      })
    }
    const defaultHours = filteredEmployees.length * (isWeekly ? 48 : 104)
    return {
      totalHours: defaultHours,
      totalAbsences: 0,
      totalAbsenceDeduction: 0,
      totalLateMinutes: 0,
      totalLatePenalty: 0,
      totalUndertimeMinutes: 0,
      totalUndertimeDeduction: 0,
      totalAttendanceDeductions: 0,
      totalSss: 0,
      totalPhilhealth: 0,
      totalPagibig: 0,
      totalTax: 0,
    }
  }, [isAllEmployees, previewData, filteredEmployees.length, isWeekly])

  // Auto-fetch and calculate attendance records (work hours, absences, late minutes, undertime)
  const autoLoadEmployeeAttendance = async (empId = selectedEmployeeId, from = fromDate, to = toDate) => {
    const targetEmpId = empId || selectedEmployeeId
    if (!targetEmpId) return
    setLoadingPreview(true)
    try {
      // Calling preview without manual attendance overrides calculates directly from DB attendance logs
      const res = await api.payroll.calculatePreview({
        employee_id: targetEmpId,
        branch: selectedBranch !== 'All' ? selectedBranch : undefined,
        employee_ids: targetEmpId === 'all' ? filteredEmployees.map(e => e.employee_id) : undefined,
        period_id: selectedPeriodId || undefined,
        cutoff_type: isWeekly ? 'weekly' : 'semi-monthly',
        from_date: from || undefined,
        to_date: to || undefined,
      })
      if (res?.calculation) {
        const c = res.calculation
        setWorkHours(String(c.work_hours ?? (isWeekly ? 48 : 104)))
        setAbsenceDays(String(c.absence_days ?? 0))
        setLateMinutes(String(c.late_minutes ?? 0))
        setUndertimeMinutes(String(c.undertime_minutes ?? 0))
        setOvertimeHours(String(c.overtime_hours ?? 0))
        setPreviewData(res)
      }
    } catch (err) {
      console.warn('Could not auto-load attendance from logs:', err)
    } finally {
      setLoadingPreview(false)
    }
  }

  // Select employee and automatically calculate deductions from attendance logs
  const handleSelectEmployee = (emp) => {
    setSelectedEmployeeId(emp.employee_id)
    autoLoadEmployeeAttendance(emp.employee_id, fromDate, toDate)
  }

  // Live client-side calculation helper synchronized identically with backend rules
  const clientComputation = useMemo(() => {
    const previewCalc = (!isAllEmployees && previewData?.calculation) ? previewData.calculation : null
    const { monthlyBasic, dailyRate, hourlyRate, weeklyBase } = previewCalc
      ? {
          monthlyBasic: Number(previewCalc.monthly_basic || 13000),
          dailyRate: Number(previewCalc.daily_rate || 500),
          hourlyRate: Number(previewCalc.hourly_rate || 62.5),
          weeklyBase: Number(previewCalc.weekly_base || 3000),
        }
      : resolveWorkflowEmployeeRates(selectedEmployee)

    const numWorkHours = parseFloat(workHours) || 0
    const numAbsenceDays = parseFloat(absenceDays) || 0
    const numLateMinutes = parseInt(lateMinutes, 10) || 0
    const numUndertimeMinutes = parseFloat(undertimeMinutes) || 0
    const numOvertimeHours = 0
    const paidLeaveDays = Number(previewCalc?.paid_leave_days || 0)

    // Gross Pay base: Weekly (6 days @ 8h = 48h) or Semi-Monthly (13 days @ 8h = 104h)
    const semiMonthlyBase = round2(monthlyBasic / 2)
    const standardHours = isWeekly ? 48 : 104
    const standardBase = isWeekly ? weeklyBase : semiMonthlyBase

    // Strict Zero Hours Rule (unless covered by approved Paid Leave):
    // 0 rendered working hours -> base pay, gross pay, deductions, and net pay strictly ₱0.00
    const isZeroHours = previewCalc?.zero_hours !== undefined && Number(previewCalc.work_hours || 0) === numWorkHours
      ? Boolean(previewCalc.zero_hours)
      : (numWorkHours <= 0 && paidLeaveDays <= 0)

    if (isZeroHours) {
      return {
        monthlyBasic,
        dailyRate,
        hourlyRate,
        isWeekly,
        standardHours,
        weeklyBase,
        semiMonthlyBase,
        workHours: 0,
        periodBasePay: 0,
        overtimeHours: 0,
        overtimePay: 0,
        allowance: 0,
        grossPay: 0,
        absenceDays: numAbsenceDays,
        absenceDeduction: 0,
        lateMinutes: 0,
        latePenalty: 0,
        lateRule: 'Zero Work Hours - Salary ₱0.00',
        undertimeMinutes: 0,
        undertimeHours: 0,
        undertimeDeduction: 0,
        sss: 0,
        philhealth: 0,
        pagibig: 0,
        withholdingTax: 0,
        attendanceDeductions: 0,
        governmentDeductions: 0,
        customDeductionsSum: 0,
        loanDeductionsSum: 0,
        totalDeductions: 0,
        netPay: 0,
        isZeroHours: true,
      }
    }

    const periodBasePay = standardBase
    const overtimePay = 0
    const allowance = Number(previewCalc?.allowance || 0)
    const grossPay = round2(periodBasePay + allowance)

    // Late Penalty: 1–29 mins/day @ ₱1.00/min (30+ mins on a single day is converted to Half Day under Absences by backend)
    const latePenalty = (previewCalc && previewCalc.late_penalty !== undefined && Number(previewCalc.late_minutes || 0) === numLateMinutes)
      ? round2(previewCalc.late_penalty)
      : round2(Math.max(0, numLateMinutes) * 1.0)
    const lateRule = latePenalty > 0
      ? (previewCalc?.late_rule || `₱1.00 / min (${numLateMinutes} mins = ₱${latePenalty.toFixed(2)})`)
      : 'None'

    // Absence Deduction: deduct only unpaid absences + 0.5-day Half Days (never deduct Paid Leave days)
    const unpaidAbsenceDays = Math.max(0, numAbsenceDays - paidLeaveDays)
    const absenceDeduction = (previewCalc && previewCalc.absence_deduction !== undefined && Number(previewCalc.absence_days || 0) === numAbsenceDays)
      ? round2(previewCalc.absence_deduction)
      : round2(unpaidAbsenceDays * dailyRate)

    // Undertime Deduction: Proportionate deduction based on hourly rate
    const undertimeHours = round2(numUndertimeMinutes / 60)
    const undertimeDeduction = (previewCalc && previewCalc.undertime_deduction !== undefined && Number(previewCalc.undertime_minutes || 0) === numUndertimeMinutes)
      ? round2(previewCalc.undertime_deduction)
      : round2((numUndertimeMinutes / 60) * hourlyRate)

    // Standard Statutory Contributions (strictly from approved employee_deductions selection):
    const sss = includeSss ? Number(previewCalc?.sss || 0) : 0
    const philhealth = includePhilhealth ? Number(previewCalc?.philhealth || 0) : 0
    const pagibig = includePagibig ? Number(previewCalc?.pagibig || 0) : 0
    const withholdingTax = includeTax ? Number(previewCalc?.withholding_tax || 0) : 0

    const customDeductionsSum = includeCustomDeductions ? Number(previewCalc?.custom_deductions_sum || 0) : 0
    const loanDeductionsSum = includeLoans ? Number(previewCalc?.loan_deductions_sum || 0) : 0

    const attendanceDeductions = round2(absenceDeduction + latePenalty + undertimeDeduction)
    const governmentDeductions = round2(sss + philhealth + pagibig + withholdingTax)
    const totalDeductions = round2(attendanceDeductions + governmentDeductions + customDeductionsSum + loanDeductionsSum)
    const netPay = Math.max(0, round2(grossPay - totalDeductions))

    return {
      monthlyBasic,
      dailyRate,
      hourlyRate,
      isWeekly,
      standardHours,
      weeklyBase,
      semiMonthlyBase,
      workHours: numWorkHours,
      periodBasePay,
      overtimeHours: numOvertimeHours,
      overtimePay,
      allowance,
      grossPay,
      absenceDays: numAbsenceDays,
      absenceDeduction,
      lateMinutes: numLateMinutes,
      latePenalty,
      lateRule,
      undertimeMinutes: numUndertimeMinutes,
      undertimeHours,
      undertimeDeduction,
      sss,
      philhealth,
      pagibig,
      withholdingTax,
      attendanceDeductions,
      governmentDeductions,
      customDeductionsSum,
      loanDeductionsSum,
      totalDeductions,
      netPay,
      isZeroHours: false,
    }
  }, [
    selectedEmployee,
    isAllEmployees,
    workHours,
    absenceDays,
    lateMinutes,
    undertimeMinutes,
    overtimeHours,
    includeSss,
    includePhilhealth,
    includePagibig,
    includeTax,
    includeCustomDeductions,
    includeLoans,
    isWeekly,
    previewData
  ])

  function round2(val) {
    return Math.round((Number(val) || 0) * 100) / 100
  }

  // Day 1 to Day 6 Tabular Attendance Matrix for workflow preview
  const singleDailyMatrix = useMemo(() => {
    if (isAllEmployees) return null
    if (previewData?.daily_matrix?.days?.length === 6) {
      return previewData.daily_matrix
    }
    if (previewData?.calculation?.daily_matrix?.days?.length === 6) {
      return previewData.calculation.daily_matrix
    }

    const sDateStr = fromDate || new Date().toISOString().slice(0, 10)
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
        total_work_hours: clientComputation.workHours || 0,
        total_late_minutes: clientComputation.lateMinutes || 0,
        total_undertime_minutes: clientComputation.undertimeMinutes || 0,
        total_overtime_hours: clientComputation.overtimeHours || 0,
        total_absent_days: clientComputation.absenceDays || 0,
        days_present: 0,
        standard_hours: 48,
        standard_days: 6
      }
    }
  }, [isAllEmployees, previewData, fromDate, clientComputation])

  // Fetch or update calculation preview from backend (strictly automated from DB logs)
  const fetchCalculationPreview = async () => {
    if (!selectedEmployeeId) return
    setLoadingPreview(true)
    setPreviewError('')

    try {
      const payload = {
        employee_id: selectedEmployeeId,
        branch: selectedBranch !== 'All' ? selectedBranch : undefined,
        employee_ids: selectedEmployeeId === 'all' ? filteredEmployees.map(e => e.employee_id) : undefined,
        period_id: selectedPeriodId || undefined,
        cutoff_type: isWeekly ? 'weekly' : 'semi-monthly',
        from_date: fromDate || undefined,
        to_date: toDate || undefined,
        include_sss: includeSss,
        include_philhealth: includePhilhealth,
        include_pagibig: includePagibig,
        include_tax: includeTax,
        include_custom_deductions: includeCustomDeductions,
        include_loans: includeLoans,
      }

      const res = await api.payroll.calculatePreview(payload)
      if (res && res.calculation) {
        setPreviewData(res)
        const c = res.calculation
        setWorkHours(String(c.work_hours ?? (isWeekly ? 48 : 104)))
        setAbsenceDays(String(c.absence_days ?? 0))
        setLateMinutes(String(c.late_minutes ?? 0))
        setUndertimeMinutes(String(c.undertime_minutes ?? 0))
        setOvertimeHours(String(c.overtime_hours ?? 0))
      }
    } catch (err) {
      console.error('Calculation preview failed:', err)
      setPreviewError(err?.message || 'Unable to compute payroll calculation preview.')
    } finally {
      setLoadingPreview(false)
    }
  }

  // Trigger preview fetch when transitioning to Step 3, 4, or 5
  useEffect(() => {
    if (currentStep >= 3 && selectedEmployeeId) {
      fetchCalculationPreview()
    }
  }, [
    currentStep,
    selectedEmployeeId,
    selectedPeriodId,
    fromDate,
    toDate,
    includeSss,
    includePagibig,
    includePhilhealth,
    includeTax,
    includeCustomDeductions,
    includeLoans,
  ])

  // Step 5: Execute Approval
  const handleApprovePayroll = async () => {
    if (!selectedEmployeeId) {
      showToast('Please select an employee or choose Select All.', 'warning')
      return
    }

    setApproving(true)
    try {
      const payload = {
        employee_id: selectedEmployeeId,
        branch: selectedBranch !== 'All' ? selectedBranch : undefined,
        employee_ids: selectedEmployeeId === 'all' ? filteredEmployees.map(e => e.employee_id) : undefined,
        period_id: selectedPeriodId || undefined,
        cutoff_type: isWeekly ? 'weekly' : 'semi-monthly',
        from_date: fromDate || undefined,
        to_date: toDate || undefined,
        include_sss: includeSss,
        include_philhealth: includePhilhealth,
        include_pagibig: includePagibig,
        include_tax: includeTax,
        include_custom_deductions: includeCustomDeductions,
        include_loans: includeLoans,
        notes: notes || undefined,
        payout_method: selectedEmployee?.pay_type || previewData?.employee?.pay_type || 'Cash',
      }

      let requestBody = payload
      if (proofFile && !isAllEmployees) {
        const fd = new FormData()
        Object.entries(payload).forEach(([k, v]) => {
          if (v !== undefined && v !== null) {
            if (typeof v === 'boolean') fd.append(k, v ? '1' : '0')
            else if (Array.isArray(v)) v.forEach(item => fd.append(`${k}[]`, item))
            else fd.append(k, String(v))
          }
        })
        fd.append('proof_of_payment', proofFile)
        requestBody = fd
      }

      const res = await api.payroll.calculateAndApprove(requestBody)
      showToast(res.message || 'Payroll record approved successfully!', 'success')
      setApprovalResult(res.payroll || res)
      if (onSuccess) {
        onSuccess(res.payroll || res)
      }
    } catch (err) {
      console.error('Payroll approval failed:', err)
      showToast(err.message || 'Failed to approve payroll.', 'error')
    } finally {
      setApproving(false)
    }
  }

  if (!isOpen) return null

  // Wizard Steps Configuration (Strict 4 Steps)
  const steps = [
    { num: 1, title: 'Branch', desc: selectedBranch === 'All' ? 'All Branches' : 'Select Branch', icon: <FiLayers className="w-4 h-4" /> },
    { num: 2, title: 'Employee', desc: isAllEmployees ? 'All Staff' : 'Pick Active Staff', icon: isAllEmployees ? <FiUsers className="w-4 h-4" /> : <FiUser className="w-4 h-4" /> },
    { num: 3, title: 'Attendance & Time', desc: 'Auto-Computed Logs', icon: <FiClock className="w-4 h-4" /> },
    { num: 4, title: 'Review & Approval', desc: 'View Ledger & Payslip', icon: <FiCheckCircle className="w-4 h-4" /> },
  ]

  const calc = previewData?.calculation || clientComputation
  const grossPay = isAllEmployees
    ? (previewData?.total_gross ?? batchMetrics.totalBasePay)
    : (calc.gross_pay ?? clientComputation.grossPay)
  const totalDeductions = isAllEmployees
    ? (previewData?.total_deductions ?? (batchAttendanceSummary ? (batchAttendanceSummary.totalAttendanceDeductions + batchAttendanceSummary.totalSss + batchAttendanceSummary.totalPhilhealth + batchAttendanceSummary.totalPagibig + batchAttendanceSummary.totalTax) : 0))
    : (calc.total_deductions ?? clientComputation.totalDeductions)
  const netPay = isAllEmployees
    ? (previewData?.total_net ?? Math.max(0, grossPay - totalDeductions))
    : (calc.net_pay ?? clientComputation.netPay)

  // Handle direct print
  const handlePrintPayslip = () => {
    window.print()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-[fadeIn_0.15s_ease]"
      style={{ background: 'rgba(15, 23, 42, 0.7)', backdropFilter: 'blur(6px)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !approving) onClose()
      }}
    >
      <div className="bg-card rounded-2xl shadow-2xl border border-border w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-[slideUp_0.2s_ease]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/40">
          <div>
            <div className="flex items-center gap-3">
              <span className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold flex items-center justify-center text-xs border border-emerald-500/20">
                <TbCurrencyPeso className="w-4 h-4" />
              </span>
              <h2 className="font-bold text-foreground text-sm sm:text-base">
                Payroll Generation, Calculation &amp; Approval
              </h2>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5 ml-9">
              4-Step Workflow &bull; Dynamic Attendance Tracking &bull; Strict Late Penalty Rules &bull; Payslip Generation
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={approving}
            className="w-8 h-8 rounded-xl hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors cursor-pointer disabled:opacity-50"
            aria-label="Close"
          >
            <FiX className="w-4 h-4" />
          </button>
        </div>

        {/* Wizard Stepper Bar */}
        <div className="px-6 py-3 border-b border-border bg-card/60">
          <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
            {steps.map((step) => {
              const isActive = currentStep === step.num
              const isPast = currentStep > step.num
              return (
                <button
                  key={step.num}
                  type="button"
                  disabled={approving || (step.num > currentStep && (!selectedBranch || (step.num >= 3 && !selectedEmployeeId)))}
                  onClick={() => {
                    if (step.num < currentStep) setCurrentStep(step.num)
                    else if (step.num === 2 && selectedBranch) setCurrentStep(2)
                    else if (step.num === 3 && selectedEmployeeId) setCurrentStep(3)
                    else if (step.num === 4 && selectedEmployeeId) setCurrentStep(4)
                  }}
                  className={`flex items-center gap-2 p-1.5 sm:p-2 rounded-xl text-left transition-all cursor-pointer ${isActive
                    ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-900 dark:text-emerald-200 shadow-2xs font-bold'
                    : isPast
                      ? 'bg-muted/40 border border-border/80 text-foreground hover:bg-muted/80'
                      : 'opacity-50 cursor-not-allowed text-muted-foreground'
                    }`}
                >
                  <div
                    className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${isActive
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : isPast
                        ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                        : 'bg-muted text-muted-foreground'
                      }`}
                  >
                    {isPast ? <FiCheck className="w-3.5 h-3.5" /> : step.num}
                  </div>
                  <div className="min-w-0 hidden md:block">
                    <div className="text-[11px] font-bold truncate leading-tight">{step.title}</div>
                    <div className="text-[9px] text-muted-foreground truncate">{step.desc}</div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Modal Body Container */}
        <div className="p-6 sm:p-8 overflow-y-auto flex-1 space-y-5">
          {/* ───────────────────────────────────────────────────────────── */}
          {/* STEP 1: BRANCH SELECTION                                      */}
          {/* ───────────────────────────────────────────────────────────── */}
          {currentStep === 1 && (
            <div className="space-y-4 animate-[fadeIn_0.15s_ease]">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <span>Step 1: Choose Store Branch</span>
                    {selectedBranch && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-semibold">
                        {selectedBranch === 'All' ? 'All Branches Selected' : 'Branch Selected'}
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Select a branch to dynamically filter employees, or choose All Branches to process across all company store locations.
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
                    {loadingBranchEmployees ? 'Loading...' : `${branchEmployees.length} staff loaded`}
                  </span>
                </div>
              </div>

              {/* Branch Dropdown */}
              <div className="p-4 rounded-xl border border-border bg-card space-y-3">
                <label className="block text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                  Select Branch Location *
                </label>
                <select
                  id="payroll-branch-select"
                  value={selectedBranch}
                  disabled={isStoreAdmin}
                  onChange={(e) => handleBranchChange(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-card text-foreground text-xs font-medium focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none cursor-pointer"
                >
                  <option value="">-- Choose a Branch --</option>
                  {!isStoreAdmin && (
                    <option value="All">All Branches (All Company Locations)</option>
                  )}
                  {branches.map((b) => {
                    const bName = b.name || b.branch_name
                    return (
                      <option key={b.id || b.branch_id || bName} value={bName}>
                        {bName} {b.location ? `(${b.location})` : ''}
                      </option>
                    )
                  })}
                </select>

                {isStoreAdmin && (
                  <p className="text-[11px] text-muted-foreground">
                    🔒 Locked to your assigned store location: <span className="font-bold text-foreground">{userBranchName}</span>
                  </p>
                )}
              </div>

              {/* Branch Quick Cards */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                    Available Branches ({branches.length})
                  </label>
                  {!isStoreAdmin && (
                    <button
                      type="button"
                      id="payroll-select-all-branches-btn"
                      onClick={() => handleBranchChange('All')}
                      className={`text-xs px-2.5 py-1 rounded-lg font-bold transition-all flex items-center gap-1.5 cursor-pointer ${selectedBranch === 'All'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-muted/80 hover:bg-muted text-foreground border border-border'
                        }`}
                    >
                      <FiLayers className="w-3.5 h-3.5" />
                      <span>Select All Branches</span>
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {!isStoreAdmin && (
                    <button
                      type="button"
                      id="payroll-branch-card-all"
                      onClick={() => handleBranchChange('All')}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2 ${selectedBranch === 'All'
                        ? 'border-emerald-500 bg-emerald-500/10 shadow-xs ring-2 ring-emerald-500/20'
                        : 'border-border bg-card hover:bg-muted/40 text-foreground'
                        }`}
                    >
                      <div className="flex items-start justify-between">
                        <span className="font-bold text-xs text-foreground truncate flex items-center gap-1.5">
                          All Branches
                        </span>
                        {selectedBranch === 'All' && <FiCheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />}
                      </div>
                      <div className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                        <FiLayers className="w-3 h-3 text-muted-foreground" />
                        <span>All Store Locations ({branches.length} branches)</span>
                      </div>
                    </button>
                  )}
                  {branches.map((b) => {
                    const bName = b.name || b.branch_name
                    const isSelected = selectedBranch === bName
                    return (
                      <button
                        key={b.id || b.branch_id || bName}
                        type="button"
                        disabled={isStoreAdmin && userBranchName && bName !== userBranchName}
                        onClick={() => handleBranchChange(bName)}
                        className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2 ${isSelected
                          ? 'border-emerald-500 bg-emerald-500/10 shadow-xs ring-2 ring-emerald-500/20'
                          : 'border-border bg-card hover:bg-muted/40 text-foreground'
                          }`}
                      >
                        <div className="flex items-start justify-between">
                          <span className="font-bold text-xs text-foreground truncate">{bName}</span>
                          {isSelected && <FiCheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />}
                        </div>
                        <div className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                          <FiLayers className="w-3 h-3 text-muted-foreground" />
                          <span>{b.code || b.location || 'Store Branch'}</span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Feedback Summary */}
              {selectedBranch && (
                <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-950 dark:text-emerald-200 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <FiCheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span className="text-xs">
                      Filtered to <strong className="underline">{selectedBranch === 'All' ? 'All Store Branches' : selectedBranch}</strong> with{' '}
                      <strong>{branchEmployees.length}</strong> active staff ready.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCurrentStep(2)}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <span>Proceed to Employees</span>
                    <FiArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ───────────────────────────────────────────────────────────── */}
          {/* STEP 2: EMPLOYEE SELECTION                                    */}
          {/* ───────────────────────────────────────────────────────────── */}
          {currentStep === 2 && (
            <div className="space-y-4 animate-[fadeIn_0.15s_ease]">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <span>Step 2: Select Active Employee</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-semibold">
                      Branch: {selectedBranch === 'All' ? 'All Branches' : selectedBranch}
                    </span>
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Choose an employee or select all active employees to calculate attendance tracking, statutory deductions, and payroll approval.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setCurrentStep(1)}
                  className="text-xs font-semibold text-muted-foreground hover:text-foreground flex items-center gap-1 cursor-pointer"
                >
                  <FiChevronLeft className="w-3.5 h-3.5" />
                  <span>Change Branch</span>
                </button>
              </div>

              {/* Payroll Period & Date Range (From Days, To Days) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
                    Payroll Cutoff Period *
                  </label>
                  <select
                    id="payroll-period-select"
                    value={selectedPeriodId}
                    onChange={(e) => setSelectedPeriodId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground text-xs font-medium focus:ring-2 focus:ring-emerald-500/20"
                  >
                    <option value=""> Auto Current Semi-Monthly Period (1st–15th / 16th–End)</option>
                    <option value="auto_weekly"> Auto Current Weekly Period (Weekly Salary)</option>
                    {periods.map((prd) => (
                      <option key={prd.period_id} value={prd.period_id}>
                        {prd.period_name} [{prd.status}]
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1 flex items-center justify-between">
                    <span>From Days / Date *</span>
                    <FiCalendar className="w-3.5 h-3.5 text-emerald-600" />
                  </label>
                  <input
                    type="date"
                    id="payroll-from-date"
                    value={fromDate}
                    max={toDate || undefined}
                    onChange={(e) => setFromDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground text-xs font-medium focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1 flex items-center justify-between">
                    <span>To Days / Date *</span>
                    <FiCalendar className="w-3.5 h-3.5 text-emerald-600" />
                  </label>
                  <input
                    type="date"
                    id="payroll-to-date"
                    value={toDate}
                    min={fromDate || undefined}
                    onChange={(e) => setToDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground text-xs font-medium focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
              </div>

              {/* Cutoff Date Range & Days Summary Bar */}
              <div className="px-3.5 py-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 text-emerald-800 dark:text-emerald-300 flex items-center justify-between text-xs">
                <div className="flex items-center gap-3">
                  <FiCalendar className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>
                    Cutoff Range: <strong>From {fromDate || '...'}</strong> to <strong>{toDate || '...'}</strong>
                  </span>
                  {isWeekly ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-bold border border-emerald-500/30">
                      Weekly Salary Mode (48h standard)
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[10px] bg-blue-500/20 text-blue-700 dark:text-blue-300 font-bold border border-blue-500/30">
                      Semi-Monthly Mode (104h standard)
                    </span>
                  )}
                </div>
                <span className="font-bold text-[11px] px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30">
                  {daysCount} Days Covered
                </span>
              </div>

              {/* Search Branch Staff */}
              <div>
                <label className="block text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
                  Search Staff
                </label>
                <div className="relative">
                  <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  <input
                    type="text"
                    placeholder={`Search ${branchEmployees.length} staff in ${selectedBranch === 'All' ? 'all branches' : selectedBranch}...`}
                    value={employeeSearch}
                    onChange={(e) => setEmployeeSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 text-xs border border-border rounded-xl bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
              </div>

              {/* Employee Cards List Header with Select All Button */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] font-semibold px-1">
                  <div className="flex items-center gap-3">
                    <span className="text-muted-foreground">Filtered Employees ({filteredEmployees.length})</span>
                    {filteredEmployees.length > 0 && (
                      <button
                        type="button"
                        id="payroll-select-all-employees-btn"
                        onClick={() => {
                          if (isAllEmployees) {
                            setSelectedEmployeeId('')
                            setPreviewData(null)
                          } else {
                            setSelectedEmployeeId('all')
                            autoLoadEmployeeAttendance('all', fromDate, toDate)
                          }
                        }}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${isAllEmployees
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'bg-muted/80 hover:bg-muted text-foreground border border-border'
                          }`}
                      >
                        <FiCheckCircle className={`w-3.5 h-3.5 ${isAllEmployees ? 'text-white' : 'text-muted-foreground'}`} />
                        <span>{isAllEmployees ? 'Deselect All' : `Select All Employees (${filteredEmployees.length})`}</span>
                      </button>
                    )}
                  </div>
                  <span className="text-muted-foreground">
                    {isAllEmployees ? `${filteredEmployees.length} staff selected (Batch Mode)` : 'Click card to select'}
                  </span>
                </div>

                {/* Featured "Select All Employees" Card */}
                {filteredEmployees.length > 0 && (
                  <div
                    id="payroll-select-all-card"
                    onClick={() => {
                      if (isAllEmployees) {
                        setSelectedEmployeeId('')
                        setPreviewData(null)
                      } else {
                        setSelectedEmployeeId('all')
                        autoLoadEmployeeAttendance('all', fromDate, toDate)
                      }
                    }}
                    className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between gap-2.5 ${isAllEmployees
                      ? 'border-emerald-500 bg-emerald-500/15 ring-2 ring-emerald-500/30 shadow-xs'
                      : 'border-dashed border-border bg-card hover:bg-muted/30 text-foreground'
                      }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`w-9 h-9 rounded-xl font-bold flex items-center justify-center text-xs shrink-0 border ${isAllEmployees
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                        }`}>
                        <FiUsers className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-xs text-foreground flex items-center gap-1.5">
                          <span>Select All Employees ({filteredEmployees.length} Staff)</span>
                          {isAllEmployees && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500 text-white font-bold">
                              Batch Selected
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-muted-foreground truncate">
                          Batch Mode &bull; Automatically compute attendance logs &amp; statutory rules for all {filteredEmployees.length} staff
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-[11px] font-mono font-bold text-emerald-600 dark:text-emerald-400 block">
                        {fmt(batchMetrics.totalBasic)}
                      </span>
                      <span className="text-[9px] text-muted-foreground uppercase">Combined Basic</span>
                    </div>
                  </div>
                )}

                {filteredEmployees.length === 0 ? (
                  <div className="p-6 rounded-xl border border-border text-center text-muted-foreground space-y-1 bg-muted/10">
                    <FiAlertCircle className="w-5 h-5 mx-auto text-amber-500" />
                    <p className="text-xs font-semibold text-foreground">No employees found in {selectedBranch === 'All' ? 'all branches' : selectedBranch}</p>
                    <p className="text-[11px]">Make sure active employees are assigned to this branch location.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-56 overflow-y-auto pr-1">
                    {filteredEmployees.map((emp) => {
                      const isSelected = isAllEmployees || String(emp.employee_id) === String(selectedEmployeeId)
                      return (
                        <div
                          key={emp.employee_id}
                          onClick={() => handleSelectEmployee(emp)}
                          className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start justify-between gap-2.5 ${isSelected
                            ? 'border-emerald-500 bg-emerald-500/10 ring-2 ring-emerald-500/20 shadow-xs'
                            : 'border-border bg-card hover:bg-muted/30 text-foreground'
                            }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-bold flex items-center justify-center text-xs shrink-0 border border-emerald-500/20">
                              {emp.first_name?.[0] || 'E'}
                              {emp.last_name?.[0] || 'M'}
                            </div>
                            <div className="min-w-0">
                              <div className="font-bold text-xs text-foreground truncate flex items-center gap-1.5">
                                <span>{emp.full_name}</span>
                                {emp.username && (
                                  <span className="text-[10px] font-normal text-muted-foreground">@{emp.username}</span>
                                )}
                              </div>
                              <div className="text-[10px] text-muted-foreground truncate">
                                {emp.employee_code} &bull; {emp.position || emp.role} {selectedBranch === 'All' && emp.branch_name ? `• ${emp.branch_name}` : ''}
                              </div>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="text-[11px] font-mono font-bold text-emerald-600 dark:text-emerald-400 block">
                              {fmt(resolveWorkflowEmployeeRates(emp).monthlyBasic)}
                            </span>
                            <span className="text-[9px] text-muted-foreground uppercase">Monthly</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Selected Employee Detailed Ledger Snapshot OR Batch Snapshot */}
              {isAllEmployees ? (
                <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-card shadow-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                      Batch Selection Snapshot ({filteredEmployees.length} Employees)
                    </span>
                    <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                      Ready for Batch Processing
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1 border-t border-border/60 text-xs">
                    <div>
                      <span className="block text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">Total Staff</span>
                      <span className="font-mono font-bold text-foreground">{filteredEmployees.length} employees</span>
                    </div>
                    <div>
                      <span className="block text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">Combined Basic</span>
                      <span className="font-mono font-bold text-foreground">{fmt(batchMetrics.totalBasic)}</span>
                    </div>
                    <div>
                      <span className="block text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">Combined Daily</span>
                      <span className="font-mono font-medium text-foreground">{fmt(batchMetrics.totalDaily)}</span>
                    </div>
                    <div>
                      <span className="block text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">Estimated Gross</span>
                      <span className="font-mono font-bold text-emerald-600">{fmt(batchMetrics.totalBasePay)}</span>
                    </div>
                  </div>
                </div>
              ) : selectedEmployee ? (
                <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-card shadow-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                      Selected Employee Rates &amp; Details
                    </span>
                    <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                      Ready for Attendance Tracking
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1 border-t border-border/60 text-xs">
                    <div>
                      <span className="block text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">Monthly Basic</span>
                      <span className="font-mono font-bold text-foreground">{fmt(resolveWorkflowEmployeeRates(selectedEmployee).monthlyBasic)}</span>
                    </div>
                    <div>
                      <span className="block text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">Daily Rate</span>
                      <span className="font-mono font-medium text-foreground">{fmt(resolveWorkflowEmployeeRates(selectedEmployee).dailyRate)}</span>
                    </div>
                    <div>
                      <span className="block text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">Hourly Rate</span>
                      <span className="font-mono font-medium text-foreground">{fmt(resolveWorkflowEmployeeRates(selectedEmployee).hourlyRate)}</span>
                    </div>
                    <div>
                      <span className="block text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">Payout Preference</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">{selectedEmployee.pay_type || 'Cash'}</span>
                    </div>
                  </div>
                  {(selectedEmployee.pay_type === 'E-Wallet' || selectedEmployee.pay_type === 'Online Bank') && (
                    <div className="pt-2 border-t border-border/60 text-xs flex flex-wrap items-center justify-between gap-2 bg-emerald-500/5 p-2 rounded-lg">
                      <div className="flex items-center gap-2">
                        <FiCreditCard className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="font-bold text-foreground">
                          {selectedEmployee.pay_type === 'E-Wallet'
                            ? `${selectedEmployee.ewallet_provider || 'E-Wallet'}`
                            : `${selectedEmployee.bank_name || 'Online Bank'}`}
                        </span>
                      </div>
                      <div className="font-mono text-[11px] text-foreground">
                        {selectedEmployee.pay_type === 'E-Wallet'
                          ? `${selectedEmployee.ewallet_account_name || selectedEmployee.full_name} • ${selectedEmployee.ewallet_account_no || 'No Mobile #'}`
                          : `${selectedEmployee.bank_account_name || selectedEmployee.full_name} • ${selectedEmployee.bank_account_no || 'No Account #'}`}
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          )}

          {/* ───────────────────────────────────────────────────────────── */}
          {/* ───────────────────────────────────────────────────────────── */}
          {/* STEP 3: ATTENDANCE & TIME INPUTS                              */}
          {/* ───────────────────────────────────────────────────────────── */}
          {currentStep === 3 && (
            <div className="space-y-4 animate-[fadeIn_0.15s_ease]">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <span>Step 3: Automated Attendance Tracking &amp; Deductions</span>
                    {isAllEmployees ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-semibold flex items-center gap-1">
                        <FiUsers className="w-3 h-3" />
                        All Staff ({filteredEmployees.length} Employees) &bull; {selectedBranch === 'All' ? 'All Branches' : selectedBranch}
                      </span>
                    ) : selectedEmployee ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-semibold">
                        {selectedEmployee.full_name} ({selectedBranch})
                      </span>
                    ) : null}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {isAllEmployees
                      ? `Attendance metrics are strictly read-only and automatically calculated from database time logs for all ${filteredEmployees.length} employees.`
                      : 'Attendance metrics are strictly read-only and automatically computed from employee timekeeping records for complete data integrity.'}
                  </p>
                </div>
                <div className="text-right text-xs">
                  {isAllEmployees ? (
                    <div>
                      <span className="text-muted-foreground">Combined Daily: </span>
                      <span className="font-mono font-bold text-foreground">{fmt(batchMetrics.totalDaily)}</span>
                      <span className="text-muted-foreground ml-2">Combined Hourly: </span>
                      <span className="font-mono font-bold text-foreground">{fmt(batchMetrics.totalHourly)}</span>
                    </div>
                  ) : (
                    <div>
                      <span className="text-muted-foreground">Daily Rate: </span>
                      <span className="font-mono font-bold text-foreground">{fmt(clientComputation.dailyRate)}</span>
                      <span className="text-muted-foreground ml-2">Hourly: </span>
                      <span className="font-mono font-bold text-foreground">{fmt(clientComputation.hourlyRate)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Cutoff Cycle & Auto-Calculation Info Badge */}
              <div className="px-3.5 py-2.5 rounded-xl border border-border bg-muted/20 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-3">
                  <FiCalendar className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span className="text-muted-foreground">
                    Cutoff Cycle: <strong className="text-foreground">From {fromDate || '...'} to {toDate || '...'}</strong> ({daysCount} Days)
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold border border-emerald-500/20">
                    Late Rule: ₱1/min (1–29m), Half-Day (&ge;30m)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => autoLoadEmployeeAttendance()}
                  disabled={loadingPreview}
                  className="px-2.5 py-1 rounded-lg border border-border hover:bg-card text-foreground text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer shadow-2xs transition-all active:scale-95 disabled:opacity-50"
                  title="Reload employee recorded attendance logs from database for this cutoff period"
                >
                  <FiClock className="w-3 h-3 text-emerald-600" />
                  <span>{loadingPreview ? 'Fetching Logs...' : (isAllEmployees ? 'Re-Sync All Logs' : 'Re-Sync Logs')}</span>
                </button>
              </div>

              {/* Daily Tabular Matrix (DAY 1 TO DAY 6) for Single Employee */}
              {!isAllEmployees && singleDailyMatrix && (
                <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-xs space-y-0">
                  <div className="px-4 py-2.5 bg-muted/40 border-b border-border flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="text-xs font-bold text-foreground">
                        Daily Attendance Breakdown (DAY 1 – DAY 6)
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                        Live DB Sync
                      </span>
                    </div>
                    <span className="text-[11px] text-muted-foreground font-mono">
                      Cycle: {singleDailyMatrix.cycle_start || fromDate || '...'} to {singleDailyMatrix.cycle_end || toDate || '...'}
                    </span>
                  </div>

                  <div className="overflow-x-auto scrollbar-thin">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-border bg-muted/20">
                          <th className="py-2 px-3 font-bold text-muted-foreground uppercase tracking-wider text-[10px] w-44 min-w-[170px] sticky left-0 bg-muted/95 backdrop-blur-xs z-10 border-r border-border">
                            Metric / Workday
                          </th>
                          {singleDailyMatrix.days.map((day) => (
                            <th key={day.day_label} className="py-2 px-2.5 text-center min-w-[110px] border-r border-border/60">
                              <div className="font-bold text-foreground text-xs">{day.day_label}</div>
                              <div className="text-[10px] font-mono text-muted-foreground">
                                {day.day_name} • {day.short_date}
                              </div>
                            </th>
                          ))}
                          <th className="py-2 px-3 text-center font-bold text-foreground text-xs min-w-[120px] bg-muted/40">
                            <div>WEEKLY TOTAL</div>
                            <div className="text-[10px] font-normal text-muted-foreground font-mono">6 Workdays</div>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        {/* TOTAL WORK HOURS */}
                        <tr className="hover:bg-muted/20 transition-colors">
                          <td className="py-2.5 px-3 font-medium text-foreground sticky left-0 bg-card/95 backdrop-blur-xs z-10 border-r border-border">
                            <div className="flex items-center gap-1.5 font-bold text-xs">
                              <FiClock className="w-3.5 h-3.5 text-emerald-500" />
                              <span>WORK HOURS</span>
                            </div>
                            <div className="text-[10px] text-muted-foreground">Punches &amp; hours</div>
                          </td>
                          {singleDailyMatrix.days.map((day) => (
                            <td key={day.day_label} className="py-2 px-2.5 text-center border-r border-border/60 align-top">
                              <div className={`font-mono text-xs font-bold ${day.work_hours > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground/60'}`}>
                                {day.work_hours.toFixed(2)}h
                              </div>
                              <div className="mt-0.5 text-[9px] font-mono text-muted-foreground">
                                <div>In: {day.time_in || '--'}</div>
                                <div>Out: {day.time_out || '--'}</div>
                              </div>
                            </td>
                          ))}
                          <td className="py-2 px-3 text-center bg-muted/20 align-top">
                            <div className="font-mono text-sm font-black text-emerald-600 dark:text-emerald-400">
                              {clientComputation.workHours} hrs
                            </div>
                          </td>
                        </tr>

                        {/* TOTAL LATE */}
                        <tr className="hover:bg-muted/20 transition-colors">
                          <td className="py-2.5 px-3 font-medium text-foreground sticky left-0 bg-card/95 backdrop-blur-xs z-10 border-r border-border">
                            <div className="flex items-center gap-1.5 font-bold text-xs">
                              <FiClock className="w-3.5 h-3.5 text-rose-500" />
                              <span>LATE</span>
                            </div>
                            <div className="text-[10px] text-muted-foreground">Tardiness minutes</div>
                          </td>
                          {singleDailyMatrix.days.map((day) => (
                            <td key={day.day_label} className="py-2 px-2.5 text-center border-r border-border/60 align-top">
                              <div className={`font-mono text-xs font-bold ${day.late_minutes > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-muted-foreground/60'}`}>
                                {day.late_minutes}m
                              </div>
                              <div className="mt-0.5 text-[9px] font-mono text-muted-foreground">
                                {day.time_in || '--'}
                              </div>
                            </td>
                          ))}
                          <td className="py-2 px-3 text-center bg-muted/20 align-top">
                            <div className="font-mono text-sm font-black text-rose-600 dark:text-rose-400">
                              {clientComputation.lateMinutes} mins
                            </div>
                          </td>
                        </tr>

                        {/* TOTAL ABSENCES */}
                        <tr className="hover:bg-muted/20 transition-colors">
                          <td className="py-2.5 px-3 font-medium text-foreground sticky left-0 bg-card/95 backdrop-blur-xs z-10 border-r border-border">
                            <div className="flex items-center gap-1.5 font-bold text-xs">
                              <FiAlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                              <span>ABSENCES</span>
                            </div>
                            <div className="text-[10px] text-muted-foreground">Status / Leave</div>
                          </td>
                          {singleDailyMatrix.days.map((day) => {
                            const badgeCls = 
                              day.status === 'Present' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' :
                              day.status === 'Late' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' :
                              day.status === 'Half Day' ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400' :
                              day.status === 'Absent' ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400' :
                              'bg-blue-500/10 text-blue-600 dark:text-blue-400'

                            return (
                              <td key={day.day_label} className="py-2 px-2.5 text-center border-r border-border/60 align-top">
                                <span className={`inline-block px-1.5 py-0.2 rounded text-[9px] font-bold ${badgeCls}`}>
                                  {day.status}
                                </span>
                                <div className="mt-0.5 text-[9px] font-mono text-muted-foreground">
                                  {day.absence_score > 0 ? `${day.absence_score}d missed` : '0d'}
                                </div>
                              </td>
                            )
                          })}
                          <td className="py-2 px-3 text-center bg-muted/20 align-top">
                            <div className="font-mono text-sm font-black text-rose-600 dark:text-rose-400">
                              {clientComputation.absenceDays} day(s)
                            </div>
                          </td>
                        </tr>

                        {/* TOTAL UNDERTIME */}
                        <tr className="hover:bg-muted/20 transition-colors">
                          <td className="py-2.5 px-3 font-medium text-foreground sticky left-0 bg-card/95 backdrop-blur-xs z-10 border-r border-border">
                            <div className="flex items-center gap-1.5 font-bold text-xs">
                              <FiTrendingDown className="w-3.5 h-3.5 text-blue-500" />
                              <span>UNDERTIME</span>
                            </div>
                            <div className="text-[10px] text-muted-foreground">Early departure</div>
                          </td>
                          {singleDailyMatrix.days.map((day) => (
                            <td key={day.day_label} className="py-2 px-2.5 text-center border-r border-border/60 align-top">
                              <div className={`font-mono text-xs font-bold ${day.undertime_minutes > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-muted-foreground/60'}`}>
                                {day.undertime_minutes}m
                              </div>
                              <div className="mt-0.5 text-[9px] font-mono text-muted-foreground">
                                {day.time_out || '--'}
                              </div>
                            </td>
                          ))}
                          <td className="py-2 px-3 text-center bg-muted/20 align-top">
                            <div className="font-mono text-sm font-black text-blue-600 dark:text-blue-400">
                              {clientComputation.undertimeMinutes} mins
                            </div>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Attendance Metrics: 4 Clean Read-Only Display Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* 1. Total Work Hours Card */}
                <div className="p-4 rounded-xl border border-border bg-card shadow-2xs space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                      <FiClock className="w-4 h-4 text-emerald-600" />
                      <span>{isAllEmployees ? 'Total Rendered Work Hours (Batch)' : 'Total Work Hours'}</span>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-semibold border border-emerald-500/20">
                      🔒 Auto-Computed
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-muted/30 border border-border flex items-baseline justify-between">
                    <div>
                      <span className="font-mono text-2xl font-black text-foreground">
                        {isAllEmployees ? (batchAttendanceSummary?.totalHours || 0) : clientComputation.workHours}
                      </span>
                      <span className="text-xs font-semibold text-muted-foreground ml-1.5">
                        {isAllEmployees ? `total hrs across ${filteredEmployees.length} staff` : 'hours rendered'}
                      </span>
                    </div>
                    <span className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400">
                      +{fmt(isAllEmployees ? batchMetrics.totalBasePay : clientComputation.periodBasePay)}
                    </span>
                  </div>

                  <p className="text-[10px] text-muted-foreground">
                    {isAllEmployees
                      ? `Standard ${isWeekly ? '48h/week' : '104h/semi-month'} per staff • Base pay computed per active time record`
                      : `Base pay computation: ${isWeekly ? 'standard weekly salary (6 days @ 8h = 48h)' : 'standard semi-monthly (13 days @ 8h = 104h)'} or rendered hours (${clientComputation.workHours}h rendered • ${fmt(clientComputation.periodBasePay)})`}
                  </p>
                </div>

                {/* 2. Total Absences Card */}
                <div className="p-4 rounded-xl border border-border bg-card shadow-2xs space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                      <FiAlertTriangle className="w-4 h-4 text-amber-500" />
                      <span>{isAllEmployees ? 'Total Absences (All Staff)' : 'Total Absences (Days Missed)'}</span>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 font-semibold border border-amber-500/20">
                      🔒 Auto-Computed
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-muted/30 border border-border flex items-baseline justify-between">
                    <div>
                      <span className="font-mono text-2xl font-black text-foreground">
                        {isAllEmployees ? (batchAttendanceSummary?.totalAbsences || 0) : clientComputation.absenceDays}
                      </span>
                      <span className="text-xs font-semibold text-muted-foreground ml-1.5">day(s) missed</span>
                    </div>
                    <span className="font-mono text-xs font-bold text-rose-500">
                      -{fmt(isAllEmployees ? (batchAttendanceSummary?.totalAbsenceDeduction || 0) : clientComputation.absenceDeduction)}
                    </span>
                  </div>

                  <p className="text-[10px] text-muted-foreground flex items-center justify-between">
                    <span>{isAllEmployees ? 'Deducted per employee daily rate' : 'Formula: absence days missed × daily rate'}</span>
                    <span className="font-mono font-semibold text-rose-500">
                      -{fmt(isAllEmployees ? (batchAttendanceSummary?.totalAbsenceDeduction || 0) : clientComputation.absenceDeduction)}
                    </span>
                  </p>
                </div>

                {/* 3. Total Late Minutes Card */}
                <div className="p-4 rounded-xl border border-border bg-card shadow-2xs space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                      <FiClock className="w-4 h-4 text-indigo-500" />
                      <span>{isAllEmployees ? 'Total Late Minutes (All Staff)' : 'Total Late Minutes Accumulated'}</span>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 font-semibold border border-indigo-500/20">
                      🔒 Auto-Computed
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-muted/30 border border-border flex items-baseline justify-between">
                    <div>
                      <span className="font-mono text-2xl font-black text-foreground">
                        {isAllEmployees ? (batchAttendanceSummary?.totalLateMinutes || 0) : clientComputation.lateMinutes}
                      </span>
                      <span className="text-xs font-semibold text-muted-foreground ml-1.5">mins late</span>
                    </div>
                    <span className="font-mono text-xs font-bold text-rose-500">
                      -{fmt(isAllEmployees ? (batchAttendanceSummary?.totalLatePenalty || 0) : clientComputation.latePenalty)}
                    </span>
                  </div>

                  {/* Late Penalty Rule Indicator Banner */}
                  <div className="p-2.5 rounded-lg text-[10px] font-semibold border flex items-center justify-between bg-muted/20 border-border">
                    <div className="text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                      <span>Rule: 1–29m &rarr; <strong>₱1.00/min</strong>, &ge;30m &rarr; <strong>Half-Day Deduction</strong></span>
                    </div>
                    <span className="font-mono font-bold text-rose-500">
                      -{fmt(isAllEmployees ? (batchAttendanceSummary?.totalLatePenalty || 0) : clientComputation.latePenalty)}
                    </span>
                  </div>
                </div>

                {/* 4. Total Undertime Card */}
                <div className="p-4 rounded-xl border border-border bg-card shadow-2xs space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                      <FiTrendingDown className="w-4 h-4 text-blue-500" />
                      <span>{isAllEmployees ? 'Total Undertime (All Staff)' : 'Total Undertime (Early Departures)'}</span>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-300 font-semibold border border-blue-500/20">
                      🔒 Auto-Computed
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-muted/30 border border-border flex items-baseline justify-between">
                    <div>
                      <span className="font-mono text-2xl font-black text-foreground">
                        {isAllEmployees ? (batchAttendanceSummary?.totalUndertimeMinutes || 0) : clientComputation.undertimeMinutes}
                      </span>
                      <span className="text-xs font-semibold text-muted-foreground ml-1.5">mins undertime</span>
                    </div>
                    <span className="font-mono text-xs font-bold text-rose-500">
                      -{fmt(isAllEmployees ? (batchAttendanceSummary?.totalUndertimeDeduction || 0) : clientComputation.undertimeDeduction)}
                    </span>
                  </div>

                  <p className="text-[10px] text-muted-foreground flex items-center justify-between">
                    <span>{isAllEmployees ? 'Proportionate deduction based on individual hourly rates' : `Formula: proportionate hourly deduction (${clientComputation.undertimeHours}h × ${fmt(clientComputation.hourlyRate)}/h)`}</span>
                    <span className="font-mono text-rose-500 font-semibold">
                      -{fmt(isAllEmployees ? (batchAttendanceSummary?.totalUndertimeDeduction || 0) : clientComputation.undertimeDeduction)}
                    </span>
                  </p>
                </div>
              </div>

              {/* Attendance Deductions Live Strip */}
              <div className="p-3.5 rounded-xl border border-border bg-muted/30 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="space-y-0.5">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                    Attendance Deductions Subtotal {isAllEmployees && `(${filteredEmployees.length} Staff Combined)`}
                  </span>
                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                    <span>Absences: <strong className="text-rose-500">-{fmt(isAllEmployees ? (batchAttendanceSummary?.totalAbsenceDeduction || 0) : clientComputation.absenceDeduction)}</strong></span>
                    <span>&bull;</span>
                    <span>Late: <strong className="text-rose-500">-{fmt(isAllEmployees ? (batchAttendanceSummary?.totalLatePenalty || 0) : clientComputation.latePenalty)}</strong></span>
                    <span>&bull;</span>
                    <span>Undertime: <strong className="text-rose-500">-{fmt(isAllEmployees ? (batchAttendanceSummary?.totalUndertimeDeduction || 0) : clientComputation.undertimeDeduction)}</strong></span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-muted-foreground uppercase font-bold block">Total Attendance Deductions</span>
                  <span className="font-mono font-bold text-sm text-rose-500">
                    -{fmt(isAllEmployees ? (batchAttendanceSummary?.totalAttendanceDeductions || 0) : clientComputation.attendanceDeductions)}
                  </span>
                </div>
              </div>

              {/* Batch Mode: Individual Staff Attendance Roster Table */}
              {isAllEmployees && (
                <div className="p-3.5 rounded-xl border border-border bg-card space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                      Staff Attendance Breakdown ({previewData?.employees?.length || filteredEmployees.length} Employees)
                    </span>
                    <span className="text-[10px] text-muted-foreground font-medium">
                      Auto-computed from time logs
                    </span>
                  </div>
                  <div className="max-h-44 overflow-y-auto border border-border/60 rounded-lg">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-muted/50 text-[10px] uppercase text-muted-foreground font-semibold sticky top-0">
                        <tr>
                          <th className="py-2 px-3">Employee</th>
                          <th className="py-2 px-2 text-right">Work Hours</th>
                          <th className="py-2 px-2 text-right">Absences</th>
                          <th className="py-2 px-2 text-right">Late Mins</th>
                          <th className="py-2 px-3 text-right">Gross Pay</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {(previewData?.employees || filteredEmployees).map((emp) => {
                          const c = emp.calculation || {}
                          return (
                            <tr key={emp.employee_id} className="hover:bg-muted/20">
                              <td className="py-2 px-3">
                                <div className="font-bold text-foreground text-xs">{emp.full_name}</div>
                                <div className="text-[10px] text-muted-foreground">{emp.employee_code} &bull; {emp.branch || emp.branch_name || selectedBranch}</div>
                              </td>
                              <td className="py-2 px-2 text-right font-mono font-semibold">
                                {c.work_hours ?? (isWeekly ? 48 : 104)}h
                              </td>
                              <td className="py-2 px-2 text-right font-mono text-rose-500">
                                {c.absence_days ?? 0}d
                              </td>
                              <td className="py-2 px-2 text-right font-mono text-rose-500">
                                {c.late_minutes ?? 0}m
                              </td>
                              <td className="py-2 px-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                                {(() => {
                                  const rates = resolveWorkflowEmployeeRates(emp)
                                  return fmt(c.gross_pay ?? (isWeekly ? rates.weeklyBase : (rates.monthlyBasic / 2)))
                                })()}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ───────────────────────────────────────────────────────────── */}
          {/* STEP 4: REVIEW, COMPUTATION SUMMARY, APPROVAL & PAYSLIP       */}
          {/* ───────────────────────────────────────────────────────────── */}
          {currentStep === 4 && (
            <div className="space-y-4 animate-[fadeIn_0.15s_ease]">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <span>Step 4: Review &amp; Computation Summary</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-bold">
                      {isAllEmployees ? `Batch Approval Ready (${filteredEmployees.length} Staff)` : 'Approval & Payslip Ready'}
                    </span>
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {isAllEmployees
                      ? `Review aggregate earnings, attendance deductions, and net payouts for all ${filteredEmployees.length} employees before batch approval.`
                      : 'Review all attendance deductions, statutory contributions, and net pay. You can preview the official payslip before approving.'}
                  </p>
                </div>
                {!isAllEmployees && (
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setViewingPayslip(!viewingPayslip)}
                      className="px-3 py-1.5 rounded-xl border border-border bg-card hover:bg-muted text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <FiFileText className="w-3.5 h-3.5 text-emerald-600" />
                      <span>{viewingPayslip ? 'View Ledger Breakdown' : 'Preview Payslip Layout'}</span>
                    </button>
                  </div>
                )}
              </div>

              {approvalResult ? (
                /* Success Confirmation State */
                <div className="p-6 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 text-center space-y-3">
                  <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto text-xl border border-emerald-500/30">
                    <FiCheck className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-foreground">
                      {approvalResult.is_batch
                        ? `Batch Payroll Successfully Approved for ${approvalResult.count || approvalResult.payrolls?.length || filteredEmployees.length} Staff!`
                        : 'Payroll Successfully Approved!'}
                    </h4>
                    <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
                      {approvalResult.is_batch
                        ? 'All selected payroll records have been approved and saved in a database transaction. Itemized deductions and loan amortizations have been committed.'
                        : 'Payroll record has been saved with status "Approved" in a secure database transaction. Employee ledger has been automatically updated.'}
                    </p>
                  </div>
                  <div className="p-3.5 rounded-xl bg-card border border-border inline-block text-left text-xs space-y-1">
                    {approvalResult.is_batch ? (
                      <>
                        <div><strong>Branch Scope:</strong> {selectedBranch === 'All' ? 'All Store Branches' : selectedBranch}</div>
                        <div><strong>Employees Approved:</strong> <span className="font-bold">{approvalResult.count || approvalResult.payrolls?.length || filteredEmployees.length} staff</span></div>
                        <div><strong>Total Gross Pay:</strong> <span className="font-mono font-bold text-foreground">{fmt(approvalResult.total_gross || grossPay)}</span></div>
                        <div><strong>Total Deductions:</strong> <span className="font-mono text-rose-500 font-bold">-{fmt(approvalResult.total_deductions || totalDeductions)}</span></div>
                        <div><strong>Total Net Payout:</strong> <span className="font-mono text-emerald-600 font-extrabold text-sm">{fmt(approvalResult.total_net || netPay)}</span></div>
                      </>
                    ) : (
                      <>
                        <div><strong>Employee:</strong> {approvalResult.employee_name || selectedEmployee?.full_name}</div>
                        <div><strong>Branch:</strong> {selectedBranch}</div>
                        <div><strong>Gross Pay:</strong> <span className="font-mono font-bold text-foreground">{fmt(approvalResult.gross_pay || grossPay)}</span></div>
                        <div><strong>Total Deductions:</strong> <span className="font-mono text-rose-500 font-bold">-{fmt(approvalResult.total_deductions || totalDeductions)}</span></div>
                        <div><strong>Final Net Pay:</strong> <span className="font-mono text-emerald-600 font-extrabold text-sm">{fmt(approvalResult.net_pay || netPay)}</span></div>
                      </>
                    )}
                  </div>
                  <div className="pt-2 flex flex-wrap items-center justify-center gap-2">
                    {!approvalResult.is_batch && (
                      <button
                        type="button"
                        onClick={() => setViewingPayslip(true)}
                        className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs flex items-center gap-1.5 shadow-md cursor-pointer"
                      >
                        <FiFileText className="w-4 h-4 text-emerald-400" />
                        <span>View &amp; Print Payslip</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md cursor-pointer"
                    >
                      Close &amp; Refresh
                    </button>
                  </div>
                </div>
              ) : null}

              {/* Conditional Rendering: Structured Payslip Preview vs Ledger View */}
              {viewingPayslip && !isAllEmployees ? (
                /* Official Corporate Pay Stub Layout Component */
                <div className="payslip-print-container bg-white text-slate-800 rounded-xl overflow-hidden shadow-md border border-slate-200 p-6 sm:p-8 font-sans text-xs sm:text-sm">
                  {/* 1. Header Section */}
                  <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                    <div className="flex flex-col items-start">
                      {/* Official Z-LICZ Company Logo */}
                      <img
                        src={zliczLogo}
                        alt="Z-LICZ Logo"
                        className="h-14 sm:h-16 w-auto max-w-[200px] object-contain select-none shrink-0"
                        onError={(e) => {
                          if (e.currentTarget.src !== '/assets/zlicz-logo.png') {
                            e.currentTarget.src = '/assets/zlicz-logo.png'
                          }
                        }}
                      />
                      <div className="mt-2 text-[11px] leading-tight text-slate-800 font-sans space-y-0.5">
                        <div className="font-bold text-slate-900">[Z-LICZ Furniture &amp; Appliances Trading ({selectedBranch})]</div>
                        <div className="text-slate-700">[Zone 2, National Highway, Bulua, Cagayan de Oro City, 9000]</div>
                        <div className="text-slate-700">Phone: [+63 900 123 4567]</div>
                        <div className="text-slate-700">Email: [info@zlicsfurniture.com]</div>
                        <div className="text-slate-700">Website: [www.zlicsfurniture.com]</div>
                      </div>
                    </div>
                    <div className="text-right w-full sm:w-auto pt-1">
                      <h1 className="text-xl sm:text-2xl font-serif font-bold text-[#1b4d5a] tracking-widest uppercase m-0 pb-1 border-b-[2.5px] border-[#1b4d5a] inline-block">
                        EMPLOYEE PAY STUB
                      </h1>
                    </div>
                  </div>

                  {/* 2. Employee & Period Info Grid */}
                  <div className="flex flex-col sm:flex-row justify-end items-end sm:items-center gap-4 my-5">
                    <div className="w-full sm:w-[350px] bg-[#e8f4f8] border border-[#b8dfea] rounded-xs overflow-hidden text-xs text-slate-800 divide-y divide-[#b8dfea]">
                      <div className="px-3 py-1.5 flex items-center">
                        <span className="w-36 text-slate-700 font-medium">Manager / Admin :</span>
                        <span className="font-semibold text-slate-900">{user?.name || user?.username || 'Store Administrator'}</span>
                      </div>
                      <div className="px-3 py-1.5 flex items-center">
                        <span className="w-36 text-slate-700 font-medium">Employee Name:</span>
                        <span className="font-bold text-slate-950">{selectedEmployee?.full_name}</span>
                      </div>
                      <div className="px-3 py-1.5 flex items-center">
                        <span className="w-36 text-slate-700 font-medium">Employee ID:</span>
                        <span className="font-semibold text-slate-900">{selectedEmployee?.employee_code || `EMP-${selectedEmployee?.employee_id || '016'}`}</span>
                      </div>
                      <div className="px-3 py-1.5 flex items-center">
                        <span className="w-36 text-slate-700 font-medium">Period Ending:</span>
                        <span className="font-semibold text-slate-900">{toDate || previewData?.period?.to_date || 'Current Cutoff'} ({isWeekly ? 'Weekly' : 'Semi-Monthly'})</span>
                      </div>
                      <div className="px-3 py-1.5 flex items-center">
                        <span className="w-36 text-slate-700 font-medium">Date Range:</span>
                        <span className="font-medium text-slate-800 text-[11px]">From {fromDate || previewData?.period?.from_date} to {toDate || previewData?.period?.to_date}</span>
                      </div>
                    </div>

                    <div className="w-[130px] text-center">
                      <div className="text-xs font-bold text-slate-800 mb-1">Pay Date</div>
                      <div className="bg-[#e8f4f8] border border-[#b8dfea] rounded-xs py-1.5 px-3">
                        <span className="font-bold text-slate-900 text-xs sm:text-sm font-mono tracking-tight">
                          {toDate || previewData?.period?.to_date || 'Today'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 3. Itemized Side-by-Side Tables (Earnings & Deductions) */}
                  <div className="w-full overflow-x-auto my-4">
                    <table className="w-full border-collapse border border-[#d0e4ec] text-xs">
                      <thead>
                        <tr className="bg-[#1b4d5a] text-white font-bold uppercase tracking-wider text-[11px]">
                          <th className="py-2 px-3 text-left border-r border-[#163f4a] w-[20%]">Earnings</th>
                          <th className="py-2 px-2 text-center border-r border-[#163f4a] w-[14%]">Rate</th>
                          <th className="py-2 px-2 text-center border-r border-[#163f4a] w-[12%]">Hours</th>
                          <th className="py-2 px-3 text-center border-r border-[#163f4a] w-[18%]">Amount</th>
                          <th className="py-2 px-3 text-left border-r border-[#163f4a] w-[20%]">Deductions</th>
                          <th className="py-2 px-3 text-center w-[16%]">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {/* Row 1: Regular Pay <---> Income Tax */}
                        <tr className="border-b border-[#d0e4ec]">
                          <td className="py-2 px-3 font-medium text-slate-800 border-r border-[#d0e4ec] bg-white">Regular Pay</td>
                          <td className="py-2 px-2 text-center font-mono text-slate-800 border-r border-[#d0e4ec] bg-white">{fmt(clientComputation.hourlyRate)}/h</td>
                          <td className="py-2 px-2 text-center font-mono text-slate-800 border-r border-[#d0e4ec] bg-white">{clientComputation.workHours}</td>
                          <td className="py-2 px-3 text-center font-mono font-semibold text-slate-900 border-r border-[#d0e4ec] bg-white">{fmt(clientComputation.periodBasePay)}</td>
                          <td className="py-2 px-3 font-medium text-slate-800 border-r border-[#d0e4ec] bg-[#eef7fa]">Income Tax</td>
                          <td className="py-2 px-3 text-center font-mono font-semibold text-slate-900 bg-[#eef7fa]">
                            {clientComputation.withholdingTax > 0 ? fmt(clientComputation.withholdingTax) : ''}
                          </td>
                        </tr>

                        {/* Row 2: Overtime Pay <---> SSS */}
                        <tr className="border-b border-[#d0e4ec]">
                          <td className="py-2 px-3 font-medium text-slate-800 border-r border-[#d0e4ec] bg-white">Overtime Pay</td>
                          <td className="py-2 px-2 text-center font-mono text-slate-800 border-r border-[#d0e4ec] bg-white">
                            {clientComputation.overtimeHours > 0 ? fmt(clientComputation.hourlyRate * 1.25) : ''}
                          </td>
                          <td className="py-2 px-2 text-center font-mono text-slate-800 border-r border-[#d0e4ec] bg-white">
                            {clientComputation.overtimeHours > 0 ? clientComputation.overtimeHours : ''}
                          </td>
                          <td className="py-2 px-3 text-center font-mono font-semibold text-slate-900 border-r border-[#d0e4ec] bg-white">
                            {clientComputation.overtimePay > 0 ? fmt(clientComputation.overtimePay) : ''}
                          </td>
                          <td className="py-2 px-3 font-medium text-slate-800 border-r border-[#d0e4ec] bg-[#eef7fa]">SSS Contribution</td>
                          <td className="py-2 px-3 text-center font-mono font-semibold text-slate-900 bg-[#eef7fa]">
                            {clientComputation.sss > 0 ? fmt(clientComputation.sss) : ''}
                          </td>
                        </tr>

                        {/* Row 3: Holiday Pay <---> PhilHealth */}
                        <tr className="border-b border-[#d0e4ec]">
                          <td className="py-2 px-3 font-medium text-slate-800 border-r border-[#d0e4ec] bg-white">Holiday Pay</td>
                          <td className="py-2 px-2 text-center font-mono text-slate-800 border-r border-[#d0e4ec] bg-white"></td>
                          <td className="py-2 px-2 text-center font-mono text-slate-800 border-r border-[#d0e4ec] bg-white"></td>
                          <td className="py-2 px-3 text-center font-mono font-semibold text-slate-900 border-r border-[#d0e4ec] bg-white"></td>
                          <td className="py-2 px-3 font-medium text-slate-800 border-r border-[#d0e4ec] bg-[#eef7fa]">PhilHealth (Medical)</td>
                          <td className="py-2 px-3 text-center font-mono font-semibold text-slate-900 bg-[#eef7fa]">
                            {clientComputation.philhealth > 0 ? fmt(clientComputation.philhealth) : ''}
                          </td>
                        </tr>

                        {/* Row 4: Vacation Pay / Allowance <---> Pag-IBIG */}
                        <tr className="border-b border-[#d0e4ec]">
                          <td className="py-2 px-3 font-medium text-slate-800 border-r border-[#d0e4ec] bg-white">Vacation Pay / Allowance</td>
                          <td className="py-2 px-2 text-center font-mono text-slate-800 border-r border-[#d0e4ec] bg-white"></td>
                          <td className="py-2 px-2 text-center font-mono text-slate-800 border-r border-[#d0e4ec] bg-white"></td>
                          <td className="py-2 px-3 text-center font-mono font-semibold text-slate-900 border-r border-[#d0e4ec] bg-white">
                            {clientComputation.allowance > 0 ? fmt(clientComputation.allowance) : ''}
                          </td>
                          <td className="py-2 px-3 font-medium text-slate-800 border-r border-[#d0e4ec] bg-[#eef7fa]">Pag-IBIG (HDMF / Life)</td>
                          <td className="py-2 px-3 text-center font-mono font-semibold text-slate-900 bg-[#eef7fa]">
                            {clientComputation.pagibig > 0 ? fmt(clientComputation.pagibig) : ''}
                          </td>
                        </tr>

                        {/* Row 5: Others (Bonus / Adjustments) <---> Lates */}
                        <tr className="border-b border-[#d0e4ec]">
                          <td className="py-2 px-3 font-medium text-slate-800 border-r border-[#d0e4ec] bg-white">Others (Bonus / Adjustments)</td>
                          <td className="py-2 px-2 text-center font-mono text-slate-800 border-r border-[#d0e4ec] bg-white"></td>
                          <td className="py-2 px-2 text-center font-mono text-slate-800 border-r border-[#d0e4ec] bg-white"></td>
                          <td className="py-2 px-3 text-center font-mono font-semibold text-slate-900 border-r border-[#d0e4ec] bg-white"></td>
                          <td className="py-2 px-3 font-medium text-slate-800 border-r border-[#d0e4ec] bg-[#eef7fa]">
                            {clientComputation.lateMinutes > 0 ? `Late Penalty (${clientComputation.lateMinutes}m)` : 'Lates'}
                          </td>
                          <td className="py-2 px-3 text-center font-mono font-semibold text-slate-900 bg-[#eef7fa]">
                            {clientComputation.latePenalty > 0 ? fmt(clientComputation.latePenalty) : ''}
                          </td>
                        </tr>

                        {/* Row 6: Empty <---> Absences */}
                        <tr className="border-b border-[#d0e4ec]">
                          <td className="py-2 px-3 font-medium text-slate-800 border-r border-[#d0e4ec] bg-white">&nbsp;</td>
                          <td className="py-2 px-2 text-center font-mono text-slate-800 border-r border-[#d0e4ec] bg-white"></td>
                          <td className="py-2 px-2 text-center font-mono text-slate-800 border-r border-[#d0e4ec] bg-white"></td>
                          <td className="py-2 px-3 text-center font-mono font-semibold text-slate-900 border-r border-[#d0e4ec] bg-white"></td>
                          <td className="py-2 px-3 font-medium text-slate-800 border-r border-[#d0e4ec] bg-[#eef7fa]">
                            {clientComputation.absenceDays > 0 ? `Absences (${clientComputation.absenceDays}d)` : 'Absences'}
                          </td>
                          <td className="py-2 px-3 text-center font-mono font-semibold text-slate-900 bg-[#eef7fa]">
                            {clientComputation.absenceDeduction > 0 ? fmt(clientComputation.absenceDeduction) : ''}
                          </td>
                        </tr>

                        {/* Row 7: Empty <---> Undertime */}
                        <tr className="border-b border-[#d0e4ec]">
                          <td className="py-2 px-3 font-medium text-slate-800 border-r border-[#d0e4ec] bg-white">&nbsp;</td>
                          <td className="py-2 px-2 text-center font-mono text-slate-800 border-r border-[#d0e4ec] bg-white"></td>
                          <td className="py-2 px-2 text-center font-mono text-slate-800 border-r border-[#d0e4ec] bg-white"></td>
                          <td className="py-2 px-3 text-center font-mono font-semibold text-slate-900 border-r border-[#d0e4ec] bg-white"></td>
                          <td className="py-2 px-3 font-medium text-slate-800 border-r border-[#d0e4ec] bg-[#eef7fa]">
                            {clientComputation.undertimeMinutes > 0 ? `Undertime (${clientComputation.undertimeMinutes}m)` : 'Undertime'}
                          </td>
                          <td className="py-2 px-3 text-center font-mono font-semibold text-slate-900 bg-[#eef7fa]">
                            {clientComputation.undertimeDeduction > 0 ? fmt(clientComputation.undertimeDeduction) : ''}
                          </td>
                        </tr>

                        {/* Row 8 (Optional): Other Deductions / Loans */}
                        {(clientComputation.customDeductionsSum > 0 || clientComputation.loanDeductionsSum > 0) && (
                          <tr className="border-b border-[#d0e4ec]">
                            <td className="py-2 px-3 font-medium text-slate-800 border-r border-[#d0e4ec] bg-white">&nbsp;</td>
                            <td className="py-2 px-2 text-center font-mono text-slate-800 border-r border-[#d0e4ec] bg-white"></td>
                            <td className="py-2 px-2 text-center font-mono text-slate-800 border-r border-[#d0e4ec] bg-white"></td>
                            <td className="py-2 px-3 text-center font-mono font-semibold text-slate-900 border-r border-[#d0e4ec] bg-white"></td>
                            <td className="py-2 px-3 font-medium text-slate-800 border-r border-[#d0e4ec] bg-[#eef7fa]">Other Deductions &amp; Loans</td>
                            <td className="py-2 px-3 text-center font-mono font-semibold text-slate-900 bg-[#eef7fa]">
                              {fmt((clientComputation.customDeductionsSum || 0) + (clientComputation.loanDeductionsSum || 0))}
                            </td>
                          </tr>
                        )}

                        {/* Subtotal Row */}
                        <tr className="border-t-2 border-[#1b4d5a] font-bold text-slate-900">
                          <td className="py-2.5 px-3 text-left border-r border-[#d0e4ec] bg-white">Total Earnings</td>
                          <td className="py-2.5 px-2 border-r border-[#d0e4ec] bg-white"></td>
                          <td className="py-2.5 px-2 border-r border-[#d0e4ec] bg-white"></td>
                          <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-900 border-r border-[#d0e4ec] bg-white">{fmt(grossPay)}</td>
                          <td className="py-2.5 px-3 border-r border-[#d0e4ec] bg-[#eef7fa]">Total Deductions</td>
                          <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-900 bg-[#eef7fa]">{fmt(totalDeductions)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* 4. Summary Footer */}
                  <div className="flex justify-end mt-4">
                    <div className="w-[300px] sm:w-[340px] space-y-1.5">
                      <div className="flex items-stretch border border-[#1b4d5a] overflow-hidden rounded-xs">
                        <div className="bg-[#1b4d5a] text-white font-bold text-xs px-3.5 py-1.5 w-[52%] flex items-center">
                          Total Earnings
                        </div>
                        <div className="bg-[#e8f4f8] text-slate-900 font-bold font-mono text-xs px-3.5 py-1.5 w-[48%] flex items-center justify-center">
                          {fmt(grossPay)}
                        </div>
                      </div>

                      <div className="flex items-stretch border border-[#1b4d5a] overflow-hidden rounded-xs">
                        <div className="bg-[#1b4d5a] text-white font-bold text-xs px-3.5 py-1.5 w-[52%] flex items-center">
                          Total Deductions
                        </div>
                        <div className="bg-[#e8f4f8] text-slate-900 font-bold font-mono text-xs px-3.5 py-1.5 w-[48%] flex items-center justify-center">
                          {fmt(totalDeductions)}
                        </div>
                      </div>

                      <div className="flex items-stretch border border-[#1b4d5a] overflow-hidden rounded-xs">
                        <div className="bg-[#1b4d5a] text-white font-bold text-xs px-3.5 py-1.5 w-[52%] flex items-center">
                          Net pay
                        </div>
                        <div className="bg-[#e8f4f8] text-slate-950 font-black font-mono text-sm px-3.5 py-1.5 w-[48%] flex items-center justify-center">
                          {fmt(netPay)}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Print Action Button */}
                  <div className="pt-4 flex justify-end no-print">
                    <button
                      type="button"
                      onClick={handlePrintPayslip}
                      className="px-4 py-2 rounded-xl bg-[#1b4d5a] hover:bg-[#153e49] text-white font-bold text-xs flex items-center gap-1.5 shadow-sm cursor-pointer transition-colors"
                    >
                      <FiPrinter className="w-4 h-4" />
                      <span>Print Pay Stub</span>
                    </button>
                  </div>
                </div>
              ) : !approvalResult ? (
                /* Ledger Breakdown View */
                <div className="space-y-3.5">
                  {/* Scope & Period Card */}
                  <div className="p-3.5 rounded-xl border border-border bg-card flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div>
                      <div className="text-[10px] text-muted-foreground uppercase font-semibold">
                        {isAllEmployees ? 'Batch Processing Scope' : 'Employee Details'}
                      </div>
                      <div className="font-bold text-foreground text-sm flex items-center gap-1.5">
                        {isAllEmployees ? (
                          <>
                            <FiUsers className="w-4 h-4 text-emerald-600" />
                            <span>All Staff ({filteredEmployees.length} Employees)</span>
                          </>
                        ) : (
                          <span>{selectedEmployee?.full_name}</span>
                        )}
                      </div>
                      <div className="text-muted-foreground text-[11px]">
                        {isAllEmployees
                          ? `Branch Scope: ${selectedBranch === 'All' ? 'All Store Branches' : selectedBranch} • Ready for Batch Approval`
                          : `${selectedEmployee?.employee_code} • ${selectedEmployee?.position} • ${selectedBranch}`}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-muted-foreground uppercase font-semibold">Cutoff Period</div>
                      <div className="font-bold text-foreground">
                        {previewData?.period?.period_name || (isWeekly ? 'Current Weekly Cutoff (Weekly Salary)' : 'Current Semi-Monthly Cutoff')}
                      </div>
                      <div className="text-emerald-600 dark:text-emerald-400 font-semibold text-[11px]">
                        From {fromDate || previewData?.period?.from_date} to {toDate || previewData?.period?.to_date} ({daysCount} Days)
                      </div>
                      <div className="text-muted-foreground text-[11px]">
                        {isAllEmployees ? (
                          <span>Combined Basic: {fmt(batchMetrics.totalBasic)} &bull; Combined Daily: {fmt(batchMetrics.totalDaily)}</span>
                        ) : clientComputation.dailyRate > 0 ? (
                          <span>Daily: {fmt(clientComputation.dailyRate)} &bull; Hourly: {fmt(clientComputation.hourlyRate)}</span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  {/* Attendance Tracking Summary Strip */}
                  <div className="p-3 rounded-xl border border-border bg-muted/20 text-xs space-y-1.5">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Attendance &amp; Time Summary {isAllEmployees && `(${filteredEmployees.length} Staff Combined)`}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-foreground font-medium">
                      <div>
                        <span className="text-[10px] text-muted-foreground block">Rendered Hours:</span>
                        <span className="font-mono font-bold">
                          {isAllEmployees ? `${batchAttendanceSummary?.totalHours || 0}h` : `${clientComputation.workHours}h`}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-muted-foreground block">Absences:</span>
                        <span className="font-mono font-bold text-rose-500">
                          {isAllEmployees
                            ? `${batchAttendanceSummary?.totalAbsences || 0}d (-${fmt(batchAttendanceSummary?.totalAbsenceDeduction || 0)})`
                            : `${clientComputation.absenceDays}d (-${fmt(clientComputation.absenceDeduction)})`}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-muted-foreground block">Late Minutes:</span>
                        <span className="font-mono font-bold text-rose-500">
                          {isAllEmployees
                            ? `${batchAttendanceSummary?.totalLateMinutes || 0}m (-${fmt(batchAttendanceSummary?.totalLatePenalty || 0)})`
                            : `${clientComputation.lateMinutes}m (-${fmt(clientComputation.latePenalty)})`}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-muted-foreground block">Undertime:</span>
                        <span className="font-mono font-bold text-rose-500">
                          {isAllEmployees
                            ? `${batchAttendanceSummary?.totalUndertimeMinutes || 0}m (-${fmt(batchAttendanceSummary?.totalUndertimeDeduction || 0)})`
                            : `${clientComputation.undertimeMinutes}m (-${fmt(clientComputation.undertimeDeduction)})`}
                        </span>
                      </div>
                    </div>
                    <div className="text-[10px] text-muted-foreground pt-1 border-t border-border/50">
                      <span className="font-semibold text-foreground">Late Penalty Rule:</span> 1–29m @ ₱1.00/min &bull; &ge;30m Half-Day Deduction
                    </div>
                  </div>

                  {/* Strict Zero Hours Rule Alert */}
                  {clientComputation.isZeroHours && (
                    <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-500 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 font-bold">
                        <FiAlertTriangle className="w-4 h-4 shrink-0 text-amber-500" />
                        <span>Zero Hours Rule Active: 0 rendered working hours recorded. Gross pay, statutory deductions, and net pay strictly evaluate to ₱0.00.</span>
                      </div>
                      <span className="px-2.5 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-400 font-mono font-extrabold uppercase">
                        ₱0.00 Salary
                      </span>
                    </div>
                  )}

                  {/* Two-Column Ledger: Earnings vs Deductions */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Column 1: Gross Earnings */}
                    <div className="p-4 rounded-xl border border-border bg-card space-y-2.5">
                      <div className="flex items-center justify-between pb-2 border-b border-border/70">
                        <span className="font-bold text-xs text-foreground uppercase tracking-wide flex items-center gap-1.5">
                          <TbCurrencyPeso className="w-4 h-4 text-emerald-600" />
                          <span>{isAllEmployees ? 'Total Batch Gross Pay' : 'Gross Pay'}</span>
                        </span>
                        <span className="font-mono font-bold text-xs text-foreground">{fmt(grossPay)}</span>
                      </div>
                      <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between text-muted-foreground">
                          <span>{isAllEmployees ? `Combined Base Pay (${filteredEmployees.length} staff):` : `Base Salary (${clientComputation.workHours}h):`}</span>
                          <span className="font-mono text-foreground font-medium">
                            {fmt(isAllEmployees ? batchMetrics.totalBasePay : clientComputation.periodBasePay)}
                          </span>
                        </div>
                        {!isAllEmployees && clientComputation.overtimePay > 0 && (
                          <div className="flex justify-between text-muted-foreground">
                            <span>Overtime Pay ({clientComputation.overtimeHours}h @ 125%):</span>
                            <span className="font-mono text-foreground font-medium">{fmt(clientComputation.overtimePay)}</span>
                          </div>
                        )}
                        {!isAllEmployees && clientComputation.allowance > 0 && (
                          <div className="flex justify-between text-muted-foreground">
                            <span>Allowances &amp; Bonuses:</span>
                            <span className="font-mono text-foreground font-medium">{fmt(clientComputation.allowance)}</span>
                          </div>
                        )}
                        {isAllEmployees && (
                          <div className="flex justify-between text-muted-foreground">
                            <span>Standard Coverage:</span>
                            <span className="font-mono text-foreground font-medium">{isWeekly ? '48h Weekly' : '104h Semi-Monthly'}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Column 2: Deductions Breakdown */}
                    <div className="p-4 rounded-xl border border-border bg-card space-y-2.5">
                      <div className="flex items-center justify-between pb-2 border-b border-border/70">
                        <span className="font-bold text-xs text-rose-600 uppercase tracking-wide flex items-center gap-1.5">
                          <FiTrendingDown className="w-4 h-4 text-rose-500" />
                          <span>{isAllEmployees ? 'Total Batch Deductions' : 'Total Deductions'}</span>
                        </span>
                        <span className="font-mono font-bold text-xs text-rose-600">-{fmt(totalDeductions)}</span>
                      </div>
                      <div className="space-y-1 text-xs">
                        {isAllEmployees ? (
                          <>
                            <div className="flex justify-between text-muted-foreground">
                              <span>Attendance Deductions:</span>
                              <span className="font-mono text-rose-500 font-medium">
                                -{fmt(batchAttendanceSummary?.totalAttendanceDeductions || 0)}
                              </span>
                            </div>
                            <div className="flex justify-between text-muted-foreground">
                              <span>SSS Contribution:</span>
                              <span className="font-mono text-rose-500 font-medium">
                                -{fmt(includeSss ? (batchAttendanceSummary?.totalSss || 0) : 0)}
                              </span>
                            </div>
                            <div className="flex justify-between text-muted-foreground">
                              <span>PhilHealth:</span>
                              <span className="font-mono text-rose-500 font-medium">
                                -{fmt(includePhilhealth ? (batchAttendanceSummary?.totalPhilhealth || 0) : 0)}
                              </span>
                            </div>
                            <div className="flex justify-between text-muted-foreground">
                              <span>Pag-IBIG:</span>
                              <span className="font-mono text-rose-500 font-medium">
                                -{fmt(includePagibig ? (batchAttendanceSummary?.totalPagibig || 0) : 0)}
                              </span>
                            </div>
                            {includeTax && (
                              <div className="flex justify-between text-muted-foreground">
                                <span>Withholding Tax:</span>
                                <span className="font-mono text-rose-500 font-medium">
                                  -{fmt(batchAttendanceSummary?.totalTax || 0)}
                                </span>
                              </div>
                            )}
                          </>
                        ) : (
                          <>
                            {(calc.absence_deduction ?? clientComputation.absenceDeduction) > 0 && (
                              <div className="flex justify-between text-muted-foreground">
                                <span>Absence Deduction ({calc.absence_days ?? clientComputation.absenceDays}d):</span>
                                <span className="font-mono text-rose-500 font-medium">-{fmt(calc.absence_deduction ?? clientComputation.absenceDeduction)}</span>
                              </div>
                            )}
                            {(calc.late_penalty ?? clientComputation.latePenalty) > 0 && (
                              <div className="flex justify-between text-muted-foreground">
                                <span>Late Penalty ({calc.late_minutes ?? clientComputation.lateMinutes}m):</span>
                                <span className="font-mono text-rose-500 font-medium">-{fmt(calc.late_penalty ?? clientComputation.latePenalty)}</span>
                              </div>
                            )}
                            {(calc.undertime_deduction ?? clientComputation.undertimeDeduction) > 0 && (
                              <div className="flex justify-between text-muted-foreground">
                                <span>Undertime ({calc.undertime_minutes ?? clientComputation.undertimeMinutes}m):</span>
                                <span className="font-mono text-rose-500 font-medium">-{fmt(calc.undertime_deduction ?? clientComputation.undertimeDeduction)}</span>
                              </div>
                            )}
                            {(calc.sss ?? clientComputation.sss) > 0 && (
                              <div className="flex justify-between text-muted-foreground">
                                <span>SSS Contribution (4.5%):</span>
                                <span className="font-mono text-rose-500 font-medium">-{fmt(calc.sss ?? clientComputation.sss)}</span>
                              </div>
                            )}
                            {(calc.philhealth ?? clientComputation.philhealth) > 0 && (
                              <div className="flex justify-between text-muted-foreground">
                                <span>PhilHealth Premium (2.5%):</span>
                                <span className="font-mono text-rose-500 font-medium">-{fmt(calc.philhealth ?? clientComputation.philhealth)}</span>
                              </div>
                            )}
                            {(calc.pagibig ?? clientComputation.pagibig) > 0 && (
                              <div className="flex justify-between text-muted-foreground">
                                <span>Pag-IBIG (HDMF):</span>
                                <span className="font-mono text-rose-500 font-medium">-{fmt(calc.pagibig ?? clientComputation.pagibig)}</span>
                              </div>
                            )}
                            {(calc.withholding_tax ?? clientComputation.withholdingTax) > 0 && (
                              <div className="flex justify-between text-muted-foreground">
                                <span>Withholding Tax:</span>
                                <span className="font-mono text-rose-500 font-medium">-{fmt(calc.withholding_tax ?? clientComputation.withholdingTax)}</span>
                              </div>
                            )}
                            {(calc.custom_deductions_sum ?? clientComputation.customDeductionsSum) > 0 && (
                              <div className="flex justify-between text-muted-foreground">
                                <span>Other Custom Deductions:</span>
                                <span className="font-mono text-rose-500 font-medium">-{fmt(calc.custom_deductions_sum ?? clientComputation.customDeductionsSum)}</span>
                              </div>
                            )}
                            {(calc.loan_deductions_sum ?? clientComputation.loanDeductionsSum) > 0 && (
                              <div className="flex justify-between text-muted-foreground">
                                <span>Loan Amortization:</span>
                                <span className="font-mono text-rose-500 font-medium">-{fmt(calc.loan_deductions_sum ?? clientComputation.loanDeductionsSum)}</span>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Net Pay Highlight Banner */}
                  <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300 block">
                        {isAllEmployees ? `Total Batch Net Payout (${filteredEmployees.length} Staff)` : 'Net Take-Home Pay (Formula: Gross Pay - Deductions)'}
                      </span>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {fmt(grossPay)} (Gross) &minus; {fmt(totalDeductions)} (Total Deductions) = {fmt(netPay)}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="font-mono font-extrabold text-xl sm:text-2xl text-emerald-600 dark:text-emerald-400">
                        {fmt(netPay)}
                      </span>
                    </div>
                  </div>

                  {/* Batch Mode: Employees to be Approved Roster */}
                  {isAllEmployees && (
                    <div className="p-3.5 rounded-xl border border-border bg-card space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                          Employees to be Approved ({previewData?.employees?.length || filteredEmployees.length} Staff)
                        </span>
                        <span className="text-[10px] text-emerald-600 font-semibold">
                          Transaction Protected
                        </span>
                      </div>
                      <div className="max-h-48 overflow-y-auto border border-border/60 rounded-lg">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-muted/50 text-[10px] uppercase text-muted-foreground font-semibold sticky top-0">
                            <tr>
                              <th className="py-2 px-3">Employee</th>
                              <th className="py-2 px-2 text-right">Basic Monthly</th>
                              <th className="py-2 px-2 text-right">Est. Gross</th>
                              <th className="py-2 px-2 text-right">Deductions</th>
                              <th className="py-2 px-3 text-right">Net Payout</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/50">
                            {(previewData?.employees || filteredEmployees).map((emp) => {
                              const c = emp.calculation || {}
                              const rates = resolveWorkflowEmployeeRates(emp)
                              const baseSalary = rates.monthlyBasic
                              const empGross = c.gross_pay ?? (isWeekly ? rates.weeklyBase : (baseSalary / 2))
                              const empDeds = c.total_deductions ?? 0
                              const empNet = c.net_pay ?? Math.max(0, empGross - empDeds)
                              return (
                                <tr key={emp.employee_id} className="hover:bg-muted/20">
                                  <td className="py-2 px-3">
                                    <div className="font-bold text-foreground text-xs">{emp.full_name}</div>
                                    <div className="text-[10px] text-muted-foreground">{emp.employee_code} &bull; {emp.branch || emp.branch_name || selectedBranch}</div>
                                  </td>
                                  <td className="py-2 px-2 text-right font-mono text-muted-foreground">
                                    {fmt(baseSalary)}
                                  </td>
                                  <td className="py-2 px-2 text-right font-mono font-medium text-foreground">
                                    {fmt(empGross)}
                                  </td>
                                  <td className="py-2 px-2 text-right font-mono text-rose-500">
                                    -{fmt(empDeds)}
                                  </td>
                                  <td className="py-2 px-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                                    {fmt(empNet)}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Employee Saved Payout Preference & Proof of Payment Upload */}
                  {!isAllEmployees && selectedEmployee && (
                    <div className="p-4 rounded-xl border border-emerald-500/30 bg-card space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-border/60">
                        <div className="flex items-center gap-2">
                          <FiCreditCard className="w-4 h-4 text-emerald-600" />
                          <span className="text-xs font-bold text-foreground uppercase tracking-wide">
                            Employee Saved Payout Preference
                          </span>
                        </div>
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                          {selectedEmployee.pay_type || previewData?.employee?.pay_type || 'Cash'}
                        </span>
                      </div>

                      {(selectedEmployee.pay_type === 'E-Wallet' || previewData?.employee?.pay_type === 'E-Wallet') ? (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs p-3 rounded-lg bg-muted/30 border border-border">
                          <div>
                            <span className="text-[10px] text-muted-foreground uppercase font-bold block">Provider</span>
                            <span className="font-bold text-foreground">{selectedEmployee.ewallet_provider || previewData?.employee?.ewallet_provider || 'GCash / Maya'}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-muted-foreground uppercase font-bold block">Account Name</span>
                            <span className="font-semibold text-foreground">{selectedEmployee.ewallet_account_name || previewData?.employee?.ewallet_account_name || selectedEmployee.full_name}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-muted-foreground uppercase font-bold block">Mobile / Account No.</span>
                            <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{selectedEmployee.ewallet_account_no || previewData?.employee?.ewallet_account_no || 'Not Set'}</span>
                          </div>
                        </div>
                      ) : (selectedEmployee.pay_type === 'Online Bank' || previewData?.employee?.pay_type === 'Online Bank') ? (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs p-3 rounded-lg bg-muted/30 border border-border">
                          <div>
                            <span className="text-[10px] text-muted-foreground uppercase font-bold block">Bank Name</span>
                            <span className="font-bold text-foreground">{selectedEmployee.bank_name || previewData?.employee?.bank_name || 'Online Bank'}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-muted-foreground uppercase font-bold block">Account Name</span>
                            <span className="font-semibold text-foreground">{selectedEmployee.bank_account_name || previewData?.employee?.bank_account_name || selectedEmployee.full_name}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-muted-foreground uppercase font-bold block">Account Number</span>
                            <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{selectedEmployee.bank_account_no || previewData?.employee?.bank_account_no || 'Not Set'}</span>
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground p-2.5 rounded-lg bg-muted/20 border border-border">
                          Direct <strong>Cash</strong> disbursement at store branch ({selectedBranch}).
                        </div>
                      )}

                      {/* Proof of Payment Upload (Highlighted for E-Wallet / Online Bank) */}
                      <div className="pt-1 space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="block text-[11px] font-bold text-foreground uppercase tracking-wider">
                            Proof of Payment Receipt Image {(selectedEmployee.pay_type === 'E-Wallet' || selectedEmployee.pay_type === 'Online Bank') ? '(Recommended for Digital Payout — Marks as Paid)' : '(Optional)'}
                          </label>
                          {proofFile && (
                            <button
                              type="button"
                              onClick={clearProofFile}
                              className="text-[11px] text-rose-500 hover:underline font-semibold cursor-pointer"
                            >
                              Remove Image
                            </button>
                          )}
                        </div>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleProofFileChange}
                          className="w-full text-xs text-muted-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-emerald-600 file:text-white hover:file:bg-emerald-700 cursor-pointer border border-border rounded-xl p-1.5 bg-card"
                        />
                        {proofPreview && (
                          <div className="mt-2 p-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 flex items-center gap-3">
                            <img
                              src={proofPreview}
                              alt="Proof of Payment Preview"
                              className="w-20 h-20 object-cover rounded-lg border border-border shadow-xs shrink-0"
                            />
                            <div className="text-xs space-y-1 min-w-0">
                              <div className="font-bold text-emerald-700 dark:text-emerald-300 truncate">{proofFile?.name}</div>
                              <div className="text-[11px] text-muted-foreground">
                                Uploading this receipt during approval will automatically mark this payroll as <strong>Paid</strong> and allow the employee to view their Proof of Payment.
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Optional Notes */}
                  <div>
                    <label className="block text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
                      Approval Notes / Remarks (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder={isAllEmployees ? "e.g., Batch reviewed attendance and approved for all branch employees" : "e.g., Reviewed attendance and approved for semi-monthly payroll release"}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground text-xs"
                    />
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>

        {/* Modal Footer Controls */}
        <div className="px-6 py-4 border-t border-border bg-muted/30 flex items-center justify-between">
          <div>
            {currentStep > 1 && !approvalResult && (
              <button
                type="button"
                disabled={approving}
                onClick={() => {
                  setViewingPayslip(false)
                  setCurrentStep(prev => Math.max(1, prev - 1))
                }}
                className="px-4 py-2 rounded-xl border border-border hover:bg-card text-foreground font-semibold text-xs flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
              >
                <FiChevronLeft className="w-3.5 h-3.5" />
                <span>Back</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={approving}
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-border hover:bg-card text-muted-foreground hover:text-foreground font-semibold text-xs transition-all cursor-pointer disabled:opacity-50"
            >
              {approvalResult ? 'Close' : 'Cancel'}
            </button>

            {currentStep === 1 && (
              <button
                type="button"
                id="workflow-step1-next"
                disabled={!selectedBranch || loadingBranchEmployees}
                onClick={() => setCurrentStep(2)}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md transition-all cursor-pointer disabled:opacity-50"
              >
                <span>Next: Employee Selection</span>
                <FiChevronRight className="w-4 h-4" />
              </button>
            )}

            {currentStep === 2 && (
              <button
                type="button"
                id="workflow-step2-next"
                disabled={!selectedEmployeeId}
                onClick={() => setCurrentStep(3)}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md transition-all cursor-pointer disabled:opacity-50"
              >
                <span>Next: Attendance Tracking</span>
                <FiChevronRight className="w-4 h-4" />
              </button>
            )}

            {currentStep === 3 && (
              <button
                type="button"
                id="workflow-step3-next"
                onClick={() => setCurrentStep(4)}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md transition-all cursor-pointer"
              >
                <span>Next: Review &amp; Approval</span>
                <FiChevronRight className="w-4 h-4" />
              </button>
            )}

            {currentStep === 4 && !approvalResult && (
              <button
                type="button"
                id="workflow-approve-btn"
                disabled={approving || !selectedEmployeeId}
                onClick={handleApprovePayroll}
                className="px-6 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-2 shadow-lg transition-all active:scale-95 cursor-pointer disabled:opacity-50"
              >
                <FiCheckCircle className="w-4 h-4 text-amber-300" />
                <span>
                  {approving
                    ? (isAllEmployees ? `Approving Batch (${filteredEmployees.length} Staff)...` : 'Approving & Recording...')
                    : (isAllEmployees ? `Approve All (${filteredEmployees.length} Staff)` : 'Approve')}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

