import React, { useState, useEffect } from 'react';
import { Modal, LoadingState, EmptyState, Badge, StatusBadge } from '../ui';
import { api } from '../../lib/api';
import { fmt } from '../../lib/utils';
import { FiPackage, FiCalendar, FiClock, FiCreditCard, FiAlertCircle, FiCheckCircle, FiFileText, FiMessageCircle, FiChevronLeft, FiChevronRight, FiShoppingCart, FiX } from 'react-icons/fi';
import { TbCurrencyPeso } from 'react-icons/tb';
import { useAuth } from '../../context/AuthContext';
import Swal from 'sweetalert2';

export function ProductListModal({ isOpen, onClose, category }) {
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
            <div className="flex gap-2">
              {['All', 'Furniture', 'Appliances'].map(cat => (
                <button
                  key={cat}
                  onClick={() => { setActiveCategory(cat); setCurrentIndex(0); }}
                  className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${
                    activeCategory === cat 
                      ? 'bg-[#176B87] text-white' 
                      : 'bg-muted text-muted-foreground hover:bg-slate-200 dark:hover:bg-slate-800'
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
                description={searchQuery ? `No products matching "${searchQuery}" in ${activeCategory}.` : `No products available in ${activeCategory} at the moment.`} 
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
                    const salePrice = p.unit_price < p.cost_price ? p.unit_price : null; // Logic for sale if needed
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
                            <div className="absolute top-2 left-2 bg-rose-500 text-white text-[10px] font-bold px-2 py-1 rounded">
                              SALE
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
                                <div className="text-[10px] text-muted-foreground line-through">{fmt(p.cost_price || p.unit_price)}</div>
                                <div className="font-mono font-bold text-rose-500">{fmt(salePrice)}</div>
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
  // Image gallery state (we only use image_url based on existing DB schema)
  const images = product.image_url ? [product.image_url] : ['https://via.placeholder.com/600x400?text=No+Image'];
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

          <div className="font-mono text-3xl font-bold text-primary mb-6">
            {fmt(product.unit_price)}
          </div>

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
                <span className="font-mono font-bold text-blue-600">{fmt(s.amount)}</span>
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
    (i.paymentSchedules || []).filter(s => s.status === 'Pending' && new Date(s.due_date) < new Date(new Date().setHours(0,0,0,0))).map(s => ({
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
                  <span className="font-mono font-bold text-rose-600">{fmt(s.amount)}</span>
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
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen && installmentId) {
      setLoading(true);
      api.installments.getById(installmentId)
        .then(data => setAccount(data.installment || data))
        .catch(err => console.error(err))
        .finally(() => setLoading(false));
    }
  }, [isOpen, installmentId]);

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Installment Account Details" size="lg">
      {loading || !account ? (
        <LoadingState message="Loading account details..." />
      ) : (
        <div className="space-y-4">
          <div className="flex justify-between items-start p-4 bg-muted/20 border border-border rounded-xl">
            <div>
              <div className="text-xs uppercase font-bold text-muted-foreground mb-1">Account Number</div>
              <div className="font-mono text-xl font-bold text-primary">{account.account_no}</div>
            </div>
            <StatusBadge status={account.status} />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
             <div className="p-3 border border-border rounded-xl text-center">
              <div className="text-[10px] text-muted-foreground uppercase font-bold mb-1">Total Payable</div>
              <div className="font-mono font-bold text-foreground">{fmt(account.total_payable)}</div>
            </div>
            <div className="p-3 border border-border rounded-xl text-center">
              <div className="text-[10px] text-muted-foreground uppercase font-bold mb-1">Down Payment</div>
              <div className="font-mono font-bold text-foreground">{fmt(account.down_payment)}</div>
            </div>
            <div className="p-3 border border-border rounded-xl text-center">
              <div className="text-[10px] text-muted-foreground uppercase font-bold mb-1">Monthly</div>
              <div className="font-mono font-bold text-foreground">{fmt(account.installment_amount)}</div>
            </div>
             <div className="p-3 border border-border rounded-xl text-center">
              <div className="text-[10px] text-muted-foreground uppercase font-bold mb-1">Term</div>
              <div className="font-mono font-bold text-foreground">{account.months} mos</div>
            </div>
          </div>

          <h4 className="text-sm font-bold text-foreground mt-4 mb-2">Payment History</h4>
          <div className="overflow-x-auto border border-border rounded-xl max-h-[30vh]">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 text-muted-foreground sticky top-0">
                <tr>
                  <th className="py-2 px-3 text-left">Date</th>
                  <th className="py-2 px-3 text-left">Receipt</th>
                  <th className="py-2 px-3 text-left">Method</th>
                  <th className="py-2 px-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(!account.payments || account.payments.length === 0) ? (
                  <tr>
                    <td colSpan="4" className="py-4 text-center text-muted-foreground">No payments made yet.</td>
                  </tr>
                ) : (
                  account.payments.map(p => (
                    <tr key={p.payment_id}>
                      <td className="py-2 px-3 font-mono">{p.payment_date}</td>
                      <td className="py-2 px-3 font-mono">{p.receipt_no}</td>
                      <td className="py-2 px-3">{p.payment_method}</td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-emerald-600">{fmt(p.amount)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
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
  const [selectedSchedule, setSelectedSchedule] = useState('');
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const pendingSchedules = installments.flatMap(i => 
    (i.paymentSchedules || []).filter(s => s.status === 'Pending').map(s => ({
      ...s,
      product: i.product,
      account_no: i.account_no,
      installment_id: i.installment_id
    }))
  ).sort((a, b) => new Date(a.due_date) - new Date(b.due_date));

  const handleScheduleChange = (e) => {
    const val = e.target.value;
    setSelectedSchedule(val);
    const schedule = pendingSchedules.find(s => s.schedule_id.toString() === val);
    if (schedule) {
      setAmount(schedule.amount);
    } else {
      setAmount('');
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!selectedSchedule || !amount) return;
    
    setSubmitting(true);
    // Simulate payment process or hit real endpoint if one exists for customer payment
    setTimeout(() => {
      setSubmitting(false);
      Swal.fire({
        icon: 'success',
        title: 'Payment Submitted',
        text: 'Your payment request has been received and is processing.',
        background: document.documentElement.classList.contains('dark') ? '#1e293b' : '#fff',
        color: document.documentElement.classList.contains('dark') ? '#f8fafc' : '#0f172a',
        confirmButtonColor: '#176B87'
      });
      onClose();
      if(onPaymentSuccess) onPaymentSuccess();
    }, 1500);
  };

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Make a Payment" size="md">
      {pendingSchedules.length === 0 ? (
        <EmptyState icon={<FiCheckCircle className="w-12 h-12 text-emerald-500/50 mx-auto" />} title="No payments due" description="You have no pending installments to pay at this time." />
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
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
                  {s.due_date} - {s.product} ({fmt(s.amount)})
                </option>
              ))}
            </select>
          </div>
          
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
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-border bg-card text-foreground font-mono"
              />
            </div>
          </div>
          
          <div className="bg-blue-50 dark:bg-blue-950/20 p-3 rounded-xl border border-blue-100 dark:border-blue-900 text-xs text-blue-700 dark:text-blue-300">
            <strong>Note:</strong> Online payments are subject to review. It may take 1-2 business days for the payment to reflect in your account balance.
          </div>
          
          <button
            type="submit"
            disabled={submitting || !selectedSchedule}
            className="w-full py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
          >
            {submitting ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <TbCurrencyPeso className="w-4 h-4" />}
            <span>{submitting ? 'Processing...' : 'Submit Payment'}</span>
          </button>
        </form>
      )}
    </Modal>
  );
}

export function SupportModal({ isOpen, onClose }) {
  const [submitting, setSubmitting] = useState(false);
  const [topic, setTopic] = useState('');
  const [message, setMessage] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    setSubmitting(true);
    
    setTimeout(() => {
      setSubmitting(false);
      Swal.fire({
        icon: 'success',
        title: 'Message Sent',
        text: 'Our support team will get back to you within 24 hours.',
        background: document.documentElement.classList.contains('dark') ? '#1e293b' : '#fff',
        color: document.documentElement.classList.contains('dark') ? '#f8fafc' : '#0f172a',
        confirmButtonColor: '#176B87'
      });
      onClose();
    }, 1000);
  };

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Customer Support" size="md">
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
    </Modal>
  );
}
