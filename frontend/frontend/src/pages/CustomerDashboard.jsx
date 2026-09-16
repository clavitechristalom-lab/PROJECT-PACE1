import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { fmt } from '../lib/utils';
import { FiPackage, FiMonitor, FiCreditCard, FiAlertCircle, FiTrendingUp, FiUser, FiGitBranch } from 'react-icons/fi';
import { BiWallet } from 'react-icons/bi';
import { Spinner } from '../components/ui';
import { useAuth } from '../context/AuthContext';

import DashboardCard from '../components/customer/DashboardCard';
import InstallmentLedger from '../components/customer/InstallmentLedger';
import QuickActions from '../components/customer/QuickActions';
import {
  ProductListModal, PaymentDetailsModal, CreditDetailsModal,
  OverduePaymentsModal, InstallmentAccountDetailsModal,
  StatementModal, MakePaymentModal, SupportModal
} from '../components/customer/CustomerModals';

export default function CustomerDashboard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [installments, setInstallments] = useState([]);

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

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const [dashRes, instRes] = await Promise.all([
        api.customerApp.getDashboard(),
        api.customerApp.getInstallments()
      ]);
      setStats(dashRes.metrics);
      setInstallments(instRes.installments);
    } catch (error) {
      console.error('Failed to load dashboard', error);
    } finally {
      setLoading(false);
    }
  };

  const handleViewLedger = (installment) => {
    openModal('installmentAccount', installment.installment_id);
  };

  const handleQuickAction = (actionName) => {
    switch (actionName) {
      case 'Browse Products':
        openModal('productList');
        break;
      case 'View Statements':
        openModal('statement');
        break;
      case 'Make Payment':
        openModal('makePayment');
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
          <Spinner className="w-12 h-12 text-[#176B87] mx-auto mb-4" />
          <p className="text-slate-500 dark:text-slate-400 font-medium animate-pulse">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-[fadeIn_0.3s_ease]">

      <main className="py-2">

        {/* Welcome Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
          <div>
            <h2 className="text-3xl font-extrabold text-[#176B87] dark:text-[#64ccc5] tracking-tight flex items-center gap-2">
              <FiUser className="w-8 h-8" /> My Account
            </h2>
            <p className="text-slate-500 dark:text-slate-400 mt-1">
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

        {/* 4-Column Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <DashboardCard
            title="Total Products"
            value={stats?.total_products || 0}
            icon={<FiPackage size={24} />}
            colorClass="bg-[#176B87]"
            subtitle="Available in store"
            onClick={() => openModal('productList')}
          />
          <DashboardCard
            title="Monthly Payment"
            value={fmt(stats?.monthly_payment || 0)}
            icon={<FiCreditCard size={24} />}
            colorClass="bg-blue-600"
            subtitle="Next due amounts"
            onClick={() => openModal('paymentDetails')}
          />
          <DashboardCard
            title="Total Credit Balance"
            value={fmt(stats?.total_credit_balance || 0)}
            icon={<BiWallet size={24} />}
            colorClass="bg-emerald-600"
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
          <DashboardCard
            title="Furniture"
            value={stats?.furniture_count || 0}
            icon={<FiMonitor size={20} />}
            colorClass="bg-indigo-500"
            onClick={() => openModal('productList', { category: 'Furniture' })}
          />
          <DashboardCard
            title="Appliances"
            value={stats?.appliance_count || 0}
            icon={<FiMonitor size={20} />}
            colorClass="bg-purple-500"
            onClick={() => openModal('productList', { category: 'Appliances' })}
          />
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
            <div className="bg-gradient-to-br from-[#176B87] to-blue-800 rounded-xl p-6 text-white shadow-md relative overflow-hidden">
              <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-white opacity-10 rounded-full blur-xl"></div>
              <h3 className="text-xl font-bold mb-2 relative z-10">Need a New Appliance?</h3>
              <p className="text-blue-100 text-sm mb-4 relative z-10">
                Check out our latest arrivals and get exclusive installment plans for active customers.
              </p>
              <button
                onClick={() => openModal('productList', { category: 'Appliances' })}
                className="bg-white text-[#176B87] px-4 py-2 rounded-lg text-sm font-bold shadow hover:bg-slate-100 transition-colors relative z-10 cursor-pointer"
              >
                Browse Appliances
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
      <MakePaymentModal
        isOpen={activeModal === 'makePayment'}
        onClose={closeModal}
        installments={installments}
        onPaymentSuccess={fetchDashboardData}
      />
      <SupportModal
        isOpen={activeModal === 'support'}
        onClose={closeModal}
      />
    </div>
  );
}
