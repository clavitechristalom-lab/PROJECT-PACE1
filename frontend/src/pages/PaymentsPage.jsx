import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  FiCreditCard, FiTrendingUp, FiSmartphone,
  FiEye, FiPlus, FiPrinter, FiSearch, FiCalendar,
  FiCheckCircle, FiX, FiAlertTriangle, FiFileText, FiFilter, FiTrash2,
  FiClock, FiImage
} from 'react-icons/fi'
import {
  Btn, Badge, StatusBadge, Input, Select, Textarea, Modal,
  Table, TR, TD, SearchBar, PageHeader, StatCard, Card, CardHeader, Pagination, showToast,
  LoadingState, ErrorAlert, TableSkeleton, EmptyState, showLoading, closeLoading
} from '../components/ui'
import { fmt, fmtDate } from '../lib/utils'
import { useAuth } from '../context/AuthContext'
import api, { downloadCsv } from '../lib/api'
import { useRealtimeSync, triggerDataSync } from '../lib/realtimeSync'
import { TbCurrencyPeso } from 'react-icons/tb'
import { FiDownload } from 'react-icons/fi'
import Swal from 'sweetalert2'

export const formatProofUrl = (url) => {
  if (!url) return null;
  if (typeof url !== 'string') return null;
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:') || url.startsWith('blob:')) {
    return url;
  }
  const clean = url.startsWith('/') ? url : `/${url}`;
  const base = (typeof window !== 'undefined' && window.location.hostname && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1')
    ? `http://${window.location.hostname}:8000`
    : 'http://127.0.0.1:8000';
  return `${base}${clean.startsWith('/storage') ? clean : `/storage${clean}`}`;
};

function PaymentMethodBadge({ method, provider }) {
  const m = (provider || method || '').toLowerCase()
  if (m.includes('gcash')) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800">
        <FiSmartphone className="w-3 h-3 text-blue-500" />
        <span>GCash</span>
      </span>
    )
  }
  if (m.includes('maya')) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800">
        <FiSmartphone className="w-3 h-3 text-emerald-500" />
        <span>Maya</span>
      </span>
    )
  }
  if (m.includes('bdo') || m.includes('bpi') || m.includes('unionbank') || m.includes('bank') || m.includes('online')) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800">
        <FiCreditCard className="w-3 h-3 text-indigo-500" />
        <span>{provider || method}</span>
      </span>
    )
  }
  if (m.includes('installment')) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800">
        <FiFileText className="w-3 h-3 text-amber-500" />
        <span>Installment</span>
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-muted text-muted-foreground border border-border">
      <TbCurrencyPeso className="w-3 h-3 text-emerald-500" />
      <span>{provider || method || 'Cash'}</span>
    </span>
  )
}

