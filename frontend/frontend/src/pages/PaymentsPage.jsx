import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  FiCreditCard, FiTrendingUp, FiSmartphone,
  FiEye, FiPlus, FiPrinter, FiSearch, FiCalendar,
  FiCheckCircle, FiX, FiAlertTriangle, FiFileText, FiFilter
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
  const [branchFilter, setBranchFilter] = useState(isStoreAdmin ? (user?.employee?.branch || 'Main Branch') : 'All')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 10

  // Modals
  const [newPayModal, setNewPayModal] = useState(false)
  const [viewReceipt, setViewReceipt] = useState(null)
  const [saving, setSaving] = useState(false)

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
      const [paymentsRes, instRes, monRes, branchRes] = await Promise.all([
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
      ])

      setPayments(paymentsRes.payments || [])
      setInstallments(instRes.installments || [])
      setMonitoring(monRes)
      setBranches(Array.isArray(branchRes) ? branchRes : (branchRes.branches || []))
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

  const printReceipt = () => {
    window.print()
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
    <div className="space-y-6">
      <PageHeader
        title="Payment Collections & Receipts"
        subtitle={
          isStoreAdmin 
            ? `Store Branch Collections (${user?.employee?.branch || 'Main Branch'})` 
            : 'Track official payment receipts, cash vs digital collection breakdown, and installments paid'
        }
        action={
          <div className="flex gap-2">
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
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-muted-foreground uppercase font-semibold text-[11px]">
                  <th className="py-3 px-4 text-left">Receipt #</th>
                  <th className="py-3 px-4 text-left">Date</th>
                  <th className="py-3 px-4 text-left">Account #</th>
                  <th className="py-3 px-4 text-left">Customer</th>
                  <th className="py-3 px-4 text-left">Branch</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                  <th className="py-3 px-4 text-left">Method</th>
                  <th className="py-3 px-4 text-left">Received By</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paginated.length === 0 ? (
                  <tr><td colSpan={9} className="py-8 text-center text-muted-foreground">No payments recorded</td></tr>
                ) : (
                  paginated.map((p, i) => (
                    <tr key={p.payment_id || i} className={`hover:bg-muted/40 transition-colors ${i % 2 === 1 ? 'bg-muted/10' : ''}`}>
                      <td className="py-3 px-4 font-mono font-bold text-foreground">{p.receipt_no}</td>
                      <td className="py-3 px-4 font-mono text-muted-foreground">{p.payment_date}</td>
                      <td className="py-3 px-4 font-mono text-primary font-bold">{p.account_no}</td>
                      <td className="py-3 px-4 font-semibold text-foreground">{p.customer_name}</td>
                      <td className="py-3 px-4 text-muted-foreground">{p.branch}</td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-emerald-600">{fmt(p.amount)}</td>
                      <td className="py-3 px-4"><PaymentMethodBadge method={p.payment_method} /></td>
                      <td className="py-3 px-4 text-muted-foreground">{p.received_by}</td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => setViewReceipt(p)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg border border-border hover:bg-muted font-semibold cursor-pointer transition-colors"
                        >
                          <FiFileText className="w-3.5 h-3.5" />
                          <span>Receipt</span>
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
              <div className="text-base font-black tracking-wider text-foreground">PROJECT PACE APPLIANCES & FURNITURE</div>
              <div className="text-[11px] text-muted-foreground">{viewReceipt.branch || 'Main Branch'} · Official Collection Receipt</div>
              <div className="text-xs font-mono font-bold text-primary pt-1">Receipt #{viewReceipt.receipt_no}</div>
            </div>

            <div className="space-y-2 p-3 bg-muted/20 rounded-xl border border-border">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Payment Date:</span>
                <span className="font-mono font-semibold text-foreground">{viewReceipt.payment_date}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Installment:</span>
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
                onClick={printReceipt}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-border hover:bg-muted font-semibold cursor-pointer"
              >
                <FiPrinter className="w-3.5 h-3.5" />
                <span>Print Receipt</span>
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
    </div>
  )
}
