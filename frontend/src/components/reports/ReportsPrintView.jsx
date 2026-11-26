import { fmt } from '../../lib/utils'

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

function pct(part, total) {
  const t = Number(total || 0)
  if (t <= 0) return '0.0%'
  return `${((Number(part || 0) / t) * 100).toFixed(1)}%`
}

/**
 * Dedicated Print / PDF view for Reports & Analytics Center.
 * Renders a concise, executive-level summarized report across all active
 * modules (omitting Payroll when hidePayroll is true) without dumping
 * raw line-by-line tables.
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

  // Employees aggregates
  const totalEmployees = employeesData.total_employees ?? employees.length
  const totalEmpSalaryBase = employees.reduce((sum, e) => sum + Number(e.basic_salary || 0), 0)
  const payTypeBreakdown = Object.values(
    employees.reduce((acc, e) => {
      const key = e.pay_type || 'Monthly'
      if (!acc[key]) acc[key] = { label: key, count: 0, base: 0 }
      acc[key].count += 1
      acc[key].base += Number(e.basic_salary || 0)
      return acc
    }, {})
  ).sort((a, b) => b.count - a.count)

  // Attendance aggregates
  const totalAttLogs = attendanceData.total_records ?? attendance.length
  const totalAttRegHours = attendance.reduce((sum, a) => sum + Number(a.regular_hours || 0), 0)
  const totalAttOtHours = Number(attendanceData.total_overtime ?? attendance.reduce((sum, a) => sum + Number(a.overtime_hours || 0), 0))
  const totalAttHours = Number(attendanceData.total_hours ?? attendance.reduce((sum, a) => sum + Number(a.total_hours || 0), 0))

  const attendanceByStatus = Object.values(
    attendance.reduce((acc, a) => {
      const st = a.status || 'Unknown'
      if (!acc[st]) acc[st] = { status: st, count: 0, reg: 0, ot: 0, total: 0 }
      acc[st].count += 1
      acc[st].reg += Number(a.regular_hours || 0)
      acc[st].ot += Number(a.overtime_hours || 0)
      acc[st].total += Number(a.total_hours || 0)
      return acc
    }, {})
  ).sort((a, b) => b.count - a.count)

  // Payroll aggregates (by period)
  const totalPayslips = payrollData.total_records ?? payrolls.length
  const payrollByPeriod = Object.values(
    payrolls.reduce((acc, p) => {
      const key = p.period_name || 'Unspecified Period'
      if (!acc[key]) {
        acc[key] = { period: key, count: 0, basic: 0, overtime: 0, allowance: 0, gross: 0, deductions: 0, net: 0 }
      }
      acc[key].count += 1
      acc[key].basic += Number(p.basic_salary || 0)
      acc[key].overtime += Number(p.overtime_pay || 0)
      acc[key].allowance += Number(p.allowance || 0)
      acc[key].gross += Number(p.gross_pay || 0)
      acc[key].deductions += Number(p.total_deductions || 0)
      acc[key].net += Number(p.net_pay || 0)
      return acc
    }, {})
  )

  // Sales aggregates (by payment method & monthly trend)
  const totalSalesAmt = Number(salesData.total_sales ?? sales.reduce((sum, s) => sum + Number(s.total_amount || 0), 0))
  const salesByMethod = Object.values(
    sales.reduce((acc, s) => {
      const m = s.payment_method || 'Other'
      if (!acc[m]) acc[m] = { method: m, count: 0, total: 0 }
      acc[m].count += 1
      acc[m].total += Number(s.total_amount || 0)
      return acc
    }, {})
  ).sort((a, b) => b.total - a.total)

  // Inventory aggregates (by category)
  const totalProducts = inventoryData.total_products ?? products.length
  const totalUnits = products.reduce((sum, p) => sum + Number(p.stock_quantity || 0), 0)
  const totalInvValue = Number(inventoryData.total_value ?? products.reduce((sum, p) => sum + Number(p.unit_price || 0) * Number(p.stock_quantity || 0), 0))
  const inventoryCategories = Object.values(
    products.reduce((acc, p) => {
      const cat = p.category || 'Uncategorized'
      if (!acc[cat]) {
        acc[cat] = { category: cat, count: 0, units: 0, low: 0, out: 0, valuation: 0 }
      }
      const qty = Number(p.stock_quantity || 0)
      const val = Number(p.unit_price || 0) * qty
      acc[cat].count += 1
      acc[cat].units += qty
      if (qty <= 0) acc[cat].out += 1
      else if (qty === 1) acc[cat].low += 1
      acc[cat].valuation += val
      return acc
    }, {})
  ).sort((a, b) => b.valuation - a.valuation)

  // Installments aggregates (by status)
  const totalInstPayable = accounts.reduce((sum, a) => sum + Number(a.total_payable || 0), 0)
  const totalInstPaid = accounts.reduce((sum, a) => sum + Number(a.paid || 0), 0)
  const totalInstBalance = Number(installmentsData.total_balance ?? accounts.reduce((sum, a) => sum + Number(a.balance || 0), 0))
  const installmentsByStatus = Object.values(
    accounts.reduce((acc, a) => {
      const st = a.status || 'Active'
      if (!acc[st]) acc[st] = { status: st, count: 0, payable: 0, paid: 0, balance: 0 }
      acc[st].count += 1
      acc[st].payable += Number(a.total_payable || 0)
      acc[st].paid += Number(a.paid || 0)
      acc[st].balance += Number(a.balance || 0)
      return acc
    }, {})
  ).sort((a, b) => b.balance - a.balance)

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
      title: 'Employees Summary',
      summary: `${totalEmployees} Registered • ${employeesData.active_employees ?? 0} Active • ${employeesData.inactive_employees ?? 0} Inactive • ${employeesData.verified_employees ?? 0} Verified`,
      metric: `${totalEmployees} Staff`,
    },
    {
      key: 'attendance',
      title: 'Attendance Summary',
      summary: `${totalAttLogs} Logs • Present: ${attendanceData.present_count ?? 0} • Late: ${attendanceData.late_count ?? 0} • Half Day: ${attendanceData.half_day_count ?? 0} • Absent: ${attendanceData.absent_count ?? 0}`,
      metric: `${totalAttHours.toFixed(2)} hrs`,
    },
    ...(!hidePayroll
      ? [
          {
            key: 'payroll',
            title: 'Payroll Summary',
            summary: `${totalPayslips} Payslips • Gross: ${fmt(payrollData.total_gross || 0)} • Deductions: -${fmt(payrollData.total_deductions || 0)}`,
            metric: fmt(payrollData.total_net || 0),
          },
        ]
      : []),
    {
      key: 'sales',
      title: 'Sales & Revenue Summary',
      summary: `${sales.length} Invoices • Cash: ${fmt(salesData.cash_sales || 0)} • Installment: ${fmt(salesData.installment_sales || 0)}`,
      metric: fmt(totalSalesAmt),
    },
    {
      key: 'inventory',
      title: 'Inventory Valuation Summary',
      summary: `${totalProducts} SKUs • ${totalUnits} Units • Low Stock: ${inventoryData.low_stock_count ?? 0} • Out of Stock: ${inventoryData.out_of_stock_count ?? 0}`,
      metric: fmt(totalInvValue),
    },
    {
      key: 'installments',
      title: 'Installments & Receivables Summary',
      summary: `${accounts.length} Accounts • Active: ${installmentsData.active_accounts ?? 0} • Overdue: ${installmentsData.overdue_accounts ?? 0} • Completed: ${installmentsData.completed_accounts ?? 0}`,
      metric: fmt(totalInstBalance),
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
    <div className="reports-print-document w-full bg-white text-slate-900 font-sans text-[11px] leading-snug space-y-4">
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
            {hidePayroll && filters.branch && filters.branch !== 'All'
              ? `${filters.branch} — Branch Summary Report`
              : 'Reports & Analytics — Executive Summary'}
          </h1>
          <p className="text-[11px] text-slate-600 mt-0.5">
            {hidePayroll
              ? `Consolidated Operational, Workforce, Sales, Inventory & Receivables Summary for ${filters.branch && filters.branch !== 'All' ? filters.branch : 'Assigned Branch'}`
              : 'Consolidated Organization-Wide Operational, Workforce, Payroll, Sales, Inventory & Receivables Summary'}
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
                Branch: <strong>{filters.branch || 'All'}</strong>{hidePayroll ? ' (Store Branch Only)' : ''} • Dept: <strong>{filters.department || 'All'}</strong> • Status: <strong>{filters.status || 'All'}</strong>
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

      {/* EXECUTIVE OVERVIEW */}
      <div className="print-avoid-break border border-slate-300">
        <div
          className="print-exact px-3 py-1.5 text-white text-[11px] font-bold uppercase tracking-wider"
          style={{ backgroundColor: '#1e3a5f' }}
        >
          Executive Overview
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

      {/* SECTION 1: EMPLOYEES SUMMARY */}
      <section className="print-avoid-break space-y-0">
        <SectionHeading
          number={sectionNumberMap.employees}
          title="Employees Summary"
          badgeText={`${totalEmployees} Employee${totalEmployees === 1 ? '' : 's'}`}
        />
        <MetricsStrip
          items={[
            { label: 'Total Employees', value: totalEmployees },
            { label: 'Active / Inactive', value: `${employeesData.active_employees ?? 0} / ${employeesData.inactive_employees ?? 0}` },
            { label: 'Verified Accounts', value: `${employeesData.verified_employees ?? 0} Verified` },
            { label: 'Combined Monthly Base', value: fmt(totalEmpSalaryBase) },
          ]}
        />

        {(employeesData.by_department?.length > 0 ||
          employeesData.by_branch?.length > 0 ||
          employeesData.by_position?.length > 0) && (
          <div className="grid grid-cols-3 border-x border-b border-slate-300 divide-x divide-slate-300 bg-white text-[10px]">
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

        {payTypeBreakdown.length > 0 && (
          <div className="border-x border-b border-slate-300 bg-slate-50/60 print-exact px-3 py-1.5 text-[10px]">
            <span className="font-bold uppercase text-slate-600 text-[9px] mr-2">Pay Structure:</span>
            {payTypeBreakdown.map((pt) => (
              <span key={pt.label} className="inline-block mr-4">
                <strong>{pt.label}</strong>: {pt.count} staff ({fmt(pt.base)})
              </span>
            ))}
          </div>
        )}
      </section>

      {/* SECTION 2: ATTENDANCE SUMMARY */}
      <section className="print-avoid-break space-y-0">
        <SectionHeading
          number={sectionNumberMap.attendance}
          title="Attendance Summary"
          badgeText={`${totalAttLogs} Log${totalAttLogs === 1 ? '' : 's'}`}
        />
        <MetricsStrip
          items={[
            { label: 'Present / Late', value: `${attendanceData.present_count ?? 0} Present / ${attendanceData.late_count ?? 0} Late` },
            { label: 'Half Day / Absent', value: `${attendanceData.half_day_count ?? 0} Half Day / ${attendanceData.absent_count ?? 0} Absent` },
            { label: 'Regular / OT Hours', value: `${totalAttRegHours.toFixed(2)}h Reg / ${totalAttOtHours.toFixed(2)}h OT` },
            { label: 'Total Rendered Hours', value: `${totalAttHours.toFixed(2)} hrs` },
          ]}
        />
        <table className="w-full text-[10px] border-x border-b border-slate-300">
          <thead>
            <tr className="bg-slate-100 print-exact border-b border-slate-300 text-slate-700 uppercase font-bold text-[9px]">
              <th className="py-1.5 px-2 text-left border-r border-slate-200">Status Category</th>
              <th className="py-1.5 px-2 text-center border-r border-slate-200">Logs</th>
              <th className="py-1.5 px-2 text-center border-r border-slate-200">Share</th>
              <th className="py-1.5 px-2 text-right border-r border-slate-200">Regular Hours</th>
              <th className="py-1.5 px-2 text-right border-r border-slate-200">Overtime Hours</th>
              <th className="py-1.5 px-2 text-right">Total Hours</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {attendanceByStatus.length > 0 ? (
              attendanceByStatus.map((row, idx) => (
                <tr key={row.status} className={idx % 2 === 1 ? 'bg-slate-50/70 print-exact' : ''}>
                  <td className="py-1 px-2 font-semibold border-r border-slate-200">{row.status}</td>
                  <td className="py-1 px-2 text-center font-mono border-r border-slate-200">{row.count}</td>
                  <td className="py-1 px-2 text-center font-mono text-slate-600 border-r border-slate-200">{pct(row.count, totalAttLogs)}</td>
                  <td className="py-1 px-2 text-right font-mono border-r border-slate-200">{row.reg.toFixed(2)}h</td>
                  <td className="py-1 px-2 text-right font-mono border-r border-slate-200">{row.ot.toFixed(2)}h</td>
                  <td className="py-1 px-2 text-right font-mono font-bold">{row.total.toFixed(2)}h</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="py-2.5 px-3 text-center italic text-slate-500">
                  No attendance logs found matching the selected filters.
                </td>
              </tr>
            )}
          </tbody>
          {attendanceByStatus.length > 0 && (
            <tfoot>
              <tr className="bg-slate-100 print-exact border-t border-slate-300 font-bold text-[10px]">
                <td className="py-1.5 px-2 uppercase text-slate-700 border-r border-slate-200">Total</td>
                <td className="py-1.5 px-2 text-center font-mono border-r border-slate-200">{totalAttLogs}</td>
                <td className="py-1.5 px-2 text-center font-mono border-r border-slate-200">100.0%</td>
                <td className="py-1.5 px-2 text-right font-mono border-r border-slate-200">{totalAttRegHours.toFixed(2)}h</td>
                <td className="py-1.5 px-2 text-right font-mono border-r border-slate-200">{totalAttOtHours.toFixed(2)}h</td>
                <td className="py-1.5 px-2 text-right font-mono">{totalAttHours.toFixed(2)}h</td>
              </tr>
            </tfoot>
          )}
        </table>
      </section>

      {/* SECTION 3: PAYROLL SUMMARY (Administrator only — hidden for Store Admin) */}
      {!hidePayroll && (
        <section className="print-avoid-break space-y-0">
          <SectionHeading
            number={sectionNumberMap.payroll}
            title="Payroll Summary"
            badgeText={`${totalPayslips} Payslip${totalPayslips === 1 ? '' : 's'}`}
          />
          <MetricsStrip
            items={[
              { label: 'Total Basic Pay', value: fmt(payrollData.total_basic || 0) },
              { label: 'Allowances / OT', value: `${fmt(payrollData.total_allowance || 0)} / ${fmt(payrollData.total_overtime || 0)}` },
              { label: 'Gross / Deductions', value: `${fmt(payrollData.total_gross || 0)} / -${fmt(payrollData.total_deductions || 0)}` },
              { label: 'Net Disbursed', value: fmt(payrollData.total_net || 0) },
            ]}
          />
          <table className="w-full text-[10px] border-x border-b border-slate-300">
            <thead>
              <tr className="bg-slate-100 print-exact border-b border-slate-300 text-slate-700 uppercase font-bold text-[9px]">
                <th className="py-1.5 px-2 text-left border-r border-slate-200">Payroll Period</th>
                <th className="py-1.5 px-2 text-center border-r border-slate-200">Payslips</th>
                <th className="py-1.5 px-2 text-right border-r border-slate-200">Basic Pay</th>
                <th className="py-1.5 px-2 text-right border-r border-slate-200">OT &amp; Allowances</th>
                <th className="py-1.5 px-2 text-right border-r border-slate-200">Gross Pay</th>
                <th className="py-1.5 px-2 text-right border-r border-slate-200">Deductions</th>
                <th className="py-1.5 px-2 text-right">Net Pay</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {payrollByPeriod.length > 0 ? (
                payrollByPeriod.map((row, idx) => (
                  <tr key={row.period} className={idx % 2 === 1 ? 'bg-slate-50/70 print-exact' : ''}>
                    <td className="py-1 px-2 font-semibold border-r border-slate-200">{row.period}</td>
                    <td className="py-1 px-2 text-center font-mono border-r border-slate-200">{row.count}</td>
                    <td className="py-1 px-2 text-right font-mono border-r border-slate-200 whitespace-nowrap">{fmt(row.basic)}</td>
                    <td className="py-1 px-2 text-right font-mono border-r border-slate-200 whitespace-nowrap">{fmt(row.overtime + row.allowance)}</td>
                    <td className="py-1 px-2 text-right font-mono font-semibold border-r border-slate-200 whitespace-nowrap">{fmt(row.gross)}</td>
                    <td className="py-1 px-2 text-right font-mono text-rose-700 border-r border-slate-200 whitespace-nowrap">-{fmt(row.deductions)}</td>
                    <td className="py-1 px-2 text-right font-mono font-bold whitespace-nowrap">{fmt(row.net)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="py-2.5 px-3 text-center italic text-slate-500">
                    No payroll records found matching the selected filters.
                  </td>
                </tr>
              )}
            </tbody>
            {payrollByPeriod.length > 0 && (
              <tfoot>
                <tr className="bg-slate-100 print-exact border-t border-slate-300 font-bold text-[10px]">
                  <td className="py-1.5 px-2 uppercase text-slate-700 border-r border-slate-200">Total</td>
                  <td className="py-1.5 px-2 text-center font-mono border-r border-slate-200">{totalPayslips}</td>
                  <td className="py-1.5 px-2 text-right font-mono border-r border-slate-200 whitespace-nowrap">{fmt(payrollData.total_basic || 0)}</td>
                  <td className="py-1.5 px-2 text-right font-mono border-r border-slate-200 whitespace-nowrap">{fmt(Number(payrollData.total_overtime || 0) + Number(payrollData.total_allowance || 0))}</td>
                  <td className="py-1.5 px-2 text-right font-mono border-r border-slate-200 whitespace-nowrap">{fmt(payrollData.total_gross || 0)}</td>
                  <td className="py-1.5 px-2 text-right font-mono text-rose-700 border-r border-slate-200 whitespace-nowrap">-{fmt(payrollData.total_deductions || 0)}</td>
                  <td className="py-1.5 px-2 text-right font-mono whitespace-nowrap">{fmt(payrollData.total_net || 0)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </section>
      )}

      {/* SALES & REVENUE SUMMARY */}
      <section className="print-avoid-break space-y-0">
        <SectionHeading
          number={sectionNumberMap.sales}
          title="Sales & Revenue Summary"
          badgeText={`${sales.length} Invoice${sales.length === 1 ? '' : 's'}`}
        />
        <MetricsStrip
          items={[
            { label: 'Total Sales Revenue', value: fmt(totalSalesAmt) },
            { label: 'Cash Sales', value: fmt(salesData.cash_sales || 0) },
            { label: 'Installment Sales', value: fmt(salesData.installment_sales || 0) },
            { label: 'Avg Ticket Size', value: fmt(salesData.avg_transaction || 0) },
          ]}
        />

        {salesData.trend?.length > 0 && (
          <div className="border-x border-b border-slate-300 bg-white px-3 py-1.5 text-[10px]">
            <span className="font-bold uppercase text-slate-600 text-[9px] mr-2">Monthly Trend:</span>
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
              <th className="py-1.5 px-2 text-left border-r border-slate-200">Payment Method</th>
              <th className="py-1.5 px-2 text-center border-r border-slate-200">Invoices</th>
              <th className="py-1.5 px-2 text-center border-r border-slate-200">Revenue Share</th>
              <th className="py-1.5 px-2 text-right">Total Revenue</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {salesByMethod.length > 0 ? (
              salesByMethod.map((row, idx) => (
                <tr key={row.method} className={idx % 2 === 1 ? 'bg-slate-50/70 print-exact' : ''}>
                  <td className="py-1 px-2 font-semibold border-r border-slate-200">{row.method}</td>
                  <td className="py-1 px-2 text-center font-mono border-r border-slate-200">{row.count}</td>
                  <td className="py-1 px-2 text-center font-mono text-slate-600 border-r border-slate-200">{pct(row.total, totalSalesAmt)}</td>
                  <td className="py-1 px-2 text-right font-mono font-bold whitespace-nowrap">{fmt(row.total)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="py-2.5 px-3 text-center italic text-slate-500">
                  No sales transactions recorded for the selected filters.
                </td>
              </tr>
            )}
          </tbody>
          {salesByMethod.length > 0 && (
            <tfoot>
              <tr className="bg-slate-100 print-exact border-t border-slate-300 font-bold text-[10px]">
                <td className="py-1.5 px-2 uppercase text-slate-700 border-r border-slate-200">Total Sales</td>
                <td className="py-1.5 px-2 text-center font-mono border-r border-slate-200">{sales.length}</td>
                <td className="py-1.5 px-2 text-center font-mono border-r border-slate-200">100.0%</td>
                <td className="py-1.5 px-2 text-right font-mono whitespace-nowrap">{fmt(totalSalesAmt)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </section>

      {/* INVENTORY VALUATION SUMMARY */}
      <section className="print-avoid-break space-y-0">
        <SectionHeading
          number={sectionNumberMap.inventory}
          title="Inventory Valuation Summary"
          badgeText={`${totalProducts} SKU${totalProducts === 1 ? '' : 's'} • ${totalUnits} Units`}
        />
        <MetricsStrip
          items={[
            { label: 'Total Products / Units', value: `${totalProducts} SKUs • ${totalUnits} Units` },
            { label: 'Total Stock Valuation', value: fmt(totalInvValue) },
            { label: 'Low Stock (Qty = 1)', value: `${inventoryData.low_stock_count ?? 0} Item(s)` },
            { label: 'Out of Stock (Qty <= 0)', value: `${inventoryData.out_of_stock_count ?? 0} Item(s)` },
          ]}
        />

        <table className="w-full text-[10px] border-x border-b border-slate-300">
          <thead>
            <tr className="bg-slate-100 print-exact border-b border-slate-300 text-slate-700 uppercase font-bold text-[9px]">
              <th className="py-1.5 px-2 text-left border-r border-slate-200">Product Category</th>
              <th className="py-1.5 px-2 text-center border-r border-slate-200">SKUs</th>
              <th className="py-1.5 px-2 text-center border-r border-slate-200">Units in Stock</th>
              <th className="py-1.5 px-2 text-center border-r border-slate-200">Low / Out</th>
              <th className="py-1.5 px-2 text-center border-r border-slate-200">Value Share</th>
              <th className="py-1.5 px-2 text-right">Total Valuation</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {inventoryCategories.length > 0 ? (
              inventoryCategories.map((c, idx) => (
                <tr key={c.category} className={idx % 2 === 1 ? 'bg-slate-50/70 print-exact' : ''}>
                  <td className="py-1 px-2 font-semibold border-r border-slate-200">{c.category}</td>
                  <td className="py-1 px-2 text-center font-mono border-r border-slate-200">{c.count}</td>
                  <td className="py-1 px-2 text-center font-mono font-bold border-r border-slate-200">{c.units}</td>
                  <td className="py-1 px-2 text-center font-mono text-slate-600 border-r border-slate-200">{c.low} / {c.out}</td>
                  <td className="py-1 px-2 text-center font-mono text-slate-600 border-r border-slate-200">{pct(c.valuation, totalInvValue)}</td>
                  <td className="py-1 px-2 text-right font-mono font-bold whitespace-nowrap">{fmt(c.valuation)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="py-2.5 px-3 text-center italic text-slate-500">
                  No inventory products recorded.
                </td>
              </tr>
            )}
          </tbody>
          {inventoryCategories.length > 0 && (
            <tfoot>
              <tr className="bg-slate-100 print-exact border-t border-slate-300 font-bold text-[10px]">
                <td className="py-1.5 px-2 uppercase text-slate-700 border-r border-slate-200">Total Inventory</td>
                <td className="py-1.5 px-2 text-center font-mono border-r border-slate-200">{products.length}</td>
                <td className="py-1.5 px-2 text-center font-mono border-r border-slate-200">{totalUnits}</td>
                <td className="py-1.5 px-2 text-center font-mono border-r border-slate-200">
                  {inventoryData.low_stock_count ?? 0} / {inventoryData.out_of_stock_count ?? 0}
                </td>
                <td className="py-1.5 px-2 text-center font-mono border-r border-slate-200">100.0%</td>
                <td className="py-1.5 px-2 text-right font-mono whitespace-nowrap">{fmt(totalInvValue)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </section>

      {/* INSTALLMENTS & AGING SUMMARY */}
      <section className="print-avoid-break space-y-0">
        <SectionHeading
          number={sectionNumberMap.installments}
          title="Installments & Receivables Summary"
          badgeText={`${accounts.length} Account${accounts.length === 1 ? '' : 's'}`}
        />
        <MetricsStrip
          items={[
            { label: 'Active Accounts', value: `${installmentsData.active_accounts ?? 0}` },
            { label: 'Overdue Accounts', value: `${installmentsData.overdue_accounts ?? 0}` },
            { label: 'Completed Accounts', value: `${installmentsData.completed_accounts ?? 0}` },
            { label: 'Outstanding Balance', value: fmt(totalInstBalance) },
          ]}
        />
        <table className="w-full text-[10px] border-x border-b border-slate-300">
          <thead>
            <tr className="bg-slate-100 print-exact border-b border-slate-300 text-slate-700 uppercase font-bold text-[9px]">
              <th className="py-1.5 px-2 text-left border-r border-slate-200">Account Status</th>
              <th className="py-1.5 px-2 text-center border-r border-slate-200">Accounts</th>
              <th className="py-1.5 px-2 text-right border-r border-slate-200">Total Payable</th>
              <th className="py-1.5 px-2 text-right border-r border-slate-200">Paid to Date</th>
              <th className="py-1.5 px-2 text-right border-r border-slate-200">Balance Due</th>
              <th className="py-1.5 px-2 text-center">Collection Rate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {installmentsByStatus.length > 0 ? (
              installmentsByStatus.map((row, idx) => (
                <tr key={row.status} className={idx % 2 === 1 ? 'bg-slate-50/70 print-exact' : ''}>
                  <td className="py-1 px-2 font-semibold border-r border-slate-200">{row.status}</td>
                  <td className="py-1 px-2 text-center font-mono border-r border-slate-200">{row.count}</td>
                  <td className="py-1 px-2 text-right font-mono border-r border-slate-200 whitespace-nowrap">{fmt(row.payable)}</td>
                  <td className="py-1 px-2 text-right font-mono text-emerald-700 border-r border-slate-200 whitespace-nowrap">{fmt(row.paid)}</td>
                  <td className="py-1 px-2 text-right font-mono font-bold border-r border-slate-200 whitespace-nowrap">{fmt(row.balance)}</td>
                  <td className="py-1 px-2 text-center font-mono text-slate-600">{pct(row.paid, row.payable)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="py-2.5 px-3 text-center italic text-slate-500">
                  No installment receivable accounts recorded.
                </td>
              </tr>
            )}
          </tbody>
          {installmentsByStatus.length > 0 && (
            <tfoot>
              <tr className="bg-slate-100 print-exact border-t border-slate-300 font-bold text-[10px]">
                <td className="py-1.5 px-2 uppercase text-slate-700 border-r border-slate-200">Total Receivables</td>
                <td className="py-1.5 px-2 text-center font-mono border-r border-slate-200">{accounts.length}</td>
                <td className="py-1.5 px-2 text-right font-mono border-r border-slate-200 whitespace-nowrap">{fmt(totalInstPayable)}</td>
                <td className="py-1.5 px-2 text-right font-mono text-emerald-700 border-r border-slate-200 whitespace-nowrap">{fmt(totalInstPaid)}</td>
                <td className="py-1.5 px-2 text-right font-mono border-r border-slate-200 whitespace-nowrap">{fmt(totalInstBalance)}</td>
                <td className="py-1.5 px-2 text-center font-mono">{pct(totalInstPaid, totalInstPayable)}</td>
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
            System-generated summary report from {companyName || 'Z-LICZ Furniture & Appliances Trading'}. Figures reflect live aggregated database records as of {generatedAt}.
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
