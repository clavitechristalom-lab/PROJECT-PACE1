import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { fmt } from '../lib/utils';
import { 
  FiPackage, FiCreditCard, FiAlertCircle, FiTrendingUp, 
  FiUser, FiGitBranch, FiArrowUpRight, FiCheckCircle, 
  FiCalendar, FiClock, FiShield, FiFileText, FiPlusCircle,
  FiShoppingBag, FiHeart, FiBookmark, FiTv, FiPhoneCall,
  FiMapPin, FiChevronLeft, FiChevronRight, FiLayers
} from 'react-icons/fi';
import { TbCurrencyPeso } from 'react-icons/tb';
import { BiWallet } from 'react-icons/bi';
import { Spinner, Badge, showToast } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useRealtimeSync, triggerDataSync } from '../lib/realtimeSync';

import InstallmentLedger from '../components/customer/InstallmentLedger';
import QuickActions from '../components/customer/QuickActions';
import ImageCarousel from '../components/customer/ImageCarousel';
import {
  ProductListModal, PaymentDetailsModal, CreditDetailsModal,
  OverduePaymentsModal, InstallmentAccountDetailsModal,
  StatementModal, SupportModal, InstallmentsModal
} from '../components/customer/CustomerModals';
import DepositModal from '../components/customer/DepositModal';

import StoreCatalogView from '../components/customer/views/StoreCatalogView';
import InstallmentsView from '../components/customer/views/InstallmentsView';
import PaymentScheduleView from '../components/customer/views/PaymentScheduleView';
import StatementsView from '../components/customer/views/StatementsView';
import CustomerSupportView from '../components/customer/views/CustomerSupportView';

