import { fmt, fmtDate } from '../../lib/utils'

function formatClockTime(val) {
  if (!val || val === '—') return '—'
  const match = String(val).trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
  if (!match) return String(val)
  const h = Number(match[1])
  const m = match[2]
  if (Number.isNaN(h)) return String(val)
  const suffix = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${String(h12).padStart(2, '0')}:${m} ${suffix}`
}

function getStockStatus(qty) {
  const n = Number(qty || 0)
  if (n <= 0) return 'Out of Stock'
  if (n === 1) return 'Low Stock'
  if (n <= 4) return 'Medium Stock'
  return 'High Stock'
}

function SectionHeading({ number, title, badgeText }) {
  return (
    <div
      className="print-avoid-break print-exact flex items-center justify-between px-3 py-1.5 text-white border border-[#1e3a5f]"
      style={{ backgroundColor: '#1e3a5f' }}
    >
      <h2 className="text-[11px] font-bold uppercase tracking-wider m-0">
        {number}. {title}
      </h2>
      <span className="text-[10px] font-semibold font-mono bg-white/15 px-2 py-0.5 rounded">
        {badgeText}
      </span>
    </div>
  )
}

function MetricsStrip({ items }) {
  return (
    <div className="print-avoid-break grid grid-cols-2 sm:grid-cols-4 border-x border-b border-slate-300 bg-slate-50 print-exact divide-x divide-slate-200">
      {items.map((item) => (
        <div key={item.label} className="px-2.5 py-1.5">
          <div className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
            {item.label}
          </div>
          <div className="text-[11px] font-bold font-mono text-slate-900">
            {item.value}
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * Dedicated Print / PDF view for Reports & Analytics Center.
 * Renders an official list-style contents summary plus full detailed lists
 * across active report modules (omitting Payroll Report when hidePayroll is true).
 */
export default function ReportsPrintView({
  printData = {},
  filters = {},
  user = null,
  companySettings = null,
  periods = [],
  hidePayroll = false,
}) {
  const employeesData = printData.employees || {}
  const attendanceData = printData.attendance || {}
  const payrollData = printData.payroll || {}
  const salesData = printData.sales || {}
  const inventoryData = printData.inventory || {}
  const installmentsData = printData.installments || {}

  const employees = employeesData.employees || []
  const attendance = attendanceData.attendance || []
  const payrolls = payrollData.payrolls || []
  const sales = salesData.sales || []
  const products = inventoryData.products || []
  const accounts = installmentsData.accounts || []

  const totalUnits = products.reduce((sum, p) => sum + Number(p.stock_quantity || 0), 0)
  const totalEmpSalaryBase = employees.reduce((sum, e) => sum + Number(e.basic_salary || 0), 0)
  const totalAttRegHours = attendance.reduce((sum, a) => sum + Number(a.regular_hours || 0), 0)
  const totalInstPayable = accounts.reduce((sum, a) => sum + Number(a.total_payable || 0), 0)
  const totalInstPaid = accounts.reduce((sum, a) => sum + Number(a.paid || 0), 0)
  const totalInstBalance = accounts.reduce((sum, a) => sum + Number(a.balance || 0), 0)

  const inventoryCategories = Object.values(
    products.reduce((acc, p) => {
      const cat = p.category || 'Uncategorized'
      if (!acc[cat]) {
        acc[cat] = { category: cat, count: 0, units: 0, valuation: 0 }
      }
      const qty = Number(p.stock_quantity || 0)
      const val = Number(p.unit_price || 0) * qty
      acc[cat].count += 1
      acc[cat].units += qty
      acc[cat].valuation += val
      return acc
    }, {})
  )

  const companyName = companySettings?.company_name || 'Z-LICZ Furniture & Appliances Trading'
  const companySub = [companySettings?.address, companySettings?.phone, companySettings?.email]
    .filter(Boolean)
    .join(' • ')

  const periodLabel =
    filters.periodId && filters.periodId !== 'All'
      ? periods.find((p) => String(p.period_id) === String(filters.periodId))?.period_name || `Period #${filters.periodId}`
      : 'All Periods'

  const dateRangeLabel =
    filters.startDate || filters.endDate
      ? `${filters.startDate || 'Start'} to ${filters.endDate || 'Present'}`
      : 'All Dates'

  const generatedAt = new Date().toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  const generatedBy = user?.employee
    ? `${user.employee.first_name || ''} ${user.employee.last_name || ''}`.trim() || user?.username || 'System User'
    : user?.username || 'System User'

  const baseContents = [
    {
      key: 'employees',
      title: 'Employees Report',
      summary: `${employeesData.total_employees ?? employees.length} Registered • ${employeesData.active_employees ?? 0} Active • ${employeesData.inactive_employees ?? 0} Inactive • ${employeesData.verified_employees ?? 0} Verified`,
      metric: `${employeesData.total_employees ?? employees.length} Employees`,
    },
    {
      key: 'attendance',
      title: 'Attendance Report',
      summary: `${attendanceData.total_records ?? attendance.length} Logs • Present: ${attendanceData.present_count ?? 0} • Late: ${attendanceData.late_count ?? 0} • Half Day: ${attendanceData.half_day_count ?? 0} • Absent: ${attendanceData.absent_count ?? 0}`,
      metric: `${Number(attendanceData.total_hours || 0).toFixed(2)} hrs`,
    },
    ...(!hidePayroll
      ? [
          {
            key: 'payroll',
            title: 'Payroll Report',
            summary: `${payrollData.total_records ?? payrolls.length} Payslips • Gross: ${fmt(payrollData.total_gross || 0)} • Deductions: -${fmt(payrollData.total_deductions || 0)}`,
            metric: fmt(payrollData.total_net || 0),
          },
        ]
      : []),
    {
      key: 'sales',
      title: 'Sales & Revenue',
      summary: `${sales.length} Invoices • Cash: ${fmt(salesData.cash_sales || 0)} • Installment: ${fmt(salesData.installment_sales || 0)}`,
      metric: fmt(salesData.total_sales || 0),
    },
    {
      key: 'inventory',
      title: 'Inventory Valuation',
      summary: `${inventoryData.total_products ?? products.length} Products • ${totalUnits} Units • Low Stock: ${inventoryData.low_stock_count ?? 0} • Out of Stock: ${inventoryData.out_of_stock_count ?? 0}`,
      metric: fmt(inventoryData.total_value || 0),
    },
    {
      key: 'installments',
      title: 'Installments & Aging',
      summary: `${accounts.length} Accounts • Active: ${installmentsData.active_accounts ?? 0} • Overdue: ${installmentsData.overdue_accounts ?? 0} • Completed: ${installmentsData.completed_accounts ?? 0}`,
      metric: fmt(installmentsData.total_balance || 0),
    },
  ]

  const contentsRows = baseContents.map((row, index) => ({
    ...row,
    num: index + 1,
  }))

  const sectionNumberMap = contentsRows.reduce((acc, row) => {
    acc[row.key] = row.num
    return acc
  }, {})

  return (
    <div className="reports-print-document w-full bg-white text-slate-900 font-sans text-[11px] leading-snug space-y-5">
      {/* OFFICIAL HEADER & DOCUMENT METADATA */}
      <div className="border-b-2 border-[#1e3a5f] pb-3 flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
            {companyName}
          </p>
          <h1
            className="text-2xl font-bold tracking-tight mt-0.5 font-serif"
            style={{ color: '#1e3a5f' }}
          >
            Reports &amp; Analytics Center — Detailed Report
          </h1>
          <p className="text-[11px] text-slate-600 mt-0.5">
            {hidePayroll
              ? 'Comprehensive Branch Operational, Workforce, Sales, Inventory & Receivables List'
              : 'Comprehensive Operational, Workforce, Payroll, Sales, Inventory & Receivables List'}
          </p>
          {companySub && (
            <p className="text-[10px] text-slate-500 mt-1">{companySub}</p>
          )}
        </div>

        <table className="text-[10px] border-collapse border border-slate-300 shrink-0 min-w-[260px]">
          <tbody>
            <tr>
              <td className="px-2.5 py-1 border border-slate-300 bg-slate-50 print-exact font-bold text-slate-600 uppercase">
                Generated
              </td>
              <td className="px-2.5 py-1 border border-slate-300 font-mono text-slate-900">
                {generatedAt}
              </td>
            </tr>
            <tr>
              <td className="px-2.5 py-1 border border-slate-300 bg-slate-50 print-exact font-bold text-slate-600 uppercase">
                Prepared By
              </td>
              <td className="px-2.5 py-1 border border-slate-300 text-slate-900 font-semibold">
                {generatedBy} ({user?.role || 'User'})
              </td>
            </tr>
            <tr>
              <td className="px-2.5 py-1 border border-slate-300 bg-slate-50 print-exact font-bold text-slate-600 uppercase">
                Scope / Filters
              </td>
              <td className="px-2.5 py-1 border border-slate-300 text-slate-800">
                Branch: <strong>{filters.branch || 'All'}</strong> • Dept: <strong>{filters.department || 'All'}</strong> • Status: <strong>{filters.status || 'All'}</strong>
              </td>
            </tr>
            <tr>
              <td className="px-2.5 py-1 border border-slate-300 bg-slate-50 print-exact font-bold text-slate-600 uppercase">
                {hidePayroll ? 'Date Range' : 'Dates / Period'}
              </td>
              <td className="px-2.5 py-1 border border-slate-300 text-slate-800">
                {hidePayroll ? dateRangeLabel : `${dateRangeLabel} • ${periodLabel}`}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* CONTENTS / REPORT INDEX LIST */}
      <div className="print-avoid-break border border-slate-300">
        <div
          className="print-exact px-3 py-1.5 text-white text-[11px] font-bold uppercase tracking-wider"
          style={{ backgroundColor: '#1e3a5f' }}
        >
          Report Contents &amp; Executive List Summary
        </div>
        <ol className="divide-y divide-slate-200 m-0 p-0 list-none">
          {contentsRows.map((row) => (
            <li
              key={row.key}
              className="flex items-center justify-between gap-4 px-3 py-1.5 bg-white"
            >
              <div className="min-w-0">
                <span className="font-bold text-[#1e3a5f] mr-1.5">{row.num}.</span>
                <span className="font-bold text-slate-900">{row.title}</span>
                <span className="text-slate-500 text-[10px] ml-2">— {row.summary}</span>
              </div>
              <div className="font-mono font-bold text-slate-900 text-[11px] shrink-0">
                {row.metric}
              </div>
            </li>
          ))}
        </ol>
      </div>

      {/* SECTION 1: EMPLOYEES REPORT */}
      <section className="space-y-0">
        <SectionHeading
          number={sectionNumberMap.employees}
          title="Employees Report"
          badgeText={`${employees.length} Record${employees.length === 1 ? '' : 's'}`}
        />
        <MetricsStrip
          items={[
            { label: 'Total Employees', value: employeesData.total_employees ?? employees.length },
            { label: 'Active / Inactive', value: `${employeesData.active_employees ?? 0} / ${employeesData.inactive_employees ?? 0}` },
            { label: 'Verified Accounts', value: `${employeesData.verified_employees ?? 0} Verified` },
            { label: 'Combined Monthly Base', value: fmt(totalEmpSalaryBase) },
          ]}
        />

        {(employeesData.by_department?.length > 0 ||
          employeesData.by_branch?.length > 0 ||
          employeesData.by_position?.length > 0) && (
          <div className="print-avoid-break grid grid-cols-3 border-x border-b border-slate-300 divide-x divide-slate-300 bg-white text-[10px]">
            <div className="p-2">
              <div className="font-bold uppercase text-slate-600 text-[9px] mb-1">
                By Department
              </div>
              <ul className="space-y-0.5 m-0 p-0 list-none">
                {(employeesData.by_department || []).map((d) => (
                  <li key={d.department} className="flex justify-between">
                    <span className="text-slate-700">{d.department}</span>
                    <span className="font-mono font-bold">{d.count}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="p-2">
              <div className="font-bold uppercase text-slate-600 text-[9px] mb-1">
                By Branch
              </div>
              <ul className="space-y-0.5 m-0 p-0 list-none">
                {(employeesData.by_branch || []).map((b) => (
                  <li key={b.branch} className="flex justify-between">
                    <span className="text-slate-700">{b.branch}</span>
                    <span className="font-mono font-bold">{b.count}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="p-2">
              <div className="font-bold uppercase text-slate-600 text-[9px] mb-1">
                By Position
              </div>
              <ul className="space-y-0.5 m-0 p-0 list-none">
                {(employeesData.by_position || []).map((p) => (
                  <li key={p.position} className="flex justify-between">
                    <span className="text-slate-700">{p.position}</span>
                    <span className="font-mono font-bold">{p.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <table className="w-full text-[9.5px] border-x border-b border-slate-300">
          <thead>
            <tr className="bg-slate-100 print-exact border-b border-slate-300 text-slate-700 uppercase font-bold text-[8.5px]">
              <th className="py-1.5 px-1.5 text-center border-r border-slate-200 w-6">#</th>
              <th className="py-1.5 px-1.5 text-left border-r border-slate-200">Code</th>
              <th className="py-1.5 px-1.5 text-left border-r border-slate-200">Employee Name</th>
              <th className="py-1.5 px-1.5 text-left border-r border-slate-200">Department</th>
              <th className="py-1.5 px-1.5 text-left border-r border-slate-200">Position</th>
              <th className="py-1.5 px-1.5 text-left border-r border-slate-200">Branch</th>
              <th className="py-1.5 px-1.5 text-left border-r border-slate-200">Pay Type</th>
              <th className="py-1.5 px-1.5 text-right border-r border-slate-200">Basic Salary</th>
              <th className="py-1.5 px-1.5 text-center border-r border-slate-200">Hire Date</th>
              <th className="py-1.5 px-1.5 text-center border-r border-slate-200">Verified</th>
              <th className="py-1.5 px-1.5 text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {employees.length > 0 ? (
              employees.map((emp, idx) => (
                <tr key={emp.employee_id || idx} className={idx % 2 === 1 ? 'bg-slate-50/70 print-exact' : ''}>
                  <td className="py-1 px-1.5 text-center font-mono text-slate-500 border-r border-slate-200">{idx + 1}</td>
                  <td className="py-1 px-1.5 font-mono font-bold border-r border-slate-200 whitespace-nowrap">{emp.employee_code}</td>
                  <td className="py-1 px-1.5 font-semibold border-r border-slate-200">{emp.name}</td>
                  <td className="py-1 px-1.5 border-r border-slate-200">{emp.department || '—'}</td>
                  <td className="py-1 px-1.5 border-r border-slate-200">{emp.position || '—'}</td>
                  <td className="py-1 px-1.5 border-r border-slate-200">{emp.branch || '—'}</td>
                  <td className="py-1 px-1.5 border-r border-slate-200">{emp.pay_type || 'Monthly'}</td>
                  <td className="py-1 px-1.5 text-right font-mono font-semibold border-r border-slate-200 whitespace-nowrap">{fmt(emp.basic_salary)}</td>
                  <td className="py-1 px-1.5 text-center font-mono border-r border-slate-200 whitespace-nowrap">{emp.hire_date ? fmtDate(emp.hire_date) : '—'}</td>
                  <td className="py-1 px-1.5 text-center border-r border-slate-200">{emp.verified ? 'Verified' : 'Unverified'}</td>
                  <td className="py-1 px-1.5 text-center font-semibold">{emp.status || '—'}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={11} className="py-3 px-3 text-center italic text-slate-500">
                  No employee records found matching the selected filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {/* SECTION 2: ATTENDANCE REPORT */}
      <section className="space-y-0">
        <SectionHeading
          number={sectionNumberMap.attendance}
          title="Attendance Report"
          badgeText={`${attendance.length} Log${attendance.length === 1 ? '' : 's'}`}
        />
        <MetricsStrip
          items={[
            { label: 'Present / Late', value: `${attendanceData.present_count ?? 0} Present / ${attendanceData.late_count ?? 0} Late` },
            { label: 'Half Day / Absent', value: `${attendanceData.half_day_count ?? 0} Half Day / ${attendanceData.absent_count ?? 0} Absent` },
            { label: 'Regular / OT Hours', value: `${totalAttRegHours.toFixed(2)}h Reg / ${Number(attendanceData.total_overtime || 0).toFixed(2)}h OT` },
            { label: 'Total Rendered Hours', value: `${Number(attendanceData.total_hours || 0).toFixed(2)} hrs` },
          ]}
        />
        <table className="w-full text-[9.5px] border-x border-b border-slate-300">
          <thead>
            <tr className="bg-slate-100 print-exact border-b border-slate-300 text-slate-700 uppercase font-bold text-[8.5px]">
              <th className="py-1.5 px-1.5 text-center border-r border-slate-200 w-6">#</th>
              <th className="py-1.5 px-1.5 text-left border-r border-slate-200">Date</th>
              <th className="py-1.5 px-1.5 text-left border-r border-slate-200">Code</th>
              <th className="py-1.5 px-1.5 text-left border-r border-slate-200">Employee Name</th>
              <th className="py-1.5 px-1.5 text-left border-r border-slate-200">Branch / Dept</th>
              <th className="py-1.5 px-1.5 text-center border-r border-slate-200">Time In</th>
              <th className="py-1.5 px-1.5 text-center border-r border-slate-200">Time Out</th>
              <th className="py-1.5 px-1.5 text-right border-r border-slate-200">Reg Hrs</th>
              <th className="py-1.5 px-1.5 text-right border-r border-slate-200">OT</th>
              <th className="py-1.5 px-1.5 text-right border-r border-slate-200">Total</th>
              <th className="py-1.5 px-1.5 text-left border-r border-slate-200">Verification</th>
              <th className="py-1.5 px-1.5 text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {attendance.length > 0 ? (
              attendance.map((a, idx) => (
                <tr key={a.attendance_id || idx} className={idx % 2 === 1 ? 'bg-slate-50/70 print-exact' : ''}>
                  <td className="py-1 px-1.5 text-center font-mono text-slate-500 border-r border-slate-200">{idx + 1}</td>
                  <td className="py-1 px-1.5 font-mono border-r border-slate-200 whitespace-nowrap">{a.attendance_date}</td>
                  <td className="py-1 px-1.5 font-mono font-bold border-r border-slate-200 whitespace-nowrap">{a.employee_code}</td>
                  <td className="py-1 px-1.5 font-semibold border-r border-slate-200">{a.employee_name}</td>
                  <td className="py-1 px-1.5 border-r border-slate-200">
                    {[a.branch, a.department].filter(Boolean).join(' • ') || '—'}
                  </td>
                  <td className="py-1 px-1.5 text-center font-mono border-r border-slate-200 whitespace-nowrap">{formatClockTime(a.time_in)}</td>
                  <td className="py-1 px-1.5 text-center font-mono border-r border-slate-200 whitespace-nowrap">{formatClockTime(a.time_out)}</td>
                  <td className="py-1 px-1.5 text-right font-mono border-r border-slate-200">{Number(a.regular_hours || 0).toFixed(2)}h</td>
                  <td className="py-1 px-1.5 text-right font-mono border-r border-slate-200">{Number(a.overtime_hours || 0).toFixed(2)}h</td>
                  <td className="py-1 px-1.5 text-right font-mono font-bold border-r border-slate-200">{Number(a.total_hours || 0).toFixed(2)}h</td>
                  <td className="py-1 px-1.5 border-r border-slate-200">{a.verification_method || '—'}</td>
                  <td className="py-1 px-1.5 text-center font-semibold">{a.status || '—'}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={12} className="py-3 px-3 text-center italic text-slate-500">
                  No attendance logs found matching the selected filters.
                </td>
              </tr>
            )}
          </tbody>
          {attendance.length > 0 && (
            <tfoot>
              <tr className="bg-slate-100 print-exact border-t border-slate-300 font-bold text-[9.5px]">
                <td colSpan={7} className="py-1.5 px-1.5 text-right uppercase text-slate-700 border-r border-slate-200">
                  Totals ({attendance.length} Records)
                </td>
                <td className="py-1.5 px-1.5 text-right font-mono border-r border-slate-200">{totalAttRegHours.toFixed(2)}h</td>
                <td className="py-1.5 px-1.5 text-right font-mono border-r border-slate-200">{Number(attendanceData.total_overtime || 0).toFixed(2)}h</td>
                <td className="py-1.5 px-1.5 text-right font-mono border-r border-slate-200">{Number(attendanceData.total_hours || 0).toFixed(2)}h</td>
                <td colSpan={2} className="py-1.5 px-1.5"></td>
              </tr>
            </tfoot>
          )}
        </table>
      </section>

      {/* SECTION 3: PAYROLL REPORT (Administrator only — hidden for Store Admin) */}
      {!hidePayroll && (
        <section className="space-y-0">
          <SectionHeading
            number={sectionNumberMap.payroll}
            title="Payroll Report"
            badgeText={`${payrolls.length} Payslip${payrolls.length === 1 ? '' : 's'}`}
          />
          <MetricsStrip
            items={[
              { label: 'Total Basic Pay', value: fmt(payrollData.total_basic || 0) },
              { label: 'Allowances / OT', value: `${fmt(payrollData.total_allowance || 0)} / ${fmt(payrollData.total_overtime || 0)}` },
              { label: 'Gross / Deductions', value: `${fmt(payrollData.total_gross || 0)} / -${fmt(payrollData.total_deductions || 0)}` },
              { label: 'Net Disbursed', value: fmt(payrollData.total_net || 0) },
            ]}
          />
          <table className="w-full text-[9.5px] border-x border-b border-slate-300">
            <thead>
              <tr className="bg-slate-100 print-exact border-b border-slate-300 text-slate-700 uppercase font-bold text-[8.5px]">
                <th className="py-1.5 px-1.5 text-center border-r border-slate-200 w-6">#</th>
                <th className="py-1.5 px-1.5 text-left border-r border-slate-200">Payroll Period</th>
                <th className="py-1.5 px-1.5 text-left border-r border-slate-200">Employee</th>
                <th className="py-1.5 px-1.5 text-left border-r border-slate-200">Branch / Dept</th>
                <th className="py-1.5 px-1.5 text-right border-r border-slate-200">Basic Pay</th>
                <th className="py-1.5 px-1.5 text-right border-r border-slate-200">OT Pay</th>
                <th className="py-1.5 px-1.5 text-right border-r border-slate-200">Allowances</th>
                <th className="py-1.5 px-1.5 text-right border-r border-slate-200">Gross Pay</th>
                <th className="py-1.5 px-1.5 text-right border-r border-slate-200">Deductions</th>
                <th className="py-1.5 px-1.5 text-right border-r border-slate-200">Net Pay</th>
                <th className="py-1.5 px-1.5 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {payrolls.length > 0 ? (
                payrolls.map((p, idx) => (
                  <tr key={p.payroll_id || idx} className={idx % 2 === 1 ? 'bg-slate-50/70 print-exact' : ''}>
                    <td className="py-1 px-1.5 text-center font-mono text-slate-500 border-r border-slate-200">{idx + 1}</td>
                    <td className="py-1 px-1.5 font-mono text-[9px] border-r border-slate-200">{p.period_name}</td>
                    <td className="py-1 px-1.5 border-r border-slate-200">
                      <span className="font-semibold">{p.employee_name}</span>
                      {p.employee_code ? <span className="text-slate-500 font-mono text-[8.5px] ml-1">({p.employee_code})</span> : null}
                    </td>
                    <td className="py-1 px-1.5 border-r border-slate-200">
                      {[p.branch, p.department].filter(Boolean).join(' • ') || '—'}
                    </td>
                    <td className="py-1 px-1.5 text-right font-mono border-r border-slate-200 whitespace-nowrap">{fmt(p.basic_salary)}</td>
                    <td className="py-1 px-1.5 text-right font-mono border-r border-slate-200 whitespace-nowrap">{fmt(p.overtime_pay)}</td>
                    <td className="py-1 px-1.5 text-right font-mono border-r border-slate-200 whitespace-nowrap">{fmt(p.allowance)}</td>
                    <td className="py-1 px-1.5 text-right font-mono font-semibold border-r border-slate-200 whitespace-nowrap">{fmt(p.gross_pay)}</td>
                    <td className="py-1 px-1.5 text-right font-mono text-rose-700 border-r border-slate-200 whitespace-nowrap">-{fmt(p.total_deductions)}</td>
                    <td className="py-1 px-1.5 text-right font-mono font-bold border-r border-slate-200 whitespace-nowrap">{fmt(p.net_pay)}</td>
                    <td className="py-1 px-1.5 text-center font-semibold">{p.status || '—'}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={11} className="py-3 px-3 text-center italic text-slate-500">
                    No payroll records found matching the selected filters.
                  </td>
                </tr>
              )}
            </tbody>
            {payrolls.length > 0 && (
              <tfoot>
                <tr className="bg-slate-100 print-exact border-t border-slate-300 font-bold text-[9.5px]">
                  <td colSpan={4} className="py-1.5 px-1.5 text-right uppercase text-slate-700 border-r border-slate-200">
                    Totals ({payrolls.length} Payslips)
                  </td>
                  <td className="py-1.5 px-1.5 text-right font-mono border-r border-slate-200 whitespace-nowrap">{fmt(payrollData.total_basic || 0)}</td>
                  <td className="py-1.5 px-1.5 text-right font-mono border-r border-slate-200 whitespace-nowrap">{fmt(payrollData.total_overtime || 0)}</td>
                  <td className="py-1.5 px-1.5 text-right font-mono border-r border-slate-200 whitespace-nowrap">{fmt(payrollData.total_allowance || 0)}</td>
                  <td className="py-1.5 px-1.5 text-right font-mono border-r border-slate-200 whitespace-nowrap">{fmt(payrollData.total_gross || 0)}</td>
                  <td className="py-1.5 px-1.5 text-right font-mono text-rose-700 border-r border-slate-200 whitespace-nowrap">-{fmt(payrollData.total_deductions || 0)}</td>
                  <td className="py-1.5 px-1.5 text-right font-mono border-r border-slate-200 whitespace-nowrap">{fmt(payrollData.total_net || 0)}</td>
                  <td className="py-1.5 px-1.5"></td>
                </tr>
              </tfoot>
            )}
          </table>
        </section>
      )}

      {/* SALES & REVENUE */}
      <section className="space-y-0">
        <SectionHeading
          number={sectionNumberMap.sales}
          title="Sales & Revenue"
          badgeText={`${sales.length} Invoice${sales.length === 1 ? '' : 's'}`}
        />
        <MetricsStrip
          items={[
            { label: 'Total Sales Revenue', value: fmt(salesData.total_sales || 0) },
            { label: 'Cash Sales', value: fmt(salesData.cash_sales || 0) },
            { label: 'Installment Sales', value: fmt(salesData.installment_sales || 0) },
            { label: 'Avg Ticket Size', value: fmt(salesData.avg_transaction || 0) },
          ]}
        />

        {salesData.trend?.length > 0 && (
          <div className="print-avoid-break border-x border-b border-slate-300 bg-white px-3 py-1.5 text-[10px]">
            <span className="font-bold uppercase text-slate-600 text-[9px] mr-2">Monthly Summary:</span>
            {salesData.trend.map((t, i) => (
              <span key={t.month || i} className="inline-block mr-3">
                <strong>{t.month}</strong>: {t.transactions} tx ({fmt(t.sales)})
              </span>
            ))}
          </div>
        )}

        <table className="w-full text-[10px] border-x border-b border-slate-300">
          <thead>
            <tr className="bg-slate-100 print-exact border-b border-slate-300 text-slate-700 uppercase font-bold text-[9px]">
              <th className="py-1.5 px-2 text-center border-r border-slate-200 w-7">#</th>
              <th className="py-1.5 px-2 text-left border-r border-slate-200">Invoice No</th>
              <th className="py-1.5 px-2 text-left border-r border-slate-200">Sale Date</th>
              <th className="py-1.5 px-2 text-left border-r border-slate-200">Customer Name</th>
              <th className="py-1.5 px-2 text-left border-r border-slate-200">Payment Method</th>
              <th className="py-1.5 px-2 text-right border-r border-slate-200">Total Amount</th>
              <th className="py-1.5 px-2 text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {sales.length > 0 ? (
              sales.map((s, idx) => (
                <tr key={s.sale_id || idx} className={idx % 2 === 1 ? 'bg-slate-50/70 print-exact' : ''}>
                  <td className="py-1 px-2 text-center font-mono text-slate-500 border-r border-slate-200">{idx + 1}</td>
                  <td className="py-1 px-2 font-mono font-bold border-r border-slate-200 whitespace-nowrap">{s.invoice_no}</td>
                  <td className="py-1 px-2 font-mono border-r border-slate-200 whitespace-nowrap">{s.sale_date}</td>
                  <td className="py-1 px-2 font-semibold border-r border-slate-200">{s.customer_name}</td>
                  <td className="py-1 px-2 border-r border-slate-200">{s.payment_method}</td>
                  <td className="py-1 px-2 text-right font-mono font-bold border-r border-slate-200 whitespace-nowrap">{fmt(s.total_amount)}</td>
                  <td className="py-1 px-2 text-center font-semibold">{s.status || '—'}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="py-3 px-3 text-center italic text-slate-500">
                  No sales transactions recorded for the selected filters.
                </td>
              </tr>
            )}
          </tbody>
          {sales.length > 0 && (
            <tfoot>
              <tr className="bg-slate-100 print-exact border-t border-slate-300 font-bold text-[10px]">
                <td colSpan={5} className="py-1.5 px-2 text-right uppercase text-slate-700 border-r border-slate-200">
                  Total Sales ({sales.length} Invoices)
                </td>
                <td className="py-1.5 px-2 text-right font-mono border-r border-slate-200 whitespace-nowrap">{fmt(salesData.total_sales || 0)}</td>
                <td className="py-1.5 px-2"></td>
              </tr>
            </tfoot>
          )}
        </table>
      </section>

      {/* INVENTORY VALUATION */}
      <section className="space-y-0">
        <SectionHeading
          number={sectionNumberMap.inventory}
          title="Inventory Valuation"
          badgeText={`${products.length} Product${products.length === 1 ? '' : 's'}`}
        />
        <MetricsStrip
          items={[
            { label: 'Total Products / Units', value: `${inventoryData.total_products ?? products.length} SKUs • ${totalUnits} Units` },
            { label: 'Total Stock Valuation', value: fmt(inventoryData.total_value || 0) },
            { label: 'Low Stock (Qty = 1)', value: `${inventoryData.low_stock_count ?? 0} Item(s)` },
            { label: 'Out of Stock (Qty <= 0)', value: `${inventoryData.out_of_stock_count ?? 0} Item(s)` },
          ]}
        />

        {inventoryCategories.length > 0 && (
          <div className="print-avoid-break border-x border-b border-slate-300 bg-white px-3 py-1.5 text-[10px]">
            <span className="font-bold uppercase text-slate-600 text-[9px] mr-2">Category Breakdown:</span>
            {inventoryCategories.map((c) => (
              <span key={c.category} className="inline-block mr-3">
                <strong>{c.category}</strong>: {c.count} SKU / {c.units} units ({fmt(c.valuation)})
              </span>
            ))}
          </div>
        )}

        <table className="w-full text-[10px] border-x border-b border-slate-300">
          <thead>
            <tr className="bg-slate-100 print-exact border-b border-slate-300 text-slate-700 uppercase font-bold text-[9px]">
              <th className="py-1.5 px-2 text-center border-r border-slate-200 w-7">#</th>
              <th className="py-1.5 px-2 text-left border-r border-slate-200">SKU Code</th>
              <th className="py-1.5 px-2 text-left border-r border-slate-200">Product Name</th>
              <th className="py-1.5 px-2 text-left border-r border-slate-200">Brand / Category</th>
              <th className="py-1.5 px-2 text-right border-r border-slate-200">Cost Price</th>
              <th className="py-1.5 px-2 text-right border-r border-slate-200">Unit Price</th>
              <th className="py-1.5 px-2 text-center border-r border-slate-200">Stock Qty</th>
              <th className="py-1.5 px-2 text-right border-r border-slate-200">Total Valuation</th>
              <th className="py-1.5 px-2 text-center">Stock Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {products.length > 0 ? (
              products.map((p, idx) => {
                const qty = Number(p.stock_quantity || 0)
                const unitPrice = Number(p.unit_price || 0)
                const valuation = unitPrice * qty
                return (
                  <tr key={p.product_id || idx} className={idx % 2 === 1 ? 'bg-slate-50/70 print-exact' : ''}>
                    <td className="py-1 px-2 text-center font-mono text-slate-500 border-r border-slate-200">{idx + 1}</td>
                    <td className="py-1 px-2 font-mono font-bold border-r border-slate-200 whitespace-nowrap">{p.product_code}</td>
                    <td className="py-1 px-2 font-semibold border-r border-slate-200">{p.product_name}</td>
                    <td className="py-1 px-2 border-r border-slate-200">
                      {[p.brand, p.category].filter(Boolean).join(' • ') || '—'}
                    </td>
                    <td className="py-1 px-2 text-right font-mono border-r border-slate-200 whitespace-nowrap">{fmt(p.cost_price)}</td>
                    <td className="py-1 px-2 text-right font-mono border-r border-slate-200 whitespace-nowrap">{fmt(unitPrice)}</td>
                    <td className="py-1 px-2 text-center font-mono font-bold border-r border-slate-200">{qty}</td>
                    <td className="py-1 px-2 text-right font-mono font-bold border-r border-slate-200 whitespace-nowrap">{fmt(valuation)}</td>
                    <td className="py-1 px-2 text-center font-semibold whitespace-nowrap">{getStockStatus(qty)}</td>
                  </tr>
                )
              })
            ) : (
              <tr>
                <td colSpan={9} className="py-3 px-3 text-center italic text-slate-500">
                  No inventory products recorded.
                </td>
              </tr>
            )}
          </tbody>
          {products.length > 0 && (
            <tfoot>
              <tr className="bg-slate-100 print-exact border-t border-slate-300 font-bold text-[10px]">
                <td colSpan={6} className="py-1.5 px-2 text-right uppercase text-slate-700 border-r border-slate-200">
                  Total Inventory Valuation ({products.length} SKUs)
                </td>
                <td className="py-1.5 px-2 text-center font-mono border-r border-slate-200">{totalUnits}</td>
                <td className="py-1.5 px-2 text-right font-mono border-r border-slate-200 whitespace-nowrap">{fmt(inventoryData.total_value || 0)}</td>
                <td className="py-1.5 px-2"></td>
              </tr>
            </tfoot>
          )}
        </table>
      </section>

      {/* INSTALLMENTS & AGING */}
      <section className="space-y-0">
        <SectionHeading
          number={sectionNumberMap.installments}
          title="Installments & Aging"
          badgeText={`${accounts.length} Account${accounts.length === 1 ? '' : 's'}`}
        />
        <MetricsStrip
          items={[
            { label: 'Active Accounts', value: `${installmentsData.active_accounts ?? 0}` },
            { label: 'Overdue Accounts', value: `${installmentsData.overdue_accounts ?? 0}` },
            { label: 'Completed Accounts', value: `${installmentsData.completed_accounts ?? 0}` },
            { label: 'Outstanding Balance', value: fmt(installmentsData.total_balance || 0) },
          ]}
        />
        <table className="w-full text-[10px] border-x border-b border-slate-300">
          <thead>
            <tr className="bg-slate-100 print-exact border-b border-slate-300 text-slate-700 uppercase font-bold text-[9px]">
              <th className="py-1.5 px-2 text-center border-r border-slate-200 w-7">#</th>
              <th className="py-1.5 px-2 text-left border-r border-slate-200">Account No</th>
              <th className="py-1.5 px-2 text-left border-r border-slate-200">Customer Name</th>
              <th className="py-1.5 px-2 text-left border-r border-slate-200">Frequency</th>
              <th className="py-1.5 px-2 text-right border-r border-slate-200">Total Payable</th>
              <th className="py-1.5 px-2 text-right border-r border-slate-200">Paid to Date</th>
              <th className="py-1.5 px-2 text-right border-r border-slate-200">Balance Due</th>
              <th className="py-1.5 px-2 text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {accounts.length > 0 ? (
              accounts.map((a, idx) => (
                <tr key={a.installment_id || idx} className={idx % 2 === 1 ? 'bg-slate-50/70 print-exact' : ''}>
                  <td className="py-1 px-2 text-center font-mono text-slate-500 border-r border-slate-200">{idx + 1}</td>
                  <td className="py-1 px-2 font-mono font-bold border-r border-slate-200 whitespace-nowrap">{a.account_no}</td>
                  <td className="py-1 px-2 font-semibold border-r border-slate-200">{a.customer_name}</td>
                  <td className="py-1 px-2 border-r border-slate-200">{a.frequency || 'Monthly'}</td>
                  <td className="py-1 px-2 text-right font-mono border-r border-slate-200 whitespace-nowrap">{fmt(a.total_payable)}</td>
                  <td className="py-1 px-2 text-right font-mono border-r border-slate-200 whitespace-nowrap">{fmt(a.paid)}</td>
                  <td className="py-1 px-2 text-right font-mono font-bold border-r border-slate-200 whitespace-nowrap">{fmt(a.balance)}</td>
                  <td className="py-1 px-2 text-center font-semibold">{a.status || '—'}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} className="py-3 px-3 text-center italic text-slate-500">
                  No installment receivable accounts recorded.
                </td>
              </tr>
            )}
          </tbody>
          {accounts.length > 0 && (
            <tfoot>
              <tr className="bg-slate-100 print-exact border-t border-slate-300 font-bold text-[10px]">
                <td colSpan={4} className="py-1.5 px-2 text-right uppercase text-slate-700 border-r border-slate-200">
                  Totals ({accounts.length} Accounts)
                </td>
                <td className="py-1.5 px-2 text-right font-mono border-r border-slate-200 whitespace-nowrap">{fmt(totalInstPayable)}</td>
                <td className="py-1.5 px-2 text-right font-mono border-r border-slate-200 whitespace-nowrap">{fmt(totalInstPaid)}</td>
                <td className="py-1.5 px-2 text-right font-mono border-r border-slate-200 whitespace-nowrap">{fmt(totalInstBalance)}</td>
                <td className="py-1.5 px-2"></td>
              </tr>
            </tfoot>
          )}
        </table>
      </section>

      {/* OFFICIAL SIGN-OFF FOOTER */}
      <div className="print-avoid-break pt-4 border-t border-slate-300 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6 text-[10px] text-slate-600">
        <div className="max-w-md">
          <p className="font-bold text-slate-800 uppercase text-[9px] mb-1">System Verification Note</p>
          <p className="leading-relaxed">
            System-generated report from {companyName || 'Z-LICZ Furniture & Appliances Trading'}. All lists reflect live database records as of {generatedAt}.
          </p>
        </div>
        <div className="pt-4 min-w-[220px]">
          <div className="border-t border-slate-400 pt-1 text-center">
            <div className="font-bold text-slate-900">{generatedBy}</div>
            <div className="text-[9px] text-slate-500 uppercase">Prepared By ({user?.role || 'Authorized Staff'})</div>
          </div>
        </div>
      </div>
    </div>
  )
}

