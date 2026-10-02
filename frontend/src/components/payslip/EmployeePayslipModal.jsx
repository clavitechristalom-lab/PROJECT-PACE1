import { FiPrinter, FiDownload, FiX } from 'react-icons/fi'
import { Modal, StatusBadge } from '../ui'
import { fmt } from '../../lib/utils'

export default function EmployeePayslipModal({ payslip, onClose }) {
  if (!payslip) return null

  // Group deductions
  const deductionsList = payslip.deductions || []
  
  const handlePrint = () => {
    window.print()
  }

  const handleDownload = () => {
    // In absence of a backend PDF generator, we trigger print dialog which allows "Save as PDF"
    // Instruct the user to save as PDF.
    window.print()
  }

  return (
    <Modal
      isOpen={true}
      title={`Payslip: ${payslip.employee_name} (${payslip.period_name})`}
      onClose={onClose}
      size="xl"
    >
      <div className="payslip-modal-content print:p-0 print:m-0 bg-white text-slate-800 rounded-xl overflow-hidden shadow-sm border border-slate-200 text-xs sm:text-sm">
        
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b-[3px] border-teal-800 p-6 bg-slate-50">
          <div className="flex items-center gap-4">
            {/* If there's a logo in public directory, it can be loaded here. Falling back to text if not. */}
            <div className="w-14 h-14 bg-teal-800 rounded flex items-center justify-center text-white font-bold text-xl print:bg-teal-800 print-exact">
              Z
            </div>
            <div>
              <h2 className="text-xl font-black text-teal-900 m-0 tracking-tight">Z-LICS FURNITURE & APPLIANCES</h2>
              <p className="text-slate-500 text-xs mt-0.5">123 Main Street, Business District</p>
              <p className="text-slate-500 text-xs">info@zlics.com | +63 900 123 4567</p>
            </div>
          </div>
          <div className="mt-4 sm:mt-0 text-right w-full sm:w-auto">
            <h1 className="text-2xl font-bold text-teal-800 border-b-2 border-teal-800 pb-1 inline-block uppercase tracking-wider">
              EMPLOYEE PAY STUB
            </h1>
          </div>
        </div>

        {/* Employee Information & Period */}
        <div className="p-6">
          <div className="bg-sky-50 rounded-lg p-4 border border-sky-100 flex flex-col sm:flex-row justify-between gap-6 print:bg-sky-50 print-exact">
            <div className="grid grid-cols-2 gap-x-8 gap-y-2 flex-1">
              <div><span className="text-slate-500 font-semibold text-xs uppercase tracking-wider block">Employee Name</span><span className="font-bold text-slate-900 text-base">{payslip.employee_name}</span></div>
              <div><span className="text-slate-500 font-semibold text-xs uppercase tracking-wider block">Employee ID</span><span className="font-semibold text-slate-700">{payslip.employee_code}</span></div>
              <div><span className="text-slate-500 font-semibold text-xs uppercase tracking-wider block">Department</span><span className="font-semibold text-slate-700">{payslip.department}</span></div>
              <div><span className="text-slate-500 font-semibold text-xs uppercase tracking-wider block">Position</span><span className="font-semibold text-slate-700">{payslip.position}</span></div>
            </div>
            <div className="border-t sm:border-t-0 sm:border-l border-sky-200 pt-4 sm:pt-0 sm:pl-6 min-w-[200px]">
              <div className="mb-3"><span className="text-slate-500 font-semibold text-xs uppercase tracking-wider block">Payroll Period</span><span className="font-bold text-slate-800">{payslip.period_name}</span></div>
              <div><span className="text-slate-500 font-semibold text-xs uppercase tracking-wider block">Pay Date</span><span className="font-bold text-slate-800">{payslip.pay_date || 'N/A'}</span></div>
            </div>
          </div>

          {/* Tables Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
            
            {/* Earnings Table */}
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-teal-800 text-white print:bg-teal-800 print-exact">
                    <th className="py-2.5 px-4 font-semibold uppercase tracking-wider text-xs">Earnings</th>
                    <th className="py-2.5 px-4 font-semibold uppercase tracking-wider text-xs text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr>
                    <td className="py-3 px-4 text-slate-700">Basic Pay</td>
                    <td className="py-3 px-4 text-right font-mono font-medium text-slate-900">{fmt(payslip.basic_salary)}</td>
                  </tr>
                  {payslip.overtime_hours > 0 && (
                    <tr>
                      <td className="py-3 px-4 text-slate-700">Overtime Pay ({payslip.overtime_hours}h)</td>
                      <td className="py-3 px-4 text-right font-mono font-medium text-slate-900">{fmt(payslip.overtime_pay)}</td>
                    </tr>
                  )}
                  {payslip.allowance > 0 && (
                    <tr>
                      <td className="py-3 px-4 text-slate-700">Allowance</td>
                      <td className="py-3 px-4 text-right font-mono font-medium text-slate-900">{fmt(payslip.allowance)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
              <div className="bg-slate-50 py-3 px-4 flex justify-between items-center border-t border-slate-200">
                <span className="font-bold text-slate-800 uppercase text-xs tracking-wider">Total Earnings</span>
                <span className="font-bold font-mono text-teal-700 text-base">{fmt(payslip.gross_pay)}</span>
              </div>
            </div>

            {/* Deductions Table */}
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-rose-700 text-white print:bg-rose-700 print-exact">
                    <th className="py-2.5 px-4 font-semibold uppercase tracking-wider text-xs">Deductions</th>
                    <th className="py-2.5 px-4 font-semibold uppercase tracking-wider text-xs text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {deductionsList.length > 0 ? deductionsList.map(d => (
                    <tr key={d.deduction_id}>
                      <td className="py-3 px-4 text-slate-700">{d.description || d.deduction_type}</td>
                      <td className="py-3 px-4 text-right font-mono font-medium text-rose-700">{fmt(d.amount)}</td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={2} className="py-6 text-center text-slate-400 italic">No deductions</td>
                    </tr>
                  )}
                </tbody>
              </table>
              <div className="bg-slate-50 py-3 px-4 flex justify-between items-center border-t border-slate-200">
                <span className="font-bold text-slate-800 uppercase text-xs tracking-wider">Total Deductions</span>
                <span className="font-bold font-mono text-rose-700 text-base">{fmt(payslip.total_deductions)}</span>
              </div>
            </div>

          </div>

          {/* Summary & Footer Section */}
          <div className="mt-8 flex flex-col-reverse md:flex-row justify-between items-end gap-6">
            
            {/* Status & Notice */}
            <div className="w-full md:w-auto">
              <div className="mb-4">
                <span className="text-slate-500 font-semibold text-xs uppercase tracking-wider mr-3">Status:</span>
                <StatusBadge status={payslip.status} />
              </div>
              <p className="text-xs text-slate-400 italic">
                This is a system generated payslip. No signature is required.
              </p>
            </div>

            {/* Pay Summary Box */}
            <div className="w-full md:w-80 bg-teal-50 border border-teal-200 rounded-xl p-5 print:bg-teal-50 print-exact">
              <div className="space-y-2.5">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-slate-700 text-sm">TOTAL EARNINGS</span>
                  <span className="font-mono text-slate-900 font-semibold">{fmt(payslip.gross_pay)}</span>
                </div>
                <div className="flex justify-between items-center border-b border-teal-200 pb-3">
                  <span className="font-semibold text-slate-700 text-sm">TOTAL DEDUCTIONS</span>
                  <span className="font-mono text-rose-700 font-semibold">{fmt(payslip.total_deductions)}</span>
                </div>
                <div className="flex justify-between items-center pt-1">
                  <span className="font-black text-teal-900 text-base">NET PAY</span>
                  <span className="font-mono font-black text-teal-800 text-2xl tracking-tight">{fmt(payslip.net_pay)}</span>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Action Buttons (Hidden when printing) */}
      <div className="flex justify-between items-center mt-4 print:hidden px-1">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-700 font-semibold cursor-pointer shadow-sm transition-colors"
          >
            <FiPrinter className="w-4 h-4" />
            <span>Print</span>
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="flex items-center gap-1.5 px-4 py-2 bg-teal-700 text-white rounded-lg hover:bg-teal-600 font-semibold cursor-pointer shadow-sm transition-colors"
          >
            <FiDownload className="w-4 h-4" />
            <span>Download PDF</span>
          </button>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-1.5 px-4 py-2 border border-slate-300 bg-white text-slate-700 rounded-lg hover:bg-slate-50 font-semibold cursor-pointer shadow-sm transition-colors"
        >
          <FiX className="w-4 h-4" />
          <span>Close</span>
        </button>
      </div>
    </Modal>
  )
}
