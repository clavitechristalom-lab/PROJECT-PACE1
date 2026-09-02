import { useState, useEffect, useMemo } from 'react'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts'
import {
  FiBarChart2, FiFileText, FiDownload, FiPrinter, FiUsers,
  FiClock, FiShoppingCart, FiPackage, FiCreditCard,
  FiFilter, FiCalendar, FiCheckCircle, FiAlertTriangle, FiX,
  FiZap, FiTrendingDown, FiLayers, FiShield
} from 'react-icons/fi'
import {
  Btn, Badge, StatusBadge, PageHeader, StatCard, Card, CardHeader, Table, TR, TD,
  TabBar, showToast, LoadingState, ErrorAlert, TableSkeleton, EmptyState, StatSkeleton,
} from '../components/ui'
import { fmt, fmtDate } from '../lib/utils'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { TbCurrencyPeso } from 'react-icons/tb'

const COLORS = ['#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316']

export default function ReportsPage() {
  const { user } = useAuth()
  const isStoreAdmin = user?.role === 'Store Administrator' || user?.role === 'Store Admin'
  const isEmployee = user?.role === 'Employee'

  const [activeTab, setActiveTab] = useState(isEmployee ? 'attendance' : 'employees')
  const [reportData, setReportData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Reusable Filter States
  const [branch, setBranch] = useState(isStoreAdmin ? (user?.employee?.branch || 'Main Branch') : 'All')
  const [department, setDepartment] = useState('All')
  const [status, setStatus] = useState('All')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [periodId, setPeriodId] = useState('All')

  // Available options
  const [periods, setPeriods] = useState([])

  useEffect(() => {
    api.payroll.getPeriods()
      .then(res => {
        if (res?.periods) setPeriods(res.periods)
      })
      .catch(() => {})
  }, [])

  const loadReport = async (tab = activeTab) => {
    setLoading(true)
    setError('')
    setReportData(null)
    try {
      let data = null
      const params = {
        branch: branch !== 'All' ? branch : undefined,
        department: department !== 'All' ? department : undefined,
        status: status !== 'All' ? status : undefined,
        date_from: startDate || undefined,
        date_to: endDate || undefined,
        period_id: periodId !== 'All' ? periodId : undefined,
      }

      if (tab === 'employees') {
        data = await api.reports.getEmployees(params)
      } else if (tab === 'attendance') {
        data = await api.reports.getAttendance(params)
      } else if (tab === 'payroll') {
        data = await api.reports.getPayroll(params)
      } else if (tab === 'sales') {
        data = await api.reports.getSales(params)
      } else if (tab === 'inventory') {
        data = await api.reports.getInventory()
      } else if (tab === 'installments') {
        data = await api.reports.getInstallments()
      }

      setReportData(data)
    } catch (err) {
      console.error(`Failed to load ${tab} report:`, err)
      setError(err.message || `Failed to fetch ${tab} report from server`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadReport(activeTab)
  }, [activeTab])

  const handleApplyFilters = () => {
    loadReport(activeTab)
  }

  const handleResetFilters = () => {
    if (!isStoreAdmin) setBranch('All')
    setDepartment('All')
    setStatus('All')
    setStartDate('')
    setEndDate('')
    setPeriodId('All')
    setTimeout(() => loadReport(activeTab), 50)
  }

  const exportCSV = () => {
    if (!reportData) {
      showToast('No report data available to export', 'error')
      return
    }

    const escapeCSV = (val) => {
      if (val === null || val === undefined) return '""'
      const str = String(val).replace(/"/g, '""')
      return `"${str}"`
    }

    let csvRows = []
    const dateStr = new Date().toISOString().slice(0, 10)
    let fileName = `report_${activeTab}_${dateStr}.csv`

    if (activeTab === 'employees' && reportData.employees) {
      const headers = ['Employee Code', 'Full Name', 'Department', 'Position', 'Branch', 'Pay Type', 'Basic Salary (PHP)', 'Status', 'Verified']
      csvRows.push(headers.join(','))
      reportData.employees.forEach(e => {
        csvRows.push([
          escapeCSV(e.employee_code),
          escapeCSV(e.name),
          escapeCSV(e.department),
          escapeCSV(e.position),
          escapeCSV(e.branch),
          escapeCSV(e.pay_type),
          (e.basic_salary || 0).toFixed(2),
          escapeCSV(e.status),
          e.verified ? 'Yes' : 'No',
        ].join(','))
      })
    } else if (activeTab === 'attendance' && reportData.attendance) {
      const headers = ['Date', 'Employee Code', 'Full Name', 'Branch', 'Department', 'Time In', 'Time Out', 'Regular Hours', 'Overtime Hours', 'Total Hours', 'Status']
      csvRows.push(headers.join(','))
      reportData.attendance.forEach(a => {
        csvRows.push([
          escapeCSV(a.attendance_date),
          escapeCSV(a.employee_code),
          escapeCSV(a.employee_name),
          escapeCSV(a.branch),
          escapeCSV(a.department),
          escapeCSV(a.time_in || '—'),
          escapeCSV(a.time_out || '—'),
          (a.regular_hours || 0).toFixed(2),
          (a.overtime_hours || 0).toFixed(2),
          (a.total_hours || 0).toFixed(2),
          escapeCSV(a.status),
        ].join(','))
      })
    } else if (activeTab === 'payroll' && reportData.payrolls) {
      const headers = ['Payroll Period', 'Employee Code', 'Full Name', 'Department', 'Branch', 'Basic Salary (PHP)', 'Overtime Pay (PHP)', 'Allowances (PHP)', 'Gross Pay (PHP)', 'Deductions (PHP)', 'Net Pay (PHP)', 'Status']
      csvRows.push(headers.join(','))
      reportData.payrolls.forEach(p => {
        csvRows.push([
          escapeCSV(p.period_name),
          escapeCSV(p.employee_code),
          escapeCSV(p.employee_name),
          escapeCSV(p.department),
          escapeCSV(p.branch),
          (p.basic_salary || 0).toFixed(2),
          (p.overtime_pay || 0).toFixed(2),
          (p.allowance || 0).toFixed(2),
          (p.gross_pay || 0).toFixed(2),
          (p.total_deductions || 0).toFixed(2),
          (p.net_pay || 0).toFixed(2),
          escapeCSV(p.status),
        ].join(','))
      })
    } else if (activeTab === 'sales' && reportData.sales) {
      const headers = ['Invoice No', 'Date', 'Customer', 'Payment Method', 'Amount (PHP)', 'Status']
      csvRows.push(headers.join(','))
      reportData.sales.forEach(s => {
        csvRows.push([
          escapeCSV(s.invoice_no),
          escapeCSV(s.sale_date),
          escapeCSV(s.customer_name),
          escapeCSV(s.payment_method),
          (s.total_amount || 0).toFixed(2),
          escapeCSV(s.status),
        ].join(','))
      })
    } else if (activeTab === 'inventory' && reportData.products) {
      const headers = ['Code', 'Product Name', 'Category', 'Unit Price', 'Cost Price', 'Stock Qty', 'Valuation (PHP)']
      csvRows.push(headers.join(','))
      reportData.products.forEach(p => {
        csvRows.push([
          escapeCSV(p.product_code),
          escapeCSV(p.product_name),
          escapeCSV(p.category),
          (p.unit_price || 0).toFixed(2),
          (p.cost_price || 0).toFixed(2),
          p.stock_quantity,
          (p.total_value || (p.stock_quantity * p.unit_price) || 0).toFixed(2),
        ].join(','))
      })
    } else if (activeTab === 'installments' && reportData.accounts) {
      const headers = ['Account No', 'Customer', 'Total Payable', 'Paid', 'Balance', 'Status']
      csvRows.push(headers.join(','))
      reportData.accounts.forEach(a => {
        csvRows.push([
          escapeCSV(a.account_no),
          escapeCSV(a.customer_name),
          (a.total_payable || 0).toFixed(2),
          (a.paid || 0).toFixed(2),
          (a.balance || 0).toFixed(2),
          escapeCSV(a.status),
        ].join(','))
      })
    }

    const csvContent = '\uFEFF' + csvRows.join('\r\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute('download', fileName)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    showToast(`Exported ${activeTab.toUpperCase()} report as CSV file`, 'success')
  }

  const printReport = () => {
    window.print()
  }

  const tabs = [
    { id: 'employees', label: 'Employees Report', icon: <FiUsers className="w-3.5 h-3.5" /> },
    { id: 'attendance', label: 'Attendance Report', icon: <FiClock className="w-3.5 h-3.5" /> },
    { id: 'payroll', label: 'Payroll Report', icon: <TbCurrencyPeso className="w-3.5 h-3.5" /> },
    { id: 'sales', label: 'Sales & Revenue', icon: <FiShoppingCart className="w-3.5 h-3.5" /> },
    { id: 'inventory', label: 'Inventory Valuation', icon: <FiPackage className="w-3.5 h-3.5" /> },
    { id: 'installments', label: 'Installments & Aging', icon: <FiCreditCard className="w-3.5 h-3.5" /> },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports & Analytics Center"
        subtitle={
          isStoreAdmin 
            ? `Store Branch Reports (${user?.employee?.branch || 'Main Branch'})` 
            : isEmployee 
              ? 'Personal Attendance & Payroll Records' 
              : 'Organization-wide analytics and filtered database summaries'
        }
        action={
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={printReport}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-border bg-card hover:bg-muted font-semibold text-xs text-foreground cursor-pointer shadow-2xs transition-colors"
            >
              <FiPrinter className="w-4 h-4" />
              <span>Print / PDF</span>
            </button>
            <button
              onClick={exportCSV}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
            >
              <FiDownload className="w-4 h-4" />
              <span>Export CSV</span>
            </button>
          </div>
        }
      />

      {/* Tabs */}
      <TabBar
        tabs={tabs}
        activeTab={activeTab}
        onChange={tab => {
          setActiveTab(tab)
        }}
      />

      {/* Reusable Filters Toolbar */}
      <Card noPad className="p-3.5 border border-border space-y-3 print:hidden">
        <div className="flex items-center justify-between flex-wrap gap-2 border-b border-border pb-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Filter Parameters
          </span>
          <button onClick={handleResetFilters} className="text-xs text-muted-foreground hover:text-foreground cursor-pointer">
            Reset Filters
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          {/* Branch Filter */}
          <div>
            <label className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">Branch</label>
            <select
              value={branch}
              disabled={isStoreAdmin}
              onChange={e => setBranch(e.target.value)}
              className="w-full border border-border rounded-xl px-2.5 py-1.5 text-xs font-semibold bg-card text-foreground cursor-pointer disabled:opacity-70"
            >
              <option value="All">All Branches</option>
              <option value="Main Branch">Main Branch</option>
              <option value="North Branch">North Branch</option>
              <option value="South Branch">South Branch</option>
            </select>
          </div>

          {/* Department */}
          <div>
            <label className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">Department</label>
            <select
              value={department}
              onChange={e => setDepartment(e.target.value)}
              className="w-full border border-border rounded-xl px-2.5 py-1.5 text-xs font-semibold bg-card text-foreground cursor-pointer"
            >
              <option value="All">All Departments</option>
              <option value="Sales">Sales</option>
              <option value="Inventory">Inventory</option>
              <option value="Finance">Finance</option>
              <option value="HR">HR</option>
              <option value="IT">IT</option>
              <option value="Operations">Operations</option>
            </select>
          </div>

          {/* Status */}
          <div>
            <label className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">Status</label>
            <select
              value={status}
              onChange={e => setStatus(e.target.value)}
              className="w-full border border-border rounded-xl px-2.5 py-1.5 text-xs font-semibold bg-card text-foreground cursor-pointer"
            >
              <option value="All">All Statuses</option>
              {activeTab === 'employees' && (
                <>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </>
              )}
              {activeTab === 'attendance' && (
                <>
                  <option value="Present">Present</option>
                  <option value="Late">Late</option>
                  <option value="Absent">Absent</option>
                </>
              )}
              {activeTab === 'payroll' && (
                <>
                  <option value="Draft">Draft</option>
                  <option value="Approved">Approved</option>
                  <option value="Paid">Paid</option>
                </>
              )}
            </select>
          </div>

          {/* Payroll Period */}
          {activeTab === 'payroll' ? (
            <div>
              <label className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">Payroll Period</label>
              <select
                value={periodId}
                onChange={e => setPeriodId(e.target.value)}
                className="w-full border border-border rounded-xl px-2.5 py-1.5 text-xs font-semibold bg-card text-foreground cursor-pointer"
              >
                <option value="All">All Periods</option>
                {periods.map(p => (
                  <option key={p.period_id} value={p.period_id}>{p.period_name}</option>
                ))}
              </select>
            </div>
          ) : (
            <>
              <div>
                <label className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">Date From</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="w-full border border-border rounded-xl px-2 py-1.5 text-xs bg-card text-foreground font-mono"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">Date To</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  className="w-full border border-border rounded-xl px-2 py-1.5 text-xs bg-card text-foreground font-mono"
                />
              </div>
            </>
          )}

          <div className="flex items-end">
            <button
              onClick={handleApplyFilters}
              className="w-full flex items-center justify-center gap-1 px-3 py-1.5 bg-primary text-primary-foreground font-bold text-xs rounded-xl cursor-pointer"
            >
              <FiFilter className="w-3.5 h-3.5" />
              <span>Filter</span>
            </button>
          </div>
        </div>
      </Card>

      {error && <ErrorAlert message={error} onRetry={() => loadReport(activeTab)} />}

      {loading ? (
        <div className="space-y-4">
          <StatSkeleton count={4} />
          <TableSkeleton rows={5} cols={6} />
        </div>
      ) : reportData ? (
        <div className="space-y-5">
          {/* TAB 1: EMPLOYEES REPORT */}
          {activeTab === 'employees' && (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatCard title="Total Employees" value={reportData.total_employees?.toString() || '0'} sub="registered in system" icon={<FiUsers className="w-5 h-5" />} color="blue" />
                <StatCard title="Active" value={reportData.active_employees?.toString() || '0'} sub="on active payroll duty" icon={<FiCheckCircle className="w-5 h-5 text-emerald-500" />} color="green" />
                <StatCard title="Inactive" value={reportData.inactive_employees?.toString() || '0'} sub="separated / on-hold" icon={<FiX className="w-5 h-5 text-rose-500" />} color="red" />
                <StatCard title="Verified Accounts" value={reportData.verified_employees?.toString() || '0'} sub="admin-verified users" icon={<FiShield className="w-5 h-5 text-indigo-500" />} color="indigo" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card noPad className="p-3.5 border border-border">
                  <h4 className="font-bold text-xs text-foreground uppercase mb-3">Employees by Department</h4>
                  <div className="space-y-2">
                    {reportData.by_department?.map(d => (
                      <div key={d.department} className="flex justify-between items-center text-xs">
                        <span className="text-muted-foreground">{d.department}</span>
                        <span className="font-bold font-mono text-foreground px-2 py-0.5 bg-muted rounded-md">{d.count}</span>
                      </div>
                    ))}
                  </div>
                </Card>

                <Card noPad className="p-3.5 border border-border">
                  <h4 className="font-bold text-xs text-foreground uppercase mb-3">Employees by Branch</h4>
                  <div className="space-y-2">
                    {reportData.by_branch?.map(b => (
                      <div key={b.branch} className="flex justify-between items-center text-xs">
                        <span className="text-muted-foreground">{b.branch}</span>
                        <span className="font-bold font-mono text-foreground px-2 py-0.5 bg-muted rounded-md">{b.count}</span>
                      </div>
                    ))}
                  </div>
                </Card>

                <Card noPad className="p-3.5 border border-border">
                  <h4 className="font-bold text-xs text-foreground uppercase mb-3">Employees by Position</h4>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {reportData.by_position?.map(p => (
                      <div key={p.position} className="flex justify-between items-center text-xs">
                        <span className="text-muted-foreground">{p.position}</span>
                        <span className="font-bold font-mono text-foreground px-2 py-0.5 bg-muted rounded-md">{p.count}</span>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>

              {/* Employee Detail Table */}
              <Card noPad className="border border-border overflow-hidden">
                <div className="p-3.5 border-b border-border bg-muted/20">
                  <h4 className="font-bold text-xs text-foreground uppercase">Employee Directory & Salary Records</h4>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-muted/50 text-muted-foreground uppercase font-semibold text-[11px]">
                        <th className="py-3 px-4 text-left">Code</th>
                        <th className="py-3 px-4 text-left">Employee Name</th>
                        <th className="py-3 px-4 text-left">Department</th>
                        <th className="py-3 px-4 text-left">Position</th>
                        <th className="py-3 px-4 text-left">Branch</th>
                        <th className="py-3 px-4 text-left">Pay Type</th>
                        <th className="py-3 px-4 text-right">Basic Salary</th>
                        <th className="py-3 px-4 text-center">Status</th>
                        <th className="py-3 px-4 text-center">Verified</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {reportData.employees?.map((emp, i) => (
                        <tr key={emp.employee_id || i} className={`hover:bg-muted/40 transition-colors ${i % 2 === 1 ? 'bg-muted/10' : ''}`}>
                          <td className="py-3 px-4 font-mono font-bold text-foreground">{emp.employee_code}</td>
                          <td className="py-3 px-4 font-semibold text-foreground">{emp.name}</td>
                          <td className="py-3 px-4 text-muted-foreground">{emp.department || '—'}</td>
                          <td className="py-3 px-4 text-muted-foreground">{emp.position || '—'}</td>
                          <td className="py-3 px-4 text-muted-foreground">{emp.branch || '—'}</td>
                          <td className="py-3 px-4">{emp.pay_type || 'Monthly'}</td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-foreground">{fmt(emp.basic_salary)}</td>
                          <td className="py-3 px-4 text-center"><StatusBadge status={emp.status} /></td>
                          <td className="py-3 px-4 text-center">
                            <Badge
                              text={emp.verified ? 'Verified' : 'Unverified'}
                              variant={emp.verified ? 'success' : 'warning'}
                              icon={emp.verified ? <FiCheckCircle className="w-3 h-3" /> : <FiAlertTriangle className="w-3 h-3" />}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}

          {/* TAB 2: ATTENDANCE REPORT */}
          {activeTab === 'attendance' && (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatCard title="Total Present" value={reportData.present_count?.toString() || '0'} sub="on-time attendance logs" icon={<FiCheckCircle className="w-5 h-5 text-emerald-500" />} color="green" />
                <StatCard title="Late Clock-ins" value={reportData.late_count?.toString() || '0'} sub="after shift cutoff" icon={<FiClock className="w-5 h-5 text-amber-500" />} color="yellow" />
                <StatCard title="Absent Days" value={reportData.absent_count?.toString() || '0'} sub="unattended shifts" icon={<FiX className="w-5 h-5 text-rose-500" />} color="red" />
                <StatCard title="Overtime Hours" value={`${reportData.total_overtime || 0} hrs`} sub={`Total Hours: ${reportData.total_hours || 0} hrs`} icon={<FiZap className="w-5 h-5 text-purple-500" />} color="purple" />
              </div>

              {/* Detailed Attendance Records */}
              <Card noPad className="border border-border overflow-hidden">
                <div className="p-3.5 border-b border-border bg-muted/20">
                  <h4 className="font-bold text-xs text-foreground uppercase">Attendance Logs & Hours Breakdown</h4>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-muted/50 text-muted-foreground uppercase font-semibold text-[11px]">
                        <th className="py-3 px-4 text-left">Date</th>
                        <th className="py-3 px-4 text-left">Code</th>
                        <th className="py-3 px-4 text-left">Employee</th>
                        <th className="py-3 px-4 text-left">Branch</th>
                        <th className="py-3 px-4 text-left">Department</th>
                        <th className="py-3 px-4 text-left">Time In</th>
                        <th className="py-3 px-4 text-left">Time Out</th>
                        <th className="py-3 px-4 text-right">Reg Hours</th>
                        <th className="py-3 px-4 text-right">Overtime</th>
                        <th className="py-3 px-4 text-right">Total</th>
                        <th className="py-3 px-4 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {reportData.attendance?.map((a, i) => (
                        <tr key={a.attendance_id || i} className={`hover:bg-muted/40 transition-colors ${i % 2 === 1 ? 'bg-muted/10' : ''}`}>
                          <td className="py-3 px-4 font-mono text-muted-foreground">{a.attendance_date}</td>
                          <td className="py-3 px-4 font-mono font-bold text-foreground">{a.employee_code}</td>
                          <td className="py-3 px-4 font-semibold text-foreground">{a.employee_name}</td>
                          <td className="py-3 px-4 text-muted-foreground">{a.branch || '—'}</td>
                          <td className="py-3 px-4 text-muted-foreground">{a.department || '—'}</td>
                          <td className="py-3 px-4 font-mono">{a.time_in || '—'}</td>
                          <td className="py-3 px-4 font-mono">{a.time_out || '—'}</td>
                          <td className="py-3 px-4 text-right font-mono">{a.regular_hours}h</td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-amber-600">{a.overtime_hours}h</td>
                          <td className="py-3 px-4 text-right font-mono font-bold">{a.total_hours}h</td>
                          <td className="py-3 px-4 text-center"><StatusBadge status={a.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}

          {/* TAB 3: PAYROLL REPORT */}
          {activeTab === 'payroll' && (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatCard title="Gross Payroll" value={fmt(reportData.total_gross || 0)} sub="basic + allowances + OT" icon={<TbCurrencyPeso className="w-5 h-5" />} color="blue" />
                <StatCard title="Overtime Total" value={fmt(reportData.total_overtime || 0)} sub="paid overtime compensation" icon={<FiZap className="w-5 h-5 text-indigo-500" />} color="indigo" />
                <StatCard title="Total Deductions" value={fmt(reportData.total_deductions || 0)} sub="SSS, PhilHealth, Pag-IBIG" icon={<FiTrendingDown className="w-5 h-5 text-rose-500" />} color="red" />
                <StatCard title="Net Disbursed" value={fmt(reportData.total_net || 0)} sub={`${reportData.total_records || 0} employee payslips`} icon={<FiCreditCard className="w-5 h-5 text-emerald-500" />} color="green" />
              </div>

              <Card noPad className="border border-border overflow-hidden">
                <div className="p-3.5 border-b border-border bg-muted/20">
                  <h4 className="font-bold text-xs text-foreground uppercase">Payroll Records Breakdown</h4>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-muted/50 text-muted-foreground uppercase font-semibold text-[11px]">
                        <th className="py-3 px-4 text-left">Period</th>
                        <th className="py-3 px-4 text-left">Employee</th>
                        <th className="py-3 px-4 text-left">Department</th>
                        <th className="py-3 px-4 text-left">Branch</th>
                        <th className="py-3 px-4 text-right">Basic Pay</th>
                        <th className="py-3 px-4 text-right">Overtime Pay</th>
                        <th className="py-3 px-4 text-right">Allowances</th>
                        <th className="py-3 px-4 text-right">Gross Pay</th>
                        <th className="py-3 px-4 text-right">Deductions</th>
                        <th className="py-3 px-4 text-right">Net Pay</th>
                        <th className="py-3 px-4 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {reportData.payrolls?.map((p, i) => (
                        <tr key={p.payroll_id || i} className={`hover:bg-muted/40 transition-colors ${i % 2 === 1 ? 'bg-muted/10' : ''}`}>
                          <td className="py-3 px-4 font-mono font-semibold">{p.period_name}</td>
                          <td className="py-3 px-4 font-semibold text-foreground">{p.employee_name}</td>
                          <td className="py-3 px-4 text-muted-foreground">{p.department || '—'}</td>
                          <td className="py-3 px-4 text-muted-foreground">{p.branch || '—'}</td>
                          <td className="py-3 px-4 text-right font-mono">{fmt(p.basic_salary)}</td>
                          <td className="py-3 px-4 text-right font-mono text-amber-600">{fmt(p.overtime_pay)}</td>
                          <td className="py-3 px-4 text-right font-mono">{fmt(p.allowance)}</td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-foreground">{fmt(p.gross_pay)}</td>
                          <td className="py-3 px-4 text-right font-mono text-rose-600 font-semibold">-{fmt(p.total_deductions)}</td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-emerald-600">{fmt(p.net_pay)}</td>
                          <td className="py-3 px-4 text-center"><StatusBadge status={p.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}

          {/* TAB 4: SALES REPORT */}
          {activeTab === 'sales' && (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatCard title="Total Sales" value={fmt(reportData.total_sales || 0)} sub={`${reportData.sales?.length || 0} completed invoices`} icon={<FiShoppingCart className="w-5 h-5 text-emerald-500" />} color="green" />
                <StatCard title="Cash Sales" value={fmt(reportData.cash_sales || 0)} sub="full cash payments" icon={<TbCurrencyPeso className="w-5 h-5 text-blue-500" />} color="blue" />
                <StatCard title="Installments" value={fmt(reportData.installment_sales || 0)} sub="financed plan accounts" icon={<FiCreditCard className="w-5 h-5 text-purple-500" />} color="purple" />
                <StatCard title="Avg Ticket" value={fmt(reportData.avg_transaction || 0)} sub="average invoice value" icon={<FiBarChart2 className="w-5 h-5 text-amber-500" />} color="yellow" />
              </div>

              <Card noPad className="border border-border overflow-hidden">
                <div className="p-3.5 border-b border-border bg-muted/20">
                  <h4 className="font-bold text-xs text-foreground uppercase">Recent Sales Transactions</h4>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-muted/50 text-muted-foreground uppercase font-semibold text-[11px]">
                        <th className="py-3 px-4 text-left">Invoice No</th>
                        <th className="py-3 px-4 text-left">Date</th>
                        <th className="py-3 px-4 text-left">Customer</th>
                        <th className="py-3 px-4 text-left">Payment Method</th>
                        <th className="py-3 px-4 text-right">Total Amount</th>
                        <th className="py-3 px-4 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {reportData.sales?.map((s, i) => (
                        <tr key={s.sale_id || i} className={`hover:bg-muted/40 transition-colors ${i % 2 === 1 ? 'bg-muted/10' : ''}`}>
                          <td className="py-3 px-4 font-mono font-bold text-primary">{s.invoice_no}</td>
                          <td className="py-3 px-4 font-mono text-muted-foreground">{s.sale_date}</td>
                          <td className="py-3 px-4 font-semibold text-foreground">{s.customer_name}</td>
                          <td className="py-3 px-4">{s.payment_method}</td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-foreground">{fmt(s.total_amount)}</td>
                          <td className="py-3 px-4 text-center"><StatusBadge status={s.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}

          {/* TAB 5: INVENTORY REPORT */}
          {activeTab === 'inventory' && (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatCard title="Total Products" value={reportData.total_products?.toString() || '0'} sub="catalog items" icon={<FiPackage className="w-5 h-5" />} color="blue" />
                <StatCard title="Inventory Value" value={fmt(reportData.total_value || 0)} sub="total stock valuation" icon={<TbCurrencyPeso className="w-5 h-5 text-emerald-500" />} color="green" />
                <StatCard title="Low Stock Items" value={reportData.low_stock_count?.toString() || '0'} sub="at or below reorder level" icon={<FiAlertTriangle className="w-5 h-5 text-amber-500" />} color="yellow" />
                <StatCard title="Out of Stock" value={reportData.out_of_stock_count?.toString() || '0'} sub="needs immediate replenishment" icon={<FiX className="w-5 h-5 text-rose-500" />} color="red" />
              </div>

              <Card noPad className="border border-border overflow-hidden">
                <div className="p-3.5 border-b border-border bg-muted/20">
                  <h4 className="font-bold text-xs text-foreground uppercase">Product Stock & Valuation Directory</h4>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-muted/50 text-muted-foreground uppercase font-semibold text-[11px]">
                        <th className="py-3 px-4 text-left">SKU Code</th>
                        <th className="py-3 px-4 text-left">Product Name</th>
                        <th className="py-3 px-4 text-left">Category</th>
                        <th className="py-3 px-4 text-right">Unit Price</th>
                        <th className="py-3 px-4 text-center">Stock Qty</th>
                        <th className="py-3 px-4 text-right">Total Valuation</th>
                        <th className="py-3 px-4 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {reportData.products?.map((p, i) => (
                        <tr key={p.product_id || i} className={`hover:bg-muted/40 transition-colors ${i % 2 === 1 ? 'bg-muted/10' : ''}`}>
                          <td className="py-3 px-4 font-mono font-bold text-foreground">{p.product_code}</td>
                          <td className="py-3 px-4 font-semibold text-foreground">{p.product_name}</td>
                          <td className="py-3 px-4"><Badge text={p.category} variant="neutral" /></td>
                          <td className="py-3 px-4 text-right font-mono">{fmt(p.unit_price)}</td>
                          <td className="py-3 px-4 text-center font-mono font-bold">{p.stock_quantity}</td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-emerald-600">{fmt((p.unit_price || 0) * (p.stock_quantity || 0))}</td>
                          <td className="py-3 px-4 text-center">
                            <StatusBadge status={p.stock_quantity <= 0 ? 'Out of Stock' : p.stock_quantity <= p.reorder_level ? 'Low Stock' : 'In Stock'} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}

          {/* TAB 6: INSTALLMENTS REPORT */}
          {activeTab === 'installments' && (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatCard title="Active Accounts" value={reportData.active_accounts?.toString() || '0'} sub="open installment plans" icon={<FiCreditCard className="w-5 h-5" />} color="blue" />
                <StatCard title="Overdue Accounts" value={reportData.overdue_accounts?.toString() || '0'} sub="past due schedule" icon={<FiAlertTriangle className="w-5 h-5 text-rose-500" />} color="red" />
                <StatCard title="Completed Accounts" value={reportData.completed_accounts?.toString() || '0'} sub="fully paid accounts" icon={<FiCheckCircle className="w-5 h-5 text-emerald-500" />} color="green" />
                <StatCard title="Outstanding Balance" value={fmt(reportData.total_balance || 0)} sub="uncollected receivables" icon={<TbCurrencyPeso className="w-5 h-5 text-purple-500" />} color="purple" />
              </div>

              <Card noPad className="border border-border overflow-hidden">
                <div className="p-3.5 border-b border-border bg-muted/20">
                  <h4 className="font-bold text-xs text-foreground uppercase">Installment Receivables Directory</h4>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-muted/50 text-muted-foreground uppercase font-semibold text-[11px]">
                        <th className="py-3 px-4 text-left">Account No</th>
                        <th className="py-3 px-4 text-left">Customer Name</th>
                        <th className="py-3 px-4 text-left">Frequency</th>
                        <th className="py-3 px-4 text-right">Total Payable</th>
                        <th className="py-3 px-4 text-right">Paid to Date</th>
                        <th className="py-3 px-4 text-right">Balance Due</th>
                        <th className="py-3 px-4 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {reportData.accounts?.map((a, i) => (
                        <tr key={a.installment_id || i} className={`hover:bg-muted/40 transition-colors ${i % 2 === 1 ? 'bg-muted/10' : ''}`}>
                          <td className="py-3 px-4 font-mono font-bold text-primary">{a.account_no}</td>
                          <td className="py-3 px-4 font-semibold text-foreground">{a.customer_name}</td>
                          <td className="py-3 px-4 text-muted-foreground">{a.frequency || 'Monthly'}</td>
                          <td className="py-3 px-4 text-right font-mono">{fmt(a.total_payable)}</td>
                          <td className="py-3 px-4 text-right font-mono text-emerald-600">{fmt(a.paid)}</td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-rose-600">{fmt(a.balance)}</td>
                          <td className="py-3 px-4 text-center"><StatusBadge status={a.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}
        </div>
      ) : (
        <EmptyState
          icon={<FiBarChart2 className="w-12 h-12 text-muted-foreground/30 mx-auto" />}
          title="No report data generated"
          description="Adjust your search criteria and click 'Filter' to generate report."
        />
      )}
    </div>
  )
}
