import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart, Bar, ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts'
import {
  FiCreditCard, FiPackage, FiAlertTriangle,
  FiTrendingUp, FiTrendingDown, FiShoppingCart, FiUsers,
  FiLayers, FiActivity, FiClock, FiEye, FiPlus, FiCheckCircle,
  FiX, FiCamera, FiBarChart2, FiFileText, FiSmartphone, FiInfo, FiShield, FiPrinter, FiBell,
  FiUpload, FiSend, FiCalendar, FiZap
} from 'react-icons/fi'
import { useAuth } from '../context/AuthContext'
import {
  Btn, Badge, StatusBadge, Input, Select, Modal,
  Table, TR, TD, PageHeader, StatCard, Card, CardHeader, Pagination, showToast, showLoading, closeLoading, confirmAction, LoadingState, ErrorAlert, TableSkeleton, EmptyState,
  StatSkeleton, ProgressBar, TabBar
} from '../components/ui'
import { fmt, fmtDate, fastDeepEqual } from '../lib/utils'
import { api } from '../lib/api'
import { useRealtimeSync, triggerDataSync } from '../lib/realtimeSync'
import { TbCurrencyPeso } from 'react-icons/tb'

import BranchCarousel from '../components/branches/BranchCarousel'
import BranchDetailsView from '../components/branches/BranchDetailsView'
import CreateBranchModal from '../components/branches/CreateBranchModal'
import EmployeePayslipModal from '../components/payslip/EmployeePayslipModal'

const PIE_COLORS = ['#3b82f6', '#1d4ed8', '#0284c7', '#6366f1', '#38bdf8']

function PaymentMethodBadge({ method, provider }) {
  const m = (provider || method || '').toLowerCase()
  if (m.includes('gcash')) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800">
        <FiSmartphone className="w-3 h-3 text-blue-500" />
        <span>GCash</span>
      </span>
    )
  }
  if (m.includes('maya')) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-sky-50 text-sky-700 border border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800">
        <FiSmartphone className="w-3 h-3 text-sky-500" />
        <span>Maya</span>
      </span>
    )
  }
  if (m.includes('bdo') || m.includes('bpi') || m.includes('unionbank') || m.includes('bank') || m.includes('online')) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800">
        <FiCreditCard className="w-3 h-3 text-indigo-500" />
        <span>{provider || method}</span>
      </span>
    )
  }
  if (m.includes('installment')) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800">
        <FiFileText className="w-3 h-3 text-amber-500" />
        <span>Installment</span>
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-muted text-muted-foreground border border-border">
      <TbCurrencyPeso className="w-3 h-3 text-blue-500" />
      <span>{provider || method || 'Cash'}</span>
    </span>
  )
}

