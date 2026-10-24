import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  FiTrendingDown, FiCreditCard, FiUsers,
  FiGift, FiZap, FiFileText, FiCheckCircle, FiEye,
  FiPrinter, FiX, FiCalendar, FiPlus, FiAlertCircle, FiSearch
} from 'react-icons/fi'
import {
  Btn, Badge, StatusBadge, Input, Select, Modal,
  Table, TR, TD, PageHeader, StatCard, Card, Pagination, showToast, confirmAction, showLoading, closeLoading,
  TabBar, LoadingState, ErrorAlert, TableSkeleton, EmptyState,
} from '../components/ui'
import { fmt, fastDeepEqual } from '../lib/utils'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import { useRealtimeSync, triggerDataSync } from '../lib/realtimeSync'
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'
import { TbCurrencyPeso } from 'react-icons/tb'
import EmployeePayslipModal from '../components/payslip/EmployeePayslipModal'

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
  const [newPeriodModal, setNewPeriodModal] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)

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

  const loadData = async (targetPeriodId, customParams = {}, silent = false) => {
    const isBg = silent || payroll.length > 0
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
        })
        const newPay = data?.payroll || []
        setPayroll(prev => fastDeepEqual(prev, newPay) ? prev : newPay)
        if (periods.length === 0) {
          const periodsData = await api.payroll.getPeriods().catch(() => ({ periods: [] }))
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
        })
        const newPay = data?.payroll || []
        const newPer = data?.periods || []
        const newUnp = data?.unprocessed_employees || []
        setPayroll(prev => fastDeepEqual(prev, newPay) ? prev : newPay)
        setPeriods(prev => fastDeepEqual(prev, newPer) ? prev : newPer)
        setUnprocessedEmployees(prev => fastDeepEqual(prev, newUnp) ? prev : newUnp)
        setEligibleCount(data?.eligible_count || 0)
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

  useRealtimeSync(() => {
    loadData(selectedPeriodId, { branch: branchFilter, fromDate, toDate, status: filterStatus }, true)
  }, [selectedPeriodId, branchFilter, fromDate, toDate, filterStatus, user?.role], { periodic: true })

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

  const handleOpenGenerateModal = () => {
    setGeneratePeriodId(selectedPeriodId || '')
    setGenerateScope('all')
    setGenerateEmployeeId('')
    const initBranch = isStoreAdmin ? (userBranchName || 'All') : (branchFilter !== 'All' ? branchFilter : 'All')
    setModalBranch(initBranch)
    setRecalculateExisting(true)
    setRequireAttendance(false)
    setGenerateModal(true)
    loadEmployees(initBranch)
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

  const handleMarkPaid = async (payrollId) => {
    const confirmed = await confirmAction('Mark as Paid', 'Are you sure you want to mark this payroll as Paid? This indicates the employee has received their money.', 'Yes, Mark Paid')
    if (!confirmed) return

    showLoading('Marking as paid...')
    try {
      await api.payroll.markPaid(payrollId)
      setPayroll(prev => prev.map(p => p.payroll_id === payrollId ? { ...p, status: 'Paid' } : p))
      showToast('Payroll marked as Paid', 'success')
      triggerDataSync('payroll')
    } catch (err) {
      showToast(err.message || 'Failed to update payroll status', 'error')
    } finally {
      closeLoading()
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

  // Live aggregates
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
          subtitle="Manage salary generation, statutory deductions, approval, and payslips"
          action={
            isManager ? (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleOpenGenerateModal}
                  disabled={generating}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs cursor-pointer shadow-md transition-all active:scale-95 disabled:opacity-50"
                  title="Generate payroll for every employee in open period"
                >
                  <FiZap className="w-4 h-4 text-amber-300" />
                  <span>{generating ? 'Calculating...' : 'Generate Payroll'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setNewPeriodModal(true)}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-border bg-card hover:bg-muted font-semibold text-xs text-foreground cursor-pointer shadow-2xs transition-colors"
                >
                  <FiPlus className="w-4 h-4" />
                  <span>New Period</span>
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
        />
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard title="Gross Payroll" value={fmt(totalGross)} sub="total earnings" icon={<TbCurrencyPeso className="w-5 h-5" />} color="blue" />
        <StatCard title="Total Deductions" value={fmt(totalDeductions)} sub="statutory & tax" icon={<FiTrendingDown className="w-5 h-5 text-rose-500" />} color="red" />
        <StatCard title="Net Payout" value={fmt(totalNet)} sub="total take-home pay" icon={<FiCreditCard className="w-5 h-5 text-emerald-500" />} color="green" />
        <StatCard title="Employees Processed" value={displayed.length.toString()} sub="in selected period" icon={<FiUsers className="w-5 h-5 text-indigo-500" />} color="indigo" />
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
            onClick={handleOpenGenerateModal}
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
              <table className="w-full text-xs min-w-[1040px]">
                <thead>
                  <tr className="border-b border-border bg-muted/50 text-muted-foreground uppercase font-semibold text-[11px]">
                    <th className="py-3 px-4 text-left">Code</th>
                    <th className="py-3 px-4 text-left">Employee Name</th>
                    <th className="py-3 px-4 text-left">Branch</th>
                    <th className="py-3 px-4 text-right">Reg. Hours</th>
                    <th className="py-3 px-4 text-right">Basic Pay</th>
                    <th className="py-3 px-4 text-right">OT Hours</th>
                    <th className="py-3 px-4 text-right">Overtime Pay</th>
                    <th className="py-3 px-4 text-right">Gross Pay</th>
                    <th className="py-3 px-4 text-right">Deductions</th>
                    <th className="py-3 px-4 text-right">Net Pay</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {paginated.map((p, i) => (
                    <tr key={p.payroll_id || i} className={`hover:bg-muted/40 transition-colors ${i % 2 === 1 ? 'bg-muted/10' : ''}`}>
                      <td className="py-3 px-4 font-mono font-bold text-foreground">{p.employee_code}</td>
                      <td className="py-3 px-4 font-semibold text-foreground">
                        <div>{p.employee_name}</div>
                        <div className="text-[10px] text-muted-foreground font-normal">
                          {p.position || 'Staff'}{p.department ? ` • ${p.department}` : ''}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-left">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 max-w-[190px] truncate" title={p.branch || 'Unassigned'}>
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"></span>
                          <span className="truncate">{p.branch || 'Unassigned'}</span>
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-muted-foreground">{p.regular_hours > 0 ? `${p.regular_hours}h` : '0h'}</td>
                      <td className="py-3 px-4 text-right font-mono">{fmt(p.basic_salary)}</td>
                      <td className="py-3 px-4 text-right font-mono text-muted-foreground">{p.overtime_hours > 0 ? `${p.overtime_hours}h` : '—'}</td>
                      <td className="py-3 px-4 text-right font-mono text-amber-600 font-semibold">{fmt(p.overtime_pay || 0)}</td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-foreground">{fmt(p.gross_pay)}</td>
                      <td className="py-3 px-4 text-right font-mono text-rose-600 font-semibold">- {fmt(p.total_deductions)}</td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-emerald-600">{fmt(p.net_pay)}</td>
                      <td className="py-3 px-4 text-center"><StatusBadge status={p.status} /></td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => openPayslip(p)}
                            title="View itemized payslip"
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-lg border border-border hover:bg-muted font-semibold cursor-pointer transition-colors"
                          >
                            <FiFileText className="w-3.5 h-3.5" />
                            <span>Slip</span>
                          </button>
                          {isManager && p.status === 'Draft' && (
                            <button
                              onClick={() => handleApprove(p.payroll_id)}
                              title="Approve payroll"
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-lg bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 font-bold cursor-pointer transition-colors"
                            >
                              <FiCheckCircle className="w-3 h-3" />
                              <span>Approve</span>
                            </button>
                          )}
                          {isManager && p.status === 'Approved' && (
                            <button
                              onClick={() => handleMarkPaid(p.payroll_id)}
                              title="Mark as Paid"
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 font-bold cursor-pointer transition-colors"
                            >
                              <FiCreditCard className="w-3 h-3" />
                              <span>Pay</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
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

      {/* New Period Modal */}
      {newPeriodModal && (
        <Modal
          isOpen={true}
          title="Create New Payroll Period"
          onClose={() => setNewPeriodModal(false)}
          size="md"
        >
          <form onSubmit={handleCreatePeriod} className="space-y-3.5 text-xs">
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

            <div className="grid grid-cols-2 gap-2.5">
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

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
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

      {/* Generate Payroll Modal */}
      {generateModal && (
        <Modal
          isOpen={true}
          title="Generate Employee Payroll"
          onClose={() => !generating && setGenerateModal(false)}
          size="md"
        >
          <form onSubmit={handleGenerateSubmit} className="space-y-4 text-xs">
            {/* Info Notice */}
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300 flex items-start gap-2.5">
              <FiZap className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div className="text-[11px] leading-relaxed">
                <span className="font-bold">Automated Calculation:</span> Generates payroll for employees by processing attendance records, regular &amp; overtime hours, statutory contributions (SSS, PhilHealth, Pag-IBIG), active loans, and allowances.
              </div>
            </div>

            {/* Target Period */}
            <div>
              <label className="block font-bold text-muted-foreground uppercase text-[10px] tracking-wider mb-1.5">
                Target Payroll Period *
              </label>
              <select
                value={generatePeriodId}
                onChange={e => setGeneratePeriodId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground text-xs focus:ring-2 focus:ring-emerald-500/20"
              >
                <option value="">⚡ Auto-Detect / Current Semi-Monthly Period</option>
                {periods.map(prd => (
                  <option key={prd.period_id} value={prd.period_id}>
                    {prd.period_name} ({prd.start_date} to {prd.end_date}) [{prd.status}]
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-muted-foreground mt-1">
                If no period is chosen, the system automatically uses the open period or creates the current cycle.
              </p>
            </div>

            {/* Target Branch */}
            {user?.role !== 'Employee' && (
              <div>
                <label className="block font-bold text-muted-foreground uppercase text-[10px] tracking-wider mb-1.5">
                  Target Branch {isStoreAdmin ? '(Assigned)' : ''}
                </label>
                <select
                  value={modalBranch}
                  disabled={isStoreAdmin}
                  onChange={e => {
                    const b = e.target.value
                    setModalBranch(b)
                    setGenerateEmployeeId('')
                    loadEmployees(b)
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground text-xs focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-75"
                >
                  <option value="All">All Branches</option>
                  {branches.map(b => (
                    <option key={b.id || b.branch_id || b.name} value={b.name}>{b.name}</option>
                  ))}
                </select>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {isStoreAdmin
                    ? `Generating exclusively for staff assigned to ${userBranchName || 'your branch'}.`
                    : modalBranch === 'All'
                    ? 'Generates payroll across all active branches.'
                    : `Generates payroll exclusively for employees assigned to ${modalBranch}.`}
                </p>
              </div>
            )}

            {/* Target Scope: All or Single */}
            <div>
              <label className="block font-bold text-muted-foreground uppercase text-[10px] tracking-wider mb-1.5">
                Target Scope *
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setGenerateScope('all')}
                  className={`flex items-center justify-between p-3 rounded-xl border text-left cursor-pointer transition-all ${
                    generateScope === 'all'
                      ? 'border-emerald-600 bg-emerald-500/10 text-emerald-950 dark:text-emerald-200 ring-2 ring-emerald-500/20 font-bold'
                      : 'border-border bg-card hover:bg-muted/50 text-foreground'
                  }`}
                >
                  <div>
                    <div className="font-bold text-xs">All Active Employees</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">Generate for everyone</div>
                  </div>
                  <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-600 text-white">
                    {employeeList.length || 'All'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setGenerateScope('single')}
                  className={`flex items-center justify-between p-3 rounded-xl border text-left cursor-pointer transition-all ${
                    generateScope === 'single'
                      ? 'border-emerald-600 bg-emerald-500/10 text-emerald-950 dark:text-emerald-200 ring-2 ring-emerald-500/20 font-bold'
                      : 'border-border bg-card hover:bg-muted/50 text-foreground'
                  }`}
                >
                  <div>
                    <div className="font-bold text-xs">Single Employee</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">Pick one employee</div>
                  </div>
                  <FiUsers className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
            </div>

            {/* Single Employee Selection */}
            {generateScope === 'single' && (
              <div className="p-3 rounded-xl border border-border bg-muted/20 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="block font-bold text-muted-foreground uppercase text-[10px] tracking-wider">
                    Select Active Employee *
                  </label>
                  <span className="text-[10px] text-muted-foreground font-semibold">
                    {employeeList.length} Active Staff Account{employeeList.length === 1 ? '' : 's'}
                  </span>
                </div>
                <select
                  value={generateEmployeeId}
                  onChange={e => setGenerateEmployeeId(e.target.value)}
                  required={generateScope === 'single'}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground text-xs font-medium focus:ring-2 focus:ring-emerald-500/20"
                >
                  <option value="">-- Choose an active employee ({employeeList.length} staff users) --</option>
                  {employeeList.map(emp => (
                    <option key={emp.employee_id} value={emp.employee_id}>
                      {emp.employee_code}: {emp.full_name} {emp.username ? `(@${emp.username})` : ''} — {emp.role || emp.position} [{emp.branch_name}] (₱{Number(emp.basic_salary || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                    </option>
                  ))}
                </select>

                {/* Selected Employee Live Preview Card */}
                {selectedEmp && (
                  <div className="p-3 rounded-xl bg-card border border-emerald-500/30 shadow-xs flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold flex items-center justify-center text-xs uppercase border border-emerald-500/20">
                          {selectedEmp.first_name?.[0] || 'E'}{selectedEmp.last_name?.[0] || 'M'}
                        </div>
                        <div>
                          <div className="font-bold text-xs text-foreground flex items-center gap-1.5">
                            <span>{selectedEmp.full_name}</span>
                            {selectedEmp.username && (
                              <span className="font-mono text-[11px] font-normal text-emerald-600 dark:text-emerald-400">
                                @{selectedEmp.username}
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            {selectedEmp.employee_code} • {selectedEmp.role || selectedEmp.position} ({selectedEmp.department || 'Operations'})
                          </div>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                        Active User
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/60 text-[11px]">
                      <div>
                        <span className="block text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">Branch</span>
                        <span className="font-semibold text-foreground truncate block">{selectedEmp.branch_name}</span>
                      </div>
                      <div>
                        <span className="block text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">Basic Salary</span>
                        <span className="font-bold font-mono text-emerald-600 dark:text-emerald-400">
                          ₱{Number(selectedEmp.basic_salary || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">Pay Type</span>
                        <span className="font-semibold text-foreground">{selectedEmp.pay_type || 'Cash'}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Options */}
            <div className="pt-2 border-t border-border space-y-3">
              <div className="p-2.5 rounded-xl border border-border bg-muted/20">
                <label className="flex items-start gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={requireAttendance}
                    onChange={e => setRequireAttendance(e.target.checked)}
                    className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4 mt-0.5"
                  />
                  <div>
                    <span className="text-xs text-foreground font-semibold">
                      Strict Attendance-Only (&ldquo;No Work, No Pay&rdquo;)
                    </span>
                    <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">
                      {requireAttendance
                        ? '⚠️ Active: Employees with 0 attendance logs in this period will be SKIPPED and will not appear in payroll.'
                        : '✅ Standard: Computes salary for ALL eligible employees (uses attendance logs if available; standard semi-monthly rate if attendance is not yet encoded).'}
                    </p>
                  </div>
                </label>
              </div>
              <div>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={recalculateExisting}
                    onChange={e => setRecalculateExisting(e.target.checked)}
                    className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                  />
                  <span className="text-xs text-foreground font-medium">
                    Recalculate &amp; update existing draft payrolls (recommended)
                  </span>
                </label>
                <p className="text-[10px] text-muted-foreground ml-6 mt-0.5">
                  Overwrites unapproved draft entries with fresh calculations. Approved and Paid records will remain protected.
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-2 pt-3 border-t border-border">
              <button
                type="button"
                onClick={() => setGenerateModal(false)}
                disabled={generating}
                className="px-4 py-2 rounded-xl border border-border hover:bg-muted font-semibold cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={generating || (generateScope === 'single' && !generateEmployeeId)}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer shadow-md transition-all active:scale-95 disabled:opacity-50"
              >
                <FiZap className="w-4 h-4 text-amber-300" />
                <span>
                  {generating
                    ? 'Processing Payroll...'
                    : generateScope === 'all'
                    ? `Generate for Active Staff (${employeeList.length})${modalBranch !== 'All' ? ` • ${modalBranch}` : ''}`
                    : selectedEmp
                    ? `Generate for ${selectedEmp.full_name} (${selectedEmp.employee_code})`
                    : 'Generate for Selected Employee'}
                </span>
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
