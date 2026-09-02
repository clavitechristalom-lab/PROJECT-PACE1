import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  FiSmartphone, FiCreditCard, FiFileText,
  FiDownload, FiPrinter, FiBarChart2, FiEye, FiSearch,
  FiCalendar, FiCheckCircle, FiAlertTriangle, FiX, FiFilter
} from 'react-icons/fi'
import {
  Btn, Badge, StatusBadge, Input, Select, Modal,
  Table, TR, TD, SearchBar, PageHeader, StatCard, Card, Pagination, showToast,
  LoadingState, ErrorAlert, TableSkeleton, EmptyState,
} from '../components/ui'
import { fmt, fmtDate, filterBySearch } from '../lib/utils'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import { TbCurrencyPeso } from 'react-icons/tb'
import MySalesChart from '../components/MySalesChart'

// Provider Badge Component with Brand Colors & React Icons
function ProviderBadge({ provider, channel }) {
  if (provider === 'GCash') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800">
        <FiSmartphone className="w-3.5 h-3.5 text-blue-500" />
        <span>GCash</span>
      </span>
    )
  }
  if (provider === 'Maya') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800">
        <FiSmartphone className="w-3.5 h-3.5 text-emerald-500" />
        <span>Maya</span>
      </span>
    )
  }
  if (provider === 'BDO Online' || provider === 'BPI Online' || provider === 'UnionBank' || channel === 'online_bank') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800">
        <FiCreditCard className="w-3.5 h-3.5 text-indigo-500" />
        <span>{provider || 'Online Banking'}</span>
      </span>
    )
  }
  if (channel === 'ewallet') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-sky-50 text-sky-700 border border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800">
        <FiSmartphone className="w-3.5 h-3.5 text-sky-500" />
        <span>{provider || 'E-Wallet'}</span>
      </span>
    )
  }
  if (channel === 'installment') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800">
        <FiFileText className="w-3.5 h-3.5 text-amber-500" />
        <span>Installment</span>
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-muted text-muted-foreground border border-border">
      <TbCurrencyPeso className="w-3.5 h-3.5 text-emerald-500" />
      <span>Cash</span>
    </span>
  )
}