// ─── Admin Business Monitoring Dashboard ──────────────────────────────────────
function AdminBusinessDashboard() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'Administrator'
  const isStoreAdmin = user?.role === 'Store Administrator' || user?.role === 'Store Admin'
  const navigate = useNavigate()
  const [stats, setStats] = useState(() => {
    try {
      const saved = sessionStorage.getItem('pace_cached_dash_stats')
      return saved ? JSON.parse(saved) : null
    } catch { return null }
  })
  const [charts, setCharts] = useState(() => {
    try {
      const saved = sessionStorage.getItem('pace_cached_dash_charts')
      return saved ? JSON.parse(saved) : null
    } catch { return null }
  })
  const [recent, setRecent] = useState(() => {
    try {
      const saved = sessionStorage.getItem('pace_cached_dash_recent')
      return saved ? JSON.parse(saved) : null
    } catch { return null }
  })
  const [alerts, setAlerts] = useState([])
  const [branchComp, setBranchComp] = useState(() => {
    try {
      const saved = sessionStorage.getItem('pace_cached_dash_branches')
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })
  const [loading, setLoading] = useState(() => {
    return !sessionStorage.getItem('pace_cached_dash_stats')
  })
  const [error, setError] = useState('')

  // Performance Timeframe Filter State
  const [timeframe, setTimeframe] = useState('this_month')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [perfData, setPerfData] = useState(null)
  const [perfLoading, setPerfLoading] = useState(false)
  const inFlightRef = useRef(false)
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  // Branch Detail Drilldown Modal
  const [selectedBranchDetail, setSelectedBranchDetail] = useState(null)
  const [qrRequestSummary, setQrRequestSummary] = useState(null)
  const [showCreateBranchModal, setShowCreateBranchModal] = useState(false)
  const [showQrWidgetModal, setShowQrWidgetModal] = useState(false)

  const loadData = async (source) => {
    if (inFlightRef.current && source !== 'initial') return
    inFlightRef.current = true

    const isBg = source === 'timer' || source === 'database' || source === 'event' || source === 'focus' || source === 'mutation' || source === 'sync' || !!stats
    if (!isBg) {
      setLoading(true)
    }
    setError('')
    try {
      const [statsData, chartsData, recentData, alertsData, branchData] = await Promise.all([
        api.dashboard.getStats(),
        api.dashboard.getCharts(),
        api.dashboard.getRecent(),
        api.dashboard.getAlerts().catch(() => ({ alerts: [] })),
        api.dashboard.getBranchComparison().catch(() => ({ branches: [] })),
      ])
      if (!isMountedRef.current) return

      const liveBranches = branchData?.branches || []
      setStats(prev => (fastDeepEqual(prev, statsData) ? prev : statsData))
      setCharts(prev => (fastDeepEqual(prev, chartsData) ? prev : chartsData))
      setRecent(prev => (fastDeepEqual(prev, recentData) ? prev : recentData))
      setAlerts(prev => (fastDeepEqual(prev, alertsData?.alerts || []) ? prev : (alertsData?.alerts || [])))
      setBranchComp(prev => (fastDeepEqual(prev, liveBranches) ? prev : liveBranches))

      try {
        sessionStorage.setItem('pace_cached_dash_stats', JSON.stringify(statsData))
        sessionStorage.setItem('pace_cached_dash_charts', JSON.stringify(chartsData))
        sessionStorage.setItem('pace_cached_dash_recent', JSON.stringify(recentData))
        sessionStorage.setItem('pace_cached_dash_branches', JSON.stringify(liveBranches))
      } catch (e) { }

      if (isAdmin) {
        api.qrRequests.getAll({ per_page: 1 }).then(res => {
          if (res.summary && isMountedRef.current) setQrRequestSummary(res.summary)
        }).catch(() => { })
      }
    } catch (err) {
      if (!isMountedRef.current) return
      if (!isBg) {
        console.error('Failed to load admin business dashboard:', err)
        setError(err.message || 'Failed to load business dashboard metrics')
      }
    } finally {
      inFlightRef.current = false
      if (!isBg && isMountedRef.current) {
        setLoading(false)
      }
    }
  }

  const loadPerformance = async (tf = timeframe, silent = false) => {
    if (!silent && !perfData) setPerfLoading(true)
    try {
      const params = {
        timeframe: tf,
        date_from: tf === 'custom' ? customStart : undefined,
        date_to: tf === 'custom' ? customEnd : undefined,
      }
      const data = await api.dashboard.getBusinessPerformance(params)
      if (isMountedRef.current) {
        setPerfData(prev => (fastDeepEqual(prev, data) ? prev : data))
      }
    } catch (err) {
      console.error('Failed to load performance:', err)
    } finally {
      if (!silent && isMountedRef.current) {
        setPerfLoading(false)
      }
    }
  }

  useEffect(() => {
    loadData('initial')
    loadPerformance()
  }, [])

  // High-frequency real-time synchronization (smooth 1-2s refresh target, zero flicker)
  useRealtimeSync(() => {
    loadData('sync')
    loadPerformance(timeframe, true)
  }, [timeframe], { periodic: true })

  const handleTimeframeChange = (tf) => {
    setTimeframe(tf)
    if (tf !== 'custom') {
      loadPerformance(tf, false)
    }
  }

  const handleCustomDateSubmit = (e) => {
    e.preventDefault()
    if (!customStart || !customEnd) {
      showToast('Please select both start and end dates', 'error')
      return
    }
    loadPerformance('custom')
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <PageHeader title="DASHBOARD MONITORING" subtitle={`Organization-wide real-time operations`} />
        <StatSkeleton count={5} />
        <LoadingState message="Querying live sales, collections, and installment..." />
      </div>
    )
  }

  const quickActions = [
    ...(isAdmin ? [{ label: 'QR Requests', icon: <FiShield className="w-5 h-5 !text-white text-white" />, action: () => setShowQrWidgetModal(true), color: 'bg-amber-600', badge: qrRequestSummary?.pending || 0 }] : []),
    { label: 'View Sales', icon: <FiShoppingCart className="w-5 h-5 !text-white text-white" />, path: '/sales', color: 'bg-blue-600' },
    { label: 'Record Payment', icon: <TbCurrencyPeso className="w-5 h-5 !text-white text-white" />, path: '/payments', color: 'bg-blue-600' },
    { label: 'Installment', icon: <FiCreditCard className="w-5 h-5 !text-white text-white" />, path: '/installments', color: 'bg-indigo-600' },
    { label: 'Overdue Monitoring', icon: <FiAlertTriangle className="w-5 h-5 !text-white text-white" />, path: '/installments?tab=overdue', color: 'bg-rose-600' },
    { label: 'Products / Stock', icon: <FiPackage className="w-5 h-5 !text-white text-white" />, path: '/products', color: 'bg-amber-600' },
    { label: 'Business Reports', icon: <FiBarChart2 className="w-5 h-5 !text-white text-white" />, path: '/reports', color: 'bg-purple-600' },
  ]

  // The Branch Details Modal is rendered inline at the bottom.
  // We removed the early return here.

  return (
    <div className="space-y-6">
      <PageHeader
        title="DASHBOARD MONITORING"
        subtitle={`Improve and make a simple to Learn and secured · ${fmtDate(new Date())}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setShowCreateBranchModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 via-blue-600 to-indigo-700 hover:from-blue-500 hover:to-indigo-600 text-white font-semibold text-xs rounded-xl shadow-sm shadow-blue-950/40 border border-blue-400/30 transition-all cursor-pointer"
            >
              <FiPlus className="w-4 h-4 text-blue-100" />
              <span>Create Branch</span>
            </button>
          </div>
        }
      />

      {error && <ErrorAlert message={error} onRetry={loadData} />}

      {/* ─── CREATE BRANCH MODAL ─── */}
      <CreateBranchModal
        isOpen={showCreateBranchModal}
        onClose={() => setShowCreateBranchModal(false)}
        onCreate={async (formData, imageFile) => {
          showLoading('Creating branch...')
          try {
            const res = await api.branches.create(formData)

            if (imageFile && res.branch?.id) {
              const fileData = new FormData()
              fileData.append('image', imageFile)
              await api.branches.uploadImage(res.branch.id, fileData)
            }

            showToast('Branch successfully created!', 'success')
            setShowCreateBranchModal(false)
            loadData() // Refresh dashboard
          } catch (err) {
            showToast(err.message || 'Failed to create branch', 'error')
          } finally {
            closeLoading()
          }
        }}
      />



      {/* ─── ADMIN QR REQUESTS MODAL ─── */}
      {showQrWidgetModal && isAdmin && qrRequestSummary && (
        <Modal
          isOpen={true}
          onClose={() => setShowQrWidgetModal(false)}
          title="QR Attendance Requests"
          size="lg"
        >
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Employee & Store Administrator account verification and permanent QR issuance queue.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-center">
                <span className="text-[10px] uppercase font-bold text-amber-500 block mb-1">Pending</span>
                <span className="text-2xl font-mono font-black text-amber-600 dark:text-amber-400">{qrRequestSummary.pending || 0}</span>
              </div>
              <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-center">
                <span className="text-[10px] uppercase font-bold text-indigo-500 block mb-1">Under Review</span>
                <span className="text-2xl font-mono font-black text-indigo-600 dark:text-indigo-400">{qrRequestSummary.under_review || 0}</span>
              </div>
              <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-center">
                <span className="text-[10px] uppercase font-bold text-blue-500 block mb-1">Approved</span>
                <span className="text-2xl font-mono font-black text-blue-600 dark:text-blue-400">{qrRequestSummary.approved || 0}</span>
              </div>
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-center">
                <span className="text-[10px] uppercase font-bold text-rose-500 block mb-1">Rejected</span>
                <span className="text-2xl font-mono font-black text-rose-600 dark:text-rose-400">{qrRequestSummary.rejected || 0}</span>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-border">
              <button
                type="button"
                onClick={() => setShowQrWidgetModal(false)}
                className="px-4 py-2 bg-muted text-foreground font-semibold text-xs rounded-xl hover:bg-muted/80 transition-all cursor-pointer"
              >
                Close
              </button>
              <button
                onClick={() => navigate('/admin/qr-requests')}
                className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <FiShield className="w-4 h-4" />
                <span>View Full Requests List</span>
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ─── ADMIN BRANCH CAROUSEL ─── */}
      <div className="w-full">
        <BranchCarousel
          branches={branchComp}
          selectedBranch={selectedBranchDetail}
          onSelect={setSelectedBranchDetail}
        />
      </div>

      {/* ─── SECTION 1: CORE BUSINESS STATS ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        <StatCard
          title="Total Gross Sales"
          value={fmt(stats?.total_sales || 0)}
          sub="cash & installment totals"
          icon={<TbCurrencyPeso className="w-5 h-5" />}
          color="blue"
        />
        <StatCard
          title="Total Collections"
          value={fmt(stats?.total_collections || 0)}
          sub="actual payments received"
          icon={<FiCheckCircle className="w-5 h-5" />}
          color="navy"
        />
        <StatCard
          title="Installment Sales"
          value={fmt(stats?.total_installment_sales || 0)}
          sub="credit financing volume"
          icon={<FiCreditCard className="w-5 h-5" />}
          color="purple"
        />
        <StatCard
          title="Outstanding Balance"
          value={fmt(stats?.total_outstanding_balance || 0)}
          sub="receivables portfolio"
          icon={<FiTrendingDown className="w-5 h-5 text-rose-500" />}
          color="red"
        />
        <StatCard
          title="Active Accounts"
          value={stats?.active_installments?.toString() || '0'}
          sub={`${stats?.overdue_installments || 0} overdue`}
          icon={<FiActivity className="w-5 h-5" />}
          color="cyan"
        />
      </div>

      {/* ─── SECTION 2: TIMEFRAME PERFORMANCE FILTER ─── */}
      <Card noPad className="border border-border overflow-hidden">
        <div className="p-4 border-b border-border bg-blue-950/10 dark:bg-blue-950/30 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-foreground">Business Performance Breakdown</h3>
            <p className="text-xs text-muted-foreground">Filter sales, collections, and overdue recovery by timeframe</p>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {[
              { id: 'today', label: 'Today' },
              { id: 'this_week', label: 'This Week' },
              { id: 'this_month', label: 'This Month' },
              { id: 'this_year', label: 'This Year' },
              { id: 'custom', label: 'Custom Date' },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => handleTimeframeChange(t.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-all ${timeframe === t.id
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-700 text-white shadow-xs border border-blue-400/30'
                  : 'bg-card/70 border border-blue-500/20 text-muted-foreground hover:text-foreground hover:bg-blue-500/10'
                  }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {timeframe === 'custom' && (
          <form onSubmit={handleCustomDateSubmit} className="p-3 bg-muted/20 border-b border-border flex items-center gap-3 flex-wrap text-xs">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-muted-foreground">From:</span>
              <input
                type="date"
                value={customStart}
                onChange={e => setCustomStart(e.target.value)}
                className="px-2.5 py-1 rounded-xl border border-border bg-card text-foreground font-mono"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-muted-foreground">To:</span>
              <input
                type="date"
                value={customEnd}
                onChange={e => setCustomEnd(e.target.value)}
                className="px-2.5 py-1 rounded-xl border border-border bg-card text-foreground font-mono"
              />
            </div>
            <button
              type="submit"
              className="px-3 py-1 bg-gradient-to-r from-blue-600 to-indigo-700 text-white font-bold rounded-xl border border-blue-400/30 shadow-xs cursor-pointer"
            >
              Apply Custom Filter
            </button>
          </form>
        )}

        {perfLoading ? (
          <LoadingState message="Recalculating business metrics for selected timeframe..." />
        ) : (
          <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Sales Breakdown */}
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#0c1a3a]/60 border border-border dark:border-blue-500/20 space-y-2 text-xs">
              <div className="font-bold text-foreground border-b border-border pb-1.5 flex justify-between">
                <span>Sales Revenue</span>
                <span className="font-mono text-blue-600 dark:text-blue-400">{perfData?.sales?.transactions || 0} Transactions</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Gross Sales:</span>
                <span className="font-mono font-semibold text-foreground">{fmt(perfData?.sales?.gross_sales || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Discounts Given:</span>
                <span className="font-mono text-rose-600">- {fmt(perfData?.sales?.discounts || 0)}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-1 font-bold">
                <span className="text-foreground">Net Sales:</span>
                <span className="font-mono text-blue-600 dark:text-blue-400">{fmt(perfData?.sales?.net_sales || 0)}</span>
              </div>
              <div className="pt-1 text-[11px] text-muted-foreground flex justify-between">
                <span>Cash vs Financing:</span>
                <span className="font-mono">{fmt(perfData?.sales?.cash_sales || 0)} / {fmt(perfData?.sales?.installment_sales || 0)}</span>
              </div>
            </div>

            {/* Collections Breakdown */}
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#0c1a3a]/60 border border-border dark:border-blue-500/20 space-y-2 text-xs">
              <div className="font-bold text-foreground border-b border-border pb-1.5 flex justify-between">
                <span>Payment Collections</span>
                <span className="font-mono text-sky-600 dark:text-sky-400">{perfData?.collections?.payments_count || 0} Receipts</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cash Payments:</span>
                <span className="font-mono font-semibold text-foreground">{fmt(perfData?.collections?.cash_collections || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Digital (GCash/Maya/Bank):</span>
                <span className="font-mono font-semibold text-foreground">{fmt(perfData?.collections?.digital_collections || 0)}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-1 font-bold">
                <span className="text-foreground">Total Collections:</span>
                <span className="font-mono text-sky-600 dark:text-sky-400">{fmt(perfData?.collections?.total_collected || 0)}</span>
              </div>
              <div className="pt-1 text-[11px] text-muted-foreground flex justify-between">
                <span>Down Payments Collected:</span>
                <span className="font-mono text-blue-600 dark:text-blue-400">{fmt(perfData?.collections?.down_payments || 0)}</span>
              </div>
            </div>

            {/* Overdue & Receivables Recovery */}
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#0c1a3a]/60 border border-border dark:border-blue-500/20 space-y-2 text-xs">
              <div className="font-bold text-foreground border-b border-border pb-1.5 flex justify-between">
                <span>Receivables & Overdue</span>
                <span className="font-mono text-amber-600 dark:text-amber-400">Recovery</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Overdue Payments Collected:</span>
                <span className="font-mono font-semibold text-blue-600 dark:text-blue-400">{fmt(perfData?.overdue_collected || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Financed Credit:</span>
                <span className="font-mono font-semibold text-foreground">{fmt(perfData?.installment_monitoring?.total_financed || stats?.total_sales || 0)}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-1 font-bold">
                <span className="text-foreground">Uncollected Portfolio:</span>
                <span className="font-mono text-rose-600">{fmt(stats?.total_outstanding_balance || 0)}</span>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* ─── SECTION 3: BRANCH COMPARISON (ADMIN-ONLY) ─── */}
      <Card noPad className="border border-border overflow-hidden">
        <CardHeader
          title="Branch Comparison & Operational Performance"
          action={<span className="text-xs text-muted-foreground font-mono">Live Cross-Branch Analysis</span>}
        />
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-muted-foreground uppercase font-semibold text-[11px]">
                <th className="py-3 px-4 text-left">Branch Name</th>
                <th className="py-3 px-4 text-right">Total Sales</th>
                <th className="py-3 px-4 text-right">Collections</th>
                <th className="py-3 px-4 text-right">Installment Sales</th>
                <th className="py-3 px-4 text-right">Outstanding Balance</th>
                <th className="py-3 px-4 text-center">Overdue Accounts</th>
                <th className="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {branchComp.length === 0 ? (
                <tr><td colSpan={7} className="py-6 text-center text-muted-foreground">No branch comparison data available</td></tr>
              ) : (
                branchComp.map((b, idx) => (
                  <tr key={b.branch} className={`border-b border-border hover:bg-muted/40 ${idx % 2 === 1 ? 'bg-muted/10' : ''}`}>
                    <td className="py-3 px-4 font-bold text-foreground">{b.branch}</td>
                    <td className="py-3 px-4 text-right font-mono font-semibold text-blue-600 dark:text-blue-400">{fmt(b.sales)}</td>
                    <td className="py-3 px-4 text-right font-mono font-semibold text-blue-600">{fmt(b.collections)}</td>
                    <td className="py-3 px-4 text-right font-mono text-purple-600">{fmt(b.installment_sales)}</td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-rose-600">{fmt(b.outstanding_balance)}</td>
                    <td className="py-3 px-4 text-center">
                      <Badge
                        text={`${b.overdue_accounts} Overdue`}
                        variant={b.overdue_accounts > 0 ? 'danger' : 'success'}
                      />
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => setSelectedBranchDetail(b)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg border border-border hover:bg-muted font-semibold cursor-pointer"
                      >
                        <FiEye className="w-3.5 h-3.5" />
                        <span>View</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ─── SECTION 4: CHARTS SECTION ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Sales & Collections Trend Chart */}
        {/* Sales & Collections Trend Chart */}
        <div className="lg:col-span-2 rounded-[24px] bg-card border border-border overflow-hidden p-6 relative">
          <div className="mb-8 relative z-10">
            <h4 className="text-[10px] font-bold text-primary tracking-widest uppercase mb-1">Performance</h4>
            <h3 className="text-xl font-bold text-foreground mb-1">Revenue overview</h3>
            <p className="text-xs text-muted-foreground">Sales and collections across selected timeframe</p>
          </div>

          <div className="h-64 w-full relative z-10">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={charts?.sales_trend || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="0" vertical={false} stroke="#64748b30" />
                <XAxis
                  dataKey="month"
                  tick={{ fill: '#64748b', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  dy={10}
                />
                <YAxis
                  tick={{ fill: '#64748b', fontSize: 11 }}
                  tickFormatter={v => `₱${(v / 1000).toFixed(0)}k`}
                  axisLine={false}
                  tickLine={false}
                  dx={-10}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: '#081329', borderColor: '#1d3557', borderRadius: '14px', color: '#f8fafc', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)' }}
                  itemStyle={{ color: '#e2e8f0' }}
                  formatter={v => `₱${v.toLocaleString()}`}
                />
                <Area
                  type="monotone"
                  dataKey="sales"
                  stroke="#3b82f6"
                  strokeWidth={3}
                  fillOpacity={1}
                  fill="url(#colorSales)"
                  name="Sales"
                />
                <Line
                  type="monotone"
                  dataKey="collections"
                  stroke="#38bdf8"
                  strokeWidth={3}
                  strokeDasharray="5 5"
                  dot={false}
                  name="Collections"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Installment Status Distribution */}
        <Card>
          <CardHeader title="Installment Portfolio Status" />
          <div className="h-64 w-full flex items-center justify-center pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={charts?.installment_status || []}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {(charts?.installment_status || []).map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color || PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Quick Action Navigation Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {quickActions.map(action => (
          <button
            key={action.label}
            onClick={() => action.action ? action.action() : navigate(action.path)}
            className="flex flex-col items-center justify-center gap-2.5 p-4 rounded-2xl bg-card border border-border hover:shadow-md hover:border-primary/50 transition-all text-center cursor-pointer group relative"
          >
            {action.badge > 0 && (
              <span className="absolute top-2 right-2 flex items-center justify-center min-w-[20px] h-[20px] px-1.5 rounded-full bg-rose-500 text-white text-[10px] font-bold shadow-sm">
                {action.badge}
              </span>
            )}
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center !text-white text-lg ${action.color} group-hover:scale-105 transition-transform shadow-sm`}>
              <span className="!text-white [&>svg]:!text-white [&>svg]:!stroke-white flex items-center justify-center">
                {action.icon}
              </span>
            </div>
            <div className="text-xs font-bold text-foreground leading-tight">{action.label}</div>
          </button>
        ))}
      </div>

      {/* ─── BRANCH DETAILS MODAL ─── */}
      {selectedBranchDetail && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedBranchDetail(null)}
          title={`Branch Drilldown: ${selectedBranchDetail.branch}`}
          size="xl"
        >
          <BranchDetailsView
            branchData={selectedBranchDetail}
            onBack={(deleted) => {
              setSelectedBranchDetail(null)
              if (deleted) {
                // Refresh dashboard stats if branch was deleted
                loadData()
              }
            }}
          />
        </Modal>
      )}

    </div>
  )
}

