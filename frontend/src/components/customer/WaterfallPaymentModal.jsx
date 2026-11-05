import React, { useState, useMemo, useEffect } from 'react';
import { FiX, FiCheckCircle, FiShield, FiCreditCard, FiAlertCircle, FiArrowRight, FiCopy, FiInfo } from 'react-icons/fi';
import { TbCurrencyPeso } from 'react-icons/tb';
import { fmt } from '../../lib/utils';
import { showToast } from '../ui';
import { api } from '../../lib/api';

const PAYMENT_METHODS = [
  {
    id: 'GCash',
    name: 'GCash',
    badge: 'Instant QR / E-Wallet',
    accountName: "Z-LICS FURNITURE & APPLIANCES",
    accountNumber: "0917-889-4512",
    theme: 'border-blue-500 bg-blue-50/70 text-blue-900 dark:bg-blue-950/40 dark:text-blue-300'
  },
  {
    id: 'Maya',
    name: 'Maya',
    badge: 'Wallet / Card',
    accountName: "Z-LICS TRADING CORP",
    accountNumber: "0998-554-1234",
    theme: 'border-emerald-500 bg-emerald-50/70 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300'
  },
  {
    id: 'Bank Transfer',
    name: 'BDO / BPI Bank',
    badge: 'Direct Bank Deposit',
    accountName: "Z-LICS FURNITURE & APPLIANCES TRADING",
    accountNumber: "0014-8802-9931 (BDO Iligan Branch)",
    theme: 'border-indigo-500 bg-indigo-50/70 text-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-300'
  }
];