export default function PaymentsPage() {
  const [searchParams] = useSearchParams()
  const { user } = useAuth()
  const isStoreAdmin = user?.role === 'Store Administrator' || user?.role === 'Store Admin'

  const [payments, setPayments] = useState([])
  const [installments, setInstallments] = useState([])
  const [monitoring, setMonitoring] = useState(null)
  const [branches, setBranches] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Filters
  const [search, setSearch] = useState('')
  const [methodFilter, setMethodFilter] = useState('All')
  const [branchFilter, setBranchFilter] = useState(isStoreAdmin ? (user?.employee?.branch?.name || 'Main Branch') : 'All')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 10

  // Modals & Printing
  const [newPayModal, setNewPayModal] = useState(false)
  const [viewReceipt, setViewReceipt] = useState(null)
  const [viewPayment, setViewPayment] = useState(null)
  const [saving, setSaving] = useState(false)
  const [printMode, setPrintMode] = useState('summary') // 'summary' | 'receipt'
  const [printReceiptData, setPrintReceiptData] = useState(null)
  const [settings, setSettings] = useState(null)

  // New Payment Form State
  const [selectedInstId, setSelectedInstId] = useState('')
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState('Cash')
  const [payRef, setPayRef] = useState('')
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10))
  const [payNotes, setPayNotes] = useState('')

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true)
    if (!silent) setError('')
    try {
      const [paymentsRes, instRes, monRes, branchRes, settingsRes] = await Promise.all([
        api.payments.getAll({
          search: search || undefined,
          payment_method: methodFilter !== 'All' ? methodFilter : undefined,
          branch: branchFilter !== 'All' ? branchFilter : undefined,
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
        }),
        api.installments.getAll({ status: 'Active', branch: branchFilter !== 'All' ? branchFilter : undefined }),
        api.payments.getMonitoring({ branch: branchFilter !== 'All' ? branchFilter : undefined }).catch(() => null),
        api.branches.getAll().catch(() => []),
        api.system.getSettings().catch(() => null),
      ])

      setPayments(paymentsRes.payments || [])
      setInstallments(instRes.installments || [])
      setMonitoring(monRes)
      setBranches(Array.isArray(branchRes) ? branchRes : (branchRes.branches || []))
      if (settingsRes) setSettings(settingsRes)
    } catch (err) {
      console.error('Failed to load payments:', err)
      if (!silent) setError(err.message || 'Failed to fetch payment collections')
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [methodFilter, branchFilter, search, dateFrom, dateTo])

  useRealtimeSync(() => {
    loadData(true)
  }, [methodFilter, branchFilter, search, dateFrom, dateTo])

  useEffect(() => {
    const id = searchParams.get('id')
    if (id) {
      const found = payments.find(p => String(p.payment_id) === String(id))
      if (found) {
        setViewReceipt(found)
      } else {
        api.payments.getAll({ search: id })
          .then(res => {
            if (res.payments?.length > 0) {
              setViewReceipt(res.payments[0])
            }
          })
          .catch(err => console.warn('Could not auto-open receipt:', err))
      }
    }
  }, [searchParams, payments.length])

  const handleInstSelect = (instId) => {
    setSelectedInstId(instId)
    const inst = installments.find(i => i.installment_id === parseInt(instId))
    if (inst) {
      setPayAmount((inst.next_amount_due || inst.installment_amount || '').toString())
    }
  }

  const handleRecordPayment = async (e) => {
    e.preventDefault()
    if (!selectedInstId) {
      showToast('Please select an installment', 'error')
      return
    }
    const val = parseFloat(payAmount)
    if (!val || val <= 0) {
      showToast('Please enter a valid payment amount', 'error')
      return
    }

    setSaving(true)
    showLoading('Recording payment...')
    try {
      const res = await api.payments.create({
        installment_id: parseInt(selectedInstId),
        amount: val,
        payment_method: payMethod,
        reference_no: payRef,
        payment_date: payDate,
        notes: payNotes,
        user_id: user?.user_id || 1,
      })

      showToast(res.message || 'Payment recorded successfully', 'success')
      setNewPayModal(false)
      setSelectedInstId('')
      setPayAmount('')
      setPayRef('')
      setPayNotes('')
      if (res.payment) {
        setPayments(prev => [res.payment, ...prev])
      } else {
        loadData(true)
      }
      triggerDataSync('payments')
      triggerDataSync('installments')
      triggerDataSync('dashboard')
    } catch (err) {
      showToast(err.message || 'Failed to record payment', 'error')
    } finally {
      setSaving(false)
      closeLoading()
    }
  }

  const handleDeletePayment = async (id) => {
    const result = await Swal.fire({
      title: 'Delete Payment?',
      text: 'Are you sure you want to delete this payment? This action cannot be undone.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Yes, delete it',
      cancelButtonText: 'Cancel',
      background: document.documentElement.classList.contains('dark') ? '#1e293b' : '#fff',
      color: document.documentElement.classList.contains('dark') ? '#f8fafc' : '#0f172a',
    });
    
    if (!result.isConfirmed) return;
    
    showLoading('Deleting payment...')
    try {
      await api.payments.delete(id)
      showToast('Payment deleted successfully', 'success')
      loadData(true)
      triggerDataSync('payments')
      triggerDataSync('installments')
      triggerDataSync('dashboard')
    } catch (err) {
      showToast(err.message || 'Failed to delete payment', 'error')
    } finally {
      closeLoading()
    }
  }

  const handleReceivePayment = async (p) => {
    if (!p) return;
    const proofUrl = formatProofUrl(p.proof_of_payment);
    const isDark = document.documentElement.classList.contains('dark');
    const borderCol = isDark ? '#334155' : '#e2e8f0';
    const bgBox = isDark ? '#0f172a' : '#f8fafc';
    const textMuted = isDark ? '#94a3b8' : '#64748b';
    const textMain = isDark ? '#f8fafc' : '#0f172a';

    const result = await Swal.fire({
      title: 'Receive & Confirm Payment?',
      html: `
        <div style="text-align: left; font-size: 13px; margin-top: 8px;">
          <div style="background: ${isDark ? 'rgba(30, 41, 59, 0.6)' : 'rgba(241, 245, 249, 0.7)'}; border: 1px solid ${borderCol}; border-radius: 10px; padding: 12px; margin-bottom: 12px; line-height: 1.6;">
            <div><strong style="color: ${textMuted};">Receipt #:</strong> <span style="font-family: monospace; font-weight: bold; color: ${textMain};">${p.receipt_no}</span></div>
            <div><strong style="color: ${textMuted};">Account #:</strong> <span style="font-family: monospace; font-weight: bold; color: #3b82f6;">${p.account_no}</span> <span style="color: ${textMuted};">(${p.customer_name})</span></div>
            <div><strong style="color: ${textMuted};">Amount:</strong> <span style="color: #10b981; font-family: monospace; font-weight: bold; font-size: 14px;">${fmt(p.amount)}</span> <span style="color: ${textMuted}; font-size: 12px;">via ${p.payment_method}</span></div>
            ${p.reference_no ? `<div><strong style="color: ${textMuted};">Ref Code:</strong> <code style="font-family: monospace; font-weight: bold; background: ${isDark ? '#334155' : '#e2e8f0'}; padding: 1px 6px; border-radius: 4px; color: ${textMain};">${p.reference_no}</code></div>` : ''}
          </div>

          <div style="margin-bottom: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <strong style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: ${textMuted};">Proof of Payment:</strong>
              ${proofUrl ? `<a href="${proofUrl}" target="_blank" rel="noopener noreferrer" style="font-size: 11px; color: #10b981; font-weight: 600; text-decoration: underline; cursor: pointer;">View Full Image ↗</a>` : ''}
            </div>
            ${proofUrl ? `
              <div style="border: 1px solid ${borderCol}; border-radius: 10px; overflow: hidden; background: ${bgBox}; padding: 6px; display: flex; align-items: center; justify-content: center; max-height: 220px; cursor: pointer;" onclick="window.open('${proofUrl}', '_blank')" title="Click to view full image">
                <img src="${proofUrl}" alt="Proof of Payment" style="max-height: 205px; max-width: 100%; object-fit: contain; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);" />
              </div>
            ` : `
              <div style="border: 1px dashed ${borderCol}; border-radius: 8px; padding: 12px; text-align: center; color: ${textMuted}; font-size: 11px; background: ${bgBox};">
                No proof of payment attached.
              </div>
            `}
          </div>

          <p style="font-size: 11px; color: ${textMuted}; text-align: center; margin: 0; line-height: 1.4;">
            Confirming receipt will credit the customer's account and mark the payment as Completed.
          </p>
        </div>
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#10b981',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Yes, Receive Payment',
      cancelButtonText: 'Cancel',
      background: isDark ? '#1e293b' : '#fff',
      color: textMain,
      width: '480px',
    });

    if (!result.isConfirmed) return;

    showLoading('Receiving payment...');
    try {
      await api.payments.receive(p.payment_id);
      showToast('Payment received and credited successfully! 🎉', 'success');
      loadData(true);
      triggerDataSync('payments');
      triggerDataSync('installments');
      triggerDataSync('dashboard');
    } catch (err) {
      showToast(err.message || 'Failed to receive payment', 'error');
    } finally {
      closeLoading();
    }
  };

  const handlePrintSummary = async () => {
    setPrintMode('summary')
    setPrintReceiptData(null)
    try {
      await api.payments.logPrint()
    } catch (e) {
      console.warn('Could not log print event:', e)
    }
    setTimeout(() => {
      window.print()
    }, 120)
  }

  const handlePrintReceipt = async (p) => {
    if (!p) return
    showLoading('Preparing receipt...')
    try {
      const res = await api.payments.getById(p.payment_id)
      const data = res?.payment || p
      setPrintReceiptData(data)
      setPrintMode('receipt')
      try {
        await api.payments.logPrint(p.payment_id)
      } catch (e) {
        console.warn('Could not log print event:', e)
      }
      closeLoading()
      setTimeout(() => {
        window.print()
      }, 150)
    } catch (err) {
      closeLoading()
      setPrintReceiptData(p)
      setPrintMode('receipt')
      setTimeout(() => {
        window.print()
      }, 150)
    }
  }

  const printReceipt = () => {
    if (viewReceipt) {
      handlePrintReceipt(viewReceipt)
    } else {
      handlePrintSummary()
    }
  }

  const filteredPayments = useMemo(() => {
    let list = payments
    if (search.trim()) {
      const q = search.toLowerCase().trim()
      list = list.filter(p => {
        const receipt = (p.receipt_no || '').toLowerCase()
        const acc = (p.installment_account?.account_no || '').toLowerCase()
        const custFirst = (p.installment_account?.customer?.first_name || '').toLowerCase()
        const custLast = (p.installment_account?.customer?.last_name || '').toLowerCase()
        const ref = (p.reference_no || '').toLowerCase()
        const method = (p.payment_method || '').toLowerCase()
        return receipt.includes(q) || acc.includes(q) || custFirst.includes(q) || custLast.includes(q) || ref.includes(q) || method.includes(q)
      })
    }
    return list
  }, [payments, search])

  const total = filteredPayments.length
  const paginated = filteredPayments.slice((page - 1) * pageSize, page * pageSize)

  const [exporting, setExporting] = useState(false)
  const handleExportCSV = async () => {
    setExporting(true)
    try {
      await downloadCsv('/payments', {
        search: search || undefined,
        payment_method: methodFilter !== 'All' ? methodFilter : undefined,
        branch: branchFilter !== 'All' ? branchFilter : undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      })
      showToast('Payments exported successfully', 'success')
    } catch (err) {
      showToast(err.message || 'Export failed', 'error')
    } finally {
      setExporting(false)
    }
  }

  return (
    <>
    <div className="space-y-6 print:hidden">
      <PageHeader
        title="Payment Collections & Receipts"
        subtitle={
          isStoreAdmin 
            ? `Store Branch Collections (${user?.employee?.branch?.name || 'Main Branch'})` 
            : 'Track official payment receipts, cash vs digital collection breakdown, and installments paid'
        }
        action={
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handlePrintSummary}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-border bg-card hover:bg-muted font-semibold text-xs text-foreground cursor-pointer shadow-2xs transition-colors"
              title="Print / PDF Collections Summary"
            >
              <FiPrinter className="w-4 h-4 text-primary" />
              <span>Print / PDF</span>
            </button>
            <button
              onClick={handleExportCSV}
              disabled={exporting}
              className="flex items-center gap-2 px-4 py-2 bg-muted hover:bg-muted/80 text-foreground font-semibold text-xs rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50"
            >
              {exporting ? <FiAlertTriangle className="w-4 h-4 animate-spin" /> : <FiDownload className="w-4 h-4" />}
              <span>{exporting ? 'Exporting...' : 'Export CSV'}</span>
            </button>
            <button
              onClick={() => setNewPayModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
            >
              <FiPlus className="w-4 h-4" />
              <span>Record Payment</span>
            </button>
          </div>
        }
      />

      {/* Collection Monitoring Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard title="Today's Collections" value={fmt(monitoring?.today?.collected || 0)} sub={`${monitoring?.today?.count || 0} payments today`} icon={<TbCurrencyPeso className="w-5 h-5 text-emerald-500" />} color="green" />
        <StatCard title="Monthly Collections" value={fmt(monitoring?.month?.collected || 0)} sub={`${monitoring?.month?.count || 0} payments this month`} icon={<FiTrendingUp className="w-5 h-5 text-blue-500" />} color="blue" />
        <StatCard title="Total Cash Collected" value={fmt(monitoring?.total?.cash || 0)} sub="cash in register" icon={<TbCurrencyPeso className="w-5 h-5 text-indigo-500" />} color="indigo" />
        <StatCard title="Digital Collections" value={fmt(monitoring?.total?.digital || 0)} sub="GCash / Maya / Bank" icon={<FiSmartphone className="w-5 h-5 text-purple-500" />} color="purple" />
      </div>

      {/* Filter Bar */}
      <Card noPad className="p-3.5 border border-border print:hidden">
        <form onSubmit={e => { e.preventDefault(); loadData(); }} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
          <div className="lg:col-span-2 relative">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Search receipt #, account #, customer..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-9 pr-8 py-2 text-xs border border-border rounded-xl bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-muted-foreground/70"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <FiX className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div>
            <select
              value={methodFilter}
              onChange={e => setMethodFilter(e.target.value)}
              className="w-full border border-border rounded-xl px-3 py-2 text-xs font-semibold bg-card text-foreground cursor-pointer"
            >
              <option value="All">All Payment Methods</option>
              <option value="Cash">Cash</option>
              <option value="GCash">GCash</option>
              <option value="Maya">Maya</option>
              <option value="Bank Transfer">Bank Transfer</option>
              <option value="Cheque">Cheque</option>
            </select>
          </div>

          <div>
            <select
              value={branchFilter}
              disabled={isStoreAdmin}
              onChange={e => setBranchFilter(e.target.value)}
              className="w-full border border-border rounded-xl px-3 py-2 text-xs font-semibold bg-card text-foreground cursor-pointer disabled:opacity-70"
            >
              <option value="All">All Branches</option>
              {branches.map(b => (
                <option key={b.branch_id} value={b.name}>{b.name}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-primary text-primary-foreground font-bold text-xs rounded-xl cursor-pointer"
            >
              <FiFilter className="w-3.5 h-3.5" />
              <span>Filter</span>
            </button>
            <button
              type="button"
              onClick={() => { setSearch(''); setMethodFilter('All'); if (!isStoreAdmin) setBranchFilter('All'); setTimeout(loadData, 50); }}
              className="px-3 py-2 border border-border rounded-xl hover:bg-muted font-semibold text-xs text-muted-foreground cursor-pointer"
            >
              Reset
            </button>
          </div>
        </form>
      </Card>

      {error && <ErrorAlert message={error} onRetry={loadData} />}

      {/* Payments Table */}
      {loading ? (
        <TableSkeleton rows={6} cols={7} />
      ) : (
        <Card noPad className="border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[760px]">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-muted-foreground uppercase font-semibold text-[11px]">
                  <th className="py-3 px-4 text-left">Receipt #</th>
                  <th className="py-3 px-4 text-left">Date</th>
                  <th className="py-3 px-4 text-left">Account #</th>
                  <th className="py-3 px-4 text-left">Customer</th>
                  <th className="py-3 px-4 text-left">Branch</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                  <th className="py-3 px-4 text-left">Method</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-left">Received By</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paginated.length === 0 ? (
                  <tr><td colSpan={10} className="py-8 text-center text-muted-foreground">No payments recorded</td></tr>
                ) : (
                  paginated.map((p, i) => (
                    <tr key={p.payment_id || i} className={`hover:bg-muted/40 transition-colors ${i % 2 === 1 ? 'bg-muted/10' : ''}`}>
                      <td className="py-3 px-4 font-mono font-bold text-foreground">{p.receipt_no}</td>
                      <td className="py-3 px-4 font-mono text-muted-foreground">{p.payment_date}</td>
                      <td className="py-3 px-4 font-mono text-primary font-bold">{p.account_no}</td>
                      <td className="py-3 px-4 font-semibold text-foreground">{p.customer_name}</td>
                      <td className="py-3 px-4 text-muted-foreground">{p.branch}</td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-emerald-600">{fmt(p.amount)}</td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <PaymentMethodBadge method={p.payment_method} />
                          {p.proof_of_payment && (
                            <a
                              href={formatProofUrl(p.proof_of_payment)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 transition-colors cursor-pointer"
                              title="View Proof of Payment"
                            >
                              <FiImage className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {p.status === 'Pending' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-700 shadow-xs">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                            <span>Pending Payment</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
                            <FiCheckCircle className="w-3 h-3 text-emerald-600" />
                            <span>Completed</span>
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {p.status === 'Pending' || !p.received_by ? (
                          <span className="italic font-semibold text-amber-600 dark:text-amber-400 text-[11px]">
                            Pending Receipt
                          </span>
                        ) : (
                          <span className="text-muted-foreground">{p.received_by}</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center flex items-center justify-center gap-1.5">
                        {p.status === 'Pending' && (
                          <button
                            onClick={() => handleReceivePayment(p)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer transition-colors shadow-xs"
                            title="Receive & Confirm Payment"
                          >
                            <FiCheckCircle className="w-3.5 h-3.5" />
                            <span>Receive</span>
                          </button>
                        )}
                        <button
                          onClick={() => setViewPayment(p)}
                          className="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-border hover:bg-muted font-semibold cursor-pointer transition-colors"
                          title="View Payment Details"
                        >
                          <FiEye className="w-4 h-4 text-blue-500" />
                        </button>
                        <button
                          onClick={() => setViewReceipt(p)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg border border-border hover:bg-muted font-semibold cursor-pointer transition-colors"
                          title="View Official Receipt"
                        >
                          <FiFileText className="w-3.5 h-3.5 text-amber-500" />
                          <span>Receipt</span>
                        </button>
                        <button
                          onClick={() => handleDeletePayment(p.payment_id)}
                          className="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-border hover:bg-rose-500/10 hover:text-rose-600 font-semibold cursor-pointer transition-colors text-rose-500"
                          title="Delete Payment"
                        >
                          <FiTrash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={page} total={total} pageSize={pageSize} onChange={setPage} />
        </Card>
      )}

      {/* OFFICIAL RECEIPT MODAL */}
      {viewReceipt && (
        <Modal
          isOpen={true}
          onClose={() => setViewReceipt(null)}
          title="Official Payment Receipt"
          size="md"
        >
          <div className="space-y-4 text-xs">
            <div className="text-center pb-3 border-b border-border space-y-0.5">
              <div className="text-base font-black tracking-wider text-foreground">Z-LICZ APPLIANCES & FURNITURE</div>
              <div className="text-[11px] text-muted-foreground">{viewReceipt.branch || 'Main Branch'} · Official Collection Receipt</div>
              <div className="text-xs font-mono font-bold text-primary pt-1">Receipt #{viewReceipt.receipt_no}</div>
            </div>

            <div className="space-y-2 p-3 bg-muted/20 rounded-xl border border-border">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Payment Date:</span>
                <span className="font-mono font-semibold text-foreground">{viewReceipt.payment_date}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{viewReceipt.account_no?.startsWith('REQ') ? 'Request / Order:' : 'Installment:'}</span>
                <span className="font-mono font-bold text-primary">{viewReceipt.account_no}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Received From (Customer):</span>
                <span className="font-semibold text-foreground">{viewReceipt.customer_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Payment Method:</span>
                <PaymentMethodBadge method={viewReceipt.payment_method} />
              </div>
              {viewReceipt.reference_no && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Reference Number:</span>
                  <span className="font-mono text-foreground">{viewReceipt.reference_no}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Authorized Staff:</span>
                <span className="font-medium text-foreground">{viewReceipt.received_by}</span>
              </div>

              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl border border-emerald-200 dark:border-emerald-900 mt-2 flex justify-between items-center">
                <span className="text-xs font-bold text-emerald-900 dark:text-emerald-300 uppercase">Amount Paid:</span>
                <span className="text-lg font-mono font-bold text-emerald-600">{fmt(viewReceipt.amount)}</span>
              </div>
            </div>

            {viewReceipt.notes && (
              <div className="text-[11px] text-muted-foreground bg-muted/30 p-2.5 rounded-xl border border-border">
                <strong>Remarks:</strong> {viewReceipt.notes}
              </div>
            )}

            <div className="flex justify-between items-center pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => handlePrintReceipt(viewReceipt)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-border bg-primary text-primary-foreground hover:bg-primary/90 font-semibold cursor-pointer shadow-xs"
              >
                <FiPrinter className="w-3.5 h-3.5" />
                <span>Print / PDF</span>
              </button>
              <button
                type="button"
                onClick={() => setViewReceipt(null)}
                className="flex items-center gap-1 px-4 py-1.5 rounded-xl border border-border hover:bg-muted font-semibold cursor-pointer"
              >
                <FiX className="w-3.5 h-3.5" />
                <span>Close</span>
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* NEW PAYMENT MODAL */}
      {newPayModal && (
        <Modal
          isOpen={true}
          onClose={() => setNewPayModal(false)}
          title="Record Customer Payment"
          size="md"
        >
          <form onSubmit={handleRecordPayment} className="space-y-3.5 text-xs">
            <div>
              <label className="block font-bold text-muted-foreground mb-1">Select Installment *</label>
              <select
                value={selectedInstId}
                onChange={e => handleInstSelect(e.target.value)}
                required
                className="w-full border border-border rounded-xl px-3 py-2 text-xs bg-card text-foreground font-semibold cursor-pointer"
              >
                <option value="">-- Choose Active Account --</option>
                {installments.map(inst => (
                  <option key={inst.installment_id} value={inst.installment_id}>
                    {inst.account_no} — {inst.customer_name} (Balance: {fmt(inst.balance)})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-bold text-muted-foreground mb-1">Payment Amount (PHP) *</label>
              <input
                type="number"
                step="0.01"
                min="1"
                value={payAmount}
                onChange={e => setPayAmount(e.target.value)}
                placeholder="0.00"
                required
                className="w-full border border-border rounded-xl px-3 py-2 text-sm font-mono font-bold bg-card text-foreground"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block font-bold text-muted-foreground mb-1">Payment Method</label>
                <select
                  value={payMethod}
                  onChange={e => setPayMethod(e.target.value)}
                  className="w-full border border-border rounded-xl px-3 py-2 text-xs bg-card text-foreground font-semibold cursor-pointer"
                >
                  <option value="Cash">Cash</option>
                  <option value="GCash">GCash</option>
                  <option value="Maya">Maya</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Cheque">Cheque</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-muted-foreground mb-1">Payment Date</label>
                <input
                  type="date"
                  value={payDate}
                  onChange={e => setPayDate(e.target.value)}
                  required
                  className="w-full border border-border rounded-xl px-3 py-2 text-xs bg-card text-foreground font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block font-bold text-muted-foreground mb-1">Reference # (Optional)</label>
              <input
                type="text"
                placeholder="GCash Ref / Bank Ref"
                value={payRef}
                onChange={e => setPayRef(e.target.value)}
                className="w-full border border-border rounded-xl px-3 py-2 text-xs bg-card text-foreground font-mono"
              />
            </div>

            <div>
              <label className="block font-bold text-muted-foreground mb-1">Notes / Remarks</label>
              <textarea
                placeholder="Optional payment notes..."
                value={payNotes}
                onChange={e => setPayNotes(e.target.value)}
                rows={2}
                className="w-full border border-border rounded-xl px-3 py-2 text-xs bg-card text-foreground"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setNewPayModal(false)}
                className="flex items-center gap-1 px-4 py-2 rounded-xl border border-border hover:bg-muted font-semibold cursor-pointer"
              >
                <FiX className="w-3.5 h-3.5" />
                <span>Cancel</span>
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold cursor-pointer"
              >
                <FiCheckCircle className="w-3.5 h-3.5" />
                <span>{saving ? 'Processing...' : 'Confirm Payment'}</span>
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* VIEW PAYMENT DETAILS MODAL */}
      {viewPayment && (
        <Modal
          isOpen={true}
          onClose={() => setViewPayment(null)}
          title="Payment Details"
          size="md"
        >
          <div className="space-y-4 text-xs">
            {viewPayment.status === 'Pending' && (
              <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 flex items-center justify-between gap-3 shadow-xs">
                <div className="flex items-center gap-2.5 min-w-0">
                  <FiClock className="w-5 h-5 text-amber-600 shrink-0 animate-pulse" />
                  <div className="min-w-0">
                    <p className="font-bold text-xs text-amber-900 dark:text-amber-200">Pending Store Admin Receipt</p>
                    <p className="text-[11px] text-amber-700 dark:text-amber-300 truncate">
                      This payment has not yet been received or credited to the account.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const p = viewPayment;
                    setViewPayment(null);
                    handleReceivePayment(p);
                  }}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl cursor-pointer transition-colors shadow-xs shrink-0 flex items-center gap-1.5"
                >
                  <FiCheckCircle className="w-3.5 h-3.5" />
                  <span>Receive Payment</span>
                </button>
              </div>
            )}

            <div className="space-y-2 p-3 bg-muted/20 rounded-xl border border-border">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Receipt #:</span>
                <span className="font-mono font-bold text-foreground">{viewPayment.receipt_no}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Payment Date:</span>
                <span className="font-mono font-semibold text-foreground">{viewPayment.payment_date}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Account #:</span>
                <span className="font-mono font-bold text-primary">{viewPayment.account_no}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Customer:</span>
                <span className="font-semibold text-foreground">{viewPayment.customer_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Method:</span>
                <PaymentMethodBadge method={viewPayment.payment_method} />
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status:</span>
                <span className={`font-bold ${viewPayment.status === 'Pending' ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600'}`}>
                  {viewPayment.status === 'Pending' ? 'Pending Payment (Not Received)' : 'Completed'}
                </span>
              </div>
              {viewPayment.reference_no && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Reference Number:</span>
                  <span className="font-mono font-bold text-purple-600 dark:text-purple-400">{viewPayment.reference_no}</span>
                </div>
              )}
              <div className="flex justify-between items-center pt-2 border-t border-border mt-2">
                <span className="text-xs font-bold text-emerald-900 dark:text-emerald-300 uppercase">Amount Paid:</span>
                <span className="text-lg font-mono font-bold text-emerald-600">{fmt(viewPayment.amount)}</span>
              </div>
            </div>

            {viewPayment.proof_of_payment ? (
              <div className="space-y-1">
                <div className="flex items-center justify-between mb-1">
                  <label className="block font-bold text-muted-foreground text-[11px] uppercase">Proof of Payment</label>
                  <a
                    href={formatProofUrl(viewPayment.proof_of_payment)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-emerald-600 dark:text-emerald-400 font-semibold hover:underline text-[11px]"
                  >
                    View Full Image ↗
                  </a>
                </div>
                <div className="border border-border rounded-xl overflow-hidden bg-muted/20 flex justify-center p-2">
                  <a href={formatProofUrl(viewPayment.proof_of_payment)} target="_blank" rel="noopener noreferrer">
                    <img src={formatProofUrl(viewPayment.proof_of_payment)} alt="Proof of Payment" className="max-h-64 object-contain rounded-lg shadow-sm" />
                  </a>
                </div>
              </div>
            ) : (
              <div className="p-4 border border-dashed border-border rounded-xl text-center text-muted-foreground bg-muted/10">
                No proof of payment uploaded.
              </div>
            )}

            {viewPayment.notes && (
              <div className="text-[11px] text-muted-foreground bg-muted/30 p-2.5 rounded-xl border border-border">
                <strong>Remarks:</strong> {viewPayment.notes}
              </div>
            )}

            <div className="flex justify-between items-center pt-3 border-t border-border mt-3">
              <button
                type="button"
                onClick={() => handlePrintReceipt(viewPayment)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-border bg-primary text-primary-foreground hover:bg-primary/90 font-semibold cursor-pointer shadow-xs"
              >
                <FiPrinter className="w-3.5 h-3.5" />
                <span>Print / PDF</span>
              </button>
              <div className="flex items-center gap-2">
                {viewPayment.status === 'Pending' && (
                  <button
                    type="button"
                    onClick={() => {
                      const p = viewPayment;
                      setViewPayment(null);
                      handleReceivePayment(p);
                    }}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer transition-colors shadow-xs"
                  >
                    <FiCheckCircle className="w-3.5 h-3.5" />
                    <span>Receive Payment</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setViewPayment(null)}
                  className="flex items-center gap-1 px-4 py-1.5 rounded-xl border border-border hover:bg-muted font-semibold cursor-pointer"
                >
                  <FiX className="w-3.5 h-3.5" />
                  <span>Close</span>
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>

    {/* Dedicated Printable Area (Active only during browser Print / PDF export) */}
    <div className="hidden print:block bg-white text-black min-h-screen w-full font-sans print:m-0 print:p-6">
      {printMode === 'receipt' && (printReceiptData || viewReceipt || viewPayment) ? (
        (() => {
          const receipt = printReceiptData || viewReceipt || viewPayment
          const companyTitle = receipt.company_settings?.company_name || settings?.company_name || 'PROJECT: PACE Z-LICZ'
          const branchTitle = receipt.branch || user?.employee?.branch?.name || receipt.company_settings?.branch_name || settings?.branch_name || 'C-LICZ CDO'
          const branchAddress = receipt.branch_location || receipt.branch_address || receipt.company_settings?.address || settings?.address || 'Cagayan de Oro City'
          const branchContact = receipt.branch_phone || receipt.company_settings?.phone || settings?.phone || '+63 88 856 1234'
          const taxId = receipt.company_settings?.tax_id || settings?.tax_id || '000-000-000'

          return (
            <div className="max-w-xl mx-auto border-2 border-black p-6 rounded-lg space-y-5 bg-white">
              {/* Header */}
              <div className="text-center pb-3 border-b-2 border-black space-y-0.5">
                <h1 className="text-2xl font-black tracking-wider uppercase">{companyTitle}</h1>
                <p className="text-sm font-bold uppercase">{branchTitle}</p>
                <p className="text-xs text-gray-700">{branchAddress} • Tel: {branchContact}</p>
                <p className="text-[11px] text-gray-600 font-mono">TIN: {taxId}</p>
                <div className="mt-2 inline-block px-3 py-1 border border-black font-bold uppercase tracking-widest text-xs bg-gray-100">
                  OFFICIAL PAYMENT RECEIPT
                </div>
              </div>

              {/* Receipt Info Header */}
              <div className="flex justify-between items-center text-xs font-mono border-b border-gray-300 pb-2.5">
                <div>
                  <span className="font-bold text-gray-600">RECEIPT NO: </span>
                  <span className="font-bold text-sm text-black">{receipt.receipt_no}</span>
                </div>
                <div>
                  <span className="font-bold text-gray-600">DATE: </span>
                  <span className="font-bold">{receipt.payment_date}</span>
                </div>
              </div>

              {/* Transaction Breakdown */}
              <table className="w-full text-xs border-collapse">
                <tbody>
                  <tr className="border-b border-gray-200">
                    <td className="py-2 text-gray-600 font-medium w-1/3">Received From:</td>
                    <td className="py-2 font-bold uppercase text-black">{receipt.customer_name}</td>
                  </tr>
                  {receipt.customer_phone && (
                    <tr className="border-b border-gray-200">
                      <td className="py-2 text-gray-600 font-medium">Contact Number:</td>
                      <td className="py-2 font-mono">{receipt.customer_phone}</td>
                    </tr>
                  )}
                  {receipt.customer_address && (
                    <tr className="border-b border-gray-200">
                      <td className="py-2 text-gray-600 font-medium">Customer Address:</td>
                      <td className="py-2">{receipt.customer_address}</td>
                    </tr>
                  )}
                  <tr className="border-b border-gray-200">
                    <td className="py-2 text-gray-600 font-medium">Account Reference:</td>
                    <td className="py-2 font-mono font-bold">{receipt.account_no}</td>
                  </tr>
                  <tr className="border-b border-gray-200">
                    <td className="py-2 text-gray-600 font-medium">Payment Method:</td>
                    <td className="py-2 font-semibold uppercase">{receipt.payment_method}</td>
                  </tr>
                  {receipt.reference_no && (
                    <tr className="border-b border-gray-200">
                      <td className="py-2 text-gray-600 font-medium">Reference / Trace #:</td>
                      <td className="py-2 font-mono">{receipt.reference_no}</td>
                    </tr>
                  )}
                  {receipt.notes && (
                    <tr className="border-b border-gray-200">
                      <td className="py-2 text-gray-600 font-medium">Remarks:</td>
                      <td className="py-2 italic text-gray-700">{receipt.notes}</td>
                    </tr>
                  )}
                </tbody>
              </table>

              {/* Amount Paid Box */}
              <div className="border-2 border-black p-3.5 bg-gray-50 flex justify-between items-center rounded">
                <div>
                  <span className="text-[10px] uppercase font-bold text-gray-600 block">TOTAL AMOUNT RECEIVED</span>
                  <span className="text-2xl font-black font-mono">
                    ₱{Number(receipt.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                {receipt.remaining_balance !== undefined && (
                  <div className="text-right">
                    <span className="text-[10px] uppercase font-bold text-gray-600 block">Remaining Account Balance</span>
                    <span className="text-sm font-bold font-mono text-gray-800">
                      ₱{Number(receipt.remaining_balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                )}
              </div>

              {/* Signatures */}
              <div className="pt-6 grid grid-cols-2 gap-6 text-xs text-center">
                <div>
                  <div className="border-b border-black w-40 mx-auto pb-1 font-semibold uppercase">
                    {receipt.customer_name}
                  </div>
                  <p className="mt-1 text-gray-600">Customer Signature</p>
                </div>
                <div>
                  <div className="border-b border-black w-40 mx-auto pb-1 font-semibold uppercase">
                    {receipt.received_by || 'Authorized Cashier'}
                  </div>
                  <p className="mt-1 text-gray-600">Authorized Collector / Cashier</p>
                </div>
              </div>

              {/* Footer Note */}
              <div className="text-center pt-3 border-t border-gray-300 text-[10px] text-gray-500">
                <p>This is a system-generated official receipt acknowledged by {companyTitle}.</p>
                <p>Timestamp: {new Date().toLocaleString()}</p>
              </div>
            </div>
          )
        })()
      ) : (
        <div>
          {/* Summary Report Header */}
          <div className="border-b-2 border-black pb-3 mb-6">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-2xl font-black uppercase tracking-wider">{settings?.company_name || 'PROJECT: PACE Z-LICZ'}</h1>
                <p className="text-sm font-semibold uppercase text-gray-800">{user?.employee?.branch?.name || settings?.branch_name || 'Main Branch'}</p>
                <h2 className="text-lg font-bold text-gray-700 mt-2">PAYMENT COLLECTIONS & RECEIPTS REPORT</h2>
              </div>
              <div className="text-right text-xs">
                <p><span className="font-semibold text-gray-600">Generated Date:</span> {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                <p><span className="font-semibold text-gray-600">Generated By:</span> {user?.username || 'Staff'}</p>
                <p><span className="font-semibold text-gray-600">Branch Filter:</span> {branchFilter}</p>
                <p><span className="font-semibold text-gray-600">Method Filter:</span> {methodFilter}</p>
              </div>
            </div>
          </div>

          {/* Metrics Box */}
          <div className="grid grid-cols-4 gap-3 mb-6 text-xs border border-gray-300 p-3 bg-gray-50">
            <div>
              <span className="text-gray-500 block uppercase text-[10px] font-bold">Today's Collections</span>
              <span className="font-mono font-bold text-base">{fmt(monitoring?.today?.collected || 0)}</span>
              <span className="text-[10px] text-gray-500 block">{monitoring?.today?.count || 0} payments</span>
            </div>
            <div>
              <span className="text-gray-500 block uppercase text-[10px] font-bold">Monthly Collections</span>
              <span className="font-mono font-bold text-base">{fmt(monitoring?.month?.collected || 0)}</span>
              <span className="text-[10px] text-gray-500 block">{monitoring?.month?.count || 0} payments</span>
            </div>
            <div>
              <span className="text-gray-500 block uppercase text-[10px] font-bold">Total Cash Collected</span>
              <span className="font-mono font-bold text-base">{fmt(monitoring?.total?.cash || 0)}</span>
              <span className="text-[10px] text-gray-500 block">Cash in register</span>
            </div>
            <div>
              <span className="text-gray-500 block uppercase text-[10px] font-bold">Digital Collections</span>
              <span className="font-mono font-bold text-base">{fmt(monitoring?.total?.digital || 0)}</span>
              <span className="text-[10px] text-gray-500 block">GCash / Maya / Bank</span>
            </div>
          </div>

          {/* Payments List Table */}
          <table className="w-full text-[11px] border-collapse mb-6">
            <thead>
              <tr className="border-y-2 border-black bg-gray-100">
                <th className="py-2 px-2 text-left font-bold uppercase">Receipt #</th>
                <th className="py-2 px-2 text-left font-bold uppercase">Date</th>
                <th className="py-2 px-2 text-left font-bold uppercase">Account #</th>
                <th className="py-2 px-2 text-left font-bold uppercase">Customer</th>
                <th className="py-2 px-2 text-left font-bold uppercase">Branch</th>
                <th className="py-2 px-2 text-left font-bold uppercase">Method</th>
                <th className="py-2 px-2 text-left font-bold uppercase">Received By</th>
                <th className="py-2 px-2 text-right font-bold uppercase">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredPayments.map((p, idx) => (
                <tr key={p.payment_id || idx}>
                  <td className="py-1.5 px-2 font-mono font-bold">{p.receipt_no}</td>
                  <td className="py-1.5 px-2 font-mono">{p.payment_date}</td>
                  <td className="py-1.5 px-2 font-mono font-semibold">{p.account_no}</td>
                  <td className="py-1.5 px-2 font-medium">{p.customer_name}</td>
                  <td className="py-1.5 px-2 text-gray-700">{p.branch}</td>
                  <td className="py-1.5 px-2 font-medium">{p.payment_method}</td>
                  <td className="py-1.5 px-2 text-gray-700">{p.received_by}</td>
                  <td className="py-1.5 px-2 text-right font-mono font-bold">{fmt(p.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-black font-bold">
                <td colSpan={7} className="py-2 px-2 text-right uppercase">Total Amount ({filteredPayments.length} transactions):</td>
                <td className="py-2 px-2 text-right font-mono text-base">
                  {fmt(filteredPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0))}
                </td>
              </tr>
            </tfoot>
          </table>

          {/* Signatures */}
          <div className="grid grid-cols-3 gap-6 pt-6 text-xs text-center border-t border-gray-300">
            <div>
              <div className="border-b border-black pb-1 font-semibold uppercase">{user?.username || 'Staff'}</div>
              <p className="mt-1 text-gray-600">Prepared By</p>
            </div>
            <div>
              <div className="border-b border-black pb-1 font-semibold uppercase">Branch Accountant</div>
              <p className="mt-1 text-gray-600">Reviewed & Verified By</p>
            </div>
            <div>
              <div className="border-b border-black pb-1 font-semibold uppercase">Store Manager</div>
              <p className="mt-1 text-gray-600">Approved By</p>
            </div>
          </div>
        </div>
      )}

    </div>
    </>
  )
}
