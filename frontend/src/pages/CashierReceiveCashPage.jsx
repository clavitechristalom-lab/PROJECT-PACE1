import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  FiSearch, FiCheckCircle, FiClock, FiFileText, FiUser,
  FiPhone, FiPackage, FiEye, FiZap, FiPrinter, FiSend
} from 'react-icons/fi'
import { TbCashRegister, TbCurrencyPeso } from 'react-icons/tb'
import { useAuth } from '../context/AuthContext'
import {
  PageHeader, StatCard, Card, StatusBadge, Modal,
  Table, TR, TD, LoadingState, EmptyState, ErrorAlert,
  showToast, showLoading, closeLoading
} from '../components/ui'
import { fmt, fmtDate } from '../lib/utils'
import { api } from '../lib/api'
import { useRealtimeSync, triggerDataSync, SyncButton } from '../lib/realtimeSync'

export default function CashierReceiveCashPage() {
  const { user } = useAuth()
  const [payments, setPayments] = useState([])
  const [summary, setSummary] = useState({
    total_received_today: 0,
    confirmed_count_today: 0,
    pending_walkins_count: 0,
    pending_walkins_amount: 0,
  })
  const [branchInfo, setBranchInfo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lookupQuery, setLookupQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')

  const [checkoutTarget, setCheckoutTarget] = useState(null)
  const [cashTendered, setCashTendered] = useState('')
  const [officialReceiptNo, setOfficialReceiptNo] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [receiptTarget, setReceiptTarget] = useState(null)

  const loadWalkInPayments = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true)
    setError('')
    try {
      const res = await api.cashierPayments.getAll({}, { fresh: true })
      setPayments(res?.payments || [])
      if (res?.summary) {
        setSummary(res.summary)
      }
      if (res?.branch) {
        setBranchInfo(res.branch)
      }
    } catch (err) {
      setError(err.message || 'Failed to load walk-in store cash payments.')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadWalkInPayments()
  }, [loadWalkInPayments])

  const { sync: syncCashier, isSyncing } = useRealtimeSync(
    () => loadWalkInPayments({ silent: true }),
    [],
    { module: 'payments' }
  )

  const isSentToStoreAdmin = useCallback((item) => {
    const st = String(item?.status || '').toLowerCase()
    if (item?.sent_to_store_admin) return true
    if (st === 'pending store admin approval' || st === 'pending_store_admin_approval') return true
    return Boolean(
      item?.is_collector_remittance
      && !item?.can_confirm
      && (st === 'completed' || st === 'rejected')
      && String(item?.notes || '').toLowerCase().includes('sent to store admin')
    )
  }, [])

  const tabCounts = useMemo(() => {
    const list = payments || []
    let pending = 0
    let sent = 0
    let confirmed = 0
    for (const item of list) {
      const st = String(item.status || '').toLowerCase()
      if (item.can_confirm) pending++
      if (isSentToStoreAdmin(item)) sent++
      if (st === 'confirmed / received by cashier' || st === 'completed') confirmed++
    }
    return {
      All: list.length,
      Pending: pending,
      'Sent to Store Admin': sent,
      Confirmed: confirmed,
    }
  }, [payments, isSentToStoreAdmin])

  const filteredPayments = useMemo(() => {
    const q = lookupQuery.trim().toLowerCase()
    return (payments || []).filter((item) => {
      const st = String(item.status || '').toLowerCase()
      if (statusFilter === 'Pending') {
        if (!item.can_confirm) return false
      } else if (statusFilter === 'Sent to Store Admin') {
        if (!isSentToStoreAdmin(item)) return false
      } else if (statusFilter === 'Confirmed') {
        if (st !== 'confirmed / received by cashier' && st !== 'completed') return false
      }
      if (!q) return true
      return [
        item.reference_no,
        item.receipt_no,
        item.receipt_reference,
        item.account_no,
        item.customer_code,
        item.customer_name,
        item.customer_phone,
        item.collector_name,
        item.product_name,
      ]
        .filter(Boolean)
        .some((val) => String(val).toLowerCase().includes(q))
    })
  }, [payments, lookupQuery, statusFilter, isSentToStoreAdmin])

  const exactPendingMatch = useMemo(() => {
    const q = lookupQuery.trim().toLowerCase()
    if (!q) return null
    const pendingMatches = filteredPayments.filter(p => p.can_confirm)
    const exact = pendingMatches.find(
      p => String(p.reference_no || '').toLowerCase() === q
        || String(p.account_no || '').toLowerCase() === q
        || String(p.receipt_no || '').toLowerCase() === q
    )
    if (exact) return exact
    return pendingMatches.length === 1 ? pendingMatches[0] : null
  }, [filteredPayments, lookupQuery])

  const openCheckoutModal = (item) => {
    setCheckoutTarget(item)
    setCashTendered(item?.amount ? String(Number(item.amount).toFixed(2)) : '')
    setOfficialReceiptNo(item?.receipt_reference || '')
    setNotes('')
  }

  const closeCheckoutModal = () => {
    if (submitting) return
    setCheckoutTarget(null)
    setCashTendered('')
    setOfficialReceiptNo('')
    setNotes('')
  }

  const handleQuickLookupSubmit = (e) => {
    e.preventDefault()
    if (exactPendingMatch) {
      openCheckoutModal(exactPendingMatch)
    } else if (lookupQuery.trim()) {
      const pending = filteredPayments.filter(p => p.can_confirm)
      if (pending.length === 0) {
        showToast('No pending walk-in cash payment matched that lookup code.', 'info')
      }
    }
  }

  const amountDue = Number(checkoutTarget?.amount || 0)
  const tenderedNum = parseFloat(cashTendered)
  const isTenderedValid = !Number.isNaN(tenderedNum) && tenderedNum >= amountDue && amountDue > 0
  const changeDue = !Number.isNaN(tenderedNum) ? Math.max(0, Math.round((tenderedNum - amountDue) * 100) / 100) : 0
  const shortage = !Number.isNaN(tenderedNum) && tenderedNum < amountDue
    ? Math.round((amountDue - tenderedNum) * 100) / 100
    : 0

  const handleConfirmWalkIn = async (e) => {
    e.preventDefault()
    if (!checkoutTarget) return

    const isColl = Boolean(checkoutTarget.is_collector_remittance)
    if (!isColl && !isTenderedValid) {
      showToast('Cash tendered must be at least the amount due.', 'warning')
      return
    }

    setSubmitting(true)
    showLoading(isColl ? 'Receiving collector cash & sending to Store Admin...' : 'Confirming walk-in cash payment...')
    try {
      const payload = {
        official_receipt_no: officialReceiptNo.trim() || null,
        notes: notes.trim() || null,
      }
      if (!isColl) {
        payload.cash_tendered = Math.round(tenderedNum * 100) / 100
      }
      const res = await api.cashierPayments.confirm(checkoutTarget.payment_id, payload)
      closeLoading()
      showToast(
        res?.message || (isColl ? 'Collector payment received and sent to Store Admin for approval.' : `Payment confirmed! Change due: ${fmt(changeDue)}`),
        'success'
      )
      setCheckoutTarget(null)
      setCashTendered('')
      setOfficialReceiptNo('')
      setNotes('')
      if (res?.payment) {
        setReceiptTarget(res.payment)
      }
      await loadWalkInPayments({ silent: true })
      triggerDataSync('payments')
    } catch (err) {
      closeLoading()
      showToast(err.message || 'Failed to process cash payment.', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const cashierName = user?.name || user?.username || 'Cashier'
  const cashierCode = user?.employee?.employee_code || ''
  const branchLabel = branchInfo?.branch_name
    || user?.employee?.branch_name
    || user?.employee?.branch?.name
    || 'Assigned Branch'

  return (
    <div className="space-y-6">
      <PageHeader
        title="Receive Cash"
        subtitle={`Walk-In Counter Cash Drawer • ${branchLabel} • ${cashierName}${cashierCode ? ` (${cashierCode})` : ''}`}
        action={
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 text-xs font-bold">
              <TbCashRegister className="w-4 h-4" />
              <span>Cashier • {branchLabel}</span>
            </span>
            <SyncButton sync={syncCashier} isSyncing={isSyncing} label="Sync" />
          </div>
        }
      />

      {error && <ErrorAlert message={error} onRetry={() => loadWalkInPayments()} />}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Cash Received Today"
          value={fmt(summary.total_received_today)}
          sub={`Active shift drawer (${branchLabel})`}
          icon={<TbCurrencyPeso className="w-5 h-5" />}
          color="emerald"
        />
        <StatCard
          title="Confirmed Transactions Count"
          value={String(summary.confirmed_count_today || 0)}
          sub="Counter & collector receipts today"
          icon={<FiCheckCircle className="w-5 h-5" />}
          color="blue"
        />
        <StatCard
          title="Pending Counter / Collector"
          value={String(summary.pending_walkins_count || 0)}
          sub={`${fmt(summary.pending_walkins_amount)} awaiting cashier`}
          icon={<FiClock className="w-5 h-5" />}
          color="amber"
        />
        <StatCard
          title="Sent to Store Admin"
          value={String(summary.sent_to_admin_count ?? tabCounts['Sent to Store Admin'] ?? 0)}
          sub={
            (summary.awaiting_admin_count || 0) > 0
              ? `${summary.awaiting_admin_count} awaiting approval (${fmt(summary.awaiting_admin_amount || 0)})`
              : `${fmt(summary.sent_to_admin_amount || 0)} forwarded to Store Admin`
          }
          icon={<FiSend className="w-5 h-5" />}
          color="indigo"
        />
      </div>

      <Card>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4">
          <form onSubmit={handleQuickLookupSubmit} className="flex items-center gap-2 flex-1 max-w-xl">
            <div className="relative flex-1">
              <FiSearch className="w-4 h-4 text-muted-foreground absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={lookupQuery}
                onChange={(e) => setLookupQuery(e.target.value)}
                placeholder="Quick counter lookup by Reference (REF-CASH-...), Account (ACC-...), or Customer..."
                className="w-full pl-10 pr-4 py-2 text-xs rounded-xl bg-background border border-border focus:border-emerald-600 text-foreground outline-none transition-colors"
              />
            </div>
            {exactPendingMatch && (
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer shrink-0"
              >
                <FiZap className="w-3.5 h-3.5" />
                <span>Process {exactPendingMatch.reference_no}</span>
              </button>
            )}
          </form>

          <div className="flex items-center gap-2 flex-wrap">
            {['All', 'Pending', 'Sent to Store Admin', 'Confirmed'].map((tab) => {
              const active = statusFilter === tab
              const count = tabCounts[tab] ?? 0
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setStatusFilter(tab)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer border ${
                    active
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                      : 'bg-background text-muted-foreground border-border hover:bg-muted/60 hover:text-foreground'
                  }`}
                >
                  <span>{tab === 'Confirmed' ? 'Approved / Completed' : tab}</span>
                  <span
                    className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${
                      active
                        ? 'bg-white/20 text-white'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {loading ? (
          <LoadingState message="Loading branch cash queue..." />
        ) : filteredPayments.length === 0 ? (
          <EmptyState
            icon={<TbCashRegister className="w-8 h-8 text-muted-foreground" />}
            title="No cash payments found"
            description={
              lookupQuery
                ? 'No branch payments match your lookup criteria.'
                : statusFilter === 'Sent to Store Admin'
                  ? 'No collector cash remittances have been forwarded to Store Admin yet.'
                  : statusFilter !== 'All'
                    ? `No ${statusFilter === 'Confirmed' ? 'approved / completed' : statusFilter.toLowerCase()} cash payments in this branch yet.`
                    : 'Walk-in cash payments and Collector remittances sent to the Cashier will appear here.'
            }
          />
        ) : (
          <Table
            headers={[
              'Reference / Source',
              'Account / Order',
              'Customer',
              'Customer Installment Details',
              'Amount Due',
              'Cash / OR #',
              'Status',
              'Action',
            ]}
          >
            {filteredPayments.map((item) => {
              const instDet = item.installment_details
              return (
              <TR key={item.payment_id}>
                <TD>
                  <div className="font-mono font-bold text-xs text-foreground">{item.reference_no}</div>
                  <div className="text-[10px] font-mono text-muted-foreground">{item.receipt_no}</div>
                  {item.is_collector_remittance ? (
                    <span className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[10px] font-bold">
                      Collector: {item.collector_name || 'Field Collector'}
                    </span>
                  ) : (
                    <span className="inline-flex items-center mt-1 px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[10px] font-semibold">
                      Walk-In Counter
                    </span>
                  )}
                </TD>
                <TD>
                  <span className="font-mono font-bold text-xs text-primary">{item.account_no}</span>
                  {item.customer_code && (
                    <div className="text-[10px] font-mono text-muted-foreground">{item.customer_code}</div>
                  )}
                </TD>
                <TD>
                  <div className="font-semibold text-xs text-foreground">{item.customer_name}</div>
                  {item.customer_phone && (
                    <div className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                      <FiPhone className="w-3 h-3" />
                      <span>{item.customer_phone}</span>
                    </div>
                  )}
                </TD>
                <TD>
                  <div className="text-xs font-medium text-foreground max-w-[240px] truncate" title={item.product_name}>
                    {item.product_name}
                  </div>
                  {instDet ? (
                    <div className="text-[10px] text-muted-foreground mt-0.5 space-y-0.5">
                      <div className="font-mono">
                        Bal: <strong className="text-rose-500">{fmt(instDet.remaining_balance)}</strong> • Paid: {fmt(instDet.total_paid)}
                      </div>
                      <div>
                        Terms: <strong className="text-foreground">{instDet.terms_paid}/{instDet.total_terms || '—'}</strong> • {fmtDate(item.payment_date)}
                      </div>
                    </div>
                  ) : (
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {item.payment_type === 'installment' ? 'Installment Payment' : 'Walk-In Cash Order'} • {fmtDate(item.payment_date)}
                    </div>
                  )}
                </TD>
                <TD>
                  <span className="font-mono font-black text-sm text-emerald-600 dark:text-emerald-400">
                    {fmt(item.amount)}
                  </span>
                </TD>
                <TD>
                  {item.receipt_reference && (
                    <div className="text-[10px] font-mono font-bold text-cyan-700 dark:text-cyan-300 mb-0.5">
                      OR: {item.receipt_reference}
                    </div>
                  )}
                  {item.cash_tendered !== null && item.cash_tendered !== undefined ? (
                    <div className="text-[11px] font-mono space-y-0.5">
                      <div className="text-foreground font-bold">In: {fmt(item.cash_tendered)}</div>
                      <div className="text-muted-foreground">Chg: {fmt(item.change_due || 0)}</div>
                    </div>
                  ) : (
                    <span className="text-[11px] italic text-muted-foreground">Awaiting counter</span>
                  )}
                </TD>
                <TD>
                  <StatusBadge status={item.status} />
                  {isSentToStoreAdmin(item) && (
                    <div className="text-[10px] mt-1 leading-tight">
                      {item.awaiting_store_admin || String(item.status || '').toLowerCase() === 'pending store admin approval' ? (
                        <span className="text-indigo-600 dark:text-indigo-400 font-semibold">
                          Forwarded • Awaiting Store Admin
                        </span>
                      ) : String(item.status || '').toLowerCase() === 'rejected' ? (
                        <span className="text-rose-600 dark:text-rose-400 font-semibold">
                          Rejected{item.approved_by_name ? ` by ${item.approved_by_name}` : ' by Store Admin'}
                        </span>
                      ) : (
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                          Approved{item.approved_by_name ? ` by ${item.approved_by_name}` : ' by Store Admin'}
                        </span>
                      )}
                    </div>
                  )}
                </TD>
                <TD>
                  <div className="flex items-center gap-1.5">
                    {item.can_confirm && (
                      <button
                        type="button"
                        onClick={() => openCheckoutModal(item)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-white font-bold text-xs shadow-xs transition-colors cursor-pointer ${
                          item.is_collector_remittance
                            ? 'bg-indigo-600 hover:bg-indigo-700'
                            : 'bg-emerald-600 hover:bg-emerald-700'
                        }`}
                      >
                        <TbCashRegister className="w-3.5 h-3.5" />
                        <span>{item.is_collector_remittance ? 'Receive & Send to Admin' : 'Receive Cash'}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setReceiptTarget(item)}
                      className="inline-flex items-center justify-center w-8 h-8 rounded-xl border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                      title="View Installment & Receipt Details"
                    >
                      <FiEye className="w-4 h-4" />
                    </button>
                  </div>
                </TD>
              </TR>
              )
            })}
          </Table>
        )}
      </Card>

      {checkoutTarget && (
        <Modal
          isOpen={true}
          onClose={closeCheckoutModal}
          title={checkoutTarget.is_collector_remittance ? 'Receive Collector Cash & Send to Store Admin' : 'Counter Walk-In Cash Receipt'}
          size="md"
        >
          <form onSubmit={handleConfirmWalkIn} className="space-y-4 text-xs">
            <div className="p-3.5 rounded-xl bg-muted/40 border border-border space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Reference #:</span>
                <span className="font-mono font-bold text-foreground">{checkoutTarget.reference_no}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Account / Order:</span>
                <span className="font-mono font-bold text-primary">{checkoutTarget.account_no}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Customer:</span>
                <span className="font-semibold text-foreground">
                  {checkoutTarget.customer_name}{checkoutTarget.customer_code ? ` (${checkoutTarget.customer_code})` : ''}
                </span>
              </div>
              {checkoutTarget.customer_phone && (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Phone:</span>
                  <span className="font-mono text-foreground">{checkoutTarget.customer_phone}</span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Financed Item:</span>
                <span className="font-medium text-foreground text-right max-w-[240px] truncate">{checkoutTarget.product_name}</span>
              </div>
              {checkoutTarget.installment_details && (
                <div className="pt-2 mt-1 border-t border-border/70 grid grid-cols-2 gap-2 text-[11px] bg-primary/5 rounded-lg p-2.5">
                  <div>
                    <span className="text-muted-foreground block">Contract Total</span>
                    <span className="font-mono font-bold text-foreground">{fmt(checkoutTarget.installment_details.total_payable)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Paid So Far</span>
                    <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{fmt(checkoutTarget.installment_details.total_paid)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Remaining Balance</span>
                    <span className="font-mono font-black text-rose-500">{fmt(checkoutTarget.installment_details.remaining_balance)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Terms / Monthly</span>
                    <span className="font-mono font-semibold text-foreground">
                      {checkoutTarget.installment_details.terms_paid}/{checkoutTarget.installment_details.total_terms || '—'} • {fmt(checkoutTarget.installment_details.installment_amount)}
                    </span>
                  </div>
                </div>
              )}
              {checkoutTarget.is_collector_remittance && (
                <>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Collected By (Collector):</span>
                    <span className="font-bold text-amber-600 dark:text-amber-400">
                      {checkoutTarget.collector_name || 'Field Collector'}{checkoutTarget.collector_code ? ` (${checkoutTarget.collector_code})` : ''}
                    </span>
                  </div>
                  {checkoutTarget.collector_remarks && (
                    <div className="flex justify-between items-start gap-2">
                      <span className="text-muted-foreground shrink-0">Collector Remarks:</span>
                      <span className="text-foreground text-right">{checkoutTarget.collector_remarks}</span>
                    </div>
                  )}
                </>
              )}
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Payment Method:</span>
                <span className="font-bold text-primary">{checkoutTarget.payment_method || 'Cash'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Cashier on Duty:</span>
                <span className="font-semibold text-foreground">
                  {cashierName}{cashierCode ? ` (${cashierCode})` : ''}
                </span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-border">
                <span className="font-bold uppercase text-muted-foreground">
                  {checkoutTarget.is_collector_remittance ? 'Collected Amount:' : 'Amount Due:'}
                </span>
                <span className="text-xl font-mono font-black text-emerald-600 dark:text-emerald-400">
                  {fmt(amountDue)}
                </span>
              </div>
              {checkoutTarget.proof_of_payment && (
                <div className="pt-2 border-t border-border space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Proof of Payment</span>
                    <a
                      href={checkoutTarget.proof_of_payment}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] font-semibold text-primary hover:underline"
                    >
                      View Full Image ↗
                    </a>
                  </div>
                  <div className="p-2 rounded-xl border border-border bg-background/70 flex justify-center">
                    <a href={checkoutTarget.proof_of_payment} target="_blank" rel="noopener noreferrer">
                      <img
                        src={checkoutTarget.proof_of_payment}
                        alt="Proof of Payment"
                        className="max-h-44 object-contain rounded-lg shadow-xs"
                      />
                    </a>
                  </div>
                </div>
              )}
            </div>

            {!checkoutTarget.is_collector_remittance && (
              <>
                <div className="space-y-2">
                  <label className="font-bold uppercase tracking-wide text-[11px] text-foreground flex items-center justify-between">
                    <span>Cash Tendered (₱) *</span>
                    <button
                      type="button"
                      onClick={() => setCashTendered(amountDue.toFixed(2))}
                      className="text-emerald-600 dark:text-emerald-400 hover:underline font-bold cursor-pointer normal-case"
                    >
                      Set Exact Amount
                    </button>
                  </label>

                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-lg font-black text-muted-foreground">₱</span>
                    <input
                      type="number"
                      step="0.01"
                      min={amountDue}
                      required
                      value={cashTendered}
                      onChange={(e) => setCashTendered(e.target.value)}
                      placeholder="0.00"
                      className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-background border border-border focus:border-emerald-600 text-foreground font-mono font-black text-lg outline-none transition-colors"
                      autoFocus
                    />
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    {[500, 1000, 2000, 5000].filter(v => v >= amountDue).map((bill) => (
                      <button
                        key={bill}
                        type="button"
                        onClick={() => setCashTendered(String(bill))}
                        className="px-2.5 py-1 rounded-lg bg-muted/60 hover:bg-muted border border-border text-[11px] font-mono font-bold text-foreground cursor-pointer transition-colors"
                      >
                        ₱{bill.toLocaleString()}
                      </button>
                    ))}
                  </div>
                </div>

                <div className={`p-3.5 rounded-xl border flex items-center justify-between ${
                  shortage > 0
                    ? 'bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400'
                    : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                }`}>
                  <span className="font-bold uppercase text-xs">
                    {shortage > 0 ? 'Cash Shortage:' : 'Change Due:'}
                  </span>
                  <span className="font-mono font-black text-xl">
                    {shortage > 0 ? fmt(shortage) : fmt(changeDue)}
                  </span>
                </div>
              </>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="font-bold uppercase tracking-wide text-[11px] text-foreground flex items-center gap-1">
                  <FiFileText className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Official Receipt # (Optional)</span>
                </label>
                <input
                  type="text"
                  value={officialReceiptNo}
                  onChange={(e) => setOfficialReceiptNo(e.target.value)}
                  placeholder="e.g. OR-COUNTER-0089"
                  className="w-full px-3 py-2 rounded-xl bg-background border border-border focus:border-emerald-600 text-foreground font-mono text-xs outline-none transition-colors"
                />
              </div>
              <div className="space-y-1">
                <label className="font-bold uppercase tracking-wide text-[11px] text-foreground">
                  Counter Note (Optional)
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Walk-in counter cash verified"
                  className="w-full px-3 py-2 rounded-xl bg-background border border-border focus:border-emerald-600 text-foreground text-xs outline-none transition-colors"
                />
              </div>
            </div>

            {checkoutTarget.is_collector_remittance && (
              <div className="p-3 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/60 text-[11px] text-indigo-800 dark:text-indigo-200">
                Confirming verifies physical cash received from Collector <strong>{checkoutTarget.collector_name || 'Field Collector'}</strong> and sends this payment with full <strong>Customer Installment details</strong> to the <strong>Store Admin</strong> for final approval.
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={closeCheckoutModal}
                disabled={submitting}
                className="px-4 py-2 rounded-xl border border-border hover:bg-muted font-semibold text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || (!checkoutTarget.is_collector_remittance && !isTenderedValid)}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-white font-bold text-xs shadow-xs cursor-pointer disabled:opacity-50 ${
                  checkoutTarget.is_collector_remittance
                    ? 'bg-indigo-600 hover:bg-indigo-700'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                <FiCheckCircle className="w-4 h-4" />
                <span>
                  {submitting
                    ? (checkoutTarget.is_collector_remittance ? 'Sending to Store Admin...' : 'Confirming...')
                    : (checkoutTarget.is_collector_remittance ? 'Receive & Send to Store Admin' : 'Confirm Cash Receipt & Settle')}
                </span>
              </button>
            </div>
          </form>
        </Modal>
      )}

      {receiptTarget && (
        <Modal
          isOpen={true}
          onClose={() => setReceiptTarget(null)}
          title={receiptTarget.is_collector_remittance ? 'Collector Remittance & Customer Installment Details' : 'Walk-In Cash Counter Receipt'}
          size="md"
        >
          <div className="space-y-4 text-xs">
            <div className="p-4 rounded-xl bg-muted/30 border border-border space-y-2">
              <div className="text-center pb-2 border-b border-border">
                <div className="font-black text-sm text-foreground">Z-LICZ Furniture &amp; Appliances Trading</div>
                <div className="text-[11px] text-muted-foreground">{receiptTarget.branch_name || branchLabel}</div>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Reference #:</span>
                <span className="font-mono font-bold text-foreground">{receiptTarget.reference_no}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Receipt #:</span>
                <span className="font-mono font-bold text-foreground">{receiptTarget.receipt_no}</span>
              </div>
              {receiptTarget.receipt_reference && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Official Receipt #:</span>
                  <span className="font-mono font-bold text-emerald-600">{receiptTarget.receipt_reference}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Account / Order:</span>
                <span className="font-mono font-bold text-primary">{receiptTarget.account_no}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Customer:</span>
                <span className="font-semibold text-foreground flex items-center gap-1">
                  <FiUser className="w-3 h-3" />
                  <span>{receiptTarget.customer_name}{receiptTarget.customer_code ? ` (${receiptTarget.customer_code})` : ''}</span>
                </span>
              </div>
              {receiptTarget.customer_phone && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Customer Phone:</span>
                  <span className="font-mono text-foreground">{receiptTarget.customer_phone}</span>
                </div>
              )}
              {receiptTarget.customer_address && (
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground shrink-0">Customer Address:</span>
                  <span className="text-foreground text-right">{receiptTarget.customer_address}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Financed Item:</span>
                <span className="font-medium text-foreground flex items-center gap-1">
                  <FiPackage className="w-3 h-3" />
                  <span>{receiptTarget.product_name}</span>
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Payment Method:</span>
                <span className="font-bold text-primary">{receiptTarget.payment_method || 'Cash'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Status:</span>
                <StatusBadge status={receiptTarget.status} />
              </div>
              {receiptTarget.installment_details && (
                <div className="pt-2 border-t border-border space-y-1.5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-primary">Customer Installment Summary</div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Contract Total:</span>
                    <span className="font-mono font-bold text-foreground">{fmt(receiptTarget.installment_details.total_payable)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Paid:</span>
                    <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{fmt(receiptTarget.installment_details.total_paid)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Remaining Balance:</span>
                    <span className="font-mono font-black text-rose-500">{fmt(receiptTarget.installment_details.remaining_balance)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Terms Progress:</span>
                    <span className="font-mono font-semibold text-foreground">
                      {receiptTarget.installment_details.terms_paid}/{receiptTarget.installment_details.total_terms || '—'} paid ({fmt(receiptTarget.installment_details.installment_amount)} / mo)
                    </span>
                  </div>
                  {receiptTarget.installment_details.next_due_date && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Next Due Date:</span>
                      <span className="font-mono text-foreground">{fmtDate(receiptTarget.installment_details.next_due_date)}</span>
                    </div>
                  )}
                </div>
              )}
              {receiptTarget.collector_name && (
                <div className="flex justify-between pt-2 border-t border-border">
                  <span className="text-muted-foreground">Collected By (Collector):</span>
                  <span className="font-semibold text-amber-600 dark:text-amber-400">
                    {receiptTarget.collector_name}{receiptTarget.collector_code ? ` (${receiptTarget.collector_code})` : ''}
                  </span>
                </div>
              )}
              {receiptTarget.collector_remarks && (
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground shrink-0">Collector Remarks:</span>
                  <span className="text-foreground text-right">{receiptTarget.collector_remarks}</span>
                </div>
              )}
              <div className="pt-2 border-t border-border space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Amount Due:</span>
                  <span className="font-mono font-black text-sm text-foreground">{fmt(receiptTarget.amount)}</span>
                </div>
                {receiptTarget.cash_tendered !== null && receiptTarget.cash_tendered !== undefined && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Cash Tendered:</span>
                      <span className="font-mono font-bold text-foreground">{fmt(receiptTarget.cash_tendered)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Change Due:</span>
                      <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{fmt(receiptTarget.change_due || 0)}</span>
                    </div>
                  </>
                )}
                {receiptTarget.installment_id && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Remaining Balance:</span>
                    <span className="font-mono font-bold text-primary">{fmt(receiptTarget.remaining_balance || 0)}</span>
                  </div>
                )}
              </div>
              {receiptTarget.cashier_name && (
                <div className="flex justify-between pt-2 border-t border-border">
                  <span className="text-muted-foreground">Processed By Cashier:</span>
                  <span className="font-semibold text-foreground">
                    {receiptTarget.cashier_name}{receiptTarget.cashier_code ? ` (${receiptTarget.cashier_code})` : ''}
                  </span>
                </div>
              )}
              {receiptTarget.approved_by_name && isSentToStoreAdmin(receiptTarget) && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {String(receiptTarget.status || '').toLowerCase() === 'rejected' ? 'Rejected By Store Admin:' : 'Approved By Store Admin:'}
                  </span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                    {receiptTarget.approved_by_name}
                  </span>
                </div>
              )}
              {receiptTarget.confirmed_at && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Confirmed At:</span>
                  <span className="font-mono text-foreground">{fmtDate(receiptTarget.confirmed_at)}</span>
                </div>
              )}
              {receiptTarget.proof_of_payment && (
                <div className="pt-2 border-t border-border space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Proof of Payment</span>
                    <a
                      href={receiptTarget.proof_of_payment}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] font-semibold text-primary hover:underline"
                    >
                      View Full Image ↗
                    </a>
                  </div>
                  <div className="p-2 rounded-xl border border-border bg-background/70 flex justify-center">
                    <a href={receiptTarget.proof_of_payment} target="_blank" rel="noopener noreferrer">
                      <img
                        src={receiptTarget.proof_of_payment}
                        alt="Proof of Payment"
                        className="max-h-52 object-contain rounded-lg shadow-xs"
                      />
                    </a>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-between items-center pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-primary text-primary-foreground font-semibold cursor-pointer"
              >
                <FiPrinter className="w-3.5 h-3.5" />
                <span>Print Receipt</span>
              </button>
              <button
                type="button"
                onClick={() => setReceiptTarget(null)}
                className="px-4 py-1.5 rounded-xl border border-border hover:bg-muted font-semibold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
