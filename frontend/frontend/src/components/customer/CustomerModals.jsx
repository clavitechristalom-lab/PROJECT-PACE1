import React, { useState, useEffect } from 'react';
import { Modal, LoadingState, EmptyState, Badge, StatusBadge } from '../ui';
import { api } from '../../lib/api';
import { fmt } from '../../lib/utils';
import { FiPackage, FiCalendar, FiClock, FiCreditCard, FiAlertCircle, FiCheckCircle, FiFileText, FiMessageCircle, FiChevronLeft, FiChevronRight, FiShoppingCart, FiX, FiTrash2 } from 'react-icons/fi';
import { TbCurrencyPeso } from 'react-icons/tb';
import { useAuth } from '../../context/AuthContext';
import { triggerDataSync } from '../../lib/realtimeSync';
import Swal from 'sweetalert2';

export function ProductListModal({ isOpen, onClose, category, availableCategories = [], initialProductId = null }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Search and Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState(category || 'All');

  // Carousel state
  const [currentIndex, setCurrentIndex] = useState(0);
  const itemsPerPage = 3; // Desktop: 3 product cards visible

  // Detail Modal state
  const [selectedProduct, setSelectedProduct] = useState(null);

  useEffect(() => {
    if (initialProductId && products.length > 0 && !selectedProduct) {
      const prod = products.find(p => p.product_id == initialProductId);
      if (prod) setSelectedProduct(prod);
    }
  }, [initialProductId, products]);

  useEffect(() => {
    if (isOpen) {
      setActiveCategory(category || 'All');
    }
  }, [isOpen, category]);

  const loadProducts = () => {
    if (!isOpen) return;
    setLoading(true);
    const params = { status: 'Active' };
    if (activeCategory !== 'All') params.category = activeCategory;
    if (searchQuery) params.search = searchQuery;

    api.products.getAll(params)
      .then(data => {
        setProducts(data.products || []);
        setCurrentIndex(0);
      })
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadProducts();
    const interval = setInterval(loadProducts, 10000);
    return () => clearInterval(interval);
  }, [isOpen, activeCategory, searchQuery]);

  if (!isOpen) return null;

  const handleNext = () => {
    if (currentIndex + itemsPerPage < products.length) {
      setCurrentIndex(currentIndex + itemsPerPage);
    }
  };

  const handlePrev = () => {
    if (currentIndex - itemsPerPage >= 0) {
      setCurrentIndex(currentIndex - itemsPerPage);
    }
  };

  const visibleProducts = products.slice(currentIndex, currentIndex + itemsPerPage);
  const totalPages = Math.ceil(products.length / itemsPerPage);
  const currentPage = Math.floor(currentIndex / itemsPerPage);

  return (
    <>
      {/* BACKGROUND MODAL: CATEGORY PRODUCT MODAL */}
      <Modal isOpen={isOpen} onClose={onClose} title="Product Catalog" size="lg">
        <div className="flex flex-col relative h-[500px]">
          {/* Filter & Search Bar */}
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-4 pb-4 border-b border-border shrink-0">
            <div className="flex gap-2 overflow-x-auto pb-1 max-w-full">
              {Array.from(new Set(['All', ...availableCategories, 'Sale Items'])).map(cat => (
                <button
                  key={cat}
                  onClick={() => { setActiveCategory(cat); setCurrentIndex(0); }}
                  className={`px-4 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap transition-colors ${activeCategory === cat
                    ? 'bg-[#176B87] text-white cursor-default shadow-sm'
                    : 'bg-muted text-muted-foreground hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer'
                    }`}
                >
                  {cat}
                </button>
              ))}
            </div>
            <div className="relative w-full sm:w-64">
              <input
                type="text"
                placeholder="Search products..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentIndex(0); }}
                className="w-full bg-background border border-border rounded-lg pl-3 pr-4 py-1.5 text-sm focus:outline-none focus:border-[#176B87]"
              />
            </div>
          </div>

          {loading && products.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <LoadingState message="Loading products..." />
            </div>
          ) : products.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <EmptyState
                icon={<FiPackage className="w-12 h-12 text-muted-foreground/30 mx-auto" />}
                title={searchQuery ? "No matching products" : "No products found"}
                description={searchQuery ? `No products matching "${searchQuery}" in ${activeCategory}.` : `No products available in your branch at the moment.`}
              />
            </div>
          ) : (
            <div className="flex flex-col flex-1 relative justify-between">
              <div className="flex items-center gap-2 flex-1">
                <button
                  onClick={handlePrev}
                  disabled={currentIndex === 0}
                  className="p-2 shrink-0 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed text-[#176B87]"
                >
                  <FiChevronLeft className="w-6 h-6" />
                </button>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1 items-start">
                  {visibleProducts.map(p => {
                    const salePrice = p.discount_price || null;
                    const image = p.image_url || 'https://via.placeholder.com/300x200?text=No+Image';

                    return (
                      <div
                        key={p.product_id}
                        onClick={() => setSelectedProduct(p)}
                        className="border border-border rounded-xl p-0 bg-card flex flex-col hover:border-primary transition-colors cursor-pointer overflow-hidden shadow-sm hover:shadow-md h-full"
                      >
                        {/* Product Image */}
                        <div className="h-32 w-full bg-slate-200 dark:bg-slate-800 relative shrink-0">
                          <img src={image} alt={p.product_name} className="w-full h-full object-cover" />
                          {salePrice && (
                            <div className="absolute top-2 left-2 bg-emerald-600 text-white text-[10px] font-bold px-2 py-1 rounded shadow-sm">
                              ON SALE
                            </div>
                          )}
                          <div className="absolute top-2 right-2">
                            <Badge variant={p.stock_quantity > 0 ? "success" : "destructive"}>{p.stock_quantity > 0 ? 'In Stock' : 'Out of Stock'}</Badge>
                          </div>
                        </div>

                        <div className="p-3 flex flex-col flex-1">
                          <div className="font-bold text-sm text-foreground leading-tight line-clamp-2">{p.product_name}</div>
                          <div className="text-[10px] font-mono text-muted-foreground uppercase mt-1">{p.brand || 'No Brand'}</div>

                          <p className="text-xs text-muted-foreground line-clamp-2 mt-2 flex-1">{p.description || 'No description available.'}</p>

                          <div className="mt-3 pt-2 border-t border-border flex flex-col shrink-0">
                            {salePrice ? (
                              <>
                                <div className="text-[10px] text-muted-foreground line-through">{fmt(p.unit_price)}</div>
                                <div className="font-mono font-bold text-emerald-600">{fmt(salePrice)}</div>
                              </>
                            ) : (
                              <div className="font-mono font-bold text-primary">{fmt(p.unit_price)}</div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <button
                  onClick={handleNext}
                  disabled={currentIndex + itemsPerPage >= products.length}
                  className="p-2 shrink-0 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed text-[#176B87]"
                >
                  <FiChevronRight className="w-6 h-6" />
                </button>
              </div>

              {/* Pagination Dots */}
              {totalPages > 1 && (
                <div className="flex justify-center gap-1.5 mt-4 shrink-0 pb-2">
                  {Array.from({ length: totalPages }).map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => setCurrentIndex(idx * itemsPerPage)}
                      className={`w-2 h-2 rounded-full transition-all ${idx === currentPage ? 'bg-[#176B87] w-4' : 'bg-slate-300 dark:bg-slate-700'}`}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>

      {/* FOREGROUND MODAL: PRODUCT DETAIL MODAL */}
      {selectedProduct && (
        <ProductDetailModal
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
        />
      )}
    </>
  );
}

function ProductDetailModal({ product, onClose }) {
  // Image gallery state
  const availableImages = [product.image_url, product.image_url_2, product.image_url_3, product.image_url_4].filter(Boolean);
  const images = availableImages.length > 0 ? availableImages : ['https://via.placeholder.com/600x400?text=No+Image'];
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowRight') {
        if (currentImageIndex < images.length - 1) setCurrentImageIndex(prev => prev + 1);
      } else if (e.key === 'ArrowLeft') {
        if (currentImageIndex > 0) setCurrentImageIndex(prev => prev - 1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentImageIndex, images.length, onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-[fadeIn_0.2s_ease]">
      <div className="bg-background rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden relative flex flex-col md:flex-row">

        {/* Left: Image Gallery */}
        <div className="w-full md:w-1/2 bg-slate-100 dark:bg-slate-800 relative flex flex-col">
          {/* Close button for mobile */}
          <button onClick={onClose} className="md:hidden absolute top-3 right-3 z-10 bg-black/30 hover:bg-black/50 text-white rounded-full p-1.5 transition-colors">
            <FiX className="w-5 h-5" />
          </button>

          <div className="relative flex-1 min-h-[300px]">
            <img src={images[currentImageIndex]} alt={product.product_name} className="w-full h-full object-contain p-4 absolute inset-0" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none"></div>

            {/* Gallery Counter */}
            {images.length > 1 && (
              <div className="absolute bottom-3 right-3 bg-black/50 text-white text-xs font-mono px-2 py-1 rounded backdrop-blur-md">
                {currentImageIndex + 1} / {images.length}
              </div>
            )}

            {/* Navigation Arrows */}
            {images.length > 1 && (
              <>
                <button
                  onClick={() => setCurrentImageIndex(prev => Math.max(0, prev - 1))}
                  disabled={currentImageIndex === 0}
                  className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/30 hover:bg-black/60 text-white rounded-full p-1.5 disabled:opacity-0 transition-all"
                >
                  <FiChevronLeft className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setCurrentImageIndex(prev => Math.min(images.length - 1, prev + 1))}
                  disabled={currentImageIndex === images.length - 1}
                  className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/30 hover:bg-black/60 text-white rounded-full p-1.5 disabled:opacity-0 transition-all"
                >
                  <FiChevronRight className="w-5 h-5" />
                </button>
              </>
            )}
          </div>

          {/* Thumbnails */}
          {images.length > 1 && (
            <div className="flex gap-2 p-3 bg-slate-200 dark:bg-slate-900 overflow-x-auto">
              {images.map((img, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentImageIndex(idx)}
                  className={`w-16 h-12 shrink-0 rounded overflow-hidden border-2 transition-colors ${idx === currentImageIndex ? 'border-[#176B87]' : 'border-transparent'}`}
                >
                  <img src={img} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right: Product Info */}
        <div className="w-full md:w-1/2 p-6 flex flex-col max-h-[80vh] overflow-y-auto relative">
          <button onClick={onClose} className="hidden md:block absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
            <FiX className="w-6 h-6" />
          </button>

          <div className="mb-2 flex items-center gap-2 flex-wrap pr-8">
            <Badge variant="outline">{product.category}</Badge>
            <Badge variant={product.stock_quantity > 0 ? "success" : "destructive"}>{product.stock_quantity > 0 ? `${product.stock_quantity} in stock` : 'Out of Stock'}</Badge>
          </div>

          <h2 className="text-2xl font-bold text-foreground leading-tight mt-1 mb-6">{product.product_name}</h2>

          {product.discount_price ? (
            <div className="mb-6">
              <div className="text-sm font-semibold text-muted-foreground line-through">{fmt(product.unit_price)}</div>
              <div className="font-mono text-3xl font-bold text-emerald-600">{fmt(product.discount_price)}</div>
            </div>
          ) : (
            <div className="font-mono text-3xl font-bold text-primary mb-6">
              {fmt(product.unit_price)}
            </div>
          )}

          <div className="flex-1 flex flex-col space-y-6">
            {/* Specifications Block */}
            <div>
              <h4 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
                <FiPackage className="w-4 h-4 text-[#176B87]" />
                Specifications
              </h4>
              <div className="bg-muted/30 rounded-lg p-3 space-y-2 text-sm border border-border">
                <div className="flex justify-between items-center py-1">
                  <span className="text-muted-foreground font-medium">Brand</span>
                  <span className="font-semibold text-foreground text-right">{product.brand || 'N/A'}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-t border-border/50">
                  <span className="text-muted-foreground font-medium">Model / SKU</span>
                  <span className="font-mono font-semibold text-foreground text-right">{product.product_code || 'N/A'}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-t border-border/50">
                  <span className="text-muted-foreground font-medium">Category</span>
                  <span className="font-semibold text-foreground text-right">{product.category || 'N/A'}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-t border-border/50">
                  <span className="text-muted-foreground font-medium">Stock Status</span>
                  <span className={`font-semibold text-right ${product.stock_quantity > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                    {product.stock_quantity > 0 ? `${product.stock_quantity} available` : 'Out of Stock'}
                  </span>
                </div>
              </div>
            </div>

            {/* Description Block */}
            <div>
              <h4 className="text-sm font-bold text-foreground mb-2 flex items-center gap-2">
                <FiFileText className="w-4 h-4 text-[#176B87]" />
                Description
              </h4>
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap bg-background border border-border/50 rounded-lg p-3">
                {product.description || 'No detailed description provided for this product.'}
              </p>
            </div>
          </div>

          {/* View Only Indicator (Replaces Add to Cart) */}
          <div className="w-full mt-6 bg-blue-50 dark:bg-blue-950/30 text-blue-800 dark:text-blue-300 border border-blue-100 dark:border-blue-900 font-medium py-3 px-4 rounded-xl flex items-center justify-center gap-2 text-sm text-center">
            <FiAlertCircle className="w-5 h-5 shrink-0" />
            <span>Product Catalog is for viewing only. Please visit the store branch to purchase.</span>
          </div>
        </div>

      </div>
    </div>
  );
}

export function PaymentDetailsModal({ isOpen, onClose, installments }) {
  // Extract upcoming schedules from installments
  const schedules = installments.flatMap(i =>
    (i.paymentSchedules || []).filter(s => s.status === 'Pending').map(s => ({
      ...s,
      product: i.product,
      account_no: i.account_no
    }))
  ).sort((a, b) => new Date(a.due_date) - new Date(b.due_date));

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Upcoming Payments" size="md">
      {schedules.length === 0 ? (
        <EmptyState icon={<FiCalendar className="w-12 h-12 text-muted-foreground/30 mx-auto" />} title="No upcoming payments" description="You have no pending payments scheduled." />
      ) : (
        <div className="space-y-3 max-h-[60vh] overflow-y-auto p-1">
          {schedules.map(s => (
            <div key={s.schedule_id} className="p-3 border border-border rounded-xl bg-card">
              <div className="flex justify-between items-center mb-1">
                <span className="font-bold text-sm">{s.product}</span>
                <span className="font-mono font-bold text-blue-600">{fmt(s.amount_due ?? s.balance_due ?? s.amount)}</span>
              </div>
              <div className="flex justify-between items-center text-xs text-muted-foreground">
                <span className="font-mono">Acct: {s.account_no}</span>
                <span className="font-semibold text-foreground">Due: {s.due_date}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

export function CreditDetailsModal({ isOpen, onClose, installments }) {
  const activeInstallments = installments.filter(i => i.status === 'Active' || i.status === 'Pending');
  const totalPayable = activeInstallments.reduce((acc, curr) => acc + (parseFloat(curr.total_amount) || 0), 0);
  const totalPaid = activeInstallments.reduce((acc, curr) => acc + (parseFloat(curr.paid_amount) || 0), 0);
  const totalBalance = activeInstallments.reduce((acc, curr) => acc + (parseFloat(curr.balance) || 0), 0);

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Credit Balance Breakdown" size="md">
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-muted/30 border border-border p-3 rounded-xl text-center">
            <div className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Total Credit</div>
            <div className="font-mono font-bold text-foreground">{fmt(totalPayable)}</div>
          </div>
          <div className="bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 p-3 rounded-xl text-center">
            <div className="text-[10px] uppercase font-bold text-emerald-600 mb-1">Total Paid</div>
            <div className="font-mono font-bold text-emerald-700 dark:text-emerald-400">{fmt(totalPaid)}</div>
          </div>
          <div className="bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800 p-3 rounded-xl text-center">
            <div className="text-[10px] uppercase font-bold text-rose-600 mb-1">Remaining Balance</div>
            <div className="font-mono font-bold text-rose-700 dark:text-rose-400">{fmt(totalBalance)}</div>
          </div>
        </div>

        <h4 className="text-sm font-bold text-foreground mt-4 mb-2">Active Accounts</h4>
        <div className="space-y-2 max-h-[40vh] overflow-y-auto p-1">
          {activeInstallments.length === 0 ? (
            <div className="text-center text-xs text-muted-foreground py-4">No active credit accounts.</div>
          ) : (
            activeInstallments.map(i => (
              <div key={i.installment_id} className="flex justify-between items-center p-3 border border-border rounded-xl">
                <div>
                  <div className="font-semibold text-xs text-foreground">{i.product}</div>
                  <div className="font-mono text-[10px] text-muted-foreground">{i.account_no}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono font-bold text-rose-600">{fmt(i.balance)}</div>
                  <div className="text-[10px] text-muted-foreground">of {fmt(i.total_amount)}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </Modal>
  );
}

export function OverduePaymentsModal({ isOpen, onClose, installments }) {
  const overdueSchedules = installments.flatMap(i =>
    (i.paymentSchedules || []).filter(s => s.status === 'Pending' && new Date(s.due_date) < new Date(new Date().setHours(0, 0, 0, 0))).map(s => ({
      ...s,
      product: i.product,
      account_no: i.account_no
    }))
  ).sort((a, b) => new Date(a.due_date) - new Date(b.due_date));

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Overdue Payments" size="md">
      {overdueSchedules.length === 0 ? (
        <EmptyState icon={<FiCheckCircle className="w-12 h-12 text-emerald-500/50 mx-auto" />} title="All Caught Up!" description="You do not have any overdue payments." />
      ) : (
        <div className="space-y-3 max-h-[60vh] overflow-y-auto p-1">
          <div className="p-3 bg-rose-50 dark:bg-rose-950/20 text-rose-600 text-xs rounded-xl border border-rose-200 dark:border-rose-900 mb-4 flex gap-2">
            <FiAlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>Please settle your overdue payments as soon as possible to avoid penalties and maintain good standing.</span>
          </div>
          {overdueSchedules.map(s => {
            const daysOverdue = Math.floor((new Date() - new Date(s.due_date)) / (1000 * 60 * 60 * 24));
            return (
              <div key={s.schedule_id} className="p-3 border border-rose-200 dark:border-rose-900 rounded-xl bg-card relative overflow-hidden">
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-rose-500"></div>
                <div className="flex justify-between items-center mb-1 pl-2">
                  <span className="font-bold text-sm text-foreground">{s.product}</span>
                  <span className="font-mono font-bold text-rose-600">{fmt(s.balance_due ?? s.amount_due ?? s.amount)}</span>
                </div>
                <div className="flex justify-between items-center text-xs text-muted-foreground pl-2">
                  <span className="font-mono">Acct: {s.account_no}</span>
                  <span className="font-bold text-rose-500">{daysOverdue} day{daysOverdue !== 1 ? 's' : ''} overdue ({s.due_date})</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

export function InstallmentAccountDetailsModal({ isOpen, onClose, installmentId }) {
  const [accountData, setAccountData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen && installmentId) {
      setLoading(true);
      api.installments.getById(installmentId)
        .then(data => {
          // data has { account, next_payment, sale_items, schedules, payments }
          setAccountData(data.installment || data);
        })
        .catch(err => console.error(err))
        .finally(() => setLoading(false));
    }
  }, [isOpen, installmentId]);

  if (!isOpen) return null;

  const acc = accountData?.account || {};
  const saleItems = accountData?.sale_items || [];
  const schedules = accountData?.schedules || [];
  const payments = accountData?.payments || [];
  const item = saleItems.length > 0 ? saleItems[0] : null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Installment & Product Details" size="lg">
      {loading || !accountData ? (
        <LoadingState message="Loading account details..." />
      ) : (
        <div className="space-y-6">
          {/* Product Info Section */}
          <div className="flex flex-col sm:flex-row gap-6 p-5 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
            {item && (item.image_url || item.image) ? (
              <img
                src={(item.image_url || item.image)?.startsWith('http') ? (item.image_url || item.image) : `http://127.0.0.1:8000${item.image_url || item.image}`}
                alt={item.product_name}
                className="w-32 h-32 object-cover rounded-xl border border-slate-200 dark:border-slate-700 bg-white shrink-0 shadow-sm"
                onError={(e) => { e.target.src = 'https://via.placeholder.com/150?text=No+Image'; }}
              />
            ) : (
              <div className="w-32 h-32 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center justify-center shrink-0 shadow-sm">
                <FiPackage className="w-10 h-10 text-slate-400" />
              </div>
            )}
            <div className="flex-1 flex flex-col justify-center">
              <div className="flex justify-between items-start mb-2">
                <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 leading-tight">
                  {item ? item.product_name : 'Multiple Items / Custom Product'}
                </h3>
                <StatusBadge status={acc.status} />
              </div>

              {item && item.description && (
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-3 line-clamp-2">
                  {item.description}
                </p>
              )}

              <div className="grid grid-cols-2 gap-y-2 text-sm mt-auto">
                <div className="text-slate-500">Account No: <span className="font-mono font-bold text-slate-700 dark:text-slate-300">{acc.account_no}</span></div>
                <div className="text-slate-500">Purchase Date: <span className="font-medium text-slate-700 dark:text-slate-300">{acc.start_date || acc.sale_date}</span></div>
                <div className="text-slate-500">Branch: <span className="font-medium text-slate-700 dark:text-slate-300">{acc.branch || 'Main Branch'}</span></div>
                <div className="text-slate-500">Processed By: <span className="font-medium text-slate-700 dark:text-slate-300">{acc.store_admin || 'System/Admin'}</span></div>
              </div>
            </div>
          </div>

          {/* Financials Section */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 bg-[var(--card)] border border-slate-200 dark:border-slate-800 rounded-xl">
              <div className="text-xs text-slate-500 uppercase font-semibold mb-1">Total Price</div>
              <div className="text-lg font-mono font-bold text-slate-800 dark:text-slate-100">{fmt(acc.total_payable)}</div>
            </div>
            <div className="p-4 bg-[var(--card)] border border-slate-200 dark:border-slate-800 rounded-xl">
              <div className="text-xs text-slate-500 uppercase font-semibold mb-1">Down Payment</div>
              <div className="text-lg font-mono font-bold text-slate-800 dark:text-slate-100">{fmt(acc.down_payment)}</div>
            </div>
            <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl">
              <div className="text-xs text-emerald-600 dark:text-emerald-400 uppercase font-semibold mb-1">Remaining Bal</div>
              <div className="text-lg font-mono font-bold text-emerald-700 dark:text-emerald-300">{fmt(acc.balance)}</div>
            </div>
            <div className="p-4 bg-[#176B87]/5 border border-[#176B87]/20 rounded-xl">
              <div className="text-xs text-[#176B87] dark:text-[#64ccc5] uppercase font-semibold mb-1">Monthly Pay</div>
              <div className="text-lg font-mono font-bold text-[#176B87] dark:text-[#64ccc5]">{fmt(acc.installment_amount)}</div>
            </div>
          </div>

          {/* Tables Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
            {/* Payment History */}
            <div>
              <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-3">Payments Made (History)</h4>
              <div className="overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-xl max-h-[250px] shadow-sm">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 sticky top-0">
                    <tr>
                      <th className="py-2.5 px-3 text-left font-semibold">Date</th>
                      <th className="py-2.5 px-3 text-left font-semibold">Receipt</th>
                      <th className="py-2.5 px-3 text-left font-semibold">Method</th>
                      <th className="py-2.5 px-3 text-right font-semibold">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50 bg-[var(--card)]">
                    {payments.length === 0 ? (
                      <tr>
                        <td colSpan="4" className="py-6 text-center text-slate-400">No payments made yet.</td>
                      </tr>
                    ) : (
                      payments.map(p => (
                        <tr key={p.payment_id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                          <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">{p.payment_date}</td>
                          <td className="py-2.5 px-3 font-mono text-slate-500">{p.receipt_no}</td>
                          <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">{p.payment_method}</td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">{fmt(p.amount)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Payment Schedule */}
            <div>
              <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-3">Payment Schedule & Due Dates</h4>
              <div className="overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-xl max-h-[250px] shadow-sm">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 sticky top-0">
                    <tr>
                      <th className="py-2.5 px-3 text-left font-semibold">No.</th>
                      <th className="py-2.5 px-3 text-left font-semibold">Due Date</th>
                      <th className="py-2.5 px-3 text-left font-semibold">Status</th>
                      <th className="py-2.5 px-3 text-right font-semibold">Amount Due</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50 bg-[var(--card)]">
                    {schedules.length === 0 ? (
                      <tr>
                        <td colSpan="4" className="py-6 text-center text-slate-400">No schedules found.</td>
                      </tr>
                    ) : (
                      schedules.map(s => (
                        <tr key={s.schedule_id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                          <td className="py-2.5 px-3 font-mono text-slate-500">{s.installment_no}</td>
                          <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">{s.due_date}</td>
                          <td className="py-2.5 px-3"><StatusBadge status={s.status} /></td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-700 dark:text-slate-200">{fmt(s.amount_due)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

export function StatementModal({ isOpen, onClose }) {
  const { user } = useAuth();
  const [statements, setStatements] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen && user?.customer_id) {
      setLoading(true);
      // We will combine sales and payments to form a "statement" history
      Promise.all([
        api.transactions.getAll({ customer_id: user.customer_id, type: 'Sale' }),
        api.payments.getAll({ customer_id: user.customer_id })
      ])
        .then(([salesRes, paymentsRes]) => {
          const sales = (salesRes.transactions || []).map(s => ({
            date: s.sale_date,
            reference: s.invoice_no,
            type: 'Purchase',
            amount: parseFloat(s.total_amount),
            status: s.status,
            rawDate: new Date(s.sale_date)
          }));

          const payments = (paymentsRes.payments || []).map(p => ({
            date: p.payment_date,
            reference: p.receipt_no,
            type: 'Payment',
            amount: parseFloat(p.amount),
            status: p.status,
            rawDate: new Date(p.payment_date)
          }));

          const combined = [...sales, ...payments].sort((a, b) => b.rawDate - a.rawDate);
          setStatements(combined);
        })
        .catch(err => console.error(err))
        .finally(() => setLoading(false));
    }
  }, [isOpen, user]);

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Statement of Account" size="lg">
      {loading ? (
        <LoadingState message="Loading your statement..." />
      ) : statements.length === 0 ? (
        <EmptyState icon={<FiFileText className="w-12 h-12 text-muted-foreground/30 mx-auto" />} title="No statements available" description="You don't have any transaction history yet." />
      ) : (
        <div className="overflow-x-auto border border-border rounded-xl max-h-[60vh]">
          <table className="w-full text-xs">
            <thead className="bg-muted/50 text-muted-foreground sticky top-0 shadow-sm">
              <tr>
                <th className="py-2 px-3 text-left">Date</th>
                <th className="py-2 px-3 text-left">Reference</th>
                <th className="py-2 px-3 text-left">Type</th>
                <th className="py-2 px-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {statements.map((s, i) => (
                <tr key={i} className="hover:bg-muted/40 transition-colors">
                  <td className="py-3 px-3 font-mono">{s.date}</td>
                  <td className="py-3 px-3 font-mono text-primary font-semibold">{s.reference}</td>
                  <td className="py-3 px-3">
                    <Badge variant={s.type === 'Payment' ? 'success' : 'secondary'}>{s.type}</Badge>
                  </td>
                  <td className={`py-3 px-3 text-right font-mono font-bold ${s.type === 'Payment' ? 'text-emerald-600' : 'text-foreground'}`}>
                    {s.type === 'Payment' ? '-' : ''}{fmt(s.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

export function MakePaymentModal({ isOpen, onClose, installments, onPaymentSuccess }) {
  const [paymentType, setPaymentType] = useState('Installment Payment');
  const [paymentMethod, setPaymentMethod] = useState('GCash');
  const [selectedSchedule, setSelectedSchedule] = useState('');
  const [amount, setAmount] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [proofImage, setProofImage] = useState(null);
  const [proofPreview, setProofPreview] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const [products, setProducts] = useState([]);
  const [selectedProductId, setSelectedProductId] = useState('');

  const pendingSchedules = installments.flatMap(i => {
    const paid = (i.payments || []).reduce((sum, p) => sum + Number(p.amount), 0);
    const balance = Math.max(0, Number(i.total_payable || 0) - paid);
    return (i.paymentSchedules || []).filter(s => s.status === 'Pending').map(s => ({
      ...s,
      product: i.product || i.productName || 'Product',
      account_no: i.account_no,
      installment_id: i.installment_id,
      installment_balance: i.balance !== undefined ? i.balance : balance
    }));
  }).sort((a, b) => new Date(a.due_date) - new Date(b.due_date));

  // Auto-clear when type changes
  useEffect(() => {
    if (paymentType === 'Get Product') {
      setSelectedSchedule('');
      setAmount('');
      if (products.length === 0) {
        api.products.getAll({ status: 'Active' }).then(res => setProducts(res.products || [])).catch(console.error);
      }
    }
  }, [paymentType, products.length]);

  const handleScheduleChange = (e) => {
    const val = e.target.value;
    setSelectedSchedule(val);
    const schedule = pendingSchedules.find(s => s.schedule_id.toString() === val);
    if (schedule) {
      setAmount(schedule.balance_due ?? schedule.amount_due ?? 0);
    } else {
      setAmount('');
    }
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      Swal.fire({
        title: 'Invalid File',
        text: 'Only JPG, PNG, or WEBP images are allowed.',
        icon: 'error',
        background: document.documentElement.classList.contains('dark') ? '#1e293b' : '#fff',
        color: document.documentElement.classList.contains('dark') ? '#f8fafc' : '#0f172a',
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      Swal.fire({
        title: 'File Too Large',
        text: 'Image size should be up to 5 MB.',
        icon: 'error',
        background: document.documentElement.classList.contains('dark') ? '#1e293b' : '#fff',
        color: document.documentElement.classList.contains('dark') ? '#f8fafc' : '#0f172a',
      });
      return;
    }

    setProofImage(file);
    setProofPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (paymentType === 'Installment Payment' && !selectedSchedule) return;
    if (paymentType === 'Get Product' && !selectedProductId) {
      Swal.fire({ icon: 'warning', title: 'Missing Product', text: 'Please select a product first.' });
      return;
    }
    if (!amount) return;

    setSubmitting(true);
    try {
      const formData = new FormData();

      if (paymentType === 'Installment Payment') {
        const schedule = pendingSchedules.find(s => s.schedule_id.toString() === selectedSchedule);
        if (!schedule) throw new Error('No active installment account found.');

        formData.append('installment_id', schedule.installment_id);
        formData.append('schedule_id', selectedSchedule);
        formData.append('amount', amount);
        formData.append('payment_method', paymentMethod);
        if (referenceNumber) formData.append('reference_no', referenceNumber);
        if (proofImage) formData.append('proof_of_payment', proofImage);

        await api.payments.create(formData);
      } else {
        formData.append('product_id', selectedProductId);
        formData.append('amount', amount);
        formData.append('payment_method', paymentMethod);
        if (referenceNumber) formData.append('reference_no', referenceNumber);
        if (proofImage) formData.append('proof_of_payment', proofImage);

        await api.customerApp.requestProduct(formData);
      }

      Swal.fire({
        icon: 'success',
        title: paymentType === 'Get Product' ? 'Request Submitted' : 'Payment Submitted',
        text: paymentType === 'Get Product' ? 'Your new product request has been successfully submitted.' : 'Your payment request has been received and applied.',
        background: document.documentElement.classList.contains('dark') ? '#1e293b' : '#fff',
        color: document.documentElement.classList.contains('dark') ? '#f8fafc' : '#0f172a',
        confirmButtonColor: '#176B87'
      });
      triggerDataSync('payments');
      triggerDataSync('installments');
      onClose();
      if (onPaymentSuccess) onPaymentSuccess();
    } catch (err) {
      console.error(err);
      Swal.fire({
        icon: 'error',
        title: 'Payment Failed',
        text: err.message || 'An error occurred while submitting your payment.',
        background: document.documentElement.classList.contains('dark') ? '#1e293b' : '#fff',
        color: document.documentElement.classList.contains('dark') ? '#f8fafc' : '#0f172a',
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;
  const selectedScheduleDetails = pendingSchedules.find(s => s.schedule_id.toString() === selectedSchedule);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Make a Payment" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-muted-foreground mb-1">Payment Type</label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setPaymentType('Installment Payment')}
              className={`py-2.5 rounded-xl text-sm font-bold border transition-colors ${paymentType === 'Installment Payment'
                ? 'bg-blue-600/20 border-blue-600 text-blue-600 dark:bg-blue-500/20 dark:border-blue-500 dark:text-blue-400'
                : 'bg-transparent border-border text-foreground hover:bg-muted/50'
                }`}
            >
              Installment Payment
            </button>
            <button
              type="button"
              onClick={() => setPaymentType('Get Product')}
              className={`py-2.5 rounded-xl text-sm font-bold border transition-colors ${paymentType === 'Get Product'
                ? 'bg-emerald-600/20 border-emerald-600 text-emerald-600 dark:bg-emerald-500/20 dark:border-emerald-500 dark:text-emerald-400'
                : 'bg-transparent border-border text-foreground hover:bg-muted/50'
                }`}
            >
              Get Product
            </button>
          </div>
        </div>

        {paymentType === 'Installment Payment' && installments.length === 0 && (
          <EmptyState icon={<FiCheckCircle className="w-12 h-12 text-emerald-500/50 mx-auto" />} title="No installments" description="You have no active installments to pay. Switch to 'Get Product' to purchase a new product." />
        )}

        {paymentType === 'Installment Payment' && installments.length > 0 && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-muted-foreground mb-1">Select Payment Schedule</label>
              <select
                value={selectedSchedule}
                onChange={handleScheduleChange}
                required
                className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground text-sm"
              >
                <option value="">-- Select Schedule --</option>
                {pendingSchedules.map(s => (
                  <option key={s.schedule_id} value={s.schedule_id}>
                    {s.due_date} - {s.product} ({fmt(s.balance_due ?? s.amount_due ?? 0)})
                  </option>
                ))}
              </select>
            </div>

            {selectedScheduleDetails && (
              <div className="bg-muted/30 p-4 rounded-xl text-sm border border-border space-y-2">
                <div className="flex justify-between items-center border-b border-border/50 pb-2 mb-2">
                  <span className="text-muted-foreground">Product</span>
                  <span className="font-bold text-foreground truncate max-w-[200px]" title={selectedScheduleDetails.product}>{selectedScheduleDetails.product}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Installment Schedule</span>
                  <span className="font-bold text-foreground">{selectedScheduleDetails.due_date}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Current Payment Due</span>
                  <span className="font-bold text-rose-500">{fmt(selectedScheduleDetails.balance_due ?? selectedScheduleDetails.amount_due ?? 0)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Remaining Balance</span>
                  <span className="font-bold text-foreground">{fmt(selectedScheduleDetails.installment_balance)}</span>
                </div>
                <div className="flex justify-between items-center pt-1">
                  <span className="text-muted-foreground">Payment Status</span>
                  <span className="font-bold text-blue-500">{selectedScheduleDetails.status}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {paymentType === 'Get Product' && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-muted-foreground mb-1">Select Product</label>
              <select
                value={selectedProductId}
                onChange={e => {
                  setSelectedProductId(e.target.value);
                  const prod = products.find(p => p.product_id.toString() === e.target.value);
                  if (prod) {
                    const price = prod.discount_price > 0 ? prod.discount_price : prod.unit_price;
                    setAmount(price);
                  } else {
                    setAmount('');
                  }
                }}
                required
                className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground text-sm"
              >
                <option value="">-- Choose a Product --</option>
                {products.map(p => (
                  <option key={p.product_id} value={p.product_id}>
                    {p.product_name} - {fmt(p.discount_price > 0 ? p.discount_price : p.unit_price)}
                  </option>
                ))}
              </select>
            </div>

            {selectedProductId && (() => {
              const prod = products.find(p => p.product_id.toString() === selectedProductId);
              if (!prod) return null;
              const price = prod.discount_price > 0 ? prod.discount_price : prod.unit_price;
              return (
                <div className="bg-muted/30 p-4 rounded-xl text-sm border border-border space-y-2">
                  <div className="flex justify-between items-center border-b border-border/50 pb-2 mb-2">
                    <span className="text-muted-foreground">Product</span>
                    <span className="font-bold text-foreground">{prod.product_name}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Price</span>
                    <span className="font-bold text-emerald-600">{fmt(price)}</span>
                  </div>
                  {prod.stock_quantity !== undefined && (
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Stock</span>
                      <span className={`font-bold ${prod.stock_quantity > 0 ? 'text-foreground' : 'text-rose-500'}`}>{prod.stock_quantity > 0 ? `${prod.stock_quantity} available` : 'Out of stock'}</span>
                    </div>
                  )}
                </div>
              );
            })()}

            <div>
              <label className="block text-xs font-bold text-muted-foreground mb-1">Payment Amount</label>
              <div className="relative">
                <TbCurrencyPeso className="absolute left-3 top-2.5 text-muted-foreground w-4 h-4" />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  required
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-border bg-card text-foreground font-mono focus:ring-2 focus:ring-blue-500/20 outline-none"
                />
              </div>
            </div>
          </div>
        )}

        {(paymentType === 'Get Product' || (paymentType === 'Installment Payment' && installments.length > 0)) && (
          <>
            <div>
              <label className="block text-xs font-bold text-muted-foreground mb-1">Payment Method</label>
              <div className="flex flex-wrap gap-2">
                {(paymentType === 'Get Product' ? ['Cash', 'GCash', 'Maya', 'Bank Account', 'Installment'] : ['Cash', 'GCash', 'Maya', 'Bank Account']).map(method => {
                  const isDisabled = method === 'Installment' && pendingSchedules.length > 0;
                  return (
                    <button
                      key={method}
                      type="button"
                      disabled={isDisabled}
                      onClick={() => setPaymentMethod(method)}
                      className={`py-2 px-4 flex-1 min-w-[80px] rounded-xl text-xs font-bold border transition-colors ${isDisabled
                        ? 'bg-muted/50 text-muted-foreground opacity-50 cursor-not-allowed border-transparent'
                        : paymentMethod === method
                          ? 'bg-blue-600/20 border-blue-600 text-blue-600 dark:bg-blue-500/20 dark:border-blue-500 dark:text-blue-400'
                          : 'bg-transparent border-border text-foreground hover:bg-muted/50'
                        }`}
                      title={isDisabled ? "Cannot use Installment while you have a pending balance" : ""}
                    >
                      {method}
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-muted-foreground mb-1">Transaction Reference</label>
              <input
                type="text"
                value={referenceNumber}
                onChange={e => setReferenceNumber(e.target.value.replace(/\D/g, ''))}
                placeholder="Enter reference number"
                className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground text-sm focus:ring-2 focus:ring-blue-500/20 outline-none"
                required={paymentMethod !== 'Cash'}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-muted-foreground mb-1">
                Proof of Payment {paymentMethod !== 'Cash' && <span className="text-blue-500">*</span>}
              </label>
              <div className="relative w-full border-2 border-dashed border-border rounded-xl p-4 flex flex-col items-center justify-center bg-card text-center overflow-hidden hover:bg-muted/30 transition-colors">
                <input
                  type="file"
                  accept="image/jpeg, image/png, image/webp"
                  onChange={handleImageChange}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  required={paymentMethod !== 'Cash' && !proofPreview}
                />
                {proofPreview ? (
                  <div className="flex flex-col items-center z-20 relative">
                    <img src={proofPreview} alt="Proof" className="max-h-32 object-contain mb-2 rounded border border-border" />
                    <button type="button" className="text-xs text-rose-500 font-bold hover:underline" onClick={(e) => { e.preventDefault(); setProofImage(null); setProofPreview(null); }}>Remove Image</button>
                  </div>
                ) : (
                  <>
                    <div className="font-bold text-blue-600 dark:text-blue-400 text-sm mb-1">Choose or upload image</div>
                    <div className="text-[10px] text-muted-foreground">JPG, PNG, or WEBP up to 5 MB</div>
                  </>
                )}
              </div>
            </div>

            <div className="bg-blue-50 dark:bg-blue-950/20 p-3 rounded-xl border border-blue-100 dark:border-blue-900 text-xs text-blue-700 dark:text-blue-300">
              <strong>Note:</strong> Online payments are subject to review. It may take 1-2 business days for the payment to reflect in your account balance.
            </div>
          </>
        )}

        <button
          type="submit"
          disabled={submitting || (paymentType === 'Installment Payment' && (!selectedSchedule || installments.length === 0)) || (paymentType === 'Get Product' && !selectedProductId) || (paymentMethod !== 'Cash' && !proofImage)}
          className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
        >
          {submitting ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <TbCurrencyPeso className="w-4 h-4" />}
          <span>{submitting ? 'Processing...' : (paymentType === 'Get Product' ? 'Submit Product Request' : 'Submit Payment')}</span>
        </button>
      </form>
    </Modal>
  );
}

export function SupportModal({ isOpen, onClose }) {
  const [submitting, setSubmitting] = useState(false);
  const [topic, setTopic] = useState('');
  const [message, setMessage] = useState('');
  const [activeTab, setActiveTab] = useState('submit');
  const [myMessages, setMyMessages] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    if (isOpen && activeTab === 'history') {
      loadMyMessages();
    }
  }, [isOpen, activeTab]);

  // Auto-refresh history every 5 seconds when viewing it
  useEffect(() => {
    if (!isOpen || activeTab !== 'history') return;
    const interval = setInterval(() => loadMyMessages(true), 5000);
    return () => clearInterval(interval);
  }, [isOpen, activeTab]);

  const loadMyMessages = async (silent = false) => {
    if (!silent) setLoadingHistory(true);
    try {
      const data = await api.supportMessages.getAll();
      setMyMessages(data.messages || []);
    } catch (err) {
      console.error(err);
    } finally {
      if (!silent) setLoadingHistory(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      await api.supportMessages.create({ topic, message });
      Swal.fire({
        icon: 'success',
        title: 'Message Sent',
        text: 'Our support team will get back to you within 24 hours.',
        background: document.documentElement.classList.contains('dark') ? '#1e293b' : '#fff',
        color: document.documentElement.classList.contains('dark') ? '#f8fafc' : '#0f172a',
        confirmButtonColor: '#176B87'
      });
      setTopic('');
      setMessage('');
      setActiveTab('history');
      loadMyMessages();
    } catch (err) {
      console.error(err);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: err.message || 'Failed to send message',
        background: document.documentElement.classList.contains('dark') ? '#1e293b' : '#fff',
        color: document.documentElement.classList.contains('dark') ? '#f8fafc' : '#0f172a',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteMessage = async (id) => {
    const res = await Swal.fire({
      title: 'Are you sure?',
      text: 'This will permanently delete this feedback and all its history.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Yes, delete it!',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#64748b',
      background: document.documentElement.classList.contains('dark') ? '#1e293b' : '#fff',
      color: document.documentElement.classList.contains('dark') ? '#f8fafc' : '#0f172a',
    });
    if (res.isConfirmed) {
      try {
        await api.supportMessages.delete(id);
        loadMyMessages(true);
        Swal.fire({
          icon: 'success',
          title: 'Deleted!',
          text: 'Your feedback has been deleted.',
          toast: true,
          position: 'bottom-end',
          showConfirmButton: false,
          timer: 3000,
          background: document.documentElement.classList.contains('dark') ? '#1e293b' : '#fff',
          color: document.documentElement.classList.contains('dark') ? '#f8fafc' : '#0f172a',
        });
      } catch (err) {
        console.error(err);
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: 'Failed to delete feedback.',
          background: document.documentElement.classList.contains('dark') ? '#1e293b' : '#fff',
          color: document.documentElement.classList.contains('dark') ? '#f8fafc' : '#0f172a',
        });
      }
    }
  };

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Customer Support" size="lg">
      {/* Tabs */}
      <div className="flex border-b border-border mb-4 -mt-1">
        <button
          type="button"
          onClick={() => setActiveTab('submit')}
          className={`flex-1 py-2.5 text-sm font-bold text-center border-b-2 transition-colors cursor-pointer ${activeTab === 'submit'
            ? 'border-primary text-primary'
            : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
        >
          <span className="flex items-center justify-center gap-2">
            <FiMessageCircle className="w-4 h-4" />
            Send Feedback
          </span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('history')}
          className={`flex-1 py-2.5 text-sm font-bold text-center border-b-2 transition-colors cursor-pointer ${activeTab === 'history'
            ? 'border-primary text-primary'
            : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
        >
          <span className="flex items-center justify-center gap-2">
            <FiClock className="w-4 h-4" />
            My Feedback History
            {myMessages.filter(m => m.status === 'Responded' && m.response).length > 0 && (
              <span className="w-5 h-5 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center">
                {myMessages.filter(m => m.status === 'Responded' && m.response).length}
              </span>
            )}
          </span>
        </button>
      </div>

      {activeTab === 'submit' ? (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="text-sm text-muted-foreground mb-4">
            Need help with your account or an appliance? Send us a message and our support team will assist you.
          </div>

          <div>
            <label className="block text-xs font-bold text-muted-foreground mb-1">Topic</label>
            <select
              value={topic}
              onChange={e => setTopic(e.target.value)}
              required
              className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground text-sm"
            >
              <option value="">-- Select a Topic --</option>
              <option value="Billing">Billing & Installments</option>
              <option value="Technical">Appliance Technical Support</option>
              <option value="Delivery">Delivery Status</option>
              <option value="Other">Other Inquiry</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-muted-foreground mb-1">Message</label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              required
              rows={4}
              placeholder="How can we help you?"
              className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground text-sm resize-none"
            ></textarea>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
          >
            {submitting ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <FiMessageCircle className="w-4 h-4" />}
            <span>{submitting ? 'Sending...' : 'Send Message'}</span>
          </button>
        </form>
      ) : (
        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          {loadingHistory ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-3 border-primary/20 border-t-primary rounded-full animate-spin"></div>
            </div>
          ) : myMessages.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FiMessageCircle className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No feedback submitted yet</p>
              <p className="text-sm mt-1">Send your first feedback using the "Send Feedback" tab.</p>
            </div>
          ) : (
            myMessages.map(m => (
              <div key={m.id} className="rounded-xl border border-border p-4 space-y-3">
                {/* Customer's original message */}
                <div>
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className="text-xs font-bold text-primary uppercase tracking-wider">{m.topic}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${m.status === 'Responded'
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                      : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                      }`}>
                      {m.status}
                    </span>
                    <span className="text-[10px] text-muted-foreground font-mono ml-auto">
                      {new Date(m.created_at).toLocaleString()}
                    </span>
                    <button
                      onClick={() => handleDeleteMessage(m.id)}
                      className="p-1 hover:bg-rose-500/10 text-rose-500 rounded-md transition-colors"
                      title="Delete Feedback"
                    >
                      <FiTrash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed">{m.message}</p>
                </div>

                {/* Legacy Admin Response */}
                {m.response && (
                  <div className="border-l-2 border-emerald-500 pl-3 py-2 bg-emerald-50/50 dark:bg-emerald-900/10 rounded-r-xl mt-2">
                    <div className="flex items-center gap-2 mb-1">
                      <FiCheckCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">Store Admin Response</span>
                      {m.responded_at && (
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {new Date(m.responded_at).toLocaleString()}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-foreground/80 leading-relaxed mb-3">{m.response}</p>
                  </div>
                )}

                {/* Legacy Customer Reply */}
                {m.customer_reply && (
                  <div className="border-l-2 border-primary/50 pl-3 py-2 bg-primary/5 rounded-r-xl mt-2">
                    <div className="flex items-center gap-2 mb-1">
                      <FiMessageCircle className="w-3.5 h-3.5 text-primary" />
                      <span className="text-xs font-bold text-primary">Your Reply</span>
                      {m.customer_reply_at && (
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {new Date(m.customer_reply_at).toLocaleString()}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-foreground/80 leading-relaxed">{m.customer_reply}</p>
                  </div>
                )}

                {/* New Chat History */}
                {m.chat_history?.map((chat, idx) => {
                  const isCustomer = chat.sender === 'Customer';
                  return (
                    <div key={idx} className={`mt-2 border-l-2 pl-3 py-2 rounded-r-xl ${isCustomer
                      ? 'border-primary/50 bg-primary/5'
                      : 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-900/10'
                      }`}>
                      <div className="flex items-center gap-2 mb-1">
                        {isCustomer ? <FiMessageCircle className="w-3.5 h-3.5 text-primary" /> : <FiCheckCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />}
                        <span className={`text-xs font-bold ${isCustomer ? 'text-primary' : 'text-emerald-700 dark:text-emerald-400'}`}>
                          {isCustomer ? 'Your Reply' : 'Store Admin Response'}
                        </span>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {new Date(chat.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-sm text-foreground/80 leading-relaxed">{chat.text}</p>
                    </div>
                  );
                })}

                {/* Reply Form (if not locked and not pending initial) */}
                {(() => {
                  const legacyCount = 1 + (m.response ? 1 : 0) + (m.customer_reply ? 1 : 0);
                  const historyCount = m.chat_history?.length || 0;
                  const totalMessages = legacyCount + historyCount;
                  const isLocked = totalMessages >= 20;

                  if (m.status === 'Pending' && !m.response && historyCount === 0) {
                    return (
                      <div className="border-l-2 border-amber-400 pl-3 py-2 bg-amber-50/50 dark:bg-amber-900/10 rounded-r-xl mt-2">
                        <div className="flex items-center gap-2">
                          <FiClock className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
                          <span className="text-xs font-medium text-amber-600 dark:text-amber-400">Awaiting response from our team...</span>
                        </div>
                      </div>
                    );
                  }

                  if (isLocked) {
                    return (
                      <div className="p-3 bg-muted/50 border border-border rounded-xl text-center mt-3">
                        <p className="text-xs text-muted-foreground font-semibold">Conversation limit reached (20 messages).</p>
                        <p className="text-[10px] text-muted-foreground mt-1">Please start a new feedback ticket if you need further assistance.</p>
                      </div>
                    );
                  }

                  return (
                    <form onSubmit={async (e) => {
                      e.preventDefault();
                      const formData = new FormData(e.target);
                      const reply = formData.get('reply');
                      if (!reply.trim()) return;
                      const btn = e.target.querySelector('button[type="submit"]');
                      btn.disabled = true;
                      btn.innerHTML = '<span class="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin block"></span>';
                      try {
                        await api.supportMessages.update(m.id, { new_message: reply });
                        loadMyMessages(true);
                        e.target.reset();
                      } catch (err) {
                        console.error(err);
                        alert('Failed to send reply: ' + (err.response?.data?.message || err.message));
                      } finally {
                        btn.disabled = false;
                        btn.innerText = 'Reply';
                      }
                    }} className="mt-3 flex gap-2">
                      <input
                        type="text"
                        name="reply"
                        placeholder="Type your reply to the admin..."
                        className="flex-1 px-3 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-white dark:bg-card text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        required
                      />
                      <button
                        type="submit"
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center min-w-[60px]"
                      >
                        Reply
                      </button>
                    </form>
                  );
                })()}
              </div>
            ))
          )}
        </div>
      )}
    </Modal>
  );
}

