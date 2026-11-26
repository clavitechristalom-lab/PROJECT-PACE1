import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  FiFileText, FiPrinter, FiDownload, FiSearch, FiFilter,
  FiArrowUpRight, FiArrowDownLeft, FiCalendar, FiCheckCircle,
  FiPackage, FiUser, FiMapPin, FiLayers, FiEye, FiCreditCard, FiTag,
  FiPhone, FiMail, FiShield, FiExternalLink, FiClock, FiCheck
} from 'react-icons/fi';
import { TbCurrencyPeso } from 'react-icons/tb';
import { api } from '../../../lib/api';
import { fmt } from '../../../lib/utils';
import { escapeHtml, formatQty } from '../../../lib/invoicePrint';
import { Spinner, Badge, Modal } from '../../ui';
import { useRealtimeSync, fastDeepEqual } from '../../../lib/realtimeSync';

const formatProofUrl = (url) => {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) return trimmed;
  const normalized = trimmed.replace(/\\/g, '/');
  if (normalized.includes('/storage/')) return normalized.substring(normalized.indexOf('/storage/'));
  if (normalized.startsWith('http://') || normalized.startsWith('https://')) return normalized;
  return `/storage/${normalized.replace(/^\/+/, '')}`;
};

export default function StatementsView({
  installments = [],
  user = null,
  stats = null
}) {
  const [statements, setStatements] = useState([]);
  const [companyData, setCompanyData] = useState(null);
  const [customerData, setCustomerData] = useState(null);
  const [summaryData, setSummaryData] = useState(null);
  const [accountsData, setAccountsData] = useState([]);
  const [selectedStatement, setSelectedStatement] = useState(null);
  const [receiptStatement, setReceiptStatement] = useState(null);
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
        if (res.company) setCompanyData(res.company);
        if (res.customer) setCustomerData(res.customer);
        if (res.summary) setSummaryData(res.summary);
        if (Array.isArray(res.accounts)) setAccountsData(res.accounts);
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
  }, [loadStatements], { module: 'installments' });

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
      const matchRef = (item.reference_no || item.reference || '').toLowerCase().includes(q);
      const matchDesc = (item.description || '').toLowerCase().includes(q);
      const matchChan = (item.channel_method || item.payment_method || '').toLowerCase().includes(q);
      const matchAcct = (item.account_no || '').toLowerCase().includes(q);
      const matchDate = (item.date || '').toLowerCase().includes(q);
      if (!matchRef && !matchDesc && !matchChan && !matchAcct && !matchDate) return false;
    }

    return true;
  });

  const handlePrintSingleDocument = (item, linkedAccount) => {
    if (!item) return;
    const isDebit = item.category === 'Debit' || item.type === 'Purchase';
    const refDisplay = item.receipt_no || item.reference_no || item.reference || item.id || '—';
    const channelDisplay = item.channel_method || item.payment_method || 'Standard';
    const companyTitle = companyData?.name || 'Z-LICZ Furniture & Appliances Trading';
    const branchLabel = item.branch_name || customerData?.branch_name || 'Main Branch';
    const branchAddress = item.branch_location || companyData?.address || '';
    const branchContact = item.branch_contact || companyData?.phone || '';
    const custName = customerData?.name || user?.name || user?.full_name || 'Customer Account';
    const custCode = customerData?.customer_code || (customerData?.customer_id ? `CUS-${String(customerData.customer_id).padStart(3, '0')}` : '');
    const custPhone = customerData?.phone || user?.phone || '';
    const custAddress = customerData?.address || '';
    const docLabel = isDebit ? 'OFFICIAL TRANSACTION STATEMENT' : 'OFFICIAL PAYMENT RECEIPT';
    const itemsList = Array.isArray(item.items) ? item.items : [];
    const acc = item.account_summary || linkedAccount || null;

    const itemsTableHtml = itemsList.length > 0
      ? `<div class="section-title">Purchased Items</div>
         <table>
           <thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Unit Price</th><th class="num">Total</th></tr></thead>
           <tbody>
             ${itemsList.map(it => `<tr>
               <td><strong>${escapeHtml(it.product_name || 'Item')}</strong>${it.category ? `<div class="sub-line">${escapeHtml(it.category)}</div>` : ''}</td>
               <td class="num">${escapeHtml(formatQty(it.quantity ?? 1))}</td>
               <td class="num">${escapeHtml(fmt(it.unit_price || 0))}</td>
               <td class="num"><strong>${escapeHtml(fmt(it.line_total || 0))}</strong></td>
             </tr>`).join('')}
           </tbody>
         </table>`
      : '';

    const accountSummaryHtml = acc
      ? `<div class="box">
           <div class="box-title">Account Running Summary (${escapeHtml(acc.account_no || item.account_no || '—')})</div>
           <div class="row"><span>Product / Item</span><strong>${escapeHtml(acc.product || item.product_name || 'Installment Account')}</strong></div>
           ${acc.principal_amount ? `<div class="row"><span>Principal Price</span><span>${escapeHtml(fmt(acc.principal_amount))}</span></div>` : ''}
           ${acc.interest_amount ? `<div class="row"><span>Interest (${escapeHtml(acc.interest_rate || 0)}%)</span><span>${escapeHtml(fmt(acc.interest_amount))}</span></div>` : ''}
           <div class="row"><span>Total Contract Payable</span><strong>${escapeHtml(fmt(acc.total_payable || 0))}</strong></div>
           <div class="row"><span>Total Confirmed Paid</span><strong class="green">${escapeHtml(fmt(acc.total_paid ?? acc.paid ?? 0))}</strong></div>
           <div class="row total"><span>Remaining Balance</span><strong>${escapeHtml(fmt(acc.balance || 0))}</strong></div>
         </div>`
      : '';

    const html = `<!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${escapeHtml(docLabel)} - ${escapeHtml(refDisplay)}</title>
          <style>
            body { font-family: 'Segoe UI', system-ui, sans-serif; color: #0f172a; margin: 0; padding: 24px; background: #fff; }
            .sheet { max-width: 560px; margin: 0 auto; border: 1px solid #cbd5e1; border-radius: 14px; padding: 24px; }
            .center { text-align: center; }
            .brand { font-size: 18px; font-weight: 800; letter-spacing: 0.02em; margin: 0; }
            .meta-sub { font-size: 11px; color: #475569; margin-top: 3px; }
            .badge { display: inline-block; margin-top: 10px; padding: 4px 12px; border-radius: 999px; font-size: 10px; font-weight: 800; letter-spacing: 0.08em; background: ${isDebit ? '#fef3c7' : '#d1fae5'}; color: ${isDebit ? '#92400e' : '#065f46'}; border: 1px solid ${isDebit ? '#fcd34d' : '#6ee7b7'}; }
            .divider { border: 0; border-top: 1px dashed #cbd5e1; margin: 16px 0; }
            .amount-box { text-align: center; background: ${isDebit ? '#fffbeb' : '#ecfdf5'}; border: 1px solid ${isDebit ? '#fde68a' : '#a7f3d0'}; border-radius: 12px; padding: 14px; margin: 14px 0; }
            .amount-lbl { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; }
            .amount-val { font-size: 26px; font-weight: 900; font-family: ui-monospace, monospace; color: ${isDebit ? '#92400e' : '#047857'}; margin-top: 2px; }
            .row { display: flex; justify-content: space-between; gap: 12px; font-size: 12px; padding: 5px 0; border-bottom: 1px dotted #e2e8f0; }
            .row:last-child { border-bottom: 0; }
            .row.total { border-top: 1px solid #cbd5e1; margin-top: 6px; padding-top: 8px; font-size: 13px; }
            .mono { font-family: ui-monospace, monospace; }
            .green { color: #047857; }
            .section-title { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; margin: 16px 0 6px; }
            .box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; margin-top: 14px; }
            .box-title { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: #475569; margin-bottom: 6px; }
            table { width: 100%; border-collapse: collapse; font-size: 11.5px; margin-top: 4px; }
            th, td { padding: 6px 8px; border-bottom: 1px solid #e2e8f0; text-align: left; }
            th { background: #f1f5f9; font-size: 10px; text-transform: uppercase; color: #475569; }
            .num { text-align: right; font-family: ui-monospace, monospace; }
            .sub-line { font-size: 10px; color: #64748b; }
            .footer { text-align: center; font-size: 10px; color: #64748b; margin-top: 18px; }
            @media print { body { padding: 0; } .sheet { border: none; max-width: 100%; } }
          </style>
        </head>
        <body>
          <div class="sheet">
            <div class="center">
              <p class="brand">${escapeHtml(companyTitle)}</p>
              <div class="meta-sub">${escapeHtml(branchLabel)}${branchAddress ? ` &bull; ${escapeHtml(branchAddress)}` : ''}</div>
              ${branchContact ? `<div class="meta-sub">Contact: ${escapeHtml(branchContact)}</div>` : ''}
              <span class="badge">${escapeHtml(docLabel)}</span>
            </div>
            <hr class="divider" />
            <div class="amount-box">
              <div class="amount-lbl">${isDebit ? 'Total Transaction Amount (Debit)' : 'Official Amount Paid (Credit)'}</div>
              <div class="amount-val">${isDebit ? '+' : '-'}${escapeHtml(fmt(item.amount || 0))}</div>
              <div class="meta-sub">${escapeHtml(item.type || (isDebit ? 'Purchase' : 'Payment'))} &bull; Status: <strong>${escapeHtml(item.status || 'Completed')}</strong></div>
            </div>
            <div class="row"><span>${isDebit ? 'Invoice / Reference #' : 'Official Receipt #'}</span><strong class="mono">${escapeHtml(refDisplay)}</strong></div>
            ${item.transaction_reference ? `<div class="row"><span>Channel Reference #</span><strong class="mono">${escapeHtml(item.transaction_reference)}</strong></div>` : ''}
            <div class="row"><span>Date &amp; Time</span><strong>${escapeHtml(item.datetime || item.date || '—')}</strong></div>
            <div class="row"><span>Account #</span><strong class="mono">${escapeHtml(item.account_no || '—')}</strong></div>
            <div class="row"><span>Payment Channel / Method</span><strong>${escapeHtml(channelDisplay)}</strong></div>
            ${item.installment_no ? `<div class="row"><span>Applied Installment Term</span><strong>Term #${escapeHtml(item.installment_no)}${item.schedule_due_date ? ` (Due ${escapeHtml(item.schedule_due_date)})` : ''}</strong></div>` : ''}
            ${item.received_by ? `<div class="row"><span>Received / Cashier</span><strong>${escapeHtml(item.received_by)}</strong></div>` : ''}
            ${item.processed_by ? `<div class="row"><span>Processed By</span><strong>${escapeHtml(item.processed_by)}</strong></div>` : ''}
            <hr class="divider" />
            <div class="row"><span>${isDebit ? 'Billed To' : 'Received From'}</span><strong>${escapeHtml(custName)}${custCode ? ` (${escapeHtml(custCode)})` : ''}</strong></div>
            ${custPhone ? `<div class="row"><span>Phone</span><span>${escapeHtml(custPhone)}</span></div>` : ''}
            ${custAddress ? `<div class="row"><span>Address</span><span>${escapeHtml(custAddress)}</span></div>` : ''}
            <div class="box">
              <div class="box-title">Particulars / Remarks</div>
              <div style="font-size:12px; line-height:1.5;">${escapeHtml(item.description || item.notes || '—')}</div>
            </div>
            ${itemsTableHtml}
            ${accountSummaryHtml}
            <div class="footer">
              This is a system-generated official ${isDebit ? 'statement record' : 'payment receipt'} &bull; Printed ${escapeHtml(new Date().toLocaleString())}
            </div>
          </div>
        </body>
      </html>`;

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();
    iframe.contentWindow.focus();
    setTimeout(() => {
      iframe.contentWindow.print();
      setTimeout(() => document.body.removeChild(iframe), 1000);
    }, 150);
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
              Customer ID: <span className="font-mono font-bold text-foreground">{customerData?.id || user?.id || 'CUST-001'}</span> • Iligan City
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
              className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${filterType === tab.id
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
                  <th className="px-5 py-3.5 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filtered.map((item, idx) => {
                  const isDebit = item.category === 'Debit' || item.type === 'Purchase';
                  const refDisplay = item.reference_no || item.reference || item.id;
                  const channelDisplay = item.channel_method || item.payment_method || 'Standard';
                  return (
                    <tr key={item.id || refDisplay || idx} className="hover:bg-muted/30 transition-colors">
                      <td className="px-5 py-3.5 font-semibold text-foreground whitespace-nowrap">
                        {item.date || '—'}
                      </td>
                      <td className="px-5 py-3.5 font-mono font-bold text-foreground whitespace-nowrap">
                        {refDisplay}
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
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${isDebit
                            ? 'bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200'
                            : 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200'
                          }`}>
                          {isDebit ? <FiArrowUpRight className="w-3 h-3 text-amber-600" /> : <FiArrowDownLeft className="w-3 h-3 text-emerald-600" />}
                          {isDebit ? 'Debit' : 'Credit'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-muted-foreground whitespace-nowrap">
                        {channelDisplay}
                      </td>
                      <td className={`px-5 py-3.5 font-mono font-extrabold text-sm text-right whitespace-nowrap ${isDebit ? 'text-amber-900 dark:text-amber-200' : 'text-emerald-600 dark:text-emerald-400'
                        }`}>
                        {isDebit ? `+${fmt(item.amount)}` : `-${fmt(item.amount)}`}
                      </td>
                      <td className="px-5 py-3.5 text-center whitespace-nowrap">
                        <div className="inline-flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedStatement(item)}
                            title="View Transaction Details"
                            aria-label={`View details for ${refDisplay}`}
                            className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/20 hover:border-amber-500/40 transition-all cursor-pointer"
                          >
                            <FiEye className="w-4 h-4" />
                          </button>
                          {!isDebit && (
                            <button
                              type="button"
                              onClick={() => setReceiptStatement(item)}
                              title="View Official Receipt"
                              aria-label={`View official receipt for ${refDisplay}`}
                              className="inline-flex items-center gap-1.5 px-2.5 h-8 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25 hover:border-emerald-500/50 text-[11px] font-bold transition-all cursor-pointer"
                            >
                              <FiFileText className="w-3.5 h-3.5" />
                              <span>Receipt</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Statement Entry View Modal (Official Receipt for Payments / Full Detailed Breakdown for Purchases) */}
      {selectedStatement && (() => {
        const isDebit = selectedStatement.category === 'Debit' || selectedStatement.type === 'Purchase';
        const isCredit = !isDebit;
        const refDisplay = selectedStatement.receipt_no || selectedStatement.reference_no || selectedStatement.reference || selectedStatement.id;
        const channelDisplay = selectedStatement.channel_method || selectedStatement.payment_method || 'Standard';
        const linkedAccount = selectedStatement.account_summary || (accountsData.length > 0 ? accountsData : installments).find(
          a => a?.account_no && selectedStatement.account_no && String(a.account_no) === String(selectedStatement.account_no)
        );
        const itemsList = Array.isArray(selectedStatement.items) ? selectedStatement.items : [];
        const proofUrl = formatProofUrl(selectedStatement.proof_of_payment);
        const companyTitle = companyData?.name || 'Z-LICZ Furniture & Appliances Trading';
        const branchLabel = selectedStatement.branch_name || customerData?.branch_name || 'Main Branch';
        const branchAddress = selectedStatement.branch_location || companyData?.address || '';
        const branchContact = selectedStatement.branch_contact || companyData?.phone || '';
        const custName = customerData?.name || user?.name || user?.full_name || 'Customer Account';
        const custCode = customerData?.customer_code || (customerData?.customer_id ? `CUS-${String(customerData.customer_id).padStart(3, '0')}` : '');

        return (
          <Modal
            isOpen={true}
            onClose={() => setSelectedStatement(null)}
            title={isCredit ? 'Official Payment Receipt' : 'Statement Transaction Details'}
            size="lg"
          >
            <div className="space-y-4">
              {/* Official Receipt / Document Header */}
              <div className={`rounded-2xl p-5 border relative overflow-hidden ${isCredit
                  ? 'bg-gradient-to-br from-emerald-50/90 via-card to-teal-50/40 dark:from-emerald-950/40 dark:via-card dark:to-teal-950/20 border-emerald-300/70 dark:border-emerald-800/60'
                  : 'bg-gradient-to-br from-amber-50/90 via-card to-orange-50/40 dark:from-amber-950/40 dark:via-card dark:to-orange-950/20 border-amber-300/70 dark:border-amber-800/60'
                }`}>
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-4 border-b border-dashed border-border">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${isCredit
                          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                          : 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30'
                        }`}>
                        {isCredit ? <FiShield className="w-3 h-3" /> : <FiFileText className="w-3 h-3" />}
                        {isCredit ? 'Official Payment Receipt (Credit)' : 'Purchase / Contract Statement (Debit)'}
                      </span>
                    </div>
                    <h3 className="text-base font-black text-foreground tracking-tight">{companyTitle}</h3>
                    <p className="text-[11px] text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                      <span className="font-semibold text-foreground/80">{branchLabel}</span>
                      {branchAddress && <span>&bull; {branchAddress}</span>}
                      {branchContact && <span>&bull; {branchContact}</span>}
                    </p>
                  </div>

                  <div className="text-left sm:text-right shrink-0">
                    <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground block">
                      {isCredit ? 'Receipt No.' : 'Reference / Invoice No.'}
                    </span>
                    <p className="font-mono font-black text-sm text-foreground">{refDisplay || '—'}</p>
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 mt-1 rounded-full text-[10px] font-bold bg-card border border-border text-foreground">
                      <FiCheckCircle className="w-3 h-3 text-emerald-500" />
                      {selectedStatement.status || 'Completed'}
                    </span>
                  </div>
                </div>

                {/* Amount Banner */}
                <div className="pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground block">
                      {isCredit ? 'Official Amount Paid' : 'Total Contract / Purchase Amount'}
                    </span>
                    <p className={`text-3xl font-black font-mono tracking-tight mt-0.5 ${isCredit ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-800 dark:text-amber-300'
                      }`}>
                      {isCredit ? fmt(selectedStatement.amount) : `+${fmt(selectedStatement.amount)}`}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-xl text-xs font-bold ${isCredit
                        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                        : 'bg-amber-500/15 text-amber-800 dark:text-amber-300'
                      }`}>
                      {isCredit ? <FiArrowDownLeft className="w-3.5 h-3.5" /> : <FiArrowUpRight className="w-3.5 h-3.5" />}
                      {selectedStatement.type || (isCredit ? 'Payment' : 'Purchase')}
                    </span>
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-xl text-xs font-bold bg-card border border-border text-foreground">
                      <FiCreditCard className="w-3.5 h-3.5 text-muted-foreground" />
                      {channelDisplay}
                    </span>
                  </div>
                </div>
              </div>

              {/* Customer & Transaction Full Metadata Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3.5 rounded-xl bg-muted/40 border border-border/70 space-y-2">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <FiUser className="w-3.5 h-3.5" /> {isCredit ? 'Received From (Customer)' : 'Billed To (Customer)'}
                  </span>
                  <div className="space-y-1">
                    <p className="font-bold text-foreground text-sm">{custName}</p>
                    {custCode && <p className="font-mono text-[11px] text-muted-foreground">Customer ID: <strong className="text-foreground">{custCode}</strong></p>}
                    {customerData?.phone && (
                      <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                        <FiPhone className="w-3 h-3" /> {customerData.phone}
                      </p>
                    )}
                    {customerData?.email && (
                      <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                        <FiMail className="w-3 h-3" /> {customerData.email}
                      </p>
                    )}
                    {customerData?.address && (
                      <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                        <FiMapPin className="w-3 h-3 mt-0.5 shrink-0" /> <span>{customerData.address}</span>
                      </p>
                    )}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-muted/40 border border-border/70 space-y-2">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <FiClock className="w-3.5 h-3.5" /> Transaction Metadata
                  </span>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">Date &amp; Time:</span>
                      <strong className="text-foreground font-semibold">{selectedStatement.datetime || selectedStatement.date || '—'}</strong>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">Account #:</span>
                      <strong className="font-mono text-foreground">{selectedStatement.account_no || '—'}</strong>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">Method / Channel:</span>
                      <strong className="text-foreground">{channelDisplay}</strong>
                    </div>
                    {selectedStatement.transaction_reference && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">Channel Ref #:</span>
                        <strong className="font-mono text-foreground">{selectedStatement.transaction_reference}</strong>
                      </div>
                    )}
                    {selectedStatement.installment_no && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">Applied Term:</span>
                        <strong className="text-foreground">
                          Term #{selectedStatement.installment_no}
                          {selectedStatement.schedule_due_date ? ` (${selectedStatement.schedule_due_date})` : ''}
                        </strong>
                      </div>
                    )}
                    {selectedStatement.received_by && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">Received By:</span>
                        <strong className="text-foreground">{selectedStatement.received_by}</strong>
                      </div>
                    )}
                    {selectedStatement.processed_by && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">Processed By:</span>
                        <strong className="text-foreground">{selectedStatement.processed_by}</strong>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Particulars / Description */}
              <div className="p-3.5 rounded-xl bg-muted/40 border border-border/70 text-xs space-y-1">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground block">
                  {isCredit ? 'Payment Particulars & Remarks' : 'Transaction Description & Notes'}
                </span>
                <p className="font-semibold text-foreground leading-relaxed">
                  {selectedStatement.description || '—'}
                </p>
                {selectedStatement.notes && selectedStatement.notes !== selectedStatement.description && (
                  <p className="text-[11px] text-muted-foreground">{selectedStatement.notes}</p>
                )}
              </div>

              {/* Purchased Items Table (For Purchases / Debits) */}
              {itemsList.length > 0 && (
                <div className="rounded-xl border border-border overflow-hidden text-xs">
                  <div className="px-3.5 py-2 bg-muted/60 border-b border-border flex items-center justify-between">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <FiPackage className="w-3.5 h-3.5" /> Purchased Item(s)
                    </span>
                    <span className="text-[10px] font-bold text-muted-foreground">{itemsList.length} item(s)</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead className="bg-muted/30 text-[10px] uppercase text-muted-foreground font-bold border-b border-border/70">
                        <tr>
                          <th className="px-3.5 py-2">Product</th>
                          <th className="px-3.5 py-2 text-right">Qty</th>
                          <th className="px-3.5 py-2 text-right">Unit Price</th>
                          <th className="px-3.5 py-2 text-right">Line Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        {itemsList.map((it, i) => (
                          <tr key={i}>
                            <td className="px-3.5 py-2">
                              <span className="font-bold text-foreground block">{it.product_name}</span>
                              <span className="text-[10px] text-muted-foreground">
                                {[it.product_code, it.category].filter(Boolean).join(' • ')}
                              </span>
                            </td>
                            <td className="px-3.5 py-2 text-right font-mono">{formatQty(it.quantity ?? 1)}</td>
                            <td className="px-3.5 py-2 text-right font-mono">{fmt(it.unit_price || 0)}</td>
                            <td className="px-3.5 py-2 text-right font-mono font-bold text-foreground">{fmt(it.line_total || 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {(Number(selectedStatement.discount_amount || 0) > 0 || Number(selectedStatement.subtotal || 0) > 0) && (
                    <div className="px-3.5 py-2.5 bg-muted/20 border-t border-border/70 space-y-1">
                      {Number(selectedStatement.subtotal || 0) > 0 && (
                        <div className="flex justify-between text-[11px]">
                          <span className="text-muted-foreground">Subtotal</span>
                          <span className="font-mono font-semibold text-foreground">{fmt(selectedStatement.subtotal)}</span>
                        </div>
                      )}
                      {Number(selectedStatement.discount_amount || 0) > 0 && (
                        <div className="flex justify-between text-[11px]">
                          <span className="text-muted-foreground">Discount</span>
                          <span className="font-mono font-semibold text-emerald-600">-{fmt(selectedStatement.discount_amount)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-xs pt-1 border-t border-border/60">
                        <span className="font-bold text-foreground">Total Amount</span>
                        <span className="font-mono font-black text-foreground">{fmt(selectedStatement.amount)}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Linked Account / Financing Summary */}
              {linkedAccount && (
                <div className="p-4 rounded-xl bg-card border border-border text-xs space-y-3">
                  <div className="flex items-center justify-between border-b border-dashed border-border pb-2">
                    <div>
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground block">
                        {isCredit ? 'Credited Account Summary' : 'Installment Contract Breakdown'}
                      </span>
                      <p className="font-bold text-foreground text-sm mt-0.5">
                        {linkedAccount.product || selectedStatement.product_name || 'Installment Account'}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="font-mono font-bold text-foreground block">{linkedAccount.account_no}</span>
                      <span className="text-[10px] font-semibold text-muted-foreground">{linkedAccount.status}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {Number(linkedAccount.principal_amount || 0) > 0 && (
                      <div>
                        <span className="text-[10px] text-muted-foreground block">Principal Price</span>
                        <span className="font-mono font-bold text-foreground">{fmt(linkedAccount.principal_amount)}</span>
                      </div>
                    )}
                    {Number(linkedAccount.down_payment || 0) > 0 && (
                      <div>
                        <span className="text-[10px] text-muted-foreground block">Down Payment</span>
                        <span className="font-mono font-bold text-foreground">{fmt(linkedAccount.down_payment)}</span>
                      </div>
                    )}
                    {Number(linkedAccount.interest_amount || 0) > 0 && (
                      <div>
                        <span className="text-[10px] text-muted-foreground block">
                          Interest ({linkedAccount.interest_rate || 0}%)
                        </span>
                        <span className="font-mono font-bold text-amber-600 dark:text-amber-400">{fmt(linkedAccount.interest_amount)}</span>
                      </div>
                    )}
                    {Number(linkedAccount.installment_amount || 0) > 0 && (
                      <div>
                        <span className="text-[10px] text-muted-foreground block">
                          {linkedAccount.frequency || 'Monthly'} Term
                        </span>
                        <span className="font-mono font-bold text-foreground">
                          {fmt(linkedAccount.installment_amount)}
                          {linkedAccount.number_of_installments ? ` × ${linkedAccount.number_of_installments}` : ''}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/70">
                    <div className="p-2.5 rounded-lg bg-muted/40">
                      <span className="text-[10px] text-muted-foreground block">Total Payable</span>
                      <span className="font-mono font-black text-foreground">{fmt(linkedAccount.total_payable || 0)}</span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-emerald-500/10">
                      <span className="text-[10px] text-emerald-700 dark:text-emerald-300 block">Total Paid</span>
                      <span className="font-mono font-black text-emerald-700 dark:text-emerald-300">{fmt(linkedAccount.total_paid ?? linkedAccount.paid ?? 0)}</span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-amber-500/10">
                      <span className="text-[10px] text-amber-800 dark:text-amber-300 block">Remaining Balance</span>
                      <span className="font-mono font-black text-amber-800 dark:text-amber-300">{fmt(linkedAccount.balance || 0)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Attached Proof of Payment (For Credit Payments with Proof) */}
              {isCredit && proofUrl && (
                <div className="p-3.5 rounded-xl bg-muted/40 border border-border/70 text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
                      Attached Proof of Payment
                    </span>
                    <a
                      href={proofUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline"
                    >
                      Open Full Image <FiExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <div className="rounded-xl overflow-hidden border border-border bg-card p-2 flex items-center justify-center max-h-52">
                    <img
                      src={proofUrl}
                      alt="Proof of Payment"
                      className="max-h-48 max-w-full object-contain rounded-lg cursor-pointer"
                      onClick={() => window.open(proofUrl, '_blank')}
                    />
                  </div>
                </div>
              )}

              {/* Receipt Authenticity Footer */}
              <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-2 border-t border-dashed border-border">
                <span>
                  {isCredit ? 'Official system-verified payment receipt' : 'Official customer ledger statement record'}
                </span>
                <span className="font-mono">{refDisplay}</span>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-2 pt-1">
                {!isCredit && (
                  <button
                    type="button"
                    onClick={() => handlePrintSingleDocument(selectedStatement, linkedAccount)}
                    className="px-4 py-2 rounded-xl bg-muted hover:bg-muted/80 text-foreground border border-border text-xs font-bold transition-all inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <FiPrinter className="w-3.5 h-3.5" />
                    Print Transaction Details
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedStatement(null)}
                  className="px-4 py-2 rounded-xl bg-card hover:bg-muted border border-border text-xs font-bold text-foreground transition-all cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </Modal>
        );
      })()}

      {/* Dedicated Official Payment Receipt Modal (For Credits / Payments) */}
      {receiptStatement && (() => {
        const refDisplay = receiptStatement.receipt_no || receiptStatement.reference_no || receiptStatement.reference || receiptStatement.id;
        const channelDisplay = receiptStatement.channel_method || receiptStatement.payment_method || 'Cash';
        const linkedAccount = receiptStatement.account_summary || (accountsData.length > 0 ? accountsData : installments).find(
          a => a?.account_no && receiptStatement.account_no && String(a.account_no) === String(receiptStatement.account_no)
        );
        const branchLabel = receiptStatement.branch_name || customerData?.branch_name || 'Main Branch';
        const custName = customerData?.name || user?.name || user?.full_name || 'Customer Account';
        const custFirstName = String(custName).trim().split(/\s+/)[0] || 'Customer';
        const custPhone = customerData?.phone || user?.phone || user?.phone_number || '—';
        const custEmail = customerData?.email || user?.email || '—';
        const isPending = String(receiptStatement.status || '').toLowerCase() === 'pending';
        const statusLabel = isPending ? 'Pending' : (receiptStatement.status || 'Completed');
        const formattedTime = receiptStatement.datetime || receiptStatement.date || '—';

        return (
          <Modal
            isOpen={true}
            onClose={() => setReceiptStatement(null)}
            title="Official Payment Receipt"
            size="md"
          >
            <div className="space-y-4">
              {/* Top Checkmark & Status Title */}
              <div className="flex flex-col items-center text-center pt-1 pb-1">
                <div className="w-14 h-14 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-md shadow-emerald-500/25">
                  <FiCheck className="w-7 h-7 stroke-[3]" />
                </div>
                <h2 className="mt-3 text-xl font-extrabold text-foreground tracking-tight">
                  {isPending ? 'Payment Submitted' : 'Payment Confirmed'}
                </h2>
              </div>

              {/* Clean Receipt Summary Card */}
              <div className="rounded-2xl border border-border bg-card p-5 shadow-xs space-y-4">
                <div className="pb-3 border-b border-border/70">
                  <p className="text-base font-extrabold text-foreground tracking-tight">
                    Payment Amount:{' '}
                    <span className="font-mono">{fmt(receiptStatement.amount)}</span>
                  </p>
                </div>

                <div className="space-y-3 text-[13px]">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground font-medium">Recipient Name:</span>
                    <span className="font-bold text-foreground uppercase text-right">{custName}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground font-medium">Mobile:</span>
                    <span className="font-medium text-foreground text-right">{custPhone}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground font-medium">Email:</span>
                    <span className="font-medium text-foreground uppercase text-right break-all">{custEmail}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground font-medium">Receipt No.:</span>
                    <span className="font-mono font-semibold text-foreground text-right">{refDisplay}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground font-medium">Account No.:</span>
                    <span className="font-mono font-semibold text-foreground text-right">{receiptStatement.account_no || '—'}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground font-medium">Channel / Method:</span>
                    <span className="font-semibold text-amber-600 dark:text-amber-400 text-right">{channelDisplay}</span>
                  </div>
                  {receiptStatement.transaction_reference && (
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-muted-foreground font-medium">Reference Code:</span>
                      <span className="font-mono font-semibold text-foreground text-right">{receiptStatement.transaction_reference}</span>
                    </div>
                  )}
                  {(receiptStatement.product_name || linkedAccount?.product) && (
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-muted-foreground font-medium">Financed Item:</span>
                      <span className="font-medium text-foreground text-right">{receiptStatement.product_name || linkedAccount?.product}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground font-medium">Branch:</span>
                    <span className="font-medium text-foreground text-right">{branchLabel}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground font-medium">Time:</span>
                    <span className="font-medium text-foreground text-right">{formattedTime}</span>
                  </div>
                  {linkedAccount && (
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-muted-foreground font-medium">Remaining Balance:</span>
                      <span className="font-mono font-bold text-foreground text-right">{fmt(linkedAccount.balance || 0)}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground font-medium">Status:</span>
                    <span className={`font-bold text-right ${isPending
                        ? 'text-amber-500 dark:text-amber-400'
                        : 'text-emerald-600 dark:text-emerald-400'
                      }`}>
                      {statusLabel}
                    </span>
                  </div>
                </div>
              </div>

              {/* Soft Green Confirmation Message Box */}
              <div className="rounded-2xl bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800/50 p-4 text-[13px] leading-relaxed text-foreground/85 space-y-3">
                {isPending ? (
                  <>
                    <p>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">{custFirstName}</span>, the payment details you provided ({fmt(receiptStatement.amount)} via {channelDisplay}) have been successfully submitted for account <strong className="font-mono text-foreground">{receiptStatement.account_no || refDisplay}</strong>. Our store administrator is currently reviewing and confirming your payment.
                    </p>
                    <p>
                      You will receive a notification once the payment confirmation is complete.
                    </p>
                  </>
                ) : (
                  <>
                    <p>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">{custFirstName}</span>, your payment of <strong>{fmt(receiptStatement.amount)}</strong> via <strong>{channelDisplay}</strong> (Receipt <strong className="font-mono text-foreground">{refDisplay}</strong>) has been officially recorded and credited to account <strong className="font-mono text-foreground">{receiptStatement.account_no || refDisplay}</strong>.
                    </p>
                    <p>
                      {linkedAccount
                        ? <>Your updated remaining balance is <strong className="font-mono text-foreground">{fmt(linkedAccount.balance || 0)}</strong>. Keep this official receipt for your records.</>
                        : 'Thank you for your prompt payment. Keep this official receipt for your records.'}
                    </p>
                  </>
                )}
              </div>

              {/* Receipt Modal Actions */}
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => handlePrintSingleDocument(receiptStatement, linkedAccount)}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <FiPrinter className="w-3.5 h-3.5" />
                  Print Receipt
                </button>
                <button
                  type="button"
                  onClick={() => setReceiptStatement(null)}
                  className="px-4 py-2 rounded-xl bg-card hover:bg-muted border border-border text-xs font-bold text-foreground transition-all cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </Modal>
        );
      })()}
    </div>
  );
}

