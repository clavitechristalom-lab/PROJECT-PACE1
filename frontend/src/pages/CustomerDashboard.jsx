
import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { fmt } from '../lib/utils';
import { FiPackage, FiMonitor, FiCreditCard, FiAlertCircle, FiTrendingUp, FiUser, FiGitBranch } from 'react-icons/fi';
import { BiWallet } from 'react-icons/bi';
import { Spinner } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useRealtimeSync, triggerDataSync } from '../lib/realtimeSync';

import DashboardCard from '../components/customer/DashboardCard';
import InstallmentLedger from '../components/customer/InstallmentLedger';
import QuickActions from '../components/customer/QuickActions';
import ImageCarousel from '../components/customer/ImageCarousel';
import {
  ProductListModal, PaymentDetailsModal, CreditDetailsModal,
  OverduePaymentsModal, InstallmentAccountDetailsModal,
  StatementModal, MakePaymentModal, SupportModal, InstallmentsModal
} from '../components/customer/CustomerModals';
import DepositModal from '../components/customer/DepositModal';

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

  useEffect(() => {
    const productId = searchParams.get('product_id');
    if (productId) {
      openModal('productList', { initialProductId: productId });
    }
  }, [searchParams]);

  useRealtimeSync(fetchDashboardData, []);

  const handleViewLedger = (installment) => {
    openModal('installmentAccount', installment.installment_id);
  };

  const handleQuickAction = (actionName) => {
    switch (actionName) {
      case 'Browse Products':
        openModal('productList');
        break;
      case 'Installments':
      case 'Installment Plans':
        openModal('installments');
        break;
      case 'Notifications':
        navigate('/notifications');
        break;
      case 'View Statements':
        openModal('statement');
        break;
      case 'Make Payment':
      case 'Deposit Funds':
        openModal('deposit');
        break;
      case 'Support':
        openModal('support');
        break;
      default:
        break;
    }
  };

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

  return (
    <div className="animate-[fadeIn_0.3s_ease]">

      <main className="py-2">

        {/* Welcome Section */}
        <div className="mb-8">
          <div>
            <h2 className="text-3xl font-extrabold text-blue-700 dark:text-blue-400 tracking-tight flex items-center gap-2">
              <FiUser className="w-8 h-8" /> My Account
            </h2>
            <p className="text-muted-foreground mt-1">
              Welcome back, <span className="font-semibold text-foreground">{user?.name || 'Customer'}</span>!
            </p>
            <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
              <FiGitBranch className="w-3.5 h-3.5" />
              {user?.branch_name ? (
                <span className="font-medium text-blue-600 dark:text-blue-400">{user.branch_name}</span>
              ) : (
                <span className="text-amber-500">No Branch Assigned — contact your store administrator</span>
              )}
            </div>
          </div>
        </div>

        {/* Carousel Section */}
        <ImageCarousel />

        {/* 4-Column Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <DashboardCard
            title="Total Products"
            value={stats?.total_products || 0}
            icon={<FiPackage size={24} />}
            colorClass="bg-blue-600"
            subtitle="Available in store"
            onClick={() => openModal('productList')}
          />
          <DashboardCard
            title="Monthly Payment"
            value={fmt(stats?.monthly_payment || 0)}
            icon={<FiCreditCard size={24} />}
            colorClass="bg-blue-500"
            subtitle="Next due amounts"
            onClick={() => openModal('paymentDetails')}
          />
          <DashboardCard
            title="Total Credit Balance"
            value={fmt(stats?.total_credit_balance || 0)}
            icon={<BiWallet size={24} />}
            colorClass="bg-indigo-600"
            subtitle="Remaining to pay"
            onClick={() => openModal('creditDetails')}
          />
          <DashboardCard
            title="My Overdue"
            value={stats?.overdue_count || 0}
            icon={<FiAlertCircle size={24} />}
            colorClass="bg-red-500"
            subtitle="Pending payments"
            trend={stats?.overdue_count > 0 ? -100 : null}
            onClick={() => openModal('overduePayments')}
          />
        </div>

        {/* Secondary Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
          {(Array.isArray(stats?.categories) ? stats.categories : []).map((cat, index) => (
            <DashboardCard
              key={cat.category}
              title={cat.category}
              value={cat.count || 0}
              icon={<FiMonitor size={20} />}
              colorClass={index % 2 === 0 ? "bg-indigo-500" : "bg-sky-600"}
              onClick={() => openModal('productList', { category: cat.category })}
            />
          ))}
          <DashboardCard
            title="Sale Items"
            value={stats?.sale_items_count || 0}
            icon={<FiTrendingUp size={20} />}
            colorClass="bg-amber-500"
            onClick={() => openModal('productList', { category: 'Sale Items' })}
          />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          {/* Main Ledger Area */}
          <div className="xl:col-span-2">
            <InstallmentLedger installments={installments} onView={handleViewLedger} />
          </div>

          {/* Sidebar Area */}
          <div className="xl:col-span-1 space-y-8">
            <QuickActions onAction={handleQuickAction} />

            {/* Promo / Banner Card */}
            <div className="bg-gradient-to-br from-blue-700 via-blue-800 to-indigo-950 rounded-2xl p-6 text-white shadow-lg border border-blue-500/20 relative overflow-hidden">
              <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-white opacity-10 rounded-full blur-xl"></div>
              <h3 className="text-xl font-bold mb-2 relative z-10">New Appliance & Furniture?</h3>
              <p className="text-blue-100 text-sm mb-4 relative z-10">
                Check out our latest arrivals and get exclusive installment plans for active customers.
              </p>
              <button
                onClick={() => openModal('productList')}
                className="bg-white text-blue-900 px-4 py-2 rounded-xl text-sm font-bold shadow hover:bg-blue-50 transition-colors relative z-10 cursor-pointer"
              >
                Browse Products
              </button>
            </div>
          </div>
        </div>

      </main>

      {/* Render Modals dynamically */}
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
          openModal('makePayment', { installmentId: inst.installment_id, amount: String(inst.monthly_payment), installment: inst });
        }}
        onViewLedger={(inst) => {
          closeModal();
          openModal('installmentAccount', inst.installment_id);
        }}
        onBrowseProducts={() => {
          closeModal();
          openModal('productList');
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
