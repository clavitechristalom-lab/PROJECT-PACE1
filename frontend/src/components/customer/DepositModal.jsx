import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  FiX, FiLock, FiCheckCircle, FiSmartphone, FiCreditCard,
  FiArrowLeft, FiExternalLink, FiCopy, FiCheck, FiRefreshCw,
  FiShield, FiAlertCircle, FiPlus, FiMinus, FiTrash2, FiShoppingBag,
  FiPackage, FiChevronRight, FiClock, FiCalendar, FiUploadCloud,
  FiImage, FiHash, FiFileText
} from 'react-icons/fi';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '../../lib/api';
import { triggerDataSync } from '../../lib/realtimeSync';
import { fmt } from '../../lib/utils';
import { showSuccess, showInfo, showWarning, showError, showToast } from '../ui';
import SelectProductModal from './SelectProductModal';
import instapayQrImg from '../../assets/instapay-qr.png';

export default function DepositModal({
  isOpen,
  onClose,
  onSuccess,
  initialProducts = [],
  initialAmount = '',
  defaultInstallmentId = null,
  initialInstallment = null,
  initialPaymentTerm = 'full',
  installments = [],
  allowInstallment = false,
}) {
  // Step state: 1 = Order Summary & Payment Method; 2 = Gateway & QR; 3 = Payment Success Receipt
  const [step, setStep] = useState(1);
  const [activeTab, setActiveTab] = useState('ewallet'); // 'ewallet' | 'bank'
  const [selectedMethod, setSelectedMethod] = useState('GCash'); // 'GCash' | 'Maya' | 'BDO'
  const [orderItems, setOrderItems] = useState([]);
  const [amount, setAmount] = useState('');
  const [selectedInstallmentId, setSelectedInstallmentId] = useState(defaultInstallmentId || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isSelectProductModalOpen, setIsSelectProductModalOpen] = useState(false);

  // Check if current payment flow is paying an existing installment account
  const isInstallmentPayment = Boolean(selectedInstallmentId || defaultInstallmentId);

  // Look up selected installment account details from props
  const selectedInstallment = useMemo(() => {
    const id = selectedInstallmentId || defaultInstallmentId;
    if (initialInstallment && (!id || String(initialInstallment.installment_id) === String(id))) {
      return initialInstallment;
    }
    if (!id) return null;
    return (installments || []).find(
      inst => String(inst.installment_id) === String(id)
    );
  }, [installments, selectedInstallmentId, defaultInstallmentId, initialInstallment]);

  // Fallback API lookup if installment product image is missing
  const [extraAccountData, setExtraAccountData] = useState(null);

  useEffect(() => {
    const id = selectedInstallmentId || defaultInstallmentId;
    if (isOpen && id && !selectedInstallment?.image_url) {
      api.installments.getById(id).then(res => {
        const item = res?.sale_items?.[0] || res?.sale?.items?.[0];
        const acc = res?.installment || res?.account || res;
        const img = item?.product?.image_url || item?.image_url || item?.image || acc?.image_url;
        const prod = item?.product?.product_name || item?.product_name || acc?.product;
        if (img || prod) {
          setExtraAccountData({ image_url: img, product: prod });
        }
      }).catch(() => { });
    } else {
      setExtraAccountData(null);
    }
  }, [isOpen, selectedInstallmentId, defaultInstallmentId, selectedInstallment?.image_url]);

  const activeInstallment = useMemo(() => {
    if (!selectedInstallment && !extraAccountData) return null;
    return { ...selectedInstallment, ...extraAccountData };
  }, [selectedInstallment, extraAccountData]);

  const installmentImageUrl = activeInstallment?.image_url || activeInstallment?.image || null;

  const formatImgUrl = (url) => {
    if (!url) return null;
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) return url;
    return url.startsWith('/') ? `http://127.0.0.1:8000${url}` : `http://127.0.0.1:8000/${url}`;
  };

  // Store Admin Installment Control & Eligibility State
  const [isInstallmentAllowed, setIsInstallmentAllowed] = useState(allowInstallment);
  const [requestingApproval, setRequestingApproval] = useState(false);
  const [paymentTerm, setPaymentTerm] = useState('full'); // 'full' | 'installment'
  const [installmentTermMonths, setInstallmentTermMonths] = useState(3); // 3, 6, 12

  // Sync allowInstallment prop & fetch live status from backend
  useEffect(() => {
    setIsInstallmentAllowed(allowInstallment);
  }, [allowInstallment]);

  useEffect(() => {
    if (isOpen) {
      api.customerApp.getDashboard().then(res => {
        if (res?.metrics?.allow_installment !== undefined) {
          setIsInstallmentAllowed(Boolean(res.metrics.allow_installment));
        }
      }).catch(() => { });
    }
  }, [isOpen]);

  // Step 2 checkout state
  const [checkoutData, setCheckoutData] = useState(null);
  const [copied, setCopied] = useState(false);
  const [pollingStatus, setPollingStatus] = useState('waiting'); // 'waiting' | 'paid' | 'failed'
  const [verifyingManually, setVerifyingManually] = useState(false);
  const pollTimerRef = useRef(null);

  // Customer Transaction Reference & Proof of Payment Upload State
  const [customerRef, setCustomerRef] = useState('');
  const [proofFile, setProofFile] = useState(null);
  const [proofPreview, setProofPreview] = useState(null);
  const fileInputRef = useRef(null);

  // Sync initialProducts & reset state on open/close
  const initialProductsJson = JSON.stringify(initialProducts);

  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setActiveTab('ewallet');
      setSelectedMethod('GCash');
      setSelectedInstallmentId(defaultInstallmentId || '');
      setCheckoutData(null);
      setError('');
      setPollingStatus('waiting');
      setPaymentTerm('full');
      setInstallmentTermMonths(3);
      setCustomerRef('');
      setProofFile(null);
      setProofPreview(null);

      // Normalize items
      const formattedItems = (initialProducts || []).map(p => ({
        product_id: p.product_id,
        product_name: p.product_name,
        product_code: p.product_code || '',
        brand: p.brand || '',
        category: p.category || '',
        price: Number(p.discount_price || p.unit_price || p.price || 0),
        quantity: Math.max(1, Number(p.quantity || 1)),
        image_url: p.image_url || '',
      }));

      setOrderItems(formattedItems);

      // Compute total dynamically from products
      if (formattedItems.length > 0) {
        const total = formattedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        setAmount(String(total));
      } else {
        const instDue = initialInstallment?.monthly_payment || initialInstallment?.monthly_due || initialInstallment?.balance_due;
        setAmount(initialAmount ? String(initialAmount) : (instDue ? String(instDue) : ''));
      }
    } else {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    }
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [isOpen, initialProductsJson, initialAmount, defaultInstallmentId, initialInstallment]);

  const totalCashPrice = useMemo(() => {
    return orderItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  }, [orderItems]);

  // ─── Installment Financial Terms Calculations ───
  const downpaymentRate = 0.20; // 20% downpayment standard
  const downpaymentAmount = useMemo(() => {
    return Math.round(totalCashPrice * downpaymentRate * 100) / 100;
  }, [totalCashPrice]);

  const currentInterestRate = useMemo(() => {
    if (installmentTermMonths === 3) return 0;
    if (installmentTermMonths === 6) return 3;
    if (installmentTermMonths === 12) return 6;
    return 0;
  }, [installmentTermMonths]);

  const principalFinanced = useMemo(() => {
    return Math.max(0, totalCashPrice - downpaymentAmount);
  }, [totalCashPrice, downpaymentAmount]);

  const interestAmount = useMemo(() => {
    return Math.round(principalFinanced * (currentInterestRate / 100) * 100) / 100;
  }, [principalFinanced, currentInterestRate]);

  const totalPayable = useMemo(() => {
    return Math.round((totalCashPrice + interestAmount) * 100) / 100;
  }, [totalCashPrice, interestAmount]);

  const monthlyAmortization = useMemo(() => {
    if (!installmentTermMonths || installmentTermMonths <= 0) return 0;
    return Math.round(((principalFinanced + interestAmount) / installmentTermMonths) * 100) / 100;
  }, [principalFinanced, interestAmount, installmentTermMonths]);

  // Recalculate and synchronize amount whenever orderItems or payment term change
  useEffect(() => {
    if (orderItems.length > 0) {
      if (paymentTerm === 'installment' && isInstallmentAllowed) {
        setAmount(String(downpaymentAmount));
      } else {
        setAmount(String(totalCashPrice));
      }
    }
  }, [totalCashPrice, paymentTerm, isInstallmentAllowed, downpaymentAmount]);

  // Adjust item quantity
  const handleUpdateQuantity = (productId, delta) => {
    const nextItems = orderItems.map(item => {
      if (item.product_id === productId) {
        const nextQty = Math.max(1, item.quantity + delta);
        return { ...item, quantity: nextQty };
      }
      return item;
    });
    setOrderItems(nextItems);
  };

  // Remove item from order list
  const handleRemoveItem = (productId) => {
    const nextItems = orderItems.filter(item => item.product_id !== productId);
    setOrderItems(nextItems);
    if (nextItems.length === 0) {
      setAmount('');
    }
  };

  // Polling & Real-time Auto-Detection for GCash payment completion once on Step 2
  useEffect(() => {
    if (step === 2 && checkoutData?.transaction_reference && pollingStatus === 'waiting') {
      const checkPayment = async () => {
        try {
          const res = await api.ewallet.checkStatus(checkoutData.transaction_reference);
          if (res?.is_paid || res?.status === 'paid' || res?.status === 'Completed' || res?.status === 'Successful') {
            if (pollTimerRef.current) clearInterval(pollTimerRef.current);
            setPollingStatus('paid');
            if (res.deposit) {
              setCheckoutData(prev => ({
                ...prev,
                ...res.deposit,
                customer_reference: res.customer_reference || res.deposit.customer_reference || customerRef,
                proof_of_payment_url: res.proof_of_payment_url || proofPreview,
              }));
            }
            setStep(3); // Transition to success receipt automatically
            triggerDataSync('payments');
            triggerDataSync('sales');
            triggerDataSync('installments');
            if (onSuccess) onSuccess(res);
          }
        } catch (err) {
          console.debug('Polling checkStatus:', err);
        }
      };

      // Periodic check every 2 seconds
      pollTimerRef.current = setInterval(checkPayment, 2000);

      // Instant check on tab focus / visibility change when returning from native GCash app
      const handleFocus = () => {
        if (document.visibilityState === 'visible') {
          checkPayment();
        }
      };
      window.addEventListener('focus', handleFocus);
      document.addEventListener('visibilitychange', handleFocus);

      // Immediate check once on enter
      checkPayment();

      return () => {
        if (pollTimerRef.current) clearInterval(pollTimerRef.current);
        window.removeEventListener('focus', handleFocus);
        document.removeEventListener('visibilitychange', handleFocus);
      };
    }
  }, [step, checkoutData, pollingStatus, onSuccess]);

  if (!isOpen) return null;

  const handleAmountChange = (e) => {
    const val = e.target.value.replace(/[^0-9.]/g, '');
    setAmount(val);
    if (error) setError('');
  };

  // Request Store Admin approval for installment
  const handleRequestInstallment = async () => {
    setRequestingApproval(true);
    try {
      const res = await api.customerApp.requestInstallment({
        notes: `Customer requested installment authorization for ${orderItems.length} selected item(s) totalling ${fmt(totalCashPrice)}.`,
      });
      showSuccess('Request Sent', res.message || 'Your Store Administrator has been notified to review and allow your account for installment.');
    } catch (err) {
      showInfo('Installment Request', err.message || 'Please contact your store administrator to enable installment for your account.');
    } finally {
      setRequestingApproval(false);
    }
  };

  // Step 1: Submit and dynamically trigger Payment Gateway Checkout session
  const handleContinue = async (e) => {
    if (e) e.preventDefault();
    const numAmount = parseFloat(amount);
    if (!amount || isNaN(numAmount) || numAmount < 1) {
      setError('Please enter a valid payment amount (minimum ₱1.00)');
      return;
    }

    setError('');
    setLoading(true);
    try {
      const isInstallment = paymentTerm === 'installment' && isInstallmentAllowed && orderItems.length > 0;
      const payload = {
        amount: numAmount,
        payment_method: selectedMethod,
        payment_type: isInstallment
          ? 'installment_order'
          : (orderItems.length > 0 ? 'product_order' : (selectedInstallmentId ? 'installment_payment' : 'deposit')),
        installment_id: selectedInstallmentId || null,
        items: orderItems.map(item => ({
          product_id: item.product_id,
          quantity: item.quantity,
          price: item.price,
          product_name: item.product_name,
        })),
        payment_term: isInstallment ? 'installment' : 'full',
        installment_term_months: isInstallment ? installmentTermMonths : null,
        downpayment_amount: isInstallment ? downpaymentAmount : null,
        monthly_amortization: isInstallment ? monthlyAmortization : null,
        interest_rate: isInstallment ? currentInterestRate : null,
        total_payable: isInstallment ? totalPayable : totalCashPrice,
      };

      const res = await api.ewallet.createCheckout(payload);
      if (res?.success && res?.deposit) {
        setCheckoutData(res.deposit);
        setPollingStatus('waiting');
        setStep(2);
      } else {
        throw new Error(res?.message || 'Failed to generate payment gateway session.');
      }
    } catch (err) {
      console.error(err);
      setError(err.message || 'Error communicating with payment gateway.');
    } finally {
      setLoading(false);
    }
  };

  // Copy reference code
  const handleCopyReference = () => {
    if (!checkoutData?.transaction_reference) return;
    navigator.clipboard.writeText(checkoutData.transaction_reference);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };


  // Proof of payment image picker handlers
  const handleProofChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showWarning('Invalid File', 'Please choose an image file (PNG, JPG, JPEG, WEBP).');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showWarning('File Too Large', 'The image size exceeds 5MB. Please choose a smaller image.');
      return;
    }
    setProofFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      setProofPreview(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveProof = () => {
    setProofFile(null);
    setProofPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Submit payment for store admin verification & receipt
  const handleManualVerify = async () => {
    if (!checkoutData?.transaction_reference) return;

    const trimmedRef = (customerRef || '').trim();
    if (!trimmedRef) {
      showWarning('Transaction Reference Required', `Please enter the Transaction Reference number from your ${selectedMethod} payment receipt.`);
      return;
    }

    if (!proofFile && !checkoutData?.proof_of_payment) {
      showWarning('Proof of Payment Required', 'Please insert or upload a screenshot of your payment receipt before submitting.');
      return;
    }

    setVerifyingManually(true);
    try {
      const formData = new FormData();
      formData.append('reference', checkoutData.transaction_reference);
      formData.append('customer_reference', trimmedRef);
      if (proofFile) {
        formData.append('proof_of_payment', proofFile);
      }

      const res = await api.ewallet.simulateWebhook(formData);
      if (res?.success) {
        if (res.is_paid) {
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          setPollingStatus('paid');
        } else {
          setPollingStatus('pending');
        }
        if (res.deposit) {
          setCheckoutData(prev => ({
            ...prev,
            ...res.deposit,
            customer_reference: res.customer_reference || res.deposit.customer_reference || customerRef,
            proof_of_payment_url: res.proof_of_payment_url || proofPreview,
            payment_status: res.is_paid ? 'paid' : 'pending',
          }));
        }
        setStep(3);
        triggerDataSync('payments');
        triggerDataSync('sales');
        triggerDataSync('installments');
        if (onSuccess) onSuccess(res);
      }
    } catch (err) {
      console.error(err);
      try {
        const checkRes = await api.ewallet.checkStatus(checkoutData.transaction_reference);
        if (checkRes?.is_paid) {
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          setPollingStatus('paid');
        } else {
          setPollingStatus('pending');
        }
        if (checkRes?.deposit) {
          setCheckoutData(prev => ({
            ...prev,
            ...checkRes.deposit,
            customer_reference: checkRes.customer_reference || checkRes.deposit.customer_reference || customerRef,
            proof_of_payment_url: checkRes.proof_of_payment_url || proofPreview,
            payment_status: checkRes.is_paid ? 'paid' : 'pending',
          }));
        }
        setStep(3);
        triggerDataSync('payments');
        triggerDataSync('sales');
        triggerDataSync('installments');
        if (onSuccess) onSuccess(checkRes);
      } catch (e) {
        console.error(e);
      }
    } finally {
      setVerifyingManually(false);
    }
  };

  // Dynamic Gateway branding colors and labels
  const getGatewayTheme = () => {
    if (selectedMethod === 'Maya') {
      return {
        bg: 'bg-gradient-to-r from-[#00a82d] to-[#00d632]',
        btnBg: 'bg-[#00a82d] hover:bg-[#009428] active:bg-[#008022]',
        btnText: 'Open in Maya App',
        logoText: 'M',
        title: 'Maya Payment Gateway',
      };
    }
    if (selectedMethod === 'BDO') {
      return {
        bg: 'bg-gradient-to-r from-[#002d72] to-[#0051a8]',
        btnBg: 'bg-[#002d72] hover:bg-[#002257] active:bg-[#00173d]',
        btnText: 'Open BDO Online Banking',
        logoText: 'BDO',
        title: 'BDO Online Banking Gateway',
      };
    }
    // Default GCash
    return {
      bg: 'bg-gradient-to-r from-[#005ce6] to-[#0084ff]',
      btnBg: 'bg-[#005ce6] hover:bg-[#0051cc] active:bg-[#0047b3]',
      btnText: 'Open in GCash App',
      logoText: 'G',
      title: 'GCash Payment Gateway',
    };
  };

  const gatewayTheme = getGatewayTheme();

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-[fadeIn_0.2s_ease]"
        onClick={(e) => { if (e.target === e.currentTarget && !loading) onClose(); }}
      >
        <div className="bg-card w-full max-w-xl rounded-3xl shadow-2xl border border-border flex flex-col max-h-[92vh] overflow-hidden animate-[slideUp_0.2s_ease]">

          {/* ─── Modal Header ─── */}
          <div className="flex items-start justify-between p-6 pb-4 border-b border-border/60 bg-muted/20 relative shrink-0">
            {step === 2 && (
              <button
                onClick={() => setStep(1)}
                className="mr-3 p-1.5 rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                title="Back to payment details"
              >
                <FiArrowLeft className="w-5 h-5" />
              </button>
            )}

            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-extrabold text-foreground tracking-tight flex items-center gap-2">
                <FiShoppingBag className="w-5 h-5 text-purple-600 shrink-0" />
                <span>{step === 1 ? 'Make Payment' : step === 2 ? gatewayTheme.title : 'Payment Confirmed'}</span>
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5 font-medium truncate">
                {step === 1
                  ? (orderItems.length > 0
                    ? 'Review your order and select your payment method'
                    : 'Choose where you want to make payment from')
                  : step === 2
                    ? `Complete your transfer using ${selectedMethod} deep link or InstaPay QR`
                    : 'Your payment has been verified and your order is confirmed!'}
              </p>
            </div>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors cursor-pointer shrink-0 ml-3"
              aria-label="Close"
            >
              <FiX className="w-4 h-4" />
            </button>
          </div>

          {/* ─── Modal Body ─── */}
          <div className="overflow-y-auto p-6 space-y-5 flex-1">

            {/* ══════════════════════════════════════════════════════════════════════
                STEP 1: PRODUCT LIST, INSTALLMENT TERMS & PAYMENT METHOD
               ══════════════════════════════════════════════════════════════════════ */}
            {step === 1 && (
              <form onSubmit={handleContinue} className="space-y-5">
                {error && (
                  <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2.5">
                    <FiAlertCircle className="w-4 h-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                {/* ─── 1. Installment Due Payment Banner with Product Image ─── */}
                {isInstallmentPayment ? (
                  <div className="rounded-2xl border border-purple-200/90 dark:border-purple-800/80 bg-gradient-to-br from-purple-50/70 via-background to-purple-50/30 dark:from-purple-950/30 dark:via-background dark:to-purple-950/10 p-4 space-y-3.5 shadow-sm">
                    <div className="flex items-center gap-3.5">
                      {/* Product Image Thumbnail */}
                      <div className="w-16 h-16 rounded-2xl bg-white dark:bg-card border border-purple-200 dark:border-purple-800/80 overflow-hidden shrink-0 shadow-xs flex items-center justify-center p-1 relative">
                        {installmentImageUrl ? (
                          <img
                            src={formatImgUrl(installmentImageUrl)}
                            alt={activeInstallment?.product || 'Product Image'}
                            className="w-full h-full object-cover rounded-xl"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                              const fallback = e.currentTarget.parentElement?.querySelector('.img-fallback');
                              if (fallback) fallback.style.display = 'flex';
                            }}
                          />
                        ) : null}
                        <div
                          className={`img-fallback w-full h-full rounded-xl bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-300 flex items-center justify-center ${installmentImageUrl ? 'hidden' : 'flex'}`}
                        >
                          <FiPackage className="w-7 h-7" />
                        </div>
                      </div>

                      {/* Installment Account Title & Product Info */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-purple-600 text-white shadow-2xs">
                            {activeInstallment?.account_no || 'INSTALLMENT'}
                          </span>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700 dark:text-purple-300">
                            Monthly Installment Due
                          </span>
                        </div>
                        <h4 className="text-sm font-black text-foreground truncate mt-1">
                          {activeInstallment?.product || 'Installment Product Account'}
                        </h4>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Account reference for due settlement
                        </p>
                      </div>

                      {/* Due Amount Highlight */}
                      {(activeInstallment?.monthly_payment || amount) && (
                        <div className="text-right shrink-0 pl-1">
                          <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wide block">
                            Due Amount
                          </span>
                          <span className="font-mono font-black text-base text-purple-700 dark:text-purple-300">
                            {fmt(activeInstallment?.monthly_payment || parseFloat(amount) || 0)}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Financial Metrics Strip */}
                    <div className="pt-2.5 border-t border-purple-200/60 dark:border-purple-800/40 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-[10px] text-muted-foreground block">Remaining Balance:</span>
                        <span className="font-mono font-bold text-foreground">
                          {activeInstallment?.balance !== undefined ? fmt(activeInstallment.balance) : 'Active'}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-muted-foreground block">Payment Status:</span>
                        <span className="font-bold text-emerald-600 dark:text-emerald-400 flex items-center justify-end gap-1">
                          <FiCheckCircle className="w-3 h-3" /> Ready for Settlement
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-border bg-background p-4 space-y-3 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-foreground uppercase tracking-wide flex items-center gap-2">
                        <FiPackage className="w-4 h-4 text-[#176B87]" />
                        <span>Order Summary</span>
                        {orderItems.length > 0 && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300">
                            {orderItems.length} {orderItems.length === 1 ? 'item' : 'items'}
                          </span>
                        )}
                      </span>

                      {/* Interactive "Select Product" Button */}
                      <button
                        type="button"
                        onClick={() => setIsSelectProductModalOpen(true)}
                        className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs hover:scale-105"
                      >
                        <FiShoppingBag className="w-3.5 h-3.5" />
                        <span>{orderItems.length > 0 ? 'Edit Selection' : 'Select Product'}</span>
                      </button>
                    </div>

                    {/* Items List or Empty State CTA */}
                    {orderItems.length > 0 ? (
                      <div className="space-y-3">
                        <div className="divide-y divide-border/60 max-h-52 overflow-y-auto pr-1 space-y-2">
                          {orderItems.map((item) => (
                            <div key={item.product_id} className="pt-2.5 first:pt-0 flex items-center justify-between gap-3">
                              {/* Thumbnail & Title */}
                              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                <div className="w-11 h-11 rounded-xl bg-muted border border-border/80 overflow-hidden shrink-0 flex items-center justify-center">
                                  {item.image_url ? (
                                    <img src={item.image_url} alt={item.product_name} className="w-full h-full object-cover" />
                                  ) : (
                                    <FiPackage className="w-5 h-5 text-muted-foreground" />
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs font-bold text-foreground truncate">{item.product_name}</p>
                                  <p className="text-[11px] font-mono text-muted-foreground">
                                    {fmt(item.price)} each
                                  </p>
                                </div>
                              </div>

                              {/* Quantity Controls & Line Total */}
                              <div className="flex items-center gap-2 shrink-0">
                                <div className="flex items-center border border-border rounded-lg bg-muted/40">
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateQuantity(item.product_id, -1)}
                                    className="w-6 h-6 flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                                    title="Decrease quantity"
                                  >
                                    <FiMinus className="w-2.5 h-2.5" />
                                  </button>
                                  <span className="w-6 text-center text-xs font-bold font-mono">{item.quantity}</span>
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateQuantity(item.product_id, 1)}
                                    className="w-6 h-6 flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                                    title="Increase quantity"
                                  >
                                    <FiPlus className="w-2.5 h-2.5" />
                                  </button>
                                </div>

                                <div className="text-right min-w-[70px]">
                                  <span className="text-xs font-extrabold text-foreground font-mono">
                                    {fmt(item.price * item.quantity)}
                                  </span>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => handleRemoveItem(item.product_id)}
                                  className="p-1 text-muted-foreground hover:text-rose-500 transition-colors cursor-pointer"
                                  title="Remove item"
                                >
                                  <FiTrash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Cash Price Summary Bar */}
                        <div className="pt-2 border-t border-border flex justify-between items-center text-xs">
                          <span className="text-muted-foreground font-medium">Total Products Cash Value:</span>
                          <span className="font-mono font-black text-foreground text-sm">{fmt(totalCashPrice)}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="p-6 text-center bg-muted/20 border-2 border-dashed border-border rounded-2xl space-y-3">
                        <FiPackage className="w-10 h-10 text-muted-foreground/50 mx-auto" />
                        <div>
                          <h4 className="text-xs font-bold text-foreground">No Products Selected</h4>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            Choose items from our Furniture & Appliances catalog to proceed with payment.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsSelectProductModalOpen(true)}
                          className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition-all inline-flex items-center gap-2 cursor-pointer shadow-sm hover:scale-105"
                        >
                          <FiShoppingBag className="w-3.5 h-3.5" />
                          <span>Select Furniture & Appliances</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* ─── 1.5 Payment Terms & Store Admin Installment Control ─── */}
                {/* ─── 1.5 Payment Terms & Store Admin Installment Control (Only shown when installment is allowed) ─── */}
                {!isInstallmentPayment && orderItems.length > 0 && isInstallmentAllowed && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">
                        Payment Terms
                      </label>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 flex items-center gap-1 border border-emerald-300 dark:border-emerald-800">
                        <FiCheckCircle className="w-3 h-3 text-emerald-600" />
                        Store Admin Authorized
                      </span>
                    </div>

                    {/* Authorized: Customer can choose Full Payment or Installment Plan */}
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-2.5">
                        {/* Full Payment Button */}
                        <button
                          type="button"
                          onClick={() => setPaymentTerm('full')}
                          className={`p-3 rounded-2xl border-2 text-left transition-all cursor-pointer ${paymentTerm === 'full'
                              ? 'border-purple-600 bg-purple-50/50 dark:bg-purple-950/30 shadow-sm ring-2 ring-purple-500/20'
                              : 'border-border bg-background hover:bg-muted/40'
                            }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-bold text-foreground">Full Payment</span>
                            <span className="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 border-purple-600">
                              {paymentTerm === 'full' && <div className="w-2 h-2 rounded-full bg-purple-600" />}
                            </span>
                          </div>
                          <p className="text-[11px] text-muted-foreground">100% Cash Price</p>
                          <p className="font-mono font-bold text-xs text-foreground mt-1">
                            {fmt(totalCashPrice)}
                          </p>
                        </button>

                        {/* Installment Plan Button */}
                        <button
                          type="button"
                          onClick={() => setPaymentTerm('installment')}
                          className={`p-3 rounded-2xl border-2 text-left transition-all cursor-pointer ${paymentTerm === 'installment'
                              ? 'border-purple-600 bg-purple-50/50 dark:bg-purple-950/30 shadow-sm ring-2 ring-purple-500/20'
                              : 'border-border bg-background hover:bg-muted/40'
                            }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-bold text-foreground">Installment Plan</span>
                            <span className="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 border-purple-600">
                              {paymentTerm === 'installment' && <div className="w-2 h-2 rounded-full bg-purple-600" />}
                            </span>
                          </div>
                          <p className="text-[11px] text-muted-foreground">20% Downpayment</p>
                          <p className="font-mono font-bold text-xs text-purple-700 dark:text-purple-300 mt-1">
                            {fmt(downpaymentAmount)} today
                          </p>
                        </button>
                      </div>

                      {/* If Installment is chosen, show term selector and amortization breakdown */}
                      {paymentTerm === 'installment' && (
                        <div className="p-3.5 rounded-2xl bg-purple-50/40 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                              <FiCalendar className="w-3.5 h-3.5 text-purple-600" />
                              Select Payment Duration:
                            </span>
                            <span className="text-[11px] text-muted-foreground font-semibold">
                              {currentInterestRate === 0 ? '0% Interest' : `${currentInterestRate}% Interest`}
                            </span>
                          </div>

                          <div className="grid grid-cols-3 gap-2">
                            {[
                              { months: 3, label: '3 Months', rate: '0% int.' },
                              { months: 6, label: '6 Months', rate: '3% int.' },
                              { months: 12, label: '12 Months', rate: '6% int.' },
                            ].map(t => (
                              <button
                                key={t.months}
                                type="button"
                                onClick={() => setInstallmentTermMonths(t.months)}
                                className={`py-2 px-2 rounded-xl text-center border font-bold text-xs transition-all cursor-pointer ${installmentTermMonths === t.months
                                    ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                                    : 'bg-background text-foreground border-border hover:bg-muted'
                                  }`}
                              >
                                <div>{t.label}</div>
                                <div className={`text-[10px] font-normal ${installmentTermMonths === t.months ? 'text-purple-200' : 'text-muted-foreground'}`}>
                                  {t.rate}
                                </div>
                              </button>
                            ))}
                          </div>

                          {/* Monthly breakdown card */}
                          <div className="pt-2 border-t border-purple-200 dark:border-purple-800/60 grid grid-cols-3 gap-2 text-center text-xs">
                            <div>
                              <span className="text-[10px] text-muted-foreground block">Downpayment (20%)</span>
                              <span className="font-mono font-bold text-foreground">{fmt(downpaymentAmount)}</span>
                            </div>
                            <div>
                              <span className="text-[10px] text-muted-foreground block">Monthly ({installmentTermMonths}x)</span>
                              <span className="font-mono font-black text-purple-700 dark:text-purple-300">
                                {fmt(monthlyAmortization)}/mo
                              </span>
                            </div>
                            <div>
                              <span className="text-[10px] text-muted-foreground block">Total Financed</span>
                              <span className="font-mono font-bold text-foreground">{fmt(totalPayable)}</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ─── 2. Payment Method Tabs (E-wallets / Bank accounts) ─── */}
                <div className="flex p-1 rounded-2xl bg-muted border border-border">
                  <button
                    type="button"
                    onClick={() => { setActiveTab('ewallet'); setSelectedMethod('GCash'); }}
                    className={`flex-1 py-2.5 text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer ${activeTab === 'ewallet'
                        ? 'bg-card text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                      }`}
                  >
                    <FiSmartphone className="w-4 h-4 text-blue-500" />
                    E-wallets
                  </button>
                  <button
                    type="button"
                    onClick={() => { setActiveTab('bank'); setSelectedMethod('BDO'); }}
                    className={`flex-1 py-2.5 text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer ${activeTab === 'bank'
                        ? 'bg-card text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                      }`}
                  >
                    <FiCreditCard className="w-4 h-4 text-emerald-500" />
                    Bank accounts
                  </button>
                </div>

                {/* ─── 3. Payment Method Cards ─── */}
                <div className="space-y-3">
                  {activeTab === 'ewallet' ? (
                    <>
                      {/* GCash Card */}
                      <div
                        onClick={() => setSelectedMethod('GCash')}
                        className={`p-3.5 rounded-2xl border-2 transition-all cursor-pointer flex items-center justify-between group ${selectedMethod === 'GCash'
                            ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-950/20 shadow-md ring-2 ring-blue-500/20'
                            : 'border-border hover:border-border/80 bg-background hover:bg-muted/30'
                          }`}
                      >
                        <div className="flex items-center gap-3.5">
                          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-[#005ce6] to-[#0091ff] flex items-center justify-center text-white font-black text-lg shadow-md shrink-0">
                            G
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm text-foreground">GCash</span>
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300">
                                Instant
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">Instant checkout • Fee: Free</p>
                          </div>
                        </div>

                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${selectedMethod === 'GCash' ? 'border-blue-600 bg-blue-600' : 'border-muted-foreground/40'
                          }`}>
                          {selectedMethod === 'GCash' && <div className="w-2 h-2 rounded-full bg-white"></div>}
                        </div>
                      </div>

                      {/* Maya Card */}
                      <div
                        onClick={() => setSelectedMethod('Maya')}
                        className={`p-3.5 rounded-2xl border-2 transition-all cursor-pointer flex items-center justify-between group ${selectedMethod === 'Maya'
                            ? 'border-emerald-600 bg-emerald-50/50 dark:bg-emerald-950/20 shadow-md ring-2 ring-emerald-500/20'
                            : 'border-border hover:border-border/80 bg-background hover:bg-muted/30'
                          }`}
                      >
                        <div className="flex items-center gap-3.5">
                          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-[#00a82d] to-[#00d632] flex items-center justify-center text-white font-black text-lg shadow-md shrink-0">
                            M
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm text-foreground">Maya</span>
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300">
                                Instant
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">Instant checkout • Fee: Free</p>
                          </div>
                        </div>

                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${selectedMethod === 'Maya' ? 'border-emerald-600 bg-emerald-600' : 'border-muted-foreground/40'
                          }`}>
                          {selectedMethod === 'Maya' && <div className="w-2 h-2 rounded-full bg-white"></div>}
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Bank accounts strictly restricted to BDO online banking */}
                      <div
                        onClick={() => setSelectedMethod('BDO')}
                        className={`p-3.5 rounded-2xl border-2 transition-all cursor-pointer flex items-center justify-between group ${selectedMethod === 'BDO'
                            ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/20 shadow-md ring-2 ring-indigo-500/20'
                            : 'border-border hover:border-border/80 bg-background hover:bg-muted/30'
                          }`}
                      >
                        <div className="flex items-center gap-3.5">
                          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-[#002d72] to-[#0051a8] text-white flex items-center justify-center font-black text-xs shrink-0 shadow-md">
                            BDO
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm text-foreground">BDO Online Banking</span>
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300">
                                Direct
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">Instant transfer via InstaPay • Fee: Free</p>
                          </div>
                        </div>

                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${selectedMethod === 'BDO' ? 'border-indigo-600 bg-indigo-600' : 'border-muted-foreground/40'
                          }`}>
                          {selectedMethod === 'BDO' && <div className="w-2 h-2 rounded-full bg-white"></div>}
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* ─── 4. Amount Input Field (Strictly Reflects Product Total or Downpayment) ─── */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">
                      {isInstallmentPayment
                        ? 'Installment Due Amount'
                        : (orderItems.length > 0
                          ? (paymentTerm === 'installment' && isInstallmentAllowed
                            ? 'Initial Downpayment Due Today (20%)'
                            : 'Total Product Amount')
                          : 'Payment Amount')}
                    </label>
                    <span className="text-[11px] font-medium text-muted-foreground">Currency: PHP (₱)</span>
                  </div>

                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-bold text-muted-foreground pointer-events-none">
                      ₱
                    </span>
                    <input
                      type="text"
                      value={amount}
                      onChange={handleAmountChange}
                      placeholder="0.00"
                      className="w-full pl-10 pr-4 py-3 text-2xl font-black text-foreground bg-muted/30 hover:bg-muted/50 focus:bg-background border border-border focus:border-purple-600 rounded-2xl outline-none transition-all shadow-inner"
                    />
                  </div>

                  {orderItems.length > 0 && paymentTerm === 'installment' && isInstallmentAllowed && (
                    <p className="text-[11px] text-muted-foreground">
                      * 20% downpayment to finalize your installment application. Remaining balance of {fmt(principalFinanced + interestAmount)} will be billed across {installmentTermMonths} monthly payments of {fmt(monthlyAmortization)}.
                    </p>
                  )}
                </div>

                {/* ─── 5. Single Direct Primary Action Button ─── */}
                <div className="space-y-3 pt-2">
                  <button
                    type="submit"
                    disabled={loading || !amount || parseFloat(amount) <= 0}
                    className="w-full py-4 px-6 rounded-2xl bg-[#7c3aed] hover:bg-[#6d28d9] active:bg-[#5b21b6] text-white font-bold text-sm shadow-lg shadow-purple-600/30 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed group hover:scale-[1.01]"
                  >
                    {loading ? (
                      <>
                        <FiRefreshCw className="w-4 h-4 animate-spin" />
                        Connecting to {selectedMethod} Gateway...
                      </>
                    ) : (
                      <>
                        <FiLock className="w-4 h-4 transition-transform group-hover:scale-110" />
                        <span>
                          {isInstallmentPayment
                            ? `Pay Due ${amount ? fmt(parseFloat(amount) || 0) : ''} via ${selectedMethod}`
                            : (paymentTerm === 'installment' && isInstallmentAllowed && orderItems.length > 0
                              ? `Pay Downpayment ${amount ? fmt(parseFloat(amount) || 0) : ''} via ${selectedMethod}`
                              : `Pay ${amount ? fmt(parseFloat(amount) || 0) : ''} via ${selectedMethod}`)}
                        </span>
                      </>
                    )}
                  </button>

                  {/* Subtle Security Footer */}
                  <div className="flex items-center justify-center gap-2 text-center text-xs text-muted-foreground/80 pt-1 font-medium">
                    <FiShield className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Your payment details are encrypted and secure</span>
                  </div>
                </div>
              </form>
            )}

            {/* ══════════════════════════════════════════════════════════════════════
                STEP 2: PAYMENT GATEWAY INTEGRATION & REDIRECTION SCREEN
               ══════════════════════════════════════════════════════════════════════ */}
            {step === 2 && checkoutData && (
              <div className="space-y-6">

                {/* Dynamic Gateway Header Banner */}
                <div className={`rounded-2xl p-4 ${gatewayTheme.bg} text-white shadow-md relative overflow-hidden flex items-center justify-between`}>
                  <div className="relative z-10 flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-white text-slate-900 font-black text-xl flex items-center justify-center shadow">
                      {gatewayTheme.logoText}
                    </div>
                    <div>
                      <h3 className="font-extrabold text-base tracking-tight leading-none">{selectedMethod} Gateway</h3>
                      <p className="text-[11px] text-white/80 mt-1">Merchant: PROJECT: PACE Store</p>
                    </div>
                  </div>

                  {/* Pulsing Status Pill */}
                  <div className="relative z-10 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/20 backdrop-blur-md text-[11px] font-bold">
                    <span className="w-2 h-2 rounded-full bg-amber-300 animate-ping"></span>
                    <span>Awaiting Payment</span>
                  </div>
                </div>

                {/* Dynamic Product & Installment Summary Card */}
                <div className="py-3.5 px-4 bg-muted/30 rounded-2xl border border-border/80 flex items-center justify-between gap-3 text-left">
                  {/* Left: Product Image & Identification */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-14 h-14 rounded-2xl bg-white dark:bg-card border border-border overflow-hidden shrink-0 flex items-center justify-center p-0.5 shadow-xs relative">
                      {isInstallmentPayment ? (
                        installmentImageUrl ? (
                          <img
                            src={formatImgUrl(installmentImageUrl)}
                            alt={activeInstallment?.product || 'Product'}
                            className="w-full h-full object-cover rounded-xl"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                              const fallback = e.currentTarget.parentElement?.querySelector('.img-fallback');
                              if (fallback) fallback.style.display = 'flex';
                            }}
                          />
                        ) : (
                          <FiPackage className="w-6 h-6 text-purple-600" />
                        )
                      ) : (
                        orderItems.length > 0 && orderItems[0].image_url ? (
                          <img
                            src={formatImgUrl(orderItems[0].image_url)}
                            alt={orderItems[0].product_name || 'Product'}
                            className="w-full h-full object-cover rounded-xl"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                              const fallback = e.currentTarget.parentElement?.querySelector('.img-fallback');
                              if (fallback) fallback.style.display = 'flex';
                            }}
                          />
                        ) : (
                          <FiPackage className="w-6 h-6 text-purple-600" />
                        )
                      )}
                      <div className="img-fallback hidden w-full h-full rounded-xl bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-300 items-center justify-center">
                        <FiPackage className="w-6 h-6" />
                      </div>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-purple-100 text-purple-700 dark:bg-purple-900/60 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                          {isInstallmentPayment
                            ? (activeInstallment?.account_no || 'INSTALLMENT')
                            : (checkoutData.transaction_reference || 'ORDER')}
                        </span>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          {isInstallmentPayment ? 'Installment Due' : (paymentTerm === 'installment' ? 'Downpayment' : 'Product Order')}
                        </span>
                      </div>
                      <h4 className="text-xs font-bold text-foreground truncate mt-1">
                        {isInstallmentPayment
                          ? (activeInstallment?.product || activeInstallment?.product_name || 'Installment Product')
                          : (orderItems.length > 0
                              ? (orderItems.length === 1
                                  ? orderItems[0].product_name
                                  : `${orderItems[0].product_name} (+${orderItems.length - 1} more)`)
                              : 'Online Order')}
                      </h4>
                      <p className="text-[11px] font-mono text-muted-foreground mt-0.5 truncate">
                        Ref: {checkoutData.transaction_reference}
                      </p>
                    </div>
                  </div>

                  {/* Right: Amount Due */}
                  <div className="text-right shrink-0 pl-2">
                    <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                      {isInstallmentPayment ? 'Due Amount' : 'Total Amount'}
                    </p>
                    <div className="text-xl sm:text-2xl font-black text-foreground mt-0.5 tracking-tight font-mono">
                      {fmt(checkoutData.amount)}
                    </div>
                    <p className="text-[10px] text-emerald-600 font-semibold mt-0.5">
                      Fee: ₱0.00 Free
                    </p>
                  </div>
                </div>

                {/* Official InstaPay / QR Ph Scanner */}
                <div className="rounded-2xl border border-border p-5 bg-card text-center space-y-3.5">
                  <div className="flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    <span>SCAN WITH {selectedMethod.toUpperCase()} / INSTAPAY APP</span>
                  </div>

                  {/* Dynamic QR Code Frame with authentic InstaPay / QR Ph Logo */}
                  <div className="flex justify-center">
                    <div className="p-3.5 bg-white rounded-2xl shadow-md border border-slate-200 inline-block relative max-w-[240px]">
                      <img
                        src={instapayQrImg}
                        alt="Official InstaPay QR Code"
                        className="w-48 h-48 sm:w-52 sm:h-52 object-contain mx-auto rounded-xl"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          const fallback = e.currentTarget.parentElement?.querySelector('.qr-fallback');
                          if (fallback) fallback.style.display = 'block';
                        }}
                      />
                      <div className="qr-fallback hidden">
                        <QRCodeSVG
                          value={checkoutData.qr_code_data || "00020101021127830012com.p2pqrpay0111GXCHPHM2XXX02089996440303152170200000006560417DWQM4TK3JDO6S94595204601653036085802PH5913CH*******M C.6008Balulang6104123463042E79"}
                          size={192}
                          level="M"
                          includeMargin={false}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5 pt-1">
                    <p className="font-bold text-xs sm:text-sm text-foreground">
                      Scan with your mobile camera or banking QR scanner
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      1. Open {selectedMethod} app → 2. Tap <strong>'Scan QR'</strong> → 3. Point camera at screen
                    </p>
                    <div className="pt-1 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                      <span>Recipient:</span>
                      <span className="font-mono text-purple-600 dark:text-purple-400 font-bold">CH*******M C.</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted border border-border font-medium">GCash · Balulang</span>
                    </div>
                  </div>
                </div>


                {/* Customer Reference & Proof of Payment Upload Card */}
                <div className="p-4 rounded-2xl bg-muted/30 border border-border/80 space-y-4">
                  {/* Transaction Reference Input */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-bold text-foreground flex items-center gap-1.5 uppercase tracking-wide">
                        <FiHash className="w-3.5 h-3.5 text-purple-600" />
                        <span>Transaction Reference</span>
                        <span className="text-rose-500 font-black text-xs">*</span>
                      </label>
                      <span className="text-[10px] text-muted-foreground font-medium">From {selectedMethod} receipt (Required)</span>
                    </div>
                    <div className="relative">
                      <input
                        type="text"
                        value={customerRef}
                        onChange={(e) => setCustomerRef(e.target.value)}
                        placeholder="e.g. 1002 9381 7263 or Ref No."
                        className="w-full px-3.5 py-2.5 text-xs sm:text-sm font-mono font-bold bg-background text-foreground border border-border focus:border-purple-600 rounded-xl outline-none transition-all shadow-inner placeholder:font-normal placeholder:font-sans placeholder:text-muted-foreground/60"
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Enter the reference number from your {selectedMethod} payment confirmation receipt.
                    </p>
                  </div>

                  {/* Insert Image / Choose Image Proof */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-bold text-foreground flex items-center gap-1.5 uppercase tracking-wide">
                        <FiImage className="w-3.5 h-3.5 text-purple-600" />
                        <span>Proof of Payment (Insert Image)</span>
                        <span className="text-rose-500 font-black text-xs">*</span>
                      </label>
                      <span className="text-[10px] text-muted-foreground font-medium">Required (Max 5MB)</span>
                    </div>

                    {/* Hidden file input */}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleProofChange}
                      className="hidden"
                    />

                    {!proofPreview ? (
                      <div
                        onClick={() => fileInputRef.current?.click()}
                        className="border-2 border-dashed border-border hover:border-purple-500/80 rounded-2xl p-4 bg-background/50 hover:bg-purple-50/20 dark:hover:bg-purple-950/10 transition-all cursor-pointer flex flex-col items-center justify-center gap-2 group text-center"
                      >
                        <div className="w-10 h-10 rounded-2xl bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-300 flex items-center justify-center group-hover:scale-110 transition-transform shadow-xs">
                          <FiUploadCloud className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-foreground group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                            Insert Image / Choose Image
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            Click to choose or browse receipt screenshot
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="p-3 rounded-2xl border border-purple-200 dark:border-purple-900/50 bg-purple-50/40 dark:bg-purple-950/20 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className="w-14 h-14 rounded-xl border border-border bg-black/10 overflow-hidden shrink-0 shadow-xs relative group cursor-pointer"
                            onClick={() => fileInputRef.current?.click()}
                            title="Click to choose different image"
                          >
                            <img
                              src={proofPreview}
                              alt="Proof preview"
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-[10px] font-bold transition-opacity">
                              Change
                            </div>
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-foreground truncate">
                              {proofFile?.name || 'receipt_screenshot.png'}
                            </p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {proofFile ? `${(proofFile.size / 1024).toFixed(1)} KB` : 'Image attached'} • <span className="text-emerald-600 font-semibold">Ready to verify</span>
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="px-2.5 py-1.5 rounded-xl border border-border bg-background hover:bg-muted text-[11px] font-semibold text-foreground transition-colors cursor-pointer"
                          >
                            Change
                          </button>
                          <button
                            type="button"
                            onClick={handleRemoveProof}
                            className="p-1.5 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 text-rose-600 hover:bg-rose-100 dark:hover:bg-rose-900/60 transition-colors cursor-pointer"
                            title="Remove image"
                          >
                            <FiTrash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Action 3: Payment Submit Action Button */}
                <div className="space-y-2">
                  {(() => {
                    const hasRef = Boolean(customerRef && customerRef.trim());
                    const hasProof = Boolean(proofFile || checkoutData?.proof_of_payment);
                    const isReady = hasRef && hasProof;

                    return (
                      <>
                        <button
                          type="button"
                          disabled={verifyingManually || !isReady}
                          onClick={handleManualVerify}
                          className={`w-full py-4 px-6 rounded-2xl font-extrabold text-sm sm:text-base tracking-wide flex items-center justify-center gap-2.5 transition-all ${
                            isReady && !verifyingManually
                              ? 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white shadow-lg shadow-emerald-600/30 cursor-pointer hover:scale-[1.01]'
                              : 'bg-muted text-muted-foreground border border-border cursor-not-allowed opacity-60'
                          }`}
                        >
                          {verifyingManually ? (
                            <>
                              <FiRefreshCw className="w-4 h-4 animate-spin" />
                              <span>Submitting Payment...</span>
                            </>
                          ) : (
                            <>
                              <FiCheckCircle className="w-5 h-5" />
                              <span>PAYMENT</span>
                            </>
                          )}
                        </button>
                      </>
                    );
                  })()}
                </div>

                {/* Real-time Gateway Confirmation Status */}
                <div className="p-4 rounded-2xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs font-bold text-blue-700 dark:text-blue-300">
                    <FiRefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600" />
                    <span>Awaiting Gateway Confirmation</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Our secure payment listener will automatically update this screen as soon as your transaction is confirmed by {selectedMethod}.
                  </p>
                </div>

              </div>
            )}

            {/* ══════════════════════════════════════════════════════════════════════
                STEP 3: PAYMENT SUBMISSION & RECEIPT CONFIRMATION
               ══════════════════════════════════════════════════════════════════════ */}
            {step === 3 && (() => {
              const isPaid = pollingStatus === 'paid' || checkoutData?.status === 'paid' || checkoutData?.status === 'Completed' || checkoutData?.payment_status === 'paid';
              return (
              <div className="text-center py-4 space-y-5 animate-[scaleUp_0.2s_ease]">
                {isPaid ? (
                  <div className="w-20 h-20 rounded-full bg-emerald-100 dark:bg-emerald-950/60 border-2 border-emerald-500 text-emerald-600 dark:text-emerald-400 mx-auto flex items-center justify-center shadow-lg shadow-emerald-500/20">
                    <FiCheckCircle className="w-10 h-10" />
                  </div>
                ) : (
                  <div className="w-20 h-20 rounded-full bg-amber-100 dark:bg-amber-950/60 border-2 border-amber-500 text-amber-600 dark:text-amber-400 mx-auto flex items-center justify-center shadow-lg shadow-amber-500/20">
                    <FiClock className="w-10 h-10 animate-pulse text-amber-600 dark:text-amber-400" />
                  </div>
                )}

                <div>
                  <h3 className="text-2xl font-black text-foreground tracking-tight">
                    {isPaid ? 'Payment Confirmed & Paid! 🎉' : 'Payment Submitted! ⏳'}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1 font-medium max-w-md mx-auto">
                    {isPaid
                      ? 'Your payment has been officially received and applied to your account by the store administrator.'
                      : 'Your payment proof and transaction reference have been submitted. It is now pending verification and official receipt by your Store Administrator.'}
                  </p>
                </div>

                {!isPaid && (
                  <div className="p-3.5 rounded-2xl bg-amber-50/90 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-left text-xs space-y-1">
                    <div className="flex items-center gap-2 font-bold text-amber-800 dark:text-amber-300">
                      <FiClock className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>Pending Store Admin Receipt</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed pl-6">
                      Your store administrator will inspect the receipt screenshot and transaction reference. Once received, your installment balance will be credited.
                    </p>
                  </div>
                )}

                {/* Receipt Summary Card */}
                <div className="p-4 rounded-2xl bg-muted/40 border border-border text-left space-y-2.5 text-xs">
                  <div className="flex justify-between items-center py-1 border-b border-border/50">
                    <span className="text-muted-foreground">
                      Total Amount Paid
                    </span>
                    <span className="font-black text-sm text-foreground">{fmt(checkoutData?.amount || amount)}</span>
                  </div>

                  <div className="flex justify-between items-center py-1 border-b border-border/50">
                    <span className="text-muted-foreground">Payment Method</span>
                    <span className="font-bold text-foreground">{checkoutData?.payment_method || selectedMethod}</span>
                  </div>

                  <div className="flex justify-between items-center py-1 border-b border-border/50">
                    <span className="text-muted-foreground">Reference Number</span>
                    <span className="font-mono font-bold text-foreground">{checkoutData?.transaction_reference}</span>
                  </div>

                  {(customerRef || checkoutData?.customer_reference) && (
                    <div className="flex justify-between items-center py-1 border-b border-border/50">
                      <span className="text-muted-foreground">Customer Reference</span>
                      <span className="font-mono font-bold text-purple-600 dark:text-purple-400">
                        {checkoutData?.customer_reference || customerRef}
                      </span>
                    </div>
                  )}

                  {(proofPreview || checkoutData?.proof_of_payment_url || checkoutData?.proof_of_payment) && (
                    <div className="py-2 border-b border-border/50 flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">Proof of Payment</span>
                      <div className="flex items-center gap-2">
                        <img
                          src={checkoutData?.proof_of_payment_url || (checkoutData?.proof_of_payment ? formatImgUrl(checkoutData.proof_of_payment) : proofPreview)}
                          alt="Proof receipt"
                          className="w-10 h-10 object-cover rounded-lg border border-border shadow-xs cursor-pointer hover:scale-105 transition-transform"
                          onClick={() => {
                            const src = checkoutData?.proof_of_payment_url || (checkoutData?.proof_of_payment ? formatImgUrl(checkoutData.proof_of_payment) : proofPreview);
                            if (src) window.open(src, '_blank');
                          }}
                        />
                        <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1">
                          <FiCheck className="w-3 h-3" /> Attached
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-between items-center py-1 border-b border-border/50">
                    <span className="text-muted-foreground">Payment Status</span>
                    {isPaid ? (
                      <span className="font-bold text-emerald-600 flex items-center gap-1">
                        <FiCheck className="w-3.5 h-3.5" /> Received & Paid
                      </span>
                    ) : (
                      <span className="font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                        <FiClock className="w-3.5 h-3.5 animate-pulse" /> Pending Store Admin Receipt
                      </span>
                    )}
                  </div>

                  {/* Purchased items list (for product orders) */}
                  {!isInstallmentPayment && orderItems.length > 0 && (
                    <div className="py-2 border-b border-border/50 space-y-1">
                      <span className="text-muted-foreground font-semibold">Purchased Items:</span>
                      {orderItems.map((item, idx) => (
                        <div key={idx} className="flex justify-between text-foreground">
                          <span>{item.quantity}x {item.product_name}</span>
                          <span className="font-mono">{fmt(item.price * item.quantity)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Installment Account details (for installment payments) */}
                  {isInstallmentPayment && (
                    <div className="py-2.5 border-b border-border/50 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-muted border border-border overflow-hidden shrink-0 flex items-center justify-center p-0.5">
                          {installmentImageUrl ? (
                            <img
                              src={formatImgUrl(installmentImageUrl)}
                              alt={activeInstallment?.product || 'Product'}
                              className="w-full h-full object-cover rounded-lg"
                            />
                          ) : (
                            <FiPackage className="w-5 h-5 text-purple-600" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-foreground text-xs truncate">
                            {activeInstallment?.product || 'Installment Product'}
                          </p>
                          <p className="font-mono text-[10px] text-muted-foreground">
                            {activeInstallment?.account_no || 'Account Due'}
                          </p>
                        </div>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${isPaid ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'}`}>
                        {isPaid ? 'Paid & Applied' : 'Pending Receipt'}
                      </span>
                    </div>
                  )}

                  <div className="flex justify-between items-center py-1">
                    <span className="text-muted-foreground">Submission Date</span>
                    <span className="font-medium text-foreground">{new Date().toLocaleString()}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onClose}
                  className="w-full py-3.5 px-6 rounded-2xl bg-[#7c3aed] hover:bg-[#6d28d9] text-white font-bold text-sm shadow-md shadow-purple-600/20 transition-all cursor-pointer"
                >
                  Done & Return to Dashboard
                </button>
              </div>
              );
            })()}

          </div>
        </div>
      </div>

      {/* ─── Product Selection Catalog Modal ─── */}
      <SelectProductModal
        isOpen={isSelectProductModalOpen}
        onClose={() => setIsSelectProductModalOpen(false)}
        initialSelectedItems={orderItems}
        onConfirm={(newSelectedItems) => {
          setOrderItems(newSelectedItems);
          if (newSelectedItems.length > 0) {
            const newTotalCash = newSelectedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
            setAmount(String(newTotalCash));
          } else {
            setAmount('');
          }
        }}
      />
    </>
  );
}
