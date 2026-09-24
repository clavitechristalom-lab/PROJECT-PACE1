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
import { useRealtimeSync } from '../lib/realtimeSync'
import { TbCurrencyPeso } from 'react-icons/tb'
import { InstallmentAccountDetailsModal } from '../components/customer/CustomerModals'

export default function PaymentSchedulePage({ branchFilter: propBranchFilter, embedded }) {
  const [schedules, setSchedules] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [viewMode, setViewMode] = useState('list')
  const [page, setPage] = useState(1)
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [initialMonthSet, setInitialMonthSet] = useState(false)
  const [selectedInstallmentId, setSelectedInstallmentId] = useState(null)
  const pageSize = 12

  const tDate = new Date();
  const localTodayStr = `${tDate.getFullYear()}-${String(tDate.getMonth() + 1).padStart(2, '0')}-${String(tDate.getDate()).padStart(2, '0')}`


  const [localBranchFilter, setLocalBranchFilter] = useState('All')
  const branchFilter = propBranchFilter || localBranchFilter

  const loadSchedules = async (silent = false) => {
    if (!silent) setLoading(true)
    if (!silent) setError('')
    try {
      const data = await api.payments.getSchedules({
        search: search || undefined,
        status: statusFilter !== 'All' ? statusFilter : undefined,
        branch: branchFilter || undefined,
      })
      const fetched = data.schedules || []
      setSchedules(fetched)

      if (!initialMonthSet && fetched.length > 0) {
        const upcoming = fetched.filter(s => s.status !== 'Paid').sort((a,b) => new Date(a.due_date) - new Date(b.due_date))
        if (upcoming.length > 0) {
          const d = new Date(upcoming[0].due_date)
          setCurrentMonth(new Date(d.getFullYear(), d.getMonth(), 1))
        }
        setInitialMonthSet(true)
      }
    } catch (err) {
      console.error('Failed to load schedules:', err)
      if (!silent) setError(err.message || 'Failed to fetch amortization schedules')
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    loadSchedules()
  }, [statusFilter, branchFilter])

  useRealtimeSync(() => {
    loadSchedules(true)
  }, [statusFilter, branchFilter, search])

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
          <div className="flex flex-col h-full bg-card">
            {/* Calendar Header */}
            <div className="flex justify-between items-center p-4 border-b border-border">
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                <FiCalendar className="text-primary" />
                {currentMonth.toLocaleDateString('default', { month: 'long', year: 'numeric' })}
              </h2>
              <div className="flex gap-2">
                <button 
                  onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}
                  className="px-3 py-1.5 border border-border rounded-lg text-xs font-bold hover:bg-muted cursor-pointer text-foreground"
                >
                  Prev
                </button>
                <button 
                  onClick={() => setCurrentMonth(new Date())}
                  className="px-3 py-1.5 border border-border rounded-lg text-xs font-bold hover:bg-muted cursor-pointer text-foreground"
                >
                  Today
                </button>
                <button 
                  onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}
                  className="px-3 py-1.5 border border-border rounded-lg text-xs font-bold hover:bg-muted cursor-pointer text-foreground"
                >
                  Next
                </button>
              </div>
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-7 border-b border-border bg-muted/30">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div key={day} className="py-2 text-center text-xs font-bold text-muted-foreground uppercase tracking-wider border-r border-border last:border-0">
                  {day}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 flex-1 auto-rows-fr">
              {(() => {
                const year = currentMonth.getFullYear()
                const month = currentMonth.getMonth()
                const firstDay = new Date(year, month, 1).getDay()
                const daysInMonth = new Date(year, month + 1, 0).getDate()
                
                const days = []
                for (let i = 0; i < firstDay; i++) days.push(null)
                for (let i = 1; i <= daysInMonth; i++) days.push(new Date(year, month, i))
                while (days.length % 7 !== 0) days.push(null)

                const schedulesByDate = filtered.reduce((acc, s) => {
                  if (!acc[s.due_date]) acc[s.due_date] = [];
                  acc[s.due_date].push(s);
                  return acc;
                }, {})

                return days.map((dateObj, i) => {
                  if (!dateObj) {
                    return <div key={`empty-${i}`} className="min-h-[120px] p-2 border-r border-b border-border bg-muted/10 last:border-r-0"></div>
                  }
                  
                  const dy = String(dateObj.getDate()).padStart(2, '0');
                  const dm = String(dateObj.getMonth() + 1).padStart(2, '0');
                  const dyY = dateObj.getFullYear();
                  const dateStr = `${dyY}-${dm}-${dy}`;
                  const isToday = dateStr === localTodayStr
                  const daySchedules = schedulesByDate[dateStr] || []
                  
                  return (
                    <div key={dateStr} className={`min-h-[120px] p-2 border-r border-b border-border last:border-r-0 ${isToday ? 'bg-primary/5' : 'bg-card'}`}>
                      <div className="flex justify-between items-start mb-2">
                        <span className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full ${isToday ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>
                          {dateObj.getDate()}
                        </span>
                        {daySchedules.length > 0 && (
                          <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded-full text-foreground font-semibold">
                            {daySchedules.length}
                          </span>
                        )}
                      </div>
                      
                      <div className="space-y-1.5 overflow-y-auto max-h-[100px] no-scrollbar">
                        {daySchedules.map(s => {
                          let bgColor = 'bg-slate-100 dark:bg-slate-800 border-slate-200'
                          if (s.status === 'Paid') bgColor = 'bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-300 dark:border-emerald-800/50'
                          else if (s.status === 'Overdue') bgColor = 'bg-rose-50 border-rose-200 dark:bg-rose-900/20 text-rose-800 dark:text-rose-300 dark:border-rose-800/50'
                          else bgColor = 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 dark:border-blue-800/50'

                          return (
                            <div key={s.schedule_id} onClick={() => setSelectedInstallmentId(s.installment_id)} className={`p-2 rounded-lg border text-[10px] leading-tight cursor-pointer hover:shadow-md transition-all ${bgColor}`} title={`${s.customer_name} - ${fmt(s.balance_due)}`}>
                              <div className="opacity-70 mb-0.5 text-[9px] uppercase tracking-wide">Acc: {s.account_no}</div>
                              <div className="font-bold truncate text-[11px] mb-1">{s.customer_name}</div>
                              <div className="flex justify-between items-center mt-1 pt-1 border-t border-black/5 dark:border-white/10">
                                <span className="opacity-80">Inst #{s.installment_no}</span>
                                <span className="font-mono font-bold">{fmt(s.balance_due)}</span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })
              })()}
            </div>
          </div>
        )}
      </Card>

      <InstallmentAccountDetailsModal
        isOpen={!!selectedInstallmentId}
        onClose={() => setSelectedInstallmentId(null)}
        installmentId={selectedInstallmentId}
      />
    </div>
  )
}
