import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts'
import {
  FiCreditCard, FiPackage, FiAlertTriangle,
  FiTrendingUp, FiTrendingDown, FiShoppingCart, FiUsers,
  FiLayers, FiActivity, FiClock, FiEye, FiPlus, FiCheckCircle,
  FiX, FiCamera, FiBarChart2, FiFileText, FiSmartphone, FiInfo, FiShield
} from 'react-icons/fi'
import { useAuth } from '../context/AuthContext'
import {
  Btn, StatCard, Card, CardHeader, PageHeader, StatusBadge, Badge, ProgressBar, showToast,
  LoadingState, ErrorAlert, StatSkeleton, Modal, Table, TR, TD, TabBar,
} from '../components/ui'
import { fmt, fmtDate } from '../lib/utils'
import { api } from '../lib/api'
import { TbCurrencyPeso } from 'react-icons/tb'

const PIE_COLORS = ['#10b981', '#ef4444', '#2563eb', '#f59e0b', '#8b5cf6']

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
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800">
        <FiSmartphone className="w-3 h-3 text-emerald-500" />
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
      <TbCurrencyPeso className="w-3 h-3 text-emerald-500" />
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
  const [stats, setStats] = useState(null)
  const [charts, setCharts] = useState(null)
  const [recent, setRecent] = useState(null)
  const [alerts, setAlerts] = useState([])
  const [branchComp, setBranchComp] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Performance Timeframe Filter State
  const [timeframe, setTimeframe] = useState('this_month')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [perfData, setPerfData] = useState(null)
  const [perfLoading, setPerfLoading] = useState(false)

  // Branch Detail Drilldown Modal
  const [selectedBranchDetail, setSelectedBranchDetail] = useState(null)
  const [qrRequestSummary, setQrRequestSummary] = useState(null)
  const [showQrWidgetModal, setShowQrWidgetModal] = useState(false)

  const loadData = async () => {
    setLoading(true)
    setError('')
    try {
      const [statsData, chartsData, recentData, alertsData, branchData] = await Promise.all([
        api.dashboard.getStats(),
        api.dashboard.getCharts(),
        api.dashboard.getRecent(),
        api.dashboard.getAlerts().catch(() => ({ alerts: [] })),
        api.dashboard.getBranchComparison().catch(() => ({ branches: [] })),
      ])
      setStats(statsData)
      setCharts(chartsData)
      setRecent(recentData)
      setAlerts(alertsData?.alerts || [])
      setBranchComp(branchData?.branches || [])

      if (isAdmin) {
        api.qrRequests.getAll({ per_page: 1 }).then(res => {
          if (res.summary) setQrRequestSummary(res.summary)
        }).catch(() => {})
      }
    } catch (err) {
      console.error('Failed to load admin business dashboard:', err)
      setError(err.message || 'Failed to load business dashboard metrics')
    } finally {
      setLoading(false)
    }
  }

  const loadPerformance = async (tf = timeframe) => {
    setPerfLoading(true)
    try {
      const params = {
        timeframe: tf,
        date_from: tf === 'custom' ? customStart : undefined,
        date_to: tf === 'custom' ? customEnd : undefined,
      }
      const data = await api.dashboard.getBusinessPerformance(params)
      setPerfData(data)
    } catch (err) {
      console.error('Failed to load performance metrics:', err)
    } finally {
      setPerfLoading(false)
    }
  }

  useEffect(() => {
    loadData()
    loadPerformance('this_month')
  }, [])

  const handleTimeframeChange = (tf) => {
    setTimeframe(tf)
    if (tf !== 'custom') {
      loadPerformance(tf)
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
        <PageHeader title="Business Monitoring Dashboard" subtitle={`Organization-wide real-time operations`} />
        <StatSkeleton count={5} />
        <LoadingState message="Querying live sales, collections, and installment accounts..." />
      </div>
    )
  }

  const quickActions = [
    ...(isAdmin ? [{ label: 'QR Requests', icon: <FiShield className="w-4 h-4" />, action: () => setShowQrWidgetModal(true), color: 'bg-amber-600', badge: qrRequestSummary?.pending || 0 }] : []),
    { label: 'Create Sale', icon: <FiShoppingCart className="w-4 h-4" />, path: '/sales', color: 'bg-emerald-600' },
    { label: 'Record Payment', icon: <TbCurrencyPeso className="w-4 h-4" />, path: '/payments', color: 'bg-blue-600' },
    { label: 'Installment Accounts', icon: <FiCreditCard className="w-4 h-4" />, path: '/installments', color: 'bg-indigo-600' },
    { label: 'Overdue Monitoring', icon: <FiAlertTriangle className="w-4 h-4" />, path: '/installments?tab=overdue', color: 'bg-rose-600' },
    { label: 'Products / Stock', icon: <FiPackage className="w-4 h-4" />, path: '/products', color: 'bg-amber-600' },
    { label: 'Business Reports', icon: <FiBarChart2 className="w-4 h-4" />, path: '/reports', color: 'bg-purple-600' },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Business Monitoring Dashboard"
        subtitle={`Real-time overview across all operational branches · ${fmtDate(new Date())}`}
        action={
          <div className="flex gap-2">

            <button
              onClick={() => navigate('/sales')}
              className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
            >
              <FiPlus className="w-4 h-4" />
              <span>New Sale Transaction</span>
            </button>
          </div>
        }
      />

      {error && <ErrorAlert message={error} onRetry={loadData} />}



      {/* ─── ADMIN QR REQUESTS MODAL ─── */}
      {showQrWidgetModal && isAdmin && qrRequestSummary && (
        <Modal
          isOpen={true}
          onClose={() => setShowQrWidgetModal(false)}
          title="QR Attendance Requests"
          size="md"
        >
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Employee & Store Administrator account verification and permanent QR issuance queue.
            </p>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-center">
                <span className="text-[10px] uppercase font-bold text-amber-500 block mb-1">Pending</span>
                <span className="text-2xl font-mono font-black text-amber-600 dark:text-amber-400">{qrRequestSummary.pending || 0}</span>
              </div>
              <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-center">
                <span className="text-[10px] uppercase font-bold text-indigo-500 block mb-1">Under Review</span>
                <span className="text-2xl font-mono font-black text-indigo-600 dark:text-indigo-400">{qrRequestSummary.under_review || 0}</span>
              </div>
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center">
                <span className="text-[10px] uppercase font-bold text-emerald-500 block mb-1">Approved</span>
                <span className="text-2xl font-mono font-black text-emerald-600 dark:text-emerald-400">{qrRequestSummary.approved || 0}</span>
              </div>
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-center">
                <span className="text-[10px] uppercase font-bold text-rose-500 block mb-1">Rejected</span>
                <span className="text-2xl font-mono font-black text-rose-600 dark:text-rose-400">{qrRequestSummary.rejected || 0}</span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-border">
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

      {/* ─── SECTION 1: CORE BUSINESS STATS ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard
          title="Total Gross Sales"
          value={fmt(stats?.total_sales || 0)}
          sub="cash & installment totals"
          icon={<TbCurrencyPeso className="w-5 h-5" />}
          color="green"
        />
        <StatCard
          title="Total Collections"
          value={fmt(stats?.total_collections || 0)}
          sub="actual payments received"
          icon={<FiCheckCircle className="w-5 h-5" />}
          color="blue"
        />
        <StatCard
          title="Installment Sales"
          value={fmt(stats?.installment_sales || 0)}
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
          color="indigo"
        />
      </div>

      {/* ─── SECTION 2: TIMEFRAME PERFORMANCE FILTER ─── */}
      <Card noPad className="border border-border overflow-hidden">
        <div className="p-4 border-b border-border bg-muted/40 flex flex-col md:flex-row md:items-center justify-between gap-3">
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
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-all ${
                  timeframe === t.id
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'bg-card border border-border text-muted-foreground hover:text-foreground'
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
              className="px-3 py-1 bg-primary text-primary-foreground font-bold rounded-xl cursor-pointer"
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
            <div className="p-3.5 rounded-2xl bg-muted/20 border border-border space-y-2 text-xs">
              <div className="font-bold text-foreground border-b border-border pb-1.5 flex justify-between">
                <span>Sales Revenue</span>
                <span className="font-mono text-primary">{perfData?.sales?.transactions || 0} Transactions</span>
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
                <span className="font-mono text-emerald-600">{fmt(perfData?.sales?.net_sales || 0)}</span>
              </div>
              <div className="pt-1 text-[11px] text-muted-foreground flex justify-between">
                <span>Cash vs Financing:</span>
                <span className="font-mono">{fmt(perfData?.sales?.cash_sales || 0)} / {fmt(perfData?.sales?.installment_sales || 0)}</span>
              </div>
            </div>

            {/* Collections Breakdown */}
            <div className="p-3.5 rounded-2xl bg-muted/20 border border-border space-y-2 text-xs">
              <div className="font-bold text-foreground border-b border-border pb-1.5 flex justify-between">
                <span>Payment Collections</span>
                <span className="font-mono text-blue-600">{perfData?.collections?.payments_count || 0} Receipts</span>
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
                <span className="font-mono text-blue-600">{fmt(perfData?.collections?.total_collected || 0)}</span>
              </div>
              <div className="pt-1 text-[11px] text-muted-foreground flex justify-between">
                <span>Down Payments Collected:</span>
                <span className="font-mono text-emerald-600">{fmt(perfData?.collections?.down_payments || 0)}</span>
              </div>
            </div>

            {/* Overdue & Receivables Recovery */}
            <div className="p-3.5 rounded-2xl bg-muted/20 border border-border space-y-2 text-xs">
              <div className="font-bold text-foreground border-b border-border pb-1.5 flex justify-between">
                <span>Receivables & Overdue</span>
                <span className="font-mono text-amber-600">Recovery</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Overdue Payments Collected:</span>
                <span className="font-mono font-semibold text-emerald-600">{fmt(perfData?.overdue_collected || 0)}</span>
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
                    <td className="py-3 px-4 text-right font-mono font-semibold text-emerald-600">{fmt(b.sales)}</td>
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
        <Card className="lg:col-span-2">
          <CardHeader title="Revenue & Collections Trend" />
          <div className="h-64 w-full pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={charts?.sales_trend || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#88888820" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₱${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={v => fmt(v)} />
                <Legend />
                <Bar dataKey="sales" fill="#10b981" name="Sales (PHP)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="collections" fill="#2563eb" name="Collections (PHP)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

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
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white text-lg ${action.color} group-hover:scale-105 transition-transform shadow-sm`}>
              {action.icon}
            </div>
            <div className="text-xs font-bold text-foreground leading-tight">{action.label}</div>
          </button>
        ))}
      </div>

      {/* Branch Detail Drilldown Modal */}
      {selectedBranchDetail && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedBranchDetail(null)}
          title={`Branch Performance — ${selectedBranchDetail.branch}`}
          size="md"
        >
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-muted/30 rounded-xl border border-border">
                <div className="text-[10px] text-muted-foreground uppercase font-bold">Total Sales</div>
                <div className="text-base font-mono font-bold text-emerald-600 mt-0.5">{fmt(selectedBranchDetail.sales)}</div>
              </div>
              <div className="p-3 bg-muted/30 rounded-xl border border-border">
                <div className="text-[10px] text-muted-foreground uppercase font-bold">Collections</div>
                <div className="text-base font-mono font-bold text-blue-600 mt-0.5">{fmt(selectedBranchDetail.collections)}</div>
              </div>
              <div className="p-3 bg-muted/30 rounded-xl border border-border">
                <div className="text-[10px] text-muted-foreground uppercase font-bold">Installment Sales</div>
                <div className="text-base font-mono font-bold text-purple-600 mt-0.5">{fmt(selectedBranchDetail.installment_sales)}</div>
              </div>
              <div className="p-3 bg-muted/30 rounded-xl border border-border">
                <div className="text-[10px] text-muted-foreground uppercase font-bold">Outstanding Balance</div>
                <div className="text-base font-mono font-bold text-rose-600 mt-0.5">{fmt(selectedBranchDetail.outstanding_balance)}</div>
              </div>
            </div>

            <div className="p-3 rounded-xl border border-border bg-card flex justify-between items-center">
              <div>
                <div className="font-bold text-foreground">Overdue Accounts</div>
                <div className="text-muted-foreground">Installments with past-due schedules in this branch</div>
              </div>
              <Badge
                text={`${selectedBranchDetail.overdue_accounts} Overdue`}
                variant={selectedBranchDetail.overdue_accounts > 0 ? 'danger' : 'success'}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setSelectedBranchDetail(null)}
                className="flex items-center gap-1 px-3.5 py-1.5 rounded-xl border border-border hover:bg-muted font-semibold cursor-pointer"
              >
                <FiX className="w-3.5 h-3.5" />
                <span>Close</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const branch = selectedBranchDetail.branch;
                  setSelectedBranchDetail(null);
                  navigate(`/installments?branch=${encodeURIComponent(branch)}`);
                }}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-primary text-primary-foreground font-bold cursor-pointer"
              >
                <FiEye className="w-3.5 h-3.5" />
                <span>View Branch Installments →</span>
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ─── Store Administrator Dashboard ────────────────────────────────────────────
function StoreAdminBusinessDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const branchName = user?.employee?.branch || 'Main Branch'

  const [stats, setStats] = useState(null)
  const [perfData, setPerfData] = useState(null)
  const [recent, setRecent] = useState(null)
  const [timeframe, setTimeframe] = useState('this_month')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadData = async () => {
    setLoading(true)
    setError('')
    try {
      const [statsData, perfDataRes, recentData] = await Promise.all([
        api.dashboard.getStats(),
        api.dashboard.getBusinessPerformance({ timeframe }),
        api.dashboard.getRecent(),
      ])
      setStats(statsData)
      setPerfData(perfDataRes)
      setRecent(recentData)
    } catch (err) {
      console.error('Failed to load store admin dashboard:', err)
      setError(err.message || 'Failed to fetch branch metrics')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [timeframe])

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
          <button
            onClick={() => navigate('/sales')}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
          >
            <FiPlus className="w-4 h-4" />
            <span>Create Sale</span>
          </button>
        }
      />

      {error && <ErrorAlert message={error} onRetry={loadData} />}

      {/* Store Branch Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard title="Today's Sales" value={fmt(stats?.today_sales || 0)} sub="cash & installment invoices" icon={<FiShoppingCart className="w-5 h-5" />} color="green" />
        <StatCard title="Monthly Sales" value={fmt(stats?.monthly_sales || 0)} sub="month-to-date total" icon={<FiTrendingUp className="w-5 h-5" />} color="blue" />
        <StatCard title="Today's Collections" value={fmt(stats?.today_collections || 0)} sub="payments received today" icon={<TbCurrencyPeso className="w-5 h-5" />} color="indigo" />
        <StatCard title="Monthly Collections" value={fmt(stats?.monthly_collections || 0)} sub="month-to-date receipts" icon={<FiCreditCard className="w-5 h-5" />} color="purple" />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard title="Installment Accounts" value={stats?.active_installments?.toString() || '0'} sub="active branch accounts" icon={<FiCreditCard className="w-5 h-5" />} color="blue" />
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
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-all ${
                  timeframe === t ? 'bg-primary text-primary-foreground shadow-xs' : 'bg-card border border-border text-muted-foreground'
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
            <div className="flex justify-between border-t border-border pt-1 font-bold"><span>Net Sales:</span><span className="font-mono text-emerald-600">{fmt(perfData?.sales?.net_sales || 0)}</span></div>
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
          <FiShoppingCart className="w-4 h-4 text-emerald-500" />
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

// ─── Employee Dashboard (Exported for direct routing) ──────────────────────────
export function EmployeeDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadData = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await api.dashboard.getStats({
        role: 'Employee',
        employee_id: user?.employee_id || undefined,
      })
      setStats(data)
    } catch (err) {
      console.error('Failed to load employee stats:', err)
      setError(err.message || 'Failed to load employee metrics')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [user])

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
          <button
            onClick={() => navigate('/employee/attendance')}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
          >
            <FiCamera className="w-4 h-4" />
            <span>My Permanent QR Badge</span>
          </button>
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
                <span className="font-mono font-semibold text-emerald-600">{today.total_hours}h</span>
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
          <div className="text-xs font-bold uppercase tracking-wider text-foreground mb-4">Latest Payroll</div>
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
                <span className="font-mono text-base font-bold text-emerald-600">{fmt(myPayroll.net_pay)}</span>
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
                    <td className="py-2.5 px-4 text-right font-mono font-bold text-emerald-600">{a.total_hours}h</td>
                    <td className="py-2.5 px-4 text-center"><StatusBadge status={a.status} /></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