// ─── Store Administrator Dashboard ────────────────────────────────────────────
function StoreAdminBusinessDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const branchName = user?.employee?.branch?.name || (typeof user?.employee?.branch === 'string' ? user.employee.branch : '') || 'Assigned Branch'

  const [stats, setStats] = useState(null)
  const [perfData, setPerfData] = useState(null)
  const [recent, setRecent] = useState(null)
  const [timeframe, setTimeframe] = useState('this_month')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const inFlightRef = useRef(false)
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const loadData = async (source) => {
    if (inFlightRef.current && source !== 'initial') return
    inFlightRef.current = true

    const isBg = source === 'timer' || source === 'database' || source === 'event' || source === 'focus' || source === 'mutation' || source === 'sync'
    if (!isBg) {
      setLoading(true)
    }
    setError('')
    try {
      const [statsData, perfDataRes, recentData] = await Promise.all([
        api.dashboard.getStats(),
        api.dashboard.getBusinessPerformance({ timeframe }),
        api.dashboard.getRecent(),
      ])
      if (!isMountedRef.current) return
      setStats(prev => (fastDeepEqual(prev, statsData) ? prev : statsData))
      setPerfData(prev => (fastDeepEqual(prev, perfDataRes) ? prev : perfDataRes))
      setRecent(prev => (fastDeepEqual(prev, recentData) ? prev : recentData))
    } catch (err) {
      if (!isMountedRef.current) return
      if (!isBg) {
        console.error('Failed to load store admin dashboard:', err)
        setError(err.message || 'Failed to fetch branch metrics')
      }
    } finally {
      inFlightRef.current = false
      if (!isBg && isMountedRef.current) {
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    loadData('initial')
  }, [timeframe])

  useRealtimeSync(() => loadData('sync'), [timeframe], { periodic: true })

  if (loading) {
    return (
      <div className="space-y-4">
        <PageHeader title="Store Business Monitoring" subtitle={`Branch: ${branchName}`} />
        <StatSkeleton count={4} />
        <LoadingState message="Loading store sales, collections & inventory..." />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Store Business Monitoring"
        subtitle={`Branch: ${branchName} · Authorized Operations`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => navigate('/sales')}
              className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
            >
              <FiPlus className="w-4 h-4" />
              <span>Create Sale</span>
            </button>
          </div>
        }
      />

      {error && <ErrorAlert message={error} onRetry={loadData} />}

      {/* Store Branch Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard title="Today's Sales" value={fmt(stats?.today_sales || 0)} sub="cash & installment invoices" icon={<FiShoppingCart className="w-5 h-5" />} color="blue" />
        <StatCard title="Monthly Sales" value={fmt(stats?.monthly_sales || 0)} sub="month-to-date total" icon={<FiTrendingUp className="w-5 h-5" />} color="navy" />
        <StatCard title="Today's Collections" value={fmt(stats?.today_collections || 0)} sub="payments received today" icon={<TbCurrencyPeso className="w-5 h-5" />} color="indigo" />
        <StatCard title="Monthly Collections" value={fmt(stats?.monthly_collections || 0)} sub="month-to-date receipts" icon={<FiCreditCard className="w-5 h-5" />} color="cyan" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard title="Installment" value={stats?.active_installments?.toString() || '0'} sub="active branch accounts" icon={<FiCreditCard className="w-5 h-5" />} color="blue" />
        <StatCard title="Outstanding Balance" value={fmt(stats?.total_outstanding_balance || 0)} sub="branch receivables" icon={<FiTrendingDown className="w-5 h-5 text-rose-500" />} color="red" />
        <StatCard title="Overdue Accounts" value={stats?.overdue_installments?.toString() || '0'} sub="past-due schedules" icon={<FiAlertTriangle className="w-5 h-5 text-amber-500" />} color="yellow" />
        <StatCard title="Low Stock Products" value={stats?.low_stock_products?.toString() || '0'} sub="in catalog" icon={<FiPackage className="w-5 h-5 text-rose-500" />} color="red" />
      </div>

      {/* Performance Summary */}
      <Card noPad>
        <div className="p-4 border-b border-border bg-muted/40 flex justify-between items-center flex-wrap gap-2">
          <div>
            <h3 className="text-sm font-bold text-foreground">Branch Sales & Collection Performance</h3>
            <p className="text-xs text-muted-foreground">Authorized operations for {branchName}</p>
          </div>
          <div className="flex gap-1.5">
            {['today', 'this_week', 'this_month', 'this_year'].map(t => (
              <button
                key={t}
                onClick={() => setTimeframe(t)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-all ${timeframe === t ? 'bg-primary text-primary-foreground shadow-xs' : 'bg-card border border-border text-muted-foreground'
                  }`}
              >
                {t.replace('_', ' ').toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-3.5 rounded-2xl bg-card border border-border space-y-2 text-xs">
            <div className="font-bold text-foreground border-b border-border pb-1.5">Sales Breakdown</div>
            <div className="flex justify-between"><span>Transactions:</span><span className="font-mono font-bold">{perfData?.sales?.transactions || 0}</span></div>
            <div className="flex justify-between"><span>Gross Sales:</span><span className="font-mono font-semibold">{fmt(perfData?.sales?.gross_sales || 0)}</span></div>
            <div className="flex justify-between"><span>Discounts:</span><span className="font-mono text-rose-600">- {fmt(perfData?.sales?.discounts || 0)}</span></div>
            <div className="flex justify-between border-t border-border pt-1 font-bold"><span>Net Sales:</span><span className="font-mono text-blue-600 dark:text-blue-400">{fmt(perfData?.sales?.net_sales || 0)}</span></div>
          </div>

          <div className="p-3.5 rounded-2xl bg-card border border-border space-y-2 text-xs">
            <div className="font-bold text-foreground border-b border-border pb-1.5">Collections Breakdown</div>
            <div className="flex justify-between"><span>Payments Count:</span><span className="font-mono font-bold">{perfData?.collections?.payments_count || 0}</span></div>
            <div className="flex justify-between"><span>Cash Collected:</span><span className="font-mono font-semibold">{fmt(perfData?.collections?.cash_collections || 0)}</span></div>
            <div className="flex justify-between"><span>Digital (GCash/Maya/Bank):</span><span className="font-mono font-semibold">{fmt(perfData?.collections?.digital_collections || 0)}</span></div>
            <div className="flex justify-between border-t border-border pt-1 font-bold"><span>Total Collected:</span><span className="font-mono text-blue-600">{fmt(perfData?.collections?.total_collected || 0)}</span></div>
          </div>
        </div>
      </Card>

      {/* Quick Action Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button
          onClick={() => navigate('/sales')}
          className="flex items-center gap-2 p-3 rounded-2xl bg-card border border-border hover:shadow-md transition-all font-semibold text-xs text-foreground cursor-pointer"
        >
          <FiShoppingCart className="w-4 h-4 text-blue-500" />
          <span>New Sale</span>
        </button>
        <button
          onClick={() => navigate('/payments')}
          className="flex items-center gap-2 p-3 rounded-2xl bg-card border border-border hover:shadow-md transition-all font-semibold text-xs text-foreground cursor-pointer"
        >
          <TbCurrencyPeso className="w-4 h-4 text-blue-500" />
          <span>Record Payment</span>
        </button>
        <button
          onClick={() => navigate('/installments')}
          className="flex items-center gap-2 p-3 rounded-2xl bg-card border border-border hover:shadow-md transition-all font-semibold text-xs text-foreground cursor-pointer"
        >
          <FiCreditCard className="w-4 h-4 text-purple-500" />
          <span>View Installments</span>
        </button>
        <button
          onClick={() => navigate('/installments?tab=overdue')}
          className="flex items-center gap-2 p-3 rounded-2xl bg-card border border-border hover:shadow-md transition-all font-semibold text-xs text-foreground cursor-pointer"
        >
          <FiAlertTriangle className="w-4 h-4 text-rose-500" />
          <span>Overdue List</span>
        </button>
      </div>
    </div>
  )
}

// ─── Main Dashboard Page ──────────────────────────────────────────────────────
export default function DashboardPage() {
  const { user } = useAuth()
  const role = user?.role || 'Administrator'

  if (role === 'Employee') {
    return <EmployeeDashboard />
  }

  if (role === 'Store Administrator' || role === 'Store Admin') {
    return <StoreAdminBusinessDashboard />
  }

  return <AdminBusinessDashboard />
}

const LEAVE_CATEGORIES = [
  'Excuse Letter',
  'Sick Leave',
  'Important Matter',
  'Maternity Leave',
  'Vacation Leave',
]

export function buildFormalLetterText({ category, from_date, to_date, reason, user }) {
  const todayStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  const empName = user?.employee
    ? `${user.employee.first_name || ''} ${user.employee.last_name || ''}`.trim()
    : (user?.name || 'Employee')
  const empCode = user?.employee?.employee_code || ''
  const position = user?.employee?.position || 'Staff'
  const department = user?.employee?.department || 'Operations'
  const branch = user?.employee?.branch?.name || (typeof user?.employee?.branch === 'string' ? user.employee.branch : 'Main Branch')

  const fmtRangeDate = (d) => {
    if (!d) return '________'
    const parsed = new Date(`${d}T00:00:00`)
    if (isNaN(parsed.getTime())) return d
    return parsed.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  }

  const startFormatted = fmtRangeDate(from_date)
  const endFormatted = fmtRangeDate(to_date || from_date)
  const datePhrase = from_date && to_date && from_date !== to_date
    ? `from ${startFormatted} to ${endFormatted}`
    : `on ${startFormatted}`

  const cleanReason = (reason || '').trim() || 'personal/medical circumstances requiring my immediate attention'

  let openingParagraph = ''
  let closingAssurance = ''

  switch (category) {
    case 'Sick Leave':
      openingParagraph = `I am writing to formally request a Sick Leave of absence ${datePhrase}. Unfortunately, I am unable to report for duty due to ${cleanReason}.`
      closingAssurance = `I have attached the relevant medical documentation/proof for your verification. I will keep management updated on my recovery and resume my duties promptly upon fitness to work.`
      break
    case 'Important Matter':
      openingParagraph = `I respectfully submit this letter to request an excused absence for an Urgent / Important Matter ${datePhrase}, specifically due to ${cleanReason}.`
      closingAssurance = `I have coordinated my pending tasks to ensure store operations remain uninterrupted during my brief absence.`
      break
    case 'Maternity Leave':
      openingParagraph = `I am formally applying for Maternity Leave effective ${datePhrase} in connection with ${cleanReason}.`
      closingAssurance = `I have prepared a complete turnover of my responsibilities and attached the supporting medical records for HR and payroll processing.`
      break
    case 'Vacation Leave':
      openingParagraph = `I would like to formally request approval for a Vacation Leave ${datePhrase} due to ${cleanReason}.`
      closingAssurance = `Prior to my scheduled leave, I will ensure that all assigned deliverables and branch duties are properly endorsed to my team.`
      break
    case 'Excuse Letter':
    default:
      openingParagraph = `Please accept this formal Excuse Letter regarding my absence/tardiness ${datePhrase} due to ${cleanReason}.`
      closingAssurance = `I sincerely apologize for any inconvenience this may have caused and assure management of my continued commitment to my duties at Z-LICZ.`
      break
  }

  return `${todayStr}

To: The Management & HR Department
Z-LICZ Furniture & Appliances Trading
Branch: ${branch}

SUBJECT: FORMAL ${category.toUpperCase()} — ${empName.toUpperCase()}${empCode ? ` (${empCode})` : ''}

Dear Z-LICZ Management,

${openingParagraph}

${closingAssurance}

Thank you very much for your kind consideration and understanding.

Respectfully yours,

${empName}
${position} — ${department}
${branch}`
}

export function ExcuseLeaveLetterModal({ isOpen, onClose, user, onCreated }) {
  const todayIso = new Date().toISOString().slice(0, 10)
  const [formData, setFormData] = useState({
    category: 'Excuse Letter',
    from_date: todayIso,
    to_date: todayIso,
    reason: '',
    message: '',
  })
  const [attachmentFile, setAttachmentFile] = useState(null)
  const [attachmentPreview, setAttachmentPreview] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (isOpen) {
      const initial = {
        category: 'Excuse Letter',
        from_date: todayIso,
        to_date: todayIso,
        reason: '',
      }
      setFormData({
        ...initial,
        message: buildFormalLetterText({ ...initial, user }),
      })
      setAttachmentFile(null)
      if (attachmentPreview) {
        URL.revokeObjectURL(attachmentPreview)
        setAttachmentPreview('')
      }
    }
  }, [isOpen])

  useEffect(() => {
    return () => {
      if (attachmentPreview) URL.revokeObjectURL(attachmentPreview)
    }
  }, [attachmentPreview])

  if (!isOpen) return null

  const handleAutoFieldChange = (field, value) => {
    setFormData(prev => {
      const next = { ...prev, [field]: value }
      if (field === 'from_date' && next.to_date && value > next.to_date) {
        next.to_date = value
      }
      next.message = buildFormalLetterText({
        category: next.category,
        from_date: next.from_date,
        to_date: next.to_date,
        reason: next.reason,
        user,
      })
      return next
    })
  }

  const handleRegenerate = () => {
    setFormData(prev => ({
      ...prev,
      message: buildFormalLetterText({
        category: prev.category,
        from_date: prev.from_date,
        to_date: prev.to_date,
        reason: prev.reason,
        user,
      }),
    }))
    showToast('Formal business letter regenerated', 'info')
  }

  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (attachmentPreview) URL.revokeObjectURL(attachmentPreview)
    setAttachmentFile(file)
    if (file.type.startsWith('image/')) {
      setAttachmentPreview(URL.createObjectURL(file))
    } else {
      setAttachmentPreview('')
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!formData.from_date || !formData.to_date) {
      showToast('Please select both From Date and To Date', 'error')
      return
    }
    if (!formData.message?.trim()) {
      showToast('Letter content cannot be empty', 'error')
      return
    }

    setSubmitting(true)
    try {
      const payload = new FormData()
      payload.append('sender_type', 'employee')
      payload.append('category', formData.category)
      payload.append('topic', `${formData.category} (${formData.from_date} to ${formData.to_date})`)
      payload.append('from_date', formData.from_date)
      payload.append('to_date', formData.to_date)
      payload.append('reason', formData.reason || formData.category)
      payload.append('message', formData.message)
      if (attachmentFile) {
        payload.append('attachment', attachmentFile)
      }

      const res = await api.supportMessages.create(payload)
      showToast(`${formData.category} submitted to Management!`, 'success')
      triggerDataSync('support')
      triggerDataSync('notifications')
      if (onCreated && res?.data) {
        onCreated(res.data)
      }
      onClose()
    } catch (err) {
      showToast(err.message || 'Failed to submit letter', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title="Create Excuse / Leave Letter"
      size="lg"
      footer={
        <div className="flex items-center justify-end gap-2.5 w-full">
          <Btn variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Btn>
          <Btn
            variant="primary"
            onClick={handleSubmit}
            disabled={submitting}
            icon={<FiSend className="w-4 h-4" />}
          >
            {submitting ? 'Submitting...' : 'Submit to Management'}
          </Btn>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 font-semibold">
            <FiZap className="w-4 h-4 shrink-0" />
            <span>Auto-Create Letter Engine: Select your category, dates, and brief reason to auto-generate a formal Z-LICZ management letter.</span>
          </div>
          <button
            type="button"
            onClick={handleRegenerate}
            className="shrink-0 px-2.5 py-1 rounded-lg bg-blue-600 text-white font-bold text-[11px] hover:bg-blue-700 cursor-pointer transition-colors"
          >
            Regenerate Text
          </button>
        </div>

        {/* Category Pills */}
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
            Letter Category *
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {LEAVE_CATEGORIES.map(cat => {
              const active = formData.category === cat
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => handleAutoFieldChange('category', cat)}
                  className={`px-3 py-2 rounded-xl font-bold text-xs border text-center transition-all cursor-pointer ${active
                      ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                      : 'bg-card text-foreground border-border hover:bg-muted'
                    }`}
                >
                  {cat}
                </button>
              )
            })}
          </div>
        </div>

        {/* Inclusive Dates + Brief Reason */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
              From Date *
            </label>
            <input
              type="date"
              value={formData.from_date || ''}
              onChange={e => handleAutoFieldChange('from_date', e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-mono text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
              required
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
              To Date *
            </label>
            <input
              type="date"
              value={formData.to_date || ''}
              min={formData.from_date || undefined}
              onChange={e => handleAutoFieldChange('to_date', e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-mono text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
              required
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
              Brief Reason / Context *
            </label>
            <input
              type="text"
              value={formData.reason || ''}
              onChange={e => handleAutoFieldChange('reason', e.target.value)}
              placeholder="e.g., High fever & medical checkup..."
              className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
              required
            />
          </div>
        </div>

        {/* Auto-Generated Formal Business Letter (Editable) */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Formal Letter to Z-LICZ Management (Editable) *
            </label>
            <span className="text-[10px] text-muted-foreground font-mono">
              You may freely customize the generated letter below
            </span>
          </div>
          <textarea
            rows={11}
            value={formData.message || ''}
            onChange={e => setFormData(prev => ({ ...prev, message: e.target.value }))}
            className="w-full p-3.5 rounded-xl border border-border bg-card text-foreground font-mono text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary/30 resize-y"
            required
          />
        </div>

        {/* Supporting Proof / Attachment */}
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
            Supporting Proof / Document (Medical Certificate, Receipt, ID, etc.)
          </label>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <label className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-dashed border-primary/50 bg-primary/5 hover:bg-primary/10 text-primary font-bold text-xs cursor-pointer transition-colors">
              <FiUpload className="w-4 h-4" />
              <span>{attachmentFile ? 'Change Attachment' : 'Attach Proof / Document'}</span>
              <input
                type="file"
                accept="image/*,.pdf,.doc,.docx"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
            {attachmentFile && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-muted border border-border text-xs">
                <FiFileText className="w-3.5 h-3.5 text-primary shrink-0" />
                <span className="truncate max-w-[220px] font-medium">{attachmentFile.name}</span>
                <button
                  type="button"
                  onClick={() => {
                    setAttachmentFile(null)
                    if (attachmentPreview) {
                      URL.revokeObjectURL(attachmentPreview)
                      setAttachmentPreview('')
                    }
                  }}
                  className="text-rose-500 hover:text-rose-600 cursor-pointer ml-1"
                >
                  <FiX className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
          {attachmentPreview && (
            <div className="mt-2.5 p-2 rounded-xl border border-border bg-muted/20 inline-block">
              <img
                src={attachmentPreview}
                alt="Attachment preview"
                className="max-h-36 rounded-lg object-contain"
              />
            </div>
          )}
        </div>
      </form>
    </Modal>
  )
}

// ─── Employee Dashboard (Exported for direct routing) ──────────────────────────
export function EmployeeDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [stats, setStats] = useState(null)
  const [myLetters, setMyLetters] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [payslip, setPayslip] = useState(null)
  const [letterModalOpen, setLetterModalOpen] = useState(false)
  const [viewLetterModal, setViewLetterModal] = useState(null)
  const inFlightRef = useRef(false)
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const openPayslip = async (id) => {
    try {
      if (user?.role === 'Employee') {
        const data = await api.payroll.getMePayslip(id)
        setPayslip(data.record)
      } else {
        const data = await api.payroll.getPayslip(id)
        setPayslip(data.record)
      }
    } catch (err) {
      showToast(err.message || 'Failed to fetch payslip details', 'error')
    }
  }

  const loadData = async (source) => {
    if (inFlightRef.current && source !== 'initial') return
    inFlightRef.current = true

    const isBg = source === 'timer' || source === 'database' || source === 'event' || source === 'focus' || source === 'mutation' || source === 'sync'
    if (!isBg) {
      setLoading(true)
    }
    setError('')
    try {
      const [data, lettersRes] = await Promise.all([
        api.dashboard.getStats({
          role: 'Employee',
          employee_id: user?.employee_id || undefined,
        }),
        api.employeeLetters.getAll().catch(() => ({ letters: [] })),
      ])
      if (!isMountedRef.current) return
      setStats(prev => (fastDeepEqual(prev, data) ? prev : data))
      const nextLetters = lettersRes?.letters || []
      setMyLetters(prev => (fastDeepEqual(prev, nextLetters) ? prev : nextLetters))
    } catch (err) {
      if (!isMountedRef.current) return
      if (!isBg) {
        console.error('Failed to load employee stats:', err)
        setError(err.message || 'Failed to load employee metrics')
      }
    } finally {
      inFlightRef.current = false
      if (!isBg && isMountedRef.current) {
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    loadData('initial')
  }, [user])

  useRealtimeSync(() => loadData('sync'), [user], { periodic: true })

  const today = stats?.my_attendance_today
  const myPayroll = stats?.my_latest_payroll
  const myAttendance = stats?.my_recent_attendance || []

  if (loading) {
    return (
      <div>
        <PageHeader title="My Dashboard" subtitle={`Welcome back, ${user?.name ? user.name.split(' ')[0] : 'Employee'}`} />
        <LoadingState message="Loading personal records from database..." />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Dashboard"
        subtitle={`Welcome back, ${user?.name ? user.name.split(' ')[0] : 'Employee'}`}
        action={
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => navigate('/employee/notifications')}
              className="flex items-center gap-2 px-3.5 py-2 bg-card hover:bg-muted text-foreground border border-border font-semibold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
            >
              <FiBell className="w-4 h-4 text-primary" />
              <span>Notifications</span>
            </button>
            <button
              onClick={() => navigate('/employee/attendance')}
              className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
            >
              <FiCamera className="w-4 h-4" />
              <span>My Permanent QR Badge</span>
            </button>
          </div>
        }
      />

      {error && <ErrorAlert message={error} onRetry={loadData} />}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Today's Attendance */}
        <Card>
          <div className="flex justify-between items-center mb-4">
            <div className="text-xs font-bold uppercase tracking-wider text-foreground">Today's Attendance</div>
            <button
              onClick={() => navigate('/employee/attendance')}
              className="text-xs text-primary font-semibold hover:underline flex items-center gap-1 cursor-pointer"
            >
              <FiEye className="w-3.5 h-3.5" />
              <span>View Badge →</span>
            </button>
          </div>
          {today ? (
            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Status</span>
                <StatusBadge status={today.status} />
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Time In</span>
                <span className="font-mono font-semibold text-foreground">{today.time_in || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Time Out</span>
                <span className="font-mono font-semibold text-foreground">{today.time_out || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Hours</span>
                <span className="font-mono font-semibold text-blue-600 dark:text-blue-400">{today.total_hours}h</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Overtime</span>
                <span className="font-mono font-semibold text-amber-600">{today.overtime_hours}h</span>
              </div>
            </div>
          ) : (
            <div className="space-y-3 py-2 text-xs">
              <p className="text-muted-foreground">No attendance record found for today yet. Use your permanent QR badge to clock in at the office terminal.</p>
              <button
                onClick={() => navigate('/employee/attendance')}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border border-border bg-card hover:bg-muted font-bold text-foreground cursor-pointer transition-colors"
              >
                <FiCamera className="w-4 h-4 text-primary" />
                <span>View My Permanent QR Badge</span>
              </button>
            </div>
          )}
        </Card>

        {/* Latest Payroll */}
        <Card>
          <div className="flex justify-between items-center mb-4">
            <div className="text-xs font-bold uppercase tracking-wider text-foreground">Latest Payroll</div>
            {myPayroll && (
              <button
                onClick={() => openPayslip(myPayroll.payroll_id)}
                className="text-xs text-primary font-semibold hover:underline flex items-center gap-1 cursor-pointer"
              >
                <FiFileText className="w-3.5 h-3.5" />
                <span>View Full Payslip</span>
              </button>
            )}
          </div>
          {myPayroll ? (
            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Period</span>
                <span className="font-mono text-foreground">{myPayroll.period_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Gross Pay</span>
                <span className="font-mono font-semibold text-foreground">{fmt(myPayroll.gross_pay)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Deductions</span>
                <span className="font-mono text-rose-600">- {fmt(myPayroll.total_deductions)}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-2">
                <span className="font-bold text-foreground">Net Pay</span>
                <span className="font-mono text-base font-bold text-blue-600 dark:text-blue-400">{fmt(myPayroll.net_pay)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Status</span>
                <StatusBadge status={myPayroll.status} />
              </div>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground py-4">No payroll records available.</div>
          )}
        </Card>
      </div>

      {/* My Excuse & Leave Letters */}
      <Card noPad>
        <CardHeader
          title="My Excuse & Leave Letters"
        />
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-muted-foreground uppercase font-semibold text-[11px]">
                <th className="py-2.5 px-4 text-left">Category</th>
                <th className="py-2.5 px-4 text-left">Inclusive Dates</th>
                <th className="py-2.5 px-4 text-left">Reason</th>
                <th className="py-2.5 px-4 text-center">Status</th>
                <th className="py-2.5 px-4 text-left">Management Remarks</th>
                <th className="py-2.5 px-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {myLetters.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-muted-foreground">
                    No excuse or leave letters submitted yet.
                  </td>
                </tr>
              ) : (
                myLetters.map((item) => {
                  const startStr = item.start_date || item.from_date ? String(item.start_date || item.from_date).slice(0, 10) : '—'
                  const endStr = item.end_date || item.to_date ? String(item.end_date || item.to_date).slice(0, 10) : startStr

                  return (
                    <tr key={item.letter_id || item.id} className="border-b border-border hover:bg-muted/30">
                      <td className="py-2.5 px-4 font-bold text-foreground">{item.category || item.title || item.topic}</td>
                      <td className="py-2.5 px-4 font-mono">
                        {startStr} {startStr !== endStr ? `→ ${endStr}` : ''}
                      </td>
                      <td className="py-2.5 px-4 text-muted-foreground max-w-xs truncate">{item.reason || '—'}</td>
                      <td className="py-2.5 px-4 text-center">
                        <StatusBadge status={item.status} />
                      </td>
                      <td className="py-2.5 px-4 text-muted-foreground max-w-xs truncate">
                        {item.admin_remarks || item.response || 'Awaiting management review'}
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        <button
                          onClick={() => setViewLetterModal(item)}
                          className="px-2.5 py-1 rounded-lg bg-primary/10 text-primary font-bold text-[11px] hover:bg-primary/20 cursor-pointer"
                        >
                          View Letter
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Recent Attendance */}
      <Card noPad>
        <CardHeader title="Recent Attendance" />
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-muted-foreground uppercase font-semibold text-[11px]">
                <th className="py-2.5 px-4 text-left">Date</th>
                <th className="py-2.5 px-4 text-left">Time In</th>
                <th className="py-2.5 px-4 text-left">Time Out</th>
                <th className="py-2.5 px-4 text-right">Regular Hours</th>
                <th className="py-2.5 px-4 text-right">Overtime</th>
                <th className="py-2.5 px-4 text-right">Total Hours</th>
                <th className="py-2.5 px-4 text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {myAttendance.length === 0 ? (
                <tr><td colSpan={7} className="py-6 text-center text-muted-foreground">No recent attendance records</td></tr>
              ) : (
                myAttendance.map((a, i) => (
                  <tr key={a.attendance_id || i} className="border-b border-border hover:bg-muted/30">
                    <td className="py-2.5 px-4 font-mono">{a.attendance_date}</td>
                    <td className="py-2.5 px-4 font-mono">{a.time_in}</td>
                    <td className="py-2.5 px-4 font-mono">{a.time_out}</td>
                    <td className="py-2.5 px-4 text-right font-mono">{a.regular_hours}h</td>
                    <td className="py-2.5 px-4 text-right font-mono font-bold text-amber-600">{a.overtime_hours}h</td>
                    <td className="py-2.5 px-4 text-right font-mono font-bold text-blue-600 dark:text-blue-400">{a.total_hours}h</td>
                    <td className="py-2.5 px-4 text-center"><StatusBadge status={a.status} /></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Payslip Modal */}
      {payslip && (
        <EmployeePayslipModal payslip={payslip} onClose={() => setPayslip(null)} />
      )}

      {/* Create Excuse / Leave Letter Modal */}
      <ExcuseLeaveLetterModal
        isOpen={letterModalOpen}
        onClose={() => setLetterModalOpen(false)}
        user={user}
        onCreated={(newLetter) => {
          setMyLetters(prev => [newLetter, ...prev])
        }}
      />

      {/* View Submitted Letter Modal */}
      {viewLetterModal && (
        <Modal
          open={!!viewLetterModal}
          onClose={() => setViewLetterModal(null)}
          title={`${viewLetterModal.category || 'Submitted Letter'} — ${viewLetterModal.status}`}
          size="lg"
        >
          <div className="space-y-4 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-muted/40 border border-border">
              <div>
                <span className="text-muted-foreground">Inclusive Dates: </span>
                <span className="font-mono font-bold text-foreground">
                  {viewLetterModal.start_date || viewLetterModal.from_date ? `${String(viewLetterModal.start_date || viewLetterModal.from_date).slice(0, 10)} to ${String(viewLetterModal.end_date || viewLetterModal.to_date || viewLetterModal.start_date || viewLetterModal.from_date).slice(0, 10)}` : 'N/A'}
                </span>
              </div>
              <StatusBadge status={viewLetterModal.status} />
            </div>
            <div className="p-4 rounded-xl border border-border bg-card font-mono whitespace-pre-wrap leading-relaxed text-foreground">
              {viewLetterModal.letter_body || viewLetterModal.message}
            </div>
            {viewLetterModal.attachment_url && (
              <div className="space-y-1.5">
                <div className="text-[11px] font-bold uppercase text-muted-foreground">Attached Supporting Document</div>
                <a
                  href={viewLetterModal.attachment_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-primary font-bold hover:underline"
                >
                  <FiEye className="w-3.5 h-3.5" />
                  <span>Open Attachment in New Tab ↗</span>
                </a>
              </div>
            )}
            {(viewLetterModal.admin_remarks || viewLetterModal.response) && (
              <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <div className="text-[11px] font-bold uppercase text-emerald-600 dark:text-emerald-400 mb-1">Management Decision Remarks</div>
                <div className="text-foreground">{viewLetterModal.admin_remarks || viewLetterModal.response}</div>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}
