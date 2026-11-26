import { useState, useEffect, useMemo, useRef, useDeferredValue } from 'react'
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
  const deferredSearch = useDeferredValue(search)
  const [category, setCategory] = useState(() => urlCategoryParam || 'All')
  const [categorySearch, setCategorySearch] = useState('')
  const deferredCategorySearch = useDeferredValue(categorySearch)
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
    branch_id: 'all',
    sku_prefix: 'FUR',
    slug: '',
    sort_order: '1',
    classification_scope: '',
    is_active: true,
  })
  const createEmptyCategoryProductRow = () => ({
    rowKey: `cat-prod-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    product_name: '',
    product_code: '',
    brand: '',
    unit_price: '',
    cost_price: '',
    stock_quantity: '0',
    unit: 'unit',
    status: 'Active',
  })
  const [categoryMultiProductTab, setCategoryMultiProductTab] = useState('new')
  const [categoryNewProducts, setCategoryNewProducts] = useState(() => [createEmptyCategoryProductRow()])
  const [categoryAssignProductIds, setCategoryAssignProductIds] = useState([])
  const [categoryExistingProductSearch, setCategoryExistingProductSearch] = useState('')
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
      const needBranches = branches.length === 0
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

  // Tab-aware loading: only fetch categories when viewing Categories tab (or once when products modal needs tree),
  // and only fetch products when viewing the Products tab.
  useEffect(() => {
    if (viewMode === 'categories') {
      loadCategories()
      return
    }
    if (categoryTree.length === 0) {
      loadCategories()
    }
  }, [viewMode])

  useEffect(() => {
    if (viewMode === 'categories') return
    const controller = new AbortController()
    loadProducts('filter_change', controller.signal)
    return () => controller.abort()
  }, [category, stockStatus, activeBranch, viewMode])

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

  // On-demand click-driven synchronization scoped to active tab
  const { sync: syncProducts, isSyncing: isSyncingProducts } = useRealtimeSync(
    () => (viewMode === 'categories' ? loadCategories() : loadProducts('manual')),
    [viewMode],
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
      (!activeBranch || activeBranch === 'All' || !p.branch_id || String(p.branch_id) === String(activeBranch)) &&
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

  const getCategoryBranchLabel = (row) => {
    if (!row) return 'All Branches'
    if (row.branch_name) return row.branch_name
    if (row.branch_id) {
      const found = branches.find(b => String(b.id) === String(row.branch_id))
      return found ? (found.name || found.branch) : `Branch #${row.branch_id}`
    }
    return 'All Branches'
  }

  const filteredCategoryRows = useMemo(() => {
    const q = deferredCategorySearch.trim().toLowerCase()
    return normalizedCategoryRows.filter((row) => {
      if (categoryLevelFilter !== 'All' && row.level !== categoryLevelFilter) return false
      if (categoryDomainTab !== 'All' && row.main_category !== categoryDomainTab) return false
      if (categoryStatusFilter === 'Active' && row.is_active === false) return false
      if (categoryStatusFilter === 'Inactive' && row.is_active !== false) return false
      if (activeBranch && activeBranch !== 'All' && row.branch_id && String(row.branch_id) !== String(activeBranch)) return false
      if (q) {
        const branchLabel = getCategoryBranchLabel(row)
        const hay = `${row.name || ''} ${row.scope || ''} ${row.main_category || ''} ${row.group_name || ''} ${branchLabel}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [normalizedCategoryRows, categoryLevelFilter, categoryDomainTab, categoryStatusFilter, deferredCategorySearch, activeBranch, branches])

  const paginatedCategoryRows = filteredCategoryRows.slice((catPage - 1) * catPageSize, catPage * catPageSize)

  const categoryGroupOptions = useMemo(
    () => normalizedCategoryRows.filter(r => r.level === 'group' && (!categoryForm.main_category || r.main_category === categoryForm.main_category)),
    [normalizedCategoryRows, categoryForm.main_category]
  )

  const toCategorySlug = (str) =>
    String(str || '')
      .toLowerCase()
      .replace(/&/g, 'and')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')

  const resetCategoryMultiProducts = () => {
    setCategoryMultiProductTab('new')
    setCategoryNewProducts([createEmptyCategoryProductRow()])
    setCategoryAssignProductIds([])
    setCategoryExistingProductSearch('')
  }

  const addCategoryProductRow = (count = 1) => {
    setCategoryNewProducts(prev => [
      ...prev,
      ...Array.from({ length: count }, () => createEmptyCategoryProductRow()),
    ])
  }

  const updateCategoryProductRow = (rowKey, field, value) => {
    setCategoryNewProducts(prev =>
      prev.map(row => (row.rowKey === rowKey ? { ...row, [field]: value } : row))
    )
  }

  const removeCategoryProductRow = (rowKey) => {
    setCategoryNewProducts(prev => {
      const next = prev.filter(row => row.rowKey !== rowKey)
      return next.length > 0 ? next : [createEmptyCategoryProductRow()]
    })
  }

  const toggleAssignProductId = (productId) => {
    const idNum = Number(productId)
    setCategoryAssignProductIds(prev =>
      prev.includes(idNum) ? prev.filter(id => id !== idNum) : [...prev, idNum]
    )
  }

  const openCreateCategory = (presetParentRow = null) => {
    if (branches.length === 0) {
      loadBranches()
    }
    const isPresetGroup = Boolean(
      presetParentRow &&
      typeof presetParentRow === 'object' &&
      !presetParentRow.nativeEvent &&
      presetParentRow.id &&
      presetParentRow.name
    )
    const defaultMain = isPresetGroup
      ? (presetParentRow.main_category || 'Furniture')
      : (categoryDomainTab !== 'All' ? categoryDomainTab : (MAIN_CATEGORIES[0] || 'Furniture'))
    const defaultLevel = isPresetGroup ? 'subcategory' : 'group'
    const nextOrder = normalizedCategoryRows.filter(r => r.level === defaultLevel).length + 1
    setCategoryForm({
      name: '',
      level: defaultLevel,
      main_category: defaultMain,
      parent_id: isPresetGroup ? String(presetParentRow.id) : '',
      branch_id: isPresetGroup && presetParentRow.branch_id
        ? String(presetParentRow.branch_id)
        : (activeBranch && activeBranch !== 'All' ? String(activeBranch) : 'all'),
      sku_prefix: isPresetGroup && presetParentRow.sku_prefix
        ? presetParentRow.sku_prefix
        : (defaultMain === 'Appliances' ? 'APP' : 'FUR'),
      slug: '',
      sort_order: String(nextOrder),
      classification_scope: '',
      is_active: true,
    })
    resetCategoryMultiProducts()
    setCategoryModal({ mode: 'create', item: null })
  }

  const openEditCategory = (row) => {
    if (branches.length === 0) {
      loadBranches()
    }
    const resolvedMain = row.main_category || 'Furniture'
    setCategoryForm({
      name: row.name || '',
      level: row.level || 'group',
      main_category: resolvedMain,
      parent_id: row.parent_id ? String(row.parent_id) : '',
      branch_id: row.branch_id ? String(row.branch_id) : 'all',
      sku_prefix: row.sku_prefix || (resolvedMain === 'Appliances' ? 'APP' : 'FUR'),
      slug: row.slug || toCategorySlug(`${resolvedMain} ${row.name || ''}`),
      sort_order: String(row.sort_order ?? 1),
      classification_scope: row.scope || '',
      is_active: row.is_active !== false,
    })
    resetCategoryMultiProducts()
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

    const preparedNewProducts = []
    for (let i = 0; i < categoryNewProducts.length; i++) {
      const row = categoryNewProducts[i]
      const name = String(row.product_name || '').trim()
      const brand = String(row.brand || '').trim()
      const code = String(row.product_code || '').trim()
      const priceRaw = String(row.unit_price ?? '').trim()
      const costRaw = String(row.cost_price ?? '').trim()
      const stockRaw = String(row.stock_quantity ?? '').trim()
      const hasAnyData = Boolean(
        name || brand || code || priceRaw !== '' || costRaw !== '' || (stockRaw !== '' && stockRaw !== '0')
      )
      if (!hasAnyData) continue
      if (!name) {
        showToast(`Product Row #${i + 1}: Product Name is required`, 'error')
        return
      }
      if (priceRaw === '' || Number.isNaN(Number(priceRaw)) || Number(priceRaw) < 0) {
        showToast(`Product Row #${i + 1} ("${name}"): Enter a valid Unit Price`, 'error')
        return
      }
      if (costRaw !== '' && (Number.isNaN(Number(costRaw)) || Number(costRaw) < 0)) {
        showToast(`Product Row #${i + 1} ("${name}"): Enter a valid Cost Price`, 'error')
        return
      }
      if (stockRaw !== '' && (Number.isNaN(Number(stockRaw)) || Number(stockRaw) < 0)) {
        showToast(`Product Row #${i + 1} ("${name}"): Enter a valid Stock Quantity`, 'error')
        return
      }
      preparedNewProducts.push({
        product_name: name,
        product_code: code || undefined,
        brand: brand || undefined,
        unit_price: Number(priceRaw),
        cost_price: costRaw !== '' ? Number(costRaw) : 0,
        stock_quantity: stockRaw !== '' ? Math.floor(Number(stockRaw)) : 0,
        unit: String(row.unit || 'unit').trim() || 'unit',
        status: row.status === 'Inactive' ? 'Inactive' : 'Active',
      })
    }

    setSavingCategory(true)
    try {
      const payload = {
        name: categoryForm.name.trim(),
        level: categoryForm.level,
        main_category: categoryForm.main_category,
        parent_id: categoryForm.level === 'subcategory' && categoryForm.parent_id ? Number(categoryForm.parent_id) : null,
        branch_id: categoryForm.branch_id && categoryForm.branch_id !== 'all' && categoryForm.branch_id !== 'All'
          ? Number(categoryForm.branch_id)
          : 'all',
        sku_prefix: (categoryForm.sku_prefix || '').trim().toUpperCase() || undefined,
        slug: (categoryForm.slug || '').trim() || undefined,
        sort_order: categoryForm.sort_order !== '' && !Number.isNaN(Number(categoryForm.sort_order))
          ? Number(categoryForm.sort_order)
          : undefined,
        classification_scope: categoryForm.classification_scope.trim(),
        is_active: Boolean(categoryForm.is_active),
        new_products: preparedNewProducts.length > 0 ? preparedNewProducts : undefined,
        assign_product_ids: categoryAssignProductIds.length > 0 ? categoryAssignProductIds : undefined,
      }
      let res
      if (categoryModal?.mode === 'edit' && categoryModal.item) {
        res = await api.products.updateCategory(categoryModal.item.id, payload)
        showToast(res?.message || 'Category updated successfully', 'success')
      } else {
        res = await api.products.createCategory(payload)
        showToast(res?.message || 'Category created successfully', 'success')
      }
      setCategoryModal(null)
      resetCategoryMultiProducts()
      await Promise.all([loadCategories(), loadProducts('manual')])
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

    const matchedCatRow = normalizedCategoryRows.find(
      r => String(r.name || '').toLowerCase() === String(activeCatPrefill || '').toLowerCase()
    )
    const defaultProductBranch = activeBranch !== 'All'
      ? String(activeBranch)
      : (matchedCatRow?.branch_id ? String(matchedCatRow.branch_id) : 'all')

    setFormMainCategory(activeMain)
    setEditItem(null)
    setSkuManuallyEdited(false)
    setForm({
      ...emptyForm,
      product_code: getNextSkuPreview(activeCatPrefill, categoryTree, products, nextSkus),
      category: activeCatPrefill,
      branch_id: defaultProductBranch,
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
    let result = filterBySearch(products, deferredSearch, ['product_code', 'product_name', 'brand', 'category', 'main_category', 'category_group'])
    if (activeBranch && activeBranch !== 'All') {
      result = result.filter(p => !p.branch_id || String(p.branch_id) === String(activeBranch))
    }
    if (category && category !== 'All') {
      result = result.filter(p => matchesCategoryFilter(p, category, categoryTree))
    }
    return result
  }, [products, deferredSearch, activeBranch, category, categoryTree])

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
                        <th className="py-3.5 px-4 text-left">Branch</th>
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
                        const branchLabel = getCategoryBranchLabel(row)
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

                            <td className="py-3.5 px-4">
                              <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-muted/60 border border-border text-[11px] font-semibold text-foreground whitespace-nowrap">
                                {branchLabel}
                              </span>
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
      {viewCategoryModal && (() => {
        const vRow = viewCategoryModal.row
        const vSubs = viewCategoryModal.childSubs || []
        const vAssigned = viewCategoryModal.assigned || []
        const totalUnits = vAssigned.reduce((sum, p) => sum + (Number(p.stock_quantity) || 0), 0)
        const totalVal = vAssigned.reduce((sum, p) => sum + ((Number(p.discount_price || p.unit_price) || 0) * (Number(p.stock_quantity) || 0)), 0)
        const lowOrOutCount = vAssigned.filter(p => (Number(p.stock_quantity) || 0) <= 1).length

        return (
          <Modal
            isOpen={true}
            title={`Category Details — ${vRow.name}`}
            onClose={() => setViewCategoryModal(null)}
            size="lg"
          >
            <div className="space-y-4 text-xs">
              <div className="flex flex-wrap items-start justify-between gap-3 p-3.5 rounded-2xl bg-muted/20 border border-border">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold text-base shrink-0 ${getCategoryAvatarClass(vRow.main_category || vRow.name)}`}>
                    {(vRow.name || '?').trim().charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-sm text-foreground">{vRow.name}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5 flex flex-wrap items-center gap-1.5">
                      <span>{vRow.main_category}</span>
                      <span>•</span>
                      <span className="font-mono">ID #{vRow.id}</span>
                      <span>•</span>
                      <span className="font-mono">SKU: {vRow.sku_prefix || 'PRD'}</span>
                      <span>•</span>
                      <span>Order #{vRow.sort_order ?? 1}</span>
                      <span>•</span>
                      <span className="font-semibold text-foreground">{getCategoryBranchLabel(vRow)}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={vRow.is_active !== false ? 'Active' : 'Inactive'} />
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => {
                        setViewCategoryModal(null)
                        openEditCategory(vRow)
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary font-bold text-[11px] cursor-pointer"
                    >
                      <FiEdit className="w-3 h-3" />
                      <span>Edit</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-2.5 rounded-xl bg-card border border-border">
                  <span className="text-[10px] font-bold uppercase text-muted-foreground block">Assigned Products</span>
                  <div className="font-mono font-bold text-sm text-foreground mt-0.5">{vAssigned.length} items</div>
                </div>
                <div className="p-2.5 rounded-xl bg-card border border-border">
                  <span className="text-[10px] font-bold uppercase text-muted-foreground block">Sub-Categories</span>
                  <div className="font-mono font-bold text-sm text-foreground mt-0.5">{vSubs.length} groups</div>
                </div>
                <div className="p-2.5 rounded-xl bg-card border border-border">
                  <span className="text-[10px] font-bold uppercase text-muted-foreground block">Total Stock Units</span>
                  <div className="font-mono font-bold text-sm text-primary mt-0.5">
                    {totalUnits} units {lowOrOutCount > 0 ? `(${lowOrOutCount} low/out)` : ''}
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-card border border-border">
                  <span className="text-[10px] font-bold uppercase text-muted-foreground block">Inventory Value</span>
                  <div className="font-mono font-bold text-sm text-emerald-600 mt-0.5">{fmt(totalVal)}</div>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-card border border-border">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                  Classification / Merchandising Scope
                </span>
                <p className="text-foreground leading-relaxed">
                  {vRow.scope || 'No description provided.'}
                </p>
              </div>

              {vSubs.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block">
                    Sub-Categories ({vSubs.length})
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {vSubs.map((sub) => {
                      const subCnt = getCategoryAssignedProducts(sub.name).length
                      return (
                        <span
                          key={`view-sub-${sub.id}`}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-muted/50 border border-border text-[11px] font-semibold text-foreground"
                        >
                          <span>{sub.name}</span>
                          <span className="font-mono text-[10px] text-primary font-bold">({subCnt})</span>
                        </span>
                      )
                    })}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    Assigned Products ({vAssigned.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const catName = vRow.name
                      setViewCategoryModal(null)
                      navigate(`/products?category=${encodeURIComponent(catName)}`)
                    }}
                    className="text-xs font-bold text-primary hover:underline cursor-pointer"
                  >
                    Open in Inventory &rarr;
                  </button>
                </div>
                {vAssigned.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground border border-dashed border-border rounded-xl">
                    No products are currently assigned to this category.
                  </div>
                ) : (
                  <div className="max-h-48 overflow-y-auto divide-y divide-border rounded-xl border border-border">
                    {vAssigned.map((p) => (
                      <div key={`cat-prod-preview-${p.product_id}`} className="px-3.5 py-2 flex items-center justify-between gap-2 bg-card">
                        <div className="min-w-0">
                          <div className="font-semibold text-foreground truncate">{p.product_name}</div>
                          <div className="text-[10px] font-mono text-muted-foreground">
                            {p.product_code} · {p.category} · {p.stock_quantity} {p.unit || 'unit'}
                          </div>
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
        )
      })()}

      {/* Add / Edit Category Modal (Detailed) */}
      {categoryModal && (() => {
        const isEditMode = categoryModal.mode === 'edit' && Boolean(categoryModal.item)
        const editRow = categoryModal.item || null
        const targetCategoryName = (isEditMode ? (editRow?.name || categoryForm.name) : categoryForm.name).trim()
        const assignedProductsList = targetCategoryName ? getCategoryAssignedProducts(targetCategoryName) : []
        const childSubcategories = isEditMode && editRow
          ? normalizedCategoryRows.filter(r => Number(r.parent_id) === Number(editRow.id))
          : []
        const totalStockUnits = assignedProductsList.reduce((acc, p) => acc + (Number(p.stock_quantity) || 0), 0)
        const totalInventoryValue = assignedProductsList.reduce(
          (acc, p) => acc + ((Number(p.discount_price || p.unit_price) || 0) * (Number(p.stock_quantity) || 0)),
          0
        )
        const lowOrOutItems = assignedProductsList.filter(p => (Number(p.stock_quantity) || 0) <= 1).length
        const onSaleItems = assignedProductsList.filter(p => Number(p.discount_price) > 0).length
        const prices = assignedProductsList
          .map(p => Number(p.discount_price || p.unit_price) || 0)
          .filter(v => v > 0)
        const minPrice = prices.length > 0 ? Math.min(...prices) : 0
        const maxPrice = prices.length > 0 ? Math.max(...prices) : 0

        const selectedBranchObj = categoryForm.branch_id && categoryForm.branch_id !== 'all'
          ? branches.find(b => String(b.id) === String(categoryForm.branch_id))
          : null
        const selectedBranchLabel = selectedBranchObj
          ? `${selectedBranchObj.name || selectedBranchObj.branch}${selectedBranchObj.location ? ` (${selectedBranchObj.location})` : ''}`
          : 'All Branches (Global Catalog)'

        const parentGroupObj = categoryForm.level === 'subcategory' && categoryForm.parent_id
          ? normalizedCategoryRows.find(r => String(r.id) === String(categoryForm.parent_id))
          : null

        const hierarchyBreadcrumb = categoryForm.level === 'main'
          ? (categoryForm.name || 'Main Domain')
          : categoryForm.level === 'subcategory'
            ? `${categoryForm.main_category} › ${parentGroupObj?.name || 'Parent Group'} › ${categoryForm.name || 'Sub-Category'}`
            : `${categoryForm.main_category} › ${categoryForm.name || 'Category Group'}`

        const effectiveSkuPrefix = (categoryForm.sku_prefix || (categoryForm.main_category === 'Appliances' ? 'APP' : 'FUR')).toUpperCase()
        const effectiveSlug = categoryForm.slug || toCategorySlug(`${categoryForm.main_category} ${categoryForm.name || 'category'}`)

        const queuedNewProducts = categoryNewProducts.filter(r => String(r.product_name || '').trim() !== '')
        const queuedNewStock = queuedNewProducts.reduce((acc, r) => acc + (Math.max(0, Number(r.stock_quantity) || 0)), 0)
        const queuedNewValue = queuedNewProducts.reduce(
          (acc, r) => acc + ((Math.max(0, Number(r.unit_price) || 0)) * (Math.max(0, Number(r.stock_quantity) || 0))),
          0
        )
        const assignedProductIdSet = new Set(assignedProductsList.map(p => Number(p.product_id)))
        const existingSearchTerm = categoryExistingProductSearch.trim().toLowerCase()
        const filteredExistingProducts = products.filter(p => {
          if (!existingSearchTerm) return true
          return (
            String(p.product_name || '').toLowerCase().includes(existingSearchTerm) ||
            String(p.product_code || '').toLowerCase().includes(existingSearchTerm) ||
            String(p.brand || '').toLowerCase().includes(existingSearchTerm) ||
            String(p.category || '').toLowerCase().includes(existingSearchTerm)
          )
        })
        const selectedExistingProducts = products.filter(p => categoryAssignProductIds.includes(Number(p.product_id)))
        const totalQueuedMultiCount = queuedNewProducts.length + categoryAssignProductIds.length

        const scopeSuggestions = categoryForm.main_category === 'Appliances'
          ? [
              'Energy-efficient inverter & residential appliances with manufacturer warranty.',
              'Kitchen preparation, cooking, refrigeration, and smart home units.',
              'Climate comfort, cooling, ventilation, and air purification systems.',
              'Home entertainment, smart displays, and high-fidelity audio systems.',
            ]
          : [
              'Seating, surface furnishings, and media storage for communal living rooms.',
              'Solid wood bed frames, wardrobes, mattresses, and bedroom storage suites.',
              'Dining tables, upholstered chairs, buffet cabinets, and kitchen islands.',
              'Ergonomic office desks, executive mesh chairs, and modular shelving.',
            ]

        return (
          <Modal
            isOpen={true}
            title={isEditMode ? `Edit Category — ${editRow?.name}` : 'Add New Category'}
            onClose={() => setCategoryModal(null)}
            size="lg"
          >
            <form onSubmit={handleSaveCategory} className="space-y-4 text-xs">
              {/* Top Category Identity & Live Analytics Banner */}
              <div className="p-3.5 rounded-2xl bg-muted/25 border border-border space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold text-base shrink-0 shadow-2xs ${getCategoryAvatarClass(categoryForm.main_category || categoryForm.name)}`}>
                      {(categoryForm.name || '?').trim().charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-sm text-foreground truncate">
                          {categoryForm.name.trim() || 'Untitled Category'}
                        </span>
                        {isEditMode && editRow?.id && (
                          <span className="px-2 py-0.5 rounded-md bg-muted border border-border font-mono text-[10px] font-bold text-muted-foreground">
                            ID #{editRow.id}
                          </span>
                        )}
                        <span className="px-2 py-0.5 rounded-md bg-primary/10 border border-primary/20 font-mono text-[10px] font-bold text-primary">
                          SKU: {effectiveSkuPrefix}-XXX
                        </span>
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                        {hierarchyBreadcrumb}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1 font-semibold text-foreground bg-card px-2 py-0.5 rounded-md border border-border">
                          Branch: {selectedBranchLabel}
                        </span>
                        <span className="font-mono bg-card px-2 py-0.5 rounded-md border border-border">
                          /{effectiveSlug}
                        </span>
                        <span className="bg-card px-2 py-0.5 rounded-md border border-border font-semibold">
                          Sort Order #{categoryForm.sort_order || 1}
                        </span>
                      </div>
                    </div>
                  </div>
                  <StatusBadge status={categoryForm.is_active ? 'Active' : 'Inactive'} />
                </div>

                {/* Live Category Metrics Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                  <div className="p-2.5 rounded-xl bg-card border border-border">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                      Assigned Products
                    </span>
                    <div className="font-mono font-bold text-sm text-foreground mt-0.5">
                      {assignedProductsList.length} {assignedProductsList.length === 1 ? 'Product' : 'Products'}
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      {onSaleItems > 0 ? `${onSaleItems} currently on sale` : 'Active catalog items'}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-card border border-border">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                      {categoryForm.level === 'subcategory' ? 'Parent Group' : 'Sub-Categories'}
                    </span>
                    <div className="font-mono font-bold text-sm text-foreground mt-0.5 truncate">
                      {categoryForm.level === 'subcategory'
                        ? (parentGroupObj?.name || editRow?.group_name || '—')
                        : `${childSubcategories.length} Sub-Groups`}
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      {categoryForm.level === 'group'
                        ? 'Level 2 Category Group'
                        : categoryForm.level === 'subcategory'
                          ? 'Level 3 Sub-Category'
                          : 'Level 1 Main Domain'}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-card border border-border">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                      Total Stock Units
                    </span>
                    <div className="font-mono font-bold text-sm text-primary mt-0.5">
                      {totalStockUnits} Units
                    </div>
                    <span className={`text-[10px] ${lowOrOutItems > 0 ? 'text-amber-500 font-semibold' : 'text-muted-foreground'}`}>
                      {lowOrOutItems > 0 ? `${lowOrOutItems} low / out of stock` : 'Healthy stock levels'}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-card border border-border">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                      Category Value
                    </span>
                    <div className="font-mono font-bold text-sm text-emerald-600 mt-0.5">
                      {fmt(totalInventoryValue)}
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      {prices.length > 0 ? `${fmt(minPrice)} – ${fmt(maxPrice)}` : 'No priced items'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Section 1: Category Identity & Hierarchy */}
              <div className="p-3.5 rounded-2xl bg-card border border-border space-y-3">
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <div>
                    <h4 className="font-bold text-foreground text-xs uppercase tracking-wider">
                      1. Category Identity & Hierarchy
                    </h4>
                    <p className="text-[10px] text-muted-foreground">
                      Define the category display name, hierarchy level, and primary product domain.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-muted-foreground mb-1">Category Name *</label>
                    <input
                      type="text"
                      value={categoryForm.name}
                      onChange={e => {
                        const nextName = e.target.value
                        setCategoryForm(f => ({
                          ...f,
                          name: nextName,
                          slug: !isEditMode || !f.slug
                            ? toCategorySlug(`${f.main_category} ${nextName}`)
                            : f.slug,
                        }))
                      }}
                      placeholder="e.g. Living Room Furniture"
                      required
                      className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-semibold"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-muted-foreground mb-1">Hierarchy Level *</label>
                    <select
                      value={categoryForm.level}
                      disabled={isEditMode}
                      onChange={e => {
                        const nextLevel = e.target.value
                        const firstGrp = normalizedCategoryRows.find(
                          r => r.level === 'group' && r.main_category === categoryForm.main_category
                        )
                        setCategoryForm(f => ({
                          ...f,
                          level: nextLevel,
                          parent_id: nextLevel === 'subcategory' ? (f.parent_id || (firstGrp ? String(firstGrp.id) : '')) : '',
                        }))
                      }}
                      className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-semibold disabled:opacity-60"
                    >
                      <option value="group">Category Group (Level 2)</option>
                      <option value="subcategory">Sub-Category (Level 3)</option>
                      <option value="main">Main Domain (Level 1)</option>
                    </select>
                  </div>
                </div>

                {categoryForm.level !== 'main' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-muted-foreground mb-1">Main Category Domain *</label>
                      <select
                        value={categoryForm.main_category}
                        onChange={e => {
                          const nextMain = e.target.value
                          const firstGrp = normalizedCategoryRows.find(r => r.level === 'group' && r.main_category === nextMain)
                          setCategoryForm(f => ({
                            ...f,
                            main_category: nextMain,
                            sku_prefix: nextMain === 'Appliances' ? 'APP' : 'FUR',
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

                    {categoryForm.level === 'subcategory' ? (
                      <div>
                        <label className="block font-bold text-muted-foreground mb-1">Parent Category Group *</label>
                        <select
                          value={categoryForm.parent_id}
                          onChange={e => setCategoryForm(f => ({ ...f, parent_id: e.target.value }))}
                          className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-semibold"
                          required
                        >
                          <option value="">Select Parent Group</option>
                          {categoryGroupOptions.map((g) => (
                            <option key={`cat-form-grp-${g.id}`} value={String(g.id)}>{g.name}</option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <div>
                        <label className="block font-bold text-muted-foreground mb-1">Assigned Branch / Location *</label>
                        <select
                          value={categoryForm.branch_id || 'all'}
                          onChange={e => setCategoryForm(f => ({ ...f, branch_id: e.target.value }))}
                          className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-semibold"
                        >
                          <option value="all">All Branches (Global — Visible in All Branches)</option>
                          {branches.map(b => (
                            <option key={`cat-form-branch-${b.id}`} value={String(b.id)}>
                              {b.name || b.branch} {b.location ? `(${b.location})` : ''}
                            </option>
                          ))}
                        </select>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {(!categoryForm.branch_id || categoryForm.branch_id === 'all')
                            ? 'All products in this category will be visible across all store branches.'
                            : `Products in this category will be scoped to ${selectedBranchLabel}.`}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {categoryForm.level !== 'group' && (
                  <div>
                    <label className="block font-bold text-muted-foreground mb-1">Assigned Branch / Location *</label>
                    <select
                      value={categoryForm.branch_id || 'all'}
                      onChange={e => setCategoryForm(f => ({ ...f, branch_id: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-semibold"
                    >
                      <option value="all">All Branches (Global — Visible in All Branches)</option>
                      {branches.map(b => (
                        <option key={`cat-form-branch-sub-${b.id}`} value={String(b.id)}>
                          {b.name || b.branch} {b.location ? `(${b.location})` : ''}
                        </option>
                      ))}
                    </select>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {(!categoryForm.branch_id || categoryForm.branch_id === 'all')
                        ? 'All products in this category will be visible across all store branches.'
                        : `Products in this category will be scoped to ${selectedBranchLabel}.`}
                    </p>
                  </div>
                )}

                {/* Multiple Products Manager inside Category Identity & Hierarchy */}
                <div className="pt-3 mt-1 border-t border-border space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-foreground text-xs inline-flex items-center gap-1.5">
                          <FiPackage className="w-3.5 h-3.5 text-primary" />
                          Add Multiple Products
                        </span>
                        {totalQueuedMultiCount > 0 && (
                          <span className="px-2 py-0.5 rounded-full bg-primary/15 text-primary font-bold text-[10px]">
                            {totalQueuedMultiCount} Queued
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Create multiple new products under this category or bulk-assign existing catalog products on save.
                      </p>
                    </div>

                    <div className="inline-flex rounded-xl bg-muted/60 p-0.5 border border-border">
                      <button
                        type="button"
                        onClick={() => setCategoryMultiProductTab('new')}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                          categoryMultiProductTab === 'new'
                            ? 'bg-primary text-primary-foreground shadow-2xs'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        New Products {queuedNewProducts.length > 0 ? `(${queuedNewProducts.length})` : ''}
                      </button>
                      <button
                        type="button"
                        onClick={() => setCategoryMultiProductTab('existing')}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                          categoryMultiProductTab === 'existing'
                            ? 'bg-primary text-primary-foreground shadow-2xs'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        Assign Existing {categoryAssignProductIds.length > 0 ? `(${categoryAssignProductIds.length})` : ''}
                      </button>
                    </div>
                  </div>

                  {categoryMultiProductTab === 'new' ? (
                    <div className="space-y-2.5">
                      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                        {categoryNewProducts.map((row, idx) => (
                          <div
                            key={row.rowKey}
                            className="p-2.5 rounded-xl bg-muted/25 border border-border space-y-2"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1.5">
                                <span className="w-4 h-4 rounded-md bg-primary/15 text-primary flex items-center justify-center font-mono text-[10px]">
                                  {idx + 1}
                                </span>
                                Product #{idx + 1}
                              </span>
                              <button
                                type="button"
                                onClick={() => removeCategoryProductRow(row.rowKey)}
                                title="Remove product row"
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                              >
                                <FiTrash2 className="w-3 h-3" />
                                <span>Remove</span>
                              </button>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                              <div className="sm:col-span-5">
                                <label className="block text-[10px] font-bold text-muted-foreground mb-0.5">
                                  Product Name *
                                </label>
                                <input
                                  type="text"
                                  value={row.product_name}
                                  onChange={e => updateCategoryProductRow(row.rowKey, 'product_name', e.target.value)}
                                  placeholder="e.g. 3-Seater Fabric Sofa"
                                  className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-card text-foreground text-xs font-semibold"
                                />
                              </div>

                              <div className="sm:col-span-3">
                                <label className="block text-[10px] font-bold text-muted-foreground mb-0.5">
                                  Brand
                                </label>
                                <input
                                  type="text"
                                  value={row.brand}
                                  onChange={e => updateCategoryProductRow(row.rowKey, 'brand', e.target.value)}
                                  placeholder="e.g. Uratex"
                                  className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-card text-foreground text-xs"
                                />
                              </div>

                              <div className="sm:col-span-4">
                                <label className="block text-[10px] font-bold text-muted-foreground mb-0.5">
                                  SKU Code (Optional)
                                </label>
                                <input
                                  type="text"
                                  value={row.product_code}
                                  onChange={e => updateCategoryProductRow(row.rowKey, 'product_code', e.target.value)}
                                  placeholder={`Auto (${effectiveSkuPrefix}-XXX)`}
                                  className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-card text-foreground font-mono text-xs"
                                />
                              </div>

                              <div className="sm:col-span-3">
                                <label className="block text-[10px] font-bold text-muted-foreground mb-0.5">
                                  Unit Price (₱) *
                                </label>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={row.unit_price}
                                  onChange={e => updateCategoryProductRow(row.rowKey, 'unit_price', e.target.value)}
                                  placeholder="0.00"
                                  className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-card text-foreground font-mono text-xs font-semibold"
                                />
                              </div>

                              <div className="sm:col-span-3">
                                <label className="block text-[10px] font-bold text-muted-foreground mb-0.5">
                                  Cost Price (₱)
                                </label>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={row.cost_price}
                                  onChange={e => updateCategoryProductRow(row.rowKey, 'cost_price', e.target.value)}
                                  placeholder="0.00"
                                  className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-card text-foreground font-mono text-xs"
                                />
                              </div>

                              <div className="sm:col-span-2">
                                <label className="block text-[10px] font-bold text-muted-foreground mb-0.5">
                                  Stock Qty
                                </label>
                                <input
                                  type="number"
                                  min="0"
                                  step="1"
                                  value={row.stock_quantity}
                                  onChange={e => updateCategoryProductRow(row.rowKey, 'stock_quantity', e.target.value)}
                                  placeholder="0"
                                  className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-card text-foreground font-mono text-xs font-semibold"
                                />
                              </div>

                              <div className="sm:col-span-2">
                                <label className="block text-[10px] font-bold text-muted-foreground mb-0.5">
                                  Unit
                                </label>
                                <select
                                  value={row.unit}
                                  onChange={e => updateCategoryProductRow(row.rowKey, 'unit', e.target.value)}
                                  className="w-full px-2 py-1.5 rounded-lg border border-border bg-card text-foreground text-xs"
                                >
                                  {PRODUCT_UNIT_OPTIONS.map(u => (
                                    <option key={`${row.rowKey}-unit-${u.value}`} value={u.value}>
                                      {u.label}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div className="sm:col-span-2">
                                <label className="block text-[10px] font-bold text-muted-foreground mb-0.5">
                                  Status
                                </label>
                                <select
                                  value={row.status}
                                  onChange={e => updateCategoryProductRow(row.rowKey, 'status', e.target.value)}
                                  className="w-full px-2 py-1.5 rounded-lg border border-border bg-card text-foreground text-xs"
                                >
                                  <option value="Active">Active</option>
                                  <option value="Inactive">Inactive</option>
                                </select>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => addCategoryProductRow(1)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary font-bold text-[11px] border border-primary/20 transition-colors cursor-pointer"
                          >
                            <FiPlus className="w-3.5 h-3.5" />
                            <span>Add Another Product</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => addCategoryProductRow(3)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-muted/60 hover:bg-muted text-foreground font-semibold text-[11px] border border-border transition-colors cursor-pointer"
                          >
                            <FiPlus className="w-3 h-3" />
                            <span>Add 3 Rows</span>
                          </button>
                        </div>

                        {queuedNewProducts.length > 0 && (
                          <div className="text-[11px] text-muted-foreground font-medium">
                            Ready to add: <span className="font-bold text-foreground">{queuedNewProducts.length}</span> {queuedNewProducts.length === 1 ? 'product' : 'products'} •{' '}
                            <span className="font-mono font-bold text-primary">{queuedNewStock}</span> units •{' '}
                            <span className="font-mono font-bold text-emerald-600">{fmt(queuedNewValue)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="relative flex-1 min-w-[200px]">
                          <FiSearch className="w-3.5 h-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            value={categoryExistingProductSearch}
                            onChange={e => setCategoryExistingProductSearch(e.target.value)}
                            placeholder="Search existing products by name, SKU, brand, or category..."
                            className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-border bg-card text-foreground text-xs"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const visibleIds = filteredExistingProducts
                              .filter(p => !assignedProductIdSet.has(Number(p.product_id)))
                              .map(p => Number(p.product_id))
                            setCategoryAssignProductIds(prev => Array.from(new Set([...prev, ...visibleIds])))
                          }}
                          className="px-2.5 py-1.5 rounded-xl border border-border bg-muted/50 hover:bg-muted text-[11px] font-bold text-foreground cursor-pointer"
                        >
                          Select Visible
                        </button>
                        {categoryAssignProductIds.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setCategoryAssignProductIds([])}
                            className="px-2.5 py-1.5 rounded-xl border border-destructive/20 bg-destructive/10 hover:bg-destructive/20 text-[11px] font-bold text-destructive cursor-pointer"
                          >
                            Clear ({categoryAssignProductIds.length})
                          </button>
                        )}
                      </div>

                      {selectedExistingProducts.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 p-2 rounded-xl bg-primary/5 border border-primary/15">
                          {selectedExistingProducts.map(p => (
                            <span
                              key={`sel-assign-${p.product_id}`}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-card border border-primary/30 text-[10px] font-semibold text-foreground"
                            >
                              <span className="truncate max-w-[160px]">{p.product_name}</span>
                              <button
                                type="button"
                                onClick={() => toggleAssignProductId(p.product_id)}
                                className="text-muted-foreground hover:text-destructive cursor-pointer"
                              >
                                <FiX className="w-3 h-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="max-h-52 overflow-y-auto rounded-xl border border-border divide-y divide-border bg-card">
                        {filteredExistingProducts.length === 0 ? (
                          <div className="p-4 text-center text-[11px] text-muted-foreground">
                            No matching products found.
                          </div>
                        ) : (
                          filteredExistingProducts.slice(0, 80).map(p => {
                            const pid = Number(p.product_id)
                            const isChecked = categoryAssignProductIds.includes(pid)
                            const alreadyInCategory = assignedProductIdSet.has(pid)
                            return (
                              <label
                                key={`assign-opt-${pid}`}
                                className={`flex items-center justify-between gap-2.5 px-3 py-2 text-xs transition-colors ${
                                  alreadyInCategory
                                    ? 'bg-muted/20 opacity-65 cursor-default'
                                    : isChecked
                                      ? 'bg-primary/10 cursor-pointer'
                                      : 'hover:bg-muted/30 cursor-pointer'
                                }`}
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <input
                                    type="checkbox"
                                    disabled={alreadyInCategory}
                                    checked={alreadyInCategory || isChecked}
                                    onChange={() => !alreadyInCategory && toggleAssignProductId(pid)}
                                    className="rounded border-border text-primary focus:ring-primary"
                                  />
                                  <div className="min-w-0">
                                    <div className="font-semibold text-foreground truncate flex items-center gap-1.5">
                                      <span className="truncate">{p.product_name}</span>
                                      {alreadyInCategory && (
                                        <span className="px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-600 text-[9px] font-bold shrink-0">
                                          Already Assigned
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-[10px] text-muted-foreground truncate">
                                      SKU: <span className="font-mono">{p.product_code || '—'}</span> • Current: {p.category || 'Uncategorized'}
                                      {p.brand ? ` • ${p.brand}` : ''}
                                    </div>
                                  </div>
                                </div>
                                <div className="text-right shrink-0">
                                  <div className="font-mono font-bold text-foreground">{fmt(p.unit_price)}</div>
                                  <div className="text-[10px] text-muted-foreground">Stock: {p.stock_quantity ?? 0}</div>
                                </div>
                              </label>
                            )
                          })
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Section 2: Cataloging, SKU & Storefront Configuration */}
              <div className="p-3.5 rounded-2xl bg-card border border-border space-y-3">
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <div>
                    <h4 className="font-bold text-foreground text-xs uppercase tracking-wider">
                      2. Cataloging, SKU & Display Configuration
                    </h4>
                    <p className="text-[10px] text-muted-foreground">
                      Configure automatic SKU code prefixing, storefront slug identifier, display order, and active status.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block font-bold text-muted-foreground mb-1">SKU Prefix</label>
                    <input
                      type="text"
                      maxLength={10}
                      value={categoryForm.sku_prefix}
                      onChange={e => setCategoryForm(f => ({ ...f, sku_prefix: e.target.value.toUpperCase() }))}
                      placeholder="e.g. FUR"
                      className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-mono font-bold uppercase"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-muted-foreground mb-1">Display Sort Order</label>
                    <input
                      type="number"
                      min="0"
                      max="9999"
                      value={categoryForm.sort_order}
                      onChange={e => setCategoryForm(f => ({ ...f, sort_order: e.target.value }))}
                      placeholder="1"
                      className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-mono font-semibold"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block font-bold text-muted-foreground mb-1">Status *</label>
                    <select
                      value={categoryForm.is_active ? 'Active' : 'Inactive'}
                      onChange={e => setCategoryForm(f => ({ ...f, is_active: e.target.value === 'Active' }))}
                      className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-semibold"
                    >
                      <option value="Active">Active — Visible in Inventory, POS & Storefront</option>
                      <option value="Inactive">Inactive — Hidden from Active Catalog</option>
                    </select>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-bold text-muted-foreground">Catalog Slug / Identifier</label>
                    <button
                      type="button"
                      onClick={() =>
                        setCategoryForm(f => ({
                          ...f,
                          slug: toCategorySlug(`${f.main_category} ${f.name}`),
                        }))
                      }
                      className="text-[10px] font-bold text-primary hover:underline cursor-pointer"
                    >
                      Auto-Generate from Name
                    </button>
                  </div>
                  <input
                    type="text"
                    value={categoryForm.slug}
                    onChange={e => setCategoryForm(f => ({ ...f, slug: toCategorySlug(e.target.value) }))}
                    placeholder="e.g. furniture-living-room-furniture"
                    className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-mono text-[11px]"
                  />
                </div>
              </div>

              {/* Section 3: Description & Merchandising Scope */}
              <div className="p-3.5 rounded-2xl bg-card border border-border space-y-2.5">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="block font-bold text-foreground text-xs uppercase tracking-wider">
                      3. Description / Classification Scope
                    </label>
                    <p className="text-[10px] text-muted-foreground">
                      Explain what product lines, styles, or specifications belong under this category.
                    </p>
                  </div>
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {(categoryForm.classification_scope || '').length}/500
                  </span>
                </div>

                <textarea
                  rows={3}
                  maxLength={500}
                  value={categoryForm.classification_scope}
                  onChange={e => setCategoryForm(f => ({ ...f, classification_scope: e.target.value }))}
                  placeholder="Describe what belongs under this category..."
                  className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground leading-relaxed"
                />

                <div className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                    Quick Scope Templates (Click to Apply):
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {scopeSuggestions.map((tpl, i) => (
                      <button
                        key={`scope-tpl-${i}`}
                        type="button"
                        onClick={() => setCategoryForm(f => ({ ...f, classification_scope: tpl }))}
                        className="px-2.5 py-1 rounded-lg bg-muted/50 hover:bg-muted border border-border text-[10px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer text-left truncate max-w-full"
                      >
                        + {tpl}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Section 4 (Edit Mode): Sub-Categories & Assigned Products Breakdown */}
              {isEditMode && (
                <div className="p-3.5 rounded-2xl bg-card border border-border space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
                    <div>
                      <h4 className="font-bold text-foreground text-xs uppercase tracking-wider">
                        4. Linked Sub-Categories & Assigned Inventory
                      </h4>
                      <p className="text-[10px] text-muted-foreground">
                        Inspect child sub-categories and products currently mapped to {editRow?.name}.
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {categoryForm.level === 'group' && (
                        <button
                          type="button"
                          onClick={() => openCreateCategory(editRow)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary font-bold text-[11px] cursor-pointer"
                        >
                          <FiPlus className="w-3 h-3" />
                          <span>Add Sub-Category</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setCategoryModal(null)
                          openAssignedProductsModal(editRow)
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 font-bold text-[11px] cursor-pointer"
                      >
                        <FiBox className="w-3 h-3" />
                        <span>Manage Products ({assignedProductsList.length})</span>
                      </button>
                    </div>
                  </div>

                  {categoryForm.level !== 'subcategory' && (
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                        Child Sub-Categories ({childSubcategories.length})
                      </span>
                      {childSubcategories.length === 0 ? (
                        <div className="p-3 rounded-xl border border-dashed border-border text-center text-muted-foreground text-[11px]">
                          No sub-categories under this group yet.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-36 overflow-y-auto pr-1">
                          {childSubcategories.map((sub) => {
                            const subCount = getCategoryAssignedProducts(sub.name).length
                            return (
                              <div
                                key={`edit-cat-sub-${sub.id}`}
                                className="px-3 py-2 rounded-xl bg-muted/30 border border-border flex items-center justify-between gap-2"
                              >
                                <div className="min-w-0">
                                  <div className="font-semibold text-foreground truncate">{sub.name}</div>
                                  <div className="text-[10px] text-muted-foreground">
                                    {subCount} {subCount === 1 ? 'Product' : 'Products'} • {getCategoryBranchLabel(sub)}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => openEditCategory(sub)}
                                  title={`Switch to editing ${sub.name}`}
                                  className="px-2 py-1 rounded-lg border border-border bg-card hover:bg-muted text-[10px] font-bold text-foreground shrink-0 cursor-pointer"
                                >
                                  Edit
                                </button>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Top 4 Assigned Products Preview */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        Assigned Products Preview ({assignedProductsList.length})
                      </span>
                      {canManage && (
                        <button
                          type="button"
                          onClick={() => {
                            const targetCat = editRow?.name
                            setCategoryModal(null)
                            openAdd(targetCat)
                          }}
                          className="text-[11px] font-bold text-primary hover:underline cursor-pointer"
                        >
                          + Add Product to {editRow?.name}
                        </button>
                      )}
                    </div>

                    {assignedProductsList.length === 0 ? (
                      <div className="p-3 rounded-xl border border-dashed border-border text-center text-muted-foreground text-[11px]">
                        No products currently assigned to this category.
                      </div>
                    ) : (
                      <div className="divide-y divide-border rounded-xl border border-border overflow-hidden bg-muted/15">
                        {assignedProductsList.slice(0, 4).map((p) => (
                          <div
                            key={`edit-cat-prod-${p.product_id}`}
                            className="px-3 py-2 flex items-center justify-between gap-2 bg-card"
                          >
                            <div className="min-w-0">
                              <div className="font-semibold text-foreground truncate">{p.product_name}</div>
                              <div className="text-[10px] font-mono text-muted-foreground">
                                {p.product_code}{p.brand ? ` · ${p.brand}` : ''} · Stock: {p.stock_quantity} {p.unit || 'unit'}
                              </div>
                            </div>
                            <span className="font-mono font-bold text-emerald-600 shrink-0">
                              {fmt(p.discount_price || p.unit_price)}
                            </span>
                          </div>
                        ))}
                        {assignedProductsList.length > 4 && (
                          <button
                            type="button"
                            onClick={() => {
                              setCategoryModal(null)
                              openAssignedProductsModal(editRow)
                            }}
                            className="w-full py-2 text-center text-[11px] font-bold text-primary hover:bg-muted/40 transition-colors cursor-pointer"
                          >
                            View all {assignedProductsList.length} products in {editRow?.name} &rarr;
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-3 border-t border-border">
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
                  <span>{savingCategory ? 'Saving...' : (isEditMode ? 'Save Changes' : 'Create Category')}</span>
                </button>
              </div>
            </form>
          </Modal>
        )
      })()}

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
