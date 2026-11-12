import { useState, useEffect, useMemo, useRef } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import {
  FiPackage, FiPlus, FiEdit, FiTrash2, FiEye,
  FiSearch, FiFilter, FiTag, FiBox,
  FiAlertTriangle, FiCheckCircle, FiX, FiInfo
} from 'react-icons/fi'
import {
  Btn, Badge, StatusBadge, Input, Select, Textarea, Modal, ConfirmDialog,
  Table, TR, TD, SearchBar, PageHeader, StatCard, Card, Pagination, showToast,
  LoadingState, ErrorAlert, StatSkeleton, TableSkeleton, EmptyState, confirmAction
} from '../components/ui'
import {
  fmt,
  filterBySearch,
  fastDeepEqual,
  PRODUCT_UNIT_OPTIONS,
  DIMENSION_UNITS,
  WEIGHT_UNITS,
  formatProductMeasurements,
} from '../lib/utils'
import {
  MASTER_CATEGORY_FRAMEWORK,
  MAIN_CATEGORIES,
  resolveCategoryHierarchy,
  matchesCategoryFilter,
  formatCategoryBreadcrumbs,
  getMainCategoryBadgeMeta,
  getNextSkuPreview,
  getScopedCategoryOptions,
} from '../lib/categories'
import api, { downloadCsv } from '../lib/api'
import { useRealtimeSync, triggerDataSync, SyncButton } from '../lib/realtimeSync'
import { FiDownload } from 'react-icons/fi'
import { TbCurrencyPeso } from 'react-icons/tb'
import MySalesChart from '../components/MySalesChart'

import { useAuth } from '../context/AuthContext'

const STOCK_STATUSES = ['All', 'High Stock', 'Medium Stock', 'Low Stock', 'Out of Stock']

