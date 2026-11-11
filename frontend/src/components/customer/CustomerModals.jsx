import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Modal, LoadingState, EmptyState, Badge, StatusBadge, showToast, showSuccess, showError, showWarning, confirmDelete } from '../ui';
import { api } from '../../lib/api';
import { fmt } from '../../lib/utils';
import { FiPackage, FiCalendar, FiClock, FiCreditCard, FiAlertCircle, FiCheckCircle, FiFileText, FiMessageCircle, FiChevronLeft, FiChevronRight, FiShoppingCart, FiX, FiTrash2, FiPrinter, FiSearch, FiRefreshCw, FiMaximize2, FiMinimize2, FiZoomIn } from 'react-icons/fi';
import { TbCurrencyPeso } from 'react-icons/tb';
import { useAuth } from '../../context/AuthContext';
import { triggerDataSync, useRealtimeSync, fastDeepEqual } from '../../lib/realtimeSync';

export function ProductListModal({ isOpen, onClose, category, availableCategories = [], initialProductId = null, onBuyProduct }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const inFlightRef = useRef(false);

  // Search and Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState(category || 'All');

  // Carousel state
  const [currentIndex, setCurrentIndex] = useState(0);
  const itemsPerPage = 3; // Large modal: 3 product cards visible

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

  const loadProducts = useCallback((silent = false, signal) => {
    if (!isOpen) return;
    const isSilent = silent === true;
    if (inFlightRef.current && isSilent) return;
    inFlightRef.current = true;
    if (!isSilent) setLoading(true);
    const params = { status: 'Active' };
    if (activeCategory !== 'All') params.category = activeCategory;
    if (searchQuery) params.search = searchQuery;

    api.products.getAll(params, { signal })
      .then(data => {
        if (signal?.aborted) return;
        const nextProducts = data.products || [];
        setProducts(prev => (fastDeepEqual(prev, nextProducts) ? prev : nextProducts));
        setSelectedProduct(prev => {
          if (!prev) return null;
          const updated = nextProducts.find(p => p.product_id === prev.product_id);
          return updated ? (fastDeepEqual(prev, updated) ? prev : updated) : prev;
        });
        if (!isSilent) setCurrentIndex(0);
      })
      .catch(err => {
        if (err?.name !== 'AbortError') console.error(err);
      })
      .finally(() => {
        inFlightRef.current = false;
        if (!isSilent) setLoading(false);
      });
  }, [isOpen, activeCategory, searchQuery]);

  useEffect(() => {
    if (!isOpen) return;
    loadProducts(false);
  }, [isOpen, activeCategory, searchQuery, loadProducts]);

  useRealtimeSync((_source, signal) => {
    if (isOpen) loadProducts(true, signal);
  }, [isOpen, loadProducts], { module: 'products', enabled: isOpen });

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
      <Modal isOpen={isOpen} onClose={onClose} title="Product Catalog" size="xl">
        <div className="flex flex-col relative h-[520px]">
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
                  className="p-2 shrink-0 rounded-full hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed text-[#176B87]"
                >
                  <FiChevronLeft className="w-6 h-6" />
                </button>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 flex-1 items-start">
                  {visibleProducts.map(p => {
                    const salePrice = p.discount_price || null;

                    return (
                      <div
                        key={p.product_id}
                        onClick={() => setSelectedProduct(p)}
                        className="border border-border rounded-xl p-0 bg-card flex flex-col hover:border-primary transition-colors cursor-pointer overflow-hidden shadow-sm hover:shadow-md h-full"
                      >
                        {/* Product Image */}
                        <div className="h-32 w-full bg-muted relative shrink-0 flex items-center justify-center overflow-hidden">
                          {p.image_url ? (
                            <img src={p.image_url} alt={p.product_name} className="w-full h-full object-cover" />
                          ) : (
                            <FiPackage className="w-8 h-8 text-muted-foreground/40" />
                          )}
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

                          <div className="mt-3 pt-2 border-t border-border flex items-center justify-between shrink-0">
                            <div>
                              {salePrice ? (
                                <>
                                  <div className="text-[10px] text-muted-foreground line-through">{fmt(p.unit_price)}</div>
                                  <div className="font-mono font-bold text-emerald-600">{fmt(salePrice)}</div>
                                </>
                              ) : (
                                <div className="font-mono font-bold text-primary">{fmt(p.unit_price)}</div>
                              )}
                            </div>
                            {onBuyProduct && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onBuyProduct(p);
                                }}
                                className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs hover:scale-105"
                                title="Make Payment for this product"
                              >
                                <FiShoppingCart className="w-3.5 h-3.5" />
                                <span>Pay</span>
                              </button>
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
                  className="p-2 shrink-0 rounded-full hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed text-[#176B87]"
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
          onBuyProduct={(prod) => {
            setSelectedProduct(null);
            if (onBuyProduct) onBuyProduct(prod);
          }}
        />
      )}
    </>
  );
}

