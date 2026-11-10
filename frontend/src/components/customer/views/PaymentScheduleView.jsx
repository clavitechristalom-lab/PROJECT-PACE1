import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
  FiCalendar, FiClock, FiCreditCard, FiAlertTriangle, FiCheckCircle,
  FiFilter, FiSearch, FiLayers, FiArrowUpRight, FiPackage, FiInfo,
  FiList, FiChevronLeft, FiChevronRight, FiGrid
} from 'react-icons/fi';
import { TbCurrencyPeso } from 'react-icons/tb';
import { api } from '../../../lib/api';
import { fmt } from '../../../lib/utils';
import { Spinner, Badge } from '../../ui';
import { useRealtimeSync, fastDeepEqual } from '../../../lib/realtimeSync';

// Safe date parser to avoid timezone shifts
const parseDueDate = (dateStr) => {
  if (!dateStr) return null;
  const parts = String(dateStr).trim().split('T')[0].split('-');
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // 0-indexed
    const day = parseInt(parts[2], 10);
    if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
      return new Date(year, month, day);
    }
  }
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const WEEK_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function PaymentScheduleView({ 
  installments: propInstallments = [], 
  onMakePayment 
}) {
  const [installments, setInstallments] = useState(propInstallments);
  const [loading, setLoading] = useState(propInstallments.length === 0);
  const [activeFilter, setActiveFilter] = useState('upcoming'); // 'all' | 'upcoming' | 'paid' | 'overdue'
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'calendar'
  const inFlightRef = useRef(false);

  const loadData = useCallback(async (silent = false, signal) => {
    if (inFlightRef.current && silent) return;
    inFlightRef.current = true;
    if (!silent && installments.length === 0) setLoading(true);

    try {
      const res = await api.customerApp.getInstallments({ signal });
      if (signal?.aborted) return;
      const nextList = res.installments || [];
      setInstallments(prev => fastDeepEqual(prev, nextList) ? prev : nextList);
    } catch (err) {
      if (err?.name !== 'AbortError') console.error('Failed to load payment schedules', err);
    } finally {
      inFlightRef.current = false;
      if (!silent) setLoading(false);
    }
  }, [installments.length]);

  useEffect(() => {
    if (propInstallments.length > 0) {
      setInstallments(propInstallments);
      setLoading(false);
    } else {
      loadData(false);
    }
  }, [propInstallments, loadData]);

  useRealtimeSync((_source, signal) => {
    loadData(true, signal);
  }, [loadData], { module: 'installments' });

  // Flatten all schedules across all customer accounts
  const allSchedules = useMemo(() => {
    return installments.flatMap(inst => {
      const list = Array.isArray(inst.paymentSchedules) ? inst.paymentSchedules : [];
      
      // Fallback: If no explicit paymentSchedules array is returned, synthesize from installment metadata
      if (list.length === 0 && Number(inst.balance) > 0) {
        return [{
          schedule_id: `fallback-${inst.installment_id}`,
          installment_id: inst.installment_id,
          account_no: inst.account_no,
          product: inst.product,
          due_date: inst.next_due_date || 'Upcoming',
          balance_due: Number(inst.monthly_payment || inst.balance),
          amount_due: Number(inst.monthly_payment || inst.balance),
          status: inst.status === 'Overdue' ? 'Overdue' : 'Pending',
          installment_number: 1,
          total_installments: 6,
          installmentRef: inst,
        }];
      }

      return list.map((s, idx) => ({
        ...s,
        product: inst.product,
        account_no: inst.account_no,
        installmentRef: inst,
        schedule_id: s.schedule_id || `${inst.installment_id}-${idx}`,
        installment_number: s.installment_number || idx + 1,
        total_installments: s.total_installments || list.length || 6,
      }));
    }).sort((a, b) => {
      const dateA = parseDueDate(a.due_date)?.getTime() || 0;
      const dateB = parseDueDate(b.due_date)?.getTime() || 0;
      return dateA - dateB;
    });
  }, [installments]);

  // Derived metrics
  const pendingSchedules = useMemo(() => {
    return allSchedules.filter(s => 
      s.status !== 'Paid' && s.status !== 'Completed' && Number(s.balance_due ?? s.amount_due ?? 0) > 0
    );
  }, [allSchedules]);

  const overdueSchedules = useMemo(() => {
    return allSchedules.filter(s => {
      const isPaid = s.status === 'Paid' || s.status === 'Completed' || Number(s.balance_due ?? s.amount_due ?? 0) <= 0;
      const parsedDate = parseDueDate(s.due_date);
      return s.status === 'Overdue' || (!isPaid && parsedDate && parsedDate < new Date());
    });
  }, [allSchedules]);

  const paidSchedules = useMemo(() => {
    return allSchedules.filter(s => 
      s.status === 'Paid' || s.status === 'Completed' || Number(s.balance_due ?? s.amount_due ?? 0) <= 0
    );
  }, [allSchedules]);

  const nextDueItem = pendingSchedules[0] || null;
  const totalUpcomingDue = pendingSchedules.reduce((sum, s) => sum + Number(s.balance_due ?? s.amount_due ?? 0), 0);

  // Calendar navigation state
  const initialCalendarDate = useMemo(() => {
    if (nextDueItem?.due_date) {
      const parsed = parseDueDate(nextDueItem.due_date);
      if (parsed) return new Date(parsed.getFullYear(), parsed.getMonth(), 1);
    }
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  }, [nextDueItem]);

  const [calDate, setCalDate] = useState(initialCalendarDate);
  const [selectedCalDay, setSelectedCalDay] = useState(null);

  // Update calendar month if initialCalendarDate resolves from newly loaded data
  useEffect(() => {
    if (nextDueItem?.due_date) {
      const parsed = parseDueDate(nextDueItem.due_date);
      if (parsed) {
        setCalDate(new Date(parsed.getFullYear(), parsed.getMonth(), 1));
      }
    }
  }, [nextDueItem?.due_date]);

  const calYear = calDate.getFullYear();
  const calMonth = calDate.getMonth();

  const handlePrevMonth = () => {
    setCalDate(new Date(calYear, calMonth - 1, 1));
    setSelectedCalDay(null);
  };

  const handleNextMonth = () => {
    setCalDate(new Date(calYear, calMonth + 1, 1));
    setSelectedCalDay(null);
  };

  const handleJumpToToday = () => {
    const today = new Date();
    setCalDate(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelectedCalDay(today.getDate());
  };

  const handleJumpToNextDue = () => {
    if (nextDueItem?.due_date) {
      const parsed = parseDueDate(nextDueItem.due_date);
      if (parsed) {
        setCalDate(new Date(parsed.getFullYear(), parsed.getMonth(), 1));
        setSelectedCalDay(parsed.getDate());
      }
    }
  };

  // Calendar days grid computation
  const { calendarDays, duesByDay, monthSchedules } = useMemo(() => {
    const firstDayIndex = new Date(calYear, calMonth, 1).getDay(); // 0 = Sun
    const totalDaysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const prevMonthDaysCount = new Date(calYear, calMonth, 0).getDate();

    // Map dues to day numbers in the active month
    const duesMap = new Map();
    const inMonthList = [];

    allSchedules.forEach(schedule => {
      const parsed = parseDueDate(schedule.due_date);
      if (parsed && parsed.getFullYear() === calYear && parsed.getMonth() === calMonth) {
        const day = parsed.getDate();
        if (!duesMap.has(day)) duesMap.set(day, []);
        duesMap.get(day).push(schedule);
        inMonthList.push(schedule);
      }
    });

    const days = [];

    // Prev month padding
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      days.push({
        dayNumber: prevMonthDaysCount - i,
        isCurrentMonth: false,
        dateKey: `prev-${prevMonthDaysCount - i}`,
        dues: [],
      });
    }

    // Current month days
    for (let day = 1; day <= totalDaysInMonth; day++) {
      days.push({
        dayNumber: day,
        isCurrentMonth: true,
        dateKey: `curr-${day}`,
        dues: duesMap.get(day) || [],
      });
    }

    // Next month padding to reach full 35 or 42 grid cells
    const remaining = (7 - (days.length % 7)) % 7;
    for (let i = 1; i <= remaining; i++) {
      days.push({
        dayNumber: i,
        isCurrentMonth: false,
        dateKey: `next-${i}`,
        dues: [],
      });
    }

    return {
      calendarDays: days,
      duesByDay: duesMap,
      monthSchedules: inMonthList,
    };
  }, [allSchedules, calYear, calMonth]);

  // Selected day dues
  const activeDayDues = useMemo(() => {
    if (selectedCalDay && duesByDay.has(selectedCalDay)) {
      return duesByDay.get(selectedCalDay);
    }
    return monthSchedules;
  }, [selectedCalDay, duesByDay, monthSchedules]);

  // Filter schedules for List View
  const filteredSchedules = useMemo(() => {
    return allSchedules.filter(s => {
      const isPaid = s.status === 'Paid' || s.status === 'Completed' || Number(s.balance_due ?? s.amount_due ?? 0) <= 0;
      const parsedDate = parseDueDate(s.due_date);
      const isOverdue = s.status === 'Overdue' || (!isPaid && parsedDate && parsedDate < new Date());

      if (activeFilter === 'upcoming') {
        if (isPaid) return false;
      } else if (activeFilter === 'paid') {
        if (!isPaid) return false;
      } else if (activeFilter === 'overdue') {
        if (!isOverdue) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchProduct = (s.product || '').toLowerCase().includes(q);
        const matchAcct = (s.account_no || '').toLowerCase().includes(q);
        const matchDate = (s.due_date || '').toLowerCase().includes(q);
        if (!matchProduct && !matchAcct && !matchDate) return false;
      }

      return true;
    });
  }, [allSchedules, activeFilter, searchQuery]);

  return (
    <div className="space-y-6 animate-[fadeIn_0.25s_ease]">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-rose-800 dark:text-rose-300 bg-[#F8D7E3]/70 dark:bg-pink-950/60 px-3 py-1 rounded-full border border-pink-500/20">
              Payment Schedule
            </span>
            <span className="text-xs text-muted-foreground font-semibold">
              {pendingSchedules.length} Scheduled Due{pendingSchedules.length !== 1 ? 's' : ''}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">
            Amortization & Due Calendar
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Review detailed monthly payment milestones, due dates, and settlement status for each installment agreement.
          </p>
        </div>

        {/* Search */}
        <div className="relative w-full md:w-72">
          <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
          <input
            type="text"
            placeholder="Search schedule or date..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-xs sm:text-sm rounded-2xl bg-card border border-border/80 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-rose-500/30 transition-all shadow-xs"
          />
        </div>
      </div>

      {/* Bento Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Next Due Date */}
        <div className="bg-[#F8D7E3]/50 dark:bg-[#2c1c24] border border-[#F1B9CD]/60 dark:border-pink-800/40 rounded-[2.5rem] p-5 shadow-xs transition-all hover:scale-[1.01]">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-2xl bg-white/80 dark:bg-white/10 flex items-center justify-center text-rose-800 dark:text-rose-300 font-bold shadow-xs">
              <FiCalendar className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-rose-800/10 text-rose-900 dark:text-rose-200">
              Earliest Due
            </span>
          </div>
          <p className="text-xs font-semibold text-rose-950/70 dark:text-rose-300/70">Next Due Date</p>
          <p className="text-xl sm:text-2xl font-black text-rose-950 dark:text-rose-100 mt-0.5 truncate">
            {nextDueItem?.due_date || 'No Pending Dues'}
          </p>
          <p className="text-[11px] text-rose-900/60 dark:text-rose-400/60 mt-1 truncate">
            {nextDueItem ? `${nextDueItem.product} (${nextDueItem.account_no})` : 'All caught up!'}
          </p>
        </div>

        {/* Card 2: Next Due Amount */}
        <div className="bg-[#FBE8B5]/50 dark:bg-[#2b2718] border border-[#ECD18C]/60 dark:border-amber-800/40 rounded-[2.5rem] p-5 shadow-xs transition-all hover:scale-[1.01]">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-2xl bg-white/80 dark:bg-white/10 flex items-center justify-center text-amber-800 dark:text-amber-300 font-bold shadow-xs">
              <TbCurrencyPeso className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-800/10 text-amber-900 dark:text-amber-200">
              Immediate Due
            </span>
          </div>
          <p className="text-xs font-semibold text-amber-950/70 dark:text-amber-300/70">Next Payment Amount</p>
          <p className="text-2xl sm:text-3xl font-black text-amber-950 dark:text-amber-100 mt-0.5 truncate">
            {fmt(nextDueItem?.balance_due ?? nextDueItem?.amount_due ?? 0)}
          </p>
          <p className="text-[11px] text-amber-900/60 dark:text-amber-400/60 mt-1">
            Exact upcoming amortization
          </p>
        </div>

        {/* Card 3: Total Upcoming Dues */}
        <div className="bg-[#D1E8E2]/50 dark:bg-[#162a26] border border-[#B0DDD3]/60 dark:border-teal-800/40 rounded-[2.5rem] p-5 shadow-xs transition-all hover:scale-[1.01]">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-2xl bg-white/80 dark:bg-white/10 flex items-center justify-center text-teal-800 dark:text-teal-300 font-bold shadow-xs">
              <FiClock className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-teal-800/10 text-teal-900 dark:text-teal-200">
              Future Total
            </span>
          </div>
          <p className="text-xs font-semibold text-teal-950/70 dark:text-teal-300/70">Remaining Dues</p>
          <p className="text-2xl sm:text-3xl font-black text-teal-950 dark:text-teal-100 mt-0.5 truncate">
            {fmt(totalUpcomingDue)}
          </p>
          <p className="text-[11px] text-teal-900/60 dark:text-teal-400/60 mt-1">
            {pendingSchedules.length} pending installment cycles
          </p>
        </div>

        {/* Card 4: Settled Milestones */}
        <div className="bg-[#E2D6F5]/50 dark:bg-[#221c2e] border border-[#CAB8E8]/60 dark:border-purple-800/40 rounded-[2.5rem] p-5 shadow-xs transition-all hover:scale-[1.01]">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-2xl bg-white/80 dark:bg-white/10 flex items-center justify-center text-purple-800 dark:text-purple-300 font-bold shadow-xs">
              <FiCheckCircle className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-purple-800/10 text-purple-900 dark:text-purple-200">
              Settled
            </span>
          </div>
          <p className="text-xs font-semibold text-purple-950/70 dark:text-purple-300/70">Completed Dues</p>
          <p className="text-2xl sm:text-3xl font-black text-purple-950 dark:text-purple-100 mt-0.5">
            {paidSchedules.length}
          </p>
          <p className="text-[11px] text-purple-900/60 dark:text-purple-400/60 mt-1">
            Paid monthly amortization cycles
          </p>
        </div>
      </div>

      {/* Control Bar: Filter Tabs on Left, View Toggle (List | Calendar) on Right */}
      <div className="flex items-center justify-between flex-wrap gap-3 pb-1 border-b border-border/80">
        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-muted/60 border border-border/70">
          {[
            { id: 'upcoming', label: 'Upcoming Dues', count: pendingSchedules.length },
            { id: 'all', label: 'All Milestones', count: allSchedules.length },
            { id: 'paid', label: 'Settled / Paid', count: paidSchedules.length },
            { id: 'overdue', label: 'Overdue Attention', count: overdueSchedules.length },
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveFilter(tab.id)}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer ${
                activeFilter === tab.id
                  ? 'bg-card text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <span>{tab.label}</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                activeFilter === tab.id
                  ? 'bg-rose-600 text-white'
                  : tab.id === 'overdue' && tab.count > 0
                  ? 'bg-rose-500 text-white'
                  : 'bg-muted-foreground/20 text-muted-foreground'
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* View Mode Toggle: [ :≡ List ]  [ ⊞ Calendar ] */}
        <div className="flex items-center gap-1 p-1 rounded-2xl bg-muted/60 border border-border/70">
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={`px-4 py-1.5 text-xs font-bold rounded-xl transition-all flex items-center gap-2 cursor-pointer ${
              viewMode === 'list'
                ? 'bg-card text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <FiList className={`w-4 h-4 ${viewMode === 'list' ? 'text-rose-600 dark:text-rose-400' : ''}`} />
            <span>List</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode('calendar')}
            className={`px-4 py-1.5 text-xs font-bold rounded-xl transition-all flex items-center gap-2 cursor-pointer ${
              viewMode === 'calendar'
                ? 'bg-card text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <FiCalendar className={`w-4 h-4 ${viewMode === 'calendar' ? 'text-rose-600 dark:text-rose-400' : ''}`} />
            <span>Calendar</span>
          </button>
        </div>
      </div>

      {/* Main Content Area: Loading or View Selection */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-3">
          <Spinner className="w-8 h-8 text-rose-600" />
          <p className="text-xs text-muted-foreground font-semibold">Loading payment schedules...</p>
        </div>
      ) : viewMode === 'calendar' ? (
        /* ======================================================== */
        /* CALENDAR VIEW                                            */
        /* ======================================================== */
        <div className="space-y-6">
          <div className="bg-card border border-border/80 rounded-[2.5rem] p-6 sm:p-7 shadow-xs space-y-6">
            
            {/* Calendar Controls & Month Title */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-[#F8D7E3]/70 dark:bg-pink-950/50 text-rose-700 dark:text-rose-300 flex items-center justify-center font-bold shrink-0 shadow-xs">
                  <FiCalendar className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl sm:text-2xl font-black text-foreground tracking-tight">
                    {MONTH_NAMES[calMonth]} {calYear}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {monthSchedules.length} Due Milestone{monthSchedules.length !== 1 ? 's' : ''} in this month
                  </p>
                </div>
              </div>

              {/* Navigation Arrows & Quick Jump Buttons */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  className="p-2 rounded-xl bg-muted/70 hover:bg-muted text-foreground transition-all cursor-pointer border border-border/60 hover:scale-105"
                  title="Previous Month"
                >
                  <FiChevronLeft className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={handleJumpToToday}
                  className="px-3.5 py-2 rounded-xl bg-muted/70 hover:bg-muted text-xs font-bold text-foreground transition-all cursor-pointer border border-border/60"
                >
                  Today
                </button>

                {nextDueItem?.due_date && (
                  <button
                    type="button"
                    onClick={handleJumpToNextDue}
                    className="px-3.5 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-700 dark:text-rose-300 text-xs font-bold transition-all cursor-pointer border border-rose-500/30"
                  >
                    Next Due
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleNextMonth}
                  className="p-2 rounded-xl bg-muted/70 hover:bg-muted text-foreground transition-all cursor-pointer border border-border/60 hover:scale-105"
                  title="Next Month"
                >
                  <FiChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Calendar Grid */}
            <div className="overflow-x-auto">
              <div className="min-w-[640px]">
                {/* Weekday Headers */}
                <div className="grid grid-cols-7 gap-2 mb-2">
                  {WEEK_DAYS.map((d, idx) => (
                    <div 
                      key={d} 
                      className={`text-center py-2 text-xs font-extrabold uppercase tracking-wider ${
                        idx === 0 || idx === 6 
                          ? 'text-rose-600 dark:text-rose-400' 
                          : 'text-muted-foreground'
                      }`}
                    >
                      {d}
                    </div>
                  ))}
                </div>

                {/* Days Cells */}
                <div className="grid grid-cols-7 gap-2">
                  {calendarDays.map((cell) => {
                    const hasDues = cell.dues.length > 0;
                    const isToday = cell.isCurrentMonth && 
                      new Date().getFullYear() === calYear && 
                      new Date().getMonth() === calMonth && 
                      new Date().getDate() === cell.dayNumber;
                    const isSelected = cell.isCurrentMonth && selectedCalDay === cell.dayNumber;

                    return (
                      <div
                        key={cell.dateKey}
                        onClick={() => {
                          if (cell.isCurrentMonth) {
                            setSelectedCalDay(prev => prev === cell.dayNumber ? null : cell.dayNumber);
                          }
                        }}
                        className={`min-h-[92px] sm:min-h-[105px] p-2.5 rounded-2xl border transition-all flex flex-col justify-between cursor-pointer ${
                          !cell.isCurrentMonth
                            ? 'bg-muted/10 border-transparent text-muted-foreground/30 opacity-40 cursor-default'
                            : isSelected
                            ? 'bg-rose-500/10 dark:bg-rose-950/40 border-rose-500 ring-2 ring-rose-500/30'
                            : hasDues
                            ? 'bg-card hover:bg-rose-50/40 dark:hover:bg-rose-950/20 border-rose-200 dark:border-rose-900/60 shadow-2xs'
                            : 'bg-card hover:bg-muted/30 border-border/60'
                        }`}
                      >
                        {/* Day number & indicators */}
                        <div className="flex items-center justify-between">
                          <span className={`text-xs font-black ${
                            isToday
                              ? 'w-6 h-6 rounded-full bg-rose-600 text-white flex items-center justify-center font-bold text-[11px] shadow-xs'
                              : isSelected
                              ? 'text-rose-600 dark:text-rose-400 font-extrabold'
                              : cell.isCurrentMonth
                              ? 'text-foreground'
                              : 'text-muted-foreground'
                          }`}>
                            {cell.dayNumber}
                          </span>

                          {hasDues && (
                            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                          )}
                        </div>

                        {/* Dues Cards inside cell */}
                        <div className="space-y-1 mt-1">
                          {cell.dues.slice(0, 2).map((due, dIdx) => {
                            const isPaid = due.status === 'Paid' || due.status === 'Completed' || Number(due.balance_due ?? due.amount_due ?? 0) <= 0;
                            const isOverdue = due.status === 'Overdue';
                            const dueAmt = Number(due.balance_due ?? due.amount_due ?? due.amount ?? 0);

                            return (
                              <div
                                key={due.schedule_id || dIdx}
                                className={`px-1.5 py-1 rounded-lg text-[10px] font-bold truncate flex items-center justify-between border ${
                                  isPaid
                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200 border-emerald-300 dark:border-emerald-800'
                                    : isOverdue
                                    ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-200 border-rose-300 dark:border-rose-800'
                                    : 'bg-[#F8D7E3]/80 text-rose-950 dark:bg-pink-950/70 dark:text-pink-100 border-rose-300/80 dark:border-pink-800'
                                }`}
                                title={`${due.product} - ${fmt(dueAmt)}`}
                              >
                                <span className="truncate">{due.product || 'Due'}</span>
                                <span className="font-mono ml-1">{fmt(dueAmt)}</span>
                              </div>
                            );
                          })}

                          {cell.dues.length > 2 && (
                            <p className="text-[9px] font-bold text-rose-600 text-center">
                              +{cell.dues.length - 2} more
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Calendar Legend */}
            <div className="flex items-center justify-between flex-wrap gap-4 pt-3 border-t border-border/70 text-xs text-muted-foreground">
              <div className="flex items-center gap-4 flex-wrap">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                  <span>Scheduled / Upcoming Due</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <span>Settled / Paid Milestone</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                  <span>Overdue Attention</span>
                </span>
              </div>

              <div className="font-semibold text-foreground">
                Total Due in {MONTH_NAMES[calMonth]}:{' '}
                <strong className="text-rose-600 dark:text-rose-400 font-mono font-bold">
                  {fmt(monthSchedules.reduce((sum, s) => sum + Number(s.balance_due ?? s.amount_due ?? 0), 0))}
                </strong>
              </div>
            </div>

          </div>

          {/* Selected Day / Active Month Schedule Cards Detail */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-extrabold text-foreground flex items-center gap-2">
                <FiClock className="w-4 h-4 text-rose-600" />
                {selectedCalDay 
                  ? `Dues for ${MONTH_NAMES[calMonth]} ${selectedCalDay}, ${calYear}`
                  : `All Scheduled Milestones for ${MONTH_NAMES[calMonth]} ${calYear}`}
              </h4>

              {selectedCalDay && (
                <button
                  type="button"
                  onClick={() => setSelectedCalDay(null)}
                  className="text-xs text-rose-600 hover:underline font-semibold cursor-pointer"
                >
                  Show Full Month
                </button>
              )}
            </div>

            {activeDayDues.length === 0 ? (
              <div className="py-12 text-center rounded-[2rem] border border-dashed border-border p-6 bg-card space-y-2">
                <FiCalendar className="w-8 h-8 text-muted-foreground/40 mx-auto" />
                <p className="text-xs text-muted-foreground font-semibold">
                  {selectedCalDay 
                    ? `No payment dues scheduled on ${MONTH_NAMES[calMonth]} ${selectedCalDay}, ${calYear}.`
                    : `No payment milestones scheduled in ${MONTH_NAMES[calMonth]} ${calYear}.`}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {activeDayDues.map((schedule, idx) => {
                  const isPaid = schedule.status === 'Paid' || schedule.status === 'Completed' || Number(schedule.balance_due ?? schedule.amount_due ?? 0) <= 0;
                  const isOverdue = schedule.status === 'Overdue';
                  const dueAmt = Number(schedule.balance_due ?? schedule.amount_due ?? schedule.amount ?? 0);

                  return (
                    <div
                      key={schedule.schedule_id || idx}
                      className="bg-card border border-border/80 rounded-[2rem] p-5 shadow-xs hover:border-rose-400/40 hover:shadow-sm transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      {/* Left info */}
                      <div className="flex items-center gap-3.5">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-bold shrink-0 ${
                          isPaid
                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                            : isOverdue
                            ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                            : 'bg-[#FBE8B5]/70 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300'
                        }`}>
                          <FiCalendar className="w-6 h-6" />
                        </div>

                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-extrabold text-sm text-foreground">{schedule.product}</h4>
                            <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-md bg-muted text-muted-foreground border border-border">
                              {schedule.account_no}
                            </span>
                            {schedule.installment_number && (
                              <span className="text-[10px] font-semibold text-muted-foreground">
                                Installment #{schedule.installment_number} of {schedule.total_installments}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                            <span className="flex items-center gap-1 font-semibold text-foreground">
                              <FiClock className="w-3.5 h-3.5 text-muted-foreground" />
                              Due Date: <strong className="text-foreground">{schedule.due_date || 'N/A'}</strong>
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Right actions */}
                      <div className="flex items-center justify-between sm:justify-end gap-4 border-t sm:border-t-0 pt-3 sm:pt-0 border-border/60">
                        <div className="text-left sm:text-right">
                          <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Amount Due</p>
                          <p className={`font-mono font-extrabold text-base ${isPaid ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                            {fmt(dueAmt)}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                            isPaid
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-500/20'
                              : isOverdue
                              ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300 border border-rose-500/20'
                              : 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-500/20'
                          }`}>
                            {isPaid ? 'Settled' : isOverdue ? 'Overdue' : 'Pending'}
                          </span>

                          {!isPaid && onMakePayment && (
                            <button
                              type="button"
                              onClick={() => onMakePayment(schedule.installmentRef || {
                                installment_id: schedule.installment_id,
                                account_no: schedule.account_no,
                                product: schedule.product,
                                monthly_payment: dueAmt,
                                balance: dueAmt
                              })}
                              className="px-4 py-2 rounded-xl bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-700 hover:to-pink-700 text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs hover:scale-105"
                            >
                              <FiCreditCard className="w-3.5 h-3.5" />
                              <span>Pay Due</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ======================================================== */
        /* LIST VIEW                                                */
        /* ======================================================== */
        filteredSchedules.length === 0 ? (
          <div className="py-16 text-center rounded-[2.5rem] border border-dashed border-border p-8 bg-card space-y-3">
            <div className="w-14 h-14 rounded-3xl bg-muted flex items-center justify-center mx-auto text-muted-foreground">
              <FiCalendar className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-foreground">No Schedules Found</h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              {activeFilter === 'upcoming' 
                ? 'Great news! You have no upcoming dues scheduled at this moment.'
                : `No payment milestones found under the "${activeFilter}" filter.`}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredSchedules.map((schedule, idx) => {
              const isPaid = schedule.status === 'Paid' || schedule.status === 'Completed' || Number(schedule.balance_due ?? schedule.amount_due ?? 0) <= 0;
              const parsedDate = parseDueDate(schedule.due_date);
              const isOverdue = schedule.status === 'Overdue' || (!isPaid && parsedDate && parsedDate < new Date());
              const dueAmt = Number(schedule.balance_due ?? schedule.amount_due ?? schedule.amount ?? 0);

              return (
                <div
                  key={schedule.schedule_id || idx}
                  className="bg-card border border-border/80 rounded-[2rem] p-5 shadow-xs hover:border-rose-400/40 hover:shadow-sm transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  {/* Left product info */}
                  <div className="flex items-center gap-3.5">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-bold shrink-0 ${
                      isPaid
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                        : isOverdue
                        ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                        : 'bg-[#FBE8B5]/70 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300'
                    }`}>
                      <FiCalendar className="w-6 h-6" />
                    </div>

                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-extrabold text-sm text-foreground">{schedule.product}</h4>
                        <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-md bg-muted text-muted-foreground border border-border">
                          {schedule.account_no}
                        </span>
                        {schedule.installment_number && (
                          <span className="text-[10px] font-semibold text-muted-foreground">
                            Installment #{schedule.installment_number}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                        <span className="flex items-center gap-1 font-semibold text-foreground">
                          <FiClock className="w-3.5 h-3.5 text-muted-foreground" />
                          Due Date: <strong className="text-foreground">{schedule.due_date || 'N/A'}</strong>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right financial & actions */}
                  <div className="flex items-center justify-between sm:justify-end gap-4 border-t sm:border-t-0 pt-3 sm:pt-0 border-border/60">
                    <div className="text-left sm:text-right">
                      <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Amount Due</p>
                      <p className={`font-mono font-extrabold text-base ${isPaid ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                        {fmt(dueAmt)}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                        isPaid
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-500/20'
                          : isOverdue
                          ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300 border border-rose-500/20'
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-500/20'
                      }`}>
                        {isPaid ? 'Settled' : isOverdue ? 'Overdue' : 'Pending'}
                      </span>

                      {!isPaid && onMakePayment && (
                        <button
                          type="button"
                          onClick={() => onMakePayment(schedule.installmentRef || {
                            installment_id: schedule.installment_id,
                            account_no: schedule.account_no,
                            product: schedule.product,
                            monthly_payment: dueAmt,
                            balance: dueAmt
                          })}
                          className="px-4 py-2 rounded-xl bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-700 hover:to-pink-700 text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs hover:scale-105"
                        >
                          <FiCreditCard className="w-3.5 h-3.5" />
                          <span>Pay Due</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}
