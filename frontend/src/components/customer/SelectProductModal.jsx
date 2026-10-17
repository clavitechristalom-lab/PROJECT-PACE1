import React, { useState, useEffect, useMemo } from 'react';
import {
  FiX, FiSearch, FiCheck, FiPlus, FiMinus, FiShoppingBag,
  FiPackage, FiCheckCircle, FiInfo, FiTag, FiFilter
} from 'react-icons/fi';
import { api } from '../../lib/api';
import { fmt } from '../../lib/utils';

export default function SelectProductModal({
  isOpen,
  onClose,
  onConfirm,
  initialSelectedItems = []
}) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All'); // 'All' | 'Furniture' | 'Appliances'
  const [selectedMap, setSelectedMap] = useState({}); // { [productId]: { product, quantity } }

  // Load active products on open
  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      api.products.getAll({ status: 'Active' })
        .then((res) => {
          setProducts(res.products || []);
        })
        .catch((err) => {
          console.error('Failed to load products for catalog modal', err);
        })
        .finally(() => {
          setLoading(false);
        });

      // Initialize selectedMap from initialSelectedItems
      const map = {};
      (initialSelectedItems || []).forEach(item => {
        if (item.product_id) {
          map[item.product_id] = {
            product: {
              product_id: item.product_id,
              product_name: item.product_name,
              brand: item.brand || '',
              description: item.description || '',
              unit_price: item.price,
              discount_price: item.price,
              image_url: item.image_url,
              category: item.category || 'General',
            },
            quantity: item.quantity || 1
          };
        }
      });
      setSelectedMap(map);
    }
  }, [isOpen, initialSelectedItems]);

  // Filter products by category and search
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      // Category filter: support case-insensitive matching
      const pCat = (p.category || '').toLowerCase();
      if (selectedCategory === 'Furniture' && !pCat.includes('furniture')) {
        return false;
      }
      if (selectedCategory === 'Appliances' && !pCat.includes('appliance')) {
        return false;
      }

      // Search filter: name, brand, description, or product_code
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = (p.product_name || '').toLowerCase().includes(q);
        const matchesBrand = (p.brand || '').toLowerCase().includes(q);
        const matchesDesc = (p.description || '').toLowerCase().includes(q);
        const matchesCode = (p.product_code || '').toLowerCase().includes(q);
        if (!matchesName && !matchesBrand && !matchesDesc && !matchesCode) {
          return false;
        }
      }

      return true;
    });
  }, [products, selectedCategory, searchQuery]);

  // Count items per category
  const categoryCounts = useMemo(() => {
    const furniture = products.filter(p => (p.category || '').toLowerCase().includes('furniture')).length;
    const appliances = products.filter(p => (p.category || '').toLowerCase().includes('appliance')).length;
    return {
      all: products.length,
      furniture,
      appliances
    };
  }, [products]);

  // Toggle or select product
  const handleToggleSelect = (product) => {
    const id = product.product_id;
    setSelectedMap(prev => {
      const next = { ...prev };
      if (next[id]) {
        delete next[id];
      } else {
        next[id] = { product, quantity: 1 };
      }
      return next;
    });
  };

  // Adjust quantity
  const handleQuantityChange = (productId, delta) => {
    setSelectedMap(prev => {
      const item = prev[productId];
      if (!item) return prev;
      const newQty = item.quantity + delta;
      if (newQty <= 0) {
        const next = { ...prev };
        delete next[productId];
        return next;
      }
      return {
        ...prev,
        [productId]: {
          ...item,
          quantity: newQty
        }
      };
    });
  };

  // Compute selected totals
  const selectedItemsList = useMemo(() => {
    return Object.values(selectedMap).map(({ product, quantity }) => {
      const price = Number(product.discount_price || product.unit_price || 0);
      return {
        product_id: product.product_id,
        product_name: product.product_name,
        brand: product.brand || '',
        category: product.category || '',
        description: product.description || '',
        price,
        quantity,
        image_url: product.image_url || '',
      };
    });
  }, [selectedMap]);

  const totalSelectedCount = selectedItemsList.reduce((sum, item) => sum + item.quantity, 0);
  const totalSelectedAmount = selectedItemsList.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  // Confirm and close
  const handleConfirm = () => {
    onConfirm(selectedItemsList);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[65] flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-md animate-[fadeIn_0.2s_ease]"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-card w-full max-w-4xl rounded-3xl shadow-2xl border border-border flex flex-col max-h-[92vh] overflow-hidden animate-[slideUp_0.2s_ease]">

        {/* ─── Modal Header ─── */}
        <div className="p-5 sm:p-6 pb-4 border-b border-border/80 bg-muted/20 flex items-start justify-between shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-xl bg-purple-100 dark:bg-purple-950/60 text-purple-600 dark:text-purple-300 flex items-center justify-center">
                <FiShoppingBag className="w-4 h-4" />
              </span>
              <h2 className="text-xl font-black text-foreground tracking-tight">Select Products</h2>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Browse our verified Furniture and Appliances catalog. Select items to add them directly to your payment checkout.
            </p>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors cursor-pointer"
          >
            <FiX className="w-4 h-4" />
          </button>
        </div>

        {/* ─── Filters & Search Toolbar ─── */}
        <div className="p-4 sm:px-6 border-b border-border/60 bg-background/50 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0">

          {/* Categorized Tabs: All, Furniture, Appliances */}
          <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-muted/70 border border-border shrink-0 overflow-x-auto">
            <button
              type="button"
              onClick={() => setSelectedCategory('All')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                selectedCategory === 'All'
                  ? 'bg-card text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <span>All Products</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-muted text-muted-foreground font-mono">
                {categoryCounts.all}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedCategory('Furniture')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                selectedCategory === 'Furniture'
                  ? 'bg-card text-purple-600 dark:text-purple-400 shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <span>🛋️ Furniture</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 font-mono">
                {categoryCounts.furniture}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedCategory('Appliances')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                selectedCategory === 'Appliances'
                  ? 'bg-card text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <span>🔌 Appliances</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-mono">
                {categoryCounts.appliances}
              </span>
            </button>
          </div>

          {/* Search Box */}
          <div className="relative flex-1 sm:max-w-xs">
            <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, brand, model..."
              className="w-full pl-9 pr-3.5 py-2 text-xs bg-muted/40 hover:bg-muted/60 focus:bg-background border border-border focus:border-purple-600 rounded-xl outline-none transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5"
              >
                <FiX className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* ─── Product Catalog Grid Body ─── */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1">
          {loading ? (
            <div className="py-20 text-center space-y-3">
              <div className="w-10 h-10 border-3 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
              <p className="text-xs text-muted-foreground font-medium">Loading catalog items...</p>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="py-16 text-center space-y-3 border-2 border-dashed border-border rounded-2xl">
              <FiPackage className="w-12 h-12 text-muted-foreground/40 mx-auto" />
              <div>
                <h4 className="text-sm font-bold text-foreground">No Products Found</h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Try adjusting your category filter or search query.
                </p>
              </div>
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="px-3 py-1.5 rounded-lg bg-muted text-xs font-semibold hover:bg-muted/80 cursor-pointer"
                >
                  Clear Search
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredProducts.map((p) => {
                const isSelected = !!selectedMap[p.product_id];
                const selectedQty = selectedMap[p.product_id]?.quantity || 1;
                const effectivePrice = Number(p.discount_price || p.unit_price || 0);
                const hasDiscount = p.discount_price && Number(p.discount_price) < Number(p.unit_price);
                const isFurniture = (p.category || '').toLowerCase().includes('furniture');

                return (
                  <div
                    key={p.product_id}
                    onClick={() => handleToggleSelect(p)}
                    className={`group relative rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between overflow-hidden ${
                      isSelected
                        ? 'border-purple-600 bg-purple-50/40 dark:bg-purple-950/20 shadow-md ring-2 ring-purple-500/20'
                        : 'border-border hover:border-border/80 bg-card hover:shadow-sm'
                    }`}
                  >
                    <div>
                      {/* Product Image Frame */}
                      <div className="relative aspect-video w-full bg-muted/60 overflow-hidden border-b border-border/60">
                        {p.image_url ? (
                          <img
                            src={p.image_url}
                            alt={p.product_name}
                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-muted-foreground/40">
                            <FiPackage className="w-8 h-8" />
                          </div>
                        )}

                        {/* Category Pill */}
                        <div className="absolute top-2.5 left-2.5">
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold shadow-xs ${
                            isFurniture
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300'
                              : 'bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300'
                          }`}>
                            {isFurniture ? '🛋️ Furniture' : '🔌 Appliances'}
                          </span>
                        </div>

                        {/* Selection Checkmark Badge */}
                        <div className="absolute top-2.5 right-2.5">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors shadow-xs ${
                            isSelected ? 'bg-purple-600 text-white' : 'bg-background/80 text-muted-foreground border border-border'
                          }`}>
                            {isSelected ? <FiCheck className="w-3.5 h-3.5" /> : null}
                          </div>
                        </div>
                      </div>

                      {/* Content Section */}
                      <div className="p-3.5 space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="font-bold text-xs text-foreground line-clamp-2 leading-tight">
                            {p.product_name}
                          </h4>
                        </div>

                        {p.brand && (
                          <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                            {p.brand}
                          </p>
                        )}

                        {p.description && (
                          <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                            {p.description}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Footer / Pricing & Quantity Bar */}
                    <div className="p-3.5 pt-2 border-t border-border/50 bg-muted/10 flex items-center justify-between gap-2">
                      <div>
                        {hasDiscount ? (
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-xs font-black text-emerald-600 font-mono">
                              {fmt(effectivePrice)}
                            </span>
                            <span className="text-[10px] text-muted-foreground line-through font-mono">
                              {fmt(p.unit_price)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs font-black text-foreground font-mono">
                            {fmt(effectivePrice)}
                          </span>
                        )}
                        <span className="text-[10px] text-muted-foreground block">Cash Price</span>
                      </div>

                      {/* Interactive Selection / Quantity Stepper */}
                      {isSelected ? (
                        <div
                          className="flex items-center gap-1.5 border border-purple-300 dark:border-purple-800 rounded-xl bg-purple-50 dark:bg-purple-950/60 p-0.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => handleQuantityChange(p.product_id, -1)}
                            className="w-6 h-6 rounded-lg flex items-center justify-center bg-card hover:bg-purple-100 text-purple-700 dark:text-purple-300 transition-colors cursor-pointer"
                          >
                            <FiMinus className="w-2.5 h-2.5" />
                          </button>
                          <span className="w-5 text-center text-xs font-bold font-mono text-purple-900 dark:text-purple-200">
                            {selectedQty}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleQuantityChange(p.product_id, 1)}
                            className="w-6 h-6 rounded-lg flex items-center justify-center bg-card hover:bg-purple-100 text-purple-700 dark:text-purple-300 transition-colors cursor-pointer"
                          >
                            <FiPlus className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleSelect(p);
                          }}
                          className="px-3 py-1.5 rounded-xl bg-muted hover:bg-purple-600 hover:text-white text-muted-foreground text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
                        >
                          <FiPlus className="w-3 h-3" />
                          <span>Select</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ─── Sticky Footer Bar ─── */}
        <div className="p-4 sm:p-5 border-t border-border bg-muted/30 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-purple-100 dark:bg-purple-950/60 text-purple-600 dark:text-purple-300 flex items-center justify-center font-black">
              {totalSelectedCount}
            </div>
            <div>
              <p className="text-xs font-bold text-foreground">
                {totalSelectedCount === 0
                  ? 'No items selected'
                  : `${totalSelectedCount} ${totalSelectedCount === 1 ? 'item' : 'items'} selected`}
              </p>
              <p className="text-xs font-mono font-black text-purple-600 dark:text-purple-400">
                Total Cash Price: {fmt(totalSelectedAmount)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl border border-border hover:bg-muted text-xs font-bold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleConfirm}
              className="flex-1 sm:flex-none px-6 py-2.5 rounded-xl bg-[#7c3aed] hover:bg-[#6d28d9] active:bg-[#5b21b6] text-white font-bold text-xs shadow-md shadow-purple-600/30 transition-all cursor-pointer flex items-center justify-center gap-2 hover:scale-[1.02]"
            >
              <FiCheckCircle className="w-4 h-4" />
              <span>Confirm & Apply Selection ({totalSelectedCount})</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