export default function WaterfallPaymentModal({ 
  isOpen, 
  onClose, 
  installment = null, 
  installments = [], 
  onPaymentSuccess 
}) {
  const [selectedMethod, setSelectedMethod] = useState(PAYMENT_METHODS[0]);
  const [referenceNumber, setReferenceNumber] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedInstallmentId, setSelectedInstallmentId] = useState(installment?.installment_id || null);

  useEffect(() => {
    if (installment?.installment_id) {
      setSelectedInstallmentId(installment.installment_id);
    } else if (Array.isArray(installments) && installments.length > 0) {
      const active = installments.find(i => Number(i.balance) > 0) || installments[0];
      setSelectedInstallmentId(active?.installment_id || null);
    }
  }, [installment, installments]);

  const currentInstallment = useMemo(() => {
    if (selectedInstallmentId && Array.isArray(installments) && installments.length > 0) {
      const found = installments.find(i => String(i.installment_id) === String(selectedInstallmentId));
      if (found) return found;
    }
    return installment || (Array.isArray(installments) && installments[0]) || null;
  }, [selectedInstallmentId, installment, installments]);

  const defaultAmount = currentInstallment?.monthly_payment || currentInstallment?.monthly_amortization || (currentInstallment?.balance ? Number(currentInstallment.balance) : 0);
  const [amount, setAmount] = useState(defaultAmount ? String(defaultAmount) : '');

  // Synchronize amount when target installment changes
  useEffect(() => {
    if (currentInstallment) {
      const def = currentInstallment.monthly_payment || currentInstallment.monthly_amortization || currentInstallment.balance || 0;
      setAmount(def ? String(def) : '');
    }
  }, [currentInstallment]);

  // Compute overdue penalties on this account
  const totalPenaltiesAssessed = Number(currentInstallment?.penalty_assessed || 0);
  const totalBalance = Number(currentInstallment?.balance ?? currentInstallment?.remaining_balance ?? 0);

  // Waterfall Engine Simulation
  const waterfallBreakdown = useMemo(() => {
    let pool = Number(amount) || 0;
    
    // Tier 1: Penalties First
    const penaltyAllocated = Math.min(pool, totalPenaltiesAssessed);
    pool -= penaltyAllocated;

    // Tier 2: Interest Due Second
    // Allocate to pending schedule interest or estimated from rate
    const pendingSchedule = currentInstallment?.paymentSchedules?.find(s => s.status === 'Pending' || s.status === 'Overdue');
    const estimatedInterestDue = pendingSchedule?.interest_due !== undefined
      ? Number(pendingSchedule.interest_due)
      : (currentInstallment?.interest_rate 
          ? Math.min(pool, Math.round(Number(currentInstallment.balance || 0) * (currentInstallment.interest_rate / 100))) 
          : Math.min(pool, Math.round(Number(defaultAmount || pool) * 0.2)));
    const interestAllocated = Math.min(pool, estimatedInterestDue);
    pool -= interestAllocated;

    // Tier 3: Principal Due Last
    const principalAllocated = pool;

    const remainingBal = Math.max(0, totalBalance - (penaltyAllocated + principalAllocated));

    return {
      penaltyPaid: penaltyAllocated,
      interestPaid: interestAllocated,
      principalPaid: principalAllocated,
      remainingBalance: remainingBal
    };
  }, [amount, totalPenaltiesAssessed, defaultAmount, totalBalance, currentInstallment]);

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    showToast('Account number copied to clipboard', 'info');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payVal = Number(amount);
    if (!payVal || payVal <= 0) {
      showToast('Please enter a valid payment amount', 'error');
      return;
    }
    if (!referenceNumber.trim()) {
      showToast('Please enter the reference / transaction number', 'error');
      return;
    }

    if (!currentInstallment?.installment_id) {
      showToast('No active installment account selected.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await api.payments.create({
        installment_id: currentInstallment.installment_id,
        amount: payVal,
        payment_method: selectedMethod.id,
        reference_no: referenceNumber.trim(),
        payment_date: new Date().toISOString().split('T')[0],
        notes: `Waterfall allocation via ${selectedMethod.name}: Penalties ₱${waterfallBreakdown.penaltyPaid}, Interest ₱${waterfallBreakdown.interestPaid}, Principal ₱${waterfallBreakdown.principalPaid}`
      });

      const paymentReceipt = {
        paymentId: res?.payment?.payment_id || Date.now(),
        accountNo: currentInstallment?.account_no || '',
        amountPaid: payVal,
        method: selectedMethod.id,
        referenceNumber: referenceNumber.trim(),
        penaltyCovered: waterfallBreakdown.penaltyPaid,
        interestCovered: waterfallBreakdown.interestPaid,
        principalCovered: waterfallBreakdown.principalPaid,
        newBalance: waterfallBreakdown.remainingBalance,
        date: new Date().toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
      };

      if (onPaymentSuccess) {
        await onPaymentSuccess(paymentReceipt);
      }

      showToast(`Payment of ${fmt(payVal)} allocated via Waterfall Engine successfully!`, 'success');
      setReferenceNumber('');
      setIsSubmitting(false);
      onClose();
    } catch (err) {
      console.error('Payment error:', err);
      showToast(err?.message || 'Payment submission failed. Please check your transaction details.', 'error');
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-[fadeIn_0.2s_ease]">
      <div className="bg-background rounded-3xl shadow-2xl border border-border w-full max-w-2xl max-h-[92vh] overflow-hidden flex flex-col animate-[scaleIn_0.2s_ease]">
        
        {/* Modal Header */}
        <div className="px-6 py-5 border-b border-border flex items-center justify-between bg-slate-50 dark:bg-slate-900/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#D1E8E2] text-teal-800 flex items-center justify-center font-bold shadow-xs">
              <TbCurrencyPeso size={22} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">Secure Installment Payment</h2>
              <p className="text-xs text-muted-foreground">Waterfall Payment Engine (Penalties → Interest → Principal)</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="w-9 h-9 rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors cursor-pointer"
          >
            <FiX size={20} />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6 flex-1">
          
          {/* Account Snapshot */}
          <div className="p-4 rounded-2xl bg-muted/40 border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase">Target Account</span>
              {Array.isArray(installments) && installments.length > 1 ? (
                <select
                  value={currentInstallment?.installment_id || ''}
                  onChange={(e) => setSelectedInstallmentId(e.target.value)}
                  className="mt-1 w-full bg-background border border-border text-xs font-bold text-foreground rounded-xl px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-blue-500/30 cursor-pointer"
                >
                  {installments.map((inst) => (
                    <option key={inst.installment_id} value={inst.installment_id}>
                      {inst.account_no ? `${inst.account_no} - ` : ''}{inst.product || 'Installment'} (Bal: {fmt(inst.balance)})
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-sm font-bold text-foreground truncate">
                  {currentInstallment?.account_no ? `${currentInstallment.account_no} - ` : ''}{currentInstallment?.product || 'Active Installment Account'}
                </p>
              )}
            </div>
            <div className="text-right shrink-0">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase">Current Balance</span>
              <p className="text-base font-mono font-bold text-red-600 dark:text-red-400">{fmt(totalBalance)}</p>
            </div>
          </div>

          {/* Payment Method Selector */}
          <div className="space-y-2.5">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <FiCreditCard className="w-3.5 h-3.5 text-blue-600" />
              1. Choose Payment Channel
            </label>
            <div className="grid grid-cols-3 gap-2.5">
              {PAYMENT_METHODS.map((pm) => (
                <button
                  key={pm.id}
                  type="button"
                  onClick={() => setSelectedMethod(pm)}
                  className={`p-3 rounded-2xl border text-center transition-all cursor-pointer ${
                    selectedMethod.id === pm.id
                      ? 'border-blue-600 bg-blue-50/80 dark:bg-blue-950/50 shadow-xs'
                      : 'border-border bg-card hover:bg-muted/40 text-muted-foreground'
                  }`}
                >
                  <div className="font-bold text-xs text-foreground">{pm.name}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{pm.badge}</div>
                </button>
              ))}
            </div>

            {/* Merchant Account Details */}
            <div className="p-3.5 rounded-2xl border border-blue-500/20 bg-blue-50/50 dark:bg-blue-950/30 flex items-center justify-between text-xs">
              <div className="space-y-0.5">
                <p className="text-[10px] uppercase font-bold text-blue-700 dark:text-blue-300">Official Merchant Account</p>
                <p className="font-semibold text-foreground">{selectedMethod.accountName}</p>
                <p className="font-mono text-xs text-muted-foreground">{selectedMethod.accountNumber}</p>
              </div>
              <button
                type="button"
                onClick={() => handleCopy(selectedMethod.accountNumber)}
                className="px-2.5 py-1.5 rounded-xl border border-blue-400/30 bg-background hover:bg-muted text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <FiCopy size={13} />
                <span>Copy</span>
              </button>
            </div>
          </div>

          {/* Payment Amount Input */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <TbCurrencyPeso className="w-3.5 h-3.5 text-emerald-600" />
                2. Enter Amount (₱)
              </label>
              <div className="flex gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => setAmount(String(defaultAmount))}
                  className="px-2 py-0.5 text-[10px] rounded-lg bg-muted hover:bg-blue-100 dark:hover:bg-blue-900/40 text-muted-foreground font-semibold cursor-pointer"
                >
                  Exact Amortization ({fmt(defaultAmount)})
                </button>
                {totalBalance > 0 && totalBalance !== Number(defaultAmount) && (
                  <button
                    type="button"
                    onClick={() => setAmount(String(totalBalance))}
                    className="px-2 py-0.5 text-[10px] rounded-lg bg-muted hover:bg-blue-100 dark:hover:bg-blue-900/40 text-muted-foreground font-semibold cursor-pointer"
                  >
                    Full Balance ({fmt(totalBalance)})
                  </button>
                )}
              </div>
            </div>
            <input
              type="number"
              min="1"
              step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full h-12 px-4 text-xl font-bold font-mono rounded-2xl border border-border bg-background focus:ring-2 focus:ring-emerald-500/30 outline-none"
            />
          </div>

          {/* WATERFALL ALLOCATION PREVIEW ENGINE */}
          <div className="space-y-2.5 p-4 rounded-3xl bg-slate-50 dark:bg-slate-900/80 border border-border">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <FiShield className="w-3.5 h-3.5 text-blue-600" />
                Live Waterfall Allocation Preview
              </span>
              <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-bold">C# Engine Sync</span>
            </div>

            <div className="grid grid-cols-3 gap-2.5 pt-1">
              {/* 1. Penalties First */}
              <div className="p-3 rounded-2xl bg-rose-50/80 dark:bg-rose-950/30 border border-rose-200/50 dark:border-rose-900/40">
                <div className="text-[10px] font-bold uppercase text-rose-700 dark:text-rose-400">1. Penalties First</div>
                <div className="text-sm font-mono font-bold text-rose-600 dark:text-rose-300 mt-1">
                  {fmt(waterfallBreakdown.penaltyPaid)}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">Overdue cleared</div>
              </div>

              {/* 2. Interest Second */}
              <div className="p-3 rounded-2xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200/50 dark:border-amber-900/40">
                <div className="text-[10px] font-bold uppercase text-amber-700 dark:text-amber-400">2. Interest Second</div>
                <div className="text-sm font-mono font-bold text-amber-600 dark:text-amber-300 mt-1">
                  {fmt(waterfallBreakdown.interestPaid)}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">Monthly finance fee</div>
              </div>

              {/* 3. Principal Last */}
              <div className="p-3 rounded-2xl bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200/50 dark:border-emerald-900/40">
                <div className="text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-400">3. Principal Last</div>
                <div className="text-sm font-mono font-bold text-emerald-600 dark:text-emerald-300 mt-1">
                  {fmt(waterfallBreakdown.principalPaid)}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">Appliance debt reduction</div>
              </div>
            </div>

            <div className="pt-2 flex justify-between items-center text-xs border-t border-border/60">
              <span className="text-muted-foreground">Estimated Balance After Payment:</span>
              <span className="font-mono font-bold text-foreground">{fmt(waterfallBreakdown.remainingBalance)}</span>
            </div>
          </div>

          {/* Reference Number */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              3. Reference / Transaction Number *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. GCash Ref 8021940122 or Bank Ref"
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
              className="w-full h-11 px-4 text-xs font-mono rounded-xl border border-border bg-background focus:ring-2 focus:ring-blue-500/30 outline-none"
            />
            <p className="text-[11px] text-muted-foreground flex items-center gap-1">
              <FiInfo className="w-3 h-3 text-blue-500" />
              Recorded in the backend ledger and audited by store cashier upon validation.
            </p>
          </div>

        </form>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-border bg-slate-50 dark:bg-slate-900/60 flex items-center justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-border hover:bg-muted text-xs font-bold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={handleSubmit}
            className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs shadow-md shadow-emerald-600/30 flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
          >
            <FiCheckCircle size={16} />
            <span>{isSubmitting ? 'Posting Waterfall...' : `Submit Payment (${fmt(amount || 0)})`}</span>
          </button>
        </div>

      </div>
    </div>
  );
}
