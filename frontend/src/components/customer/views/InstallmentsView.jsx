import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  FiCreditCard, FiCalendar, FiPackage, FiCheckCircle, FiClock,
  FiFileText, FiShoppingBag, FiTrendingUp, FiAward, FiShield,
} from 'react-icons/fi';
import { TbCurrencyPeso } from 'react-icons/tb';
import { api } from '../../../lib/api';
import { fmt } from '../../../lib/utils';
import { Spinner } from '../../ui';
import { useRealtimeSync, fastDeepEqual } from '../../../lib/realtimeSync';
import InstallmentClearanceModal from '../../installments/InstallmentClearanceModal';

function isContractFullyPaid(inst) {
  const st = String(inst?.status || '').trim().toLowerCase();
  return st === 'fully paid' || st === 'completed' || st === 'complete payment' || Number(inst?.balance ?? 1) <= 0;
}

function formatShortDate(val) {
  if (!val) return '—';
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return String(val);
  return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function InstallmentsView({
  installments: propInstallments = [],
  onMakePayment,
  onViewLedger,
  onBrowseProducts,
}) {
  const [installments, setInstallments] = useState(propInstallments);
  const [loading, setLoading] = useState(propInstallments.length === 0);
  const [activeFilter, setActiveFilter] = useState('All');
  const [clearanceModal, setClearanceModal] = useState(null);
  const inFlightRef = useRef(false);

  const loadData = useCallback(async (silent = false, signal) => {
    if (inFlightRef.current && silent) return;
    inFlightRef.current = true;
    if (!silent && installments.length === 0) setLoading(true);

    try {
      const res = await api.customerApp.getInstallments({ signal });
      if (signal?.aborted) return;
      const nextList = res.installments || [];
      setInstallments(prev => (fastDeepEqual(prev, nextList) ? prev : nextList));
    } catch (err) {
      if (err?.name !== 'AbortError') console.error('Failed to load customer installments', err);
    } finally {
      inFlightRef.current = false;
      if (!silent) setLoading(false);
    }
  }, [installments.length]);

  useEffect(() => {
    if (propInstallments.length > 0) {
      setInstallments(propInstallments);
      setLoading(false);
    } else {
      loadData(false);
    }
  }, [propInstallments, loadData]);

  useRealtimeSync((_source, signal) => {
    loadData(true, signal);
  }, [loadData], { module: 'installments' });

  useRealtimeSync((_source, signal) => {
    loadData(true, signal);
  }, [loadData], { module: 'customer_installments' });

  useEffect(() => {
    const onCompleted = () => loadData(true);
    window.addEventListener('pace:installment-completed', onCompleted);
    return () => window.removeEventListener('pace:installment-completed', onCompleted);
  }, [loadData]);

  const activeAccounts = installments.filter(i => !isContractFullyPaid(i));
  const overdueAccounts = activeAccounts.filter(i => i.status === 'Overdue');
  const completedAccounts = installments.filter(i => isContractFullyPaid(i));

  const totalBalance = activeAccounts.reduce((sum, i) => sum + (Number(i.balance) || 0), 0);
  const monthlyAmortization = activeAccounts.reduce((sum, i) => sum + (Number(i.monthly_payment) || 0), 0);
  const totalPaid = installments.reduce((sum, i) => sum + (Number(i.total_paid ?? i.paid_amount ?? 0)), 0);

  const visibleOngoing = activeFilter === 'Overdue'
    ? overdueAccounts
    : activeFilter === 'Completed'
      ? []
      : activeAccounts;

  const visibleCompleted = (activeFilter === 'Active' || activeFilter === 'Overdue')
    ? []
    : completedAccounts;

  const renderInstallmentCard = (inst) => {
    const isCompleted = isContractFullyPaid(inst);
    const isOverdue = !isCompleted && inst.status === 'Overdue';
    const totalPayable = Number(inst.total_payable ?? inst.total_amount ?? 0);
    const totalPaidVal = Number(inst.total_paid ?? inst.paid_amount ?? 0);
    const remainingVal = isCompleted ? 0 : Math.max(0, Number(inst.balance) || 0);
    const progressPct = isCompleted
      ? 100
      : (totalPayable > 0 ? Math.min(100, Math.round((totalPaidVal / totalPayable) * 100)) : 0);

    return (
      <div
        key={inst.installment_id || inst.account_no}
        className={`bg-card border rounded-[2.5rem] p-6 shadow-xs transition-all space-y-4 ${
          isCompleted
            ? 'border-emerald-500/35 hover:border-emerald-500/60 hover:shadow-md'
            : 'border-border/80 hover:border-purple-500/40 hover:shadow-md'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3.5">
            {inst.image_url ? (
              <img
                src={inst.image_url.includes('/storage/') ? inst.image_url.substring(inst.image_url.indexOf('/storage/')) : inst.image_url}
                alt={inst.product}
                className="w-14 h-14 rounded-2xl object-cover border border-border bg-muted shrink-0"
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            ) : (
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border shrink-0 ${
                isCompleted
                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-400/40'
                  : 'bg-[#E2D6F5]/60 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 border-purple-300/40'
              }`}>
                <FiPackage className="w-7 h-7" />
              </div>
            )}
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-extrabold text-base text-foreground">{inst.product}</h3>
                <span className="font-mono text-[11px] font-bold px-2.5 py-0.5 rounded-lg bg-muted text-muted-foreground border border-border">
                  {inst.account_no}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 flex items-center flex-wrap gap-2">
                <span>Started: <strong className="text-foreground">{inst.purchase_date || 'N/A'}</strong></span>
                {inst.payment_term && (
                  <>
                    <span>•</span>
                    <span>Term: <strong className="text-foreground">{inst.payment_term}</strong></span>
                  </>
                )}
                {isCompleted && inst.completed_at && (
                  <>
                    <span>•</span>
                    <span>Completed: <strong className="text-emerald-600 dark:text-emerald-400">{formatShortDate(inst.completed_at)}</strong></span>
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {isCompleted && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-teal-500/10 text-teal-700 dark:text-teal-300 border border-teal-500/20">
                <FiShield className="w-3 h-3" />
                <span>{inst.customer_standing || 'Cleared / Good Standing'}</span>
              </span>
            )}
            <span className={`px-3 py-1 rounded-full text-xs font-bold tracking-wide uppercase inline-flex items-center gap-1 ${
              isCompleted
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-500/30'
                : isOverdue
                  ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300 border border-rose-500/20'
                  : 'bg-blue-100 text-blue-800 dark:bg-blue-950/70 dark:text-blue-300 border border-blue-500/20'
            }`}>
              {isCompleted && <FiCheckCircle className="w-3.5 h-3.5" />}
              <span>{isCompleted ? 'Paid in Full' : isOverdue ? 'Overdue Due' : 'Active Plan'}</span>
            </span>
          </div>
        </div>

        <div className="space-y-1.5 bg-muted/30 p-3.5 rounded-2xl border border-border/50">
          <div className="flex justify-between items-center text-xs">
            <span className="text-muted-foreground font-semibold flex items-center gap-1.5">
              <FiTrendingUp className="w-3.5 h-3.5 text-teal-600" />
              Repayment Progress
            </span>
            <span className="font-mono font-bold text-foreground">
              {fmt(totalPaidVal)} / {fmt(totalPayable)} ({progressPct}%)
            </span>
          </div>
          <div className="w-full h-3 rounded-full bg-muted overflow-hidden p-0.5">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                isCompleted
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-500'
                  : isOverdue
                    ? 'bg-gradient-to-r from-amber-500 to-rose-500'
                    : 'bg-gradient-to-r from-teal-500 to-emerald-500'
              }`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs p-4 rounded-2xl bg-muted/20 border border-border/60">
          <div>
            <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Total Payable</p>
            <p className="font-mono font-extrabold text-foreground text-sm mt-0.5">{fmt(totalPayable)}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Total Settled</p>
            <p className="font-mono font-extrabold text-emerald-600 dark:text-emerald-400 text-sm mt-0.5">{fmt(totalPaidVal)}</p>
            {!isCompleted && Number(inst.pending_payments_amount) > 0 && (
              <p className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 mt-0.5">
                +{fmt(inst.pending_payments_amount)} pending verif.
              </p>
            )}
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Remaining Balance</p>
            <p className={`font-mono font-extrabold text-sm mt-0.5 ${remainingVal > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
              {fmt(remainingVal)}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
              {isCompleted ? 'Completed Date' : 'Next Due Date'}
            </p>
            <p className="font-semibold text-foreground text-sm mt-0.5">
              {isCompleted ? formatShortDate(inst.completed_at) : (inst.next_due_date || 'Scheduled')}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between flex-wrap gap-2 pt-1 border-t border-border/60">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <FiClock className="w-3.5 h-3.5" />
            {isCompleted ? (
              <span>
                Final Verifier: <strong className="text-foreground">{inst.final_verifier_name || 'Store Administrator'}</strong>
              </span>
            ) : (
              <span>Amortization: <strong className="text-foreground">{fmt(inst.monthly_payment)}</strong>/mo</span>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {onViewLedger && (
              <button
                type="button"
                onClick={() => onViewLedger(inst)}
                className="px-3.5 py-2 rounded-xl border border-border hover:bg-muted text-xs font-bold text-foreground transition-all flex items-center gap-1.5 cursor-pointer hover:border-purple-400/40"
              >
                <FiFileText className="w-3.5 h-3.5 text-purple-600" />
                <span>View Ledger</span>
              </button>
            )}

            {isCompleted ? (
              <>
                <button
                  type="button"
                  onClick={() => setClearanceModal({ installmentId: inst.installment_id, view: 'certificate' })}
                  className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <FiAward className="w-3.5 h-3.5" />
                  <span>Certificate of Full Payment</span>
                </button>
                <button
                  type="button"
                  onClick={() => setClearanceModal({ installmentId: inst.installment_id, view: 'soa' })}
                  className="px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <FiFileText className="w-3.5 h-3.5" />
                  <span>Final SOA</span>
                </button>
              </>
            ) : (
              remainingVal > 0 && onMakePayment && (
                <button
                  type="button"
                  onClick={() => onMakePayment(inst)}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm hover:scale-[1.02]"
                >
                  <FiCreditCard className="w-3.5 h-3.5" />
                  <span>Pay Amortization ({fmt(inst.monthly_payment)})</span>
                </button>
              )
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-[fadeIn_0.25s_ease]">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-purple-800 dark:text-purple-300 bg-[#E2D6F5]/70 dark:bg-purple-950/60 px-3 py-1 rounded-full border border-purple-500/20">
              Installment Monitoring
            </span>
            <span className="text-xs text-muted-foreground font-semibold">
              {activeAccounts.length} Active • {completedAccounts.length} Paid in Full
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">
            My Installments &amp; Accounts
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Track your repayment progress, due dates, and closing clearance documents across all appliance and furniture accounts.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#D1E8E2]/50 dark:bg-[#162a26] border border-[#B0DDD3]/60 dark:border-teal-800/40 rounded-[2.5rem] p-5 shadow-xs transition-all hover:scale-[1.01]">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-2xl bg-white/80 dark:bg-white/10 flex items-center justify-center text-teal-800 dark:text-teal-300 font-bold shadow-xs">
              <FiPackage className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-teal-800/10 text-teal-900 dark:text-teal-200">
              Active Plans
            </span>
          </div>
          <p className="text-xs font-semibold text-teal-950/70 dark:text-teal-300/70">Active Accounts</p>
          <p className="text-2xl sm:text-3xl font-black text-teal-950 dark:text-teal-100 mt-0.5">
            {activeAccounts.length}
          </p>
          <p className="text-[11px] text-teal-900/60 dark:text-teal-400/60 mt-1">
            {overdueAccounts.length > 0 ? `${overdueAccounts.length} overdue attention` : 'All accounts in good standing'}
          </p>
        </div>

        <div className="bg-[#F8D7E3]/50 dark:bg-[#2c1c24] border border-[#F1B9CD]/60 dark:border-pink-800/40 rounded-[2.5rem] p-5 shadow-xs transition-all hover:scale-[1.01]">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-2xl bg-white/80 dark:bg-white/10 flex items-center justify-center text-rose-800 dark:text-rose-300 font-bold shadow-xs">
              <FiCalendar className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-rose-800/10 text-rose-900 dark:text-rose-200">
              Amortization
            </span>
          </div>
          <p className="text-xs font-semibold text-rose-950/70 dark:text-rose-300/70">Monthly Due</p>
          <p className="text-2xl sm:text-3xl font-black text-rose-950 dark:text-rose-100 mt-0.5 truncate">
            {fmt(monthlyAmortization)}
          </p>
          <p className="text-[11px] text-rose-900/60 dark:text-rose-400/60 mt-1">
            Scheduled monthly repayment
          </p>
        </div>

        <div className="bg-[#FBE8B5]/50 dark:bg-[#2b2718] border border-[#ECD18C]/60 dark:border-amber-800/40 rounded-[2.5rem] p-5 shadow-xs transition-all hover:scale-[1.01]">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-2xl bg-white/80 dark:bg-white/10 flex items-center justify-center text-amber-800 dark:text-amber-300 font-bold shadow-xs">
              <TbCurrencyPeso className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-800/10 text-amber-900 dark:text-amber-200">
              Outstanding
            </span>
          </div>
          <p className="text-xs font-semibold text-amber-950/70 dark:text-amber-300/70">Remaining Balance</p>
          <p className="text-2xl sm:text-3xl font-black text-amber-950 dark:text-amber-100 mt-0.5 truncate">
            {fmt(totalBalance)}
          </p>
          <p className="text-[11px] text-amber-900/60 dark:text-amber-400/60 mt-1">
            Across active installments
          </p>
        </div>

        <div className="bg-[#E2D6F5]/50 dark:bg-[#221c2e] border border-[#CAB8E8]/60 dark:border-purple-800/40 rounded-[2.5rem] p-5 shadow-xs transition-all hover:scale-[1.01]">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-2xl bg-white/80 dark:bg-white/10 flex items-center justify-center text-purple-800 dark:text-purple-300 font-bold shadow-xs">
              <FiCheckCircle className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-purple-800/10 text-purple-900 dark:text-purple-200">
              Paid in Full
            </span>
          </div>
          <p className="text-xs font-semibold text-purple-950/70 dark:text-purple-300/70">Total Paid</p>
          <p className="text-2xl sm:text-3xl font-black text-purple-950 dark:text-purple-100 mt-0.5 truncate">
            {fmt(totalPaid)}
          </p>
          <p className="text-[11px] text-purple-900/60 dark:text-purple-400/60 mt-1">
            {completedAccounts.length} completed / paid in full
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3 pb-1 border-b border-border/80">
        <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-muted/60 border border-border/70 flex-wrap">
          {[
            { id: 'All', label: 'All Accounts', count: installments.length },
            { id: 'Active', label: 'Active / Ongoing', count: activeAccounts.length },
            { id: 'Overdue', label: 'Overdue', count: overdueAccounts.length },
            { id: 'Completed', label: 'Completed / Paid in Full', count: completedAccounts.length },
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveFilter(tab.id)}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer ${
                activeFilter === tab.id
                  ? 'bg-card text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <span>{tab.label}</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                activeFilter === tab.id
                  ? (tab.id === 'Completed' ? 'bg-emerald-600 text-white' : 'bg-purple-600 text-white')
                  : tab.id === 'Overdue' && tab.count > 0
                    ? 'bg-rose-500 text-white'
                    : 'bg-muted-foreground/20 text-muted-foreground'
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {onBrowseProducts && (
          <button
            type="button"
            onClick={onBrowseProducts}
            className="px-4 py-2 rounded-2xl bg-card hover:bg-muted border border-border text-xs font-bold text-foreground transition-all flex items-center gap-2 cursor-pointer shadow-xs hover:border-purple-400/40"
          >
            <FiShoppingBag className="w-3.5 h-3.5 text-purple-600" />
            <span>Browse Product List</span>
          </button>
        )}
      </div>

      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-3">
          <Spinner className="w-8 h-8 text-purple-600" />
          <p className="text-xs text-muted-foreground font-semibold">Loading installment accounts...</p>
        </div>
      ) : visibleOngoing.length === 0 && visibleCompleted.length === 0 ? (
        <div className="py-16 text-center rounded-[2.5rem] border border-dashed border-border p-8 bg-card space-y-4">
          <div className="w-14 h-14 rounded-3xl bg-muted flex items-center justify-center mx-auto text-muted-foreground">
            <FiCreditCard className="w-7 h-7" />
          </div>
          <div>
            <h3 className="text-base font-bold text-foreground">No Installment Accounts Found</h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1">
              {activeFilter === 'All'
                ? "You don't have any installment accounts registered yet. Explore our product list to start a new plan."
                : `No installment plans found under "${activeFilter}".`}
            </p>
          </div>
          {onBrowseProducts && (
            <button
              type="button"
              onClick={onBrowseProducts}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition-all shadow-md cursor-pointer"
            >
              <FiShoppingBag className="w-4 h-4" />
              <span>Explore Products</span>
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-7">
          {visibleOngoing.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-extrabold uppercase tracking-wider text-foreground flex items-center gap-2">
                  <FiCreditCard className="w-4 h-4 text-purple-600" />
                  <span>{activeFilter === 'Overdue' ? 'Overdue Installments' : 'Active / Ongoing Installments'}</span>
                  <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-[10px] font-bold">
                    {visibleOngoing.length}
                  </span>
                </h2>
              </div>
              <div className="grid grid-cols-1 gap-4">
                {visibleOngoing.map(renderInstallmentCard)}
              </div>
            </section>
          )}

          {visibleCompleted.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-extrabold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                  <FiAward className="w-4 h-4" />
                  <span>Completed / Paid in Full</span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold">
                    {visibleCompleted.length}
                  </span>
                </h2>
                <span className="text-[11px] text-muted-foreground font-medium">
                  Cleared accounts with printable closing documents
                </span>
              </div>
              <div className="grid grid-cols-1 gap-4">
                {visibleCompleted.map(renderInstallmentCard)}
              </div>
            </section>
          )}
        </div>
      )}

      <InstallmentClearanceModal
        isOpen={Boolean(clearanceModal?.installmentId)}
        installmentId={clearanceModal?.installmentId || null}
        initialView={clearanceModal?.view || 'both'}
        onClose={() => setClearanceModal(null)}
      />
    </div>
  );
}
