import React from 'react';
import { Badge } from '../ui';
import { fmt } from '../../lib/utils';
import { FileText, Eye, AlertCircle } from 'lucide-react';

export default function InstallmentLedger({ installments, onView }) {
  if (!installments || installments.length === 0) {
    return (
      <div className="bg-[var(--card)] rounded-xl p-8 text-center border border-slate-200 dark:border-slate-800">
        <AlertCircle size={48} className="mx-auto text-slate-400 mb-4" />
        <h3 className="text-lg font-semibold mb-2">No Installment Accounts</h3>
        <p className="text-slate-500">You do not have any active installment accounts at the moment.</p>
      </div>
    );
  }

  return (
    <div className="bg-[var(--card)] rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
      <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <FileText className="text-[#176B87]" size={20} />
          Active Installment Ledgers
        </h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 font-medium border-b border-slate-200 dark:border-slate-700">
            <tr>
              <th className="px-6 py-3">Account No.</th>
              <th className="px-6 py-3">Product</th>
              <th className="px-6 py-3">Purchase Date</th>
              <th className="px-6 py-3 text-right">Total Amount</th>
              <th className="px-6 py-3 text-right">Monthly Pay</th>
              <th className="px-6 py-3 text-right">Balance</th>
              <th className="px-6 py-3">Next Due</th>
              <th className="px-6 py-3">Status</th>
              <th className="px-6 py-3 text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {installments.map((inst, idx) => (
              <tr key={inst.installment_id || idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                <td className="px-6 py-4 font-semibold text-[#176B87] dark:text-[#64ccc5]">{inst.account_no}</td>
                <td className="px-6 py-4">{inst.product}</td>
                <td className="px-6 py-4">{inst.purchase_date}</td>
                <td className="px-6 py-4 text-right font-medium">{fmt(inst.total_amount)}</td>
                <td className="px-6 py-4 text-right">{fmt(inst.monthly_payment)}</td>
                <td className="px-6 py-4 text-right text-red-600 dark:text-red-400 font-medium">{fmt(inst.balance)}</td>
                <td className="px-6 py-4">{inst.next_due_date || 'N/A'}</td>
                <td className="px-6 py-4">
                  <Badge 
                    variant={inst.status === 'Active' ? 'success' : (inst.status === 'Completed' ? 'default' : 'warning')}
                  >
                    {inst.status}
                  </Badge>
                </td>
                <td className="px-6 py-4 text-center">
                  <button 
                    onClick={() => onView(inst)}
                    className="p-1.5 text-[#176B87] hover:bg-[#176B87]/10 rounded-md transition-colors"
                    title="View Ledger"
                  >
                    <Eye size={18} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
