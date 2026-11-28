import React, { useMemo, useState } from 'react';
import { Badge, Pagination } from '../ui';
import { fmt, summarizePaymentNotes } from '../../lib/utils';
import InstallmentClearanceModal from '../installments/InstallmentClearanceModal';
import {
  FiAlertCircle,
  FiAward,
  FiCalendar,
  FiCheckCircle,
  FiChevronDown,
  FiChevronUp,
  FiClock,
  FiCreditCard,
  FiDollarSign,
  FiEye,
  FiFileText,
  FiMapPin,
  FiPackage,
  FiSearch,
  FiShield,
  FiShoppingBag,
  FiTrash2,
  FiTrendingUp,
  FiUserCheck,
} from 'react-icons/fi';

function isSettledInstallment(inst) {
  if (!inst) return false;
  const st = String(inst.status || '').trim().toLowerCase();
  return st === 'fully paid' || st === 'completed' || st === 'complete payment' || Number(inst.balance ?? 1) <= 0;
}

function isPendingCashPayment(item) {
  if (!item) return false;
  if (item.is_pending) return true;
  const st = String(item.status || '').trim().toLowerCase();
  return st.includes('pending') || st.includes('collected');
}

function formatDateLabel(val) {
  if (!val) return '—';
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return String(val);
  return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}

function resolveImgSrc(url) {
  if (!url) return null;
  return url.includes('/storage/') ? url.substring(url.indexOf('/storage/')) : url;
}

function formatCashChannelLabel(method, channel) {
  const m = String(method || 'Cash').trim();
  const c = String(channel || '').trim().toLowerCase();
  if (c === 'store_cashier' || c === 'cashier' || c === 'store') return `${m} • Store Cashier`;
  if (c === 'collector' || c === 'field_collector') return `${m} • Field Collector`;
  return m;
}

