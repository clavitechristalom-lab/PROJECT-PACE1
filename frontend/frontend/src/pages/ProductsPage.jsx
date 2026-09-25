import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  FiPackage, FiPlus, FiEdit, FiTrash2, FiEye,
  FiSearch, FiFilter, FiTag, FiLayers,
  FiAlertTriangle, FiCheckCircle, FiX, FiInfo
} from 'react-icons/fi'
import {
  Btn, Badge, StatusBadge, Input, Select, Textarea, Modal, ConfirmDialog,
  Table, TR, TD, SearchBar, PageHeader, StatCard, Card, Pagination, showToast,
  LoadingState, ErrorAlert, StatSkeleton, TableSkeleton, EmptyState, confirmAction
} from '../components/ui'
import { fmt, filterBySearch } from '../lib/utils'
import api, { downloadCsv } from '../lib/api'
import { useRealtimeSync, triggerDataSync } from '../lib/realtimeSync'
import { FiDownload } from 'react-icons/fi'
import { TbCurrencyPeso } from 'react-icons/tb'
import MySalesChart from '../components/MySalesChart'

import { useAuth } from '../context/AuthContext'

const STOCK_STATUSES = ['All', 'High Stock', 'Medium Stock', 'Low Stock', 'Out of Stock']

export default function ProductsPage({ branchFilter, embedded }) {
  const { user } = useAuth()
  const isAdmin = user?.role === 'Administrator'
  const canManage = isAdmin || user?.role === 'Store Administrator' || user?.role === 'Store Admin'
  const [searchParams] = useSearchParams()
  const [products, setProducts] = useState([])

  const dynamicCategories = useMemo(() => {
    const cats = new Set(products.map(p => p.category).filter(Boolean));
    cats.add('Appliances');
    cats.add('Furniture');
    return ['All', ...Array.from(cats).sort()];
  }, [products]);

  const [branches, setBranches] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')
  const [stockStatus, setStockStatus] = useState('All')
  const [page, setPage] = useState(1)
  const pageSize = 10

  // Modals
  const [addModal, setAddModal] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [deleteItem, setDeleteItem] = useState(null)
  const [viewItem, setViewItem] = useState(null)
  const [discountModal, setDiscountModal] = useState(null) // holds the product to discount
  const [discountForm, setDiscountForm] = useState({ discount_price: '' })
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)

  const handleExport = async () => {
    setExporting(true)
    try {
      await downloadCsv('/products', {
        search: search || undefined,
        category: category !== 'All' ? category : undefined,
        stock_status: stockStatus !== 'All' ? stockStatus : undefined,
        branch: branchFilter || undefined,
      })
      showToast('Products exported successfully', 'success')
    } catch (err) {
      showToast(err.message || 'Export failed', 'error')
    } finally {
      setExporting(false)
    }
  }

  // Form
  const emptyForm = {
    branch_id: '', product_code: '', product_name: '', category: 'Appliances',
    brand: '', unit_price: '', discount_price: '', cost_price: '',
    stock_quantity: '', reorder_level: '5', unit: 'unit',
    status: 'Active', description: ''
  }
  const [form, setForm] = useState(emptyForm)
  
  // Image Upload State
  const [imageFiles, setImageFiles] = useState([null, null, null, null])
  const [existingImages, setExistingImages] = useState([null, null, null, null])
  const [removeImages, setRemoveImages] = useState([false, false, false, false])

  const loadProducts = async (source) => {
    const isBackground = source === 'timer' || source === 'database' || source === 'event' || source === 'focus' || source === 'mutation'
    if (!isBackground) {
      setLoading(true)
    }
    setError('')
    try {
      const [data, branchesData] = await Promise.all([
        api.products.getAll({
          search: search || undefined,
          category: category !== 'All' ? category : undefined,
          stock_status: stockStatus !== 'All' ? stockStatus : undefined,
          branch: branchFilter || undefined,
        }),
        isAdmin ? api.branches.getAll() : Promise.resolve({ branches: [] })
      ])
      setProducts(data.products || [])
      if (isAdmin) setBranches(branchesData.branches || [])
    } catch (err) {
      if (!isBackground) {
        console.error('Failed to load products:', err)
        setError(err.message || 'Failed to fetch products')
      }
    } finally {
      if (!isBackground) {
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    loadProducts('filter_change')
  }, [category, stockStatus])

  // Real-time synchronization
  useRealtimeSync(loadProducts, [category, stockStatus, search])

  useEffect(() => {
    const id = searchParams.get('id')
    if (id) {
      api.products.getById(id)
        .then(data => {
          if (data) setViewItem(data.product || data)
        })
        .catch(err => console.warn('Could not auto-open product:', err))
    }
  }, [searchParams])

  const handleSave = async (e) => {
    e.preventDefault()
    if (!form.product_name || !form.unit_price) {
      showToast('Please fill in required fields (Name, Price)', 'error')
      return
    }

    setSaving(true)
    try {
      // Build FormData
      const payload = new FormData();
      Object.entries(form).forEach(([key, value]) => {
        if (value !== null && value !== undefined && value !== '') {
           payload.append(key, value);
        }
      });
      payload.set('unit_price', parseFloat(form.unit_price) || 0);
      if (form.discount_price) {
        payload.set('discount_price', parseFloat(form.discount_price) || 0);
      } else {
        payload.set('discount_price', '');
      }
      if (isAdmin) {
        payload.set('cost_price', parseFloat(form.cost_price) || 0);
      }
      payload.set('stock_quantity', parseInt(form.stock_quantity) || 0);
      payload.set('reorder_level', parseInt(form.reorder_level) || 0);

      // Append images
      imageFiles.forEach((file, index) => {
        if (file) payload.append(`image_${index + 1}`, file);
      });
      removeImages.forEach((remove, index) => {
        if (remove) payload.append(`remove_image_${index + 1}`, 'true');
      });

      if (editItem) {
        const res = await api.products.update(editItem.product_id, payload)
        if (res.product) {
          setProducts(prev => prev.map(p => p.product_id === editItem.product_id ? res.product : p))
        } else {
          loadProducts()
        }
        showToast('Product updated successfully', 'success')
      } else {
        const res = await api.products.create(payload)
        if (res.product) {
          setProducts(prev => [res.product, ...prev])
        } else {
          loadProducts()
        }
        showToast('Product created successfully', 'success')
      }
      triggerDataSync('products')
      setAddModal(false)
      setEditItem(null)
      setForm(emptyForm)
      setImageFiles([null, null, null, null])
      setExistingImages([null, null, null, null])
      setRemoveImages([false, false, false, false])
    } catch (err) {
      showToast(err.message || 'Failed to save product', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteItem) return
    const confirmed = await confirmAction('Delete Product?', `Are you sure you want to delete ${deleteItem.product_name}? This cannot be undone.`, 'Yes, Delete')
    if (!confirmed) return

    setSaving(true)
    try {
      await api.products.delete(deleteItem.product_id)
      setProducts(prev => prev.filter(p => p.product_id !== deleteItem.product_id))
      triggerDataSync('products')
      showToast('Product deleted successfully', 'success')
      setDeleteItem(null)
    } catch (err) {
      showToast(err.message || 'Failed to delete product', 'error')
    } finally {
      setSaving(false)
    }
  }

  const openEdit = (p) => {
    setEditItem(p)
    setForm({
      product_code: p.product_code || '',
      product_name: p.product_name || '',
      category: p.category || 'Appliances',
      brand: p.brand || '',
      unit_price: p.unit_price?.toString() || '',
      discount_price: p.discount_price?.toString() || '',
      cost_price: p.cost_price?.toString() || '',
      stock_quantity: p.stock_quantity?.toString() || '0',
      reorder_level: p.reorder_level?.toString() || '5',
      unit: p.unit || 'unit',
      status: p.status || 'Active',
      description: p.description || '',
      branch_id: p.branch_id?.toString() || '',
    })
    
    // Set images for preview
    setExistingImages([
      p.image_url || null,
      p.image_url_2 || null,
      p.image_url_3 || null,
      p.image_url_4 || null
    ])
    setImageFiles([null, null, null, null])
    setRemoveImages([false, false, false, false])
    
    setAddModal(true)
  }

  const openDiscountModal = (p) => {
    setDiscountModal(p)
    setDiscountForm({ discount_price: p.discount_price?.toString() || '' })
  }

  const handleSaveDiscount = async (e) => {
    e.preventDefault()
    if (!discountModal) return

    setSaving(true)
    try {
      const payload = new FormData();
      // We must send required fields for update due to backend validation
      payload.append('product_name', discountModal.product_name);
      payload.append('product_code', discountModal.product_code);
      payload.append('category', discountModal.category);
      payload.append('status', discountModal.status);
      payload.append('unit_price', discountModal.unit_price);
      payload.append('stock_quantity', discountModal.stock_quantity);
      
      if (discountForm.discount_price) {
        payload.append('discount_price', parseFloat(discountForm.discount_price));
      } else {
        payload.append('discount_price', '');
      }

      const res = await api.products.update(discountModal.product_id, payload)
      if (res.product) {
        setProducts(prev => prev.map(p => p.product_id === discountModal.product_id ? res.product : p))
      } else {
        loadProducts()
      }
      showToast('Discount updated successfully', 'success')
      triggerDataSync('products')
      setDiscountModal(null)
    } catch (err) {
      showToast(err.message || 'Failed to update discount', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleImageChange = (index, e) => {
    const file = e.target.files[0];
    if (file) {
      const newFiles = [...imageFiles];
      newFiles[index] = file;
      setImageFiles(newFiles);
      
      const newRemoves = [...removeImages];
      newRemoves[index] = false;
      setRemoveImages(newRemoves);
    }
  };

  const handleRemoveImage = (index) => {
    const newFiles = [...imageFiles];
    newFiles[index] = null;
    setImageFiles(newFiles);

    const newRemoves = [...removeImages];
    newRemoves[index] = true;
    setRemoveImages(newRemoves);
  };

  // Filter & paginate
  const filtered = useMemo(() => {
    return filterBySearch(products, search, ['product_code', 'product_name', 'brand', 'category'])
  }, [products, search])

  const total = filtered.length
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize)

  // Quick stats computed from current product collection
  const totalProducts = products.length
  const lowStockCount = products.filter(p => p.stock_quantity === 1).length
  const mediumStockCount = products.filter(p => p.stock_quantity >= 2 && p.stock_quantity <= 4).length
  const highStockCount = products.filter(p => p.stock_quantity >= 5).length
  const outOfStockCount = products.filter(p => p.stock_quantity === 0).length
  const totalValue = products.reduce((acc, p) => acc + ((p.unit_price || 0) * (p.stock_quantity || 0)), 0)

  return (
    <div className={embedded ? "" : "space-y-6"}>
      {!embedded && (
        <PageHeader
          title="Products & Inventory"
          subtitle="Manage product catalog, pricing, and stock levels"
          action={
            <div className="flex gap-2">
              <button
                onClick={handleExport}
                disabled={exporting}
                className="flex items-center gap-2 px-4 py-2 bg-muted hover:bg-muted/80 text-foreground font-semibold text-xs rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50"
              >
                {exporting ? <FiAlertTriangle className="w-4 h-4 animate-spin" /> : <FiDownload className="w-4 h-4" />}
                <span>{exporting ? 'Exporting...' : 'Export CSV'}</span>
              </button>
              {canManage && (
                <button
                  onClick={() => { setEditItem(null); setForm(emptyForm); setAddModal(true) }}
                  className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
                >
                  <FiPlus className="w-4 h-4" />
                  <span>Add Product</span>
                </button>
              )}
            </div>
          }
        />
      )}

      <MySalesChart />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard title="Total Products" value={totalProducts.toString()} sub="catalog items" icon={<FiPackage className="w-5 h-5" />} color="blue" />
        <StatCard title="Inventory Retail Value" value={fmt(totalValue)} sub="total stock value" icon={<TbCurrencyPeso className="w-5 h-5 text-emerald-500" />} color="green" />
        <StatCard title="Low Stock Items" value={lowStockCount.toString()} sub="needs reorder" icon={<FiAlertTriangle className="w-5 h-5 text-amber-500" />} color="yellow" />
        <StatCard title="Out of Stock Items" value={outOfStockCount.toString()} sub="unavailable stock" icon={<FiX className="w-5 h-5 text-rose-500" />} color="red" />
      </div>

      {error && <ErrorAlert message={error} onRetry={loadProducts} />}

      {/* Filters */}
      <Card noPad className="p-3.5 border border-border">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search product code, name, brand, category..."
              className="w-full pl-9 pr-8 py-2 rounded-xl border border-border bg-card text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-muted-foreground/70"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <FiX className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex gap-2 flex-wrap sm:flex-nowrap">
            <select
              value={category}
              onChange={e => { setCategory(e.target.value); setPage(1) }}
              className="border border-border rounded-xl px-3 py-2 text-xs font-semibold text-foreground bg-card cursor-pointer"
            >
              {dynamicCategories.map(c => <option key={c} value={c}>{c === 'All' ? 'All Categories' : c}</option>)}
            </select>
            <select
              value={stockStatus}
              onChange={e => { setStockStatus(e.target.value); setPage(1) }}
              className="border border-border rounded-xl px-3 py-2 text-xs font-semibold text-foreground bg-card cursor-pointer"
            >
              {STOCK_STATUSES.map(s => <option key={s} value={s}>{s === 'All' ? 'All Stock' : s}</option>)}
            </select>
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card noPad className="border border-border overflow-hidden">
        {loading ? (
          <TableSkeleton rows={6} cols={7} />
        ) : paginated.length === 0 ? (
          <EmptyState
            icon={<FiPackage className="w-12 h-12 text-muted-foreground/30 mx-auto" />}
            title="No products found"
            description={search || category !== 'All' || stockStatus !== 'All' ? 'Try adjusting your search or filters' : 'Add your first product to get started'}
            action={
              !isAdmin ? (
                <button
                  onClick={() => { setEditItem(null); setForm(emptyForm); setAddModal(true) }}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 bg-primary text-primary-foreground font-bold text-xs rounded-xl cursor-pointer"
                >
                  <FiPlus className="w-4 h-4" />
                  <span>Add Product</span>
                </button>
              ) : null
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/50 text-muted-foreground uppercase font-semibold text-[11px]">
                    <th className="py-3 px-4 text-left">SKU Code</th>
                    <th className="py-3 px-4 text-left">Product Name</th>
                    {isAdmin && <th className="py-3 px-4 text-left">Branch</th>}
                    <th className="py-3 px-4 text-left">Category</th>
                    <th className="py-3 px-4 text-right">Selling Price</th>
                    <th className="py-3 px-4 text-right">Cost Price</th>
                    <th className="py-3 px-4 text-center">Stock Level</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {paginated.map((p, i) => {
                    const isOut = p.stock_quantity === 0
                    const isLow = p.stock_quantity === 1
                    const isMedium = p.stock_quantity >= 2 && p.stock_quantity <= 4
                    const isHigh = p.stock_quantity >= 5
                    return (
                      <tr key={p.product_id} className={`hover:bg-muted/40 transition-colors ${i % 2 === 1 ? 'bg-muted/10' : ''}`}>
                        <td className="py-3 px-4 font-mono font-bold text-foreground">
                          <div className="flex items-center gap-1.5">
                            <FiTag className="w-3.5 h-3.5 text-primary shrink-0" />
                            <span>{p.product_code}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 border border-primary/20 shadow-2xs">
                              <FiPackage className="w-4 h-4" />
                            </div>
                            <div>
                              <div className="font-semibold text-foreground leading-tight">{p.product_name}</div>
                              {p.brand && <div className="text-[11px] text-muted-foreground mt-0.5">{p.brand}</div>}
                            </div>
                          </div>
                        </td>
                        {isAdmin && (
                          <td className="py-3 px-4">
                            <span className="text-[11px] font-semibold text-foreground bg-muted/50 px-2 py-1 rounded-md">
                              {p.branch?.branch_name || 'Unassigned'}
                            </span>
                          </td>
                        )}
                        <td className="py-3 px-4">
                          <Badge text={p.category} variant="neutral" />
                        </td>
                        <td className="py-3 px-4 text-right">
                          {p.discount_price ? (
                            <div className="flex flex-col items-end">
                              <span className="font-mono font-bold text-emerald-600">{fmt(p.discount_price)}</span>
                              <span className="font-mono text-[10px] text-muted-foreground line-through">{fmt(p.unit_price)}</span>
                            </div>
                          ) : (
                            <span className="font-mono font-bold text-foreground">{fmt(p.unit_price)}</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-muted-foreground">
                          {fmt(p.cost_price || 0)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5 font-mono font-bold">
                            <span className={isOut ? 'text-rose-600' : isLow ? 'text-rose-400' : isMedium ? 'text-amber-500' : 'text-emerald-500'}>
                              {p.stock_quantity} {p.unit}
                            </span>
                            {isOut && <span className="text-[9px] bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 font-bold px-1.5 py-0.2 rounded-full border border-rose-300">OUT</span>}
                            {isLow && <span className="text-[9px] bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 font-bold px-1.5 py-0.2 rounded-full border border-rose-200">LOW</span>}
                            {isMedium && <span className="text-[9px] bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 font-bold px-1.5 py-0.2 rounded-full border border-amber-300">MED</span>}
                            {isHigh && <span className="text-[9px] bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-bold px-1.5 py-0.2 rounded-full border border-emerald-300">HIGH</span>}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <StatusBadge status={p.status} />
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => setViewItem(p)}
                              title="View details"
                              className="p-1.5 rounded-lg border border-border hover:bg-muted text-foreground transition-colors cursor-pointer"
                            >
                              <FiEye className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => openEdit(p)}
                              title="Edit product"
                              className="p-1.5 rounded-lg border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                            >
                              <FiEdit className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => openDiscountModal(p)}
                              title="Set Discount Sale"
                              className="p-1.5 rounded-lg border border-border hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-950/40 text-muted-foreground transition-colors cursor-pointer"
                            >
                              <FiTag className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setDeleteItem(p)}
                              title="Delete product"
                              className="p-1.5 rounded-lg border border-border hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 text-muted-foreground transition-colors cursor-pointer"
                            >
                              <FiTrash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <Pagination total={total} page={page} pageSize={pageSize} onChange={setPage} />
          </>
        )}
      </Card>

      {/* Add/Edit Modal */}
      {addModal && (
        <Modal
          isOpen={true}
          title={editItem ? `Edit Product — ${editItem.product_code}` : 'Add New Product'}
          onClose={() => { setAddModal(false); setEditItem(null) }}
          size="md"
        >
          <form onSubmit={handleSave} className="space-y-3.5 text-xs">
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block font-bold text-muted-foreground mb-1">SKU / Product Code</label>
                <input
                  type="text"
                  value={form.product_code}
                  onChange={e => setForm(f => ({ ...f, product_code: e.target.value }))}
                  placeholder="Auto-generated if empty"
                  className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-mono"
                />
              </div>
              <div>
                <label className="block font-bold text-muted-foreground mb-1">Category *</label>
                <select
                  value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-semibold"
                  required
                >
                  <option value="" disabled>Select Category</option>
                  <option value="Appliances">Appliances</option>
                  <option value="Furniture">Furniture</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className={isAdmin ? "col-span-1" : "col-span-2"}>
                <label className="block font-bold text-muted-foreground mb-1">Product Name *</label>
                <input
                  type="text"
                  value={form.product_name}
                  onChange={e => setForm(f => ({ ...f, product_name: e.target.value }))}
                  placeholder="e.g. Samsung Inverter Refrigerator"
                  required
                  className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-semibold"
                />
              </div>
              
              {isAdmin ? (
                <div>
                  <label className="block font-bold text-muted-foreground mb-1">Assigned Branch *</label>
                  <select
                    value={form.branch_id}
                    onChange={e => setForm(f => ({ ...f, branch_id: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-semibold"
                    required
                  >
                    <option value="">Select Branch</option>
                    {branches.map(b => (
                      <option key={b.id} value={b.id}>{b.branch_name}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="col-span-2 text-[10px] text-muted-foreground flex items-center gap-1.5 mt-1 bg-muted/30 p-2 rounded-lg border border-border">
                  <FiInfo className="w-3 h-3" />
                  <span>This product will automatically be assigned to your active branch.</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block font-bold text-muted-foreground mb-1">Brand / Manufacturer</label>
                <input
                  type="text"
                  value={form.brand}
                  onChange={e => setForm(f => ({ ...f, brand: e.target.value }))}
                  placeholder="e.g. Samsung, Panasonic, Midea"
                  className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground"
                />
              </div>
              <div>
                <label className="block font-bold text-muted-foreground mb-1">Unit of Measure</label>
                <input
                  type="text"
                  value={form.unit}
                  onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                  placeholder="unit, set, pcs"
                  className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className={!isAdmin ? "col-span-2" : ""}>
                <label className="block font-bold text-muted-foreground mb-1">Selling Price (PHP) *</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.unit_price}
                  onChange={e => setForm(f => ({ ...f, unit_price: e.target.value }))}
                  placeholder="0.00"
                  required
                  className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-mono font-bold"
                />
              </div>
              {isAdmin && (
                <div>
                  <label className="block font-bold text-muted-foreground mb-1">Cost Price (PHP)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.cost_price}
                    onChange={e => setForm(f => ({ ...f, cost_price: e.target.value }))}
                    placeholder="0.00"
                    className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-mono"
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <label className="block font-bold text-muted-foreground mb-1">Stock Quantity *</label>
                <input
                  type="number"
                  value={form.stock_quantity}
                  onChange={e => setForm(f => ({ ...f, stock_quantity: e.target.value }))}
                  placeholder="0"
                  required
                  className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-mono font-bold"
                />
              </div>
              <div>
                <label className="block font-bold text-muted-foreground mb-1">Reorder Level</label>
                <input
                  type="number"
                  value={form.reorder_level}
                  onChange={e => setForm(f => ({ ...f, reorder_level: e.target.value }))}
                  placeholder="5"
                  className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-mono"
                />
              </div>
              <div>
                <label className="block font-bold text-muted-foreground mb-1">Status</label>
                <select
                  value={form.status}
                  onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-semibold"
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block font-bold text-muted-foreground mb-1">Description & Specifications</label>
              <textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Dimensions, power rating, warranty period..."
                rows={2}
                className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground"
              />
            </div>

            {/* Image Upload UI */}
            <div>
              <label className="block font-bold text-muted-foreground mb-2">Product Images (Up to 4)</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[0, 1, 2, 3].map(index => {
                  const file = imageFiles[index];
                  const existing = existingImages[index];
                  const isRemoved = removeImages[index];
                  const previewSrc = file ? URL.createObjectURL(file) : (!isRemoved && existing ? existing : null);

                  return (
                    <div key={index} className="relative group border-2 border-dashed border-border rounded-xl h-24 flex items-center justify-center overflow-hidden bg-muted/20">
                      {previewSrc ? (
                        <>
                          <img src={previewSrc} alt={`Preview ${index + 1}`} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                            <label className="p-1.5 bg-white text-black rounded-full cursor-pointer hover:bg-slate-200" title="Replace Image">
                              <FiEdit className="w-3.5 h-3.5" />
                              <input type="file" className="hidden" accept="image/*" onChange={(e) => handleImageChange(index, e)} />
                            </label>
                            <button type="button" onClick={() => handleRemoveImage(index)} className="p-1.5 bg-rose-500 text-white rounded-full hover:bg-rose-600" title="Remove Image">
                              <FiTrash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </>
                      ) : (
                        <label className="flex flex-col items-center justify-center w-full h-full cursor-pointer text-muted-foreground hover:text-primary transition-colors">
                          <FiPlus className="w-6 h-6 mb-1" />
                          <span className="text-[10px] font-medium">Add Image</span>
                          <input type="file" className="hidden" accept="image/*" onChange={(e) => handleImageChange(index, e)} />
                        </label>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => { 
                  setAddModal(false); 
                  setEditItem(null); 
                  setForm(emptyForm);
                  setImageFiles([null, null, null, null]);
                  setExistingImages([null, null, null, null]);
                  setRemoveImages([false, false, false, false]);
                }}
                className="flex items-center gap-1 px-4 py-2 rounded-xl border border-border hover:bg-muted font-semibold cursor-pointer"
              >
                <FiX className="w-3.5 h-3.5" />
                <span>Cancel</span>
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold cursor-pointer"
              >
                <FiCheckCircle className="w-3.5 h-3.5" />
                <span>{saving ? 'Saving...' : editItem ? 'Update Product' : 'Save Product'}</span>
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Discount Modal */}
      {discountModal && (
        <Modal
          isOpen={true}
          title={`Set Discount for ${discountModal.product_name}`}
          onClose={() => setDiscountModal(null)}
          size="sm"
        >
          <form onSubmit={handleSaveDiscount} className="space-y-4">
            <div className="p-4 bg-emerald-50 dark:bg-emerald-950/20 rounded-xl border border-emerald-200 dark:border-emerald-900/30">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-emerald-100 dark:bg-emerald-900/40 rounded-lg text-emerald-600">
                  <FiTag className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-foreground">Discount Sale Price</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Current Regular Price: <span className="font-mono font-bold line-through">{fmt(discountModal.unit_price)}</span>
                  </p>
                </div>
              </div>
            </div>

            <div>
              <label className="block font-bold text-muted-foreground mb-1">Promotional Price (PHP)</label>
              <input
                type="number"
                step="0.01"
                value={discountForm.discount_price}
                onChange={e => setDiscountForm({ discount_price: e.target.value })}
                placeholder="Leave blank to remove sale"
                className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-mono font-bold"
              />
              <p className="text-[10px] text-muted-foreground mt-1.5 ml-1">
                If you set a price here, this product will automatically be marked as "On Sale". To end the sale, clear this field.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border mt-4">
              <button
                type="button"
                onClick={() => setDiscountModal(null)}
                className="flex items-center gap-1 px-4 py-2 rounded-xl border border-border hover:bg-muted font-semibold cursor-pointer text-sm"
              >
                <FiX className="w-3.5 h-3.5" />
                <span>Cancel</span>
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer text-sm"
              >
                <FiCheckCircle className="w-3.5 h-3.5" />
                <span>{saving ? 'Saving...' : 'Apply Discount'}</span>
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* View Detail Modal */}
      {viewItem && (
        <Modal
          isOpen={true}
          title={`Product: ${viewItem.product_name}`}
          onClose={() => setViewItem(null)}
          size="md"
        >
          <div className="space-y-4 text-xs">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="w-full sm:w-28 h-28 rounded-2xl bg-primary/10 flex flex-col items-center justify-center text-primary border border-primary/20 shrink-0 shadow-2xs">
                <FiPackage className="w-10 h-10" />
                <span className="text-[10px] text-muted-foreground mt-1 font-mono uppercase">Item</span>
              </div>
              <div className="flex-1 grid grid-cols-2 gap-2.5 p-3.5 bg-muted/20 rounded-2xl border border-border">
                <div><span className="text-[10px] text-muted-foreground uppercase font-bold block mb-0.5">SKU Code:</span> <p className="font-mono font-bold text-foreground">{viewItem.product_code}</p></div>
                <div><span className="text-[10px] text-muted-foreground uppercase font-bold block mb-0.5">Category:</span> <p className="font-semibold text-foreground">{viewItem.category}</p></div>
                <div><span className="text-[10px] text-muted-foreground uppercase font-bold block mb-0.5">Brand:</span> <p className="font-medium text-foreground">{viewItem.brand || '—'}</p></div>
                <div><span className="text-[10px] text-muted-foreground uppercase font-bold block mb-0.5">Status:</span> <div><StatusBadge status={viewItem.status} /></div></div>
                {isAdmin && <div className="col-span-2"><span className="text-[10px] text-muted-foreground uppercase font-bold block mb-0.5">Branch:</span> <p className="font-medium text-primary">{viewItem.branch?.branch_name || 'Unassigned'}</p></div>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="p-3 border border-border rounded-xl bg-card">
                <span className="text-[10px] text-muted-foreground uppercase font-bold">Selling Price</span>
                <p className="text-lg font-bold font-mono text-emerald-600 mt-0.5">{fmt(viewItem.unit_price)}</p>
              </div>
              <div className="p-3 border border-border rounded-xl bg-card">
                <span className="text-[10px] text-muted-foreground uppercase font-bold">Cost Price</span>
                <p className="text-lg font-bold font-mono text-foreground mt-0.5">{fmt(viewItem.cost_price || 0)}</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 p-3 bg-muted/30 border border-border rounded-xl text-center">
              <div>
                <span className="text-[10px] text-muted-foreground uppercase font-bold">Current Stock</span>
                <p className="font-mono font-bold text-base text-primary">{viewItem.stock_quantity} {viewItem.unit}</p>
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground uppercase font-bold">Reorder Level</span>
                <p className="font-mono font-bold text-base text-amber-600">{viewItem.reorder_level} {viewItem.unit}</p>
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground uppercase font-bold">Stock Value</span>
                <p className="font-mono font-bold text-base text-emerald-600">{fmt((viewItem.unit_price || 0) * (viewItem.stock_quantity || 0))}</p>
              </div>
            </div>

            {viewItem.description && (
              <div className="p-3 bg-card border border-border rounded-xl">
                <span className="text-[10px] text-muted-foreground uppercase font-bold">Description & Specs</span>
                <p className="text-xs text-foreground mt-1">{viewItem.description}</p>
              </div>
            )}

            <div className="flex justify-end pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setViewItem(null)}
                className="flex items-center gap-1 px-4 py-1.5 rounded-xl border border-border hover:bg-muted font-semibold cursor-pointer"
              >
                <FiX className="w-3.5 h-3.5" />
                <span>Close</span>
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete confirmation */}
      {deleteItem && (
        <ConfirmDialog
          title="Delete Product"
          message={`Are you sure you want to delete "${deleteItem.product_name}" (${deleteItem.product_code})? This action cannot be undone.`}
          confirmLabel={saving ? "Deleting..." : "Delete Product"}
          danger
          onConfirm={handleDelete}
          onCancel={() => setDeleteItem(null)}
        />
      )}
    </div>
  )
}
