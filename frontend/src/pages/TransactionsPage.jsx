import { useState, useEffect, useMemo, useRef } from 'react'
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
import { fmt, fmtDate, filterBySearch, fastDeepEqual } from '../lib/utils'
import { formatQty, extractDigitalRefAndNotes, printOfficialInvoice } from '../lib/invoicePrint'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import { useRealtimeSync, SyncButton } from '../lib/realtimeSync'
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
  const [settings, setSettings] = useState(null)
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

  const inFlightRef = useRef(false)
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const loadData = async (silent = false, signal) => {
    if (inFlightRef.current) return
    inFlightRef.current = true

    const isBg = silent || transactions.length > 0
    if (!isBg) setLoading(true)
    if (!isBg) setError('')
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
      }, signal ? { signal } : {})

      if (!isMountedRef.current || !res) return

      const newTx = res.transactions || []
      const newSummary = res.summary || null
      setTransactions(prev => (fastDeepEqual(prev, newTx) ? prev : newTx))
      setSummary(prev => (fastDeepEqual(prev, newSummary) ? prev : newSummary))

      if (!settings && api.system?.getSettings) {
        api.system.getSettings().then(s => {
          if (isMountedRef.current) setSettings(s)
        }).catch(() => { })
      }
    } catch (err) {
      if (!isMountedRef.current) return
      console.error('Failed to load transaction history:', err)
      if (!isBg) setError(err.message || 'Failed to fetch transaction history')
    } finally {
      inFlightRef.current = false
      if (!isBg && isMountedRef.current) setLoading(false)
    }
  }

  const [searchParams] = useSearchParams()

  useEffect(() => {
    loadData()
  }, [activeChannelTab, typeFilter, providerFilter, dateRange, dateFrom, dateTo])

  // On-demand click-driven synchronization
  const { sync: syncTransactions, isSyncing: isSyncingTransactions } = useRealtimeSync(
    (_, signal) => loadData(false, signal),
    [],
    { module: 'transactions' }
  )

  const handleOpenProof = (tx) => {
    if (!tx) return
    setSelectedTx(tx)

    if (tx.category === 'sales' && (tx.raw_id || tx.sale_id) && api.sales?.getById) {
      const targetId = tx.id
      const saleId = tx.raw_id || tx.sale_id
      api.sales.getById(saleId)
        .then((detail) => {
          if (!isMountedRef.current || !detail?.sale) return
          const fullSale = detail.sale
          setSelectedTx((curr) => {
            if (!curr || curr.id !== targetId) return curr
            const { refNo } = extractDigitalRefAndNotes(
              fullSale.notes ?? curr.notes,
              curr.reference_no,
              curr.channel,
              'sales'
            )
            return {
              ...curr,
              ...fullSale,
              id: curr.id,
              raw_id: curr.raw_id ?? fullSale.sale_id,
              category: 'sales',
              channel: curr.channel,
              provider: curr.provider,
              reference_code: fullSale.invoice_no || curr.reference_code,
              reference_no: refNo,
              date: fullSale.sale_date || curr.date,
              amount: Number(fullSale.total_amount ?? curr.amount ?? 0),
              items: Array.isArray(detail.items) ? detail.items : (curr.items || []),
              installment_account: detail.installment_account || curr.installment_account || null,
            }
          })
        })
        .catch(() => {})
    }
  }

  useEffect(() => {
    const id = searchParams.get('id')
    if (id) {
      const found = transactions.find(t => String(t.sale_id) === String(id))
      if (found) {
        handleOpenProof(found)
      } else {
        api.transactions.getAll({ search: id })
          .then(res => {
            if (res.transactions?.length > 0) {
              handleOpenProof(res.transactions[0])
            }
          })
          .catch(err => console.warn('Could not auto-open transaction:', err))
      }
    }
  }, [searchParams, transactions.length])

  // Export to CSV Function - Connected to Backend API
  const handleExportCSV = async () => {
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

      // 1. Fetch official CSV directly from backend MySQL stream
      const blob = await api.transactions.exportCsv({
        search: search || undefined,
        channel: activeChannelTab !== 'All' ? activeChannelTab : undefined,
        type: typeFilter !== 'All' ? typeFilter : undefined,
        payment_method: providerFilter !== 'All' ? providerFilter : undefined,
        date_from: from,
        date_to: to,
      })

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

      const count = filtered.length
      showToast(
        count > 0
          ? `Exported ${count} transaction${count === 1 ? '' : 's'} from database successfully`
          : 'Exported transactions CSV format successfully (0 records recorded)',
        'success'
      )
    } catch (err) {
      console.warn('Backend export fallback to client generation:', err)
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

      const rows = (filtered || []).map(tx => [
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
        (tx.amount || 0).toFixed(2),
        (tx.amount_paid || 0).toFixed(2),
        (tx.balance_due || 0).toFixed(2),
        escapeCSV(tx.status),
        escapeCSV(tx.processed_by),
        escapeCSV(tx.notes || ''),
      ].join(','))

      const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n')
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

      showToast(`Exported transactions CSV successfully`, 'success')
    }
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
    <>
      <div className="space-y-6 print:hidden">
        <PageHeader
          title="Transaction History"
          subtitle="Comprehensive audit trail of E-Wallet, Online Banking, Cash, and Installment transactions"
          action={
            <div className="flex items-center gap-2">
              <SyncButton sync={syncTransactions} isSyncing={isSyncingTransactions} label="Sync" />
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

        <MySalesChart title="Transaction History & Sales" />

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
            { id: 'installment', label: 'Installment', icon: <FiFileText className="w-3.5 h-3.5" />, count: summary?.installment_count },
          ].map(tab => {
            const isActive = activeChannelTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveChannelTab(tab.id)
                  setPage(1)
                }}
                className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold cursor-pointer border-b-2 transition-all whitespace-nowrap ${isActive
                  ? 'border-primary text-primary bg-primary/5 rounded-t-xl'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40'
                  }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                    }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Filters & Search Card */}
        <Card noPad className="p-4 border border-border">
          <div className="flex flex-wrap items-end gap-3">
            {/* Search */}
            <div className="w-full sm:flex-1 sm:min-w-[220px]">
              <label className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block mb-1.5">
                Search
              </label>
              <div className="relative">
                <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(1); }}
                  placeholder="Search reference, trace #, customer..."
                  title="Search reference, GCash ref, bank trace, customer"
                  aria-label="Search transaction history"
                  className="w-full h-9 pl-9 pr-8 rounded-xl border border-border bg-card text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-muted-foreground/70"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                    title="Clear search"
                    aria-label="Clear search"
                  >
                    <FiX className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Type Filter */}
            <div className="w-full sm:w-auto sm:min-w-[160px]">
              <label className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block mb-1.5">
                Record Type
              </label>
              <select
                value={typeFilter}
                onChange={e => { setTypeFilter(e.target.value); setPage(1) }}
                className="w-full h-9 border border-border rounded-xl px-2.5 text-xs font-semibold text-foreground bg-card cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/20"
                aria-label="Filter by record type"
              >
                <option value="All">All Record Types</option>
                <option value="Sale">Sale Invoices Only</option>
                <option value="Payment">Installment Collections Only</option>
              </select>
            </div>

            {/* Provider Filter */}
            <div className="w-full sm:w-auto sm:min-w-[170px]">
              <label className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block mb-1.5">
                Provider / Method
              </label>
              <select
                value={providerFilter}
                onChange={e => { setProviderFilter(e.target.value); setPage(1) }}
                className="w-full h-9 border border-border rounded-xl px-2.5 text-xs font-semibold text-foreground bg-card cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/20"
                aria-label="Filter by payment method or provider"
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
            </div>

            {/* Quick Preset Filter */}
            <div className="w-full sm:w-auto sm:min-w-[125px]">
              <label className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block mb-1.5">
                Date Preset
              </label>
              <select
                value={dateRange}
                onChange={e => {
                  const val = e.target.value
                  setDateRange(val)
                  const now = new Date()
                  if (val === 'All') {
                    setDateFrom('')
                    setDateTo('')
                  } else if (val === 'Today') {
                    const today = now.toISOString().slice(0, 10)
                    setDateFrom(today)
                    setDateTo(today)
                  } else if (val === 'ThisMonth') {
                    const first = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
                    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)
                    setDateFrom(first)
                    setDateTo(last)
                  }
                  setPage(1)
                }}
                className="w-full h-9 border border-border rounded-xl px-2.5 text-xs font-semibold text-foreground bg-card cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/20"
                aria-label="Filter by date range"
              >
                <option value="All">All Dates</option>
                <option value="Today">Today</option>
                <option value="ThisMonth">This Month</option>
                <option value="Custom">Custom Range</option>
              </select>
            </div>

            {/* From Date */}
            <div className="w-full sm:w-auto sm:min-w-[140px]">
              <label className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block mb-1.5">
                From Date
              </label>
              <input
                type="date"
                value={dateFrom || ''}
                max={dateTo || undefined}
                onChange={e => {
                  setDateRange('Custom')
                  setDateFrom(e.target.value)
                  setPage(1)
                }}
                className="w-full h-9 border border-border rounded-xl px-2.5 text-xs bg-card text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
                title="From Date"
                aria-label="From Date"
              />
            </div>

            {/* To Date */}
            <div className="w-full sm:w-auto sm:min-w-[140px]">
              <label className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block mb-1.5">
                To Date
              </label>
              <input
                type="date"
                value={dateTo || ''}
                min={dateFrom || undefined}
                onChange={e => {
                  setDateRange('Custom')
                  setDateTo(e.target.value)
                  setPage(1)
                }}
                className="w-full h-9 border border-border rounded-xl px-2.5 text-xs bg-card text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
                title="To Date"
                aria-label="To Date"
              />
            </div>

            {/* Reset */}
            <button
              type="button"
              onClick={() => {
                setSearch('')
                setTypeFilter('All')
                setProviderFilter('All')
                setDateRange('All')
                setDateFrom('')
                setDateTo('')
                setPage(1)
              }}
              className="h-9 px-3.5 border border-border rounded-xl bg-card hover:bg-muted font-semibold text-xs text-muted-foreground hover:text-foreground cursor-pointer transition-colors shrink-0"
            >
              Reset
            </button>
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
                <table className="w-full text-xs min-w-[850px]">
                  <thead>
                    <tr className="border-b border-border bg-muted/50 text-muted-foreground uppercase font-semibold text-[11px] whitespace-nowrap">
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
                      const { refNo: rowRef } = extractDigitalRefAndNotes(tx.notes, tx.reference_no, tx.channel, tx.category)
                      return (
                        <tr key={tx.id || i} className={`hover:bg-muted/40 transition-colors ${i % 2 === 1 ? 'bg-muted/10' : ''}`}>
                          <td className="py-3 px-4 font-mono font-semibold text-primary whitespace-nowrap">
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
                          <td className="py-3 px-4 whitespace-nowrap">
                            <ProviderBadge provider={tx.provider} channel={tx.channel} />
                          </td>
                          <td className="py-3 px-4 font-mono whitespace-nowrap">
                            {rowRef ? (
                              <span className="font-semibold text-foreground bg-muted px-2 py-0.5 rounded-md border border-border">
                                {rowRef}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="py-3 px-4 font-mono text-muted-foreground whitespace-nowrap">{tx.date}</td>
                          <td className="py-3 px-4">
                            <div className="font-medium text-foreground whitespace-nowrap">{tx.customer_name}</div>
                            {tx.customer_code !== '—' && (
                              <div className="text-[10px] text-muted-foreground font-mono whitespace-nowrap">{tx.customer_code}</div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-foreground whitespace-nowrap">
                            {fmt(tx.amount)}
                            {isSale && tx.payment_method === 'Installment' && tx.amount_paid > 0 && (
                              <div className="text-[10px] text-emerald-600 font-normal">
                                DP: {fmt(tx.amount_paid)}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center whitespace-nowrap">
                            <StatusBadge status={tx.status} />
                          </td>
                          <td className="py-3 px-4 text-muted-foreground whitespace-nowrap">{tx.processed_by}</td>
                          <td className="py-3 px-4 text-center whitespace-nowrap">
                            <button
                              onClick={() => handleOpenProof(tx)}
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
      </div>

      {/* Printable Report View (Visible only during print on the main page) */}
      {!selectedTx && (
        <div className="hidden print:block bg-white text-black min-h-screen w-full font-sans print:m-0 print:p-0">

          {/* TOP HEADER SECTION */}
          <div className="mb-4">
            <h1 className="text-xl font-bold tracking-widest uppercase text-gray-700 mb-4">TRANSACTION HISTORY REPORT</h1>

            <div className="flex justify-between items-start">
              {/* Company Info Left */}
              <div className="text-xs space-y-1">
                <p className="font-bold text-sm text-gray-800 uppercase">{settings?.company_name || 'Z-LICZ COMPANY'}</p>
                <p className="text-gray-600 uppercase">{user?.employee?.branch?.name || user?.customer?.branch_name || 'Headquarters'}</p>
                <p className="text-gray-600">Z-LICZ • System Generated Report</p>
              </div>

              {/* Meta Info Right */}
              <table className="text-[10px] border-collapse border border-gray-300">
                <tbody>
                  <tr>
                    <td className="p-1.5 px-3 border border-gray-300 text-gray-500 text-right uppercase tracking-wider">Date Prepared</td>
                    <td className="p-1.5 px-3 border border-gray-300 font-bold text-center bg-gray-50 print-exact w-24">{new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })}</td>
                  </tr>
                  <tr>
                    <td className="p-1.5 px-3 border border-gray-300 text-gray-500 text-right uppercase tracking-wider">Start Date</td>
                    <td className="p-1.5 px-3 border border-gray-300 font-bold text-center bg-gray-50 print-exact w-24">{dateFrom ? new Date(dateFrom).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }) : 'All Time'}</td>
                  </tr>
                  <tr>
                    <td className="p-1.5 px-3 border border-gray-300 text-gray-500 text-right uppercase tracking-wider">End Date</td>
                    <td className="p-1.5 px-3 border border-gray-300 font-bold text-center bg-gray-50 print-exact w-24">{dateTo ? new Date(dateTo).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }) : 'Present'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* MAIN TABLE */}
          <table className="w-full text-[10px] text-left border-collapse">
            <thead>
              <tr className="border-y-2 border-black">
                <th className="py-2 px-2 uppercase tracking-wider text-gray-700">Reference / Date</th>
                <th className="py-2 px-2 uppercase tracking-wider text-gray-700">Customer Name</th>
                <th className="py-2 px-2 uppercase tracking-wider text-gray-700">Provider / Method</th>
                <th className="py-2 px-2 uppercase tracking-wider text-gray-700">Status</th>
                <th className="py-2 px-2 text-right uppercase tracking-wider text-gray-700">Amount Paid</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const groups = {
                  'sales': { title: 'REVENUE & SALES INVOICES', items: [] },
                  'ewallet': { title: 'E-WALLET COLLECTIONS', items: [] },
                  'online_bank': { title: 'ONLINE BANK TRANSACTIONS', items: [] },
                  'installment': { title: 'INSTALLMENT COLLECTIONS', items: [] },
                  'cash': { title: 'CASH PAYMENTS', items: [] }
                };

                // Group the items
                filtered.forEach(tx => {
                  if (tx.category === 'sales' || tx.type === 'Sale') {
                    groups['sales'].items.push(tx);
                    return;
                  }
                  const ch = tx.channel || 'cash';
                  if (groups[ch]) groups[ch].items.push(tx);
                  else groups['cash'].items.push(tx);
                });

                let allElements = [];
                let grandTotal = 0;

                Object.keys(groups).forEach(key => {
                  const group = groups[key];
                  if (group.items.length === 0) return;

                  let groupTotal = 0;

                  // Gray Header for the Group (like the REVENUE bar)
                  allElements.push(
                    <tr key={`group-${key}`} className="bg-slate-200 border-y border-slate-300 print:bg-slate-200 print-exact">
                      <td colSpan="5" className="py-1.5 px-2 font-black text-slate-800 uppercase tracking-widest">{group.title}</td>
                    </tr>
                  );

                  // Items
                  group.items.forEach(tx => {
                    groupTotal += tx.amount;
                    grandTotal += tx.amount;

                    allElements.push(
                      <tr key={tx.id || tx.reference_code} className="border-b border-gray-100 last:border-b-0">
                        <td className="py-1.5 px-2">
                          <span className="font-mono">{tx.reference_code}</span>
                          <span className="text-gray-500 ml-2">{tx.date}</span>
                        </td>
                        <td className="py-1.5 px-2 font-semibold text-gray-800">{tx.customer_name}</td>
                        <td className="py-1.5 px-2 text-gray-700">{tx.provider || tx.payment_method}</td>
                        <td className="py-1.5 px-2 text-gray-700">{tx.status}</td>
                        <td className="py-1.5 px-2 text-right">
                          <span className="text-gray-500 mr-2">₱</span>
                          <span className="font-mono">{tx.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </td>
                      </tr>
                    );
                  });

                  // Group Subtotal (like TOTAL SELLING EXPENSES)
                  allElements.push(
                    <tr key={`subtotal-${key}`} className="border-t border-b-2 border-slate-300 bg-slate-50 print:bg-slate-50 print-exact">
                      <td colSpan="4" className="py-2 px-2 text-right font-bold uppercase text-slate-700 tracking-widest text-[9px]">TOTAL {group.title}</td>
                      <td className="py-2 px-2 text-right font-bold">
                        <span className="text-gray-500 mr-2">₱</span>
                        <span className="font-mono">{groupTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </td>
                    </tr>
                  );

                  // Spacer
                  allElements.push(
                    <tr key={`spacer-${key}`}>
                      <td colSpan="5" className="h-6"></td>
                    </tr>
                  );
                });

                if (allElements.length === 0) {
                  return (
                    <tr>
                      <td colSpan="5" className="py-6 text-center italic text-gray-500">No transactions match the selected filters.</td>
                    </tr>
                  );
                }

                // Grand Total Row (like NET INCOME)
                allElements.push(
                  <tr key="grand-total" className="bg-slate-200 border-y-2 border-black print:bg-slate-200 print-exact">
                    <td colSpan="4" className="py-3 px-2 text-right font-black uppercase text-slate-900 tracking-widest text-[11px]">NET TOTAL TRANSACTION VOLUME</td>
                    <td className="py-3 px-2 text-right font-black text-slate-900 text-xs">
                      <span className="text-gray-600 mr-2">₱</span>
                      <span className="font-mono">{grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </td>
                  </tr>
                );

                return allElements;
              })()}
            </tbody>
          </table>
        </div>
      )}

      {/* Transaction Details & Official Sales Invoice / Collection Receipt Modal */}
      {selectedTx && (() => {
        const isSaleTx = selectedTx.category === 'sales'
        const txItems = Array.isArray(selectedTx.items) ? selectedTx.items : []
        const txInst = selectedTx.installment_account || null
        const txSchedules = txInst?.payment_schedules || txInst?.paymentSchedules || []
        const txPaySchedule = selectedTx.payment_schedule || null
        const txTotalUnits = txItems.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0)
        const { refNo: txRefNo, cleanNotes: txCleanNotes } = extractDigitalRefAndNotes(
          selectedTx.notes,
          selectedTx.reference_no,
          selectedTx.channel,
          selectedTx.category
        )
        const companyLabel = selectedTx.company_name || settings?.company_name || 'Z-LICZ APPLIANCES'
        const branchLabel = selectedTx.branch_name || user?.employee?.branch?.name || user?.customer?.branch_name || 'Main Branch'
        const branchLoc = selectedTx.branch_location || ''
        const branchTel = selectedTx.branch_contact || ''
        const compEmail = selectedTx.company_email || ''
        const compTin = selectedTx.company_tax_id || ''

        const subtotalVal = Number(selectedTx.subtotal ?? selectedTx.total_amount ?? selectedTx.amount ?? 0)
        const discountVal = Number(selectedTx.discount_amount ?? 0)
        const totalVal = Number(selectedTx.total_amount ?? selectedTx.amount ?? 0)
        const paidVal = Number(selectedTx.amount_paid ?? selectedTx.amount ?? 0)
        const balanceVal = Number(selectedTx.balance_due ?? 0)
        const channelText = selectedTx.provider && selectedTx.payment_method && selectedTx.provider !== selectedTx.payment_method
          ? `${selectedTx.payment_method} (${selectedTx.provider})`
          : (selectedTx.provider || selectedTx.payment_method || 'Cash')

        return (
          <Modal
            isOpen={true}
            title={
              isSaleTx
                ? `Sales Invoice #${selectedTx.reference_code}`
                : `Official Collection Receipt #${selectedTx.reference_code}`
            }
            onClose={() => setSelectedTx(null)}
            size="xl"
          >
            <div className="space-y-4 text-xs">
              {/* Company, Branch & Invoice Header */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-3 border-b border-border">
                <div>
                  <h2 className="text-lg font-black tracking-tight text-foreground">
                    {companyLabel}
                  </h2>
                  <p className="text-[11px] font-semibold text-primary">
                    {isSaleTx ? 'Official Sales Transaction Invoice' : 'Official Installment Collection Receipt'}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {branchLabel}
                    {branchLoc ? ` • ${branchLoc}` : ''}
                  </p>
                  {(branchTel || compEmail || compTin) && (
                    <p className="text-[11px] text-muted-foreground font-mono">
                      {[
                        branchTel ? `Tel: ${branchTel}` : '',
                        compEmail,
                        compTin ? `TIN: ${compTin}` : '',
                      ].filter(Boolean).join(' • ')}
                    </p>
                  )}
                </div>

                <div className="sm:text-right space-y-1">
                  <div className="font-mono font-black text-base text-foreground">{selectedTx.reference_code}</div>
                  <div className="font-mono text-[11px] text-muted-foreground">
                    {selectedTx.sale_datetime || selectedTx.date}
                  </div>
                  <div className="flex sm:justify-end items-center flex-wrap gap-1.5 pt-0.5">
                    <StatusBadge status={selectedTx.status || 'Completed'} />
                    <ProviderBadge provider={selectedTx.provider} channel={selectedTx.channel} />
                  </div>
                </div>
              </div>

              {/* Billing & Transaction Metadata Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 bg-muted/20 rounded-2xl border border-border space-y-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block">
                    Billed To (Customer)
                  </span>
                  <p className="font-bold text-foreground text-sm">{selectedTx.customer_name}</p>
                  <div className="text-[11px] text-muted-foreground space-y-0.5">
                    {selectedTx.customer_code && selectedTx.customer_code !== '—' && (
                      <div>
                        Code: <strong className="font-mono text-foreground">{selectedTx.customer_code}</strong>
                      </div>
                    )}
                    {selectedTx.customer_phone && (
                      <div>
                        Phone: <strong className="font-mono text-foreground">{selectedTx.customer_phone}</strong>
                      </div>
                    )}
                    {selectedTx.customer_email && <div>Email: {selectedTx.customer_email}</div>}
                    {selectedTx.customer_address && <div>Address: {selectedTx.customer_address}</div>}
                  </div>
                </div>

                <div className="p-3.5 bg-muted/20 rounded-2xl border border-border space-y-1.5">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block">
                    Transaction Metadata
                  </span>
                  <div className="flex justify-between text-[11px] gap-2">
                    <span className="text-muted-foreground">Payment Channel:</span>
                    <span className="font-semibold text-foreground text-right">{channelText}</span>
                  </div>
                  {txRefNo && (
                    <div className="flex justify-between text-[11px] gap-2">
                      <span className="text-muted-foreground">Digital Ref / Trace #:</span>
                      <span className="font-mono font-semibold text-foreground text-right">{txRefNo}</span>
                    </div>
                  )}
                  {!isSaleTx && selectedTx.account_no && selectedTx.account_no !== 'N/A' && (
                    <div className="flex justify-between text-[11px] gap-2">
                      <span className="text-muted-foreground">Installment Account:</span>
                      <span className="font-mono font-semibold text-foreground">{selectedTx.account_no}</span>
                    </div>
                  )}
                  {!isSaleTx && selectedTx.invoice_no && (
                    <div className="flex justify-between text-[11px] gap-2">
                      <span className="text-muted-foreground">Linked Invoice:</span>
                      <span className="font-mono font-semibold text-foreground">{selectedTx.invoice_no}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-[11px] gap-2">
                    <span className="text-muted-foreground">Store Branch:</span>
                    <span className="font-semibold text-foreground text-right">{branchLabel}</span>
                  </div>
                  <div className="flex justify-between text-[11px] gap-2">
                    <span className="text-muted-foreground">Handled / Verified By:</span>
                    <span className="font-semibold text-foreground text-right">{selectedTx.processed_by}</span>
                  </div>
                  {txItems.length > 0 && (
                    <div className="flex justify-between text-[11px] gap-2">
                      <span className="text-muted-foreground">Items Summary:</span>
                      <span className="font-mono font-semibold text-foreground">
                        {txItems.length} item(s) · {formatQty(txTotalUnits)} unit(s)
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between text-[11px] gap-2">
                    <span className="text-muted-foreground">Currency:</span>
                    <span className="font-mono font-semibold text-foreground">PHP (₱)</span>
                  </div>
                </div>
              </div>

              {/* Verified Digital Reference Highlight Box */}
              {txRefNo && (
                <div className="flex items-center justify-between bg-card p-3 rounded-2xl border border-border">
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
                      <span className="font-mono font-bold text-sm text-foreground">{txRefNo}</span>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 text-xs bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-semibold px-2.5 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                    <FiCheckCircle className="w-3 h-3" />
                    <span>{selectedTx.status === 'Pending Verification' ? 'Pending Verification' : 'Verified'}</span>
                  </span>
                </div>
              )}

              {/* Detailed Line Items Table */}
              {(isSaleTx || txItems.length > 0) && (
                <div className="border border-border rounded-2xl overflow-hidden">
                  {!isSaleTx && (
                    <div className="px-3 py-2 bg-muted/30 border-b border-border text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Financed Invoice Items {selectedTx.invoice_no ? `(${selectedTx.invoice_no})` : ''}
                    </div>
                  )}
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border bg-muted/50 text-muted-foreground uppercase text-[10px]">
                          <th className="py-2.5 px-3 text-center w-10">#</th>
                          <th className="py-2.5 px-3 text-left">Item Description / SKU</th>
                          <th className="py-2.5 px-3 text-right">Unit Price</th>
                          <th className="py-2.5 px-3 text-center">Qty</th>
                          <th className="py-2.5 px-3 text-right">Discount</th>
                          <th className="py-2.5 px-3 text-right">Line Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {txItems.length > 0 ? (
                          txItems.map((it, idx) => {
                            const lineDisc = Number(it.discount_amount ?? it.discount ?? 0)
                            const lineTot = Number(it.line_total ?? it.total_price ?? 0)
                            return (
                              <tr key={it.sale_item_id || idx}>
                                <td className="py-2.5 px-3 text-center font-mono text-muted-foreground">{idx + 1}</td>
                                <td className="py-2.5 px-3">
                                  <p className="font-semibold text-foreground leading-tight">{it.product_name}</p>
                                  {(it.product_code || it.brand || it.category) && (
                                    <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                                      {[it.product_code, it.brand, it.category].filter(Boolean).join(' • ')}
                                    </p>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono text-muted-foreground">{fmt(it.unit_price)}</td>
                                <td className="py-2.5 px-3 text-center font-mono font-bold text-foreground">{formatQty(it.quantity)}</td>
                                <td className="py-2.5 px-3 text-right font-mono">
                                  {lineDisc > 0 ? (
                                    <span className="text-rose-500">-{fmt(lineDisc)}</span>
                                  ) : (
                                    <span className="text-muted-foreground">₱0.00</span>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono font-bold text-foreground">{fmt(lineTot)}</td>
                              </tr>
                            )
                          })
                        ) : (
                          <tr>
                            <td colSpan="6" className="py-4 text-center text-muted-foreground">No line items recorded</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Installment Contract & Amortization Schedule */}
              {txInst && (
                <div className="p-3.5 bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-2xl space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold uppercase tracking-wider text-[11px] text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
                      <FiCreditCard className="w-3.5 h-3.5" />
                      <span>Installment Contract ({txInst.account_no || 'Active'})</span>
                    </span>
                    <StatusBadge status={txInst.status || 'Active'} />
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                    <div className="p-2 rounded-xl bg-card border border-border">
                      <span className="text-[10px] text-muted-foreground block">Principal</span>
                      <strong className="font-mono text-foreground">{fmt(txInst.principal_amount)}</strong>
                    </div>
                    <div className="p-2 rounded-xl bg-card border border-border">
                      <span className="text-[10px] text-muted-foreground block">Interest ({Number(txInst.interest_rate || 0)}%)</span>
                      <strong className="font-mono text-amber-600 dark:text-amber-400">+{fmt(txInst.interest_amount)}</strong>
                    </div>
                    <div className="p-2 rounded-xl bg-card border border-border">
                      <span className="text-[10px] text-muted-foreground block">Total Financed</span>
                      <strong className="font-mono text-foreground">{fmt(txInst.total_payable)}</strong>
                    </div>
                    <div className="p-2 rounded-xl bg-primary/5 border border-primary/30">
                      <span className="text-[10px] text-muted-foreground block">{txInst.frequency || 'Monthly'} Due</span>
                      <strong className="font-mono text-primary">
                        {fmt(txInst.installment_amount)} &times; {txInst.number_of_installments}
                      </strong>
                    </div>
                  </div>

                  {txPaySchedule && (
                    <div className="p-2.5 rounded-xl bg-card border border-amber-500/20 flex flex-wrap justify-between gap-2 text-[11px]">
                      <span>
                        Applied Schedule: <strong className="font-mono text-foreground">Installment #{txPaySchedule.installment_no}</strong>
                      </span>
                      <span>
                        Due Date: <strong className="font-mono text-foreground">{txPaySchedule.due_date}</strong>
                      </span>
                      <span>
                        Schedule Balance: <strong className="font-mono text-foreground">{fmt(txPaySchedule.balance_due)}</strong>
                      </span>
                    </div>
                  )}

                  {txSchedules.length > 0 && (
                    <div className="border border-amber-500/20 rounded-xl overflow-hidden bg-card">
                      <div className="max-h-36 overflow-y-auto">
                        <table className="w-full text-[11px]">
                          <thead className="bg-muted/50 text-muted-foreground uppercase text-[10px] sticky top-0">
                            <tr>
                              <th className="py-1.5 px-2.5 text-center">#</th>
                              <th className="py-1.5 px-2.5 text-left">Due Date</th>
                              <th className="py-1.5 px-2.5 text-right">Amount Due</th>
                              <th className="py-1.5 px-2.5 text-right">Balance</th>
                              <th className="py-1.5 px-2.5 text-center">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {txSchedules.map(sc => (
                              <tr key={sc.schedule_id || sc.installment_no}>
                                <td className="py-1.5 px-2.5 text-center font-mono">{sc.installment_no}</td>
                                <td className="py-1.5 px-2.5 font-mono">{sc.due_date}</td>
                                <td className="py-1.5 px-2.5 text-right font-mono">{fmt(sc.amount_due)}</td>
                                <td className="py-1.5 px-2.5 text-right font-mono font-bold">{fmt(sc.balance_due)}</td>
                                <td className="py-1.5 px-2.5 text-center">
                                  <StatusBadge status={sc.status} />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Financial Summary & Notes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 bg-muted/20 border border-border rounded-2xl space-y-1.5">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block">
                    {isSaleTx ? 'Notes / Warranty Remarks' : 'Transaction Remarks'}
                  </span>
                  <p className="text-[11px] text-foreground whitespace-pre-wrap leading-relaxed">
                    {txCleanNotes || (isSaleTx
                      ? 'Standard store warranty applies. Retain this invoice for warranty claims and account reference.'
                      : 'Installment collection recorded and posted to customer ledger.')}
                  </p>
                </div>

                {isSaleTx ? (
                  <div className="space-y-1.5 p-3.5 bg-card border border-border rounded-2xl text-xs">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Subtotal ({formatQty(txTotalUnits)} unit{txTotalUnits !== 1 ? 's' : ''})</span>
                      <span className="font-mono font-semibold text-foreground">{fmt(subtotalVal)}</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Total Discount</span>
                      <span className="font-mono text-rose-600">- {fmt(discountVal)}</span>
                    </div>
                    <div className="flex justify-between items-center font-black text-sm text-foreground border-t border-border pt-1.5 mt-1.5">
                      <span>TOTAL AMOUNT</span>
                      <span className="font-mono text-base font-bold text-primary">{fmt(totalVal)}</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground pt-1">
                      <span>Amount Paid</span>
                      <span className="font-mono font-bold text-emerald-600">{fmt(paidVal)}</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Balance Due</span>
                      <span className={`font-mono font-bold ${balanceVal > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                        {fmt(balanceVal)}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1.5 p-3.5 bg-card border border-border rounded-2xl text-xs">
                    <div className="flex justify-between items-center font-black text-sm text-foreground">
                      <span>AMOUNT COLLECTED</span>
                      <span className="font-mono text-base font-bold text-primary">{fmt(paidVal)}</span>
                    </div>
                    <div className="flex justify-between items-center text-muted-foreground pt-1 border-t border-border">
                      <span>Payment Status</span>
                      <StatusBadge status={selectedTx.status || 'Completed'} />
                    </div>
                    {txInst && (
                      <>
                        <div className="flex justify-between text-muted-foreground pt-1">
                          <span>Contract Total Payable</span>
                          <span className="font-mono font-semibold text-foreground">{fmt(txInst.total_payable)}</span>
                        </div>
                        <div className="flex justify-between text-muted-foreground">
                          <span>Total Paid To Date</span>
                          <span className="font-mono font-bold text-emerald-600">{fmt(txInst.total_paid)}</span>
                        </div>
                        <div className="flex justify-between text-muted-foreground">
                          <span>Remaining Contract Balance</span>
                          <span className={`font-mono font-bold ${Number(txInst.balance) > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                            {fmt(txInst.balance)}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Modal actions */}
              <div className="flex justify-between items-center gap-3 pt-4 border-t border-border">
                <button
                  type="button"
                  onClick={() => printOfficialInvoice({
                    sale: selectedTx,
                    items: txItems,
                    installmentAccount: txInst,
                    paymentSchedule: txPaySchedule,
                    isCollection: !isSaleTx,
                    defaultBranch: branchLabel,
                    onPopupBlocked: () => showToast('Please allow pop-ups to print the document', 'error'),
                  })}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold cursor-pointer shadow-xs transition-all"
                >
                  <FiPrinter className="w-4 h-4" />
                  <span>{isSaleTx ? 'Print Invoice' : 'Print Receipt'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedTx(null)}
                  className="flex items-center gap-1 px-4 py-2 rounded-xl border border-border hover:bg-muted font-semibold cursor-pointer"
                >
                  <FiX className="w-3.5 h-3.5" />
                  <span>Close</span>
                </button>
              </div>
            </div>
          </Modal>
        )
      })()}
    </>
  )
}