function InstallmentRecordCard({
  inst,
  expanded,
  onToggleExpand,
  onView,
  onMakePayment,
  onDelete,
  onOpenClearance,
}) {
  const settled = isSettledInstallment(inst);
  const isOverdue = !settled && String(inst.status || '').trim().toLowerCase() === 'overdue';
  const totalPayable = Number(inst.total_payable ?? inst.total_amount ?? 0);
  const downPayment = Number(inst.down_payment ?? 0);
  const monthlyPayment = Number(inst.monthly_payment ?? 0);
  const totalPaid = Number(inst.total_paid ?? inst.paid_amount ?? 0);
  const balance = settled ? 0 : Math.max(0, Number(inst.balance ?? 0));
  const pendingAmount = Number(inst.pending_payments_amount ?? 0);
  const progressPct = settled
    ? 100
    : totalPayable > 0
      ? Math.min(100, Math.round((totalPaid / totalPayable) * 100))
      : 0;

  const schedules = Array.isArray(inst.paymentSchedules) ? inst.paymentSchedules : [];
  const payments = Array.isArray(inst.payments) ? inst.payments : [];
  const paidSchedulesCount = schedules.filter((s) => String(s.status || '').toLowerCase() === 'paid' || Number(s.balance_due ?? 1) <= 0).length;
  const imgSrc = resolveImgSrc(inst.image_url);

  return (
    <div
      className={`bg-card rounded-2xl border transition-all shadow-xs overflow-hidden ${settled
        ? 'border-emerald-500/35 hover:border-emerald-500/60'
        : isOverdue
          ? 'border-rose-500/35 hover:border-rose-500/60'
          : 'border-border hover:border-[#176B87]/40'
        }`}
    >
      <div className="p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="flex items-start gap-3.5 min-w-0">
            {imgSrc ? (
              <img
                src={imgSrc}
                alt={inst.product}
                className="w-14 h-14 rounded-xl object-cover border border-border bg-white shrink-0"
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            ) : (
              <div className={`w-14 h-14 rounded-xl flex items-center justify-center border shrink-0 ${settled
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                : 'bg-[#176B87]/10 text-[#176B87] dark:text-[#64ccc5] border-[#176B87]/20'
                }`}>
                <FiPackage size={24} />
              </div>
            )}

            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="font-extrabold text-sm sm:text-base text-foreground leading-snug">
                  {inst.product || 'Installment Item'}
                </h4>
                {inst.account_no && (
                  <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded-md bg-[#176B87]/10 text-[#176B87] dark:bg-[#64ccc5]/15 dark:text-[#64ccc5] border border-[#176B87]/20">
                    {inst.account_no}
                  </span>
                )}
              </div>

              <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground mt-1">
                <span className="inline-flex items-center gap-1">
                  <FiCalendar size={12} />
                  Started: <strong className="text-foreground">{formatDateLabel(inst.purchase_date)}</strong>
                </span>
                {inst.payment_term && (
                  <span className="inline-flex items-center gap-1">
                    <FiClock size={12} />
                    Term: <strong className="text-foreground">{inst.payment_term}</strong>
                  </span>
                )}
                {inst.branch_name && (
                  <span className="inline-flex items-center gap-1">
                    <FiMapPin size={12} />
                    <strong className="text-foreground">{inst.branch_name}</strong>
                  </span>
                )}
                {settled && inst.completed_at && (
                  <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                    <FiCheckCircle size={12} />
                    Completed: <strong>{formatDateLabel(inst.completed_at)}</strong>
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap shrink-0">
            {settled && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-teal-500/10 text-teal-700 dark:text-teal-300 border border-teal-500/20">
                <FiShield size={11} />
                {inst.customer_standing || 'Cleared / Good Standing'}
              </span>
            )}
            <Badge variant={settled ? 'success' : isOverdue ? 'danger' : 'primary'}>
              {settled ? 'Paid in Full' : isOverdue ? 'Overdue' : (inst.status || 'Active')}
            </Badge>
          </div>
        </div>

        <div className="space-y-1.5 bg-muted/30 p-3 rounded-xl border border-border/60">
          <div className="flex items-center justify-between text-xs gap-2 flex-wrap">
            <span className="font-semibold text-muted-foreground flex items-center gap-1.5">
              <FiTrendingUp className="text-emerald-600 dark:text-emerald-400" size={13} />
              Repayment Progress
              {schedules.length > 0 && (
                <span className="text-[11px] font-normal">
                  ({paidSchedulesCount}/{schedules.length} schedules paid)
                </span>
              )}
            </span>
            <span className="font-mono font-bold text-foreground">
              {fmt(totalPaid)} / {fmt(totalPayable)} ({progressPct}%)
            </span>
          </div>
          <div className="w-full h-2.5 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${settled
                ? 'bg-gradient-to-r from-emerald-500 to-teal-500'
                : isOverdue
                  ? 'bg-gradient-to-r from-amber-500 to-rose-500'
                  : 'bg-gradient-to-r from-[#176B87] to-emerald-500'
                }`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-xs">
          <div className="p-2.5 rounded-xl bg-muted/25 border border-border/50">
            <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Total Payable</p>
            <p className="font-mono font-extrabold text-foreground text-sm mt-0.5">{fmt(totalPayable)}</p>
          </div>
          <div className="p-2.5 rounded-xl bg-muted/25 border border-border/50">
            <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Downpayment</p>
            <p className="font-mono font-bold text-foreground text-sm mt-0.5">{fmt(downPayment)}</p>
          </div>
          <div className="p-2.5 rounded-xl bg-muted/25 border border-border/50">
            <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Monthly Due</p>
            <p className="font-mono font-bold text-foreground text-sm mt-0.5">{settled ? fmt(0) : fmt(monthlyPayment)}</p>
          </div>
          <div className="p-2.5 rounded-xl bg-muted/25 border border-border/50">
            <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Total Paid</p>
            <p className="font-mono font-extrabold text-emerald-600 dark:text-emerald-400 text-sm mt-0.5">{fmt(totalPaid)}</p>
            {!settled && pendingAmount > 0 && (
              <p className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold mt-0.5">
                +{fmt(pendingAmount)} pending
              </p>
            )}
          </div>
          <div className="p-2.5 rounded-xl bg-muted/25 border border-border/50 col-span-2 sm:col-span-1">
            <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Remaining Balance</p>
            <p className={`font-mono font-extrabold text-sm mt-0.5 ${balance > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
              {fmt(balance)}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-border/60">
          <div className="text-xs text-muted-foreground flex items-center gap-3 flex-wrap">
            {settled ? (
              <span className="inline-flex items-center gap-1.5">
                <FiUserCheck size={13} className="text-emerald-600 dark:text-emerald-400" />
                Verified by: <strong className="text-foreground">{inst.final_verifier_name || 'Store Administrator'}</strong>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <FiCalendar size={13} className="text-[#176B87] dark:text-[#64ccc5]" />
                Next Due: <strong className="text-foreground">{inst.next_due_date ? formatDateLabel(inst.next_due_date) : 'No pending due'}</strong>
              </span>
            )}
            <span className="text-[11px]">• {payments.length} payment record{payments.length === 1 ? '' : 's'}</span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={onToggleExpand}
              className="px-3 py-1.5 rounded-xl border border-border hover:bg-muted text-xs font-semibold text-foreground transition-colors inline-flex items-center gap-1.5 cursor-pointer"
            >
              {expanded ? <FiChevronUp size={14} /> : <FiChevronDown size={14} />}
              <span>{expanded ? 'Hide Details' : 'Schedule & History'}</span>
            </button>

            {onView && (
              <button
                type="button"
                onClick={() => onView(inst)}
                className="px-3 py-1.5 rounded-xl border border-border hover:bg-muted text-xs font-semibold text-[#176B87] dark:text-[#64ccc5] transition-colors inline-flex items-center gap-1.5 cursor-pointer"
              >
                <FiEye size={14} />
                <span>Full Ledger</span>
              </button>
            )}

            {settled ? (
              <>
                <button
                  type="button"
                  onClick={() => onOpenClearance({ installmentId: inst.installment_id, view: 'certificate' })}
                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <FiAward size={13} />
                  <span>Certificate</span>
                </button>
                <button
                  type="button"
                  onClick={() => onOpenClearance({ installmentId: inst.installment_id, view: 'soa' })}
                  className="px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <FiFileText size={13} />
                  <span>Final SOA</span>
                </button>
              </>
            ) : (
              balance > 0 && onMakePayment && (
                <button
                  type="button"
                  onClick={() => onMakePayment(inst)}
                  className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <FiCreditCard size={13} />
                  <span>Pay Now</span>
                </button>
              )
            )}

            {onDelete && (
              <button
                type="button"
                onClick={() => onDelete(inst)}
                className="p-1.5 text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                title="Delete Ledger"
              >
                <FiTrash2 size={15} />
              </button>
            )}
          </div>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border bg-muted/20 p-4 sm:p-5 space-y-4">
          {schedules.length > 0 && (
            <div>
              <h5 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                Amortization Schedule ({schedules.length})
              </h5>
              <div className="overflow-x-auto rounded-xl border border-border bg-card">
                <table className="w-full text-xs text-left">
                  <thead className="bg-muted/50 text-muted-foreground border-b border-border">
                    <tr>
                      <th className="px-3 py-2">#</th>
                      <th className="px-3 py-2">Due Date</th>
                      <th className="px-3 py-2 text-right">Amount Due</th>
                      <th className="px-3 py-2 text-right">Paid</th>
                      <th className="px-3 py-2 text-right">Balance</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {schedules.map((s, idx) => {
                      const sPaid = String(s.status || '').toLowerCase() === 'paid' || Number(s.balance_due ?? 0) <= 0;
                      return (
                        <tr key={s.schedule_id || s.id || idx}>
                          <td className="px-3 py-2 font-mono font-semibold">{s.installment_number || s.schedule_number || idx + 1}</td>
                          <td className="px-3 py-2">{formatDateLabel(s.due_date)}</td>
                          <td className="px-3 py-2 text-right font-mono">{fmt(s.amount_due)}</td>
                          <td className="px-3 py-2 text-right font-mono text-emerald-600 dark:text-emerald-400">{fmt(s.amount_paid)}</td>
                          <td className="px-3 py-2 text-right font-mono">{fmt(s.balance_due)}</td>
                          <td className="px-3 py-2">
                            <Badge variant={sPaid ? 'success' : String(s.status || '').toLowerCase() === 'overdue' ? 'danger' : 'warning'}>
                              {sPaid ? 'Paid' : (s.status || 'Pending')}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div>
            <h5 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
              Payment History ({payments.length})
            </h5>
            {payments.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No recorded payments yet for this account.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border bg-card">
                <table className="w-full text-xs text-left">
                  <thead className="bg-muted/50 text-muted-foreground border-b border-border">
                    <tr>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Receipt / OR #</th>
                      <th className="px-3 py-2">Method</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {payments.map((p, idx) => (
                      <tr key={p.payment_id || idx}>
                        <td className="px-3 py-2 whitespace-nowrap">{formatDateLabel(p.payment_date)}</td>
                        <td className="px-3 py-2 font-mono whitespace-nowrap">
                          {p.receipt_no || '—'}
                          {p.receipt_reference && (
                            <span className="block text-[10px] text-muted-foreground">OR: {p.receipt_reference}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">{formatCashChannelLabel(p.payment_method, p.cash_channel)}</td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">{fmt(p.amount)}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <Badge variant={String(p.status || '').toLowerCase().includes('pending') ? 'warning' : 'success'}>
                            {p.status || 'Completed'}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground max-w-[260px]">
                          {summarizePaymentNotes(p.notes) || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CashPaymentCard({ item, expanded, onToggleExpand }) {
  const pending = isPendingCashPayment(item);
  const items = Array.isArray(item.items) ? item.items : [];
  const imgSrc = resolveImgSrc(item.image_url);
  const summaryNote = summarizePaymentNotes(item.notes);

  return (
    <div
      className={`bg-card rounded-2xl border transition-all shadow-xs overflow-hidden ${pending
        ? 'border-amber-500/40 hover:border-amber-500/70'
        : 'border-emerald-500/35 hover:border-emerald-500/60'
        }`}
    >
      <div className="p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="flex items-start gap-3.5 min-w-0">
            {imgSrc ? (
              <img
                src={imgSrc}
                alt={item.product}
                className="w-14 h-14 rounded-xl object-cover border border-border bg-white shrink-0"
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            ) : (
              <div className={`w-14 h-14 rounded-xl flex items-center justify-center border shrink-0 ${pending
                ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30'
                : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                }`}>
                <FiShoppingBag size={24} />
              </div>
            )}

            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="font-extrabold text-sm sm:text-base text-foreground leading-snug">
                  {item.product || 'Cash Purchase'}
                </h4>
                {item.invoice_no && (
                  <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25">
                    {item.invoice_no}
                  </span>
                )}
                {item.receipt_no && (
                  <span className="font-mono text-[11px] font-semibold px-2 py-0.5 rounded-md bg-muted text-muted-foreground border border-border">
                    {item.receipt_no}
                  </span>
                )}
                {item.official_receipt_no && (
                  <span className="font-mono text-[11px] font-semibold px-2 py-0.5 rounded-md bg-teal-500/10 text-teal-700 dark:text-teal-300 border border-teal-500/20">
                    OR: {item.official_receipt_no}
                  </span>
                )}
              </div>

              <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground mt-1">
                <span className="inline-flex items-center gap-1">
                  <FiCalendar size={12} />
                  Date: <strong className="text-foreground">{formatDateLabel(item.purchase_date)}</strong>
                </span>
                <span className="inline-flex items-center gap-1">
                  <FiDollarSign size={12} />
                  Method: <strong className="text-foreground">{formatCashChannelLabel(item.payment_method, item.cash_channel)}</strong>
                </span>
                {item.branch_name && (
                  <span className="inline-flex items-center gap-1">
                    <FiMapPin size={12} />
                    <strong className="text-foreground">{item.branch_name}</strong>
                  </span>
                )}
                {item.reference_no && (
                  <span className="font-mono text-[11px]">
                    Ref: <strong className="text-foreground">{item.reference_no}</strong>
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap shrink-0">
            <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25">
              Cash Payment
            </span>
            <Badge variant={pending ? 'warning' : 'success'}>
              {pending ? (item.status || 'Pending at Cashier') : (item.status || 'Paid in Full')}
            </Badge>
          </div>
        </div>

        <div className="flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-border/60">
          <div className="text-xs text-muted-foreground flex items-center gap-3 flex-wrap">
            <span className="inline-flex items-center gap-1.5">
              <FiUserCheck size={13} className={pending ? 'text-amber-500' : 'text-emerald-600 dark:text-emerald-400'} />
              {pending ? (
                <span>Present reference code at Store Cashier to complete cash payment</span>
              ) : (
                <span>
                  Verified by: <strong className="text-foreground">{item.verified_by || 'Store Cashier'}</strong>
                </span>
              )}
            </span>
            {items.length > 0 && (
              <span className="text-[11px]">• {items.length} item{items.length === 1 ? '' : 's'}</span>
            )}
          </div>

          <button
            type="button"
            onClick={onToggleExpand}
            className="px-3 py-1.5 rounded-xl border border-border hover:bg-muted text-xs font-semibold text-foreground transition-colors inline-flex items-center gap-1.5 cursor-pointer"
          >
            {expanded ? <FiChevronUp size={14} /> : <FiChevronDown size={14} />}
            <span>{expanded ? 'Hide Details' : 'Items & Receipt Details'}</span>
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border bg-muted/20 p-4 sm:p-5 space-y-4">
          {items.length > 0 && (
            <div>
              <h5 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                Purchased Items ({items.length})
              </h5>
              <div className="overflow-x-auto rounded-xl border border-border bg-card">
                <table className="w-full text-xs text-left">
                  <thead className="bg-muted/50 text-muted-foreground border-b border-border">
                    <tr>
                      <th className="px-3 py-2">Product</th>
                      <th className="px-3 py-2">Code / Category</th>
                      <th className="px-3 py-2 text-right">Qty</th>
                      <th className="px-3 py-2 text-right">Unit Price</th>
                      <th className="px-3 py-2 text-right">Line Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {items.map((line, idx) => (
                      <tr key={line.product_id || idx}>
                        <td className="px-3 py-2 font-semibold text-foreground">{line.product_name || 'Product'}</td>
                        <td className="px-3 py-2 text-muted-foreground">
                          <span className="font-mono">{line.product_code || '—'}</span>
                          {line.category ? ` • ${line.category}` : ''}
                        </td>
                        <td className="px-3 py-2 text-right font-mono">{line.quantity ?? 1}</td>
                        <td className="px-3 py-2 text-right font-mono">{fmt(line.unit_price)}</td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-foreground">{fmt(line.line_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-card rounded-xl border border-border p-3.5">
            <div>
              <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Transaction Summary</p>
              <div className="mt-1.5 space-y-1 text-foreground">
                <div>Invoice #: <strong className="font-mono">{item.invoice_no || 'Pending Issuance'}</strong></div>
                <div>Receipt #: <strong className="font-mono">{item.receipt_no || '—'}</strong></div>
                {item.official_receipt_no && (
                  <div>Official Receipt #: <strong className="font-mono">{item.official_receipt_no}</strong></div>
                )}
                {item.reference_no && (
                  <div>Reference #: <strong className="font-mono">{item.reference_no}</strong></div>
                )}
                {item.confirmed_at && (
                  <div>Confirmed At: <strong>{formatDateLabel(item.confirmed_at)}</strong></div>
                )}
              </div>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Payment Notes</p>
              <p className="mt-1.5 text-muted-foreground leading-relaxed">
                {summaryNote || (pending ? 'Walk-in cash payment awaiting confirmation at Store Cashier.' : 'Direct cash purchase settled in full.')}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function InstallmentLedger({
  installments = [],
  cashPayments = [],
  onView,
  onMakePayment,
  onDelete,
}) {
  const [viewTab, setViewTab] = useState('all');
  const [search, setSearch] = useState('');
  const [expandedKeys, setExpandedKeys] = useState({});
  const [instPage, setInstPage] = useState(1);
  const [cashPage, setCashPage] = useState(1);
  const [clearanceModal, setClearanceModal] = useState(null);
  const pageSize = 5;

  const safeInstallments = Array.isArray(installments) ? installments : [];
  const safeCashPayments = Array.isArray(cashPayments) ? cashPayments : [];

  const completedInstallments = useMemo(
    () => safeInstallments.filter((i) => isSettledInstallment(i)),
    [safeInstallments]
  );

  const query = search.trim().toLowerCase();

  const matchesInstallment = (inst) => {
    if (!query) return true;
    const fields = [
      inst.account_no,
      inst.product,
      inst.status,
      inst.payment_term,
      inst.branch_name,
      inst.purchase_date,
    ];
    return fields.some((f) => String(f || '').toLowerCase().includes(query));
  };

  const matchesCash = (item) => {
    if (!query) return true;
    const fields = [
      item.invoice_no,
      item.receipt_no,
      item.official_receipt_no,
      item.reference_no,
      item.product,
      item.status,
      item.payment_method,
      item.branch_name,
      item.verified_by,
      item.purchase_date,
    ];
    return fields.some((f) => String(f || '').toLowerCase().includes(query));
  };

  const visibleInstallments = useMemo(() => {
    if (viewTab === 'cash') return [];
    const base = viewTab === 'completed' ? completedInstallments : safeInstallments;
    return base.filter(matchesInstallment);
  }, [viewTab, completedInstallments, safeInstallments, query]);

  const visibleCashPayments = useMemo(() => {
    if (viewTab === 'completed') return [];
    return safeCashPayments.filter(matchesCash);
  }, [viewTab, safeCashPayments, query]);

  const paginatedInstallments = visibleInstallments.slice((instPage - 1) * pageSize, instPage * pageSize);
  const paginatedCash = visibleCashPayments.slice((cashPage - 1) * pageSize, cashPage * pageSize);

  const toggleExpand = (key) => {
    setExpandedKeys((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleTabChange = (nextTab) => {
    setViewTab(nextTab);
    setInstPage(1);
    setCashPage(1);
  };

  const allRecordsCount = safeInstallments.length + safeCashPayments.length;

  return (
    <div className="space-y-5">
      <div className="bg-card rounded-[2rem] border border-border shadow-sm p-5 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-lg sm:text-xl font-extrabold text-foreground tracking-tight">
              Active Records
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Detailed breakdown of your installment accounts, cash payments, schedules, and receipts.
            </p>
          </div>

          <div className="relative w-full sm:w-64">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setInstPage(1);
                setCashPage(1);
              }}
              placeholder="Search product, account, invoice..."
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#176B87]/40"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap border-b border-border pb-3">
          {[
            { id: 'all', label: 'All Records', count: allRecordsCount },
            { id: 'cash', label: 'Cash Payments', count: safeCashPayments.length },
            { id: 'completed', label: 'Installment Paid in Full', count: completedInstallments.length },
          ].map((tab) => {
            const active = viewTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleTabChange(tab.id)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all inline-flex items-center gap-2 cursor-pointer ${active
                  ? 'bg-[#176B87] text-white shadow-xs'
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground border border-border/60'
                  }`}
              >
                <span>{tab.label}</span>
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${active ? 'bg-white/20 text-white' : 'bg-background text-foreground'
                  }`}>
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="space-y-6">
          {visibleInstallments.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <FiCreditCard className="text-[#176B87] dark:text-[#64ccc5]" size={15} />
                  <span>
                    {viewTab === 'completed'
                      ? 'Completed Installment Accounts'
                      : viewTab === 'all'
                        ? 'Installment Accounts'
                        : 'Ongoing Installment Plans'}
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-muted text-foreground font-mono text-[11px]">
                    {visibleInstallments.length}
                  </span>
                </h4>
              </div>

              <div className="space-y-3">
                {paginatedInstallments.map((inst, idx) => {
                  const key = `inst-${inst.installment_id || inst.account_no || idx}`;
                  return (
                    <InstallmentRecordCard
                      key={key}
                      inst={inst}
                      expanded={!!expandedKeys[key]}
                      onToggleExpand={() => toggleExpand(key)}
                      onView={onView}
                      onMakePayment={onMakePayment}
                      onDelete={onDelete}
                      onOpenClearance={setClearanceModal}
                    />
                  );
                })}
              </div>

              {visibleInstallments.length > pageSize && (
                <Pagination
                  page={instPage}
                  total={visibleInstallments.length}
                  pageSize={pageSize}
                  onChange={setInstPage}
                />
              )}
            </div>
          )}

          {visibleCashPayments.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                  <FiShoppingBag size={15} />
                  <span>Cash Payments</span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-mono text-[11px]">
                    {visibleCashPayments.length}
                  </span>
                </h4>
              </div>

              <div className="space-y-3">
                {paginatedCash.map((item, idx) => {
                  const key = `cash-${item.record_id || item.sale_id || item.payment_id || idx}`;
                  return (
                    <CashPaymentCard
                      key={key}
                      item={item}
                      expanded={!!expandedKeys[key]}
                      onToggleExpand={() => toggleExpand(key)}
                    />
                  );
                })}
              </div>

              {visibleCashPayments.length > pageSize && (
                <Pagination
                  page={cashPage}
                  total={visibleCashPayments.length}
                  pageSize={pageSize}
                  onChange={setCashPage}
                />
              )}
            </div>
          )}

          {visibleInstallments.length === 0 && visibleCashPayments.length === 0 && (
            <div className="rounded-2xl p-8 text-center border border-dashed border-border bg-muted/20">
              <FiAlertCircle size={36} className="mx-auto text-muted-foreground mb-3" />
              <h4 className="text-sm font-bold text-foreground mb-1">
                {query
                  ? 'No Matching Records Found'
                  : viewTab === 'cash'
                    ? 'No Cash Payments Recorded'
                    : viewTab === 'completed'
                      ? 'No Paid in Full Installments Yet'
                      : 'No Active Records Found'}
              </h4>
              <p className="text-xs text-muted-foreground">
                {query
                  ? 'Try adjusting your search keywords or switching record tabs.'
                  : viewTab === 'cash'
                    ? 'Your direct cash product purchases and walk-in cash payments will appear here.'
                    : 'Your active installment accounts and cash payments will appear here once recorded.'}
              </p>
            </div>
          )}
        </div>
      </div>

      {clearanceModal && (
        <InstallmentClearanceModal
          isOpen={!!clearanceModal}
          onClose={() => setClearanceModal(null)}
          installmentId={clearanceModal.installmentId}
          initialView={clearanceModal.view}
        />
      )}
    </div>
  );
}
