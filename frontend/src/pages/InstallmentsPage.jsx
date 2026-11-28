import { useState, useEffect, useMemo, useRef, useDeferredValue } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  FiPlus, FiSearch, FiEye, FiEdit, FiTrash2,
  FiCalendar, FiUser, FiCreditCard, FiAlertTriangle, FiCheckCircle,
  FiX, FiPhone, FiMapPin, FiPackage, FiPercent, FiFileText,
  FiClock, FiPrinter, FiFilter, FiInfo, FiLayers, FiAward, FiShield
} from 'react-icons/fi'
import {
  Btn, Badge, StatusBadge, Modal, PageHeader, StatCard, Card,
  CardHeader, ProgressBar, Pagination, showToast, TabBar,
  LoadingState, ErrorAlert, TableSkeleton, EmptyState, confirmAction
} from '../components/ui'
import { fmt, fmtDate, fastDeepEqual } from '../lib/utils'
import { useAuth } from '../context/AuthContext'
import api, { downloadCsv, peekApiCache } from '../lib/api'
import { useRealtimeSync, triggerDataSync, SyncButton } from '../lib/realtimeSync'
import { TbCurrencyPeso } from 'react-icons/tb'
import { FiDownload } from 'react-icons/fi'
import AgentAssignmentSection from '../components/AgentAssignmentSection'
import { summarizeAgentContributions, resolveCategoryDomain } from '../lib/agentContribution'
import InstallmentClearanceModal from '../components/installments/InstallmentClearanceModal'

const isFullyPaidAccount = (inst) => {
  const st = String(inst?.status || '').trim().toLowerCase()
  return st === 'fully paid' || st === 'completed' || st === 'complete payment' || Number(inst?.balance ?? 1) <= 0
}

const formatInstallmentProof = (path) => {
  if (!path) return null
  if (path.startsWith('http://') || path.startsWith('https://')) {
    const idx = path.indexOf('/storage/')
    return idx !== -1 ? path.substring(idx) : path
  }
  const clean = path.startsWith('/') ? path.slice(1) : path
  return clean.startsWith('storage/') ? `/${clean}` : `/storage/${clean}`
}

