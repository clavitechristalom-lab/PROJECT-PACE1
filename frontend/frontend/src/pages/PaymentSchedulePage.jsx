import { useState, useEffect, useMemo } from 'react'
import {
  FiCalendar, FiClock, FiAlertTriangle, FiCheckCircle,
  FiSearch, FiList, FiGrid, FiCreditCard, FiX
} from 'react-icons/fi'
import {
  Btn, StatusBadge, Table, TR, TD, SearchBar, PageHeader, StatCard, Card, Pagination,
  LoadingState, ErrorAlert, TableSkeleton, EmptyState,
} from '../components/ui'
import { fmt, filterBySearch } from '../lib/utils'
import { api } from '../lib/api'
import { TbCurrencyPeso } from 'react-icons/tb'

export default function PaymentSchedulePage({ branchFilter: propBranchFilter, embedded }) {
  const [schedules, setSchedules] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [viewMode, setViewMode] = useState('list')
  const [page, setPage] = useState(1)
  const pageSize = 12

  const [localBranchFilter, setLocalBranchFilter] = useState('All')
  const branchFilter = propBranchFilter || localBranchFilter

  const loadSchedules = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await api.payments.getSchedules({
        search: search || undefined,
        status: statusFilter !== 'All' ? statusFilter : undefined,
        branch: branchFilter || undefined,
      })
      setSchedules(data.schedules || [])
    } catch (err) {
      console.error('Failed to load schedules:', err)
      setError(err.message || 'Failed to fetch amortization schedules')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSchedules()
  }, [statusFilter, branchFilter])

  const filtered = useMemo(() => {
    return filterBySearch(schedules, search, ['account_no', 'customer_name', 'due_date'])
  }, [schedules, search])

  const total = filtered.length
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize)

  // Live aggregates
  const totalCount = schedules.length
  const pendingCount = schedules.filter(s => s.status === 'Pending').length
  const overdueCount = schedules.filter(s => s.status === 'Overdue').length
  const paidCount = schedules.filter(s => s.status === 'Paid').length

  return (
    <div className={embedded ? "" : "space-y-6"}>
      {!embedded && (
        <PageHeader
          title="Payment Schedules & Amortization"
          subtitle="Global schedule tracker across all customer installment"
        />
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard title="Total Schedules" value={totalCount.toString()} sub="recorded installments" icon={<FiCalendar className="w-5 h-5" />} color="blue" />
        <StatCard title="Pending Due" value={pendingCount.toString()} sub="upcoming due dates" icon={<FiClock className="w-5 h-5 text-amber-500" />} color="yellow" />
        <StatCard title="Overdue Amortization" value={overdueCount.toString()} sub="missed due dates" icon={<FiAlertTriangle className="w-5 h-5 text-rose-500" />} color="red" />
        <StatCard title="Settled Payments" value={paidCount.toString()} sub="fully paid installments" icon={<FiCheckCircle className="w-5 h-5 text-emerald-500" />} color="green" />
      </div>

      {error && <ErrorAlert message={error} onRetry={loadSchedules} />}

      {/* Filters */}
      <Card noPad className="p-3.5 border border-border">
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="w-full sm:flex-1 relative">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search account no, customer name, due date..."
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

          <div className="flex gap-2 items-center w-full sm:w-auto">
            <div className="flex bg-muted/60 border border-border rounded-xl p-0.5">
              <button 
                onClick={() => setViewMode('list')}
                className={`flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  viewMode === 'list' ? 'bg-card text-foreground shadow-2xs' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <FiList className="w-3.5 h-3.5" />
                <span>List</span>
              </button>
              <button 
                onClick={() => setViewMode('calendar')}
                className={`flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  viewMode === 'calendar' ? 'bg-card text-foreground shadow-2xs' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <FiGrid className="w-3.5 h-3.5" />
                <span>Calendar</span>
              </button>
            </div>

            <select
              value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
              className="border border-border rounded-xl px-3 py-2 text-xs font-semibold text-foreground bg-card cursor-pointer"
            >
              <option value="All">All Statuses</option>
              <option value="Pending">Pending</option>
              <option value="Overdue">Overdue</option>
              <option value="Paid">Paid</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Content */}
      <Card noPad={viewMode === 'list'} className={viewMode === 'calendar' ? 'bg-transparent shadow-none border-none p-0' : 'border border-border overflow-hidden'}>
        {loading ? (
          <TableSkeleton rows={6} cols={7} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<FiCalendar className="w-12 h-12 text-muted-foreground/30 mx-auto" />}
            title="No payment schedules found"
            description={search || statusFilter !== 'All' ? 'Try adjusting your search query or filters' : 'Schedules are automatically generated when installment sales are created'}
          />
        ) : viewMode === 'list' ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/50 text-muted-foreground uppercase font-semibold text-[11px]">
                    <th className="py-3 px-4 text-left">Account No</th>
                    <th className="py-3 px-4 text-left">Customer Name</th>
                    <th className="py-3 px-4 text-left">Installment #</th>
                    <th className="py-3 px-4 text-left">Due Date</th>
                    <th className="py-3 px-4 text-right">Amount Due</th>
                    <th className="py-3 px-4 text-right">Amount Paid</th>
                    <th className="py-3 px-4 text-right">Balance Due</th>
                    <th className="py-3 px-4 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {paginated.map((s, i) => (
                    <tr key={s.schedule_id || i} className={`hover:bg-muted/40 transition-colors ${i % 2 === 1 ? 'bg-muted/10' : ''}`}>
                      <td className="py-3 px-4 font-mono font-bold text-primary">{s.account_no}</td>
                      <td className="py-3 px-4 font-semibold text-foreground">{s.customer_name}</td>
                      <td className="py-3 px-4 font-mono text-muted-foreground">#{s.installment_no}</td>
                      <td className="py-3 px-4 font-mono">{s.due_date}</td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-foreground">{fmt(s.amount_due)}</td>
                      <td className="py-3 px-4 text-right font-mono text-emerald-600 font-semibold">{fmt(s.amount_paid)}</td>
                      <td className="py-3 px-4 text-right font-mono font-bold">
                        <span className={s.status === 'Overdue' ? 'text-rose-600 font-black' : 'text-foreground'}>
                          {fmt(s.balance_due)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center"><StatusBadge status={s.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination total={total} page={page} pageSize={pageSize} onChange={setPage} />
          </>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {Object.entries(
              filtered.reduce((acc, s) => {
                if (!acc[s.due_date]) acc[s.due_date] = [];
                acc[s.due_date].push(s);
                return acc;
              }, {})
            )
            .sort((a, b) => new Date(a[0]) - new Date(b[0]))
            .map(([date, items]) => {
              const dateObj = new Date(date);
              const isToday = new Date().toDateString() === dateObj.toDateString();
              const isPast = dateObj < new Date(new Date().setHours(0,0,0,0));
              
              return (
                <div key={date} className={`border rounded-2xl p-4 shadow-2xs ${isToday ? 'bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800' : isPast ? 'bg-rose-50/30 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900' : 'bg-card border-border'}`}>
                  <div className="flex justify-between items-center mb-3 border-b border-border/60 pb-2.5">
                    <div className="flex items-center gap-2">
                      <div className={`p-2 rounded-xl border ${isToday ? 'bg-blue-100 text-blue-700 border-blue-200' : isPast ? 'bg-rose-100 text-rose-700 border-rose-200' : 'bg-muted text-muted-foreground border-border'}`}>
                        <FiCalendar className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="font-bold text-foreground text-xs">{dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</h3>
                        {isToday && <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.2 rounded-full">TODAY</span>}
                        {isPast && !isToday && <span className="text-[10px] font-bold bg-rose-100 text-rose-700 px-1.5 py-0.2 rounded-full">PAST DUE</span>}
                      </div>
                    </div>
                    <span className="text-[11px] font-bold font-mono bg-muted text-muted-foreground px-2.5 py-0.5 rounded-full">{items.length} due</span>
                  </div>
                  
                  <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                    {items.map(s => (
                      <div key={s.schedule_id} className="bg-card border border-border rounded-xl p-3 shadow-2xs text-xs hover:border-primary/40 transition-colors">
                        <div className="flex justify-between items-start mb-1">
                          <span className="font-bold text-foreground truncate mr-2" title={s.customer_name}>{s.customer_name}</span>
                          <StatusBadge status={s.status} />
                        </div>
                        <div className="flex justify-between text-[11px] text-muted-foreground mt-1.5">
                          <span className="font-mono">{s.account_no} (Inst #{s.installment_no})</span>
                          <span className="font-mono font-bold text-primary">{fmt(s.balance_due)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}
