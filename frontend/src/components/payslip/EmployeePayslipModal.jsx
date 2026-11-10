import React, { useMemo, useState } from 'react'
import { FiPrinter, FiDownload, FiEye, FiCreditCard, FiX } from 'react-icons/fi'
import { Modal } from '../ui'
import { fmt } from '../../lib/utils'
import zliczLogo from '../../assets/zlicz-logo.png'

export default function EmployeePayslipModal({ payslip, onClose }) {
  const [showProofLightbox, setShowProofLightbox] = useState(false)
  if (!payslip) return null

  // Read company configuration or custom settings from local storage if available
  const customCompany = useMemo(() => {
    try {
      const s = localStorage.getItem('pace_company_settings') || localStorage.getItem('company_settings')
      return s ? JSON.parse(s) : null
    } catch (_) {
      return null
    }
  }, [])

  // Company Information details matching requirements
  const companyInfo = useMemo(() => {
    const branchName = payslip.branch || ''
    return {
      name: customCompany?.company_name || customCompany?.name || (branchName ? `Z-LICZ Furniture & Appliances Trading (${branchName})` : 'Z-LICZ Furniture & Appliances Trading'),
      address: customCompany?.address || 'Zone 2, National Highway, Bulua, Cagayan de Oro City, 9000 Misamis Oriental',
      phone: customCompany?.phone || '+63 900 123 4567',
      email: customCompany?.email || 'info@zlicsfurniture.com',
      website: customCompany?.website || customCompany?.web_links || 'www.zlicsfurniture.com'
    }
  }, [customCompany, payslip.branch])

  // Currency Formatter: Default to ₱ (PHP) for Philippine statutory payroll, support USD if configured
  const currencySymbol = useMemo(() => {
    if (payslip.currency === '$' || payslip.currency === 'USD' || customCompany?.currency === 'USD') return '$'
    return '₱'
  }, [payslip.currency, customCompany?.currency])

  const formatMoney = (val, forceDisplay = false) => {
    if (val === undefined || val === null || val === '') return ''
    const num = Number(val)
    if (isNaN(num)) return ''
    if (num === 0 && !forceDisplay) return ''
    return `${currencySymbol}${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  // Date Formatting Helpers
  const formatDMY = (dateStr, shortYear = false) => {
    if (!dateStr) return shortYear ? '31-10-26' : '31-10-2026'
    const str = String(dateStr).trim()
    const match = str.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
    if (match) {
      const [, y, m, d] = match
      const day = d.padStart(2, '0')
      const month = m.padStart(2, '0')
      const year = shortYear ? y.slice(-2) : y
      return `${day}-${month}-${year}`
    }
    const matchDMY = str.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/)
    if (matchDMY) {
      const [, d, m, y] = matchDMY
      const day = d.padStart(2, '0')
      const month = m.padStart(2, '0')
      const year = shortYear ? y.slice(-2) : y
      return `${day}-${month}-${year}`
    }
    return str
  }

  // Header & Metadata variables
  const managerName = payslip.approved_by && payslip.approved_by !== 'System'
    ? payslip.approved_by
    : (payslip.manager_name || 'Store Administrator')

  const employeeName = payslip.employee_name || 'James William Patrick'
  const employeeId = payslip.employee_code || (payslip.employee_id ? `EMP-${String(payslip.employee_id).padStart(3, '0')}` : 'EMP-016')

  // Date Range and Period Ending calculation
  const periodEndingDate = formatDMY(
    payslip.to_date || payslip.end_date || (payslip.period_dates ? payslip.period_dates.split('to')[1]?.trim() : null),
    false
  )

  const startDateFormatted = formatDMY(
    payslip.from_date || payslip.start_date || (payslip.period_dates ? payslip.period_dates.split('to')[0]?.replace(/from/i, '').trim() : null),
    false
  )

  const dateRangeDisplay = payslip.period_dates || (startDateFormatted && periodEndingDate ? `${startDateFormatted} to ${periodEndingDate}` : 'Weekly Cutoff (Mon-Sat)')

  const payDateFormatted = formatDMY(
    payslip.pay_date || payslip.to_date || payslip.end_date,
    true
  )

  // Pay Frequency determination (Default: Weekly Cycle)
  const payFrequency = useMemo(() => {
    if (payslip.pay_frequency) return payslip.pay_frequency
    const pName = (payslip.period_name || '').toLowerCase()
    if (pName.includes('month') && !pName.includes('semi') && !pName.includes('week')) return 'Monthly'
    if (pName.includes('daily') || pName.includes('day')) return 'Daily'
    return 'Weekly'
  }, [payslip])

  // Strict Zero Hours Rule & Live MySQL Attendance Detection:
  // If work_hours == 0 and no approved Paid Leave covers the week, base pay, gross pay, deductions, and net pay evaluate strictly to 0.00
  const paidLeaveDays = Number(payslip.paid_leave_days || 0)
  const rawHours = (payslip.work_hours !== undefined && payslip.work_hours !== null)
    ? Number(payslip.work_hours)
    : Number(payslip.regular_hours || 0)
  const isZeroHours = Boolean(payslip.zero_hours) || (rawHours <= 0 && paidLeaveDays <= 0 && Number(payslip.gross_pay || 0) <= 0)

  const regularHours = isZeroHours ? 0 : rawHours
  const rawDaily = Number(payslip.daily_rate || 0)
  const dailyRateVal = (rawDaily >= 100 && rawDaily <= 500) ? rawDaily : 500
  const regularRate = Number(
    payslip.hourly_rate > 0
      ? payslip.hourly_rate
      : (dailyRateVal / 8)
  )
  const regularAmount = isZeroHours
    ? 0
    : (payslip.weekly_base_pay !== undefined && payslip.weekly_base_pay !== null
        ? Number(payslip.weekly_base_pay)
        : Number(payslip.basic_pay ?? (dailyRateVal * 6)))

  // Strictly NO Overtime Company-Wide
  const otHours = 0
  const otRate = 0
  const otAmount = 0

  const holidayHours = isZeroHours ? 0 : Number(payslip.holiday_hours || 0)
  const holidayRate = holidayHours > 0
    ? (payslip.holiday_pay > 0 ? (Number(payslip.holiday_pay) / holidayHours) : (regularRate > 0 ? regularRate * 1.3 : 0))
    : (regularRate > 0 ? regularRate * 1.3 : 0)
  const holidayAmount = isZeroHours ? 0 : Number(payslip.holiday_pay || 0)

  const vacationHours = isZeroHours ? 0 : Number(payslip.vacation_hours || 0)
  const vacationAmount = isZeroHours ? 0 : Number((payslip.allowance > 0 ? payslip.allowance : payslip.vacation_pay) || 0)
  const vacationRate = vacationHours > 0 && vacationAmount > 0
    ? (vacationAmount / vacationHours)
    : 0

  // Others earnings (allowances, bonuses, incentives, adjustments)
  const othersAmount = isZeroHours
    ? 0
    : Math.max(0, Number(payslip.gross_pay || 0) - (regularAmount + otAmount + holidayAmount + vacationAmount))

  // Deductions calculations matching required statutory & attendance itemization
  const taxAmount = isZeroHours ? 0 : Number(payslip.withholding_tax_deduction || 0)
  const sssAmount = isZeroHours ? 0 : Number(payslip.sss_deduction || 0)
  const philhealthAmount = isZeroHours ? 0 : Number(payslip.philhealth_deduction || 0)
  const pagibigAmount = isZeroHours ? 0 : Number(payslip.pagibig_deduction || 0)
  const latePenalty = isZeroHours ? 0 : Number(payslip.late_penalty || payslip.late_deduction || 0)
  const absenceAmount = isZeroHours ? 0 : Number(payslip.absence_deduction || 0)
  const undertimeAmount = isZeroHours ? 0 : Number(payslip.undertime_deduction || 0)

  // Other itemized deductions / loans
  const statutoryAttendanceSum = taxAmount + sssAmount + philhealthAmount + pagibigAmount + latePenalty + absenceAmount + undertimeAmount
  const otherDedAmount = isZeroHours
    ? 0
    : Math.max(0, Number(payslip.total_deductions || 0) - statutoryAttendanceSum)

  // Totals
  const totalGross = isZeroHours
    ? 0
    : Number(payslip.gross_pay ?? (regularAmount + otAmount + holidayAmount + vacationAmount + othersAmount))

  const totalDeds = isZeroHours
    ? 0
    : Number(payslip.total_deductions ?? (statutoryAttendanceSum + otherDedAmount))

  const netPay = isZeroHours
    ? 0
    : Number(payslip.net_pay ?? (totalGross - totalDeds))

  // Build Synchronized Side-by-Side Table Rows
  const isWeeklyPay = payFrequency === 'Weekly' || payslip.is_weekly !== false
  const minuteRateVal = Number(payslip.minute_rate || 1.00)

  const earningsList = [
    {
      label: isWeeklyPay ? 'Weekly Base Pay' : 'Regular Pay',
      rate: regularRate > 0 ? formatMoney(regularRate, true) : '',
      hours: isZeroHours ? '0.00' : (regularHours > 0 ? regularHours.toFixed(2) : '0.00'),
      amount: regularAmount > 0 ? formatMoney(regularAmount, true) : '0.00'
    },
    {
      label: 'Overtime Pay',
      rate: otHours > 0 ? formatMoney(otRate, true) : '',
      hours: otHours > 0 ? otHours.toFixed(2) : '',
      amount: otAmount > 0 ? formatMoney(otAmount, true) : ''
    },
    {
      label: 'Holiday Pay',
      rate: holidayHours > 0 ? formatMoney(holidayRate, true) : '',
      hours: holidayHours > 0 ? holidayHours.toFixed(2) : '',
      amount: holidayAmount > 0 ? formatMoney(holidayAmount, true) : ''
    },
    {
      label: 'Vacation Pay / Allowance',
      rate: vacationHours > 0 && vacationRate > 0 ? formatMoney(vacationRate, true) : '',
      hours: vacationHours > 0 ? vacationHours.toFixed(2) : '',
      amount: vacationAmount > 0 ? formatMoney(vacationAmount, true) : ''
    },
    {
      label: 'Others (Bonus / Adjustments)',
      rate: '',
      hours: '',
      amount: othersAmount > 0 ? formatMoney(othersAmount, true) : ''
    }
  ]

  const deductionsList = [
    {
      label: 'Income Tax',
      amount: taxAmount > 0 ? formatMoney(taxAmount, true) : ''
    },
    {
      label: 'SSS Contribution',
      amount: sssAmount > 0 ? formatMoney(sssAmount, true) : ''
    },
    {
      label: 'PhilHealth (Medical)',
      amount: philhealthAmount > 0 ? formatMoney(philhealthAmount, true) : ''
    },
    {
      label: 'Pag-IBIG (HDMF / Life)',
      amount: pagibigAmount > 0 ? formatMoney(pagibigAmount, true) : ''
    },
    {
      label: payslip.late_minutes > 0
        ? `Total Late (${payslip.late_minutes}m @ ₱${minuteRateVal.toFixed(2)}/m)`
        : 'Total Late',
      amount: latePenalty > 0 ? formatMoney(latePenalty, true) : ''
    },
  ]

  // Itemized Absences from Message Reports if breakdown exists, otherwise single summary
  if (Array.isArray(payslip.absence_breakdown) && payslip.absence_breakdown.length > 0) {
    payslip.absence_breakdown.forEach(ab => {
      deductionsList.push({
        label: `${ab.category} (${ab.days}d @ -₱${dailyRateVal.toFixed(2)}/day)`,
        amount: Number(ab.amount) > 0 ? formatMoney(ab.amount, true) : ''
      })
    })
  } else {
    deductionsList.push({
      label: payslip.absence_days > 0
        ? `Total Absences (${payslip.absence_days}d @ -₱${dailyRateVal.toFixed(2)}/day)`
        : 'Total Absences',
      amount: absenceAmount > 0 ? formatMoney(absenceAmount, true) : ''
    })
  }

  deductionsList.push({
    label: payslip.undertime_minutes > 0
      ? `Total Undertime (${payslip.undertime_minutes}m @ ₱${minuteRateVal.toFixed(2)}/m)`
      : 'Total Undertime',
    amount: undertimeAmount > 0 ? formatMoney(undertimeAmount, true) : ''
  })

  if (otherDedAmount > 0) {
    deductionsList.push({
      label: 'Other Deductions / Loans',
      amount: formatMoney(otherDedAmount, true)
    })
  }

  // Combine both into paired side-by-side rows
  const maxRows = Math.max(earningsList.length, deductionsList.length, 5)
  const pairedRows = []
  for (let i = 0; i < maxRows; i++) {
    pairedRows.push({
      earning: earningsList[i] || { label: '', rate: '', hours: '', amount: '' },
      deduction: deductionsList[i] || { label: '', amount: '' }
    })
  }

  // Print & PDF Handler: Temporarily rename document title for clean saved PDF filename
  const handlePrint = () => {
    const prevTitle = document.title
    document.title = `Pay_Stub_${employeeId}_${(employeeName).replace(/\s+/g, '_')}_${payDateFormatted}`
    window.print()
    setTimeout(() => {
      document.title = prevTitle
    }, 1500)
  }

  const handleDownload = () => {
    handlePrint()
  }

  return (
    <Modal
      isOpen={true}
      title={`Employee Pay Stub: ${employeeName} (${employeeId})`}
      onClose={onClose}
      size="xl"
      className="!max-w-4xl"
    >
      <div className="space-y-4">
        {/* On-screen Action Toolbar (Strictly hidden during PDF print) */}
        <div className="no-print flex flex-wrap items-center justify-between gap-2 p-3 bg-muted/30 border border-border rounded-xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-bold text-foreground uppercase tracking-wide">
              Official Employee Pay Stub &bull; {payFrequency}
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
              <FiCreditCard className="w-3 h-3" />
              <span>Payout: {payslip.payout_method || payslip.pay_type || 'Cash'}</span>
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {payslip.proof_of_payment && (
              <button
                type="button"
                onClick={() => setShowProofLightbox(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold cursor-pointer shadow-xs transition-colors"
              >
                <FiEye className="w-3.5 h-3.5" />
                <span>View Proof of Payment</span>
              </button>
            )}
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#1b4d5a] hover:bg-[#153e49] text-white rounded-lg text-xs font-bold cursor-pointer shadow-xs transition-colors"
            >
              <FiPrinter className="w-3.5 h-3.5" />
              <span>Print Pay Stub</span>
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-bold cursor-pointer shadow-xs transition-colors"
            >
              <FiDownload className="w-3.5 h-3.5" />
              <span>Download PDF</span>
            </button>
          </div>
        </div>

        {/* Proof of Payment Lightbox */}
        {showProofLightbox && payslip.proof_of_payment && (
          <div
            className="no-print fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-[fadeIn_0.15s_ease]"
            onClick={() => setShowProofLightbox(false)}
          >
            <div
              className="bg-card border border-border rounded-2xl max-w-2xl w-full p-4 space-y-3 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-border pb-2.5">
                <div>
                  <h4 className="text-sm font-bold text-foreground">Proof of Payment Receipt</h4>
                  <p className="text-[11px] text-muted-foreground">
                    {employeeName} &bull; {payslip.payout_method || payslip.pay_type || 'Cash'} &bull; Net Pay: {formatMoney(netPay, true)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowProofLightbox(false)}
                  className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <FiX className="w-4 h-4" />
                </button>
              </div>
              <div className="max-h-[70vh] overflow-auto flex items-center justify-center bg-muted/30 rounded-xl p-2 border border-border">
                <img
                  src={payslip.proof_of_payment}
                  alt="Proof of Payment"
                  className="max-w-full max-h-[65vh] object-contain rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <a
                  href={payslip.proof_of_payment}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
                >
                  Open Full Image
                </a>
                <button
                  type="button"
                  onClick={() => setShowProofLightbox(false)}
                  className="px-4 py-1.5 rounded-lg border border-border bg-card hover:bg-muted text-xs font-semibold cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Printable Official Pay Stub Document (Target of @media print) */}
        <div className="payslip-print-container bg-white text-slate-800 p-8 sm:p-12 border border-slate-200 rounded-xl shadow-md font-sans">
          
          {/* 1. Header Section */}
          <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
            {/* Left: Company Logo/Icon and Company Details */}
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

              {/* Company Information */}
              <div className="mt-3 text-[11px] leading-tight text-slate-800 font-sans space-y-0.5">
                <div className="font-bold text-slate-900">[{companyInfo.name}]</div>
                <div className="text-slate-700">[{companyInfo.address}]</div>
                <div className="text-slate-700">Phone: [{companyInfo.phone}]</div>
                <div className="text-slate-700">Email: [{companyInfo.email}]</div>
                <div className="text-slate-700">Website: [{companyInfo.website}]</div>
              </div>
            </div>

            {/* Right: Bold Title "EMPLOYEE PAY STUB" with dark teal underline */}
            <div className="text-right w-full sm:w-auto pt-2">
              <h1 className="text-2xl sm:text-3xl font-serif font-bold text-[#1b4d5a] tracking-widest uppercase m-0 pb-1.5 border-b-[2.5px] border-[#1b4d5a] inline-block">
                EMPLOYEE PAY STUB
              </h1>
            </div>
          </div>

          {/* Strict Zero Working Hours Notice */}
          {isZeroHours && (
            <div className="no-print my-4 p-3 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-center justify-between font-medium shadow-xs">
              <span>⚠️ <strong>Zero Working Hours Rule:</strong> 0 rendered working hours recorded for this weekly cycle. Base salary, overtime, statutory deductions, and net pay strictly evaluate to ₱0.00.</span>
              <span className="font-mono font-bold text-amber-800 shrink-0">₱0.00 Net</span>
            </div>
          )}

          {/* 2. Employee & Period Info Grid */}
          <div className="flex flex-col sm:flex-row justify-end items-end sm:items-center gap-6 my-6">
            {/* Center Grid: Manager, Employee Name, Employee ID, Period Ending, Frequency */}
            <div className="w-full sm:w-[360px] bg-[#e8f4f8] border border-[#b8dfea] rounded-xs overflow-hidden text-xs text-slate-800 divide-y divide-[#b8dfea]">
              <div className="px-3.5 py-1.5 flex items-center">
                <span className="w-36 text-slate-700 font-medium">Manager / Admin :</span>
                <span className="font-semibold text-slate-900">{managerName}</span>
              </div>
              <div className="px-3.5 py-1.5 flex items-center">
                <span className="w-36 text-slate-700 font-medium">Employee Name:</span>
                <span className="font-bold text-slate-950">{employeeName}</span>
              </div>
              <div className="px-3.5 py-1.5 flex items-center">
                <span className="w-36 text-slate-700 font-medium">Employee ID:</span>
                <span className="font-semibold text-slate-900">{employeeId}</span>
              </div>
              <div className="px-3.5 py-1.5 flex items-center">
                <span className="w-36 text-slate-700 font-medium">Period Ending:</span>
                <span className="font-semibold text-slate-900">{periodEndingDate} ({payFrequency})</span>
              </div>
              <div className="px-3.5 py-1.5 flex items-center">
                <span className="w-36 text-slate-700 font-medium">Date Range:</span>
                <span className="font-medium text-slate-800 text-[11px]">{dateRangeDisplay}</span>
              </div>
            </div>

            {/* Right Grid: Pay Date */}
            <div className="w-[140px] text-center">
              <div className="text-xs font-bold text-slate-800 mb-1">Pay Date</div>
              <div className="bg-[#e8f4f8] border border-[#b8dfea] rounded-xs py-1.5 px-3">
                <span className="font-bold text-slate-900 text-sm font-mono tracking-tight">{payDateFormatted}</span>
              </div>
            </div>
          </div>

          {/* 3. Itemized Side-by-Side Tables (Earnings & Deductions) */}
          <div className="w-full overflow-x-auto mt-6">
            <table className="w-full border-collapse border border-[#d0e4ec] text-xs sm:text-sm">
              <thead>
                <tr className="bg-[#1b4d5a] text-white font-bold uppercase tracking-wider text-xs">
                  <th className="py-2.5 px-3 text-left border-r border-[#163f4a] w-[20%]">Earnings</th>
                  <th className="py-2.5 px-3 text-center border-r border-[#163f4a] w-[14%]">Rate</th>
                  <th className="py-2.5 px-3 text-center border-r border-[#163f4a] w-[12%]">Hours</th>
                  <th className="py-2.5 px-3 text-center border-r border-[#163f4a] w-[18%]">Amount</th>
                  <th className="py-2.5 px-3 text-left border-r border-[#163f4a] w-[20%]">Deductions</th>
                  <th className="py-2.5 px-3 text-center w-[16%]">Amount</th>
                </tr>
              </thead>
              <tbody>
                {pairedRows.map((row, idx) => (
                  <tr key={idx} className="border-b border-[#d0e4ec]">
                    {/* Earnings Item */}
                    <td className="py-2 px-3 text-left font-medium text-slate-800 border-r border-[#d0e4ec] bg-white">
                      {row.earning.label}
                    </td>
                    {/* Earnings Rate */}
                    <td className="py-2 px-2 text-center font-mono font-medium text-slate-800 border-r border-[#d0e4ec] bg-white">
                      {row.earning.rate}
                    </td>
                    {/* Earnings Hours */}
                    <td className="py-2 px-2 text-center font-mono font-medium text-slate-800 border-r border-[#d0e4ec] bg-white">
                      {row.earning.hours}
                    </td>
                    {/* Earnings Amount */}
                    <td className="py-2 px-3 text-center font-mono font-semibold text-slate-900 border-r border-[#d0e4ec] bg-white">
                      {row.earning.amount}
                    </td>
                    {/* Deductions Item */}
                    <td className="py-2 px-3 text-left font-medium text-slate-800 border-r border-[#d0e4ec] bg-[#eef7fa]">
                      {row.deduction.label}
                    </td>
                    {/* Deductions Amount */}
                    <td className="py-2 px-3 text-center font-mono font-semibold text-slate-900 bg-[#eef7fa]">
                      {row.deduction.amount}
                    </td>
                  </tr>
                ))}

                {/* Subtotal Row at Bottom of Both Tables */}
                <tr className="border-t-2 border-[#1b4d5a] font-bold text-slate-900">
                  <td className="py-2.5 px-3 text-left border-r border-[#d0e4ec] bg-white">
                    Total Earnings
                  </td>
                  <td className="py-2.5 px-2 border-r border-[#d0e4ec] bg-white"></td>
                  <td className="py-2.5 px-2 border-r border-[#d0e4ec] bg-white"></td>
                  <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-900 border-r border-[#d0e4ec] bg-white">
                    {formatMoney(totalGross, true)}
                  </td>
                  <td className="py-2.5 px-3 border-r border-[#d0e4ec] bg-[#eef7fa]">
                    Total Deductions
                  </td>
                  <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-900 bg-[#eef7fa]">
                    {formatMoney(totalDeds, true)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 4. Summary Footer */}
          <div className="flex justify-end mt-6">
            <div className="w-[300px] sm:w-[350px] space-y-1.5">
              {/* Total Earnings */}
              <div className="flex items-stretch border border-[#1b4d5a] overflow-hidden rounded-xs">
                <div className="bg-[#1b4d5a] text-white font-bold text-xs sm:text-sm px-4 py-2 w-[52%] flex items-center">
                  Total Earnings
                </div>
                <div className="bg-[#e8f4f8] text-slate-900 font-bold font-mono text-xs sm:text-sm px-4 py-2 w-[48%] flex items-center justify-center">
                  {formatMoney(totalGross, true)}
                </div>
              </div>

              {/* Total Deductions */}
              <div className="flex items-stretch border border-[#1b4d5a] overflow-hidden rounded-xs">
                <div className="bg-[#1b4d5a] text-white font-bold text-xs sm:text-sm px-4 py-2 w-[52%] flex items-center">
                  Total Deductions
                </div>
                <div className="bg-[#e8f4f8] text-slate-900 font-bold font-mono text-xs sm:text-sm px-4 py-2 w-[48%] flex items-center justify-center">
                  {formatMoney(totalDeds, true)}
                </div>
              </div>

              {/* Final Net Pay Highlighted */}
              <div className="flex items-stretch border border-[#1b4d5a] overflow-hidden rounded-xs">
                <div className="bg-[#1b4d5a] text-white font-bold text-xs sm:text-sm px-4 py-2 w-[52%] flex items-center">
                  Net pay
                </div>
                <div className="bg-[#e8f4f8] text-slate-950 font-black font-mono text-sm sm:text-base px-4 py-2 w-[48%] flex items-center justify-center">
                  {formatMoney(netPay, true)}
                </div>
              </div>
            </div>
          </div>

          {/* Itemized Absence & Leave Report Breakdown */}
          {Array.isArray(payslip.absence_breakdown) && payslip.absence_breakdown.length > 0 && (
            <div className="mt-5 p-3.5 bg-[#f0f9fb] border border-[#b8dfea] rounded-xs text-xs text-slate-800">
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-[#1b4d5a] uppercase tracking-wider text-[11px]">
                  Absence Deductions &bull; Message Reports Itemized Breakdown
                </span>
                <span className="font-semibold text-slate-600 text-[11px]">
                  Total: {payslip.absence_days || payslip.absence_breakdown.reduce((sum, a) => sum + Number(a.days || 0), 0)} day(s) missed
                </span>
              </div>
              <div className="space-y-1.5 divide-y divide-[#d0e4ec]/60">
                {payslip.absence_breakdown.map((ab, idx) => (
                  <div key={idx} className="pt-1.5 first:pt-0 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-xs text-[10px] font-bold bg-[#1b4d5a] text-white">
                        {ab.category}
                      </span>
                      <span className="text-slate-700 font-medium">
                        {ab.reason} ({ab.days} day(s): {ab.from_date} &rarr; {ab.to_date})
                      </span>
                    </div>
                    <span className={`font-mono font-bold ${ab.is_paid || Number(ab.amount || 0) === 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {ab.is_paid || Number(ab.amount || 0) === 0
                        ? (ab.amount_formatted || '₱0.00 (Paid Leave)')
                        : `-₱${formatMoney(Number(ab.amount), false)}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Footnote */}
          <div className="mt-8 pt-4 border-t border-slate-200 flex justify-between items-center text-[10px] text-slate-400">
            <span>This is an official computer-generated pay stub. No physical signature is required.</span>
            <span>Generated: {new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
          </div>

        </div>

        {/* Footer actions */}
        <div className="no-print flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 text-xs font-semibold rounded-lg border border-border bg-card hover:bg-muted text-foreground cursor-pointer transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  )
}