const escHtml = (val) => String(val ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')

const printInstallmentStatement = (detail) => {
  const acc = detail?.account
  if (!acc) return

  const itemsRows = (detail.sale_items || []).map(item => `
    <tr>
      <td>${escHtml(item.product_code || 'SKU')}</td>
      <td>${escHtml(item.product_name || 'Product')}</td>
      <td class="num">${escHtml(item.quantity ?? 1)}</td>
      <td class="num">${escHtml(fmt(item.unit_price || 0))}</td>
      <td class="num"><strong>${escHtml(fmt(item.line_total || 0))}</strong></td>
    </tr>
  `).join('')

  const schedRows = (detail.schedules || []).map(s => `
    <tr>
      <td>#${escHtml(s.installment_no)}</td>
      <td>${escHtml(s.due_date || '—')}</td>
      <td class="num">${escHtml(fmt(s.amount_due || 0))}</td>
      <td class="num">${escHtml(fmt(s.amount_paid || 0))}</td>
      <td class="num">${escHtml(fmt(s.balance_due || 0))}</td>
      <td>${escHtml(s.status || 'Pending')}</td>
    </tr>
  `).join('')

  const payRows = (detail.payments || []).length === 0
    ? '<tr><td colspan="7" style="text-align:center;color:#64748b;">No payments recorded yet</td></tr>'
    : (detail.payments || []).map(p => `
      <tr>
        <td>${escHtml(p.receipt_no || '—')}</td>
        <td>${escHtml(p.payment_date || '—')}</td>
        <td class="num">${escHtml(fmt(p.amount || 0))}</td>
        <td>${escHtml(p.payment_method || '—')}</td>
        <td>${escHtml(p.reference_no || '—')}</td>
        <td>${escHtml(p.status || 'Completed')}</td>
        <td>${escHtml(p.received_by || '—')}</td>
      </tr>
    `).join('')

  const html = `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>Installment Statement - ${escHtml(acc.account_no)}</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: system-ui, -apple-system, Segoe UI, sans-serif; color: #0f172a; margin: 24px; font-size: 12px; }
        h1 { font-size: 18px; margin: 0 0 4px; }
        .sub { color: #475569; margin: 0 0 16px; }
        .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px; }
        .card { border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px 10px; background: #f8fafc; }
        .lbl { font-size: 10px; text-transform: uppercase; color: #64748b; font-weight: 700; }
        .val { font-size: 13px; font-weight: 700; margin-top: 2px; font-family: ui-monospace, monospace; }
        .meta { display: flex; justify-content: space-between; border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px 12px; margin-bottom: 16px; }
        h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .04em; color: #334155; margin: 14px 0 6px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
        th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; }
        th { background: #f1f5f9; font-size: 11px; text-transform: uppercase; color: #475569; }
        .num { text-align: right; font-family: ui-monospace, monospace; }
        @media print { body { margin: 12px; } }
      </style>
    </head>
    <body>
      <h1>Z-LICZ Customer Installment Statement</h1>
      <p class="sub">Account ${escHtml(acc.account_no)} • Status: ${escHtml(Number(acc.balance) <= 0 ? 'Complete Payment' : acc.status)} • Printed ${escHtml(new Date().toLocaleDateString())}</p>
      <div class="meta">
        <div>
          <div><strong>Customer:</strong> ${escHtml(acc.customer_name)} ${acc.customer_code ? `(${escHtml(acc.customer_code)})` : ''}</div>
          <div><strong>Phone:</strong> ${escHtml(acc.customer_phone || '—')} • <strong>Email:</strong> ${escHtml(acc.customer_email || '—')}</div>
          <div><strong>Address:</strong> ${escHtml(acc.customer_address || '—')}</div>
        </div>
        <div style="text-align:right">
          <div><strong>Branch:</strong> ${escHtml(acc.branch_name || acc.branch || '—')}</div>
          <div><strong>Invoice #:</strong> ${escHtml(acc.invoice_no || 'N/A')} • <strong>Start Date:</strong> ${escHtml(acc.start_date || '—')}</div>
          <div><strong>Processed By:</strong> ${escHtml(acc.store_admin || '—')}</div>
        </div>
      </div>
      <div class="grid">
        <div class="card"><div class="lbl">Principal / Price</div><div class="val">${escHtml(fmt(acc.principal_amount || 0))}</div></div>
        <div class="card"><div class="lbl">Down Payment</div><div class="val">${escHtml(fmt(acc.down_payment || 0))}</div></div>
        <div class="card"><div class="lbl">Interest (${escHtml(acc.interest_rate || 0)}%)</div><div class="val">${escHtml(fmt(acc.interest_amount || 0))}</div></div>
        <div class="card"><div class="lbl">Total Payable</div><div class="val">${escHtml(fmt(acc.total_payable || 0))}</div></div>
        <div class="card"><div class="lbl">Confirmed Paid</div><div class="val">${escHtml(fmt(acc.paid || 0))}</div></div>
        <div class="card"><div class="lbl">Remaining Balance</div><div class="val">${escHtml(fmt(acc.balance || 0))}</div></div>
        <div class="card"><div class="lbl">Amortization (${escHtml(acc.frequency || 'Monthly')})</div><div class="val">${escHtml(fmt(acc.installment_amount || 0))}</div></div>
        <div class="card"><div class="lbl">Terms</div><div class="val">${escHtml(`${acc.paid_installments ?? 0} / ${acc.total_terms ?? acc.number_of_installments ?? 0}`)}</div></div>
      </div>
      ${itemsRows ? `<h2>Purchased Items</h2><table><thead><tr><th>SKU</th><th>Product</th><th class="num">Qty</th><th class="num">Unit Price</th><th class="num">Line Total</th></tr></thead><tbody>${itemsRows}</tbody></table>` : ''}
      <h2>Amortization Schedule</h2>
      <table><thead><tr><th>#</th><th>Due Date</th><th class="num">Amount Due</th><th class="num">Paid</th><th class="num">Balance</th><th>Status</th></tr></thead><tbody>${schedRows}</tbody></table>
      <h2>Payment History</h2>
      <table><thead><tr><th>Receipt #</th><th>Date</th><th class="num">Amount</th><th>Method</th><th>Ref #</th><th>Status</th><th>Staff</th></tr></thead><tbody>${payRows}</tbody></table>
    </body>
  </html>`

  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  document.body.appendChild(iframe)
  const doc = iframe.contentWindow.document
  doc.open()
  doc.write(html)
  doc.close()
  iframe.contentWindow.focus()
  setTimeout(() => {
    iframe.contentWindow.print()
    setTimeout(() => document.body.removeChild(iframe), 1000)
  }, 150)
}

export default function InstallmentsPage({ branchFilter: propBranchFilter, embedded }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const { user } = useAuth()
  const isStoreAdmin = user?.role === 'Store Administrator' || user?.role === 'Store Admin'
  const isAdmin = user?.role === 'Administrator'

  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'active')
  const [clearanceModal, setClearanceModal] = useState(null)
  const [installments, setInstallments] = useState(() => {
    const cached = peekApiCache('/installments')
    return Array.isArray(cached?.installments) ? cached.installments : []
  })
  const [customers, setCustomers] = useState(() => {
    const cached = peekApiCache('/customers')
    if (Array.isArray(cached?.customers)) return cached.customers
    try {
      const saved = sessionStorage.getItem('pace_cached_customers')
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })
  const [products, setProducts] = useState(() => {
    const cached = peekApiCache('/products')
    if (Array.isArray(cached?.products)) return cached.products
    try {
      const saved = sessionStorage.getItem('pace_cached_products')
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })
  const [branches, setBranches] = useState(() => {
    const cached = peekApiCache('/branches')
    if (Array.isArray(cached)) return cached
    if (Array.isArray(cached?.branches)) return cached.branches
    try {
      const saved = sessionStorage.getItem('pace_cached_branches')
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })
  const [loading, setLoading] = useState(() => {
    return !Array.isArray(peekApiCache('/installments')?.installments)
  })
  const [error, setError] = useState('')

  // Filters (Immediate reactive search & status)
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [statusFilter, setStatusFilter] = useState('All')
  const [localBranchFilter, setLocalBranchFilter] = useState(isStoreAdmin ? (user?.employee?.branch?.name || (typeof user?.employee?.branch === 'string' ? user.employee.branch : '')) : 'All')
  const branchFilter = propBranchFilter || localBranchFilter
  const [page, setPage] = useState(1)
  const pageSize = 10

  // Modals state
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [editModalItem, setEditModalItem] = useState(null)
  const [detailItem, setDetailItem] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailTab, setDetailTab] = useState('schedules')
  const [payModalItem, setPayModalItem] = useState(null)
  const [saving, setSaving] = useState(false)

  const initialAddForm = {
    customer_mode: 'existing',
    customer_id: '',
    first_name: '',
    last_name: '',
    phone: '',
    email: '',
    address: '',

    product_mode: 'catalog',
    main_category: '',
    product_category: '',
    product_id: '',
    product_name: '',
    principal_amount: '',
    quantity: '1',
    discount_amount: '0',
    has_agent: false,
    agent_id: '',
    down_payment: '0',
    interest_rate: '10',
    number_of_installments: '6',
    frequency: 'Monthly',
    start_date: new Date().toISOString().slice(0, 10),
    due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    status: 'Active',
    notes: '',
  }
  const [addForm, setAddForm] = useState(initialAddForm)
  const [salesAgents, setSalesAgents] = useState([])
  const [loadingAgents, setLoadingAgents] = useState(false)
  const [agentsError, setAgentsError] = useState('')
  const agentCacheRef = useRef({})

  // ─── EDIT FORM STATE ────────────────────────────────────────────────────────
  const [editForm, setEditForm] = useState({
    status: 'Active',
    phone: '',
    address: '',
    installment_amount: '',
    notes: '',
  })

  // ─── PAYMENT FORM STATE ─────────────────────────────────────────────────────
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState('Cash')
  const [payRef, setPayRef] = useState('')
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10))
  const [payNotes, setPayNotes] = useState('')

  const inFlightRef = useRef(false)
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  // ─── INITIAL DATA LOAD (strictly active installment list; modal catalogs load on-demand) ──
  const loadInitialData = async (silent = false, signal) => {
    // Allow explicit mount/filter loads to run even when React StrictMode aborts the first pass
    if (inFlightRef.current && silent) return
    inFlightRef.current = true

    const isBg = silent || installments.length > 0
    if (!isBg) setLoading(true)
    if (!isBg) setError('')
    try {
      const reqOpts = signal ? { signal } : {}
      const needBranches = branches.length === 0

      const promises = [
        api.installments.getAll({
          branch: branchFilter !== 'All' ? branchFilter : undefined,
        }, reqOpts)
      ]

      if (needBranches) {
        promises.push(api.branches.getAll(reqOpts).catch(() => []))
      }

      const results = await Promise.all(promises)
      if (!isMountedRef.current || signal?.aborted) return

      const instRes = results[0]
      if (instRes && Array.isArray(instRes.installments)) {
        const newInst = instRes.installments
        setInstallments(prev => fastDeepEqual(prev, newInst) ? prev : newInst)
        try {
          if (branchFilter === 'All') {
            sessionStorage.setItem('pace_cached_installments', JSON.stringify(newInst))
          }
        } catch { }
      }

      const activeDetailId = detailItem?.account?.installment_id || detailItem?.installment_id
      if (activeDetailId && isBg) {
        api.installments.getById(activeDetailId)
          .then(d => {
            if (!isMountedRef.current || !d) return
            setDetailItem(prev => (!prev || fastDeepEqual(prev, d)) ? prev : d)
          })
          .catch(() => {})
      }

      if (needBranches && results.length >= 2) {
        const branchRes = results[1]
        const extractedBranches = Array.isArray(branchRes) ? branchRes : (Array.isArray(branchRes?.branches) ? branchRes.branches : null)
        if (extractedBranches) {
          setBranches(prev => fastDeepEqual(prev, extractedBranches) ? prev : extractedBranches)
        }
      }
    } catch (err) {
      if (!isMountedRef.current || signal?.aborted || err?.name === 'AbortError') return
      console.error('Failed to load installment data:', err)
      if (!isBg) setError(err.message || 'Failed to fetch customer installment records')
    } finally {
      if (!signal?.aborted) {
        inFlightRef.current = false
        if (!isBg && isMountedRef.current) setLoading(false)
      }
    }
  }

  // Lazy-load customers and products only when opening the Create Installment modal
  useEffect(() => {
    if (!addModalOpen) return
    Promise.all([
      customers.length === 0 ? api.customers.getAll().catch(() => ({ customers: [] })) : Promise.resolve(null),
      products.length === 0 ? api.products.getAll().catch(() => ({ products: [] })) : Promise.resolve(null),
    ]).then(([custRes, prodRes]) => {
      if (!isMountedRef.current) return
      if (custRes && Array.isArray(custRes.customers)) {
        setCustomers(prev => fastDeepEqual(prev, custRes.customers) ? prev : custRes.customers)
      }
      if (prodRes && Array.isArray(prodRes.products)) {
        setProducts(prev => fastDeepEqual(prev, prodRes.products) ? prev : prodRes.products)
      }
    }).catch(() => {})
  }, [addModalOpen])

  useEffect(() => {
    const controller = new AbortController()
    loadInitialData(false, controller.signal)
    return () => controller.abort()
  }, [branchFilter])

  // On-demand click-driven synchronization
  const { sync: syncInstallments, isSyncing: isSyncingInstallments } = useRealtimeSync(
    (_, signal) => loadInitialData(false, signal),
    [],
    { module: 'installments' }
  )

  useEffect(() => {
    const id = searchParams.get('id')
    if (id) {
      openDetail({ installment_id: id })
    }
  }, [searchParams])

  const calculatedAddValues = useMemo(() => {
    const unitPrice = parseFloat(addForm.principal_amount) || 0
    const qty = Math.max(1, parseInt(addForm.quantity, 10) || 1)
    const grossPrice = Math.round(unitPrice * qty * 100) / 100
    const discount = Math.min(grossPrice, Math.max(0, parseFloat(addForm.discount_amount) || 0))
    const price = Math.max(0, Math.round((grossPrice - discount) * 100) / 100)
    const down = parseFloat(addForm.down_payment) || 0
    const rate = parseFloat(addForm.interest_rate) || 0
    const isOpenContract = addForm.number_of_installments === 'open' || addForm.number_of_installments === '0'
    const terms = isOpenContract ? 0 : (parseInt(addForm.number_of_installments, 10) || 1)

    const financed = Math.max(0, price - down)
    const interestAmt = Math.round(financed * (rate / 100) * 100) / 100
    const totalPayable = Math.round((price + interestAmt) * 100) / 100
    const outstanding = Math.max(0, Math.round((totalPayable - down) * 100) / 100)
    const monthlyAmt = !isOpenContract && terms > 0 ? Math.round((outstanding / terms) * 100) / 100 : 0

    let estimatedEndDate = null
    if (!isOpenContract && terms > 0 && addForm.due_date) {
      const base = new Date(`${addForm.due_date}T00:00:00`)
      if (!Number.isNaN(base.getTime())) {
        const end = new Date(base.getTime())
        if (addForm.frequency === 'Weekly') {
          end.setDate(end.getDate() + (terms - 1) * 7)
        } else if (addForm.frequency === 'Bi-weekly') {
          end.setDate(end.getDate() + (terms - 1) * 14)
        } else {
          end.setMonth(end.getMonth() + (terms - 1))
        }
        estimatedEndDate = end.toISOString().slice(0, 10)
      }
    }

    return {
      unitPrice,
      qty,
      grossPrice,
      discount,
      price,
      down,
      rate,
      isOpenContract,
      terms,
      financed,
      interestAmt,
      totalPayable,
      outstanding,
      monthlyAmt,
      estimatedEndDate,
    }
  }, [
    addForm.principal_amount,
    addForm.quantity,
    addForm.discount_amount,
    addForm.down_payment,
    addForm.interest_rate,
    addForm.number_of_installments,
    addForm.frequency,
    addForm.due_date,
  ])

  const selectedAddProduct = useMemo(
    () => products.find(p => String(p.product_id) === String(addForm.product_id)) || null,
    [products, addForm.product_id]
  )

  const selectedAddCustomer = useMemo(
    () => customers.find(c => String(c.customer_id) === String(addForm.customer_id)) || null,
    [customers, addForm.customer_id]
  )

  const installmentAgentSummary = useMemo(() => {
    if (!addForm.has_agent) {
      return summarizeAgentContributions([], false)
    }
    return summarizeAgentContributions(
      [{
        netLineTotal: calculatedAddValues.price,
        product: selectedAddProduct,
        category: addForm.product_category || addForm.main_category || selectedAddProduct?.category || '',
      }],
      true
    )
  }, [addForm.has_agent, calculatedAddValues.price, selectedAddProduct, addForm.product_category, addForm.main_category])

  const resolvedInstallmentCategoryDomain = useMemo(
    () => resolveCategoryDomain(selectedAddProduct || addForm.product_category || addForm.main_category),
    [selectedAddProduct, addForm.product_category, addForm.main_category]
  )

  const getProductCatLabel = (p) => p?.category || p?.category_group || p?.main_category || 'Uncategorized'

  const getProductMainCategory = (p) => {
    const raw = p?.main_category || resolveCategoryDomain(p) || ''
    if (String(raw).toLowerCase().includes('appliance')) return 'Appliances'
    if (String(raw).toLowerCase().includes('furniture')) return 'Furniture'
    return ''
  }

  const mainCategoryCounts = useMemo(() => {
    let appliances = 0
    let furniture = 0
    products.forEach(p => {
      const m = getProductMainCategory(p)
      if (m === 'Appliances') appliances++
      else if (m === 'Furniture') furniture++
    })
    return { Appliances: appliances, Furniture: furniture }
  }, [products])

  const productCategories = useMemo(() => {
    const counts = new Map()
    products.forEach(p => {
      if (addForm.main_category && getProductMainCategory(p) !== addForm.main_category) return
      const cat = getProductCatLabel(p)
      counts.set(cat, (counts.get(cat) || 0) + 1)
    })
    return Array.from(counts.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, count]) => ({ name, count }))
  }, [products, addForm.main_category])

  const filteredModalProducts = useMemo(() => {
    return products.filter(p => {
      if (addForm.main_category && getProductMainCategory(p) !== addForm.main_category) return false
      if (addForm.product_category && getProductCatLabel(p) !== addForm.product_category) return false
      return true
    })
  }, [products, addForm.main_category, addForm.product_category])

  const handleMainCategoryChange = (nextMain) => {
    setAddForm(prev => {
      const selectedProd = prev.product_id ? products.find(x => String(x.product_id) === String(prev.product_id)) : null
      const prodMatches = selectedProd && (!nextMain || getProductMainCategory(selectedProd) === nextMain)
      const catDomain = prev.product_category ? resolveCategoryDomain(prev.product_category) : ''
      const catMatches = !prev.product_category || !nextMain || catDomain === nextMain
      return {
        ...prev,
        main_category: nextMain,
        product_category: catMatches ? prev.product_category : '',
        product_id: prodMatches ? prev.product_id : '',
        product_name: prodMatches ? prev.product_name : (prev.product_id ? '' : prev.product_name),
        principal_amount: prodMatches ? prev.principal_amount : (prev.product_id ? '' : prev.principal_amount),
      }
    })
  }

  const handleProductCategoryChange = (category) => {
    setAddForm(prev => {
      const selectedProd = prev.product_id ? products.find(x => String(x.product_id) === String(prev.product_id)) : null
      const matchesCat = selectedProd && (!category || getProductCatLabel(selectedProd) === category)
      const inferredMain = category ? (resolveCategoryDomain(category) || prev.main_category) : prev.main_category
      if (prev.product_id && !matchesCat) {
        return {
          ...prev,
          main_category: inferredMain,
          product_category: category,
          product_id: '',
          product_name: '',
          principal_amount: '',
        }
      }
      return {
        ...prev,
        main_category: inferredMain,
        product_category: category,
      }
    })
  }

  const handleProductSelect = (prodId) => {
    const p = products.find(x => String(x.product_id) === String(prodId))
    if (p) {
      const effectivePrice = p.discount_price ? p.discount_price : p.unit_price
      setAddForm(prev => ({
        ...prev,
        main_category: getProductMainCategory(p) || prev.main_category,
        product_category: getProductCatLabel(p),
        product_id: prodId,
        product_name: p.product_name,
        principal_amount: effectivePrice ? String(effectivePrice) : '',
      }))
    } else {
      setAddForm(prev => ({
        ...prev,
        product_id: '',
      }))
    }
  }

  const resolveAgentBranchScope = (nextCustomer = selectedAddCustomer) => {
    const actorBranch = user?.employee?.branch_id || user?.employee?.branch?.id || user?.branch_id || ''
    if (actorBranch) return String(actorBranch)
    if (nextCustomer?.branch_id) return String(nextCustomer.branch_id)
    return 'all'
  }

  const fetchSalesAgents = async (branchKey) => {
    const key = String(branchKey || 'all')
    if (agentCacheRef.current[key]) {
      const cachedList = agentCacheRef.current[key]
      setSalesAgents(cachedList)
      setAgentsError('')
      setAddForm(prev => ({
        ...prev,
        agent_id: prev.agent_id && !cachedList.some(a => String(a.employee_id) === String(prev.agent_id))
          ? ''
          : prev.agent_id,
      }))
      return cachedList
    }

    setLoadingAgents(true)
    setAgentsError('')
    try {
      const params = key !== 'all' ? { branch_id: key } : {}
      const res = await api.sales.getAgents(params, { fresh: true })
      const list = Array.isArray(res?.agents) ? res.agents : []
      agentCacheRef.current[key] = list
      if (isMountedRef.current) {
        setSalesAgents(list)
        setAddForm(prev => ({
          ...prev,
          agent_id: prev.agent_id && !list.some(a => String(a.employee_id) === String(prev.agent_id))
            ? ''
            : prev.agent_id,
        }))
      }
      return list
    } catch (err) {
      if (isMountedRef.current) {
        setSalesAgents([])
        setAgentsError(err.message || 'Unable to load active branch sales agents.')
      }
      return []
    } finally {
      if (isMountedRef.current) {
        setLoadingAgents(false)
      }
    }
  }

  const handleToggleAgent = (nextHasAgent) => {
    if (!nextHasAgent) {
      setAgentsError('')
      setAddForm(prev => ({ ...prev, has_agent: false, agent_id: '' }))
      return
    }
    setAddForm(prev => ({ ...prev, has_agent: true }))
  }

  const handleCustomerSelect = (custId) => {
    const c = customers.find(x => String(x.customer_id) === String(custId))
    if (c) {
      setAddForm(prev => ({
        ...prev,
        customer_id: custId,
        first_name: c.first_name || '',
        last_name: c.last_name || '',
        phone: c.phone || '',
        email: c.email || '',
        address: c.address || '',
      }))
      if (addForm.has_agent) {
        fetchSalesAgents(resolveAgentBranchScope(c))
      }
    } else {
      setAddForm(prev => ({ ...prev, customer_id: '' }))
      if (addForm.has_agent) {
        fetchSalesAgents(resolveAgentBranchScope(null))
      }
    }
  }

  const filteredInstallments = useMemo(() => {
    return installments.filter(inst => {
      const fullyPaid = isFullyPaidAccount(inst)

      if (activeTab === 'active' && fullyPaid) {
        return false
      }
      if (activeTab === 'completed' && !fullyPaid) {
        return false
      }
      if (activeTab === 'overdue' && (fullyPaid || inst.status !== 'Overdue')) {
        return false
      }

      if (statusFilter !== 'All') {
        const effectiveStatus = fullyPaid ? 'Fully Paid' : inst.status
        if (statusFilter === 'Fully Paid' || statusFilter === 'Complete Payment' || statusFilter === 'Completed') {
          if (!fullyPaid) return false
        } else if (effectiveStatus !== statusFilter) {
          return false
        }
      }

      if (deferredSearch.trim()) {
        const q = deferredSearch.toLowerCase().trim()
        const matchAcc = (inst.account_no || '').toLowerCase().includes(q)
        const matchCust = (inst.customer_name || '').toLowerCase().includes(q)
        const matchCode = (inst.customer_code || '').toLowerCase().includes(q)
        const matchPhone = (inst.customer_phone || '').toLowerCase().includes(q)
        const matchInv = (inst.invoice_no || '').toLowerCase().includes(q)
        const matchProd = (inst.product_name || '').toLowerCase().includes(q)
        const matchCat = (inst.product_category || '').toLowerCase().includes(q)
        const matchBranch = String(inst.branch_name || inst.branch || '').toLowerCase().includes(q)
        const matchVerifier = String(inst.final_verifier_name || '').toLowerCase().includes(q)
        if (!matchAcc && !matchCust && !matchCode && !matchPhone && !matchInv && !matchProd && !matchCat && !matchBranch && !matchVerifier) {
          return false
        }
      }

      return true
    })
  }, [installments, activeTab, statusFilter, deferredSearch])

  const liveSummary = useMemo(() => {
    const totalFinanced = installments.reduce((acc, i) => acc + (i.total_payable || 0), 0)
    const totalPaid = installments.reduce((acc, i) => acc + (i.paid || 0), 0)
    const totalOutstanding = installments.reduce((acc, i) => acc + (isFullyPaidAccount(i) ? 0 : (i.balance || 0)), 0)
    const ongoingCount = installments.filter(i => !isFullyPaidAccount(i)).length
    const activeCount = installments.filter(i => !isFullyPaidAccount(i) && i.status === 'Active').length
    const overdueCount = installments.filter(i => !isFullyPaidAccount(i) && i.status === 'Overdue').length
    const completedCount = installments.filter(i => isFullyPaidAccount(i)).length
    const pendingCount = installments.filter(i => !isFullyPaidAccount(i) && i.status === 'Pending').length

    return {
      totalFinanced,
      totalPaid,
      totalOutstanding,
      ongoingCount,
      activeCount,
      overdueCount,
      completedCount,
      pendingCount,
      totalCount: installments.length,
    }
  }, [installments])

  // Derived branch-scoped customers for Add Modal
  const userBranchId = user?.employee?.branch_id || user?.employee?.branch?.id || user?.branch_id || null
  const selectableCustomers = useMemo(() => {
    if (!isStoreAdmin || !userBranchId) return customers
    return customers.filter(c => !c.branch_id || Number(c.branch_id) === Number(userBranchId))
  }, [customers, isStoreAdmin, userBranchId])

  const openAddModal = async () => {
    setAddForm(initialAddForm)
    setAgentsError('')
    setAddModalOpen(true)
    if (customers.length === 0 || products.length === 0) {
      try {
        const [custRes, prodRes] = await Promise.all([
          customers.length === 0 ? api.customers.getAll({}, { fresh: true }) : Promise.resolve(null),
          products.length === 0 ? api.products.getAll({}, { fresh: true }) : Promise.resolve(null),
        ])
        if (isMountedRef.current) {
          if (custRes && Array.isArray(custRes.customers)) setCustomers(custRes.customers)
          if (prodRes && Array.isArray(prodRes.products)) setProducts(prodRes.products)
        }
      } catch (err) {
        console.error('Failed to load modal catalogs:', err)
      }
    }
  }

  // ─── CREATE CUSTOMER ACCOUNT (AUTOMATIC REACT STATE UPDATE) ───────────────────
  const handleAddAccount = async (e) => {
    e.preventDefault()

    if (calculatedAddValues.price <= 0) {
      showToast('Please enter a valid product purchase price', 'error')
      return
    }

    if (calculatedAddValues.down >= calculatedAddValues.price) {
      showToast('Down payment must be less than the product price for an installment plan', 'error')
      return
    }

    if (calculatedAddValues.monthlyAmt < 1) {
      showToast('Calculated installment amount must be at least ₱1.00', 'error')
      return
    }

    if (addForm.due_date && addForm.start_date && addForm.due_date < addForm.start_date) {
      showToast('First due date cannot be earlier than the contract start date', 'error')
      return
    }

    if (addForm.customer_mode === 'new' && (!addForm.first_name.trim() || !addForm.last_name.trim())) {
      showToast('Please enter the customer first and last name', 'error')
      return
    }

    if (addForm.customer_mode === 'existing' && !addForm.customer_id) {
      showToast('Please select an existing customer or switch to New Customer', 'error')
      return
    }

    if (!addForm.main_category) {
      showToast('Please select a Main Category (Appliances or Furniture)', 'error')
      return
    }

    if (addForm.has_agent && !resolvedInstallmentCategoryDomain) {
      showToast('Please select an Appliances or Furniture category to calculate agent contribution', 'error')
      return
    }

    setSaving(true)
    try {
      const payload = {
        customer_id: addForm.customer_mode === 'existing' ? parseInt(addForm.customer_id) : undefined,
        first_name: addForm.first_name?.trim() || undefined,
        last_name: addForm.last_name?.trim() || undefined,
        phone: addForm.phone?.trim() || undefined,
        email: addForm.email?.trim() || undefined,
        address: addForm.address?.trim() || undefined,
        product_id: addForm.product_id ? parseInt(addForm.product_id) : undefined,
        main_category: addForm.main_category || undefined,
        product_category: addForm.product_category || addForm.main_category || undefined,
        product_name: addForm.product_name?.trim() || undefined,
        quantity: calculatedAddValues.qty,
        unit_price: calculatedAddValues.unitPrice,
        discount_amount: calculatedAddValues.discount,
        principal_amount: calculatedAddValues.price,
        has_agent: Boolean(addForm.has_agent),
        assigned_agent_id: null,
        agent_id: null,
        down_payment: calculatedAddValues.down,
        interest_rate: calculatedAddValues.rate,
        interest_amount: calculatedAddValues.interestAmt,
        total_payable: calculatedAddValues.totalPayable,
        installment_amount: calculatedAddValues.isOpenContract ? 0 : calculatedAddValues.monthlyAmt,
        number_of_installments: calculatedAddValues.isOpenContract ? 0 : calculatedAddValues.terms,
        is_open_contract: calculatedAddValues.isOpenContract,
        frequency: calculatedAddValues.isOpenContract ? 'Open Contract' : addForm.frequency,
        start_date: addForm.start_date,
        due_date: calculatedAddValues.isOpenContract ? (addForm.due_date || null) : addForm.due_date,
        status: addForm.status,
        notes: addForm.notes,
      }

      const res = await api.installments.create(payload)

      if (res.account) {
        // AUTOMATIC STATE UPDATE: Prepend new account to list immediately without browser reload
        setInstallments(prev => [res.account, ...prev])
      }

      showToast(res.message || 'Customer installment created successfully', 'success')
      triggerDataSync('installments')
      setAddModalOpen(false)
      setAddForm(initialAddForm)
      loadInitialData(true)
    } catch (err) {
      console.error('Failed to create installment:', err)
      showToast(err.message || 'Failed to create customer installment', 'error')
    } finally {
      setSaving(false)
    }
  }

  // ─── EDIT ACCOUNT (AUTOMATIC REACT STATE UPDATE) ──────────────────────────────
  const openEditModal = (inst) => {
    setEditModalItem(inst)
    setEditForm({
      status: inst.status || 'Active',
      phone: inst.customer_phone || '',
      address: inst.customer_address || '',
      installment_amount: inst.installment_amount ? String(inst.installment_amount) : '',
      notes: inst.notes || '',
    })
  }

  const handleUpdateAccount = async (e) => {
    e.preventDefault()
    if (!editModalItem) return

    setSaving(true)
    try {
      const res = await api.installments.update(editModalItem.installment_id, editForm)

      if (res.account) {
        // AUTOMATIC STATE UPDATE: Update target item in React state
        setInstallments(prev => prev.map(item =>
          item.installment_id === editModalItem.installment_id ? res.account : item
        ))
      }

      showToast(res.message || 'Installment updated successfully', 'success')
      triggerDataSync('installments')
      setEditModalItem(null)
    } catch (err) {
      showToast(err.message || 'Failed to update installment', 'error')
    } finally {
      setSaving(false)
    }
  }

  // ─── DELETE ACCOUNT (AUTOMATIC REACT STATE UPDATE) ────────────────────────────
  const handleDeleteAccount = async (account) => {
    const confirmed = await confirmAction('Delete Account?', `Are you sure you want to delete account ${account.account_no} for ${account.customer_name}? This will permanently remove the account and its schedules.`, 'Yes, Delete Account')
    if (!confirmed) return

    setSaving(true)
    try {
      const res = await api.installments.delete(account.installment_id)

      // AUTOMATIC STATE UPDATE: Remove item from React state immediately
      setInstallments(prev => prev.filter(item => item.installment_id !== account.installment_id))
      triggerDataSync('installments')
      showToast(res.message || 'Installment deleted successfully', 'success')
    } catch (err) {
      showToast(err.message || 'Failed to delete installment', 'error')
    } finally {
      setSaving(false)
    }
  }

  // ─── VIEW ACCOUNT DETAILS ─────────────────────────────────────────────────────
  const openDetail = async (inst) => {
    if (!inst?.installment_id) return
    setDetailItem(inst.account_no ? { account: inst, sale_items: [], schedules: [], payments: [] } : null)
    setDetailTab('schedules')
    setDetailLoading(true)
    try {
      const data = await api.installments.getById(inst.installment_id)
      if (data && (data.account || data.installment_id)) {
        setDetailItem(data)
      } else {
        setDetailItem(null)
        showToast('Installment account not found or has been removed', 'warning')
        if (searchParams.get('id')) {
          setSearchParams(prev => {
            const next = new URLSearchParams(prev)
            next.delete('id')
            return next
          }, { replace: true })
        }
      }
    } catch (err) {
      setDetailItem(null)
      showToast(err.message || 'Failed to load installment details', 'error')
      if (searchParams.get('id')) {
        setSearchParams(prev => {
          const next = new URLSearchParams(prev)
          next.delete('id')
          return next
        }, { replace: true })
      }
    } finally {
      setDetailLoading(false)
    }
  }

  // ─── RECORD PAYMENT (AUTOMATIC REACT STATE UPDATE) ─────────────────────────────
  const openPaymentModal = (inst) => {
    setPayModalItem(inst)
    const defaultAmount = inst.next_amount_due > 0 ? inst.next_amount_due : inst.installment_amount
    setPayAmount(defaultAmount ? defaultAmount.toString() : '')
    setPayMethod('Cash')
    setPayRef('')
    setPayDate(new Date().toISOString().slice(0, 10))
    setPayNotes('')
  }

  const handleRecordPayment = async (e) => {
    e.preventDefault()
    const amountVal = parseFloat(payAmount)
    if (!amountVal || amountVal <= 0) {
      showToast('Please enter a valid payment amount', 'error')
      return
    }

    if (amountVal > (payModalItem.balance || 0)) {
      showToast(`Payment cannot exceed remaining balance of ${fmt(payModalItem.balance)}`, 'error')
      return
    }

    setSaving(true)
    try {
      const res = await api.payments.create({
        installment_id: payModalItem.installment_id,
        amount: amountVal,
        payment_method: payMethod,
        reference_no: payRef,
        payment_date: payDate,
        notes: payNotes,
        user_id: user?.user_id || 1,
      })

      // AUTOMATIC STATE UPDATE: Update balances in React state
      if (res.account) {
        setInstallments(prev => prev.map(item => {
          if (item.installment_id === payModalItem.installment_id) {
            const newPaid = Math.round(((item.paid || 0) + amountVal) * 100) / 100
            const newBal = Math.max(0, Math.round(((item.total_payable || 0) - newPaid) * 100) / 100)
            const newStatus = newBal <= 0 ? 'Fully Paid' : (res.account.status || item.status)
            return {
              ...item,
              paid: newPaid,
              total_paid: newPaid,
              balance: newBal,
              remaining_balance: newBal,
              status: newStatus,
              completed_at: newBal <= 0 ? new Date().toISOString() : item.completed_at,
              next_due_date: newBal <= 0 ? null : item.next_due_date,
              customer_standing: newBal <= 0 ? 'Cleared / Good Standing' : item.customer_standing,
              payment_status: newBal <= 0 ? 'Paid in Full' : 'Partially Paid',
              progress_percentage: item.total_payable > 0 ? Math.min(100, Math.round((newPaid / item.total_payable) * 100)) : 100,
              payments_history: [
                {
                  payment_id: res.payment?.payment_id || Date.now(),
                  receipt_no: res.payment?.receipt_no || 'NEW-RCP',
                  payment_date: payDate,
                  amount: amountVal,
                  payment_method: payMethod,
                  reference_no: payRef,
                },
                ...(item.payments_history || []),
              ],
            }
          }
          return item
        }))
      }

      showToast(res.message || 'Payment recorded successfully', 'success')
      triggerDataSync('installments')
      setPayModalItem(null)

      // Refresh detail modal if open
      if (detailItem && detailItem.account?.installment_id === payModalItem.installment_id) {
        openDetail(payModalItem)
      }
    } catch (err) {
      showToast(err.message || 'Failed to record payment', 'error')
    } finally {
      setSaving(false)
    }
  }

  // Pagination slice
  const total = filteredInstallments.length
  const paginated = filteredInstallments.slice((page - 1) * pageSize, page * pageSize)

  const [exporting, setExporting] = useState(false)
  const handleExportCSV = async () => {
    setExporting(true)
    try {
      await downloadCsv('/installments', {
        search: search || undefined,
        status: statusFilter !== 'All' ? statusFilter : undefined,
        branch: branchFilter !== 'All' ? branchFilter : undefined,
      })
      showToast('Installments exported successfully', 'success')
    } catch (err) {
      showToast(err.message || 'Export failed', 'error')
    } finally {
      setExporting(false)
    }
  }

  const tabs = [
    {
      id: 'active',
      label: `Active / Ongoing (${liveSummary.ongoingCount})`,
      icon: <FiCreditCard className="w-4 h-4 text-primary" />,
    },
    {
      id: 'completed',
      label: `Completed (Fully Paid) (${liveSummary.completedCount})`,
      icon: <FiAward className="w-4 h-4 text-emerald-600" />,
      badge: liveSummary.completedCount > 0 ? liveSummary.completedCount : null,
    },
    {
      id: 'overdue',
      label: `Overdue Accounts (${liveSummary.overdueCount})`,
      icon: <FiAlertTriangle className="w-4 h-4 text-rose-500" />,
      badge: liveSummary.overdueCount > 0 ? liveSummary.overdueCount : null,
    },
    {
      id: 'all',
      label: `All Contracts (${liveSummary.totalCount})`,
      icon: <FiLayers className="w-4 h-4" />,
    },
  ]

  return (
    <div className={embedded ? "animate-fadeIn" : "space-y-6 animate-fadeIn"}>
      {/* ─── PAGE HEADER WITH ADD ACCOUNT BUTTON (NO REFRESH BUTTON) ─── */}
      {!embedded && (
        <PageHeader
          title="Customer Installments"
          subtitle={
            isStoreAdmin
              ? `Store Branch Ledger (${user?.employee?.branch?.name || (typeof user?.employee?.branch === 'string' ? user.employee.branch : 'Assigned Branch')})`
              : 'Manage customer credit contracts, payment amortization schedules, and receivables'
          }
          action={
            <div className="flex gap-2">
              <SyncButton sync={syncInstallments} isSyncing={isSyncingInstallments} label="Sync" />
              <button
                type="button"
                onClick={handleExportCSV}
                disabled={exporting}
                className="flex items-center gap-2 px-4 py-2 bg-muted hover:bg-muted/80 text-foreground font-semibold text-xs rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50"
              >
                {exporting ? <FiAlertTriangle className="w-4 h-4 animate-spin" /> : <FiDownload className="w-4 h-4" />}
                <span>{exporting ? 'Exporting...' : 'Export CSV'}</span>
              </button>
              {!isAdmin && (
                <button
                  type="button"
                  onClick={openAddModal}
                  className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
                >
                  <FiPlus className="w-4 h-4" />
                  <span>New Installment</span>
                </button>
              )}
            </div>
          }
        />
      )}

      {error && <ErrorAlert message={error} onRetry={loadInitialData} />}

      {/* ─── TOP PORTFOLIO STATISTIC CARDS ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          title="Total Financed Value"
          value={fmt(liveSummary.totalFinanced)}
          sub={`${liveSummary.totalCount} total contracts`}
          icon={<FiCreditCard className="w-5 h-5" />}
          color="blue"
        />
        <StatCard
          title="Total Paid Collections"
          value={fmt(liveSummary.totalPaid)}
          sub="down payments & installments"
          icon={<FiCheckCircle className="w-5 h-5 text-emerald-500" />}
          color="green"
        />
        <StatCard
          title="Outstanding Balance"
          value={fmt(liveSummary.totalOutstanding)}
          sub="uncollected credit portfolio"
          icon={<TbCurrencyPeso className="w-5 h-5 text-rose-500" />}
          color="red"
        />
        <StatCard
          title="Overdue Accounts"
          value={liveSummary.overdueCount.toString()}
          sub="past-due amortization"
          icon={<FiAlertTriangle className="w-5 h-5 text-amber-500" />}
          color="yellow"
        />
      </div>

      {/* ─── TAB SWITCHER ─── */}
      <TabBar
        tabs={tabs}
        activeTab={activeTab}
        onChange={t => {
          setActiveTab(t)
          setPage(1)
        }}
      />

      {/* ─── SEARCH & FILTER TOOLBAR (REACTIVE WITH FISEARCH & FIFILTER) ─── */}
      <Card noPad className="p-3.5 border border-border shadow-2xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Instant Search Bar */}
          <div className="lg:col-span-2 relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground">
              <FiSearch className="w-4 h-4" />
            </div>
            <input
              type="text"
              placeholder="Search by account #, customer name, product, phone, or invoice..."
              value={search}
              onChange={e => {
                setSearch(e.target.value)
                setPage(1)
              }}
              className="w-full pl-9 pr-8 py-2 text-xs rounded-xl border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-muted-foreground/70"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <FiX className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Status Filter */}
          <div className="relative">
            <select
              value={statusFilter}
              onChange={e => {
                setStatusFilter(e.target.value)
                setPage(1)
              }}
              className="w-full px-3 py-2 text-xs rounded-xl border border-border bg-card text-foreground cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium"
            >
              <option value="All">All Statuses ({installments.length})</option>
              <option value="Active">Active ({liveSummary.activeCount})</option>
              <option value="Pending">Pending ({liveSummary.pendingCount})</option>
              <option value="Overdue">Overdue ({liveSummary.overdueCount})</option>
              <option value="Fully Paid">Fully Paid ({liveSummary.completedCount})</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>

          <div>
            <select
              value={branchFilter}
              disabled={isStoreAdmin || embedded}
              onChange={e => {
                setLocalBranchFilter(e.target.value)
                setPage(1)
              }}
              className="w-full px-3 py-2 text-xs rounded-xl border border-border bg-card text-foreground cursor-pointer disabled:opacity-70 disabled:bg-muted font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
            >
              <option value="All">All Branches</option>
              {branches.map(b => (
                <option key={b.id || b.branch_id || b.name} value={b.id || b.branch_id || b.name}>{b.name}</option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {loading ? (
        <TableSkeleton rows={6} cols={10} />
      ) : (
        <Card noPad className="border border-border overflow-hidden shadow-2xs">
          <CardHeader
            title={
              activeTab === 'completed'
                ? 'Completed (Fully Paid) Installments'
                : activeTab === 'overdue'
                  ? 'Overdue Installment Accounts'
                  : activeTab === 'active'
                    ? 'Active / Ongoing Installments'
                    : 'Customer Installment Ledger'
            }
            action={
              <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
                <span>Showing {paginated.length} of {filteredInstallments.length} accounts</span>
              </div>
            }
          />

          <div className="w-full overflow-hidden">
            <table className="w-full table-fixed text-[11px]">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-muted-foreground uppercase font-semibold tracking-tight text-[10px] leading-tight">
                  <th className="w-[11%] py-2.5 px-2 text-left">Account &amp; Branch</th>
                  <th className="w-[10%] py-2.5 px-1.5 text-left">Customer</th>
                  <th className="w-[13%] py-2.5 px-1.5 text-left">Financed Item</th>
                  <th className="w-[11%] py-2.5 px-1.5 text-left">Contract Pricing</th>
                  <th className="w-[9%] py-2.5 px-1.5 text-left">Terms &amp; Monthly</th>
                  <th className="w-[11%] py-2.5 px-1.5 text-left">Paid &amp; Progress</th>
                  <th className="w-[8%] py-2.5 px-1.5 text-left">Balance</th>
                  <th className="w-[9%] py-2.5 px-1.5 text-left">
                    {activeTab === 'completed' ? 'Completed / Verifier' : 'Next Due / Clearance'}
                  </th>
                  <th className="w-[8%] py-2.5 px-1 text-center">Status</th>
                  <th className="w-[10%] py-2.5 px-1.5 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paginated.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-12 text-center text-muted-foreground">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <FiCreditCard className="w-8 h-8 text-muted-foreground/50" />
                        <span className="font-semibold text-foreground">No customer installment found</span>
                        <span className="text-xs">Try adjusting filters or switch between Active / Ongoing and Completed (Fully Paid) tabs.</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginated.map((inst, i) => {
                    const fullyPaid = isFullyPaidAccount(inst)
                    const isOverdue = !fullyPaid && (inst.status === 'Overdue' || inst.days_overdue > 0)
                    const isOpenContract = Boolean(inst.is_open_contract || String(inst.frequency || '').toLowerCase() === 'open contract')
                    const totalPayableVal = Number(inst.total_payable || ((inst.principal_amount || 0) + (inst.interest_amount || 0)))
                    const totalTerms = inst.total_terms ?? inst.number_of_installments ?? 0
                    const paidTerms = fullyPaid ? totalTerms : (inst.paid_installments ?? 0)
                    const pendingVerif = fullyPaid ? 0 : Number(inst.pending_payments_amount || 0)
                    const balanceVal = fullyPaid ? 0 : Number(inst.balance || 0)
                    const progressPct = fullyPaid
                      ? 100
                      : Number(inst.progress_percentage ?? (totalPayableVal > 0 ? Math.min(100, Math.round(((inst.paid || 0) / totalPayableVal) * 1000) / 10) : 0))
                    return (
                      <tr
                        key={inst.installment_id}
                        className={`hover:bg-muted/40 transition-colors ${
                          i % 2 === 1 ? 'bg-muted/10' : ''
                        } ${isOverdue ? 'bg-rose-50/20 dark:bg-rose-950/10' : fullyPaid ? 'bg-emerald-50/20 dark:bg-emerald-950/10' : ''}`}
                      >
                        <td className="py-2.5 px-2 align-top">
                          <div className="flex items-center gap-1 font-mono font-bold text-foreground min-w-0">
                            <FiCreditCard className="w-3 h-3 text-primary shrink-0" />
                            <span className="truncate" title={inst.account_no}>{inst.account_no}</span>
                          </div>
                          <div className="text-[10px] text-muted-foreground font-mono mt-0.5 truncate" title={inst.invoice_no}>
                            {inst.invoice_no && inst.invoice_no !== 'N/A' ? inst.invoice_no : 'Direct'}
                          </div>
                          {(inst.branch_name || inst.branch) && (
                            <div className="mt-1">
                              <span className="inline-block max-w-full truncate px-1.5 py-0.5 rounded bg-muted text-foreground/80 border border-border text-[10px] font-semibold">
                                {inst.branch_name || inst.branch}
                              </span>
                            </div>
                          )}
                        </td>

                        <td className="py-2.5 px-1.5 align-top">
                          <div className="font-semibold text-foreground flex items-start gap-1 leading-tight">
                            <FiUser className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5" />
                            <span className="break-words min-w-0">{inst.customer_name}</span>
                          </div>
                          {inst.customer_code && (
                            <div className="text-[10px] text-primary font-mono mt-0.5 truncate">{inst.customer_code}</div>
                          )}
                          {inst.customer_phone && (
                            <div className="text-[10px] text-muted-foreground font-mono truncate">
                              {inst.customer_phone}
                            </div>
                          )}
                          {fullyPaid && (
                            <div className="mt-1">
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[9px] font-bold">
                                <FiShield className="w-2.5 h-2.5 shrink-0" />
                                <span className="truncate">{inst.customer_standing || 'Cleared / Good Standing'}</span>
                              </span>
                            </div>
                          )}
                        </td>

                        <td className="py-2.5 px-1.5 align-top">
                          <div className="font-medium text-foreground flex items-start gap-1 leading-tight" title={inst.product_name}>
                            <FiPackage className="w-3 h-3 text-amber-500 shrink-0 mt-0.5" />
                            <span className="line-clamp-2 break-words min-w-0">{inst.product_name || 'Appliance / Furniture'}</span>
                          </div>
                          {inst.product_category && (
                            <div className="text-[10px] text-primary/80 font-medium mt-0.5 truncate" title={inst.product_category}>
                              {inst.product_category}
                            </div>
                          )}
                          {inst.start_date && (
                            <div className="text-[10px] text-muted-foreground font-mono mt-0.5 truncate">
                              Started {inst.start_date}
                            </div>
                          )}
                          {fullyPaid && inst.has_agent && (
                            <div className="text-[9px] font-bold text-teal-700 dark:text-teal-300 mt-0.5">
                              Agent: {inst.agent_contribution_status || 'Settled'}
                            </div>
                          )}
                        </td>

                        <td className="py-2.5 px-1.5 text-left font-mono align-top leading-tight">
                          <div className="font-bold text-foreground">{fmt(totalPayableVal)}</div>
                          <div className="text-[10px] text-muted-foreground mt-0.5">Price: {fmt(inst.principal_amount)}</div>
                          <div className="text-[10px] text-muted-foreground">Down: {fmt(inst.down_payment)}</div>
                          {Number(inst.interest_amount) > 0 && (
                            <div className="text-[10px] text-amber-600 dark:text-amber-400">
                              Int: {fmt(inst.interest_amount)} ({inst.interest_rate || 0}%)
                            </div>
                          )}
                        </td>

                        <td className="py-2.5 px-1.5 text-left font-mono align-top leading-tight">
                          {isOpenContract ? (
                            <>
                              <span className="inline-block px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30 text-[10px] font-bold font-sans">
                                Open Contract
                              </span>
                              <div className="text-[10px] text-muted-foreground mt-1 font-sans">Flexible term</div>
                            </>
                          ) : (
                            <>
                              <div className="font-bold text-primary">{fmt(inst.installment_amount)}</div>
                              <div className="text-[10px] text-muted-foreground mt-0.5">/ {inst.frequency || 'Monthly'}</div>
                              <div className="text-[10px] font-semibold text-foreground/80 mt-0.5">
                                {paidTerms}/{totalTerms} paid
                              </div>
                            </>
                          )}
                        </td>

                        <td className="py-2.5 px-1.5 text-left font-mono align-top leading-tight">
                          <div className="font-bold text-emerald-600 dark:text-emerald-400">{fmt(inst.paid)}</div>
                          <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden mt-1">
                            <div
                              className="h-full bg-emerald-500 rounded-full transition-all"
                              style={{ width: `${Math.min(100, progressPct)}%` }}
                            />
                          </div>
                          <div className="text-[10px] text-muted-foreground mt-0.5">{progressPct}% paid</div>
                          {pendingVerif > 0 && (
                            <div className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 mt-0.5 break-words">
                              +{fmt(pendingVerif)} pending
                            </div>
                          )}
                        </td>

                        <td className="py-2.5 px-1.5 text-left font-mono align-top leading-tight">
                          <div className={`font-bold ${balanceVal > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600'}`}>
                            {fmt(balanceVal)}
                          </div>
                          {fullyPaid ? (
                            <div className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-0.5 font-sans font-semibold">
                              Paid in Full
                            </div>
                          ) : isOpenContract ? (
                            <div className="text-[10px] text-indigo-600 dark:text-indigo-400 mt-0.5 font-sans">
                              Open term
                            </div>
                          ) : totalTerms > 0 && (
                            <div className="text-[10px] text-muted-foreground mt-0.5">
                              {Math.max(0, totalTerms - paidTerms)} left
                            </div>
                          )}
                        </td>

                        <td className="py-2.5 px-1.5 align-top leading-tight">
                          {fullyPaid ? (
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-1 font-mono text-emerald-700 dark:text-emerald-400 font-bold">
                                <FiCheckCircle className="w-3 h-3 shrink-0" />
                                <span className="truncate">{inst.completed_at ? fmtDate(inst.completed_at) : 'Settled'}</span>
                              </div>
                              <div className="text-[10px] text-muted-foreground truncate" title={inst.final_verifier_name || 'Store Admin'}>
                                By: <strong className="text-foreground">{inst.final_verifier_name || 'Store Admin'}</strong>
                              </div>
                            </div>
                          ) : inst.next_due_date ? (
                            <div className="font-mono">
                              <div className="flex items-center gap-1">
                                <FiCalendar className={`w-3 h-3 shrink-0 ${isOverdue ? 'text-rose-500' : 'text-muted-foreground'}`} />
                                <span className={`truncate ${isOverdue ? 'text-rose-600 font-bold' : 'text-foreground'}`}>
                                  {inst.next_due_date}
                                </span>
                              </div>
                              {Number(inst.next_amount_due) > 0 && (
                                <div className="text-[10px] text-muted-foreground mt-0.5">
                                  Due: {fmt(inst.next_amount_due)}
                                </div>
                              )}
                              {inst.days_overdue > 0 && (
                                <div className="mt-0.5">
                                  <span className="inline-block px-1 py-0.5 rounded bg-rose-500/15 text-rose-600 text-[10px] font-bold">
                                    {inst.days_overdue}d overdue
                                  </span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground font-mono">—</span>
                          )}
                        </td>

                        <td className="py-2.5 px-1 text-center align-top [&>span]:px-1.5 [&>span]:py-0.5 [&>span]:text-[10px] [&>span]:whitespace-normal [&>span]:leading-tight">
                          <StatusBadge status={fullyPaid ? 'Fully Paid' : inst.status} />
                        </td>

                        <td className="py-2.5 px-1.5 text-center align-top">
                          <div className="flex items-center justify-center gap-0.5 flex-wrap">
                            <button
                              type="button"
                              onClick={() => openDetail(inst)}
                              title="View Full Contract & Schedules"
                              className="p-1 rounded-lg border border-border hover:bg-muted text-foreground transition-colors cursor-pointer"
                            >
                              <FiEye className="w-3.5 h-3.5" />
                            </button>

                            {fullyPaid && (
                              <button
                                type="button"
                                onClick={() => setClearanceModal({ installmentId: inst.installment_id, view: 'both' })}
                                title="Certificate of Full Payment & Final SOA"
                                className="p-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:hover:bg-emerald-900 dark:text-emerald-300 border border-emerald-300 transition-colors cursor-pointer"
                              >
                                <FiAward className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {!isAdmin && !fullyPaid && balanceVal > 0 && (
                              <button
                                type="button"
                                onClick={() => openPaymentModal(inst)}
                                title="Record Installment Payment"
                                className="p-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:hover:bg-emerald-900 dark:text-emerald-300 border border-emerald-200 transition-colors cursor-pointer"
                              >
                                <TbCurrencyPeso className="w-3.5 h-3.5" />
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => openEditModal(inst)}
                              title="Edit Account Details"
                              className="p-1 rounded-lg border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                            >
                              <FiEdit className="w-3.5 h-3.5" />
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDeleteAccount(inst)}
                              title="Delete Account"
                              className="p-1 rounded-lg border border-border hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 text-muted-foreground transition-colors cursor-pointer"
                            >
                              <FiTrash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          <Pagination page={page} total={total} pageSize={pageSize} onChange={setPage} />
        </Card>
      )}

      {/* ─── 1. ADD CUSTOMER ACCOUNT MODAL (COMPLETE WITH VALIDATION) ─── */}
      {addModalOpen && (
        <Modal
          isOpen={true}
          onClose={() => setAddModalOpen(false)}
          title="Add Customer Installment"
          size="xl"
        >
          <form onSubmit={handleAddAccount} className="space-y-5 text-xs">
            {/* Customer Section */}
            <div className="p-4 rounded-xl bg-muted/30 border border-border space-y-3.5">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-primary text-[11px]">
                  <FiUser className="w-4 h-4" />
                  <span>Customer Information</span>
                </div>
                <div className="inline-flex rounded-xl border border-border bg-card p-0.5 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setAddForm(p => ({ ...p, customer_mode: 'existing' }))}
                    className={`px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
                      addForm.customer_mode === 'existing'
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Existing Customer
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddForm(p => ({ ...p, customer_mode: 'new', customer_id: '', first_name: '', last_name: '', phone: '', email: '', address: '' }))}
                    className={`px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
                      addForm.customer_mode === 'new'
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    + New Customer
                  </button>
                </div>
              </div>

              {addForm.customer_mode === 'existing' ? (
                <div>
                  <label className="block font-bold text-muted-foreground mb-1">Select Existing Customer *</label>
                  <select
                    value={addForm.customer_id}
                    onChange={e => handleCustomerSelect(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-medium"
                  >
                    <option value="">-- Choose Customer --</option>
                    {selectableCustomers.map(c => (
                      <option key={c.customer_id} value={c.customer_id}>
                        {c.customer_code ? `[${c.customer_code}] ` : ''}{c.first_name} {c.last_name} {c.phone ? `(${c.phone})` : ''}{!isStoreAdmin && (c.branch_name || c.branch) ? ` — ${c.branch_name || c.branch}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="block font-bold text-muted-foreground mb-1">First Name *</label>
                    <input
                      type="text"
                      placeholder="Juan"
                      value={addForm.first_name}
                      onChange={e => setAddForm(p => ({ ...p, first_name: e.target.value }))}
                      required
                      className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-medium"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-muted-foreground mb-1">Last Name *</label>
                    <input
                      type="text"
                      placeholder="Dela Cruz"
                      value={addForm.last_name}
                      onChange={e => setAddForm(p => ({ ...p, last_name: e.target.value }))}
                      required
                      className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-medium"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-muted-foreground mb-1">Email Address</label>
                    <input
                      type="email"
                      placeholder="customer@email.com"
                      value={addForm.email}
                      onChange={e => setAddForm(p => ({ ...p, email: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-bold text-muted-foreground mb-1">Contact Number</label>
                  <div className="relative">
                    <FiPhone className="absolute left-3 top-2.5 text-muted-foreground w-3.5 h-3.5" />
                    <input
                      type="tel"
                      maxLength={11}
                      placeholder="09XXXXXXXXX"
                      value={addForm.phone}
                      onChange={e => setAddForm(p => ({ ...p, phone: e.target.value.replace(/\D/g, '').slice(0, 11) }))}
                      className="w-full pl-9 pr-3 py-2 rounded-xl border border-border bg-card text-foreground font-mono"
                    />
                  </div>
                </div>
                <div>
                  <label className="block font-bold text-muted-foreground mb-1">Delivery / Home Address</label>
                  <div className="relative">
                    <FiMapPin className="absolute left-3 top-2.5 text-muted-foreground w-3.5 h-3.5" />
                    <input
                      type="text"
                      placeholder="Street, Barangay, City"
                      value={addForm.address}
                      onChange={e => setAddForm(p => ({ ...p, address: e.target.value }))}
                      className="w-full pl-9 pr-3 py-2 rounded-xl border border-border bg-card text-foreground"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Product & Contract Terms */}
            <div className="p-3.5 rounded-xl bg-muted/30 border border-border space-y-3">
              <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-primary text-[11px]">
                <FiPackage className="w-4 h-4" />
                <span>Product & Installment Terms</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                <div>
                  <label className="block font-bold text-muted-foreground mb-1">Main Category *</label>
                  <select
                    value={addForm.main_category}
                    onChange={e => handleMainCategoryChange(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-semibold"
                  >
                    <option value="">-- Select Main Category --</option>
                    <option value="Appliances">Appliances ({mainCategoryCounts.Appliances})</option>
                    <option value="Furniture">Furniture ({mainCategoryCounts.Furniture})</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-muted-foreground mb-1">Product Category</label>
                  <select
                    value={addForm.product_category}
                    onChange={e => handleProductCategoryChange(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-medium"
                  >
                    <option value="">
                      {addForm.main_category
                        ? `All ${addForm.main_category} (${filteredModalProducts.length})`
                        : `All Categories (${products.length})`}
                    </option>
                    {productCategories.map(cat => (
                      <option key={cat.name} value={cat.name}>
                        {cat.name} ({cat.count})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-muted-foreground mb-1">Product Selection</label>
                  <select
                    value={addForm.product_id}
                    onChange={e => handleProductSelect(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-medium"
                  >
                    <option value="">-- Choose from Catalog (or custom) --</option>
                    {filteredModalProducts.map(p => {
                      const effPrice = p.discount_price ? p.discount_price : p.unit_price;
                      const catLabel = getProductCatLabel(p);
                      return (
                        <option key={p.product_id} value={p.product_id}>
                          {!addForm.product_category ? `[${catLabel}] ` : ''}{p.product_name} — {fmt(effPrice)} (Stock: {p.stock_quantity}) {p.discount_price ? '[SALE]' : ''}
                        </option>
                      )
                    })}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-muted-foreground mb-1">Product / Item Name *</label>
                  <input
                    type="text"
                    placeholder="e.g. Samsung Inverter Refrigerator"
                    value={addForm.product_name}
                    onChange={e => setAddForm(p => ({ ...p, product_name: e.target.value }))}
                    required
                    className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-medium"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5">
                <div>
                  <label className="block font-bold text-muted-foreground mb-1">Unit Price (PHP) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    placeholder="25000"
                    value={addForm.principal_amount}
                    onChange={e => setAddForm(p => ({ ...p, principal_amount: e.target.value }))}
                    required
                    className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block font-bold text-muted-foreground mb-1">Qty</label>
                  <input
                    type="number"
                    min="1"
                    value={addForm.quantity}
                    onChange={e => setAddForm(p => ({ ...p, quantity: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block font-bold text-muted-foreground mb-1">Discount (PHP)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max={calculatedAddValues.grossPrice || undefined}
                    placeholder="0"
                    value={addForm.discount_amount}
                    onChange={e => setAddForm(p => ({ ...p, discount_amount: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-muted-foreground mb-1">Down Payment (PHP)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="5000"
                    value={addForm.down_payment}
                    onChange={e => setAddForm(p => ({ ...p, down_payment: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-muted-foreground mb-1">Interest / Charge (%)</label>
                  <div className="relative">
                    <FiPercent className="absolute right-3 top-2.5 text-muted-foreground w-3.5 h-3.5" />
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={addForm.interest_rate}
                      onChange={e => setAddForm(p => ({ ...p, interest_rate: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-mono"
                    />
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <label className="block font-bold text-muted-foreground mb-1">Term (Months) *</label>
                  <select
                    value={addForm.number_of_installments}
                    onChange={e => {
                      const val = e.target.value
                      setAddForm(p => ({
                        ...p,
                        number_of_installments: val,
                        frequency: val === 'open' ? 'Open Contract' : (p.frequency === 'Open Contract' ? 'Monthly' : p.frequency),
                      }))
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-semibold"
                  >
                    <option value="open">Open Contract — Flexible Term (No Fixed Due / Pay Anytime)</option>
                    <option value="3">3 Months — Short-Term Plan (3 Payments)</option>
                    <option value="6">6 Months — Standard Plan (6 Payments)</option>
                    <option value="9">9 Months — Extended Plan (9 Payments)</option>
                    <option value="12">12 Months — 1-Year Plan (12 Payments)</option>
                    <option value="18">18 Months — 1.5-Year Plan (18 Payments)</option>
                    <option value="24">24 Months — 2-Year Plan (24 Payments)</option>
                    <option value="36">36 Months — 3-Year Plan (36 Payments)</option>
                  </select>
                </div>
              </div>

              {/* Dates & Frequency */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="block font-bold text-muted-foreground mb-1">Payment Frequency</label>
                  <select
                    value={calculatedAddValues.isOpenContract ? 'Open Contract' : addForm.frequency}
                    disabled={calculatedAddValues.isOpenContract}
                    onChange={e => setAddForm(p => ({ ...p, frequency: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-medium disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    {calculatedAddValues.isOpenContract ? (
                      <option value="Open Contract">Open / Flexible (Pay Anytime)</option>
                    ) : (
                      <>
                        <option value="Monthly">Monthly (Every 30 Days)</option>
                        <option value="Bi-weekly">Bi-weekly (Every 14 Days)</option>
                        <option value="Weekly">Weekly (Every 7 Days)</option>
                      </>
                    )}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-muted-foreground mb-1">Contract Start Date</label>
                  <input
                    type="date"
                    value={addForm.start_date}
                    onChange={e => setAddForm(p => ({ ...p, start_date: e.target.value }))}
                    required
                    className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-muted-foreground mb-1">
                    {calculatedAddValues.isOpenContract ? 'Target Due Date (Optional)' : 'First Due Date'}
                  </label>
                  <input
                    type="date"
                    value={addForm.due_date}
                    onChange={e => setAddForm(p => ({ ...p, due_date: e.target.value }))}
                    required={!calculatedAddValues.isOpenContract}
                    className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-mono"
                  />
                </div>
              </div>

              {/* Detailed Term & Contract Breakdown */}
              <div className={`p-3 rounded-xl border space-y-2 ${
                calculatedAddValues.isOpenContract
                  ? 'bg-indigo-50/70 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800/60'
                  : 'bg-muted/30 border-border'
              }`}>
                <div className="flex items-center justify-between gap-2 flex-wrap border-b border-border/60 pb-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-foreground">
                    Term &amp; Contract Plan Details
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                    calculatedAddValues.isOpenContract
                      ? 'bg-indigo-100 text-indigo-700 border-indigo-300 dark:bg-indigo-950/70 dark:text-indigo-300 dark:border-indigo-700'
                      : 'bg-primary/10 text-primary border-primary/25'
                  }`}>
                    {calculatedAddValues.isOpenContract
                      ? 'Open Contract • Flexible Term'
                      : `Fixed Term • ${calculatedAddValues.terms} Months (${addForm.frequency})`}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                  <div>
                    <span className="text-muted-foreground block">Net Principal</span>
                    <span className="font-mono font-bold text-foreground">{fmt(calculatedAddValues.price)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Financed Base</span>
                    <span className="font-mono font-bold text-foreground">{fmt(calculatedAddValues.financed)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Interest ({calculatedAddValues.rate}%)</span>
                    <span className="font-mono font-bold text-amber-600 dark:text-amber-400">{fmt(calculatedAddValues.interestAmt)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">
                      {calculatedAddValues.isOpenContract ? 'Payment Rule' : 'Est. Maturity Date'}
                    </span>
                    <span className="font-mono font-bold text-foreground">
                      {calculatedAddValues.isOpenContract
                        ? 'Pay Any Amount'
                        : (calculatedAddValues.estimatedEndDate || '—')}
                    </span>
                  </div>
                </div>

                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {calculatedAddValues.isOpenContract ? (
                    <>
                      <strong className="text-indigo-700 dark:text-indigo-300">Open Contract:</strong> No fixed monthly schedule or maturity lock-in. The customer can pay any amount anytime toward the <strong className="text-foreground font-mono">{fmt(calculatedAddValues.outstanding)}</strong> balance until settled in full.
                    </>
                  ) : (
                    <>
                      <strong className="text-foreground">Fixed Amortization:</strong> {calculatedAddValues.terms} {addForm.frequency.toLowerCase()} installments of <strong className="text-primary font-mono">{fmt(calculatedAddValues.monthlyAmt)}</strong> starting <strong className="font-mono text-foreground">{addForm.due_date || addForm.start_date}</strong>{calculatedAddValues.estimatedEndDate ? <> through <strong className="font-mono text-foreground">{calculatedAddValues.estimatedEndDate}</strong></> : ''}.
                    </>
                  )}
                </p>
              </div>
            </div>

            <AgentAssignmentSection
              hasAgent={Boolean(addForm.has_agent)}
              onToggleAgent={handleToggleAgent}
              selectedAgentId={addForm.agent_id}
              onSelectAgent={(val) => setAddForm(p => ({ ...p, agent_id: val }))}
              agents={salesAgents}
              loadingAgents={loadingAgents}
              agentsError={agentsError}
              summary={installmentAgentSummary}
              categoryNotice={
                addForm.has_agent && !resolvedInstallmentCategoryDomain
                  ? 'Select a Product Category (Appliances 12% or Furniture 15%) for commission calculation.'
                  : ''
              }
            />

            <div className="p-3.5 rounded-xl bg-primary/5 border border-primary/20 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div>
                <div className="text-[10px] uppercase font-bold text-muted-foreground">Interest Charge</div>
                <div className="font-mono font-bold text-foreground text-sm">{fmt(calculatedAddValues.interestAmt)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase font-bold text-muted-foreground">Total Payable</div>
                <div className="font-mono font-bold text-emerald-600 text-sm">{fmt(calculatedAddValues.totalPayable)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase font-bold text-muted-foreground">
                  {calculatedAddValues.isOpenContract ? 'Payment Term' : `${addForm.frequency} Installment`}
                </div>
                <div className="font-mono font-bold text-primary text-sm">
                  {calculatedAddValues.isOpenContract ? 'Open / Flexible' : fmt(calculatedAddValues.monthlyAmt)}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase font-bold text-muted-foreground">Outstanding Balance</div>
                <div className="font-mono font-bold text-rose-600 text-sm">{fmt(calculatedAddValues.outstanding)}</div>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block font-bold text-muted-foreground mb-1">Contract Notes / Remarks</label>
              <textarea
                placeholder="Additional contract terms, guarantor info, or delivery remarks..."
                rows={2}
                value={addForm.notes}
                onChange={e => setAddForm(p => ({ ...p, notes: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground"
              />
            </div>

            {/* Modal Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t border-border">
              <button
                type="button"
                onClick={() => setAddModalOpen(false)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-border hover:bg-muted text-foreground font-semibold cursor-pointer"
              >
                <FiX className="w-4 h-4" />
                <span>Cancel</span>
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-sm transition-all cursor-pointer"
              >
                <FiCheckCircle className="w-4 h-4" />
                <span>{saving ? 'Creating Account...' : 'Confirm & Create Account'}</span>
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ─── 2. EDIT ACCOUNT MODAL ─── */}
      {editModalItem && (
        <Modal
          isOpen={true}
          onClose={() => setEditModalItem(null)}
          title={`Edit Installment — ${editModalItem.account_no}`}
          size="lg"
        >
          <form onSubmit={handleUpdateAccount} className="space-y-4 text-xs">
            <div className="p-3 bg-muted/40 rounded-xl border border-border space-y-1">
              <div className="font-bold text-sm text-foreground">{editModalItem.customer_name}</div>
              <div className="text-muted-foreground font-mono">Account No: {editModalItem.account_no}</div>
              <div className="text-muted-foreground">Product: {editModalItem.product_name}</div>
            </div>

            <div>
              <label className="block font-bold text-muted-foreground mb-1">Account Status</label>
              <select
                value={editForm.status}
                onChange={e => setEditForm(p => ({ ...p, status: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-semibold"
              >
                <option value="Active">Active</option>
                <option value="Pending">Pending</option>
                <option value="Overdue">Overdue</option>
                <option value="Complete Payment">Complete Payment</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block font-bold text-muted-foreground mb-1">Contact Phone</label>
                <input
                  type="tel"
                  maxLength={11}
                  placeholder="09XXXXXXXXX"
                  value={editForm.phone}
                  onChange={e => setEditForm(p => ({ ...p, phone: e.target.value.replace(/\D/g, '').slice(0, 11) }))}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-mono"
                />
              </div>

              <div>
                <label className="block font-bold text-muted-foreground mb-1">Monthly Installment (PHP)</label>
                <input
                  type="number"
                  step="0.01"
                  value={editForm.installment_amount}
                  onChange={e => setEditForm(p => ({ ...p, installment_amount: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block font-bold text-muted-foreground mb-1">Delivery Address</label>
              <input
                type="text"
                value={editForm.address}
                onChange={e => setEditForm(p => ({ ...p, address: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground"
              />
            </div>

            <div>
              <label className="block font-bold text-muted-foreground mb-1">Notes / Remarks</label>
              <textarea
                rows={2}
                value={editForm.notes}
                onChange={e => setEditForm(p => ({ ...p, notes: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground"
              />
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-border">
              <button
                type="button"
                onClick={() => setEditModalItem(null)}
                className="flex items-center gap-1 px-4 py-2 rounded-xl border border-border hover:bg-muted text-foreground font-semibold cursor-pointer"
              >
                <FiX className="w-3.5 h-3.5" />
                <span>Cancel</span>
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-1 px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold cursor-pointer"
              >
                <FiCheckCircle className="w-3.5 h-3.5" />
                <span>{saving ? 'Saving...' : 'Save Changes'}</span>
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ─── 4. DETAILED ACCOUNT MODAL WITH FULL CONTRACT & SCHEDULES ─── */}
      {detailItem && (
        <Modal
          isOpen={true}
          onClose={() => setDetailItem(null)}
          title={`Installment — ${detailItem.account?.account_no || ''}`}
          size="xl"
        >
          {detailLoading && !detailItem.schedules?.length ? (
            <LoadingState message="Loading installment contract and payment amortization schedules..." />
          ) : (
            <div className="space-y-4 text-xs">
              {/* Customer & Branch Information Header */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3.5 bg-muted/30 rounded-xl border border-border">
                <div className="space-y-1">
                  <div className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1">
                    <FiUser className="w-3 h-3" />
                    <span>Customer Information</span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm text-foreground">{detailItem.account?.customer_name}</span>
                    {detailItem.account?.customer_code && (
                      <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary font-mono text-[10px] font-bold">
                        {detailItem.account.customer_code}
                      </span>
                    )}
                  </div>
                  <div className="text-muted-foreground flex items-center gap-1">
                    <FiPhone className="w-3 h-3" /> {detailItem.account?.customer_phone || '—'}
                    {detailItem.account?.customer_email && detailItem.account.customer_email !== '—' && (
                      <span className="ml-2">• {detailItem.account.customer_email}</span>
                    )}
                  </div>
                  <div className="text-muted-foreground flex items-center gap-1">
                    <FiMapPin className="w-3 h-3" /> {detailItem.account?.customer_address || '—'}
                  </div>
                </div>

                <div className="space-y-1 md:text-right">
                  <div className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1 md:justify-end">
                    <FiFileText className="w-3 h-3" />
                    <span>Contract &amp; Branch</span>
                  </div>
                  <div className="font-bold text-sm text-primary">{detailItem.account?.branch_name || detailItem.account?.branch || 'Main Branch'}</div>
                  <div className="font-mono text-muted-foreground">Invoice: {detailItem.account?.invoice_no || 'N/A'}</div>
                  <div className="font-mono text-muted-foreground">Start Date: {detailItem.account?.start_date || '—'}</div>
                  {detailItem.account?.store_admin && (
                    <div className="text-[11px] text-muted-foreground">Processed By: <strong className="text-foreground">{detailItem.account.store_admin}</strong></div>
                  )}
                  {detailItem.account?.has_agent && (
                    <div className="text-[11px] text-muted-foreground">
                      Sales Agent: <strong className="text-primary">{detailItem.account.agent_name ? `${detailItem.account.agent_name}${detailItem.account.agent_code ? ` (${detailItem.account.agent_code})` : ''}` : 'With Agent'}</strong>
                      {' '}• Contribution: <strong className="font-mono text-emerald-600 dark:text-emerald-400">{fmt(detailItem.account.total_agent_contribution)}</strong>
                    </div>
                  )}
                </div>
              </div>

              {/* Purchased Product Ledger */}
              {detailItem.sale_items && detailItem.sale_items.length > 0 && (
                <div className="p-3 bg-card rounded-xl border border-border">
                  <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                    <FiPackage className="w-3.5 h-3.5 text-amber-500" />
                    <span>Purchased Items &amp; Financed Products</span>
                  </div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-muted/40 text-muted-foreground text-left">
                        <th className="py-1.5 px-2">SKU</th>
                        <th className="py-1.5 px-2">Product Name</th>
                        <th className="py-1.5 px-2">Category</th>
                        <th className="py-1.5 px-2 text-right">Qty</th>
                        <th className="py-1.5 px-2 text-right">Unit Price</th>
                        <th className="py-1.5 px-2 text-right">Line Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailItem.sale_items.map((item, idx) => (
                        <tr key={idx} className="border-b border-border">
                          <td className="py-1.5 px-2 font-mono text-muted-foreground">{item.product_code}</td>
                          <td className="py-1.5 px-2 font-medium">{item.product_name}</td>
                          <td className="py-1.5 px-2 text-muted-foreground">{item.category || '—'}</td>
                          <td className="py-1.5 px-2 text-right font-mono">{item.quantity}</td>
                          <td className="py-1.5 px-2 text-right font-mono">{fmt(item.unit_price)}</td>
                          <td className="py-1.5 px-2 text-right font-mono font-bold">{fmt(item.line_total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Full Contract Financial Breakdown (8-Tile Matrix) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-3 bg-muted/20 rounded-xl border border-border">
                  <div className="text-[10px] text-muted-foreground uppercase font-bold">Cash Price / Principal</div>
                  <div className="font-mono font-bold text-foreground text-sm mt-0.5">{fmt(detailItem.account?.principal_amount)}</div>
                </div>
                <div className="p-3 bg-muted/20 rounded-xl border border-border">
                  <div className="text-[10px] text-muted-foreground uppercase font-bold">Down Payment</div>
                  <div className="font-mono font-bold text-foreground text-sm mt-0.5">{fmt(detailItem.account?.down_payment)}</div>
                </div>
                <div className="p-3 bg-muted/20 rounded-xl border border-border">
                  <div className="text-[10px] text-muted-foreground uppercase font-bold">Financed Base</div>
                  <div className="font-mono font-bold text-foreground text-sm mt-0.5">
                    {fmt(detailItem.account?.financed_amount ?? Math.max(0, (detailItem.account?.principal_amount || 0) - (detailItem.account?.down_payment || 0)))}
                  </div>
                </div>
                <div className="p-3 bg-amber-500/10 rounded-xl border border-amber-500/30">
                  <div className="text-[10px] text-amber-700 dark:text-amber-300 uppercase font-bold">Interest ({detailItem.account?.interest_rate || 0}%)</div>
                  <div className="font-mono font-bold text-amber-700 dark:text-amber-300 text-sm mt-0.5">{fmt(detailItem.account?.interest_amount)}</div>
                </div>
                <div className="p-3 bg-muted/30 rounded-xl border border-border">
                  <div className="text-[10px] text-muted-foreground uppercase font-bold">Total Contract Payable</div>
                  <div className="font-mono font-bold text-foreground text-sm mt-0.5">{fmt(detailItem.account?.total_payable)}</div>
                </div>
                <div className="p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/30">
                  <div className="text-[10px] text-emerald-700 dark:text-emerald-300 uppercase font-bold">Confirmed Paid</div>
                  <div className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-sm mt-0.5">{fmt(detailItem.account?.paid)}</div>
                  {Number(detailItem.account?.pending_payments_amount) > 0 && (
                    <div className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold mt-0.5">
                      +{fmt(detailItem.account.pending_payments_amount)} pending ({detailItem.account.pending_payments_count})
                    </div>
                  )}
                </div>
                <div className="p-3 bg-rose-500/10 rounded-xl border border-rose-500/30">
                  <div className="text-[10px] text-rose-700 dark:text-rose-300 uppercase font-bold">Remaining Balance</div>
                  <div className="font-mono font-bold text-rose-600 dark:text-rose-400 text-sm mt-0.5">{fmt(detailItem.account?.balance)}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {(detailItem.account?.is_open_contract || String(detailItem.account?.frequency || '').toLowerCase() === 'open contract')
                      ? 'Open Contract (Flexible)'
                      : `${fmt(detailItem.account?.installment_amount)} / ${detailItem.account?.frequency || 'Monthly'}`}
                  </div>
                </div>
                <div className="p-3 bg-muted/20 rounded-xl border border-border flex flex-col justify-between">
                  <div className="text-[10px] text-muted-foreground uppercase font-bold">Contract Status</div>
                  <div className="mt-1">
                    <StatusBadge status={isFullyPaidAccount(detailItem.account) ? 'Fully Paid' : detailItem.account?.status} />
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {isFullyPaidAccount(detailItem.account)
                      ? (detailItem.account?.customer_standing || 'Cleared / Good Standing')
                      : (detailItem.account?.is_open_contract || String(detailItem.account?.frequency || '').toLowerCase() === 'open contract')
                        ? 'Open Contract • No fixed term'
                        : `${detailItem.account?.paid_installments ?? 0}/${detailItem.account?.total_terms ?? detailItem.account?.number_of_installments} terms paid`}
                  </div>
                </div>
              </div>

              <div className="p-3.5 bg-muted/30 rounded-xl border border-border space-y-2">
                <div className="flex justify-between items-center text-xs flex-wrap gap-2">
                  <span className="font-bold text-foreground">
                    Real-Time Repayment Progress ({detailItem.account?.progress_percentage}%)
                    {isFullyPaidAccount(detailItem.account) && (
                      <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] bg-emerald-600 text-white font-bold">Fully Paid</span>
                    )}
                  </span>
                  <div className="flex gap-4 font-mono flex-wrap">
                    <span>Total Payable: <strong className="text-foreground">{fmt(detailItem.account?.total_payable)}</strong></span>
                    <span>Confirmed Paid: <strong className="text-emerald-600">{fmt(detailItem.account?.paid)}</strong></span>
                    <span>Remaining: <strong className={isFullyPaidAccount(detailItem.account) ? 'text-emerald-600' : 'text-rose-600'}>{fmt(isFullyPaidAccount(detailItem.account) ? 0 : detailItem.account?.balance)}</strong></span>
                  </div>
                </div>
                <ProgressBar value={detailItem.account?.progress_percentage || 0} />
              </div>

              {isFullyPaidAccount(detailItem.account) && (
                <div className="p-3.5 bg-emerald-50/80 dark:bg-emerald-950/30 rounded-xl border border-emerald-300 dark:border-emerald-800 flex flex-wrap justify-between items-center gap-3">
                  <div className="space-y-0.5">
                    <div className="text-[10px] uppercase font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                      <FiAward className="w-3.5 h-3.5" />
                      <span>Contract Completed &amp; Cleared</span>
                    </div>
                    <div className="text-xs font-semibold text-foreground">
                      Completed: <strong className="font-mono">{detailItem.account?.completed_at ? fmtDate(detailItem.account.completed_at) : 'Settled'}</strong>
                      {' '}• Final Verifier: <strong>{detailItem.account?.final_verifier_name || 'Store Administrator'}</strong>
                      {detailItem.account?.has_agent ? ` • Agent Contribution: ${detailItem.account?.agent_contribution_status || 'Settled'}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setClearanceModal({ installmentId: detailItem.account.installment_id, view: 'certificate' })}
                      className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <FiAward className="w-3.5 h-3.5" />
                      <span>Certificate</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setClearanceModal({ installmentId: detailItem.account.installment_id, view: 'soa' })}
                      className="px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <FiFileText className="w-3.5 h-3.5" />
                      <span>Final SOA</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Next Due Amortization Card */}
              {detailItem.next_payment && (
                <div className="p-3.5 bg-amber-50/70 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-800 flex justify-between items-center">
                  <div>
                    <div className="text-[10px] uppercase font-bold text-amber-800 dark:text-amber-400 flex items-center gap-1">
                      <FiClock className="w-3 h-3" />
                      <span>Next Amortization Due (Installment #{detailItem.next_payment.installment_no})</span>
                    </div>
                    <div className="text-sm font-bold text-foreground mt-0.5 font-mono">
                      Due Date: {detailItem.next_payment.due_date}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-base font-mono font-bold text-amber-900 dark:text-amber-200">
                      {fmt(detailItem.next_payment.amount_due)}
                    </div>
                    <StatusBadge status={detailItem.next_payment.status} />
                  </div>
                </div>
              )}

              {/* Schedules and Payment History Tabs */}
              <div className="border-t border-border pt-3">
                <div className="flex border-b border-border mb-3">
                  <button
                    type="button"
                    onClick={() => setDetailTab('schedules')}
                    className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold border-b-2 cursor-pointer transition-colors ${
                      detailTab === 'schedules' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'
                    }`}
                  >
                    <FiCalendar className="w-3.5 h-3.5" />
                    <span>Amortization Schedule ({detailItem.schedules?.length || 0})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDetailTab('payments')}
                    className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold border-b-2 cursor-pointer transition-colors ${
                      detailTab === 'payments' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'
                    }`}
                  >
                    <TbCurrencyPeso className="w-3.5 h-3.5" />
                    <span>Payment History ({detailItem.payments?.length || 0})</span>
                  </button>
                </div>

                {detailTab === 'schedules' ? (
                  <div className="max-h-56 overflow-y-auto border border-border rounded-xl">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border bg-muted/50 text-muted-foreground text-left sticky top-0">
                          <th className="py-2 px-3">#</th>
                          <th className="py-2 px-3">Due Date</th>
                          <th className="py-2 px-3 text-right">Amount Due</th>
                          <th className="py-2 px-3 text-right">Paid</th>
                          <th className="py-2 px-3 text-right">Balance</th>
                          <th className="py-2 px-3 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailItem.schedules?.map(s => (
                          <tr key={s.schedule_id} className="border-b border-border hover:bg-muted/30">
                            <td className="py-2 px-3 font-mono font-bold">{s.installment_no}</td>
                            <td className="py-2 px-3 font-mono">{s.due_date}</td>
                            <td className="py-2 px-3 text-right font-mono">{fmt(s.amount_due)}</td>
                            <td className="py-2 px-3 text-right font-mono text-emerald-600 font-semibold">{fmt(s.amount_paid)}</td>
                            <td className="py-2 px-3 text-right font-mono font-bold text-rose-600">{fmt(s.balance_due)}</td>
                            <td className="py-2 px-3 text-center"><StatusBadge status={s.status} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="max-h-56 overflow-y-auto border border-border rounded-xl">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border bg-muted/50 text-muted-foreground text-left sticky top-0">
                          <th className="py-2 px-3">Receipt #</th>
                          <th className="py-2 px-3">Date</th>
                          <th className="py-2 px-3 text-right">Amount</th>
                          <th className="py-2 px-3">Method &amp; Ref</th>
                          <th className="py-2 px-3 text-center">Status</th>
                          <th className="py-2 px-3">Proof / Staff</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailItem.payments?.length === 0 ? (
                          <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">No payments recorded yet</td></tr>
                        ) : (
                          detailItem.payments?.map(p => {
                            const proofUrl = formatInstallmentProof(p.proof_of_payment)
                            const isPending = String(p.status || '').toLowerCase().includes('pending')
                            return (
                              <tr key={p.payment_id} className="border-b border-border hover:bg-muted/30">
                                <td className="py-2 px-3 font-mono font-bold text-foreground">{p.receipt_no}</td>
                                <td className="py-2 px-3 font-mono">{p.payment_date}</td>
                                <td className={`py-2 px-3 text-right font-mono font-bold ${isPending ? 'text-amber-600' : 'text-emerald-600'}`}>
                                  {fmt(p.amount)}
                                </td>
                                <td className="py-2 px-3">
                                  <div>{p.payment_method}</div>
                                  <div className="text-[10px] font-mono text-muted-foreground">{p.reference_no || '—'}</div>
                                </td>
                                <td className="py-2 px-3 text-center">
                                  <StatusBadge status={p.status || 'Completed'} />
                                </td>
                                <td className="py-2 px-3 text-muted-foreground">
                                  <div>{p.received_by}</div>
                                  {proofUrl && (
                                    <a
                                      href={proofUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex items-center gap-1 text-[10px] font-bold text-primary hover:underline mt-0.5"
                                    >
                                      View Proof
                                    </a>
                                  )}
                                </td>
                              </tr>
                            )
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="flex justify-between items-center pt-3 border-t border-border flex-wrap gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => printInstallmentStatement(detailItem)}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-border hover:bg-muted text-foreground font-semibold cursor-pointer"
                  >
                    <FiPrinter className="w-4 h-4" />
                    <span>Print Statement</span>
                  </button>
                  {isFullyPaidAccount(detailItem.account) && (
                    <button
                      type="button"
                      onClick={() => setClearanceModal({ installmentId: detailItem.account.installment_id, view: 'both' })}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer"
                    >
                      <FiAward className="w-4 h-4" />
                      <span>Certificate &amp; Final SOA</span>
                    </button>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setDetailItem(null)}
                    className="flex items-center gap-1 px-4 py-1.5 rounded-xl border border-border hover:bg-muted text-foreground font-semibold cursor-pointer"
                  >
                    <FiX className="w-3.5 h-3.5" />
                    <span>Close</span>
                  </button>
                  {!isAdmin && !isFullyPaidAccount(detailItem.account) && detailItem.account?.balance > 0 && (
                    <button
                      type="button"
                      onClick={() => openPaymentModal(detailItem.account)}
                      className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer"
                    >
                      <TbCurrencyPeso className="w-4 h-4" />
                      <span>Record Payment</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* ─── 5. RECORD PAYMENT MODAL ─── */}
      {payModalItem && (
        <Modal
          isOpen={true}
          onClose={() => setPayModalItem(null)}
          title="Record Customer Installment Payment"
          size="lg"
        >
          <form onSubmit={handleRecordPayment} className="space-y-4 text-xs">
            <div className="p-3.5 bg-muted/40 rounded-xl border border-border space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Account Number:</span>
                <span className="font-mono font-bold text-foreground">{payModalItem.account_no}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Customer:</span>
                <span className="font-semibold text-foreground">{payModalItem.customer_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Product:</span>
                <span className="font-medium text-foreground">{payModalItem.product_name}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border text-center">
                <div className="p-2 rounded-lg bg-card border border-border">
                  <div className="text-[10px] uppercase font-bold text-muted-foreground">Total Payable</div>
                  <div className="font-mono font-bold text-foreground">{fmt(payModalItem.total_payable)}</div>
                </div>
                <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <div className="text-[10px] uppercase font-bold text-emerald-600">Total Paid</div>
                  <div className="font-mono font-bold text-emerald-600">{fmt(payModalItem.paid)}</div>
                </div>
                <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20">
                  <div className="text-[10px] uppercase font-bold text-rose-600">Remaining Balance</div>
                  <div className="font-mono font-bold text-rose-600">{fmt(payModalItem.balance)}</div>
                </div>
              </div>
              {parseFloat(payAmount) > 0 && (
                <div className="flex items-center justify-between pt-2 border-t border-border/60">
                  <span className="text-muted-foreground font-semibold">Balance After This Payment:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-foreground">
                      {fmt(Math.max(0, (Number(payModalItem.balance) || 0) - (parseFloat(payAmount) || 0)))}
                    </span>
                    {Math.max(0, (Number(payModalItem.balance) || 0) - (parseFloat(payAmount) || 0)) <= 0 && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-600 text-white">
                        Complete Payment
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Itemized History of Paid Installments inside Payment Modal */}
            {payModalItem.payments_history && payModalItem.payments_history.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Itemized History of Paid Installments ({payModalItem.payments_history.length})
                </div>
                <div className="max-h-32 overflow-y-auto rounded-xl border border-border">
                  <table className="w-full text-[11px]">
                    <thead className="bg-muted/50 text-muted-foreground sticky top-0">
                      <tr>
                        <th className="py-1.5 px-2.5 text-left">Receipt #</th>
                        <th className="py-1.5 px-2.5 text-left">Date</th>
                        <th className="py-1.5 px-2.5 text-left">Method</th>
                        <th className="py-1.5 px-2.5 text-right">Amount Paid</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {payModalItem.payments_history.map((ph, idx) => (
                        <tr key={ph.payment_id || idx} className="hover:bg-muted/30">
                          <td className="py-1.5 px-2.5 font-mono font-semibold text-foreground">{ph.receipt_no}</td>
                          <td className="py-1.5 px-2.5 font-mono text-muted-foreground">{ph.payment_date}</td>
                          <td className="py-1.5 px-2.5 text-muted-foreground">{ph.payment_method}</td>
                          <td className="py-1.5 px-2.5 text-right font-mono font-bold text-emerald-600">{fmt(ph.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Payment Amount */}
            <div>
              <label className="block font-bold text-muted-foreground mb-1">
                Payment Amount (PHP) *
              </label>
              <input
                type="number"
                step="0.01"
                min="1"
                max={payModalItem.balance}
                value={payAmount}
                onChange={e => setPayAmount(e.target.value)}
                placeholder="Enter amount to pay"
                required
                className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-mono font-bold text-sm"
              />
            </div>

            {/* Payment Method & Date */}
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block font-bold text-muted-foreground mb-1">Payment Method</label>
                <select
                  value={payMethod}
                  onChange={e => setPayMethod(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-medium"
                >
                  <option value="Cash">Cash</option>
                  <option value="GCash">GCash</option>
                  <option value="Maya">Maya</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Cheque">Cheque</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-muted-foreground mb-1">Payment Date</label>
                <input
                  type="date"
                  value={payDate}
                  onChange={e => setPayDate(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-mono"
                />
              </div>
            </div>

            {/* Reference Number */}
            <div>
              <label className="block font-bold text-muted-foreground mb-1">Reference / Transaction # (Optional)</label>
              <input
                type="text"
                placeholder="e.g. GCash Ref / Bank Ref"
                value={payRef}
                onChange={e => setPayRef(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-mono"
              />
            </div>

            {/* Notes */}
            <div>
              <label className="block font-bold text-muted-foreground mb-1">Notes / Remarks</label>
              <textarea
                placeholder="Optional remarks..."
                value={payNotes}
                onChange={e => setPayNotes(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground"
              />
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-border">
              <button
                type="button"
                onClick={() => setPayModalItem(null)}
                className="flex items-center gap-1 px-4 py-2 rounded-xl border border-border hover:bg-muted text-foreground font-semibold cursor-pointer"
              >
                <FiX className="w-3.5 h-3.5" />
                <span>Cancel</span>
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer"
              >
                <FiCheckCircle className="w-3.5 h-3.5" />
                <span>{saving ? 'Processing...' : 'Confirm & Record Payment'}</span>
              </button>
            </div>
          </form>
        </Modal>
      )}

      <InstallmentClearanceModal
        isOpen={Boolean(clearanceModal?.installmentId)}
        installmentId={clearanceModal?.installmentId || null}
        initialView={clearanceModal?.view || 'both'}
        onClose={() => setClearanceModal(null)}
      />
    </div>
  )
}
