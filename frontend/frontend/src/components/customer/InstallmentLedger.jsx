import React from 'react';
import { Badge } from '../ui';
import { fmt } from '../../lib/utils';
import { FileText, Eye, AlertCircle, Trash2, ShoppingBag, CreditCard } from 'lucide-react';

const CASH_METHODS = ['Cash', 'GCash', 'Maya', 'Bank Account'];

function LedgerTable({ title, icon, items, type, onView, onDelete }) {
  if (!items || items.length === 0) return null;

  return (
    <div className="bg-[var(--card)] rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm mb-6">
      <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
        <h2 className="text-lg font-bold flex items-center gap-2">
          {icon}
          {title}
          <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-[#176B87]/10 text-[#176B87] dark:bg-[#64ccc5]/10 dark:text-[#64ccc5] font-semibold">{items.length}</span>
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
              {type === 'installment' && (
                <>
                  <th className="px-6 py-3 text-right">Monthly Pay</th>
                  <th className="px-6 py-3 text-right">Balance</th>
                  <th className="px-6 py-3">Next Due</th>
                </>
              )}
              {type === 'cash' && (
                <th className="px-6 py-3">Payment Method</th>
              )}
              <th className="px-6 py-3">Status</th>
              <th className="px-6 py-3 text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {items.map((inst, idx) => (
              <tr key={inst.installment_id || idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                <td className="px-6 py-4 font-semibold text-[#176B87] dark:text-[#64ccc5]">{inst.account_no}</td>
                <td className="px-6 py-4 flex items-center gap-3 min-w-[200px]">
                  {inst.image_url ? (
                    <img 
                      src={inst.image_url.startsWith('http') ? inst.image_url : `http://127.0.0.1:8000${inst.image_url}`} 
                      alt={inst.product}
                      className="w-10 h-10 rounded object-cover border border-slate-200 dark:border-slate-700 bg-white"
                      onError={(e) => { e.target.src = 'https://via.placeholder.com/40?text=No+Image'; }}
                    />
                  ) : (
                    <div className="w-10 h-10 rounded bg-slate-100 dark:bg-slate-800 flex items-center justify-center border border-slate-200 dark:border-slate-700 text-slate-400">
                      {type === 'cash' ? <ShoppingBag size={16} /> : <FileText size={16} />}
                    </div>
                  )}
                  <span className="font-medium text-slate-700 dark:text-slate-300">{inst.product}</span>
                </td>
                <td className="px-6 py-4">{inst.purchase_date}</td>
                <td className="px-6 py-4 text-right font-medium">{fmt(inst.total_amount)}</td>
                {type === 'installment' && (
                  <>
                    <td className="px-6 py-4 text-right">{fmt(inst.monthly_payment)}</td>
                    <td className="px-6 py-4 text-right text-red-600 dark:text-red-400 font-medium">{fmt(inst.balance)}</td>
                    <td className="px-6 py-4">{inst.next_due_date || 'N/A'}</td>
                  </>
                )}
                {type === 'cash' && (
                  <td className="px-6 py-4">
                    <Badge variant="success">{inst.payment_method}</Badge>
                  </td>
                )}
                <td className="px-6 py-4">
                  <Badge 
                    variant={inst.status === 'Active' ? 'success' : (inst.status === 'Completed' ? 'default' : 'warning')}
                  >
                    {inst.status}
                  </Badge>
                </td>
                <td className="px-6 py-4 text-center whitespace-nowrap">
                  <button 
                    onClick={() => onView(inst)}
                    className="p-1.5 text-[#176B87] hover:bg-[#176B87]/10 rounded-md transition-colors"
                    title="View Ledger"
                  >
                    <Eye size={18} />
                  </button>
                  {onDelete && (
                    <button 
                      onClick={() => onDelete(inst)}
                      className="p-1.5 text-rose-500 hover:bg-rose-500/10 rounded-md transition-colors ml-1"
                      title="Delete Ledger"
                    >
                      <Trash2 size={18} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function InstallmentLedger({ installments, onView, onDelete }) {
  if (!installments || installments.length === 0) {
    return (
      <div className="bg-[var(--card)] rounded-xl p-8 text-center border border-slate-200 dark:border-slate-800">
        <AlertCircle size={48} className="mx-auto text-slate-400 mb-4" />
        <h3 className="text-lg font-semibold mb-2">No Ledgers</h3>
        <p className="text-slate-500">You do not have any active ledgers at the moment.</p>
      </div>
    );
  }

  // Separate installment and cash/full-payment purchases
  const installmentLedgers = installments.filter(i => !CASH_METHODS.includes(i.payment_method));
  const cashLedgers = installments.filter(i => CASH_METHODS.includes(i.payment_method));

  return (
    <div>
      <LedgerTable
        title="Installment Ledgers"
        icon={<CreditCard className="text-[#176B87]" size={20} />}
        items={installmentLedgers}
        type="installment"
        onView={onView}
        onDelete={onDelete}
      />
      <LedgerTable
        title="Cash / Fully Paid Products"
        icon={<ShoppingBag className="text-emerald-500" size={20} />}
        items={cashLedgers}
        type="cash"
        onView={onView}
        onDelete={onDelete}
      />
      {installmentLedgers.length === 0 && cashLedgers.length === 0 && (
        <div className="bg-[var(--card)] rounded-xl p-8 text-center border border-slate-200 dark:border-slate-800">
          <AlertCircle size={48} className="mx-auto text-slate-400 mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Ledgers</h3>
          <p className="text-slate-500">You do not have any active ledgers at the moment.</p>
        </div>
      )}
    </div>
  );
}
