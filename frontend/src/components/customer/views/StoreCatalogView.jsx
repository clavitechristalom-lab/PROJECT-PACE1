import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  FiSearch, FiFilter, FiPackage, FiShoppingBag, FiCheck, FiX, 
  FiChevronLeft, FiChevronRight, FiMaximize2, FiMinimize2, FiLayers 
} from 'react-icons/fi';
import { TbCurrencyPeso } from 'react-icons/tb';
import { api } from '../../../lib/api';
import { fmt } from '../../../lib/utils';
import { Spinner, Badge } from '../../ui';
import { useRealtimeSync, fastDeepEqual } from '../../../lib/realtimeSync';

export default function StoreCatalogView({ onBuyProduct, availableCategories = [] }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const inFlightRef = useRef(false);

  const loadProducts = useCallback(async (silent = false, signal) => {
    if (inFlightRef.current && silent) return;
    inFlightRef.current = true;
    if (!silent) setLoading(true);

    try {
      const params = { status: 'Active' };
      if (activeCategory !== 'All') params.category = activeCategory;
      if (searchQuery.trim()) params.search = searchQuery.trim();

      const data = await api.products.getAll(params, { signal });
      if (signal?.aborted) return;
      const nextProducts = data.products || data || [];
      setProducts(prev => fastDeepEqual(prev, nextProducts) ? prev : nextProducts);
    } catch (err) {
      if (err?.name !== 'AbortError') console.error('Failed to load catalog products', err);
    } finally {
      inFlightRef.current = false;
      if (!silent) setLoading(false);
    }
  }, [activeCategory, searchQuery]);

  useEffect(() => {
    loadProducts(false);
  }, [loadProducts]);

  useRealtimeSync((_source, signal) => {
    loadProducts(true, signal);
  }, [loadProducts], { module: 'products' });

  // Extract all categories dynamically if not provided
  const categories = ['All', ...new Set([
    ...availableCategories,
    ...products.map(p => p.category).filter(Boolean)
  ])];

  return (
    <div className="space-y-6 animate-[fadeIn_0.3s_ease]">
      {/* Top Banner / Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-teal-800 dark:text-teal-300 bg-[#D1E8E2]/60 dark:bg-teal-950/60 px-3 py-1 rounded-full border border-teal-600/20">
              Product List
            </span>
            <span className="text-xs text-muted-foreground font-semibold">
              {products.length} Products Available
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">
            Product List & Merchandise
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Explore premium furniture, home appliances, and installment-ready pieces available at Z-Lics Iligan.
          </p>
        </div>
      </div>

      {/* Category Filter Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
              activeCategory === cat
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/25 scale-102'
                : 'bg-card border border-border text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Product Grid */}
      {loading ? (
        <div className="flex items-center justify-center min-h-[350px]">
          <div className="text-center">
            <Spinner className="w-10 h-10 text-blue-600 dark:text-blue-400 mx-auto mb-3" />
            <p className="text-xs text-muted-foreground font-semibold animate-pulse">Loading store showroom...</p>
          </div>
        </div>
      ) : products.length === 0 ? (
        <div className="rounded-[2.5rem] p-12 text-center bg-card border border-dashed border-border space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center text-muted-foreground mx-auto">
            <FiPackage className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-foreground">No Products Found</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            No active merchandise matching "{searchQuery || activeCategory}" in the Iligan branch catalog.
          </p>
          {(searchQuery || activeCategory !== 'All') && (
            <button
              onClick={() => { setSearchQuery(''); setActiveCategory('All'); }}
              className="px-4 py-2 text-xs font-bold rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors cursor-pointer"
            >
              Clear Filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
          {products.map((p) => {
            const price = Number(p.discount_price || p.unit_price || p.price || 0);
            const originalPrice = p.discount_price ? Number(p.unit_price || p.price || 0) : null;
            const inStock = Number(p.stock_quantity ?? 1) > 0;
            const approxMonthly = Math.round((price * 0.8) / 6);

            return (
              <div
                key={p.product_id}
                onClick={() => setSelectedProduct(p)}
                className="group bg-card rounded-3xl border border-border overflow-hidden flex flex-col justify-between shadow-xs hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-pointer"
              >
                {/* Product Image Area */}
                <div className="relative aspect-4/3 w-full bg-slate-100 dark:bg-slate-900 overflow-hidden flex items-center justify-center p-3">
                  {p.image_url ? (
                    <img
                      src={p.image_url.includes('/storage/') ? p.image_url.substring(p.image_url.indexOf('/storage/')) : p.image_url}
                      alt={p.product_name}
                      className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-105"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                  ) : (
                    <FiPackage className="w-12 h-12 text-muted-foreground/30" />
                  )}

                  {/* Stock & Sale Badges */}
                  <div className="absolute top-3 left-3 flex items-center gap-1.5 flex-wrap">
                    {originalPrice && (
                      <span className="px-2 py-0.5 rounded-lg bg-rose-600 text-white text-[10px] font-black uppercase tracking-wider shadow-xs">
                        Sale
                      </span>
                    )}
                    <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold shadow-xs ${
                      inStock 
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300' 
                        : 'bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300'
                    }`}>
                      {inStock ? 'In Stock' : 'Out of Stock'}
                    </span>
                  </div>

                  {p.category && (
                    <span className="absolute bottom-3 left-3 px-2.5 py-0.5 rounded-full bg-black/60 backdrop-blur-xs text-[10px] font-bold text-white shadow-xs">
                      {p.category}
                    </span>
                  )}
                </div>

                {/* Info Content */}
                <div className="p-4 sm:p-5 flex flex-col justify-between flex-1 space-y-3">
                  <div>
                    {p.brand && (
                      <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                        {p.brand}
                      </span>
                    )}
                    <h3 className="font-extrabold text-sm sm:text-base text-foreground leading-snug line-clamp-2 mt-0.5 group-hover:text-blue-600 transition-colors">
                      {p.product_name}
                    </h3>
                    {p.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                        {p.description}
                      </p>
                    )}
                  </div>

                  <div className="pt-2 border-t border-border/60 flex items-end justify-between gap-2">
                    <div>
                      {originalPrice && (
                        <span className="text-[11px] text-muted-foreground line-through font-mono block">
                          {fmt(originalPrice)}
                        </span>
                      )}
                      <div className="text-base sm:text-lg font-black font-mono text-foreground leading-tight">
                        {fmt(price)}
                      </div>
                      <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 block mt-0.5">
                        Est. ~{fmt(approxMonthly)}/mo
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onBuyProduct) onBuyProduct(p);
                      }}
                      className="px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-blue-600/25 transition-all cursor-pointer shrink-0"
                    >
                      <FiShoppingBag className="w-3.5 h-3.5" />
                      <span>Pay</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Product Detail Modal / Viewer */}
      {selectedProduct && (
        <ProductDetailViewer
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
          onBuyProduct={(prod) => {
            setSelectedProduct(null);
            if (onBuyProduct) onBuyProduct(prod);
          }}
        />
      )}
    </div>
  );
}

function ProductDetailViewer({ product, onClose, onBuyProduct }) {
  const images = [product.image_url, product.image_url_2, product.image_url_3, product.image_url_4]
    .filter(Boolean)
    .map(url => (url.includes('/storage/') ? url.substring(url.indexOf('/storage/')) : url));

  const [activeImgIdx, setActiveImgIdx] = useState(0);
  const [isFullScreen, setIsFullScreen] = useState(false);

  const price = Number(product.discount_price || product.unit_price || product.price || 0);
  const origPrice = product.discount_price ? Number(product.unit_price || product.price || 0) : null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-[fadeIn_0.2s_ease]">
      <div className="bg-background rounded-3xl shadow-2xl border border-border w-full max-w-3xl max-h-[92vh] overflow-hidden flex flex-col animate-[scaleIn_0.2s_ease]">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between shrink-0 bg-slate-50 dark:bg-slate-900/60">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300">
              {product.category || 'General'}
            </span>
            <span className="text-xs font-mono font-bold text-muted-foreground">
              {product.product_code || ''}
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors cursor-pointer"
          >
            <FiX size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* Main Photo Gallery */}
          <div className="w-full aspect-16/9 bg-slate-950 rounded-2xl overflow-hidden relative flex items-center justify-center group">
            {images.length > 0 ? (
              <img
                src={images[activeImgIdx]}
                alt={product.product_name}
                className="w-full h-full object-contain p-2 transition-transform duration-300 group-hover:scale-102"
              />
            ) : (
              <FiPackage className="w-16 h-16 text-slate-700" />
            )}

            {/* Gallery Thumbnail Navigation */}
            {images.length > 1 && (
              <div className="absolute bottom-3 left-3 right-3 flex items-center justify-center gap-2">
                {images.map((img, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setActiveImgIdx(idx)}
                    className={`w-11 h-11 rounded-xl overflow-hidden border-2 transition-all p-0.5 bg-black/40 ${
                      activeImgIdx === idx ? 'border-blue-500 scale-105' : 'border-white/30 opacity-70 hover:opacity-100'
                    }`}
                  >
                    <img src={img} alt="Thumb" className="w-full h-full object-cover rounded-lg" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Details & Specs */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                {product.brand && (
                  <span className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                    {product.brand}
                  </span>
                )}
                <h2 className="text-xl sm:text-2xl font-black text-foreground">
                  {product.product_name}
                </h2>
              </div>
              <div className="text-left sm:text-right">
                {origPrice && (
                  <span className="text-xs text-muted-foreground line-through font-mono block">
                    {fmt(origPrice)}
                  </span>
                )}
                <span className="text-2xl font-black font-mono text-emerald-600 dark:text-emerald-400">
                  {fmt(price)}
                </span>
              </div>
            </div>

            {product.description && (
              <div className="p-4 rounded-2xl bg-muted/40 border border-border text-xs leading-relaxed text-muted-foreground space-y-1">
                <span className="font-bold text-foreground block">Description:</span>
                <p>{product.description}</p>
              </div>
            )}

            {/* Specifications Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 p-4 rounded-2xl bg-muted/20 border border-border text-xs">
              <div>
                <span className="text-[10px] font-bold uppercase text-muted-foreground">Category</span>
                <p className="font-semibold text-foreground mt-0.5">{product.category || 'N/A'}</p>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase text-muted-foreground">Brand</span>
                <p className="font-semibold text-foreground mt-0.5">{product.brand || 'N/A'}</p>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase text-muted-foreground">Availability</span>
                <p className="font-semibold text-foreground mt-0.5">
                  {Number(product.stock_quantity ?? 1) > 0 ? `${product.stock_quantity} in stock` : 'Out of Stock'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border bg-slate-50 dark:bg-slate-900/60 flex items-center justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-border hover:bg-muted text-xs font-bold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            Close
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              if (onBuyProduct) onBuyProduct(product);
            }}
            className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold text-xs shadow-md shadow-blue-600/30 flex items-center gap-2 transition-all cursor-pointer"
          >
            <FiShoppingBag size={15} />
            <span>Pay ({fmt(price)})</span>
          </button>
        </div>

      </div>
    </div>
  );
}

