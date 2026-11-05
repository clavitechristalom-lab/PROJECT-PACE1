import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  FiFileText, FiPrinter, FiDownload, FiSearch, FiFilter,
  FiArrowUpRight, FiArrowDownLeft, FiCalendar, FiCheckCircle,
  FiPackage, FiUser, FiMapPin, FiLayers
} from 'react-icons/fi';
import { TbCurrencyPeso } from 'react-icons/tb';
import { api } from '../../../lib/api';
import { fmt } from '../../../lib/utils';
import { Spinner, Badge } from '../../ui';
import { useRealtimeSync, fastDeepEqual } from '../../../lib/realtimeSync';

export default function StatementsView({ 
  installments = [], 
  user = null, 
  stats = null 
}) {
  const [statements, setStatements] = useState([]);
  const [customerData, setCustomerData] = useState(null);
  const [summaryData, setSummaryData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('All'); // 'All' | 'Purchase' | 'Payment'
  const [searchQuery, setSearchQuery] = useState('');
  const inFlightRef = useRef(false);

  // Fallback builder from installments
  const buildFallbackStatements = useCallback(() => {
    const list = [];
    (installments || []).forEach(inst => {
      // Purchase entry (Debit)
      if (Number(inst.total_amount || inst.total_payable || 0) > 0) {
        list.push({
          id: `INST-${inst.installment_id || inst.account_no}`,
          date: inst.purchase_date || '—',
          rawDate: inst.purchase_date ? new Date(inst.purchase_date).getTime() : 0,
          reference: inst.account_no || 'ORD-000',
          type: 'Purchase',
          category: 'Debit',
          description: inst.product || 'Product Purchase',
          payment_method: inst.payment_method || 'Installment Plan',
          amount: Number(inst.total_payable ?? inst.total_amount ?? 0),
          status: inst.status || 'Active',
          account_no: inst.account_no,
        });
      }

      // Payments from inst.payments (Credit)
      if (Array.isArray(inst.payments) && inst.payments.length > 0) {
        inst.payments.forEach(p => {
          list.push({
            id: `PAY-${p.payment_id || p.receipt_no}`,
            date: p.payment_date || '—',
            rawDate: p.payment_date ? new Date(p.payment_date).getTime() : 0,
            reference: p.receipt_no || (`REC-${p.payment_id}`),
            type: 'Payment',
            category: 'Credit',
            description: p.notes || `Amortization for ${inst.account_no} (${inst.product})`,
            payment_method: p.payment_method || 'Cash / E-Wallet',
            amount: Number(p.amount || 0),
            status: p.status || 'Completed',
            account_no: inst.account_no,
          });
        });
      }
    });

    return list.sort((a, b) => b.rawDate - a.rawDate);
  }, [installments]);

  const loadStatements = useCallback(async (silent = false, signal) => {
    if (inFlightRef.current && silent) return;
    inFlightRef.current = true;
    if (!silent) setLoading(true);

    try {
      const res = await api.customerApp.getStatements({ signal });
      if (signal?.aborted) return;

      if (res && res.statements && Array.isArray(res.statements) && res.statements.length > 0) {
        setStatements(prev => fastDeepEqual(prev, res.statements) ? prev : res.statements);
        if (res.customer) setCustomerData(res.customer);
        if (res.summary) setSummaryData(res.summary);
      } else {
        const fallback = buildFallbackStatements();
        setStatements(prev => fastDeepEqual(prev, fallback) ? prev : fallback);
      }
    } catch (err) {
      if (err?.name !== 'AbortError') {
        const fallback = buildFallbackStatements();
        setStatements(fallback);
      }
    } finally {
      inFlightRef.current = false;
      if (!silent) setLoading(false);
    }
  }, [buildFallbackStatements]);

  useEffect(() => {
    loadStatements(false);
  }, [loadStatements]);

  useRealtimeSync((_source, signal) => {
    loadStatements(true, signal);
  }, [loadStatements]);

  // Derived financials
  const totalDebits = statements
    .filter(s => s.category === 'Debit' || s.type === 'Purchase')
    .reduce((sum, s) => sum + (Number(s.amount) || 0), 0);

  const totalCredits = statements
    .filter(s => s.category === 'Credit' || s.type === 'Payment')
    .reduce((sum, s) => sum + (Number(s.amount) || 0), 0);

  const netBalance = Math.max(0, totalDebits - totalCredits);

  // Filtered statements
  const filtered = statements.filter(item => {
    if (filterType === 'Purchase' && item.category !== 'Debit' && item.type !== 'Purchase') return false;
    if (filterType === 'Payment' && item.category !== 'Credit' && item.type !== 'Payment') return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchRef = (item.reference || '').toLowerCase().includes(q);
      const matchDesc = (item.description || '').toLowerCase().includes(q);
      const matchAcct = (item.account_no || '').toLowerCase().includes(q);
      const matchDate = (item.date || '').toLowerCase().includes(q);
      if (!matchRef && !matchDesc && !matchAcct && !matchDate) return false;
    }

    return true;
  });

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 animate-[fadeIn_0.25s_ease]">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300 bg-[#FBE8B5]/70 dark:bg-amber-950/60 px-3 py-1 rounded-full border border-amber-500/20">
              Account Ledger
            </span>
            <span className="text-xs text-muted-foreground font-semibold">
              Official Statement of Account
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">
            Customer Statement of Account
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Complete transaction history, debit purchases, credit payments, and running balance ledger.
          </p>
        </div>

        {/* Actions & Print */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrint}
            className="px-4 py-2 rounded-2xl bg-card hover:bg-muted border border-border text-xs font-bold text-foreground transition-all flex items-center gap-2 cursor-pointer shadow-xs hover:border-amber-400/40"
          >
            <FiPrinter className="w-4 h-4 text-amber-600" />
            <span>Print Statement</span>
          </button>
        </div>
      </div>

      {/* Bento Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Purchases / Debits */}
        <div className="bg-[#D1E8E2]/50 dark:bg-[#162a26] border border-[#B0DDD3]/60 dark:border-teal-800/40 rounded-[2.5rem] p-5 shadow-xs transition-all hover:scale-[1.01]">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-2xl bg-white/80 dark:bg-white/10 flex items-center justify-center text-teal-800 dark:text-teal-300 font-bold shadow-xs">
              <FiPackage className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-teal-800/10 text-teal-900 dark:text-teal-200">
              Debits
            </span>
          </div>
          <p className="text-xs font-semibold text-teal-950/70 dark:text-teal-300/70">Total Purchases</p>
          <p className="text-2xl sm:text-3xl font-black text-teal-950 dark:text-teal-100 mt-0.5 truncate">
            {fmt(totalDebits)}
          </p>
          <p className="text-[11px] text-teal-900/60 dark:text-teal-400/60 mt-1">
            Total goods & installment agreements
          </p>
        </div>

        {/* Card 2: Total Payments / Credits */}
        <div className="bg-[#E2D6F5]/50 dark:bg-[#221c2e] border border-[#CAB8E8]/60 dark:border-purple-800/40 rounded-[2.5rem] p-5 shadow-xs transition-all hover:scale-[1.01]">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-2xl bg-white/80 dark:bg-white/10 flex items-center justify-center text-purple-800 dark:text-purple-300 font-bold shadow-xs">
              <FiCheckCircle className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-purple-800/10 text-purple-900 dark:text-purple-200">
              Credits
            </span>
          </div>
          <p className="text-xs font-semibold text-purple-950/70 dark:text-purple-300/70">Total Payments</p>
          <p className="text-2xl sm:text-3xl font-black text-purple-950 dark:text-purple-100 mt-0.5 truncate">
            {fmt(totalCredits)}
          </p>
          <p className="text-[11px] text-purple-900/60 dark:text-purple-400/60 mt-1">
            Settled via cash, e-wallet, or bank
          </p>
        </div>

        {/* Card 3: Outstanding Balance */}
        <div className="bg-[#FBE8B5]/50 dark:bg-[#2b2718] border border-[#ECD18C]/60 dark:border-amber-800/40 rounded-[2.5rem] p-5 shadow-xs transition-all hover:scale-[1.01]">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-2xl bg-white/80 dark:bg-white/10 flex items-center justify-center text-amber-800 dark:text-amber-300 font-bold shadow-xs">
              <TbCurrencyPeso className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-800/10 text-amber-900 dark:text-amber-200">
              Balance
            </span>
          </div>
          <p className="text-xs font-semibold text-amber-950/70 dark:text-amber-300/70">Current Net Balance</p>
          <p className="text-2xl sm:text-3xl font-black text-amber-950 dark:text-amber-100 mt-0.5 truncate">
            {fmt(netBalance)}
          </p>
          <p className="text-[11px] text-amber-900/60 dark:text-amber-400/60 mt-1">
            Total unpaid customer balance
          </p>
        </div>

        {/* Card 4: Ledger Entries Count */}
        <div className="bg-[#F8D7E3]/50 dark:bg-[#2c1c24] border border-[#F1B9CD]/60 dark:border-pink-800/40 rounded-[2.5rem] p-5 shadow-xs transition-all hover:scale-[1.01]">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-2xl bg-white/80 dark:bg-white/10 flex items-center justify-center text-rose-800 dark:text-rose-300 font-bold shadow-xs">
              <FiFileText className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-rose-800/10 text-rose-900 dark:text-rose-200">
              Ledger
            </span>
          </div>
          <p className="text-xs font-semibold text-rose-950/70 dark:text-rose-300/70">Total Transactions</p>
          <p className="text-2xl sm:text-3xl font-black text-rose-950 dark:text-rose-100 mt-0.5">
            {statements.length}
          </p>
          <p className="text-[11px] text-rose-900/60 dark:text-rose-400/60 mt-1">
            Recorded debits & payment credits
          </p>
        </div>
      </div>

      {/* Account Owner Info Banner */}
      <div className="bg-card border border-border/80 rounded-[2rem] p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 flex items-center justify-center font-bold">
            <FiUser className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-extrabold text-sm sm:text-base text-foreground">
              {customerData?.name || user?.name || user?.full_name || 'Customer Account'}
            </h3>
            <p className="text-xs text-muted-foreground">
              Customer ID: <span className="font-mono font-bold text-foreground">{customerData?.id || user?.id || 'CUST-001'}</span> • Quezon Ave, Iligan City
            </p>
          </div>
        </div>

        <div className="text-left sm:text-right">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Statement Period</span>
          <p className="text-xs font-bold text-foreground">Lifetime Account History</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex items-center justify-between flex-wrap gap-3 pb-1 border-b border-border/80">
        <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-muted/60 border border-border/70">
          {[
            { id: 'All', label: 'All Transactions' },
            { id: 'Purchase', label: 'Purchases (Debits)' },
            { id: 'Payment', label: 'Payments (Credits)' },
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterType(tab.id)}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                filterType === tab.id
                  ? 'bg-card text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
          <input
            type="text"
            placeholder="Search reference or item..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-xs rounded-2xl bg-card border border-border/80 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-amber-500/30 transition-all shadow-xs"
          />
        </div>
      </div>

      {/* Transactions Table */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-3">
          <Spinner className="w-8 h-8 text-amber-600" />
          <p className="text-xs text-muted-foreground font-semibold">Generating statement of account...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center rounded-[2.5rem] border border-dashed border-border p-8 bg-card space-y-3">
          <div className="w-14 h-14 rounded-3xl bg-muted flex items-center justify-center mx-auto text-muted-foreground">
            <FiFileText className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-foreground">No Transactions Found</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            {searchQuery
              ? 'No ledger records matched your search query.'
              : 'You do not have any ledger transactions on record.'}
          </p>
        </div>
      ) : (
        <div className="bg-card border border-border/80 rounded-[2.5rem] overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/50 border-b border-border text-[11px] uppercase font-bold text-muted-foreground tracking-wider">
                <tr>
                  <th className="px-5 py-3.5">Date</th>
                  <th className="px-5 py-3.5">Reference #</th>
                  <th className="px-5 py-3.5">Description</th>
                  <th className="px-5 py-3.5">Type</th>
                  <th className="px-5 py-3.5">Channel / Method</th>
                  <th className="px-5 py-3.5 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filtered.map((item, idx) => {
                  const isDebit = item.category === 'Debit' || item.type === 'Purchase';
                  return (
                    <tr key={item.id || idx} className="hover:bg-muted/30 transition-colors">
                      <td className="px-5 py-3.5 font-semibold text-foreground whitespace-nowrap">
                        {item.date || '—'}
                      </td>
                      <td className="px-5 py-3.5 font-mono font-bold text-foreground whitespace-nowrap">
                        {item.reference || item.id}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="font-semibold text-foreground block">{item.description}</span>
                        {item.account_no && (
                          <span className="text-[10px] text-muted-foreground font-mono">
                            Acct: {item.account_no}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          isDebit
                            ? 'bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200'
                            : 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200'
                        }`}>
                          {isDebit ? <FiArrowUpRight className="w-3 h-3 text-amber-600" /> : <FiArrowDownLeft className="w-3 h-3 text-emerald-600" />}
                          {isDebit ? 'Debit' : 'Credit'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-muted-foreground whitespace-nowrap">
                        {item.payment_method || 'Standard'}
                      </td>
                      <td className={`px-5 py-3.5 font-mono font-extrabold text-sm text-right whitespace-nowrap ${
                        isDebit ? 'text-amber-900 dark:text-amber-200' : 'text-emerald-600 dark:text-emerald-400'
                      }`}>
                        {isDebit ? `+${fmt(item.amount)}` : `-${fmt(item.amount)}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