export default function ProductsPage({ branchFilter, embedded }) {
  const { user } = useAuth()
  const isAdmin = user?.role === 'Administrator'
  const canManage = isAdmin || user?.role === 'Store Administrator' || user?.role === 'Store Admin'
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const viewMode = !embedded && searchParams.get('view') === 'categories' ? 'categories' : 'list'
  const urlCategoryParam = !embedded ? (searchParams.get('category') || '') : ''
  const [products, setProducts] = useState(() => {
    try {
      const saved = sessionStorage.getItem('pace_cached_products')
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })

  const [categoryTree, setCategoryTree] = useState(MASTER_CATEGORY_FRAMEWORK)
  const [categoryRows, setCategoryRows] = useState([])

  const customProductCategories = useMemo(() => {
    const custom = new Set()
    products.forEach((p) => {
      const cat = String(p?.category || '').trim()
      if (!cat) return
      const hier = resolveCategoryHierarchy(cat, categoryTree)
      if (hier.level === 'custom') {
        custom.add(cat)
      }
    })
    return Array.from(custom).sort()
  }, [products, categoryTree])

  const [branches, setBranches] = useState(() => {
    try {
      const saved = sessionStorage.getItem('pace_cached_branches') || sessionStorage.getItem('pace_cached_dash_branches')
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })
  const [selectedBranch, setSelectedBranch] = useState(branchFilter || 'All')
  const activeBranch = branchFilter || selectedBranch

  const [loading, setLoading] = useState(() => {
    return !sessionStorage.getItem('pace_cached_products')
  })
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState(() => urlCategoryParam || 'All')
  const [categorySearch, setCategorySearch] = useState('')
  const [categoryDomainTab, setCategoryDomainTab] = useState('All')
  const [categoryLevelFilter, setCategoryLevelFilter] = useState('group')
  const [categoryStatusFilter, setCategoryStatusFilter] = useState('All')
  const [catPage, setCatPage] = useState(1)
  const catPageSize = 15
  const [stockStatus, setStockStatus] = useState('All')
  const [page, setPage] = useState(1)
  const pageSize = 10

  // Modals
  const [addModal, setAddModal] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [deleteItem, setDeleteItem] = useState(null)
  const [viewItem, setViewItem] = useState(null)
  const [viewCategoryModal, setViewCategoryModal] = useState(null)
  const [assignedProductsModal, setAssignedProductsModal] = useState(null)
  const [assignedProductsSearch, setAssignedProductsSearch] = useState('')
  const [assignedProductsSubFilter, setAssignedProductsSubFilter] = useState('All')
  const [categoryModal, setCategoryModal] = useState(null)
  const [categoryForm, setCategoryForm] = useState({
    name: '',
    level: 'group',
    main_category: 'Furniture',
    parent_id: '',
    classification_scope: '',
    is_active: true,
  })
  const [savingCategory, setSavingCategory] = useState(false)
  const [discountModal, setDiscountModal] = useState(null) // holds the product to discount
  const [discountForm, setDiscountForm] = useState({ discount_price: '' })
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [formMainCategory, setFormMainCategory] = useState('Appliances')
  const [nextSkus, setNextSkus] = useState({ Furniture: '001', Appliances: '001' })
  const [skuManuallyEdited, setSkuManuallyEdited] = useState(false)

  const handleExport = async () => {
    setExporting(true)
    try {
      await downloadCsv('/products', {
        search: search || undefined,
        category: category !== 'All' ? category : undefined,
        stock_status: stockStatus !== 'All' ? stockStatus : undefined,
        branch: activeBranch !== 'All' ? activeBranch : undefined,
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
    branch_id: '', product_code: '', product_name: '', category: 'Major Home Appliances',
    brand: '', unit_price: '', discount_price: '', cost_price: '',
    stock_quantity: '', reorder_level: '5', unit: 'unit',
    length: '', width: '', height: '', dimension_unit: 'cm', weight: '', weight_unit: 'kg',
    status: 'Active', description: ''
  }
  const [form, setForm] = useState(emptyForm)

  // Image Upload State
  const [imageFiles, setImageFiles] = useState([null, null, null, null])
  const [existingImages, setExistingImages] = useState([null, null, null, null])
  const [removeImages, setRemoveImages] = useState([false, false, false, false])

  const loadBranches = async () => {
    try {
      const res = await api.branches.getAll()
      const branchList = res?.branches || []
      if (branchList.length > 0) {
        setBranches(prev => fastDeepEqual(prev, branchList) ? prev : branchList)
        try {
          sessionStorage.setItem('pace_cached_branches', JSON.stringify(branchList))
        } catch (e) { }
      }
    } catch (err) {
      console.warn('Failed to load branches:', err)
    }
  }

  const inFlightRef = useRef(false)

  const loadProducts = async (source, signal) => {
    const isBackground = source === true || source === 'timer' || source === 'database' || source === 'event' || source === 'focus' || source === 'mutation' || products.length > 0
    if (inFlightRef.current && isBackground) return
    inFlightRef.current = true
    if (!isBackground) {
      setLoading(true)
    }
    setError('')
    try {
      const needBranches = branches.length === 0 || !isBackground
      const effectiveCategoryFilter = viewMode === 'categories' ? 'All' : category
      const [data, branchesData] = await Promise.all([
        api.products.getAll({
          search: viewMode === 'categories' ? undefined : (search || undefined),
          category: effectiveCategoryFilter !== 'All' ? effectiveCategoryFilter : undefined,
          stock_status: viewMode === 'categories' ? undefined : (stockStatus !== 'All' ? stockStatus : undefined),
          branch: activeBranch !== 'All' ? activeBranch : undefined,
        }, signal ? { signal } : {}),
        needBranches ? api.branches.getAll(signal ? { signal } : {}).catch(() => ({ branches: [] })) : Promise.resolve(null)
      ])
      if (signal?.aborted) return
      const newProducts = data?.products || []
      setProducts(prev => fastDeepEqual(prev, newProducts) ? prev : newProducts)
      if (data?.next_skus && typeof data.next_skus === 'object') {
        setNextSkus(prev => fastDeepEqual(prev, data.next_skus) ? prev : data.next_skus)
      }
      setViewItem(prev => {
        if (!prev) return null
        const updated = newProducts.find(p => p.product_id === prev.product_id)
        return updated ? (fastDeepEqual(prev, updated) ? prev : updated) : prev
      })
      const newBranches = branchesData?.branches || []
      if (newBranches.length > 0) {
        setBranches(prev => fastDeepEqual(prev, newBranches) ? prev : newBranches)
        try {
          sessionStorage.setItem('pace_cached_branches', JSON.stringify(newBranches))
        } catch (e) { }
      }
      try {
        if (!search && category === 'All' && stockStatus === 'All' && activeBranch === 'All') {
          sessionStorage.setItem('pace_cached_products', JSON.stringify(newProducts))
        }
      } catch (e) { }
    } catch (err) {
      if (err?.name === 'AbortError') return
      if (!isBackground) {
        console.error('Failed to load products:', err)
        setError(err.message || 'Failed to fetch products')
      }
    } finally {
      inFlightRef.current = false
      if (!isBackground) {
        setLoading(false)
      }
    }
  }

  const loadCategories = async () => {
    try {
      const res = await api.products.getCategories(
        viewMode === 'categories' ? { include_inactive: 1 } : {}
      )
      if (Array.isArray(res?.tree) && res.tree.length > 0) {
        setCategoryTree(prev => (fastDeepEqual(prev, res.tree) ? prev : res.tree))
      }
      if (Array.isArray(res?.categories)) {
        setCategoryRows(prev => (fastDeepEqual(prev, res.categories) ? prev : res.categories))
      }
    } catch (_) {}
  }

  useEffect(() => {
    loadBranches()
  }, [])

  useEffect(() => {
    loadCategories()
  }, [viewMode])

  useEffect(() => {
    if (isAdmin && branches.length === 0) {
      loadBranches()
    }
  }, [isAdmin])

  useEffect(() => {
    if (embedded) return
    const paramCat = searchParams.get('category')
    const isCatView = searchParams.get('view') === 'categories'
    if (paramCat) {
      setCategory(paramCat)
      setPage(1)
    } else if (!isCatView && !searchParams.get('id')) {
      setCategory('All')
      setPage(1)
    }
  }, [searchParams, embedded])

  useEffect(() => {
    loadProducts('filter_change')
  }, [category, stockStatus, activeBranch, viewMode])

  // On-demand click-driven synchronization
  const { sync: syncProducts, isSyncing: isSyncingProducts } = useRealtimeSync(
    () => Promise.all([loadProducts('manual'), loadCategories()]),
    [],
    { module: 'products' }
  )

  const activeCategoryTree = useMemo(() => {
    return (categoryTree || [])
      .filter(d => d.is_active !== false)
      .map(d => ({
        ...d,
        groups: (d.groups || [])
          .filter(g => g.is_active !== false)
          .map(g => ({
            ...g,
            subcategories: (g.subcategories || []).filter(s => typeof s === 'string' || s.is_active !== false),
          })),
      }))
  }, [categoryTree])

  const getModalCategoryOptions = (mainName) =>
    getScopedCategoryOptions(mainName, activeCategoryTree)

  const modalCategoryOptions = useMemo(
    () => getModalCategoryOptions(formMainCategory),
    [activeCategoryTree, formMainCategory]
  )

  const normalizedCategoryRows = useMemo(() => {
    if (Array.isArray(categoryRows) && categoryRows.length > 0) {
      return categoryRows
    }
    const fallback = []
    let idx = 1
    for (const domain of categoryTree || []) {
      const mainId = domain.id || idx++
      fallback.push({
        id: mainId,
        name: domain.main,
        level: 'main',
        parent_id: null,
        main_category: domain.main,
        group_name: null,
        sku_prefix: domain.sku_prefix,
        scope: domain.scope || '',
        is_active: domain.is_active !== false,
      })
      for (const grp of domain.groups || []) {
        const grpId = grp.id || idx++
        fallback.push({
          id: grpId,
          name: grp.name,
          level: 'group',
          parent_id: mainId,
          main_category: domain.main,
          group_name: grp.name,
          sku_prefix: domain.sku_prefix,
          scope: grp.scope || '',
          is_active: grp.is_active !== false,
        })
        for (const sub of grp.subcategories || []) {
          const sName = typeof sub === 'string' ? sub : sub.name
          fallback.push({
            id: (typeof sub === 'object' && sub.id) || idx++,
            name: sName,
            level: 'subcategory',
            parent_id: grpId,
            main_category: domain.main,
            group_name: grp.name,
            sku_prefix: domain.sku_prefix,
            scope: (typeof sub === 'object' && sub.scope) || '',
            is_active: typeof sub === 'object' ? sub.is_active !== false : true,
          })
        }
      }
    }
    return fallback
  }, [categoryRows, categoryTree])

  const getCategoryAssignedProducts = (catName) => {
    return products.filter(p =>
      (!activeBranch || activeBranch === 'All' || String(p.branch_id) === String(activeBranch)) &&
      matchesCategoryFilter(p, catName, categoryTree)
    )
  }

  const getCategoryAvatarClass = (mainName) => {
    if (mainName === 'Furniture') {
      return 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/25'
    }
    if (mainName === 'Appliances') {
      return 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/25'
    }
    return 'bg-primary/10 text-primary border border-primary/20'
  }

  const filteredCategoryRows = useMemo(() => {
    const q = categorySearch.trim().toLowerCase()
    return normalizedCategoryRows.filter((row) => {
      if (categoryLevelFilter !== 'All' && row.level !== categoryLevelFilter) return false
      if (categoryDomainTab !== 'All' && row.main_category !== categoryDomainTab) return false
      if (categoryStatusFilter === 'Active' && row.is_active === false) return false
      if (categoryStatusFilter === 'Inactive' && row.is_active !== false) return false
      if (q) {
        const hay = `${row.name || ''} ${row.scope || ''} ${row.main_category || ''} ${row.group_name || ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [normalizedCategoryRows, categoryLevelFilter, categoryDomainTab, categoryStatusFilter, categorySearch])

  const paginatedCategoryRows = filteredCategoryRows.slice((catPage - 1) * catPageSize, catPage * catPageSize)

  const categoryGroupOptions = useMemo(
    () => normalizedCategoryRows.filter(r => r.level === 'group' && (!categoryForm.main_category || r.main_category === categoryForm.main_category)),
    [normalizedCategoryRows, categoryForm.main_category]
  )

  const openCreateCategory = () => {
    const defaultMain = categoryDomainTab !== 'All' ? categoryDomainTab : (MAIN_CATEGORIES[0] || 'Furniture')
    const defaultLevel = 'group'
    setCategoryForm({
      name: '',
      level: defaultLevel,
      main_category: defaultMain,
      parent_id: '',
      classification_scope: '',
      is_active: true,
    })
    setCategoryModal({ mode: 'create', item: null })
  }

  const openEditCategory = (row) => {
    setCategoryForm({
      name: row.name || '',
      level: row.level || 'group',
      main_category: row.main_category || 'Furniture',
      parent_id: row.parent_id ? String(row.parent_id) : '',
      classification_scope: row.scope || '',
      is_active: row.is_active !== false,
    })
    setCategoryModal({ mode: 'edit', item: row })
  }

  const openViewCategory = (row) => {
    const childSubs = normalizedCategoryRows.filter(r => Number(r.parent_id) === Number(row.id))
    const assigned = getCategoryAssignedProducts(row.name)
    setViewCategoryModal({ row, childSubs, assigned })
  }

  const openAssignedProductsModal = (row) => {
    const childSubs = normalizedCategoryRows.filter(r => Number(r.parent_id) === Number(row.id))
    setAssignedProductsSearch('')
    setAssignedProductsSubFilter('All')
    setAssignedProductsModal({ row, childSubs })
  }

  const handleSaveCategory = async (e) => {
    e.preventDefault()
    if (!categoryForm.name.trim()) {
      showToast('Category name is required', 'error')
      return
    }
    setSavingCategory(true)
    try {
      const payload = {
        name: categoryForm.name.trim(),
        level: categoryForm.level,
        main_category: categoryForm.main_category,
        parent_id: categoryForm.level === 'subcategory' && categoryForm.parent_id ? Number(categoryForm.parent_id) : null,
        classification_scope: categoryForm.classification_scope.trim(),
        is_active: Boolean(categoryForm.is_active),
      }
      if (categoryModal?.mode === 'edit' && categoryModal.item) {
        await api.products.updateCategory(categoryModal.item.id, payload)
        showToast('Category updated successfully', 'success')
      } else {
        await api.products.createCategory(payload)
        showToast('Category created successfully', 'success')
      }
      setCategoryModal(null)
      await loadCategories()
      triggerDataSync('products')
    } catch (err) {
      showToast(err.message || 'Failed to save category', 'error')
    } finally {
      setSavingCategory(false)
    }
  }

  const handleDeleteCategory = async (row, assignedCount) => {
    if (assignedCount > 0) {
      showToast(`Cannot delete "${row.name}" while ${assignedCount} product(s) are assigned to it.`, 'error')
      return
    }
    const confirmed = await confirmAction(
      'Delete Category',
      `Are you sure you want to delete "${row.name}"? This action cannot be undone.`,
      'Yes, Delete'
    )
    if (!confirmed) return
    try {
      await api.products.deleteCategory(row.id)
      showToast('Category deleted successfully', 'success')
      await loadCategories()
      triggerDataSync('products')
    } catch (err) {
      showToast(err.message || 'Failed to delete category', 'error')
    }
  }

  const openAdd = (presetCategory = null) => {
    if (branches.length === 0) {
      loadBranches()
    }
    const targetCat = typeof presetCategory === 'string' && presetCategory ? presetCategory : null
    const resolvedTarget = targetCat ? resolveCategoryHierarchy(targetCat, categoryTree) : null
    const resolvedActiveFilter = (category && category !== 'All' && category !== 'Sale Items')
      ? resolveCategoryHierarchy(category, categoryTree)
      : null
    const activeMain = resolvedTarget?.mainCategory
      || resolvedActiveFilter?.mainCategory
      || 'Appliances'
    const scopedOptions = getModalCategoryOptions(activeMain)
    const filterIsConcrete = category
      && category !== 'All'
      && category !== 'Sale Items'
      && !MAIN_CATEGORIES.includes(category)
      && resolveCategoryHierarchy(category, categoryTree).level !== 'custom'
    const activeCatPrefill = (targetCat && !MAIN_CATEGORIES.includes(targetCat))
      ? targetCat
      : (filterIsConcrete ? category : (scopedOptions[0] || activeMain))

    setFormMainCategory(activeMain)
    setEditItem(null)
    setSkuManuallyEdited(false)
    setForm({
      ...emptyForm,
      product_code: getNextSkuPreview(activeCatPrefill, categoryTree, products, nextSkus),
      category: activeCatPrefill,
      branch_id: activeBranch !== 'All' ? String(activeBranch) : (branches[0]?.id ? String(branches[0].id) : 'all')
    })
    setImageFiles([null, null, null, null])
    setExistingImages([null, null, null, null])
    setRemoveImages([false, false, false, false])
    setAddModal(true)
  }

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
      if (form.branch_id === 'all' || !form.branch_id) {
        payload.set('branch_id', 'all');
      } else {
        payload.set('branch_id', form.branch_id);
      }
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
      payload.set('unit', form.unit || 'unit');
      ['length', 'width', 'height', 'weight'].forEach((field) => {
        const rawVal = form[field]
        payload.set(field, rawVal !== '' && rawVal !== null && rawVal !== undefined ? String(parseFloat(rawVal)) : '')
      });
      payload.set('dimension_unit', form.dimension_unit || 'cm');
      payload.set('weight_unit', form.weight_unit || 'kg');
      if (user?.user_id) {
        payload.set('user_id', user.user_id);
      }

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
      setSkuManuallyEdited(false)
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

  const handleDelete = async (product) => {
    const target = product || deleteItem
    if (!target) return

    // Trigger SweetAlert directly, this connects straight to the backend logic below!
    const confirmed = await confirmAction('Delete Product?', `Are you sure you want to delete ${target.product_name}? This cannot be undone.`, 'DELETE')
    if (!confirmed) return

    setSaving(true)
    try {
      await api.products.delete(target.product_id)
      setProducts(prev => prev.filter(p => p.product_id !== target.product_id))
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
    if (branches.length === 0) {
      loadBranches()
    }
    const resolvedMain = resolveCategoryHierarchy(p, categoryTree).mainCategory
    setFormMainCategory(resolvedMain || 'Appliances')
    setEditItem(p)
    setSkuManuallyEdited(true)
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
      length: p.length !== null && p.length !== undefined ? String(p.length) : '',
      width: p.width !== null && p.width !== undefined ? String(p.width) : '',
      height: p.height !== null && p.height !== undefined ? String(p.height) : '',
      dimension_unit: p.dimension_unit || 'cm',
      weight: p.weight !== null && p.weight !== undefined ? String(p.weight) : '',
      weight_unit: p.weight_unit || 'kg',
      status: p.status || 'Active',
      description: p.description || '',
      branch_id: p.branch_id ? String(p.branch_id) : 'all',
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
      if (user?.user_id) {
        payload.append('user_id', user.user_id);
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
    let result = filterBySearch(products, search, ['product_code', 'product_name', 'brand', 'category', 'main_category', 'category_group'])
    if (activeBranch && activeBranch !== 'All') {
      result = result.filter(p => String(p.branch_id) === String(activeBranch))
    }
    if (category && category !== 'All') {
      result = result.filter(p => matchesCategoryFilter(p, category, categoryTree))
    }
    return result
  }, [products, search, activeBranch, category, categoryTree])

  const total = filtered.length
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize)

  // Quick stats computed from current product collection
  const totalProducts = products.length
  const lowStockCount = products.filter(p => p.stock_quantity === 1).length
  const mediumStockCount = products.filter(p => p.stock_quantity >= 2 && p.stock_quantity <= 4).length
  const highStockCount = products.filter(p => p.stock_quantity >= 5).length
  const outOfStockCount = products.filter(p => p.stock_quantity <= 0).length
  const totalValue = products.reduce((acc, p) => acc + ((p.unit_price || 0) * (p.stock_quantity || 0)), 0)

  return (
    <div className={embedded ? "" : "space-y-6"}>
      {!embedded && (
        <PageHeader
          title={viewMode === 'categories' ? 'Category Products' : 'Products & Inventory'}
          subtitle={viewMode === 'categories'
            ? 'Manage product categories, descriptions, and assigned inventory'
            : 'Manage product catalog, pricing, and stock levels'}
          action={
            <div className="flex flex-wrap gap-2">
              <SyncButton sync={syncProducts} isSyncing={isSyncingProducts} label="Sync" />
              {viewMode !== 'categories' && (
                <button
                  onClick={handleExport}
                  disabled={exporting}
                  className="flex items-center gap-2 px-4 py-2 bg-muted hover:bg-muted/80 text-foreground font-semibold text-xs rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50"
                >
                  {exporting ? <FiAlertTriangle className="w-4 h-4 animate-spin" /> : <FiDownload className="w-4 h-4" />}
                  <span>{exporting ? 'Exporting...' : 'Export CSV'}</span>
                </button>
              )}
              {canManage && viewMode === 'categories' && (
                <button
                  type="button"
                  onClick={openCreateCategory}
                  className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
                >
                  <FiPlus className="w-4 h-4" />
                  <span>Add Category</span>
                </button>
              )}
              {canManage && viewMode !== 'categories' && (
                <button
                  onClick={() => openAdd()}
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

      {viewMode !== 'categories' && (
        <>
          <MySalesChart />

          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard title="Total Products" value={totalProducts.toString()} sub="catalog items" icon={<FiPackage className="w-5 h-5" />} color="blue" />
            <StatCard title="Inventory Retail Value" value={fmt(totalValue)} sub="total stock value" icon={<TbCurrencyPeso className="w-5 h-5 text-emerald-500" />} color="green" />
            <StatCard title="Low Stock Items" value={lowStockCount.toString()} sub="needs reorder" icon={<FiAlertTriangle className="w-5 h-5 text-amber-500" />} color="yellow" />
            <StatCard title="Out of Stock Items" value={outOfStockCount.toString()} sub="unavailable stock" icon={<FiX className="w-5 h-5 text-rose-500" />} color="red" />
          </div>
        </>
      )}

      {error && <ErrorAlert message={error} onRetry={loadProducts} />}

      {viewMode === 'categories' ? (
        <div className="space-y-4">
          {/* Category Filter Toolbar */}
          <Card noPad className="p-3.5 border border-border">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 relative">
                <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  value={categorySearch}
                  onChange={e => { setCategorySearch(e.target.value); setCatPage(1) }}
                  placeholder="Search category name, description, or domain..."
                  className="w-full pl-9 pr-8 py-2 rounded-xl border border-border bg-card text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-muted-foreground/70"
                />
                {categorySearch && (
                  <button
                    type="button"
                    onClick={() => { setCategorySearch(''); setCatPage(1) }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    <FiX className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="flex gap-2 flex-wrap sm:flex-nowrap">
                {isAdmin && !branchFilter && (
                  <select
                    value={selectedBranch}
                    onChange={e => setSelectedBranch(e.target.value)}
                    className="border border-border rounded-xl px-3 py-2 text-xs font-semibold text-foreground bg-card cursor-pointer"
                  >
                    <option value="All">All Branches</option>
                    {branches.map(b => (
                      <option key={b.id} value={String(b.id)}>
                        {b.name || b.branch} {b.location ? `(${b.location})` : ''}
                      </option>
                    ))}
                  </select>
                )}

                <select
                  value={categoryDomainTab}
                  onChange={e => { setCategoryDomainTab(e.target.value); setCatPage(1) }}
                  className="border border-border rounded-xl px-3 py-2 text-xs font-semibold text-foreground bg-card cursor-pointer"
                >
                  <option value="All">All Products</option>
                  {MAIN_CATEGORIES.map((m) => (
                    <option key={`cat-tbl-main-${m}`} value={m}>{m} Products</option>
                  ))}
                </select>

                <select
                  value={categoryLevelFilter}
                  onChange={e => { setCategoryLevelFilter(e.target.value); setCatPage(1) }}
                  className="border border-border rounded-xl px-3 py-2 text-xs font-semibold text-foreground bg-card cursor-pointer"
                >
                  <option value="group">Category Groups</option>
                  <option value="All">All Levels</option>
                </select>

                <select
                  value={categoryStatusFilter}
                  onChange={e => { setCategoryStatusFilter(e.target.value); setCatPage(1) }}
                  className="border border-border rounded-xl px-3 py-2 text-xs font-semibold text-foreground bg-card cursor-pointer"
                >
                  <option value="All">All Status</option>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
            </div>
          </Card>

          {/* Category Table matching Directory Design */}
          <Card noPad className="border border-border overflow-hidden">
            {filteredCategoryRows.length === 0 ? (
              <EmptyState
                icon={<FiTag className="w-12 h-12 text-muted-foreground/30 mx-auto" />}
                title="No categories found"
                description="Try adjusting your category search or filters"
                action={
                  canManage ? (
                    <button
                      type="button"
                      onClick={openCreateCategory}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 bg-primary text-primary-foreground font-bold text-xs rounded-xl cursor-pointer"
                    >
                      <FiPlus className="w-4 h-4" />
                      <span>Add Category</span>
                    </button>
                  ) : null
                }
              />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs min-w-[760px]">
                    <thead>
                      <tr className="border-b border-border bg-muted/50 text-muted-foreground uppercase font-semibold text-[11px] tracking-wider">
                        <th className="py-3.5 px-4 text-left">Category Name</th>
                        <th className="py-3.5 px-4 text-left">Description</th>
                        <th className="py-3.5 px-4 text-center">Assigned Products</th>
                        <th className="py-3.5 px-4 text-center">Status</th>
                        <th className="py-3.5 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {paginatedCategoryRows.map((row, idx) => {
                        const assignedList = getCategoryAssignedProducts(row.name)
                        const assignedCount = assignedList.length
                        const isActive = row.is_active !== false
                        const avatarCls = getCategoryAvatarClass(row.main_category || row.name)
                        const subMeta = row.level === 'subcategory' && row.group_name
                          ? `${row.main_category} › ${row.group_name} • ID #${row.id}`
                          : `${row.main_category || row.name} • ID #${row.id}`

                        return (
                          <tr
                            key={`cat-row-${row.id}-${row.name}`}
                            className={`hover:bg-muted/40 transition-colors ${idx % 2 === 1 ? 'bg-muted/10' : ''}`}
                          >
                            <td className="py-3.5 px-4">
                              <div className="flex items-center gap-3">
                                <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${avatarCls}`}>
                                  {(row.name || '?').trim().charAt(0).toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <div className="font-bold text-foreground text-xs sm:text-[13px] leading-tight">
                                    {row.name}
                                  </div>
                                  <div className="text-[11px] text-muted-foreground mt-0.5">
                                    {subMeta}
                                  </div>
                                </div>
                              </div>
                            </td>

                            <td className="py-3.5 px-4 text-xs text-muted-foreground max-w-md">
                              {row.scope || '—'}
                            </td>

                            <td className="py-3.5 px-4 text-center">
                              <button
                                type="button"
                                onClick={() => openAssignedProductsModal(row)}
                                title={`View assigned products in ${row.name}`}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/25 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
                              >
                                <FiBox className="w-3.5 h-3.5 shrink-0" />
                                <span>{assignedCount} {assignedCount === 1 ? 'Product' : 'Products'}</span>
                              </button>
                            </td>

                            <td className="py-3.5 px-4 text-center">
                              <StatusBadge status={isActive ? 'Active' : 'Inactive'} />
                            </td>

                            <td className="py-3.5 px-4">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => openViewCategory(row)}
                                  title="View category details"
                                  className="p-2 rounded-lg border border-border text-blue-600 dark:text-blue-400 hover:bg-blue-500/10 hover:border-blue-500/30 transition-colors cursor-pointer"
                                >
                                  <FiEye className="w-3.5 h-3.5" />
                                </button>
                                {canManage && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => openEditCategory(row)}
                                      title="Edit category"
                                      className="p-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                                    >
                                      <FiEdit className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteCategory(row, assignedCount)}
                                      title="Delete category"
                                      className="p-2 rounded-lg border border-border text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 hover:border-rose-500/30 transition-colors cursor-pointer"
                                    >
                                      <FiTrash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                {filteredCategoryRows.length > catPageSize && (
                  <Pagination
                    total={filteredCategoryRows.length}
                    page={catPage}
                    pageSize={catPageSize}
                    onChange={setCatPage}
                  />
                )}
              </>
            )}
          </Card>

          {customProductCategories.length > 0 && (
            <Card className="border border-border space-y-2.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Custom / Legacy Categories</h3>
              <div className="flex flex-wrap gap-2">
                {customProductCategories.map((c) => {
                  const cnt = products.filter(p => p.category === c).length
                  return (
                    <button
                      key={`custom-cat-chip-${c}`}
                      type="button"
                      onClick={() => navigate(`/products?category=${encodeURIComponent(c)}`)}
                      className="px-3 py-1.5 rounded-xl border border-border bg-muted/30 hover:bg-muted text-xs font-semibold text-foreground cursor-pointer flex items-center gap-2"
                    >
                      <span>{c}</span>
                      <span className="font-mono text-[10px] text-primary font-bold">{cnt}</span>
                    </button>
                  )
                })}
              </div>
            </Card>
          )}
        </div>
      ) : (
        <>
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
                {isAdmin && !branchFilter && (
                  <select
                    value={selectedBranch}
                    onChange={e => { setSelectedBranch(e.target.value); setPage(1); }}
                    className="border border-border rounded-xl px-3 py-2 text-xs font-semibold text-foreground bg-card cursor-pointer"
                  >
                    <option value="All">All Branches</option>
                    {branches.map(b => (
                      <option key={b.id} value={String(b.id)}>
                        {b.name || b.branch} {b.location ? `(${b.location})` : ''}
                      </option>
                    ))}
                  </select>
                )}

                {/* Category Dropdown */}
                <select
                  value={category}
                  onChange={e => { setCategory(e.target.value); setPage(1) }}
                  className="border border-border rounded-xl px-3 py-2 text-xs font-semibold text-foreground bg-card cursor-pointer"
                >
                  <option value="All">All Categories</option>
                  {MAIN_CATEGORIES.map((m) => (
                    <option key={`filter-main-opt-${m}`} value={m}>{m}</option>
                  ))}
                  <option value="Sale Items">On Sale / Discounted</option>
                  {category !== 'All' &&
                    category !== 'Sale Items' &&
                    !MAIN_CATEGORIES.includes(category) &&
                    !customProductCategories.includes(category) && (
                      <optgroup label="Selected Sub-Category">
                        <option value={category}>{category}</option>
                      </optgroup>
                  )}
                  {customProductCategories.length > 0 && (
                    <optgroup label="Other / Legacy">
                      {customProductCategories.map((c) => (
                        <option key={`filter-custom-${c}`} value={c}>{c}</option>
                      ))}
                    </optgroup>
                  )}
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
                  canManage ? (
                    <button
                      onClick={() => openAdd()}
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
                  <table className="w-full text-xs min-w-[700px]">
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
                        const isOut = p.stock_quantity <= 0
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
                                  {(p.brand || formatProductMeasurements(p).hasAny) && (
                                    <div className="text-[11px] text-muted-foreground mt-0.5">
                                      {[p.brand, formatProductMeasurements(p).summary].filter(Boolean).join(' · ')}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>
                            {isAdmin && (
                              <td className="py-3 px-4">
                                <span className="text-[11px] font-semibold text-foreground bg-muted/50 px-2 py-1 rounded-md">
                                  {p.branch?.name || (p.branch_id ? `Branch #${p.branch_id}` : 'All Branches')}
                                </span>
                              </td>
                            )}
                            <td className="py-3 px-4">
                              {(() => {
                                const hier = resolveCategoryHierarchy(p, categoryTree)
                                const meta = getMainCategoryBadgeMeta(p, categoryTree)
                                return (
                                  <div className="space-y-0.5">
                                    <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold ${meta.badgeClass}`}>
                                      {p.category}
                                    </span>
                                    {hier.mainCategory && hier.mainCategory !== p.category && (
                                      <div className="text-[10px] text-muted-foreground leading-tight">
                                        {hier.categoryGroup && hier.categoryGroup !== p.category
                                          ? `${hier.mainCategory} › ${hier.categoryGroup}`
                                          : hier.mainCategory}
                                      </div>
                                    )}
                                  </div>
                                )
                              })()}
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
                                  onClick={() => handleDelete(p)}
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
        </>
      )}

      {/* Add/Edit Modal */}
      {addModal && (
        <Modal
          isOpen={true}
          title={editItem ? `Edit Product — ${editItem.product_code}` : 'Add New Product'}
          onClose={() => { setAddModal(false); setEditItem(null) }}
          size="lg"
        >
          <form onSubmit={handleSave} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block font-bold text-muted-foreground mb-1">SKU / Product Code</label>
                <input
                  type="text"
                  value={form.product_code}
                  onChange={e => {
                    const val = e.target.value
                    setSkuManuallyEdited(val.trim() !== '')
                    setForm(f => ({ ...f, product_code: val }))
                  }}
                  placeholder={`Auto: ${getNextSkuPreview(form.category || formMainCategory, categoryTree, products, nextSkus)}`}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-mono"
                />
              </div>
              <div>
                <label className="block font-bold text-muted-foreground mb-1">Main Category *</label>
                <select
                  value={formMainCategory}
                  onChange={e => {
                    const nextMain = e.target.value
                    const nextOptions = getModalCategoryOptions(nextMain)
                    const nextCat = nextOptions[0] || nextMain
                    setFormMainCategory(nextMain)
                    setForm(f => ({
                      ...f,
                      category: nextCat,
                      product_code: (!editItem && !skuManuallyEdited)
                        ? getNextSkuPreview(nextCat, categoryTree, products, nextSkus)
                        : f.product_code,
                    }))
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-semibold"
                  required
                >
                  {MAIN_CATEGORIES.map((m) => (
                    <option key={`form-main-opt-${m}`} value={m}>{m}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block font-bold text-muted-foreground mb-1">
                {formMainCategory} Group / Sub-Category *
              </label>
              <select
                value={form.category}
                onChange={e => {
                  const nextCat = e.target.value
                  setForm(f => ({
                    ...f,
                    category: nextCat,
                    product_code: (!editItem && !skuManuallyEdited)
                      ? getNextSkuPreview(nextCat, categoryTree, products, nextSkus)
                      : f.product_code,
                  }))
                }}
                className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-semibold"
                required
              >
                {modalCategoryOptions.map((optName) => (
                  <option key={`form-opt-${formMainCategory}-${optName}`} value={optName}>
                    {optName}
                  </option>
                ))}
                {form.category && !modalCategoryOptions.includes(form.category) && (
                  <option value={form.category}>{form.category}</option>
                )}
              </select>
              {form.category && (
                <div className="mt-1.5 flex items-center justify-between gap-2 text-[10px] text-muted-foreground bg-muted/30 px-2.5 py-1 rounded-lg border border-border">
                  <span className="truncate font-medium">
                    Hierarchy: <strong className="text-foreground">{formatCategoryBreadcrumbs(form.category, categoryTree)}</strong>
                  </span>
                  {!editItem && (
                    <span className="font-mono font-bold text-primary shrink-0">
                      Next SKU ({formMainCategory}): {getNextSkuPreview(form.category, categoryTree, products, nextSkus)}
                    </span>
                  )}
                </div>
              )}
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
                    <option value="all">All Branches (Global Inventory)</option>
                    {branches.map(b => (
                      <option key={b.id} value={String(b.id)}>
                        {b.name || b.branch} {b.location ? `(${b.location})` : ''}
                      </option>
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
                <select
                  value={form.unit}
                  onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-semibold"
                >
                  {PRODUCT_UNIT_OPTIONS.map((u) => (
                    <option key={`unit-opt-${u}`} value={u}>{u}</option>
                  ))}
                  {form.unit && !PRODUCT_UNIT_OPTIONS.includes(form.unit) && (
                    <option value={form.unit}>{form.unit}</option>
                  )}
                </select>
              </div>
            </div>

            <div className="p-3 rounded-xl border border-border bg-muted/20 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="block font-bold text-foreground">Detailed Unit Measurements</span>
                  <span className="text-[10px] text-muted-foreground">Specify exact dimensions (Length, Width, Height) and product Weight</span>
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground">
                    <span>Size Unit:</span>
                    <select
                      value={form.dimension_unit}
                      onChange={e => setForm(f => ({ ...f, dimension_unit: e.target.value }))}
                      className="px-2 py-1 rounded-lg border border-border bg-card text-foreground font-mono font-bold"
                    >
                      {DIMENSION_UNITS.map((u) => (
                        <option key={`dim-u-${u}`} value={u}>{u}</option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground">
                    <span>Weight Unit:</span>
                    <select
                      value={form.weight_unit}
                      onChange={e => setForm(f => ({ ...f, weight_unit: e.target.value }))}
                      className="px-2 py-1 rounded-lg border border-border bg-card text-foreground font-mono font-bold"
                    >
                      {WEIGHT_UNITS.map((u) => (
                        <option key={`wt-u-${u}`} value={u}>{u}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-muted-foreground mb-1">Length ({form.dimension_unit})</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.length}
                    onChange={e => setForm(f => ({ ...f, length: e.target.value }))}
                    placeholder="e.g. 120"
                    className="w-full px-2.5 py-1.5 rounded-xl border border-border bg-card text-foreground font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-muted-foreground mb-1">Width ({form.dimension_unit})</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.width}
                    onChange={e => setForm(f => ({ ...f, width: e.target.value }))}
                    placeholder="e.g. 60"
                    className="w-full px-2.5 py-1.5 rounded-xl border border-border bg-card text-foreground font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-muted-foreground mb-1">Height ({form.dimension_unit})</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.height}
                    onChange={e => setForm(f => ({ ...f, height: e.target.value }))}
                    placeholder="e.g. 85"
                    className="w-full px-2.5 py-1.5 rounded-xl border border-border bg-card text-foreground font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-muted-foreground mb-1">Weight ({form.weight_unit})</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.weight}
                    onChange={e => setForm(f => ({ ...f, weight: e.target.value }))}
                    placeholder="e.g. 18.5"
                    className="w-full px-2.5 py-1.5 rounded-xl border border-border bg-card text-foreground font-mono"
                  />
                </div>
              </div>

              {formatProductMeasurements(form).hasAny && (
                <div className="text-[10px] font-mono text-primary font-semibold bg-primary/5 border border-primary/20 rounded-lg px-2.5 py-1">
                  Measure Summary: {formatProductMeasurements(form).summary}
                </div>
              )}
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

            <div className="flex justify-end gap-3 pt-4 border-t border-border">
              <button
                type="button"
                onClick={() => {
                  setAddModal(false);
                  setEditItem(null);
                  setSkuManuallyEdited(false);
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
          size="lg"
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

            <div className="flex justify-end gap-3 pt-4 border-t border-border mt-4">
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
          size="lg"
        >
          <div className="space-y-4 text-xs">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="w-full sm:w-28 h-28 rounded-2xl bg-primary/10 flex flex-col items-center justify-center text-primary border border-primary/20 shrink-0 shadow-2xs overflow-hidden">
                {viewItem.image_url ? (
                  <img src={viewItem.image_url} alt={viewItem.product_name} className="w-full h-full object-cover" />
                ) : (
                  <>
                    <FiPackage className="w-10 h-10" />
                    <span className="text-[10px] text-muted-foreground mt-1 font-mono uppercase">Item</span>
                  </>
                )}
              </div>
              <div className="flex-1 grid grid-cols-2 gap-2.5 p-3.5 bg-muted/20 rounded-2xl border border-border">
                <div><span className="text-[10px] text-muted-foreground uppercase font-bold block mb-0.5">SKU Code:</span> <p className="font-mono font-bold text-foreground">{viewItem.product_code}</p></div>
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase font-bold block mb-0.5">Category Hierarchy:</span>
                  <p className="font-semibold text-foreground">{viewItem.category}</p>
                  <p className="text-[10px] text-muted-foreground">{formatCategoryBreadcrumbs(viewItem, categoryTree)}</p>
                </div>
                <div><span className="text-[10px] text-muted-foreground uppercase font-bold block mb-0.5">Brand:</span> <p className="font-medium text-foreground">{viewItem.brand || '—'}</p></div>
                <div><span className="text-[10px] text-muted-foreground uppercase font-bold block mb-0.5">Status:</span> <div><StatusBadge status={viewItem.status} /></div></div>
                {isAdmin && (
                  <div className="col-span-2">
                    <span className="text-[10px] text-muted-foreground uppercase font-bold block mb-0.5">Branch:</span>
                    <p className="font-medium text-primary">
                      {viewItem.branch?.name || (viewItem.branch_id ? `Branch #${viewItem.branch_id}` : 'All Branches (Global)')}
                    </p>
                  </div>
                )}
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

            {(() => {
              const meas = formatProductMeasurements(viewItem)
              if (!meas.hasAny) return null
              return (
                <div className="p-3 bg-card border border-border rounded-xl space-y-2">
                  <span className="text-[10px] text-muted-foreground uppercase font-bold block">Unit Measurements</span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                    <div className="p-2 rounded-lg bg-muted/30 border border-border">
                      <span className="text-[10px] text-muted-foreground uppercase font-bold block">Length</span>
                      <p className="font-mono font-bold text-foreground mt-0.5">{meas.lengthLabel || '—'}</p>
                    </div>
                    <div className="p-2 rounded-lg bg-muted/30 border border-border">
                      <span className="text-[10px] text-muted-foreground uppercase font-bold block">Width</span>
                      <p className="font-mono font-bold text-foreground mt-0.5">{meas.widthLabel || '—'}</p>
                    </div>
                    <div className="p-2 rounded-lg bg-muted/30 border border-border">
                      <span className="text-[10px] text-muted-foreground uppercase font-bold block">Height</span>
                      <p className="font-mono font-bold text-foreground mt-0.5">{meas.heightLabel || '—'}</p>
                    </div>
                    <div className="p-2 rounded-lg bg-muted/30 border border-border">
                      <span className="text-[10px] text-muted-foreground uppercase font-bold block">Weight</span>
                      <p className="font-mono font-bold text-foreground mt-0.5">{meas.weightLabel || '—'}</p>
                    </div>
                  </div>
                </div>
              )
            })()}

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

      {/* View Category Details Modal */}
      {viewCategoryModal && (
        <Modal
          isOpen={true}
          title={viewCategoryModal.row.name}
          onClose={() => setViewCategoryModal(null)}
          size="lg"
        >
          <div className="space-y-4 text-xs">
            <div className="flex items-start justify-between gap-3 p-3.5 rounded-2xl bg-muted/20 border border-border">
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 ${getCategoryAvatarClass(viewCategoryModal.row.main_category || viewCategoryModal.row.name)}`}>
                  {(viewCategoryModal.row.name || '?').trim().charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-sm text-foreground">{viewCategoryModal.row.name}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    {viewCategoryModal.row.main_category} • ID #{viewCategoryModal.row.id} • SKU Prefix: {viewCategoryModal.row.sku_prefix || 'PRD'}
                  </div>
                </div>
              </div>
              <StatusBadge status={viewCategoryModal.row.is_active !== false ? 'Active' : 'Inactive'} />
            </div>

            <div className="p-3 rounded-xl bg-card border border-border">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                Classification / Description
              </span>
              <p className="text-foreground leading-relaxed">
                {viewCategoryModal.row.scope || 'No description provided.'}
              </p>
            </div>

            {viewCategoryModal.childSubs?.length > 0 && (
              <div className="space-y-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Sub-Categories ({viewCategoryModal.childSubs.length})
                </div>
                <div className="divide-y divide-border rounded-xl border border-border overflow-hidden">
                  {viewCategoryModal.childSubs.map((sub) => {
                    const subCount = getCategoryAssignedProducts(sub.name).length
                    return (
                      <div key={`modal-sub-${sub.id}`} className="px-3.5 py-2.5 flex items-center justify-between gap-2 bg-card hover:bg-muted/30">
                        <div className="min-w-0">
                          <div className="font-semibold text-foreground">{sub.name}</div>
                          {sub.scope && <div className="text-[11px] text-muted-foreground truncate">{sub.scope}</div>}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setViewCategoryModal(null)
                            openAssignedProductsModal(sub)
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/25 font-semibold shrink-0 cursor-pointer transition-colors"
                        >
                          <FiBox className="w-3 h-3" />
                          <span>{subCount} {subCount === 1 ? 'Product' : 'Products'}</span>
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Assigned Products ({viewCategoryModal.assigned.length})
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const catName = viewCategoryModal.row.name
                    setViewCategoryModal(null)
                    navigate(`/products?category=${encodeURIComponent(catName)}`)
                  }}
                  className="text-xs font-bold text-primary hover:underline cursor-pointer"
                >
                  Open in Inventory &rarr;
                </button>
              </div>
              {viewCategoryModal.assigned.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground border border-dashed border-border rounded-xl">
                  No products are currently assigned to this category.
                </div>
              ) : (
                <div className="max-h-48 overflow-y-auto divide-y divide-border rounded-xl border border-border">
                  {viewCategoryModal.assigned.map((p) => (
                    <div key={`cat-prod-preview-${p.product_id}`} className="px-3.5 py-2 flex items-center justify-between gap-2 bg-card">
                      <div className="min-w-0">
                        <div className="font-semibold text-foreground truncate">{p.product_name}</div>
                        <div className="text-[10px] font-mono text-muted-foreground">{p.product_code} · {p.category}</div>
                      </div>
                      <span className="font-mono font-bold text-emerald-600 shrink-0">{fmt(p.discount_price || p.unit_price)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setViewCategoryModal(null)}
                className="flex items-center gap-1 px-4 py-1.5 rounded-xl border border-border hover:bg-muted font-semibold cursor-pointer"
              >
                <FiX className="w-3.5 h-3.5" />
                <span>Close</span>
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Add / Edit Category Modal */}
      {categoryModal && (
        <Modal
          isOpen={true}
          title={categoryModal.mode === 'edit' ? `Edit Category — ${categoryModal.item?.name}` : 'Add New Category'}
          onClose={() => setCategoryModal(null)}
          size="md"
        >
          <form onSubmit={handleSaveCategory} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-muted-foreground mb-1">Category Name *</label>
                <input
                  type="text"
                  value={categoryForm.name}
                  onChange={e => setCategoryForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Living Room Furniture"
                  required
                  className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-semibold"
                />
              </div>
              <div>
                <label className="block font-bold text-muted-foreground mb-1">Level *</label>
                <select
                  value={categoryForm.level}
                  disabled={categoryModal.mode === 'edit'}
                  onChange={e => setCategoryForm(f => ({ ...f, level: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-semibold disabled:opacity-60"
                >
                  <option value="group">Category Group</option>
                  <option value="subcategory">Sub-Category</option>
                  <option value="main">Main Domain</option>
                </select>
              </div>
            </div>

            {categoryForm.level !== 'main' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-muted-foreground mb-1">Main Category *</label>
                  <select
                    value={categoryForm.main_category}
                    onChange={e => {
                      const nextMain = e.target.value
                      const firstGrp = normalizedCategoryRows.find(r => r.level === 'group' && r.main_category === nextMain)
                      setCategoryForm(f => ({
                        ...f,
                        main_category: nextMain,
                        parent_id: firstGrp ? String(firstGrp.id) : '',
                      }))
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-semibold"
                  >
                    {MAIN_CATEGORIES.map((m) => (
                      <option key={`cat-form-main-${m}`} value={m}>{m}</option>
                    ))}
                  </select>
                </div>

                {categoryForm.level === 'subcategory' && (
                  <div>
                    <label className="block font-bold text-muted-foreground mb-1">Parent Group *</label>
                    <select
                      value={categoryForm.parent_id}
                      onChange={e => setCategoryForm(f => ({ ...f, parent_id: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-semibold"
                      required
                    >
                      <option value="">Select Group</option>
                      {categoryGroupOptions.map((g) => (
                        <option key={`cat-form-grp-${g.id}`} value={String(g.id)}>{g.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="block font-bold text-muted-foreground mb-1">Description / Scope</label>
              <textarea
                rows={3}
                value={categoryForm.classification_scope}
                onChange={e => setCategoryForm(f => ({ ...f, classification_scope: e.target.value }))}
                placeholder="Describe what belongs under this category..."
                className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground"
              />
            </div>

            <div>
              <label className="block font-bold text-muted-foreground mb-1">Status</label>
              <select
                value={categoryForm.is_active ? 'Active' : 'Inactive'}
                onChange={e => setCategoryForm(f => ({ ...f, is_active: e.target.value === 'Active' }))}
                className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-semibold"
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-border">
              <button
                type="button"
                onClick={() => setCategoryModal(null)}
                className="flex items-center gap-1 px-4 py-2 rounded-xl border border-border hover:bg-muted font-semibold cursor-pointer text-xs"
              >
                <FiX className="w-3.5 h-3.5" />
                <span>Cancel</span>
              </button>
              <button
                type="submit"
                disabled={savingCategory}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold cursor-pointer text-xs disabled:opacity-50"
              >
                <FiCheckCircle className="w-3.5 h-3.5" />
                <span>{savingCategory ? 'Saving...' : (categoryModal.mode === 'edit' ? 'Save Changes' : 'Create Category')}</span>
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Assigned Products Modal */}
      {assignedProductsModal && (() => {
        const modalRow = assignedProductsModal.row
        const modalSubs = assignedProductsModal.childSubs || []
        const baseAssigned = getCategoryAssignedProducts(modalRow.name)
        const scopedAssigned = assignedProductsSubFilter === 'All'
          ? baseAssigned
          : baseAssigned.filter(p => matchesCategoryFilter(p, assignedProductsSubFilter, categoryTree))
        const filteredAssigned = filterBySearch(
          scopedAssigned,
          assignedProductsSearch,
          ['product_code', 'product_name', 'brand', 'category']
        )
        const targetAddCategory = assignedProductsSubFilter !== 'All' ? assignedProductsSubFilter : modalRow.name

        return (
          <Modal
            isOpen={true}
            title={`Assigned Products — ${modalRow.name}`}
            onClose={() => setAssignedProductsModal(null)}
            size="lg"
          >
            <div className="space-y-4 text-xs">
              {/* Header Info Banner */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-2xl bg-muted/25 border border-border">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 ${getCategoryAvatarClass(modalRow.main_category || modalRow.name)}`}>
                    {(modalRow.name || '?').trim().charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-sm text-foreground truncate">{modalRow.name}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                      {modalRow.level === 'subcategory' && modalRow.group_name
                        ? `${modalRow.main_category} › ${modalRow.group_name} • ID #${modalRow.id}`
                        : `${modalRow.main_category || modalRow.name} • ID #${modalRow.id}`}
                    </div>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/25 font-bold shrink-0">
                  <FiBox className="w-3.5 h-3.5" />
                  <span>{baseAssigned.length} {baseAssigned.length === 1 ? 'Product' : 'Products'}</span>
                </span>
              </div>

              {/* Search & Sub-Category Pills */}
              <div className="space-y-2.5">
                <div className="relative">
                  <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                  <input
                    type="text"
                    value={assignedProductsSearch}
                    onChange={e => setAssignedProductsSearch(e.target.value)}
                    placeholder={`Search products in ${modalRow.name}...`}
                    className="w-full pl-8 pr-8 py-2 rounded-xl border border-border bg-card text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                  {assignedProductsSearch && (
                    <button
                      type="button"
                      onClick={() => setAssignedProductsSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      <FiX className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {modalSubs.length > 0 && (
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                    <button
                      type="button"
                      onClick={() => setAssignedProductsSubFilter('All')}
                      className={`px-3 py-1 rounded-xl text-[11px] font-bold transition-colors shrink-0 cursor-pointer border ${
                        assignedProductsSubFilter === 'All'
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-muted/40 border-border text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      All ({baseAssigned.length})
                    </button>
                    {modalSubs.map((sub) => {
                      const subCnt = baseAssigned.filter(p => matchesCategoryFilter(p, sub.name, categoryTree)).length
                      const isSel = assignedProductsSubFilter === sub.name
                      return (
                        <button
                          key={`assigned-sub-pill-${sub.id}`}
                          type="button"
                          onClick={() => setAssignedProductsSubFilter(sub.name)}
                          className={`px-3 py-1 rounded-xl text-[11px] font-semibold transition-colors shrink-0 cursor-pointer border ${
                            isSel
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'bg-muted/40 border-border text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {sub.name} ({subCnt})
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Assigned Products List / Table */}
              {filteredAssigned.length === 0 ? (
                <div className="p-8 text-center border border-dashed border-border rounded-2xl bg-muted/10 space-y-3">
                  <FiBox className="w-10 h-10 text-muted-foreground/35 mx-auto" />
                  <div>
                    <div className="font-bold text-sm text-foreground">
                      {baseAssigned.length === 0
                        ? `No products assigned to ${modalRow.name} yet`
                        : 'No matching products'}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {baseAssigned.length === 0
                        ? 'Products assigned to this category or its sub-categories will appear here automatically.'
                        : 'Try clearing your search or sub-category filter.'}
                    </p>
                  </div>
                  {canManage && baseAssigned.length === 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setAssignedProductsModal(null)
                        openAdd(targetAddCategory)
                      }}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs cursor-pointer transition-colors"
                    >
                      <FiPlus className="w-3.5 h-3.5" />
                      <span>Add Product to {targetAddCategory}</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="max-h-80 overflow-y-auto border border-border rounded-xl overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-muted/80 backdrop-blur-xs border-b border-border text-muted-foreground uppercase text-[10px] font-bold">
                      <tr>
                        <th className="py-2.5 px-3 text-left">Product</th>
                        <th className="py-2.5 px-3 text-left">Category</th>
                        <th className="py-2.5 px-3 text-right">Price</th>
                        <th className="py-2.5 px-3 text-center">Stock</th>
                        <th className="py-2.5 px-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border bg-card">
                      {filteredAssigned.map((p) => (
                        <tr key={`assigned-modal-prod-${p.product_id}`} className="hover:bg-muted/30 transition-colors">
                          <td className="py-2.5 px-3">
                            <div className="font-semibold text-foreground leading-tight">{p.product_name}</div>
                            <div className="text-[10px] font-mono text-muted-foreground mt-0.5">
                              {p.product_code}{p.brand ? ` · ${p.brand}` : ''}
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-muted text-foreground">
                              {p.category}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold">
                            {p.discount_price ? (
                              <span className="text-emerald-600">{fmt(p.discount_price)}</span>
                            ) : (
                              <span>{fmt(p.unit_price)}</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono font-bold">
                            <span className={p.stock_quantity <= 0 ? 'text-rose-500' : p.stock_quantity === 1 ? 'text-amber-500' : 'text-emerald-500'}>
                              {p.stock_quantity} {p.unit}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => setViewItem(p)}
                                title="View product details"
                                className="p-1.5 rounded-lg border border-border hover:bg-muted text-foreground cursor-pointer"
                              >
                                <FiEye className="w-3 h-3" />
                              </button>
                              {canManage && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setAssignedProductsModal(null)
                                    openEdit(p)
                                  }}
                                  title="Edit product"
                                  className="p-1.5 rounded-lg border border-border hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
                                >
                                  <FiEdit className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Footer Actions */}
              <div className="flex flex-wrap items-center justify-end gap-2 pt-3 border-t border-border">
                {canManage && baseAssigned.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setAssignedProductsModal(null)
                      openAdd(targetAddCategory)
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold cursor-pointer"
                  >
                    <FiPlus className="w-3.5 h-3.5" />
                    <span>Add Product</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setAssignedProductsModal(null)}
                  className="flex items-center gap-1 px-4 py-1.5 rounded-xl border border-border hover:bg-muted font-semibold cursor-pointer"
                >
                  <FiX className="w-3.5 h-3.5" />
                  <span>Close</span>
                </button>
              </div>
            </div>
          </Modal>
        )
      })()}
    </div>
  )
}