export default function CustomerDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [stats, setStats] = useState(() => {
    try {
      const saved = sessionStorage.getItem('pace_cached_cust_stats');
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });

  const [installments, setInstallments] = useState(() => {
    try {
      const saved = sessionStorage.getItem('pace_cached_cust_inst');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  const [loading, setLoading] = useState(() => {
    return !sessionStorage.getItem('pace_cached_cust_stats');
  });

  // Modals state
  const [activeModal, setActiveModal] = useState(null);
  const [modalArgs, setModalArgs] = useState(null);

  const openModal = (type, args = null) => {
    setActiveModal(type);
    setModalArgs(args);
  };

  const closeModal = () => {
    setActiveModal(null);
    setModalArgs(null);
  };

  const fetchDashboardData = async (source) => {
    const isBg = source === 'timer' || source === 'database' || source === 'event' || source === 'focus' || source === 'mutation' || source === 'sync' || !!stats;
    try {
      if (!isBg) setLoading(true);
      const [dashResult, instResult] = await Promise.allSettled([
        api.customerApp.getDashboard(),
        api.customerApp.getInstallments()
      ]);
      if (dashResult.status === 'fulfilled' && dashResult.value?.metrics) {
        setStats(dashResult.value.metrics);
        try { sessionStorage.setItem('pace_cached_cust_stats', JSON.stringify(dashResult.value.metrics)); } catch(e){}
      }
      if (instResult.status === 'fulfilled' && instResult.value?.installments) {
        setInstallments(instResult.value.installments);
        try { sessionStorage.setItem('pace_cached_cust_inst', JSON.stringify(instResult.value.installments)); } catch(e){}
      }
    } catch (error) {
      if (!isBg) console.error('Failed to load dashboard', error);
    } finally {
      if (!isBg) setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData('initial');
  }, []);

  // Return to main dashboard on browser refresh/reload as requested
  useEffect(() => {
    try {
      const navEntries = performance.getEntriesByType?.('navigation');
      const isReload = (navEntries && navEntries[0]?.type === 'reload') || (window.performance?.navigation?.type === 1);
      if (isReload && searchParams.get('tab')) {
        navigate('/customer/dashboard', { replace: true });
      }
    } catch (_) {}
  }, []);

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'pay') {
      handleOpenPayment();
    }
  }, [searchParams]);

  useRealtimeSync(fetchDashboardData, [], { module: 'customers' });

  const handleViewLedger = (installment) => {
    openModal('installmentAccount', installment.installment_id);
  };

  const handleOpenPayment = (installment = null) => {
    const target = installment || installments.find(i => Number(i.balance) > 0) || installments[0] || null;
    openModal('makePayment', {
      installmentId: target?.installment_id || null,
      amount: String(target?.monthly_payment || target?.balance || ''),
      installment: target
    });
  };

  const handlePaymentSuccess = () => {
    fetchDashboardData('mutation');
    triggerDataSync('installments');
  };

  const handleQuickAction = (actionName) => {
    switch (actionName) {
      case 'Browse Products':
        navigate('/customer/dashboard?tab=products');
        break;
      case 'Installments':
      case 'Installment Plans':
        navigate('/customer/dashboard?tab=installments');
        break;
      case 'Notifications':
        navigate('/notifications');
        break;
      case 'View Statements':
        navigate('/customer/dashboard?tab=statements');
        break;
      case 'Make Payment':
      case 'Deposit Funds':
      case 'Waterfall Payment':
        handleOpenPayment();
        break;
      case 'Support':
        navigate('/customer/dashboard?tab=support');
        break;
      default:
        break;
    }
  };

  // Extract primary active installment
  const activeInstallmentsList = installments.filter(i => Number(i.balance) > 0);
  const primaryActive = activeInstallmentsList[0] || installments[0] || null;

  // Compute progress percentage
  const totalPayable = primaryActive ? Number(primaryActive.total_payable ?? primaryActive.total_amount ?? 0) : 0;
  const totalPaid = primaryActive ? Number(primaryActive.total_paid ?? primaryActive.paid_amount ?? 0) : 0;
  const progressPct = totalPayable > 0 ? Math.min(100, Math.round((totalPaid / totalPayable) * 100)) : 0;

  // Monthly Amortization & Balance values
  const monthlyPaymentVal = Number(stats?.monthly_payment) || (primaryActive ? Number(primaryActive.monthly_payment || 0) : 0);
  const totalBalanceVal = Number(stats?.total_credit_balance) || (primaryActive ? Number(primaryActive.balance || 0) : 0);
  const totalProductsCount = activeInstallmentsList.length;

  // Mini calendar calculation
  const now = new Date();
  const currentMonthName = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const todayDay = now.getDate();
  const daysInCurrentMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const startDayOfWeek = new Date(currentYear, currentMonth, 1).getDay(); // 0 = Sun

  const calendarDueDays = useMemo(() => {
    const dueDays = new Map();
    installments.forEach(inst => {
      if (Array.isArray(inst.paymentSchedules)) {
        inst.paymentSchedules.forEach(s => {
          if (s.status === 'Pending' || s.status === 'Overdue' || s.status === 'Partial') {
            const d = new Date(s.due_date);
            if (!isNaN(d) && d.getFullYear() === currentYear && d.getMonth() === currentMonth) {
              const day = d.getDate();
              dueDays.set(day, (dueDays.get(day) || 0) + Number(s.amount_due || s.monthly_payment || 0));
            }
          }
        });
      } else if (inst.next_due_date && Number(inst.balance) > 0) {
        const d = new Date(inst.next_due_date);
        if (!isNaN(d) && d.getFullYear() === currentYear && d.getMonth() === currentMonth) {
          const day = d.getDate();
          dueDays.set(day, (dueDays.get(day) || 0) + Number(inst.monthly_payment || inst.balance || 0));
        }
      }
    });
    return dueDays;
  }, [installments, currentYear, currentMonth]);

  const upcomingSchedules = useMemo(() => {
    const list = [];
    installments.forEach(inst => {
      if (Array.isArray(inst.paymentSchedules) && inst.paymentSchedules.length > 0) {
        inst.paymentSchedules
          .filter(s => s.status === 'Pending' || s.status === 'Overdue' || s.status === 'Partial')
          .forEach(s => {
            list.push({
              id: s.id || s.schedule_id || `${inst.installment_id}-${s.installment_number || s.schedule_number}`,
              productName: inst.product,
              accountNo: inst.account_no,
              dueDate: s.due_date,
              amount: Number(s.amount_due || s.monthly_payment || inst.monthly_payment || 0),
              status: s.status,
              installment: inst,
              installmentNumber: s.installment_number || s.schedule_number
            });
          });
      } else if (inst.next_due_date && Number(inst.balance) > 0) {
        list.push({
          id: `inst-${inst.installment_id}`,
          productName: inst.product,
          accountNo: inst.account_no,
          dueDate: inst.next_due_date,
          amount: Number(inst.monthly_payment || inst.balance || 0),
          status: 'Pending',
          installment: inst,
          installmentNumber: null
        });
      }
    });

    return list.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate)).slice(0, 4);
  }, [installments]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <Spinner className="w-12 h-12 text-blue-600 dark:text-blue-400 mx-auto mb-4" />
          <p className="text-muted-foreground font-medium animate-pulse">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  const currentTab = searchParams.get('tab');

  return (
    <div className="animate-[fadeIn_0.3s_ease] space-y-7 pb-10">
      {currentTab === 'installments' ? (
        <InstallmentsView
          installments={installments}
          onMakePayment={handleOpenPayment}
          onViewLedger={handleViewLedger}
          onBrowseProducts={() => navigate('/customer/dashboard?tab=products')}
        />
      ) : currentTab === 'schedule' ? (
        <PaymentScheduleView
          installments={installments}
          onMakePayment={handleOpenPayment}
        />
      ) : currentTab === 'statements' ? (
        <StatementsView
          installments={installments}
          user={user}
          stats={stats}
        />
      ) : currentTab === 'products' ? (
        <StoreCatalogView
          onBuyProduct={(prod, term) => openModal('makePayment', { product: prod, term })}
          availableCategories={(Array.isArray(stats?.categories) ? stats.categories : []).map(c => c.category)}
        />
      ) : currentTab === 'support' ? (
        <CustomerSupportView
          user={user}
        />
      ) : (
        <>
          {/* TOP HEADER: BRAND & CUSTOMER PILL */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-1">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-teal-800 dark:text-teal-300 bg-[#D1E8E2]/60 dark:bg-teal-950/60 px-3 py-1 rounded-full border border-teal-600/20">
              Z-Lics Iligan Customer Portal
            </span>
            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-0.5 rounded-full border border-emerald-200/50 flex items-center gap-1">
              <FiCheckCircle size={12} /> Verified Account
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">
            Customer Dashboard
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Overview of active furniture & appliance installment plans, payment schedules, and account balance.
          </p>
        </div>

        {/* Customer Rounded Pill Branch Tag */}
        <div className="inline-flex items-center px-3.5 py-2 rounded-full bg-slate-100 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 shadow-xs self-start sm:self-auto">
          <div className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 font-medium">
            <FiGitBranch size={12} />
            <span>{user?.branch_name || 'Z-Lics Iligan Branch'}</span>
          </div>
        </div>
      </div>

      {/* SHOWROOM CAROUSEL BANNER (BELOW CUSTOMER DASHBOARD HEADER) */}
      <div className="pt-1">
        <ImageCarousel />
      </div>

      {/* MAIN BENTO GRID: 8 COLUMNS (LEFT) & 4 COLUMNS (RIGHT) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* ======================================================== */}
        {/* LEFT COLUMN: 8 COLUMNS (BENTO CARDS & INSTALLMENT LEDGER) */}
        {/* ======================================================== */}
        <div className="lg:col-span-8 space-y-6">

          {/* TOP BENTO ROW: ACTIVE ORDERS (MINT) & SAVED PIECES (PINK) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            
            {/* Mint Pastel Card: Active Orders */}
            <div 
              className="rounded-[2.5rem] p-7 shadow-sm transition-all duration-300 hover:shadow-xl hover:-translate-y-1 bg-[#D1E8E2] dark:bg-[#0c2822] border border-teal-800/15 dark:border-teal-500/30 flex flex-col justify-between min-h-[220px] text-slate-900 dark:text-slate-100 relative group overflow-hidden"
            >
              <div className="flex items-start justify-between">
                <span className="px-3 py-1 rounded-full bg-white/80 dark:bg-teal-900/60 backdrop-blur-xs text-[11px] font-bold text-teal-950 dark:text-teal-200 uppercase tracking-wider shadow-2xs border border-teal-900/10 dark:border-teal-500/30">
                  {activeInstallmentsList.length > 0 ? `${activeInstallmentsList.length} Active Plan${activeInstallmentsList.length > 1 ? 's' : ''}` : '0 Active Plans'}
                </span>
                
                {/* Round Circular Diagonal Arrow Button */}
                <button 
                  type="button"
                  onClick={() => navigate('/customer/dashboard?tab=installments')}
                  className="w-12 h-12 rounded-full bg-white dark:bg-teal-900/80 text-slate-900 dark:text-teal-100 flex items-center justify-center transition-all duration-300 hover:scale-110 hover:bg-teal-950 hover:text-white dark:hover:bg-teal-400 dark:hover:text-slate-950 shadow-md cursor-pointer shrink-0 border border-teal-900/10 dark:border-teal-500/30"
                  title="View Active Orders & Plans"
                >
                  <FiArrowUpRight className="w-5 h-5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </button>
              </div>

              <div className="space-y-3 mt-4">
                <div>
                  <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-950 dark:text-white">
                    Active Orders
                  </h2>
                  <p className="text-xs font-semibold text-teal-900/80 dark:text-teal-200/80 mt-0.5">
                    {primaryActive 
                      ? `${primaryActive.product}${primaryActive.account_no ? ` (${primaryActive.account_no})` : ''}`
                      : 'No ongoing installment plans'
                    }
                  </p>
                </div>

                {/* Pill Avatars */}
                <div className="flex items-center gap-2 pt-1 flex-wrap">
                  {primaryActive ? (
                    <>
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/80 dark:bg-teal-900/50 border border-teal-900/10 dark:border-teal-500/30 text-xs font-bold text-teal-950 dark:text-teal-200 shadow-2xs">
                        <FiTv className="w-3.5 h-3.5 text-teal-800 dark:text-teal-300" />
                        <span className="truncate max-w-[130px]">{primaryActive.product || 'Appliance'}</span>
                      </div>
                      {primaryActive.account_no && (
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/80 dark:bg-teal-900/50 border border-teal-900/10 dark:border-teal-500/30 text-xs font-bold text-teal-950 dark:text-teal-200 shadow-2xs">
                          <FiPackage className="w-3.5 h-3.5 text-teal-800 dark:text-teal-300" />
                          <span className="font-mono">{primaryActive.account_no}</span>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/80 dark:bg-teal-900/50 border border-teal-900/10 dark:border-teal-500/30 text-xs font-bold text-teal-950 dark:text-teal-200 shadow-2xs">
                      <FiPackage className="w-3.5 h-3.5 text-teal-800 dark:text-teal-300" />
                      <span>Showroom Available</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Pink Pastel Card: Saved Pieces */}
            <div 
              className="rounded-[2.5rem] p-7 shadow-sm transition-all duration-300 hover:shadow-xl hover:-translate-y-1 bg-[#F8D7E3] dark:bg-[#2d121c] border border-rose-800/15 dark:border-rose-500/30 flex flex-col justify-between min-h-[220px] text-slate-900 dark:text-slate-100 relative group overflow-hidden"
            >
              <div className="flex items-start justify-between">
                <span className="px-3 py-1 rounded-full bg-white/80 dark:bg-rose-900/60 backdrop-blur-xs text-[11px] font-bold text-rose-950 dark:text-rose-200 uppercase tracking-wider shadow-2xs border border-rose-900/10 dark:border-rose-500/30">
                  {Number(stats?.total_products) > 0 ? `${stats.total_products} Store Pieces` : 'Product List'}
                </span>
                
                {/* Round Circular Diagonal Arrow Button */}
                <button 
                  type="button"
                  onClick={() => navigate('/customer/dashboard?tab=products')}
                  className="w-12 h-12 rounded-full bg-white dark:bg-rose-900/80 text-slate-900 dark:text-rose-100 flex items-center justify-center transition-all duration-300 hover:scale-110 hover:bg-rose-950 hover:text-white dark:hover:bg-rose-400 dark:hover:text-slate-950 shadow-md cursor-pointer shrink-0 border border-rose-900/10 dark:border-rose-500/30"
                  title="Browse Saved Pieces & Product List"
                >
                  <FiArrowUpRight className="w-5 h-5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </button>
              </div>

              <div className="space-y-3 mt-4">
                <div>
                  <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-950 dark:text-white">
                    Saved Pieces
                  </h2>
                  <p className="text-xs font-semibold text-rose-950/80 dark:text-rose-200/80 mt-0.5">
                    {Array.isArray(stats?.categories) && stats.categories.length > 0 
                      ? stats.categories.slice(0, 3).map(c => c.category).join(', ') 
                      : 'Appliances, Furniture & Home Electronics'
                    }
                  </p>
                </div>

                {/* Pill Avatars */}
                <div className="flex items-center gap-2 pt-1 flex-wrap">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/80 dark:bg-rose-900/50 border border-rose-900/10 dark:border-rose-500/30 text-xs font-bold text-rose-950 dark:text-rose-200 shadow-2xs">
                    <FiShoppingBag className="w-3.5 h-3.5 text-rose-800 dark:text-rose-300" />
                    <span>{Number(stats?.total_products) > 0 ? `${stats.total_products} in Showroom` : 'Showroom'}</span>
                  </div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/80 dark:bg-rose-900/50 border border-rose-900/10 dark:border-rose-500/30 text-xs font-bold text-rose-950 dark:text-rose-200 shadow-2xs">
                    <FiHeart className="w-3.5 h-3.5 text-rose-800 dark:text-rose-300" />
                    <span>Z-Lics Iligan</span>
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* SECOND BENTO ROW: YELLOW (#FBE8B5) & LAVENDER (#E2D6F5) ACCOUNT OVERVIEW */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">

            {/* Yellow Pastel Card: Total Products */}
            <div 
              className="rounded-[2.5rem] p-7 shadow-sm transition-all duration-300 hover:shadow-xl hover:-translate-y-1 bg-[#FBE8B5] dark:bg-[#2e1f08] border border-amber-800/15 dark:border-amber-500/30 flex flex-col justify-between min-h-[190px] text-slate-900 dark:text-slate-100 relative group overflow-hidden"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-2xl bg-white/80 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200 flex items-center justify-center font-bold shadow-2xs border border-amber-900/10 dark:border-amber-500/30">
                    <FiPackage size={18} />
                  </div>
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-950/80 dark:text-amber-200/80">
                    Total Products
                  </span>
                </div>
                
                {/* Round Circular Diagonal Arrow Button */}
                <button 
                  type="button"
                  onClick={() => navigate('/customer/dashboard?tab=products')}
                  className="w-11 h-11 rounded-full bg-white dark:bg-amber-900/80 text-slate-900 dark:text-amber-100 flex items-center justify-center transition-all duration-300 hover:scale-110 hover:bg-amber-950 hover:text-white dark:hover:bg-amber-400 dark:hover:text-slate-950 shadow-md cursor-pointer shrink-0 border border-amber-900/10 dark:border-amber-500/30"
                  title="View Products"
                >
                  <FiArrowUpRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </button>
              </div>

              <div className="space-y-1 mt-4">
                <h3 className="text-3xl sm:text-4xl font-black font-mono tracking-tight text-slate-950 dark:text-white">
                  {totalProductsCount} <span className="text-base font-bold text-amber-950/80 dark:text-amber-200/80">{totalProductsCount === 1 ? 'Unit' : 'Units'}</span>
                </h3>
                <p className="text-xs font-semibold text-amber-950/70 dark:text-amber-200/70">
                  {totalProductsCount > 0 ? 'Active installment merchandise in Iligan' : 'No active installment merchandise'}
                </p>
              </div>
            </div>

            {/* Lavender Pastel Card: Monthly Payment & Credit Balance */}
            <div 
              className="rounded-[2.5rem] p-7 shadow-sm transition-all duration-300 hover:shadow-xl hover:-translate-y-1 bg-[#E2D6F5] dark:bg-[#201335] border border-purple-800/15 dark:border-purple-500/30 flex flex-col justify-between min-h-[190px] text-slate-900 dark:text-slate-100 relative group overflow-hidden"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-2xl bg-white/80 dark:bg-purple-900/60 text-purple-900 dark:text-purple-200 flex items-center justify-center font-bold shadow-2xs border border-purple-900/10 dark:border-purple-500/30">
                    <BiWallet size={18} />
                  </div>
                  <span className="text-xs font-bold uppercase tracking-wider text-purple-950/80 dark:text-purple-200/80">
                    Monthly Payment
                  </span>
                </div>
                
                {/* Round Circular Diagonal Arrow Button */}
                <button 
                  type="button"
                  onClick={() => handleOpenPayment(primaryActive)}
                  className="w-11 h-11 rounded-full bg-white dark:bg-purple-900/80 text-slate-900 dark:text-purple-100 flex items-center justify-center transition-all duration-300 hover:scale-110 hover:bg-purple-950 hover:text-white dark:hover:bg-purple-400 dark:hover:text-slate-950 shadow-md cursor-pointer shrink-0 border border-purple-900/10 dark:border-purple-500/30"
                  title="Pay Monthly Amortization"
                >
                  <FiArrowUpRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </button>
              </div>

              <div className="space-y-1 mt-4">
                <h3 className="text-3xl sm:text-4xl font-black font-mono tracking-tight text-slate-950 dark:text-white">
                  {fmt(monthlyPaymentVal)}
                </h3>
                <p className="text-xs font-semibold text-purple-950/80 dark:text-purple-200/80 flex items-center justify-between">
                  <span>Balance: <strong className="font-mono text-purple-950 dark:text-purple-100">{fmt(totalBalanceVal)}</strong></span>
                  <span className="text-[11px] underline cursor-pointer hover:text-purple-900 dark:hover:text-white" onClick={() => openModal('creditDetails')}>Details</span>
                </p>
              </div>
            </div>

          </div>

          {/* ACTIVE INSTALLMENT CARD / EMPTY STATE */}
          {primaryActive ? (
            <div className="bg-card rounded-[2.5rem] p-7 sm:p-8 border border-border shadow-sm space-y-6 relative overflow-hidden transition-all hover:shadow-md">
              
              {/* Header: Title, Pill Avatar, Account Tag & Payment Button */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="w-13 h-13 rounded-2xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200/60 dark:border-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-400 shadow-2xs shrink-0">
                    <FiTv className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {primaryActive.account_no && (
                        <span className="font-mono text-xs font-bold px-2.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300">
                          {primaryActive.account_no}
                        </span>
                      )}
                      <Badge variant={Number(primaryActive.balance) <= 0 ? 'success' : 'primary'}>
                        {primaryActive.status || 'Active'}
                      </Badge>
                    </div>
                    <h2 className="text-lg sm:text-xl font-extrabold text-foreground mt-1">
                      {primaryActive.product || 'Installment Unit'}
                    </h2>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 self-start sm:self-auto">
                  {Number(primaryActive.balance) > 0 && (
                    <button
                      type="button"
                      onClick={() => handleOpenPayment(primaryActive)}
                      className="px-5 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs shadow-md shadow-emerald-600/25 flex items-center gap-2 transition-all cursor-pointer"
                    >
                      <TbCurrencyPeso size={17} />
                      <span>Pay Amortization</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleViewLedger(primaryActive)}
                    className="w-10 h-10 rounded-2xl border border-border hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors cursor-pointer"
                    title="View Ledger Statement"
                  >
                    <FiFileText size={17} />
                  </button>
                </div>
              </div>

              {/* Metrics Breakdown Chips */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-3xl bg-muted/30 border border-border/60 text-xs">
                <div>
                  <span className="text-[10px] font-bold uppercase text-muted-foreground">Monthly Due</span>
                  <p className="font-mono font-bold text-sm text-foreground mt-0.5">{fmt(Number(primaryActive.monthly_payment || 0))}</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-muted-foreground">Total Financed</span>
                  <p className="font-mono font-bold text-sm text-foreground mt-0.5">{fmt(totalPayable)}</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-muted-foreground">Total Paid</span>
                  <p className="font-mono font-bold text-sm text-emerald-600 dark:text-emerald-400 mt-0.5">{fmt(totalPaid)}</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-muted-foreground">Remaining Balance</span>
                  <p className="font-mono font-bold text-sm text-red-600 dark:text-red-400 mt-0.5">{fmt(Number(primaryActive.balance || 0))}</p>
                </div>
              </div>

              {/* Progress Bar & Term Indicators */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs font-semibold">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <FiClock className="w-3.5 h-3.5 text-blue-600" />
                    Installment Amortization Progress: <strong className="text-foreground">{progressPct}% Settled</strong>
                  </span>
                  <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                    {fmt(totalPaid)} / {fmt(totalPayable)}
                  </span>
                </div>

                {/* Progress Track */}
                <div className="w-full h-3.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden p-0.5 border border-slate-200 dark:border-slate-700">
                  <div 
                    style={{ width: `${progressPct}%` }}
                    className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 transition-all duration-700 shadow-xs"
                  />
                </div>

                <div className="flex justify-between items-center text-[11px] text-muted-foreground pt-0.5">
                  <span>Next Schedule: <strong>{primaryActive.next_due_date ? new Date(primaryActive.next_due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'No pending schedule'}</strong></span>
                  <span>Status: <strong>{Number(primaryActive.balance) <= 0 ? 'Completed' : (primaryActive.status || 'Active')}</strong></span>
                </div>
              </div>

            </div>
          ) : (
            <div className="bg-card rounded-[2.5rem] p-7 sm:p-8 border border-border shadow-sm space-y-4 text-center relative overflow-hidden transition-all hover:shadow-md">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200/60 dark:border-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-400 shadow-2xs mx-auto">
                <FiPackage className="w-7 h-7" />
              </div>
              <div className="space-y-1 max-w-md mx-auto">
                <h3 className="text-lg sm:text-xl font-extrabold text-foreground">No Active Installment Plans</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  You do not have any ongoing installment accounts with Z-Lics Trading. Browse the product list to choose appliances or furniture with flexible financing.
                </p>
              </div>
              <div className="flex items-center justify-center gap-3 pt-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => navigate('/customer/dashboard?tab=products')}
                  className="px-5 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md transition-all cursor-pointer flex items-center gap-2"
                >
                  <FiShoppingBag className="w-4 h-4" />
                  <span>Browse Product List</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/customer/dashboard?tab=support')}
                  className="px-4 py-2.5 rounded-2xl border border-border hover:bg-muted text-foreground font-semibold text-xs transition-colors cursor-pointer"
                >
                  <span>Contact Showroom</span>
                </button>
              </div>
            </div>
          )}

          {/* MAIN TRANSACTION & INSTALLMENT LEDGER TABLE */}
          <div>
            <InstallmentLedger 
              installments={installments} 
              onView={handleViewLedger} 
            />
          </div>

        </div>

        {/* ======================================================== */}
        {/* RIGHT COLUMN: 4 COLUMNS (CALENDAR & SCHEDULE LIST)      */}
        {/* ======================================================== */}
        <div className="lg:col-span-4 space-y-6">

          {/* CALENDAR & UPCOMING SCHEDULE CARD (ROUNDED-[2.5rem]) */}
          <div className="bg-card rounded-[2.5rem] p-6 sm:p-7 border border-border shadow-sm space-y-6">
            
            {/* Header: Month & Year */}
            <div className="flex items-center justify-between pb-1">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
                  <FiCalendar size={16} />
                </div>
                <h3 className="text-base font-bold text-foreground">
                  {currentMonthName}
                </h3>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 px-2.5 py-1 rounded-full border border-blue-200/50">
                Schedule List
              </span>
            </div>

            {/* MINI CALENDAR GRID */}
            <div className="p-4 rounded-3xl bg-muted/40 border border-border/60">
              {/* Weekday abbreviations */}
              <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-muted-foreground mb-2">
                <span>Su</span><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span>
              </div>
              
              {/* Calendar Days */}
              <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold">
                {/* Empty placeholders for offset before the 1st */}
                {[...Array(startDayOfWeek)].map((_, idx) => (
                  <div key={`cal-offset-${idx}`} className="h-8" />
                ))}

                {[...Array(daysInCurrentMonth)].map((_, idx) => {
                  const day = idx + 1;
                  const dueAmount = calendarDueDays.get(day);
                  const isDueDay = dueAmount !== undefined;
                  const isToday = day === todayDay;

                  return (
                    <div 
                      key={day} 
                      className={`h-8 flex items-center justify-center rounded-xl transition-all ${
                        isDueDay
                          ? 'bg-blue-600 text-white font-bold shadow-sm scale-105'
                          : isToday
                          ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-bold border border-blue-400/30'
                          : 'text-foreground/80 hover:bg-muted cursor-pointer'
                      }`}
                      title={isDueDay ? `Amortization Due: ${fmt(dueAmount)}` : (isToday ? 'Today' : '')}
                    >
                      {day}
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-3 pt-2.5 border-t border-border/50">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                  <span>Amortization Due</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-400/40"></span>
                  <span>Today</span>
                </span>
              </div>
            </div>

            {/* UPCOMING PAYMENT SCHEDULE LIST */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <FiClock className="w-3.5 h-3.5 text-blue-600" />
                  Upcoming Amortizations
                </h4>
                <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 cursor-pointer" onClick={() => navigate('/customer/dashboard?tab=schedule')}>
                  View All
                </span>
              </div>

              <div className="space-y-2.5">
                {upcomingSchedules.length > 0 ? (
                  upcomingSchedules.map((item) => {
                    const dueObj = new Date(item.dueDate);
                    const formattedDate = !isNaN(dueObj)
                      ? dueObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                      : item.dueDate;
                    const diffDays = Math.ceil((dueObj - new Date().setHours(0, 0, 0, 0)) / (1000 * 60 * 60 * 24));

                    return (
                      <div key={item.id} className="p-3.5 rounded-2xl border border-blue-500/30 bg-blue-50/50 dark:bg-blue-950/30 flex items-center justify-between gap-2 shadow-2xs">
                        <div className="space-y-0.5 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-bold text-foreground">{formattedDate}</span>
                            {diffDays < 0 ? (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300">
                                Overdue by {Math.abs(diffDays)}d
                              </span>
                            ) : diffDays === 0 ? (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                                Due today
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
                                Due in {diffDays} days
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-muted-foreground truncate">
                            {item.productName || 'Installment'} {item.installmentNumber ? `(Term ${item.installmentNumber})` : ''}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-mono font-bold text-xs text-foreground">{fmt(item.amount)}</div>
                          <button
                            type="button"
                            onClick={() => handleOpenPayment(item.installment)}
                            className="mt-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] transition-all cursor-pointer shadow-2xs"
                          >
                            Pay Now
                          </button>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="p-4 rounded-2xl border border-dashed border-border text-center space-y-1">
                    <FiCheckCircle className="w-5 h-5 text-emerald-500 mx-auto mb-1" />
                    <p className="text-xs font-bold text-foreground">No Upcoming Dues</p>
                    <p className="text-[11px] text-muted-foreground">All your installment accounts are up to date.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Z-LICS ILIGAN SHOWROOM & CUSTOMER ASSISTANCE */}
            <div className="p-4 rounded-3xl bg-gradient-to-br from-slate-900 to-blue-950 text-white space-y-3 relative overflow-hidden shadow-sm">
              <div className="flex items-center gap-2 relative z-10">
                <FiMapPin className="w-4 h-4 text-teal-400" />
                <span className="text-xs font-bold">Z-Lics Trading Iligan</span>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed relative z-10">
                Need to settle in-store or configure a new appliance term? Visit our showroom at Quezon Ave, Iligan City.
              </p>
              <div className="flex gap-2 pt-1 relative z-10">
                <button
                  type="button"
                  onClick={() => navigate('/customer/dashboard?tab=support')}
                  className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs border border-white/15 transition-colors cursor-pointer"
                >
                  Contact Branch
                </button>
              </div>
            </div>

          </div>

          {/* QUICK ACTIONS SIDEBAR COMPONENT */}
          <QuickActions onAction={handleQuickAction} />

        </div>

      </div>
      </>
      )}

      {/* STANDARD PRESERVED MODALS */}
      <ProductListModal
        isOpen={activeModal === 'productList'}
        onClose={closeModal}
        category={modalArgs?.category}
        initialProductId={modalArgs?.initialProductId}
        availableCategories={(Array.isArray(stats?.categories) ? stats.categories : []).map(c => c.category)}
        onBuyProduct={(prod, term = 'full') => {
          closeModal();
          openModal('makePayment', { product: prod, term });
        }}
      />

      <InstallmentsModal
        isOpen={activeModal === 'installments'}
        onClose={closeModal}
        onMakePayment={(inst) => {
          closeModal();
          handleOpenPayment(inst);
        }}
        onViewLedger={(inst) => {
          closeModal();
          openModal('installmentAccount', inst.installment_id);
        }}
        onBrowseProducts={() => {
          closeModal();
          navigate('/customer/dashboard?tab=products');
        }}
      />

      <PaymentDetailsModal
        isOpen={activeModal === 'paymentDetails'}
        onClose={closeModal}
        installments={installments}
      />

      <CreditDetailsModal
        isOpen={activeModal === 'creditDetails'}
        onClose={closeModal}
        installments={installments}
      />

      <OverduePaymentsModal
        isOpen={activeModal === 'overduePayments'}
        onClose={closeModal}
        installments={installments}
      />

      <InstallmentAccountDetailsModal
        isOpen={activeModal === 'installmentAccount'}
        onClose={closeModal}
        installmentId={modalArgs}
      />

      <StatementModal
        isOpen={activeModal === 'statement'}
        onClose={closeModal}
        installments={installments}
        user={user}
        stats={stats}
      />

      <DepositModal
        isOpen={activeModal === 'deposit' || activeModal === 'makePayment'}
        onClose={closeModal}
        installments={installments}
        initialProducts={modalArgs?.products || (modalArgs?.product ? [modalArgs.product] : [])}
        initialAmount={modalArgs?.amount || ''}
        defaultInstallmentId={modalArgs?.installmentId || null}
        initialInstallment={modalArgs?.installment || null}
        initialPaymentTerm={modalArgs?.term || 'full'}
        allowInstallment={Boolean(stats?.allow_installment)}
        onSuccess={() => fetchDashboardData('mutation')}
      />

      <SupportModal
        isOpen={activeModal === 'support'}
        onClose={closeModal}
      />

    </div>
  );
}
