import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  FiTrendingDown, FiCreditCard, FiUsers,
  FiGift, FiZap, FiFileText, FiCheckCircle, FiEye,
  FiPrinter, FiX, FiCalendar, FiPlus, FiAlertCircle, FiSearch
} from 'react-icons/fi'
import {
  Btn, Badge, StatusBadge, Input, Select, Modal,
  Table, TR, TD, PageHeader, StatCard, Card, Pagination, showToast,
  TabBar, LoadingState, ErrorAlert, TableSkeleton, EmptyState,
} from '../components/ui'
import { fmt } from '../lib/utils'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'
import { TbCurrencyPeso } from 'react-icons/tb'

export default function PayrollPage() {
  const [searchParams] = useSearchParams()
  const { user } = useAuth()
  const [payroll, setPayroll] = useState([])
  const [periods, setPeriods] = useState([])
  const [selectedPeriodId, setSelectedPeriodId] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 10

  // Modals
  const [payslip, setPayslip] = useState(null)
  const [newPeriodModal, setNewPeriodModal] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)

  // New Period Form
  const [periodName, setPeriodName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [payDate, setPayDate] = useState('')

  const loadData = async (targetPeriodId) => {
    setLoading(true)
    setError('')
    try {
      const data = await api.payroll.getAll({
        period_id: targetPeriodId !== undefined ? (targetPeriodId || undefined) : (selectedPeriodId || undefined),
      })
      setPayroll(data.payroll || [])
      setPeriods(data.periods || [])
      if (!selectedPeriodId && data.periods?.length > 0 && targetPeriodId === undefined) {
        setSelectedPeriodId(data.periods[0].period_id.toString())
      }
    } catch (err) {
      console.error('Failed to load payroll:', err)
      setError(err.message || 'Failed to fetch payroll records')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    const id = searchParams.get('id')
    if (id) {
      openPayslip({ payroll_id: id })
    }
  }, [searchParams])

  const handlePeriodChange = (id) => {
    setSelectedPeriodId(id)
    loadData(id)
  }

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const res = await api.payroll.generate(user?.user_id || 1, selectedPeriodId ? parseInt(selectedPeriodId) : undefined)
      showToast(res.message || 'Payroll generated successfully', 'success')
      loadData(selectedPeriodId)
    } catch (err) {
      showToast(err.message || 'Failed to generate payroll', 'error')
    } finally {
      setGenerating(false)
    }
  }

  const handleGenerate13thMonth = async () => {
    setGenerating(true)
    try {
      const res = await api.payroll.generate13thMonth(user?.user_id || 1)
      showToast(res.message || '13th Month Pay generated successfully', 'success')
      loadData()
    } catch (err) {
      showToast(err.message || 'Failed to generate 13th month pay', 'error')
    } finally {
      setGenerating(false)
    }
  }

  const handleApprove = async (payrollId) => {
    try {
      await api.payroll.approve(payrollId, user?.user_id || 1)
      setPayroll(prev => prev.map(p => p.payroll_id === payrollId ? { ...p, status: 'Approved' } : p))
      showToast('Payroll record approved', 'success')
    } catch (err) {
      showToast(err.message || 'Failed to approve payroll', 'error')
    }
  }

  const handleMarkPaid = async (payrollId) => {
    try {
      await api.payroll.markPaid(payrollId)
      setPayroll(prev => prev.map(p => p.payroll_id === payrollId ? { ...p, status: 'Paid' } : p))
      showToast('Payroll marked as Paid', 'success')
    } catch (err) {
      showToast(err.message || 'Failed to update payroll status', 'error')
    }
  }

  const handleCreatePeriod = async (e) => {
    e.preventDefault()
    if (!periodName || !startDate || !endDate) {
      showToast('Please fill in period name and date range', 'error')
      return
    }

    setSaving(true)
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
      loadData(res.period?.period_id ? res.period.period_id.toString() : undefined)
    } catch (err) {
      showToast(err.message || 'Failed to create period', 'error')
    } finally {
      setSaving(false)
    }
  }

  const openPayslip = async (p) => {
    try {
      const data = await api.payroll.getPayslip(p.payroll_id)
      setPayslip(data.record)
    } catch (err) {
      showToast(err.message || 'Failed to fetch payslip details', 'error')
    }
  }

  const displayed = useMemo(() => {
    let list = selectedPeriodId
      ? payroll.filter(p => p.period_id?.toString() === selectedPeriodId)
      : payroll
    if (search.trim()) {
      const q = search.toLowerCase().trim()
      list = list.filter(p => {
        const name = (p.employee_name || '').toLowerCase()
        const code = (p.employee_code || '').toLowerCase()
        const dept = (p.department || '').toLowerCase()
        const pos = (p.position || '').toLowerCase()
        return name.includes(q) || code.includes(q) || dept.includes(q) || pos.includes(q)
      })
    }
    return list
  }, [payroll, selectedPeriodId, search])

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
      <PageHeader
        title="Payroll & Compensation"
        subtitle="Manage salary generation, statutory deductions (SSS, PhilHealth, Pag-IBIG), approval, and payslips"
        action={
          <div className="flex gap-2">
            <button
              onClick={() => setNewPeriodModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-border bg-card hover:bg-muted font-semibold text-xs text-foreground cursor-pointer shadow-2xs transition-colors"
            >
              <FiPlus className="w-4 h-4" />
              <span>New Period</span>
            </button>
            <button
              onClick={handleGenerate13thMonth}
              disabled={generating}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-border bg-card hover:bg-muted font-semibold text-xs text-foreground cursor-pointer shadow-2xs transition-colors disabled:opacity-50"
            >
              <FiGift className="w-4 h-4 text-purple-500" />
              <span>{generating ? 'Processing...' : '13th Month'}</span>
            </button>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50"
            >
              <FiZap className="w-4 h-4" />
              <span>{generating ? 'Generating...' : 'Generate Payroll'}</span>
            </button>
          </div>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard title="Gross Payroll" value={fmt(totalGross)} sub="total earnings" icon={<TbCurrencyPeso className="w-5 h-5" />} color="blue" />
        <StatCard title="Total Deductions" value={fmt(totalDeductions)} sub="statutory & tax" icon={<FiTrendingDown className="w-5 h-5 text-rose-500" />} color="red" />
        <StatCard title="Net Payout" value={fmt(totalNet)} sub="total take-home pay" icon={<FiCreditCard className="w-5 h-5 text-emerald-500" />} color="green" />
        <StatCard title="Employees Processed" value={displayed.length.toString()} sub="in selected period" icon={<FiUsers className="w-5 h-5 text-indigo-500" />} color="indigo" />
      </div>

      {/* Payroll Summary Chart */}
      {displayed.length > 0 && (
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

      {/* Period Selector & Search Card */}
      <Card noPad className="p-3.5 border border-border">
        <div className="flex flex-col md:flex-row justify-between items-center gap-3">
          <div className="flex items-center gap-2 w-full md:w-auto">
            <label className="text-xs font-bold text-muted-foreground uppercase whitespace-nowrap">Payroll Period:</label>
            <select
              value={selectedPeriodId}
              onChange={e => { handlePeriodChange(e.target.value); setPage(1); }}
              className="border border-border rounded-xl px-3 py-2 text-xs font-semibold text-primary bg-card cursor-pointer w-full sm:w-72"
            >
              {periods.map(prd => (
                <option key={prd.period_id} value={prd.period_id}>
                  {prd.period_name} ({prd.status})
                </option>
              ))}
            </select>
          </div>

          <div className="w-full md:w-80 relative">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Search employee name, code, dept..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-9 pr-8 py-2 text-xs border border-border rounded-xl bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-muted-foreground/70"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <FiX className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card noPad className="border border-border overflow-hidden">
        {loading ? (
          <TableSkeleton rows={6} cols={9} />
        ) : paginated.length === 0 ? (
          <EmptyState
            icon={<TbCurrencyPeso className="w-12 h-12 text-muted-foreground/30 mx-auto" />}
            title="No payroll entries found for this period"
            description="Click 'Generate Payroll' to automatically compute salaries and deductions for active employees."
            action={
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-primary text-primary-foreground font-bold text-xs rounded-xl cursor-pointer disabled:opacity-50"
              >
                <FiZap className="w-4 h-4" />
                <span>{generating ? 'Generating...' : 'Generate Payroll Now'}</span>
              </button>
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
                      <td className="py-3 px-4 font-semibold text-foreground">{p.employee_name}</td>
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
                          {p.status === 'Draft' && (
                            <button
                              onClick={() => handleApprove(p.payroll_id)}
                              title="Approve payroll"
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-lg bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 font-bold cursor-pointer transition-colors"
                            >
                              <FiCheckCircle className="w-3 h-3" />
                              <span>Approve</span>
                            </button>
                          )}
                          {p.status === 'Approved' && (
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
        <Modal
          isOpen={true}
          title={`Payslip: ${payslip.employee_name} (${payslip.period_name})`}
          onClose={() => setPayslip(null)}
          size="lg"
        >
          <div className="space-y-4 text-xs">
            <div className="text-center border-b border-border pb-2">
              <h3 className="font-bold text-sm text-foreground">PROJECT PACE STORE</h3>
              <p className="text-[11px] text-muted-foreground">Official Employee Pay Advice · Period: {payslip.period_name}</p>
            </div>

            <div className="grid grid-cols-2 gap-2 p-3 bg-muted/20 rounded-xl border border-border">
              <div><span className="text-muted-foreground">Employee:</span> <span className="font-bold text-foreground">{payslip.employee_name} ({payslip.employee_code})</span></div>
              <div><span className="text-muted-foreground">Department:</span> <span className="text-foreground">{payslip.department}</span></div>
              <div><span className="text-muted-foreground">Position:</span> <span className="text-foreground">{payslip.position}</span></div>
              <div><span className="text-muted-foreground">Status:</span> <span><StatusBadge status={payslip.status} /></span></div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              {/* Earnings */}
              <div className="border border-border rounded-xl p-3 bg-card space-y-1.5">
                <span className="font-bold text-emerald-600 uppercase tracking-wide block border-b border-border pb-1 text-[11px]">Earnings</span>
                <div className="flex justify-between"><span>Basic Pay</span><span className="font-mono">{fmt(payslip.basic_salary)}</span></div>
                <div className="flex justify-between"><span>Overtime Pay ({payslip.overtime_hours}h)</span><span className="font-mono">{fmt(payslip.overtime_pay)}</span></div>
                <div className="flex justify-between"><span>Allowance</span><span className="font-mono">{fmt(payslip.allowance)}</span></div>
                <div className="flex justify-between font-bold border-t border-border pt-1 text-foreground">
                  <span>Total Gross</span>
                  <span className="font-mono text-emerald-600">{fmt(payslip.gross_pay)}</span>
                </div>
              </div>

              {/* Deductions */}
              <div className="border border-border rounded-xl p-3 bg-card space-y-1.5">
                <span className="font-bold text-rose-600 uppercase tracking-wide block border-b border-border pb-1 text-[11px]">Statutory Deductions</span>
                {payslip.deductions?.length > 0 ? payslip.deductions.map(d => (
                  <div key={d.deduction_id} className="flex justify-between items-center p-0.5 rounded">
                    <span className="font-medium">{d.description || d.deduction_type}</span>
                    <span className="font-mono text-rose-600 font-bold">{fmt(d.amount)}</span>
                  </div>
                )) : (
                  <div className="text-muted-foreground italic text-center py-2">No deductions</div>
                )}
                <div className="flex justify-between font-bold border-t border-border pt-1 text-foreground">
                  <span>Total Deductions</span>
                  <span className="font-mono text-rose-600">{fmt(payslip.total_deductions)}</span>
                </div>
              </div>
            </div>

            <div className="border border-border p-3.5 rounded-xl flex justify-between items-center bg-muted/20">
              <span className="font-bold text-sm text-foreground">NET TAKE-HOME PAY</span>
              <span className="text-xl font-bold font-mono text-emerald-600">{fmt(payslip.net_pay)}</span>
            </div>

            <div className="flex justify-between items-center pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-border hover:bg-muted font-semibold cursor-pointer"
              >
                <FiPrinter className="w-3.5 h-3.5" />
                <span>Print Payslip</span>
              </button>
              <button
                type="button"
                onClick={() => setPayslip(null)}
                className="flex items-center gap-1 px-4 py-1.5 rounded-xl border border-border hover:bg-muted font-semibold cursor-pointer"
              >
                <FiX className="w-3.5 h-3.5" />
                <span>Close</span>
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
    </div>
  )
}