function ProductDetailModal({ product, onClose, onBuyProduct }) {
  // Image gallery state
  const availableImages = [product.image_url, product.image_url_2, product.image_url_3, product.image_url_4].filter(Boolean);
  const images = availableImages.length > 0 ? availableImages : [];
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const fullScreenRef = useRef(null);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (isFullScreen) {
          setIsFullScreen(false);
        } else {
          onClose();
        }
      } else if (e.key === 'ArrowRight') {
        if (currentImageIndex < images.length - 1) setCurrentImageIndex(prev => prev + 1);
      } else if (e.key === 'ArrowLeft') {
        if (currentImageIndex > 0) setCurrentImageIndex(prev => prev - 1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentImageIndex, images.length, onClose, isFullScreen]);

  const toggleNativeFullScreen = () => {
    if (!document.fullscreenElement) {
      if (fullScreenRef.current?.requestFullscreen) {
        fullScreenRef.current.requestFullscreen().catch(() => {});
      } else if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-[fadeIn_0.2s_ease]">
      <div className="bg-background rounded-2xl shadow-2xl border border-border w-full max-w-3xl max-h-[90vh] overflow-hidden relative flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Badge variant="outline">{product.category}</Badge>
            <Badge variant={product.stock_quantity > 0 ? "success" : "destructive"}>{product.stock_quantity > 0 ? `${product.stock_quantity} in stock` : 'Out of Stock'}</Badge>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors cursor-pointer shrink-0">
            <FiX className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-6 sm:p-8 space-y-5 overflow-y-auto flex-1">
          {/* Image Gallery */}
          <div className="w-full bg-slate-900/90 dark:bg-slate-950 rounded-2xl overflow-hidden border border-border relative flex flex-col group">
            <div 
              className="relative h-72 sm:h-80 cursor-zoom-in"
              onClick={() => images.length > 0 && setIsFullScreen(true)}
              title="Click to view product in full screen"
            >
              {images.length > 0 ? (
                <>
                  <img 
                    src={images[currentImageIndex]} 
                    alt={product.product_name} 
                    className="w-full h-full object-contain p-2 absolute inset-0 transition-transform duration-300 group-hover:scale-[1.02]" 
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/10 pointer-events-none"></div>

                  {/* Fullscreen Pill Button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsFullScreen(true);
                    }}
                    className="absolute top-3 right-3 z-10 flex items-center gap-1.5 px-3 py-1.5 bg-black/60 hover:bg-black/80 text-white rounded-xl text-xs font-semibold backdrop-blur-md border border-white/10 shadow-lg transition-all cursor-pointer hover:scale-105 active:scale-95"
                    title="Open Full Screen"
                  >
                    <FiMaximize2 className="w-3.5 h-3.5" />
                    <span>Full Screen</span>
                  </button>
                </>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-6 text-muted-foreground">
                  <FiPackage className="w-12 h-12 opacity-30 mb-2" />
                  <span className="text-xs font-medium">No Image Available</span>
                </div>
              )}

              {/* Gallery Counter */}
              {images.length > 1 && (
                <div className="absolute bottom-3 right-3 bg-black/60 text-white text-xs font-mono px-2.5 py-1 rounded-lg backdrop-blur-md border border-white/10">
                  {currentImageIndex + 1} / {images.length}
                </div>
              )}

              {/* Navigation Arrows */}
              {images.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCurrentImageIndex(prev => Math.max(0, prev - 1));
                    }}
                    disabled={currentImageIndex === 0}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/70 text-white rounded-full p-2 disabled:opacity-0 transition-all cursor-pointer backdrop-blur-sm z-10"
                    title="Previous Image"
                  >
                    <FiChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCurrentImageIndex(prev => Math.min(images.length - 1, prev + 1));
                    }}
                    disabled={currentImageIndex === images.length - 1}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/70 text-white rounded-full p-2 disabled:opacity-0 transition-all cursor-pointer backdrop-blur-sm z-10"
                    title="Next Image"
                  >
                    <FiChevronRight className="w-5 h-5" />
                  </button>
                </>
              )}
            </div>

            {/* Thumbnails */}
            {images.length > 1 && (
              <div className="flex gap-2 p-2.5 bg-slate-900/60 dark:bg-black/40 border-t border-white/5 overflow-x-auto">
                {images.map((img, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setCurrentImageIndex(idx)}
                    className={`w-14 h-11 shrink-0 rounded-lg overflow-hidden border-2 transition-all cursor-pointer ${
                      idx === currentImageIndex ? 'border-[#176B87] ring-2 ring-[#176B87]/30 scale-105' : 'border-white/10 opacity-70 hover:opacity-100'
                    }`}
                  >
                    <img src={img} className="w-full h-full object-cover" alt="" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-start justify-between gap-4">
            <h2 className="text-lg font-bold text-foreground leading-tight">{product.product_name}</h2>
            <div className="text-right shrink-0">
              {product.discount_price ? (
                <>
                  <div className="text-xs font-semibold text-muted-foreground line-through">{fmt(product.unit_price)}</div>
                  <div className="font-mono text-xl font-bold text-emerald-600">{fmt(product.discount_price)}</div>
                </>
              ) : (
                <div className="font-mono text-xl font-bold text-primary">
                  {fmt(product.unit_price)}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Specifications Block */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                <FiPackage className="w-3.5 h-3.5 text-[#176B87]" />
                Specifications
              </h4>
              <div className="bg-muted/30 rounded-xl p-3.5 space-y-1.5 text-xs border border-border h-[calc(100%-1.5rem)]">
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
            <div className="flex flex-col">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                <FiFileText className="w-3.5 h-3.5 text-[#176B87]" />
                Description
              </h4>
              <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap bg-background border border-border/50 rounded-xl p-3.5 flex-1">
                {product.description || 'No detailed description provided for this product.'}
              </p>
            </div>
          </div>

          <div className="w-full bg-blue-50 dark:bg-blue-950/30 text-blue-800 dark:text-blue-300 border border-blue-100 dark:border-blue-900 font-medium py-2.5 px-3 rounded-xl flex items-center justify-center gap-2 text-xs text-center">
            <FiCheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>Instant checkout via GCash, Maya, or BDO Online Banking</span>
          </div>
        </div>

        {/* Footer Action Buttons */}
        <div className="px-6 py-4 border-t border-border bg-muted/20 flex items-center justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-border hover:bg-muted text-xs font-bold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            Close
          </button>
          {onBuyProduct && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onBuyProduct(product);
              }}
              className="py-2.5 px-4 rounded-xl bg-[#7c3aed] hover:bg-[#6d28d9] active:bg-[#5b21b6] text-white font-bold text-xs shadow-md shadow-purple-600/25 flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <FiShoppingCart className="w-4 h-4" />
              <span>Make Payment ({fmt(product.discount_price || product.unit_price)})</span>
            </button>
          )}
        </div>

      </div>

      {/* FULL SCREEN PRODUCT VIEWER */}
      {isFullScreen && images.length > 0 && (
        <div 
          ref={fullScreenRef}
          className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-xl flex flex-col justify-between p-4 sm:p-6 animate-[fadeIn_0.2s_ease]"
          onClick={() => setIsFullScreen(false)}
        >
          {/* Top Fullscreen Bar */}
          <div 
            className="flex items-center justify-between z-20 shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="font-bold text-base text-white truncate max-w-xs sm:max-w-md">
                {product.product_name}
              </span>
              <span className="font-mono text-sm font-bold text-emerald-400 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 shrink-0">
                {fmt(product.discount_price || product.unit_price)}
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={toggleNativeFullScreen}
                className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
                title="Toggle Native Browser Full Screen"
              >
                <FiMaximize2 className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={() => setIsFullScreen(false)}
                className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
                title="Exit Full Screen (Esc)"
              >
                <FiX className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Center Main Image */}
          <div 
            className="relative flex-1 flex items-center justify-center overflow-hidden my-4"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={images[currentImageIndex]}
              alt={product.product_name}
              className="w-full h-full max-w-[95vw] max-h-[82vh] object-contain drop-shadow-2xl select-none"
            />

            {/* Navigation Arrows in Full Screen */}
            {images.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => setCurrentImageIndex(prev => Math.max(0, prev - 1))}
                  disabled={currentImageIndex === 0}
                  className="absolute left-2 sm:left-6 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/90 text-white rounded-full p-3 disabled:opacity-0 transition-all cursor-pointer border border-white/20 shadow-xl backdrop-blur-md"
                  title="Previous (Left Arrow)"
                >
                  <FiChevronLeft className="w-7 h-7" />
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentImageIndex(prev => Math.min(images.length - 1, prev + 1))}
                  disabled={currentImageIndex === images.length - 1}
                  className="absolute right-2 sm:right-6 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/90 text-white rounded-full p-3 disabled:opacity-0 transition-all cursor-pointer border border-white/20 shadow-xl backdrop-blur-md"
                  title="Next (Right Arrow)"
                >
                  <FiChevronRight className="w-7 h-7" />
                </button>
              </>
            )}
          </div>

          {/* Bottom Fullscreen Bar: Thumbnails & Counter */}
          <div 
            className="flex flex-col items-center gap-2 z-20 shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            {images.length > 1 && (
              <div className="flex items-center gap-2.5 p-2 bg-black/50 backdrop-blur-md rounded-2xl border border-white/10 max-w-full overflow-x-auto">
                {images.map((img, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setCurrentImageIndex(idx)}
                    className={`w-16 h-12 rounded-xl overflow-hidden border-2 transition-all cursor-pointer shrink-0 ${
                      idx === currentImageIndex 
                        ? 'border-emerald-400 ring-2 ring-emerald-400/40 scale-105' 
                        : 'border-white/10 opacity-60 hover:opacity-100'
                    }`}
                  >
                    <img src={img} className="w-full h-full object-cover" alt="" />
                  </button>
                ))}
              </div>
            )}
            <div className="text-white/60 text-xs font-mono">
              {currentImageIndex + 1} of {images.length} • Press ESC to exit
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function PaymentDetailsModal({ isOpen, onClose, installments }) {
  // Extract upcoming schedules from installments
  const schedules = installments.flatMap(i =>
    (i.paymentSchedules || []).filter(s => Number(s.balance_due) > 0).map(s => ({
      ...s,
      product: i.product,
      account_no: i.account_no
    }))
  ).sort((a, b) => new Date(a.due_date) - new Date(b.due_date));

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Upcoming Payments" size="lg">
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

export function OverduePaymentsModal({ isOpen, onClose, installments }) {
  const overdueSchedules = installments.flatMap(i =>
    (i.paymentSchedules || []).filter(s => Number(s.balance_due) > 0 && new Date(s.due_date) < new Date(new Date().setHours(0, 0, 0, 0))).map(s => ({
      ...s,
      product: i.product,
      account_no: i.account_no
    }))
  ).sort((a, b) => new Date(a.due_date) - new Date(b.due_date));

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Overdue Payments" size="lg">
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

export function FullyPaidProductDetailsModal({ isOpen, onClose, accountData }) {
  const [viewReceipt, setViewReceipt] = useState(null);

  if (!isOpen || !accountData) return null;

  const acc = accountData?.account || {};
  const saleItems = accountData?.sale_items || [];
  const payments = accountData?.payments || [];
  const item = saleItems.length > 0 ? saleItems[0] : null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Fully Paid Product & Product Details" size="xl">
      <div className="space-y-6">
        {/* Product Info Section */}
        <div className="flex flex-col sm:flex-row gap-6 p-5 bg-emerald-50/50 dark:bg-emerald-900/10 rounded-xl border border-emerald-100 dark:border-emerald-800/50">
          {item && (item.image_url || item.image) ? (
            <img
              src={(item.image_url || item.image)?.includes('/storage/') ? (item.image_url || item.image).substring((item.image_url || item.image).indexOf('/storage/')) : (item.image_url || item.image)}
              alt={item.product_name}
              className="w-32 h-32 object-cover rounded-xl border border-emerald-200 dark:border-emerald-700/50 bg-white shrink-0 shadow-sm"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          ) : (
            <div className="w-32 h-32 bg-emerald-100/50 dark:bg-emerald-800/30 border border-emerald-200 dark:border-emerald-700/50 rounded-xl flex items-center justify-center shrink-0 shadow-sm">
              <FiPackage className="w-10 h-10 text-emerald-400" />
            </div>
          )}
          <div className="flex-1 flex flex-col justify-center">
            <div className="flex justify-between items-start mb-2">
              <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 leading-tight">
                {item ? item.product_name : 'Multiple Items / Custom Product'}
              </h3>
              <StatusBadge status="Fully Paid" />
            </div>

            {item && item.description && (
              <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                {item.description}
              </p>
            )}

            <div className="grid grid-cols-2 gap-y-2 text-sm mt-auto">
              <div className="text-slate-500">Account No: <span className="font-mono font-bold text-foreground">{acc.account_no}</span></div>
              <div className="text-slate-500">Purchase Date: <span className="font-medium text-foreground">{acc.start_date || acc.sale_date}</span></div>
              <div className="text-slate-500">Branch: <span className="font-medium text-foreground">{acc.branch?.name || (typeof acc.branch === 'string' ? acc.branch : '') || '—'}</span></div>
              <div className="text-slate-500">Processed By: <span className="font-medium text-foreground">{acc.store_admin || 'System/Admin'}</span></div>
            </div>
          </div>
        </div>

        {/* Financials & Payment Info */}
        <div>
          <h4 className="text-sm font-bold text-foreground mb-3">Full Payment Details</h4>
          <div className="overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm bg-[var(--card)]">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500">
                <tr>
                  <th className="py-3 px-4 text-left font-semibold">Product</th>
                  <th className="py-3 px-4 text-left font-semibold">Payment Date</th>
                  <th className="py-3 px-4 text-left font-semibold">Payment Method</th>
                  <th className="py-3 px-4 text-left font-semibold">Status</th>
                  <th className="py-3 px-4 text-right font-semibold">Total Paid</th>
                  <th className="py-3 px-4 text-center font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                  <td className="py-3 px-4 font-semibold text-slate-700 dark:text-slate-200 truncate max-w-[150px]">{item ? item.product_name : 'Product'}</td>
                  <td className="py-3 px-4 text-muted-foreground">{acc.start_date || acc.sale_date}</td>
                  <td className="py-3 px-4 text-muted-foreground">{payments.length > 0 ? payments[0].payment_method : 'Cash'}</td>
                  <td className="py-3 px-4"><StatusBadge status="Fully Paid" /></td>
                  <td className="py-3 px-4 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">{fmt(acc.total_payable)}</td>
                  <td className="py-3 px-4 text-center">
                    {payments.length > 0 && (
                      <button
                        onClick={() => setViewReceipt(payments[0])}
                        className="inline-flex items-center gap-1 px-2 py-1 text-[10px] rounded border border-border hover:bg-muted font-semibold cursor-pointer transition-colors text-muted-foreground"
                      >
                        <FiFileText className="w-3 h-3" />
                        <span>Receipt</span>
                      </button>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* OFFICIAL RECEIPT MODAL */}
      {viewReceipt && (
        <Modal
          isOpen={true}
          onClose={() => setViewReceipt(null)}
          title="Official Payment Receipt"
          size="lg"
        >
          <div className="p-4 space-y-4">
            <div className="text-center pb-4 border-b border-border/50">
              <h3 className="font-bold text-lg text-foreground">PAYMENT RECEIPT</h3>
              <p className="text-xs text-muted-foreground">{viewReceipt.receipt_no}</p>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Payment Date:</span>
                <span className="font-mono font-semibold text-foreground">{viewReceipt.payment_date}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Request / Order:</span>
                <span className="font-mono font-bold text-[#176B87] dark:text-[#64ccc5]">{acc.account_no}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Payment Method:</span>
                <span className="font-semibold text-foreground">{viewReceipt.payment_method}</span>
              </div>
              {viewReceipt.reference_no && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Reference No:</span>
                  <span className="font-mono font-semibold text-foreground">{viewReceipt.reference_no}</span>
                </div>
              )}
              <div className="pt-3 mt-3 border-t border-border/50 flex justify-between items-center">
                <span className="font-bold text-slate-600 dark:text-slate-400">Total Amount</span>
                <span className="text-xl font-mono font-black text-emerald-600 dark:text-emerald-400">{fmt(viewReceipt.amount)}</span>
              </div>
            </div>

            <div className="pt-4 mt-4 border-t border-border/50">
              <button
                onClick={() => window.print()}
                className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-foreground font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <FiFileText /> Print / Save PDF
              </button>
            </div>
          </div>
        </Modal>
      )}
    </Modal>
  );
}

export function InstallmentAccountDetailsModal({ isOpen, onClose, installmentId }) {
  const [accountData, setAccountData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [viewReceipt, setViewReceipt] = useState(null);
  const inFlightRef = useRef(false);

  const loadAccountDetails = useCallback((silent = false, signal) => {
    if (!isOpen || !installmentId) return;
    const isSilent = silent === true;
    if (inFlightRef.current && isSilent) return;
    inFlightRef.current = true;
    if (!isSilent) setLoading(true);
    api.installments.getById(installmentId, { signal })
      .then(data => {
        if (signal?.aborted) return;
        const nextData = data.installment || data;
        setAccountData(prev => (fastDeepEqual(prev, nextData) ? prev : nextData));
      })
      .catch(err => {
        if (err?.name !== 'AbortError') console.error(err);
      })
      .finally(() => {
        inFlightRef.current = false;
        if (!isSilent) setLoading(false);
      });
  }, [isOpen, installmentId]);

  useEffect(() => {
    if (isOpen && installmentId) {
      loadAccountDetails(false);
    }
  }, [isOpen, installmentId, loadAccountDetails]);

  useRealtimeSync((_source, signal) => {
    if (isOpen && installmentId) loadAccountDetails(true, signal);
  }, [isOpen, installmentId, loadAccountDetails], { module: 'installments', enabled: isOpen });

  if (!isOpen) return null;

  const acc = accountData?.account || {};
  const saleItems = accountData?.sale_items || [];
  const schedules = accountData?.schedules || [];
  const payments = accountData?.payments || [];
  const item = saleItems.length > 0 ? saleItems[0] : null;
  const isFullPayment = acc.account_no?.startsWith('REQ') || Number(acc.number_of_installments) === 0;

  if (loading || !accountData) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="Loading Details" size="xl">
        <LoadingState message="Loading account details..." />
      </Modal>
    );
  }

  if (isFullPayment) {
    return <FullyPaidProductDetailsModal isOpen={isOpen} onClose={onClose} accountData={accountData} />;
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Installment & Product Details" size="xl">
      <div className="space-y-6">
        {/* Product Info Section */}
        <div className="flex flex-col sm:flex-row gap-6 p-5 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
          {item && (item.image_url || item.image) ? (
            <img
              src={(item.image_url || item.image)?.includes('/storage/') ? (item.image_url || item.image).substring((item.image_url || item.image).indexOf('/storage/')) : (item.image_url || item.image)}
              alt={item.product_name}
              className="w-32 h-32 object-cover rounded-xl border border-border bg-white shrink-0 shadow-sm"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          ) : (
            <div className="w-32 h-32 bg-muted border border-border rounded-xl flex items-center justify-center shrink-0 shadow-sm">
              <FiPackage className="w-10 h-10 text-slate-400" />
            </div>
          )}
          <div className="flex-1 flex flex-col justify-center">
            <div className="flex justify-between items-start mb-2">
              <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 leading-tight">
                {item ? item.product_name : 'Multiple Items / Custom Product'}
              </h3>
              <StatusBadge status={Number(acc.balance) <= 0 ? 'Complete Payment' : acc.status} />
            </div>

            {item && item.description && (
              <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                {item.description}
              </p>
            )}

            <div className="grid grid-cols-2 gap-y-2 text-sm mt-auto">
              <div className="text-slate-500">Account No: <span className="font-mono font-bold text-foreground">{acc.account_no}</span></div>
              <div className="text-slate-500">Purchase Date: <span className="font-medium text-foreground">{acc.start_date || acc.sale_date}</span></div>
              <div className="text-slate-500">Branch: <span className="font-medium text-foreground">{acc.branch?.name || (typeof acc.branch === 'string' ? acc.branch : '') || '—'}</span></div>
              <div className="text-slate-500">Processed By: <span className="font-medium text-foreground">{acc.store_admin || 'System/Admin'}</span></div>
            </div>
          </div>
        </div>

        {/* Financials Section */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
          <div className="p-3 bg-[var(--card)] border border-slate-200 dark:border-slate-800 rounded-xl">
            <div className="text-xs text-slate-500 uppercase font-semibold mb-1">Total Payable</div>
            <div className="text-base font-mono font-bold text-slate-800 dark:text-slate-100">{fmt(acc.total_payable)}</div>
          </div>
          <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl">
            <div className="text-xs text-emerald-600 dark:text-emerald-400 uppercase font-semibold mb-1">Total Paid</div>
            <div className="text-base font-mono font-bold text-emerald-700 dark:text-emerald-300">{fmt(acc.paid ?? acc.total_paid)}</div>
          </div>
          <div className="p-3 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-xl">
            <div className="text-xs text-rose-600 dark:text-rose-400 uppercase font-semibold mb-1">Remaining Balance</div>
            <div className="text-base font-mono font-bold text-rose-700 dark:text-rose-300">{fmt(acc.balance)}</div>
          </div>
          <div className="p-3 bg-[#176B87]/5 border border-[#176B87]/20 rounded-xl">
            <div className="text-xs text-[#176B87] dark:text-[#64ccc5] uppercase font-semibold mb-1">Monthly Pay</div>
            <div className="text-base font-mono font-bold text-[#176B87] dark:text-[#64ccc5]">{fmt(acc.installment_amount)}</div>
          </div>
        </div>

        {/* Tables Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-2">
          {/* Payment History */}
          <div>
            <h4 className="text-sm font-bold text-foreground mb-3">Payments Made (History)</h4>
            <div className="overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-xl max-h-[250px] shadow-sm">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 sticky top-0">
                  <tr>
                    <th className="py-2.5 px-3 text-left font-semibold">Date</th>
                    <th className="py-2.5 px-3 text-left font-semibold">Receipt</th>
                    <th className="py-2.5 px-3 text-left font-semibold">Method</th>
                    <th className="py-2.5 px-3 text-right font-semibold">Amount</th>
                    <th className="py-2.5 px-3 text-center font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50 bg-[var(--card)]">
                  {payments.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="py-6 text-center text-slate-400">No payments made yet.</td>
                    </tr>
                  ) : (
                    payments.map(p => (
                      <tr key={p.payment_id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                        <td className="py-2.5 px-3 text-muted-foreground">{p.payment_date}</td>
                        <td className="py-2.5 px-3 font-mono text-slate-500">{p.receipt_no}</td>
                        <td className="py-2.5 px-3 text-muted-foreground">{p.payment_method}</td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">{fmt(p.amount)}</td>
                        <td className="py-2.5 px-3 text-center">
                          <button
                            onClick={() => setViewReceipt(p)}
                            className="inline-flex items-center gap-1 px-2 py-1 text-[10px] rounded border border-border hover:bg-muted font-semibold cursor-pointer transition-colors text-muted-foreground"
                          >
                            <FiFileText className="w-3 h-3" />
                            <span>Receipt</span>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Payment Schedule */}
          <div>
            <h4 className="text-sm font-bold text-foreground mb-3">
              Payment Schedule & Due Dates
            </h4>
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
                        <td className="py-2.5 px-3 text-muted-foreground">{s.status === 'Paid' && s.paid_date ? s.paid_date : s.due_date}</td>
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

      {/* OFFICIAL RECEIPT MODAL */}
      {viewReceipt && (
        <Modal
          isOpen={true}
          onClose={() => setViewReceipt(null)}
          title="Official Payment Receipt"
          size="lg"
        >
          <div className="space-y-4 text-xs">
            <div className="text-center pb-3 border-b border-slate-200 dark:border-slate-800 space-y-0.5">
              <div className="text-base font-black tracking-wider text-slate-800 dark:text-slate-100">Z-LICZ APPLIANCES & FURNITURE</div>
              <div className="text-[11px] text-muted-foreground">{acc.branch?.name || (typeof acc.branch === 'string' ? acc.branch : '') || 'Headquarters'} · Official Collection Receipt</div>
              <div className="text-xs font-mono font-bold text-[#176B87] dark:text-[#64ccc5] pt-1">Receipt #{viewReceipt.receipt_no}</div>
            </div>

            <div className="space-y-2 p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
              <div className="flex justify-between">
                <span className="text-slate-500">{"Payment Date:"}</span>
                <span className="font-mono font-semibold text-foreground">{viewReceipt.payment_date}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{isFullPayment ? 'Request / Order:' : 'Installment:'}</span>
                <span className="font-mono font-bold text-[#176B87] dark:text-[#64ccc5]">{acc.account_no}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Received From (Customer):</span>
                <span className="font-semibold text-foreground">{acc.customer_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Payment Method:</span>
                <span className="font-semibold text-foreground">{viewReceipt.payment_method}</span>
              </div>
              {viewReceipt.reference_no && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Ref / Trace No:</span>
                  <span className="font-mono text-foreground">{viewReceipt.reference_no}</span>
                </div>
              )}
            </div>

            <div className="border-t border-dashed border-border pt-3">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-500 border-b border-slate-200 dark:border-slate-800">
                    <th className="py-1 text-left font-normal">Description</th>
                    <th className="py-1 text-right font-normal">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                  <tr>
                    <td className="py-2 text-foreground font-medium">Payment for {acc.account_no}</td>
                    <td className="py-2 text-right font-mono font-bold text-foreground">{fmt(viewReceipt.amount)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="border-t border-slate-200 dark:border-slate-800 pt-3 flex justify-between items-end">
              <div>
                <div className="text-[10px] text-slate-500">Processed By</div>
                <div className="font-semibold text-foreground">{viewReceipt.received_by || acc.store_admin}</div>
              </div>
              <div className="text-right">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-0.5">Total Paid</div>
                <div className="text-xl font-black font-mono text-emerald-600 dark:text-emerald-400">{fmt(viewReceipt.amount)}</div>
              </div>
            </div>

            <div className="pt-2">
              <button
                onClick={() => window.print()}
                className="w-full flex items-center justify-center gap-2 py-2 bg-[#176B87] hover:bg-[#176B87]/90 text-white font-bold rounded-xl transition-colors cursor-pointer"
              >
                <FiFileText className="w-4 h-4" />
                Print Receipt
              </button>
            </div>
          </div>
        </Modal>
      )}
    </Modal>
  );
}

export function StatementModal({ isOpen, onClose, installments = [], user = null, stats = null }) {
  const [statements, setStatements] = useState([]);
  const [customerData, setCustomerData] = useState(null);
  const [summaryData, setSummaryData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('All'); // 'All' | 'Purchase' | 'Payment'
  const [searchQuery, setSearchQuery] = useState('');
  const inFlightRef = useRef(false);

  // Fallback builder from installments
  const buildFallbackStatements = useCallback(() => {
    const list = [];
    (installments || []).forEach(inst => {
      // Purchase entry
      if (Number(inst.total_amount || 0) > 0) {
        list.push({
          id: `INST-${inst.installment_id || inst.account_no}`,
          date: inst.purchase_date || '—',
          rawDate: inst.purchase_date ? new Date(inst.purchase_date).getTime() : 0,
          reference: inst.account_no || 'ORD-000',
          type: 'Purchase',
          category: 'Debit',
          description: inst.product || 'Product Purchase',
          payment_method: inst.payment_method || 'Installment Plan',
          amount: Number(inst.total_amount || 0),
          status: inst.status || 'Active',
          account_no: inst.account_no,
        });
      }

      // Payments from installments.payments if available
      if (Array.isArray(inst.payments) && inst.payments.length > 0) {
        inst.payments.forEach(p => {
          list.push({
            id: `PAY-${p.payment_id || p.receipt_no}`,
            date: p.payment_date || '—',
            rawDate: p.payment_date ? new Date(p.payment_date).getTime() : 0,
            reference: p.receipt_no || ('REC-' + p.payment_id),
            type: 'Payment',
            category: 'Credit',
            description: p.notes || `Payment for ${inst.account_no} (${inst.product})`,
            payment_method: p.payment_method || 'Payment',
            amount: Number(p.amount || 0),
            status: p.status || 'Completed',
            account_no: inst.account_no,
          });
        });
      } else {
        // From paymentSchedules
        (inst.paymentSchedules || []).forEach(s => {
          if (s.status === 'Paid' || Number(s.amount_paid || 0) > 0) {
            list.push({
              id: `SCHED-${s.schedule_id}`,
              date: s.paid_date || s.due_date || '—',
              rawDate: new Date(s.paid_date || s.due_date).getTime(),
              reference: `SCHED-#${s.installment_no}`,
              type: 'Payment',
              category: 'Credit',
              description: `Payment for ${inst.product} (Schedule #${s.installment_no})`,
              payment_method: inst.payment_method || 'Installment Payment',
              amount: Number(s.amount_paid || s.amount_due || 0),
              status: 'Completed',
              account_no: inst.account_no,
            });
          }
        });

        // Or direct paid_amount if no schedule rows matched
        if (Number(inst.paid_amount || 0) > 0 && !list.some(x => x.account_no === inst.account_no && x.type === 'Payment')) {
          list.push({
            id: `DP-${inst.account_no}`,
            date: inst.purchase_date || '—',
            rawDate: inst.purchase_date ? new Date(inst.purchase_date).getTime() : 0,
            reference: `PAY-${inst.account_no}`,
            type: 'Payment',
            category: 'Credit',
            description: `Payment / Downpayment for ${inst.product}`,
            payment_method: 'Payment',
            amount: Number(inst.paid_amount || 0),
            status: 'Completed',
            account_no: inst.account_no,
          });
        }
      }
    });

    return list.sort((a, b) => b.rawDate - a.rawDate);
  }, [installments]);

  const loadStatements = useCallback((silent = false, signal) => {
    if (!isOpen) return;
    const isSilent = silent === true;
    if (inFlightRef.current && isSilent) return;
    inFlightRef.current = true;
    if (!isSilent) setLoading(true);

    api.customerApp.getStatements({ signal })
      .then(res => {
        if (signal?.aborted) return;
        if (res && res.statements && res.statements.length > 0) {
          setStatements(prev => (fastDeepEqual(prev, res.statements) ? prev : res.statements));
          setCustomerData(prev => (fastDeepEqual(prev, res.customer) ? prev : res.customer));
          setSummaryData(prev => (fastDeepEqual(prev, res.summary) ? prev : res.summary));
        } else {
          const fallback = buildFallbackStatements();
          setStatements(prev => (fastDeepEqual(prev, fallback) ? prev : fallback));
          if (res?.customer) setCustomerData(prev => (fastDeepEqual(prev, res.customer) ? prev : res.customer));
          if (res?.summary) setSummaryData(prev => (fastDeepEqual(prev, res.summary) ? prev : res.summary));
        }
      })
      .catch(err => {
        if (err?.name !== 'AbortError') {
          console.warn('Dedicated customer statement load error, using fallback:', err);
          const fallback = buildFallbackStatements();
          setStatements(prev => (fastDeepEqual(prev, fallback) ? prev : fallback));
        }
      })
      .finally(() => {
        inFlightRef.current = false;
        if (!isSilent) setLoading(false);
      });
  }, [isOpen, buildFallbackStatements]);

  useEffect(() => {
    if (isOpen) {
      loadStatements(false);
    }
  }, [isOpen, loadStatements]);

  useRealtimeSync((_source, signal) => {
    if (isOpen) loadStatements(true, signal);
  }, [isOpen, loadStatements], { module: 'installments', enabled: isOpen });

  if (!isOpen) return null;

  const calculatedTotalPurchases = summaryData?.total_purchases ?? (
    statements.filter(s => s.type === 'Purchase').reduce((sum, s) => sum + Number(s.amount || 0), 0)
    || installments.reduce((sum, i) => sum + Number(i.total_amount || 0), 0)
  );

  const calculatedTotalPaid = summaryData?.total_paid ?? (
    statements.filter(s => s.type === 'Payment' || s.type === 'Down Payment').reduce((sum, s) => sum + Number(s.amount || 0), 0)
    || installments.reduce((sum, i) => sum + Number(i.paid_amount || 0), 0)
  );

  const calculatedBalance = summaryData?.total_balance ?? (
    stats?.total_credit_balance ?? Math.max(0, calculatedTotalPurchases - calculatedTotalPaid)
  );

  const nextDue = summaryData?.next_due_date || (
    installments.map(i => i.next_due_date).filter(Boolean).sort()[0] || null
  );
  const monthlyPay = summaryData?.next_due_amount || stats?.monthly_payment || (
    installments.reduce((sum, i) => sum + Number(i.monthly_payment || 0), 0)
  );

  const displayName = customerData?.name || (user ? `${user.first_name || ''} ${user.last_name || ''}`.trim() : '') || 'Valued Customer';
  const customerCode = customerData?.customer_code || user?.customer_code || user?.customer?.customer_code || '—';
  const customerBranch = customerData?.branch_name || user?.branch || 'Z-LICZ Trading';
  const customerContact = customerData?.phone || user?.phone_number || customerData?.email || user?.email || '—';

  const filteredStatements = statements.filter(s => {
    if (filterType === 'Purchase' && s.type !== 'Purchase') return false;
    if (filterType === 'Payment' && (s.type !== 'Payment' && s.type !== 'Down Payment')) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const ref = (s.reference || '').toLowerCase();
      const desc = (s.description || '').toLowerCase();
      const method = (s.payment_method || '').toLowerCase();
      const acct = (s.account_no || '').toLowerCase();
      return ref.includes(q) || desc.includes(q) || method.includes(q) || acct.includes(q);
    }
    return true;
  });

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const rowsHtml = statements.map(s => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-family: monospace;">${s.date}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-family: monospace; font-weight: bold; color: #176B87;">${s.reference || '—'}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">
          <div style="font-weight: 600;">${s.description || '—'}</div>
          ${s.account_no ? `<div style="font-size: 11px; color: #6b7280; font-family: monospace;">Acct: ${s.account_no}</div>` : ''}
        </td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${s.payment_method || '—'}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: center;">
          <span style="display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: bold; ${s.type === 'Payment' || s.type === 'Down Payment' ? 'background: #dcfce7; color: #166534;' : 'background: #f1f5f9; color: #334155;'}">
            ${s.type}
          </span>
        </td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: right; font-family: monospace; font-weight: bold; ${s.type === 'Payment' || s.type === 'Down Payment' ? 'color: #059669;' : 'color: #111827;'}">
          ${s.type === 'Payment' || s.type === 'Down Payment' ? '-' : ''}${fmt(s.amount)}
        </td>
      </tr>
    `).join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Statement of Account - ${displayName}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 30px; color: #111827; }
            .header { display: flex; justify-content: space-between; border-bottom: 2px solid #176B87; padding-bottom: 15px; margin-bottom: 20px; }
            .company { font-size: 20px; font-weight: 900; color: #176B87; letter-spacing: 0.5px; }
            .sub { font-size: 12px; color: #4b5563; margin-top: 3px; }
            .meta-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; background: #f8fafc; padding: 15px; border-radius: 8px; margin-bottom: 20px; font-size: 12px; border: 1px solid #e2e8f0; }
            .summary-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 20px; }
            .card { padding: 12px; border: 1px solid #e2e8f0; border-radius: 8px; text-align: center; }
            .card-title { font-size: 11px; text-transform: uppercase; font-weight: 700; color: #64748b; margin-bottom: 4px; }
            .card-val { font-size: 16px; font-family: monospace; font-weight: 800; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th { text-align: left; padding: 8px; background: #f1f5f9; color: #475569; font-weight: 700; border-bottom: 1px solid #cbd5e1; }
            @media print { body { padding: 10px; } }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="company">Z-LICZ FURNITURE & APPLIANCES TRADING</div>
              <div class="sub">Official Customer Statement of Account &bull; ${customerBranch}</div>
            </div>
            <div style="text-align: right; font-size: 12px; color: #64748b;">
              <div><strong>Statement Date:</strong> ${new Date().toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
              <div><strong>Status:</strong> ${Number(calculatedBalance) <= 0 ? 'Fully Paid' : 'Active Account'}</div>
            </div>
          </div>

          <div class="meta-grid">
            <div><strong>Customer Name:</strong> ${displayName}</div>
            <div><strong>Customer Code:</strong> ${customerCode}</div>
            <div><strong>Contact:</strong> ${customerContact}</div>
            <div><strong>Store Branch:</strong> ${customerBranch}</div>
          </div>

          <div class="summary-cards">
            <div class="card" style="background: #f8fafc;">
              <div class="card-title">Total Purchases / Value</div>
              <div class="card-val" style="color: #0f172a;">${fmt(calculatedTotalPurchases)}</div>
            </div>
            <div class="card" style="background: #f0fdf4;">
              <div class="card-title" style="color: #166534;">Total Paid to Date</div>
              <div class="card-val" style="color: #15803d;">${fmt(calculatedTotalPaid)}</div>
            </div>
            <div class="card" style="background: ${Number(calculatedBalance) > 0 ? '#fff1f2' : '#f0fdf4'};">
              <div class="card-title" style="color: ${Number(calculatedBalance) > 0 ? '#9f1239' : '#166534'};">Outstanding Balance</div>
              <div class="card-val" style="color: ${Number(calculatedBalance) > 0 ? '#e11d48' : '#15803d'};">${fmt(calculatedBalance)}</div>
            </div>
          </div>

          <h3 style="font-size: 14px; font-weight: 700; margin-bottom: 10px; color: #0f172a;">Transaction & Payment Ledger</h3>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Reference #</th>
                <th>Description</th>
                <th>Method</th>
                <th style="text-align: center;">Type</th>
                <th style="text-align: right;">Amount (PHP)</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml || '<tr><td colspan="6" style="text-align: center; padding: 20px; color: #94a3b8;">No transaction history available</td></tr>'}
            </tbody>
          </table>

          <div style="margin-top: 40px; border-top: 1px dashed #cbd5e1; padding-top: 15px; font-size: 11px; color: #64748b; display: flex; justify-content: space-between;">
            <div>This is a system-generated statement. For inquiries, please contact your store branch.</div>
            <div>Generated by Z-LICZ Core System</div>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 350);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Statement of Account" size="2xl">
      {loading ? (
        <LoadingState message="Loading your statement and ledger records..." />
      ) : statements.length === 0 ? (
        <EmptyState
          icon={<FiFileText className="w-12 h-12 text-muted-foreground/30 mx-auto" />}
          title="No statements available"
          description="You don't have any purchase or payment history registered to your account yet."
        />
      ) : (
        <div className="space-y-4 text-xs">
          {/* Customer & Branch Header Card */}
          <div className="p-3.5 bg-muted/30 border border-border rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <div className="text-sm font-bold text-foreground flex items-center gap-2">
                <span>{displayName}</span>
                <span className="font-mono text-[10px] px-1.5 py-0.5 bg-primary/10 text-primary font-bold rounded">
                  {customerCode}
                </span>
              </div>
              <div className="text-[11px] text-muted-foreground flex flex-wrap items-center gap-2">
                <span>Branch: <strong className="text-foreground">{customerBranch}</strong></span>
                <span>•</span>
                <span>Contact: <strong className="text-foreground">{customerContact}</strong></span>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
              <button
                type="button"
                onClick={() => loadStatements(false)}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-xs font-medium hover:bg-muted/50 transition-colors cursor-pointer"
                title="Refresh statement"
              >
                <FiRefreshCw className="w-3.5 h-3.5" />
                <span>Refresh</span>
              </button>
              <button
                type="button"
                onClick={handlePrint}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#176B87] hover:bg-[#176B87]/90 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors cursor-pointer"
              >
                <FiPrinter className="w-3.5 h-3.5" />
                <span>Print SOA</span>
              </button>
            </div>
          </div>

          {/* 4 Financial Stat Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="p-3 bg-card border border-border rounded-xl">
              <div className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Total Purchases</div>
              <div className="font-mono font-bold text-sm sm:text-base text-foreground">{fmt(calculatedTotalPurchases)}</div>
            </div>
            <div className="p-3 bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-xl">
              <div className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 mb-1">Total Paid</div>
              <div className="font-mono font-bold text-sm sm:text-base text-emerald-700 dark:text-emerald-300">{fmt(calculatedTotalPaid)}</div>
            </div>
            <div className="p-3 bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800 rounded-xl">
              <div className="text-[10px] uppercase font-bold text-rose-600 dark:text-rose-400 mb-1">Remaining Balance</div>
              <div className="font-mono font-bold text-sm sm:text-base text-rose-700 dark:text-rose-300">{fmt(calculatedBalance)}</div>
            </div>
            <div className="p-3 bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-xl">
              <div className="text-[10px] uppercase font-bold text-blue-600 dark:text-blue-400 mb-1">
                {nextDue ? `Next Due: ${nextDue}` : 'Monthly Amort.'}
              </div>
              <div className="font-mono font-bold text-sm sm:text-base text-blue-700 dark:text-blue-300">
                {monthlyPay > 0 ? fmt(monthlyPay) : '₱0.00'}
              </div>
            </div>
          </div>

          {/* Filter Tabs & Search */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1">
            <div className="flex items-center gap-1 bg-muted/40 p-0.5 rounded-lg border border-border/60 self-start">
              {['All', 'Purchase', 'Payment'].map(type => {
                const count = type === 'All' 
                  ? statements.length 
                  : type === 'Purchase' 
                    ? statements.filter(s => s.type === 'Purchase').length 
                    : statements.filter(s => s.type === 'Payment' || s.type === 'Down Payment').length;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setFilterType(type)}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                      filterType === type 
                        ? 'bg-card text-foreground shadow-sm' 
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {type === 'All' ? 'All Transactions' : type === 'Purchase' ? 'Purchases' : 'Payments'} ({count})
                  </button>
                );
              })}
            </div>

            <div className="relative w-full sm:w-64">
              <FiSearch className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search reference, product, note..."
                className="w-full pl-8 pr-3 py-1.5 bg-card border border-border rounded-lg text-xs placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <FiX className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Statement Ledger Table */}
          <div className="overflow-x-auto border border-border rounded-xl max-h-[50vh] shadow-inner bg-card">
            <table className="w-full text-xs">
              <thead className="bg-muted/60 text-muted-foreground sticky top-0 shadow-sm z-10">
                <tr>
                  <th className="py-2.5 px-3 text-left font-semibold">Date</th>
                  <th className="py-2.5 px-3 text-left font-semibold">Reference</th>
                  <th className="py-2.5 px-3 text-left font-semibold">Description</th>
                  <th className="py-2.5 px-3 text-left font-semibold">Method</th>
                  <th className="py-2.5 px-3 text-center font-semibold">Type</th>
                  <th className="py-2.5 px-3 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredStatements.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="py-8 text-center text-muted-foreground">
                      No matching records found.
                    </td>
                  </tr>
                ) : (
                  filteredStatements.map((s, i) => {
                    const isPayment = s.type === 'Payment' || s.type === 'Down Payment';
                    return (
                      <tr key={s.id || i} className="hover:bg-muted/40 transition-colors">
                        <td className="py-2.5 px-3 font-mono text-muted-foreground whitespace-nowrap">{s.date}</td>
                        <td className="py-2.5 px-3 font-mono font-bold text-primary whitespace-nowrap">{s.reference || '—'}</td>
                        <td className="py-2.5 px-3 max-w-[220px]">
                          <div className="font-medium text-foreground truncate" title={s.description}>
                            {s.description || '—'}
                          </div>
                          {s.account_no && (
                            <div className="font-mono text-[10px] text-muted-foreground">Acct: {s.account_no}</div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-muted-foreground whitespace-nowrap">{s.payment_method || '—'}</td>
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          <Badge variant={isPayment ? 'success' : 'secondary'}>
                            {s.type}
                          </Badge>
                        </td>
                        <td className={`py-2.5 px-3 text-right font-mono font-bold whitespace-nowrap ${
                          isPayment ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground'
                        }`}>
                          {isPayment ? '-' : ''}{fmt(s.amount)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  );
}

export function MakePaymentModal({ isOpen, onClose, installments, onPaymentSuccess }) {
  const [paymentType, setPaymentType] = useState('Installment Payment');
  const [paymentMethod, setPaymentMethod] = useState('GCash');
  const [bankName, setBankName] = useState('BDO');
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
    return (i.paymentSchedules || []).filter(s => Number(s.balance_due) > 0).map(s => ({
      ...s,
      product: i.product || i.productName || 'Product',
      account_no: i.account_no,
      installment_id: i.installment_id,
      installment_balance: i.balance !== undefined ? i.balance : balance,
      image_url: i.image_url || null
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
      const due = Number(schedule.balance_due ?? schedule.amount_due ?? 0);
      const balance = Number(schedule.installment_balance ?? 0);
      setAmount(Math.min(due, balance));
    } else {
      setAmount('');
    }
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      showError('Invalid File', 'Only JPG, PNG, or WEBP images are allowed.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      showError('File Too Large', 'Image size should be up to 5 MB.');
      return;
    }

    setProofImage(file);
    setProofPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (paymentType === 'Installment Payment' && !selectedSchedule) return;
    if (paymentType === 'Get Product' && !selectedProductId) {
      showWarning('Missing Product', 'Please select a product first.');
      return;
    }
    if (!amount) return;

    setSubmitting(true);
    try {
      if (paymentType === 'Get Product') {
        const prod = products.find(p => p.product_id.toString() === selectedProductId);
        if (prod && prod.stock_quantity <= 0) {
          showError('Out of Stock', 'This product is currently out of stock.');
          setSubmitting(false);
          return;
        }
      }

      const formData = new FormData();
      const finalPaymentMethod = paymentMethod === 'Bank Account' ? bankName : paymentMethod;

      if (paymentType === 'Installment Payment') {
        const schedule = pendingSchedules.find(s => s.schedule_id.toString() === selectedSchedule);
        if (!schedule) throw new Error('No active installment account found.');

        formData.append('installment_id', schedule.installment_id);
        formData.append('schedule_id', selectedSchedule);
        formData.append('amount', amount);
        formData.append('payment_method', finalPaymentMethod);
        if (referenceNumber) formData.append('reference_no', referenceNumber);
        if (proofImage) formData.append('proof_of_payment', proofImage);

        await api.payments.create(formData);
      } else {
        formData.append('product_id', selectedProductId);
        formData.append('amount', amount);
        formData.append('payment_method', finalPaymentMethod);
        if (referenceNumber) formData.append('reference_no', referenceNumber);
        if (proofImage) formData.append('proof_of_payment', proofImage);

        await api.customerApp.requestProduct(formData);
      }

      showSuccess(
        paymentType === 'Get Product' ? 'Request Submitted' : 'Payment Submitted',
        paymentType === 'Get Product' ? 'Your new product request has been successfully submitted.' : 'Your payment request has been received and applied.'
      );
      if (onPaymentSuccess) {
        onPaymentSuccess();
      } else {
        triggerDataSync('installments');
      }
      onClose();
    } catch (err) {
      console.error(err);
      showError('Payment Failed', err.message || 'An error occurred while submitting your payment.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;
  const selectedScheduleDetails = pendingSchedules.find(s => s.schedule_id.toString() === selectedSchedule);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Make a Payment" size="lg">
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
              <div className="bg-muted/30 p-4 rounded-xl text-sm border border-border space-y-3">
                <div className="flex items-center gap-3 border-b border-border/50 pb-3">
                  {selectedScheduleDetails.image_url ? (
                    <img
                      src={selectedScheduleDetails.image_url.includes('/storage/') ? selectedScheduleDetails.image_url.substring(selectedScheduleDetails.image_url.indexOf('/storage/')) : selectedScheduleDetails.image_url}
                      alt={selectedScheduleDetails.product}
                      className="w-12 h-12 rounded-xl object-cover border border-border bg-card shrink-0"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-purple-100 dark:bg-purple-950/60 text-purple-600 dark:text-purple-300 flex items-center justify-center border border-purple-200 dark:border-purple-800 shrink-0">
                      <FiPackage className="w-6 h-6" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-foreground truncate" title={selectedScheduleDetails.product}>
                        {selectedScheduleDetails.product}
                      </span>
                      {selectedScheduleDetails.account_no && (
                        <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border shrink-0">
                          {selectedScheduleDetails.account_no}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Schedule Due: {selectedScheduleDetails.due_date}
                    </p>
                  </div>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Current Payment Due</span>
                  <span className="font-bold text-rose-500 font-mono">
                    {fmt(Math.min(Number(selectedScheduleDetails.balance_due ?? selectedScheduleDetails.amount_due ?? 0), Number(selectedScheduleDetails.installment_balance ?? 0)))}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Remaining Balance</span>
                  <span className="font-bold text-foreground font-mono">
                    {fmt(selectedScheduleDetails.installment_balance)}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-1 border-t border-border/40">
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
          </div>
        )}

        {(paymentType === 'Get Product' || (paymentType === 'Installment Payment' && installments.length > 0)) && (
          <>
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-xs font-bold text-muted-foreground">Payment Amount</label>
                {paymentType === 'Installment Payment' && selectedScheduleDetails && (
                  <button
                    type="button"
                    onClick={() => setAmount(selectedScheduleDetails.installment_balance || 0)}
                    className="text-[10px] font-bold text-blue-500 hover:text-blue-600 transition-colors cursor-pointer"
                  >
                    Pay Full Balance
                  </button>
                )}
                {paymentType === 'Get Product' && selectedProductId && (() => {
                  const prod = products.find(p => p.product_id.toString() === selectedProductId);
                  const price = prod ? (prod.discount_price > 0 ? prod.discount_price : prod.unit_price) : 0;
                  return (
                    <button
                      type="button"
                      onClick={() => setAmount(price)}
                      className="text-[10px] font-bold text-blue-500 hover:text-blue-600 transition-colors cursor-pointer"
                    >
                      Pay Full Price
                    </button>
                  );
                })()}
              </div>
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

            <div>
              <label className="block text-xs font-bold text-muted-foreground mb-1">Payment Method</label>
              <div className="flex flex-wrap gap-2">
                {['GCash', 'Maya', 'Bank Account'].map(method => {
                  const isDisabled = false;
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

            {paymentMethod === 'Bank Account' && (
              <div>
                <label className="block text-xs font-bold text-muted-foreground mb-1">Select Bank</label>
                <select
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground text-sm focus:ring-2 focus:ring-blue-500/20 outline-none"
                >
                  <option value="BDO">BDO</option>
                  <option value="BPI">BPI</option>
                  <option value="Bank Transfer/InstaPay">Bank Transfer / InstaPay</option>
                </select>
              </div>
            )}

            {paymentMethod !== 'Installment' && (
              <div>
                <label className="block text-xs font-bold text-muted-foreground mb-1">Transaction Reference</label>
                <input
                  type="text"
                  value={referenceNumber}
                  onChange={e => setReferenceNumber(e.target.value.replace(/\D/g, ''))}
                  placeholder="Enter reference number"
                  className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground text-sm focus:ring-2 focus:ring-blue-500/20 outline-none"
                  required
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-muted-foreground mb-1">
                Proof of Payment <span className="text-blue-500">*</span>
              </label>
              <div className="relative w-full border-2 border-dashed border-border rounded-xl p-4 flex flex-col items-center justify-center bg-card text-center overflow-hidden hover:bg-muted/30 transition-colors">
                <input
                  type="file"
                  accept="image/jpeg, image/png, image/webp"
                  onChange={handleImageChange}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  required={!proofPreview}
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

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-border hover:bg-muted text-xs font-bold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || (paymentType === 'Installment Payment' && (!selectedSchedule || installments.length === 0)) || (paymentType === 'Get Product' && !selectedProductId) || !proofImage}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {submitting ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <TbCurrencyPeso className="w-4 h-4" />}
            <span>{submitting ? 'Processing...' : (paymentType === 'Get Product' ? 'Submit Product Request' : 'Submit Payment')}</span>
          </button>
        </div>
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
  const inFlightRef = useRef(false);

  const loadMyMessages = useCallback(async (silent = false, signal) => {
    const isSilent = silent === true;
    if (inFlightRef.current && isSilent) return;
    inFlightRef.current = true;
    if (!isSilent) setLoadingHistory(true);
    try {
      const data = await api.supportMessages.getAll({}, { signal });
      if (signal?.aborted) return;
      const nextMsgs = data.messages || [];
      setMyMessages(prev => (fastDeepEqual(prev, nextMsgs) ? prev : nextMsgs));
    } catch (err) {
      if (err?.name !== 'AbortError') console.error(err);
    } finally {
      inFlightRef.current = false;
      if (!isSilent) setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && activeTab === 'history') {
      loadMyMessages(false);
    }
  }, [isOpen, activeTab, loadMyMessages]);

  useRealtimeSync((_source, signal) => {
    if (isOpen) {
      loadMyMessages(true, signal);
    }
  }, [isOpen, loadMyMessages], { module: 'support', enabled: isOpen });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      await api.supportMessages.create({ topic, message });
      showSuccess('Message Sent', 'Our support team will get back to you within 24 hours.');
      setTopic('');
      setMessage('');
      setActiveTab('history');
      loadMyMessages();
      triggerDataSync('support');
    } catch (err) {
      console.error(err);
      showError('Error', err.message || 'Failed to send message');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteMessage = async (id) => {
    const isConfirmed = await confirmDelete(
      'Are you sure?',
      'This will permanently delete this feedback and all its history.'
    );
    if (isConfirmed) {
      try {
        await api.supportMessages.delete(id);
        loadMyMessages(true);
        triggerDataSync('support');
        showToast('Your feedback has been deleted.', 'success');
      } catch (err) {
        console.error(err);
        showError('Error', 'Failed to delete feedback.');
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

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-border hover:bg-muted text-xs font-bold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {submitting ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <FiMessageCircle className="w-4 h-4" />}
              <span>{submitting ? 'Sending...' : 'Send Message'}</span>
            </button>
          </div>
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
                        triggerDataSync('support');
                        e.target.reset();
                      } catch (err) {
                        console.error(err);
                        showError('Reply Failed', err.response?.data?.message || err.message || 'Failed to send reply');
                      } finally {
                        btn.disabled = false;
                        btn.innerText = 'Reply';
                      }
                    }} className="mt-3 flex gap-2">
                      <input
                        type="text"
                        name="reply"
                        placeholder="Type your reply to the admin..."
                        className="flex-1 px-3 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-card text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
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

export function InstallmentsModal({ isOpen, onClose, onMakePayment, onViewLedger, onBrowseProducts }) {
  const [installments, setInstallments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('All'); // 'All' | 'Active' | 'Overdue' | 'Completed'
  const inFlightRef = useRef(false);

  const loadData = useCallback(async (silent = false, signal) => {
    const isSilent = silent === true;
    if (inFlightRef.current && isSilent) return;
    inFlightRef.current = true;
    if (!isSilent) setLoading(true);
    try {
      const res = await api.customerApp.getInstallments({ signal });
      if (signal?.aborted) return;
      const nextList = res.installments || [];
      setInstallments(prev => (fastDeepEqual(prev, nextList) ? prev : nextList));
    } catch (err) {
      if (err?.name !== 'AbortError') console.error('Failed to load customer installments', err);
    } finally {
      inFlightRef.current = false;
      if (!isSilent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadData(false);
    }
  }, [isOpen, loadData]);

  useRealtimeSync((_source, signal) => {
    if (isOpen) loadData(true, signal);
  }, [isOpen, loadData], { module: 'installments', enabled: isOpen });

  if (!isOpen) return null;

  const activeAccounts = installments.filter(i => i.status === 'Active' || i.status === 'Pending' || i.status === 'Overdue');
  const totalBalance = activeAccounts.reduce((sum, i) => sum + (Number(i.balance) || 0), 0);
  const monthlyAmortization = activeAccounts.reduce((sum, i) => sum + (Number(i.monthly_payment) || 0), 0);

  const filteredInstallments = installments.filter(i => {
    if (activeFilter === 'Active') return (i.status === 'Active' || i.status === 'Pending') && Number(i.balance) > 0;
    if (activeFilter === 'Overdue') return i.status === 'Overdue' && Number(i.balance) > 0;
    if (activeFilter === 'Completed' || activeFilter === 'Complete Payment') return i.status === 'Complete Payment' || i.status === 'Completed' || Number(i.balance) <= 0;
    return true;
  });

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="My Installments & Accounts" size="xl">
      <div className="space-y-4">
        {/* Top Summary Banner / KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3 rounded-2xl bg-card border border-border shadow-xs flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-100 dark:bg-purple-950/60 text-purple-600 dark:text-purple-300 flex items-center justify-center font-bold shrink-0">
              <FiCreditCard className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground truncate">Active Accounts</p>
              <p className="text-base font-black text-foreground">{activeAccounts.length}</p>
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-card border border-border shadow-xs flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-300 flex items-center justify-center font-bold shrink-0">
              <FiCalendar className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground truncate">Monthly Payment</p>
              <p className="text-base font-black text-foreground truncate">{fmt(monthlyAmortization)}</p>
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-card border border-border shadow-xs flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-300 flex items-center justify-center font-bold shrink-0">
              <TbCurrencyPeso className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground truncate">Remaining Balance</p>
              <p className="text-base font-black text-emerald-600 dark:text-emerald-400 truncate">{fmt(totalBalance)}</p>
            </div>
          </div>
        </div>

        {/* Filter Tabs & Quick Action */}
        <div className="flex items-center justify-between flex-wrap gap-2 pt-1 border-t border-border">
          <div className="flex p-1 rounded-xl bg-muted border border-border">
            {['All', 'Active', 'Overdue', 'Completed'].map(tab => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveFilter(tab)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  activeFilter === tab
                    ? 'bg-card text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab}
                {tab === 'Overdue' && installments.some(i => i.status === 'Overdue') && (
                  <span className="ml-1 px-1.5 py-0.2 text-[9px] rounded-full bg-rose-500 text-white font-bold">
                    !
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Content Area */}
        {loading ? (
          <LoadingState message="Loading your installment accounts..." />
        ) : filteredInstallments.length === 0 ? (
          <div className="py-12 text-center rounded-2xl border border-dashed border-border p-6 bg-muted/10 space-y-3">
            <FiCreditCard className="w-12 h-12 text-muted-foreground/30 mx-auto" />
            <h3 className="text-base font-bold text-foreground">No Installments Found</h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              {activeFilter === 'All'
                ? 'You do not have any active installment accounts.'
                : `No accounts found under the "${activeFilter}" filter.`}
            </p>
          </div>
        ) : (
          <div className="space-y-3.5 max-h-[58vh] overflow-y-auto pr-1">
            {filteredInstallments.map(inst => {
              const progressPct = inst.total_amount > 0
                ? Math.min(100, Math.round(((inst.paid_amount || 0) / inst.total_amount) * 100))
                : 0;

              return (
                <div
                  key={inst.installment_id}
                  className="p-4 rounded-2xl border border-border bg-card shadow-xs hover:border-primary/40 transition-all space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      {inst.image_url ? (
                        <img
                          src={inst.image_url.includes('/storage/') ? inst.image_url.substring(inst.image_url.indexOf('/storage/')) : inst.image_url}
                          alt={inst.product}
                          className="w-12 h-12 rounded-xl object-cover border border-border bg-muted shrink-0"
                          onError={(e) => { e.target.style.display = 'none'; }}
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 flex items-center justify-center border border-purple-200 dark:border-purple-800 shrink-0">
                          <FiPackage className="w-6 h-6" />
                        </div>
                      )}
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm text-foreground">{inst.product}</span>
                          <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-md bg-muted text-muted-foreground border border-border">
                            {inst.account_no}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Started: {inst.purchase_date || 'N/A'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <StatusBadge status={Number(inst.balance) <= 0 ? 'Complete Payment' : (inst.status || 'Active')} />
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-muted-foreground">Repayment Progress</span>
                      <span className="font-semibold text-foreground font-mono">
                        {fmt(inst.total_paid ?? inst.paid_amount ?? 0)} / {fmt(inst.total_payable ?? inst.total_amount)} ({progressPct}%)
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-500"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                  </div>

                  {/* Key Financials Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 text-xs p-3.5 rounded-xl bg-muted/30 border border-border/60">
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase font-bold">Total Payable</p>
                      <p className="font-mono font-bold text-foreground mt-0.5">{fmt(inst.total_payable ?? inst.total_amount)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase font-bold">Total Paid</p>
                      <p className="font-mono font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">{fmt(inst.total_paid ?? inst.paid_amount ?? 0)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase font-bold">Remaining Balance</p>
                      <p className={`font-mono font-bold mt-0.5 ${inst.balance > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600'}`}>
                        {fmt(inst.balance)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase font-bold">Next Due Date</p>
                      <p className="font-semibold text-foreground mt-0.5">
                        {inst.next_due_date || (inst.balance <= 0 ? 'Complete Payment' : 'N/A')}
                      </p>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center justify-end gap-2 pt-1 flex-wrap">
                    {onViewLedger && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onViewLedger(inst);
                        }}
                        className="px-3 py-1.5 rounded-xl border border-border hover:bg-muted text-xs font-bold text-foreground transition-all flex items-center gap-1.5 cursor-pointer"
                      >
                        <FiFileText className="w-3.5 h-3.5" />
                        <span>View Ledger & Schedules</span>
                      </button>
                    )}

                    {inst.balance > 0 && onMakePayment && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onMakePayment(inst);
                        }}
                        className="px-3.5 py-1.5 rounded-xl bg-[#7c3aed] hover:bg-[#6d28d9] text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs hover:scale-105"
                      >
                        <FiCreditCard className="w-3.5 h-3.5" />
                        <span>Pay Due ({fmt(inst.monthly_payment)})</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}