export default function TransactionsPage() {
  const { user } = useAuth()
  const [transactions, setTransactions] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [activeChannelTab, setActiveChannelTab] = useState('All')
  const [typeFilter, setTypeFilter] = useState('All')
  const [providerFilter, setProviderFilter] = useState('All')
  const [dateRange, setDateRange] = useState('All')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 10

  // Modal State
  const [selectedTx, setSelectedTx] = useState(null)

  const loadData = async () => {
    setLoading(true)
    setError('')
    try {
      let from = dateFrom || undefined
      let to = dateTo || undefined

      const now = new Date()
      if (dateRange === 'Today') {
        from = to = now.toISOString().slice(0, 10)
      } else if (dateRange === 'ThisMonth') {
        from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
        to = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)
      }

      const res = await api.transactions.getAll({
        search: search || undefined,
        channel: activeChannelTab !== 'All' ? activeChannelTab : undefined,
        type: typeFilter !== 'All' ? typeFilter : undefined,
        payment_method: providerFilter !== 'All' ? providerFilter : undefined,
        date_from: from,
        date_to: to,
      })

      setTransactions(res.transactions || [])
      setSummary(res.summary || null)
    } catch (err) {
      console.error('Failed to load transaction history:', err)
      setError(err.message || 'Failed to fetch transaction history')
    } finally {
      setLoading(false)
    }
  }

  const [searchParams] = useSearchParams()

  useEffect(() => {
    loadData()
  }, [activeChannelTab, typeFilter, providerFilter, dateRange, dateFrom, dateTo])

  useEffect(() => {
    const id = searchParams.get('id')
    if (id) {
      const found = transactions.find(t => String(t.sale_id) === String(id))
      if (found) {
        setSelectedTx(found)
      } else {
        api.transactions.getAll({ search: id })
          .then(res => {
            if (res.transactions?.length > 0) {
              setSelectedTx(res.transactions[0])
            }
          })
          .catch(err => console.warn('Could not auto-open transaction:', err))
      }
    }
  }, [searchParams, transactions.length])

  // Export to CSV Function
  const handleExportCSV = () => {
    if (!filtered || filtered.length === 0) {
      showToast('No transactions to export', 'error')
      return
    }

    const headers = [
      'Reference Code',
      'Transaction Type',
      'Channel',
      'Payment Provider / Method',
      'Digital Reference / Trace No',
      'Date',
      'Customer Code',
      'Customer Name',
      'Amount (PHP)',
      'Amount Paid (PHP)',
      'Balance Due (PHP)',
      'Status',
      'Handled By',
      'Notes',
    ]

    const escapeCSV = (val) => {
      if (val === null || val === undefined) return '""'
      const str = String(val).replace(/"/g, '""')
      return `"${str}"`
    }

    const csvRows = [
      headers.join(','),
      ...filtered.map(tx => [
        escapeCSV(tx.reference_code),
        escapeCSV(tx.type),
        escapeCSV(
          tx.channel === 'ewallet'
            ? 'E-Wallet'
            : tx.channel === 'online_bank'
            ? 'Online Banking'
            : tx.channel === 'installment'
            ? 'Installment'
            : 'Cash'
        ),
        escapeCSV(tx.provider || tx.payment_method),
        escapeCSV(tx.reference_no || ''),
        escapeCSV(tx.date),
        escapeCSV(tx.customer_code !== '—' ? tx.customer_code : ''),
        escapeCSV(tx.customer_name),
        tx.amount.toFixed(2),
        (tx.amount_paid || 0).toFixed(2),
        (tx.balance_due || 0).toFixed(2),
        escapeCSV(tx.status),
        escapeCSV(tx.processed_by),
        escapeCSV(tx.notes || ''),
      ].join(',')),
    ]

    const csvContent = '\uFEFF' + csvRows.join('\r\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')

    const channelSuffix = activeChannelTab !== 'All' ? `_${activeChannelTab}` : ''
    const dateStr = new Date().toISOString().slice(0, 10)
    link.setAttribute('href', url)
    link.setAttribute('download', `transactions_export${channelSuffix}_${dateStr}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    showToast(`Exported ${filtered.length} transactions to CSV successfully`, 'success')
  }

  // Filter & Pagination
  const filtered = useMemo(() => {
    return filterBySearch(transactions, search, [
      'reference_code', 'reference_no', 'provider', 'customer_name', 'customer_code', 'account_no', 'processed_by', 'payment_method', 'type', 'notes'
    ])
  }, [transactions, search])

  const total = filtered.length
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Transaction History"
        subtitle="Comprehensive audit trail of E-Wallet, Online Banking, Cash, and Installment transactions"
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-border bg-card hover:bg-muted font-semibold text-xs text-foreground cursor-pointer shadow-2xs transition-colors"
            >
              <FiDownload className="w-4 h-4" />
              <span>Export CSV</span>
            </button>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
            >
              <FiPrinter className="w-4 h-4" />
              <span>Print History</span>
            </button>
          </div>
        }
      />

      <MySalesChart />

      {error && <ErrorAlert message={error} onRetry={loadData} />}

      {/* KPI Cards Breakdown */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          title="Total Volume"
          value={fmt(summary?.total_volume || 0)}
          sub={`${summary?.total_count || 0} total transactions`}
          icon={<FiBarChart2 className="w-5 h-5" />}
          color="blue"
        />
        <StatCard
          title="E-Wallet Volume"
          value={fmt(summary?.ewallet_total || 0)}
          sub={`${summary?.ewallet_count || 0} GCash & Maya`}
          icon={<FiSmartphone className="w-5 h-5 text-blue-500" />}
          color="blue"
        />
        <StatCard
          title="Online Banking"
          value={fmt(summary?.online_bank_total || 0)}
          sub={`${summary?.online_bank_count || 0} Bank transfers / InstaPay`}
          icon={<FiCreditCard className="w-5 h-5 text-indigo-500" />}
          color="indigo"
        />
        <StatCard
          title="Cash & Installments"
          value={fmt((summary?.cash_collected || 0) + (summary?.installment_volume || 0))}
          sub={`${(summary?.cash_count || 0) + (summary?.installment_count || 0)} counter & ledger txns`}
          icon={<TbCurrencyPeso className="w-5 h-5 text-emerald-500" />}
          color="green"
        />
      </div>

      {/* Channel Switcher Tabs */}
      <div className="flex border-b border-border overflow-x-auto bg-card rounded-t-2xl px-2 pt-2 shadow-2xs gap-1">
        {[
          { id: 'All', label: 'All Transactions', icon: <FiFileText className="w-3.5 h-3.5" />, count: summary?.total_count },
          { id: 'ewallet', label: 'E-Wallet History', icon: <FiSmartphone className="w-3.5 h-3.5" />, count: summary?.ewallet_count },
          { id: 'online_bank', label: 'Online Banking History', icon: <FiCreditCard className="w-3.5 h-3.5" />, count: summary?.online_bank_count },
          { id: 'cash', label: 'Cash Payments', icon: <TbCurrencyPeso className="w-3.5 h-3.5" />, count: summary?.cash_count },
          { id: 'installment', label: 'Installment Accounts', icon: <FiFileText className="w-3.5 h-3.5" />, count: summary?.installment_count },
        ].map(tab => {
          const isActive = activeChannelTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveChannelTab(tab.id)
                setPage(1)
              }}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold cursor-pointer border-b-2 transition-all whitespace-nowrap ${
                isActive
                  ? 'border-primary text-primary bg-primary/5 rounded-t-xl'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40'
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                  isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Filters & Search Card */}
      <Card noPad className="p-3.5 border border-border">
        <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
          <div className="w-full md:w-80 relative">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search reference, GCash ref, bank trace, customer..."
              className="w-full pl-9 pr-8 py-2 rounded-xl border border-border bg-card text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-muted-foreground/70"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <FiX className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            {/* Type Filter */}
            <select
              value={typeFilter}
              onChange={e => { setTypeFilter(e.target.value); setPage(1) }}
              className="border border-border rounded-xl px-3 py-2 text-xs font-semibold text-foreground bg-card cursor-pointer"
            >
              <option value="All">All Record Types</option>
              <option value="Sale">Sale Invoices Only</option>
              <option value="Payment">Installment Collections Only</option>
            </select>

            {/* Provider Filter */}
            <select
              value={providerFilter}
              onChange={e => { setProviderFilter(e.target.value); setPage(1) }}
              className="border border-border rounded-xl px-3 py-2 text-xs font-semibold text-foreground bg-card cursor-pointer"
            >
              <option value="All">All Providers / Methods</option>
              <option value="GCash">GCash</option>
              <option value="Maya">Maya</option>
              <option value="BDO Online">BDO Online</option>
              <option value="BPI Online">BPI Online</option>
              <option value="UnionBank">UnionBank</option>
              <option value="Bank Transfer">Bank Transfer / InstaPay</option>
              <option value="Cash">Cash</option>
              <option value="Installment">Installment</option>
            </select>

            {/* Date Range Filter */}
            <select
              value={dateRange}
              onChange={e => { setDateRange(e.target.value); setPage(1) }}
              className="border border-border rounded-xl px-3 py-2 text-xs font-semibold text-foreground bg-card cursor-pointer"
            >
              <option value="All">All Time</option>
              <option value="Today">Today</option>
              <option value="ThisMonth">This Month</option>
              <option value="Custom">Custom Range</option>
            </select>

            {dateRange === 'Custom' && (
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={dateFrom}
                  onChange={e => setDateFrom(e.target.value)}
                  className="border border-border rounded-xl px-2.5 py-1.5 text-xs bg-card text-foreground font-mono"
                />
                <span className="text-xs text-muted-foreground">to</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={e => setDateTo(e.target.value)}
                  className="border border-border rounded-xl px-2.5 py-1.5 text-xs bg-card text-foreground font-mono"
                />
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Transactions Data Table */}
      <Card noPad className="border border-border overflow-hidden">
        {loading ? (
          <TableSkeleton rows={8} cols={8} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<FiFileText className="w-12 h-12 text-muted-foreground/30 mx-auto" />}
            title={`No ${activeChannelTab === 'ewallet' ? 'E-Wallet' : activeChannelTab === 'online_bank' ? 'Online Banking' : ''} transactions found`}
            description="No transactions match your current search and filter criteria."
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/50 text-muted-foreground uppercase font-semibold text-[11px]">
                    <th className="py-3 px-4 text-left">Reference / Code</th>
                    <th className="py-3 px-4 text-left">Payment Channel</th>
                    <th className="py-3 px-4 text-left">Digital Ref / Trace #</th>
                    <th className="py-3 px-4 text-left">Date</th>
                    <th className="py-3 px-4 text-left">Customer</th>
                    <th className="py-3 px-4 text-right">Amount</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-left">Handled By</th>
                    <th className="py-3 px-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {paged.map((tx, i) => {
                    const isSale = tx.category === 'sales'
                    return (
                      <tr key={tx.id || i} className={`hover:bg-muted/40 transition-colors ${i % 2 === 1 ? 'bg-muted/10' : ''}`}>
                        <td className="py-3 px-4 font-mono font-semibold text-primary">
                          <div className="flex items-center gap-1.5">
                            <FiFileText className="w-3.5 h-3.5 shrink-0" />
                            <span>{tx.reference_code}</span>
                          </div>
                          <div className="text-[10px] text-muted-foreground font-normal flex items-center gap-1 mt-0.5">
                            <span className={`inline-block w-1.5 h-1.5 rounded-full ${isSale ? 'bg-blue-500' : 'bg-emerald-500'}`} />
                            {isSale ? 'Sale Invoice' : 'Collection'}
                            {tx.account_no && tx.account_no !== 'N/A' && ` · ${tx.account_no}`}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <ProviderBadge provider={tx.provider} channel={tx.channel} />
                        </td>
                        <td className="py-3 px-4 font-mono">
                          {tx.reference_no && tx.reference_no.trim() !== '' ? (
                            <span className="font-semibold text-foreground bg-muted px-2 py-0.5 rounded-md border border-border">
                              {tx.reference_no}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4 font-mono text-muted-foreground">{tx.date}</td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-foreground">{tx.customer_name}</div>
                          {tx.customer_code !== '—' && (
                            <div className="text-[10px] text-muted-foreground font-mono">{tx.customer_code}</div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-foreground">
                          {fmt(tx.amount)}
                          {isSale && tx.payment_method === 'Installment' && tx.amount_paid > 0 && (
                            <div className="text-[10px] text-emerald-600 font-normal">
                              DP: {fmt(tx.amount_paid)}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <StatusBadge status={tx.status} />
                        </td>
                        <td className="py-3 px-4 text-muted-foreground">{tx.processed_by}</td>
                        <td className="py-3 px-4 text-center">
                          <button
                            onClick={() => setSelectedTx(tx)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg border border-border hover:bg-muted font-semibold cursor-pointer transition-colors"
                          >
                            <FiEye className="w-3.5 h-3.5" />
                            <span>Proof</span>
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <Pagination total={total} page={page} pageSize={pageSize} onChange={setPage} />
          </>
        )}
      </Card>

      {/* Transaction Details & Digital Payment Proof Modal */}
      {selectedTx && (
        <Modal
          isOpen={true}
          title={
            selectedTx.category === 'sales'
              ? `Sales Invoice #${selectedTx.reference_code}`
              : `Official Collection Receipt #${selectedTx.reference_code}`
          }
          onClose={() => setSelectedTx(null)}
          size="lg"
        >
          <div className="space-y-4 text-xs">
            {/* Header info */}
            <div className="bg-muted/20 border border-border rounded-2xl p-4">
              <div className="flex justify-between items-start mb-3 border-b border-border pb-2">
                <div>
                  <div className="text-xs font-mono font-bold text-primary">ZLICS FURNITURE & APPLIANCES</div>
                  <div className="text-[10px] text-muted-foreground">Project PACE • Digital Transaction Audit</div>
                </div>
                <div className="text-right">
                  <ProviderBadge provider={selectedTx.provider} channel={selectedTx.channel} />
                  <div className="text-[11px] font-mono text-muted-foreground mt-1">{selectedTx.date}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase font-bold">Customer:</span>
                  <span className="font-bold text-foreground text-sm">{selectedTx.customer_name}</span>
                  {selectedTx.customer_code !== '—' && (
                    <span className="text-muted-foreground block font-mono text-[10px]">{selectedTx.customer_code}</span>
                  )}
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase font-bold">Channel / Provider:</span>
                  <span className="font-semibold text-foreground">{selectedTx.provider || selectedTx.payment_method}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase font-bold">Handled / Verified By:</span>
                  <span className="font-semibold text-foreground">{selectedTx.processed_by}</span>
                </div>
              </div>

              {/* Digital Reference Box */}
              {selectedTx.reference_no && (
                <div className="mt-3 pt-3 border-t border-border flex items-center justify-between bg-card p-3 rounded-xl border border-border">
                  <div className="flex items-center gap-2.5">
                    {selectedTx.channel === 'ewallet' ? (
                      <FiSmartphone className="w-5 h-5 text-blue-500" />
                    ) : (
                      <FiCreditCard className="w-5 h-5 text-indigo-500" />
                    )}
                    <div>
                      <span className="text-[10px] text-muted-foreground uppercase font-bold block">
                        {selectedTx.channel === 'ewallet' ? 'E-Wallet Reference Number' : 'Bank Confirmation / Trace No.'}
                      </span>
                      <span className="font-mono font-bold text-sm text-foreground">{selectedTx.reference_no}</span>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 text-xs bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-semibold px-2.5 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                    <FiCheckCircle className="w-3 h-3" />
                    <span>Verified</span>
                  </span>
                </div>
              )}
            </div>

            {/* Total summary */}
            <div className="bg-muted/20 border border-border rounded-2xl p-4 flex justify-between items-center">
              <div>
                <span className="text-xs text-muted-foreground block">Total Amount Settled:</span>
                <span className="text-xl font-bold font-mono text-primary">{fmt(selectedTx.amount)}</span>
              </div>
              <div className="text-right">
                <span className="text-xs text-muted-foreground block">Payment Status:</span>
                <StatusBadge status={selectedTx.status} />
              </div>
            </div>

            {selectedTx.notes && (
              <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-xl text-xs text-amber-900 dark:text-amber-200">
                <span className="font-semibold">Transaction Remarks: </span>
                {selectedTx.notes}
              </div>
            )}

            {/* Modal actions */}
            <div className="flex justify-between items-center pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-border hover:bg-muted font-semibold cursor-pointer"
              >
                <FiPrinter className="w-4 h-4" />
                <span>Print Record</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedTx(null)}
                className="flex items-center gap-1 px-4 py-1.5 rounded-xl border border-border hover:bg-muted font-semibold cursor-pointer"
              >
                <FiX className="w-3.5 h-3.5" />
                <span>Close</span>
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
