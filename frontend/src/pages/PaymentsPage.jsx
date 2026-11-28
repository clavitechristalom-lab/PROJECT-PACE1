import { useState, useEffect, useMemo, useRef, useDeferredValue } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  FiCreditCard, FiTrendingUp, FiSmartphone,
  FiEye, FiPlus, FiPrinter, FiSearch, FiCalendar,
  FiCheckCircle, FiX, FiAlertTriangle, FiFileText, FiFilter, FiTrash2,
  FiClock, FiImage, FiUser, FiDollarSign, FiShield, FiCheck, FiLayers,
  FiMapPin, FiPhone, FiMail, FiPackage, FiChevronDown, FiChevronUp, FiTag
} from 'react-icons/fi'
import {
  Btn, Badge, StatusBadge, Input, Select, Textarea, Modal,
  Table, TR, TD, SearchBar, PageHeader, StatCard, Card, CardHeader, Pagination, showToast,
  LoadingState, ErrorAlert, TableSkeleton, EmptyState, showLoading, closeLoading, confirmDelete, unifiedAlert
} from '../components/ui'
import { fmt, fmtDate, fastDeepEqual, summarizePaymentNotes } from '../lib/utils'
import { useAuth } from '../context/AuthContext'
import api, { downloadCsv, peekApiCache } from '../lib/api'
import { useRealtimeSync, triggerDataSync, SyncButton } from '../lib/realtimeSync'
import { TbCurrencyPeso } from 'react-icons/tb'
import { FiDownload } from 'react-icons/fi'
import AgentAssignmentSection from '../components/AgentAssignmentSection'
import { summarizeAgentContributions, resolveCategoryDomain } from '../lib/agentContribution'

export const formatProofUrl = (url) => {
  if (!url) return null;
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
    return trimmed;
  }
  const normalized = trimmed.replace(/\\/g, '/');
  if (normalized.includes('/storage/')) {
    return normalized.substring(normalized.indexOf('/storage/'));
  }
  if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
    return normalized;
  }
  const clean = normalized.replace(/^\/+/, '');
  return clean.startsWith('storage/') ? `/${clean}` : `/storage/${clean}`;
};

function PaymentMethodBadge({ method, provider }) {
  const m = (provider || method || '').toLowerCase()
  if (m.includes('gcash')) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800">
        <FiSmartphone className="w-3 h-3 text-blue-500" />
        <span>GCash</span>
      </span>
    )
  }
  if (m.includes('maya')) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800">
        <FiSmartphone className="w-3 h-3 text-emerald-500" />
        <span>Maya</span>
      </span>
    )
  }
  if (m.includes('bdo') || m.includes('bpi') || m.includes('unionbank') || m.includes('bank') || m.includes('online')) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800">
        <FiCreditCard className="w-3 h-3 text-indigo-500" />
        <span>{provider || method}</span>
      </span>
    )
  }
  if (m.includes('installment')) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800">
        <FiFileText className="w-3 h-3 text-amber-500" />
        <span>Installment</span>
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-muted text-muted-foreground border border-border">
      <TbCurrencyPeso className="w-3 h-3 text-emerald-500" />
      <span>{provider || method || 'Cash'}</span>
    </span>
  )
}

export default function PaymentsPage() {
  const [searchParams] = useSearchParams()
  const { user } = useAuth()
  const isStoreAdmin = user?.role === 'Store Administrator' || user?.role === 'Store Admin'

  const [payments, setPayments] = useState(() => {
    const cached = peekApiCache('/payments')
    return Array.isArray(cached?.payments) ? cached.payments : []
  })
  const [installments, setInstallments] = useState(() => {
    const cached = peekApiCache('/installments')
    return Array.isArray(cached?.installments) ? cached.installments : []
  })
  const [products, setProducts] = useState(() => {
    const cached = peekApiCache('/products')
    if (Array.isArray(cached?.products)) return cached.products
    try {
      const saved = sessionStorage.getItem('pace_cached_products')
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })
  const [customers, setCustomers] = useState(() => {
    const cached = peekApiCache('/customers')
    if (Array.isArray(cached?.customers)) return cached.customers
    try {
      const saved = sessionStorage.getItem('pace_cached_customers')
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })
  const [monitoring, setMonitoring] = useState(() => peekApiCache('/payments/monitoring') || null)
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
    return !Array.isArray(peekApiCache('/payments')?.payments)
  })
  const [error, setError] = useState('')

  // Resolve Store Admin assigned branch name robustly
  const userBranchName = useMemo(() => {
    if (!user) return ''
    if (user?.employee?.branch?.name) return user.employee.branch.name
    if (typeof user?.employee?.branch === 'string' && user.employee.branch) return user.employee.branch
    if (user?.employee?.branch_name) return user.employee.branch_name
    if (user?.branch_name) return user.branch_name
    if (user?.branch?.name) return user.branch.name
    if (user?.employee?.branch_id && branches.length > 0) {
      const match = branches.find(b => String(b.id || b.branch_id) === String(user.employee.branch_id))
      if (match?.name) return match.name
    }
    return ''
  }, [user, branches])

  // Filters
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [methodFilter, setMethodFilter] = useState('All')
  const [branchFilter, setBranchFilter] = useState(isStoreAdmin ? (userBranchName || 'Assigned Branch') : 'All')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 10

  // Keep branchFilter synced for Store Admin
  useEffect(() => {
    if (isStoreAdmin && userBranchName && branchFilter !== userBranchName) {
      setBranchFilter(userBranchName)
    }
  }, [isStoreAdmin, userBranchName, branchFilter])

  // Modals & Printing
  const [newPayModal, setNewPayModal] = useState(false)
  const [viewReceipt, setViewReceipt] = useState(null)
  const [viewPayment, setViewPayment] = useState(null)
  const [saving, setSaving] = useState(false)
  const [printMode, setPrintMode] = useState('summary') // 'summary' | 'receipt'
  const [printReceiptData, setPrintReceiptData] = useState(null)
  const [settings, setSettings] = useState(null)

  const [paymentMode, setPaymentMode] = useState('installment')
  const [cashCustMode, setCashCustMode] = useState('existing')
  const [cashCustId, setCashCustId] = useState('')
  const [cashCustSearch, setCashCustSearch] = useState('')
  const [cashFirstName, setCashFirstName] = useState('')
  const [cashLastName, setCashLastName] = useState('')
  const [cashPhone, setCashPhone] = useState('')
  const [cashAddress, setCashAddress] = useState('')
  const [cashMainCat, setCashMainCat] = useState('')
  const [cashProdCat, setCashProdCat] = useState('')
  const [cashProductId, setCashProductId] = useState('')
  const [cashQty, setCashQty] = useState('1')
  const [cashDiscount, setCashDiscount] = useState('0')

  const [selectedInstId, setSelectedInstId] = useState('')
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState('Cash')
  const [payRef, setPayRef] = useState('')
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10))
  const [payNotes, setPayNotes] = useState('')
  const [cashTendered, setCashTendered] = useState('')
  const [bankName, setBankName] = useState('BDO')
  const [senderName, setSenderName] = useState('')
  const [chequeNo, setChequeNo] = useState('')
  const [chequeBank, setChequeBank] = useState('')
  const [chequeDate, setChequeDate] = useState('')
  const [instSearchQuery, setInstSearchQuery] = useState('')
  const [showAccountHistory, setShowAccountHistory] = useState(false)
  const [hasAgent, setHasAgent] = useState(false)
  const [assignedAgentId, setAssignedAgentId] = useState('')
  const [salesAgents, setSalesAgents] = useState([])
  const [loadingAgents, setLoadingAgents] = useState(false)
  const [agentsError, setAgentsError] = useState('')
  const agentCacheRef = useRef({})

  const resetNewPaymentForm = () => {
    setPaymentMode('installment')
    setCashCustMode('existing')
    setCashCustId('')
    setCashCustSearch('')
    setCashFirstName('')
    setCashLastName('')
    setCashPhone('')
    setCashAddress('')
    setCashMainCat('')
    setCashProdCat('')
    setCashProductId('')
    setCashQty('1')
    setCashDiscount('0')
    setSelectedInstId('')
    setPayAmount('')
    setPayRef('')
    setPayNotes('')
    setCashTendered('')
    setSenderName('')
    setChequeNo('')
    setChequeBank('')
    setChequeDate('')
    setInstSearchQuery('')
    setShowAccountHistory(false)
    setHasAgent(false)
    setAssignedAgentId('')
    setAgentsError('')
  }

  const ensureCashCatalogLoaded = async () => {
    const activeBranch = isStoreAdmin ? (userBranchName || branchFilter) : branchFilter
    const resolvedBranch = activeBranch && activeBranch !== 'All' ? activeBranch : undefined
    try {
      const [prodRes, custRes] = await Promise.all([
        api.products.getAll({ branch: resolvedBranch }, { fresh: true }).catch(() => null),
        api.customers.getAll({ branch: resolvedBranch }, { fresh: true }).catch(() => null),
      ])
      if (!isMountedRef.current) return
      if (Array.isArray(prodRes?.products)) setProducts(prodRes.products)
      if (Array.isArray(custRes?.customers)) setCustomers(custRes.customers)
    } catch {}
  }

  const handlePaymentModeChange = (nextMode) => {
    setPaymentMode(nextMode)
    setCashTendered('')
    setPayNotes('')
    setHasAgent(false)
    setAssignedAgentId('')
    if (nextMode === 'product_cash' && (products.length === 0 || customers.length === 0)) {
      ensureCashCatalogLoaded()
    }
  }

  const resolveAgentBranchScope = (instObj) => {
    const branch = instObj?.branch_id || user?.employee?.branch_id || user?.branch_id || ''
    return branch ? String(branch) : 'all'
  }

  const fetchSalesAgents = async (branchKey) => {
    const key = String(branchKey || 'all')
    if (agentCacheRef.current[key]) {
      const cachedList = agentCacheRef.current[key]
      setSalesAgents(cachedList)
      setAgentsError('')
      setAssignedAgentId(prev =>
        prev && !cachedList.some(a => String(a.employee_id) === String(prev)) ? '' : prev
      )
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
        setAssignedAgentId(prev =>
          prev && !list.some(a => String(a.employee_id) === String(prev)) ? '' : prev
        )
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
    setHasAgent(nextHasAgent)
    if (!nextHasAgent) {
      setAssignedAgentId('')
      setAgentsError('')
    }
  }

  const inFlightRef = useRef(false)
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const loadData = async (silent = false, signal) => {
    // 1-2s Overlap Guard: Skip if previous cycle is still in flight
    if (inFlightRef.current) return
    inFlightRef.current = true

    const isBg = silent || payments.length > 0
    if (!isBg) setLoading(true)
    if (!isBg) setError('')
    try {
      const reqOpts = signal ? { signal } : {}
      const needStatic = branches.length === 0 || !settings

      const activeBranch = isStoreAdmin ? (userBranchName || branchFilter) : branchFilter
      const resolvedBranch = activeBranch !== 'All' ? activeBranch : undefined

      const promises = [
        api.payments.getAll({
          search: search || undefined,
          payment_method: methodFilter !== 'All' ? methodFilter : undefined,
          branch: resolvedBranch,
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
        }, reqOpts),
        api.payments.getMonitoring({ branch: resolvedBranch }, reqOpts).catch(() => null),
      ]

      if (needStatic) {
        promises.push(
          api.branches.getAll(reqOpts).catch(() => []),
          api.system.getSettings(reqOpts).catch(() => null)
        )
      }

      const results = await Promise.all(promises)
      if (!isMountedRef.current) return

      const paymentsRes = results[0]
      const monRes = results[1]
      let idx = 2

      let newBranches = null
      let settingsRes = null
      if (needStatic) {
        newBranches = Array.isArray(results[idx]) ? results[idx] : (results[idx]?.branches || [])
        idx++
        settingsRes = results[idx]
      }

      const newPayments = paymentsRes?.payments || []

      setPayments(prev => fastDeepEqual(prev, newPayments) ? prev : newPayments)
      setMonitoring(prev => fastDeepEqual(prev, monRes) ? prev : monRes)

      if (newBranches !== null) {
        setBranches(prev => fastDeepEqual(prev, newBranches) ? prev : newBranches)
      }
      if (settingsRes) {
        setSettings(prev => fastDeepEqual(prev, settingsRes) ? prev : settingsRes)
      }
    } catch (err) {
      if (!isMountedRef.current) return
      if (err?.name === 'AbortError') return
      console.error('Failed to load payments:', err)
      if (!isBg) setError(err.message || 'Failed to fetch payment collections')
    } finally {
      inFlightRef.current = false
      if (!isBg && isMountedRef.current) setLoading(false)
    }
  }

  // Lazy-load active installments strictly when opening the New Payment modal
  useEffect(() => {
    if (!newPayModal) return
    const activeBranch = isStoreAdmin ? (userBranchName || branchFilter) : branchFilter
    const resolvedBranch = activeBranch !== 'All' ? activeBranch : undefined
    api.installments.getAll({ status: 'Active', branch: resolvedBranch })
      .then((res) => {
        if (isMountedRef.current && Array.isArray(res?.installments)) {
          setInstallments(prev => fastDeepEqual(prev, res.installments) ? prev : res.installments)
        }
      })
      .catch(() => {})
  }, [newPayModal, branchFilter, isStoreAdmin, userBranchName])

  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(() => {
      loadData(false, controller.signal)
    }, search ? 300 : 0)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [methodFilter, branchFilter, search, dateFrom, dateTo])

  // On-demand click-driven synchronization
  const { sync: syncPayments, isSyncing: isSyncingPayments } = useRealtimeSync(
    (_, signal) => loadData(false, signal),
    [],
    { module: 'payments' }
  )

  useEffect(() => {
    const id = searchParams.get('id')
    if (id) {
      const found = payments.find(p => String(p.payment_id) === String(id))
      if (found) {
        setViewReceipt(found)
      } else {
        api.payments.getAll({ search: id })
          .then(res => {
            if (res.payments?.length > 0) {
              setViewReceipt(res.payments[0])
            }
          })
          .catch(err => console.warn('Could not auto-open receipt:', err))
      }
    }
  }, [searchParams, payments.length])

  const mainCategoryCounts = useMemo(() => {
    let appliances = 0
    let furniture = 0
    products.forEach(p => {
      const domain = resolveCategoryDomain(p)
      if (domain === 'Appliances') appliances++
      else if (domain === 'Furniture') furniture++
    })
    return { appliances, furniture }
  }, [products])

  const productCategories = useMemo(() => {
    const counts = new Map()
    products.forEach(p => {
      if (cashMainCat && resolveCategoryDomain(p) !== cashMainCat) return
      const cat = p?.category || p?.category_group || p?.main_category || 'Uncategorized'
      counts.set(cat, (counts.get(cat) || 0) + 1)
    })
    return Array.from(counts.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, count]) => ({ name, count }))
  }, [products, cashMainCat])

  const filteredCashProducts = useMemo(() => {
    return products.filter(p => {
      if (cashMainCat && resolveCategoryDomain(p) !== cashMainCat) return false
      const catLabel = p?.category || p?.category_group || p?.main_category || 'Uncategorized'
      if (cashProdCat && catLabel !== cashProdCat) return false
      return true
    })
  }, [products, cashMainCat, cashProdCat])

  const userBranchId = user?.employee?.branch_id || user?.employee?.branch?.id || user?.branch_id || null
  const selectableCashCustomers = useMemo(() => {
    let list = customers
    if (isStoreAdmin && userBranchId) {
      list = list.filter(c => !c.branch_id || Number(c.branch_id) === Number(userBranchId))
    }
    const q = cashCustSearch.trim().toLowerCase()
    if (!q) return list
    return list.filter(c => {
      if (String(c.customer_id) === String(cashCustId)) return true
      const hay = `${c.first_name || ''} ${c.last_name || ''} ${c.customer_code || ''} ${c.phone || ''}`.toLowerCase()
      return hay.includes(q)
    })
  }, [customers, isStoreAdmin, userBranchId, cashCustSearch, cashCustId])

  const handleInstSelect = (instId) => {
    setSelectedInstId(instId)
    const inst = installments.find(i => i.installment_id === parseInt(instId))
    if (inst) {
      const defaultAmount = inst.next_amount_due > 0 ? inst.next_amount_due : (inst.installment_amount || inst.balance || '')
      setPayAmount(defaultAmount ? defaultAmount.toString() : '')
      setCashTendered('')
      if (hasAgent) {
        fetchSalesAgents(resolveAgentBranchScope(inst))
      }
    }
  }

  const handleRecordPayment = async (e) => {
    e.preventDefault()

    if (paymentMode === 'product_cash') {
      if (cashCustMode === 'existing' && !cashCustId) {
        showToast('Please select a customer or switch to New Customer', 'error')
        return
      }
      if (cashCustMode === 'new' && (!cashFirstName.trim() || !cashLastName.trim())) {
        showToast('Please enter the customer first and last name', 'error')
        return
      }
      if (!cashMainCat) {
        showToast('Please select a Main Category (Appliances or Furniture)', 'error')
        return
      }
      const cashProd = products.find(p => String(p.product_id) === String(cashProductId))
      if (!cashProd) {
        showToast('Please select a product to pay in cash', 'error')
        return
      }
      const qtyNum = Math.max(1, parseInt(cashQty, 10) || 1)
      if (Number(cashProd.stock_quantity || 0) < qtyNum) {
        showToast(`Insufficient stock for ${cashProd.product_name} (Available: ${cashProd.stock_quantity || 0})`, 'error')
        return
      }
      const unitP = cashProd.discount_price ? Number(cashProd.discount_price) : Number(cashProd.unit_price || 0)
      const grossP = Math.round(unitP * qtyNum * 100) / 100
      const discP = Math.min(grossP, Math.max(0, parseFloat(cashDiscount) || 0))
      const netP = Math.max(0, Math.round((grossP - discP) * 100) / 100)
      if (netP < 1) {
        showToast('Net payable amount must be at least ₱1.00', 'error')
        return
      }
      if (cashTendered !== '' && (parseFloat(cashTendered) || 0) < netP) {
        showToast('Cash tendered cannot be less than the net payable amount', 'error')
        return
      }

      const cashNoteParts = []
      if (payNotes.trim()) cashNoteParts.push(payNotes.trim())
      if (cashTendered !== '' && parseFloat(cashTendered) > 0) {
        const tendered = parseFloat(cashTendered)
        const change = Math.max(0, tendered - netP)
        cashNoteParts.push(`Cash Tendered: ₱${tendered.toFixed(2)} | Sukli/Change: ₱${change.toFixed(2)}`)
      }

      setSaving(true)
      showLoading('Processing cash product payment...')
      try {
        const res = await api.payments.create({
          payment_type: 'product_cash',
          customer_id: cashCustMode === 'existing' ? parseInt(cashCustId, 10) : undefined,
          first_name: cashCustMode === 'new' ? cashFirstName.trim() : undefined,
          last_name: cashCustMode === 'new' ? cashLastName.trim() : undefined,
          phone: cashCustMode === 'new' ? (cashPhone.trim() || undefined) : undefined,
          address: cashCustMode === 'new' ? (cashAddress.trim() || undefined) : undefined,
          product_id: parseInt(cashProductId, 10),
          quantity: qtyNum,
          discount: discP,
          payment_date: payDate,
          notes: cashNoteParts.filter(Boolean).join(' | ') || undefined,
          user_id: user?.user_id || 1,
          has_agent: hasAgent,
          assigned_agent_id: hasAgent && assignedAgentId ? parseInt(assignedAgentId, 10) : null,
          agent_id: hasAgent && assignedAgentId ? parseInt(assignedAgentId, 10) : null,
        })

        showToast(res.message || 'Cash product payment completed successfully!', 'success')
        setNewPayModal(false)
        resetNewPaymentForm()

        if (res.payment) {
          setPayments(prev => [res.payment, ...prev])
          setViewReceipt(res.payment)
        }
        triggerDataSync('payments')
        triggerDataSync('sales')
        triggerDataSync('products')
        loadData(true)
        ensureCashCatalogLoaded()
      } catch (err) {
        showToast(err.message || 'Failed to process cash product payment', 'error')
      } finally {
        setSaving(false)
        closeLoading()
      }
      return
    }

    if (!selectedInstId) {
      showToast('Please select an active installment account', 'error')
      return
    }
    const val = parseFloat(payAmount)
    if (!val || val <= 0) {
      showToast('Please enter a valid payment amount', 'error')
      return
    }

    const selectedInst = installments.find(i => i.installment_id === parseInt(selectedInstId))
    if (selectedInst && val > (Number(selectedInst.balance) + 0.01)) {
      showToast(`Payment amount (₱${val.toFixed(2)}) exceeds outstanding balance of ₱${Number(selectedInst.balance).toFixed(2)}`, 'error')
      return
    }

    // Prepare method-specific references and notes
    let finalRef = payRef.trim()
    const noteParts = []
    if (payNotes.trim()) noteParts.push(payNotes.trim())

    if (payMethod === 'Cash') {
      if (cashTendered && parseFloat(cashTendered) > 0) {
        const change = Math.max(0, parseFloat(cashTendered) - val)
        noteParts.push(`Cash Tendered: ₱${parseFloat(cashTendered).toFixed(2)} | Sukli/Change: ₱${change.toFixed(2)}`)
      }
    } else if (payMethod === 'GCash' || payMethod === 'Maya') {
      if (senderName.trim()) noteParts.push(`Sender/Account: ${senderName.trim()}`)
      if (!finalRef) {
        showToast(`Please enter the ${payMethod} Reference Number`, 'error')
        return
      }
    } else if (payMethod === 'Bank Transfer') {
      if (bankName) noteParts.push(`Bank: ${bankName}`)
      if (senderName.trim()) noteParts.push(`Remitter: ${senderName.trim()}`)
      if (!finalRef) {
        showToast('Please enter Bank Transaction / Reference Number', 'error')
        return
      }
    } else if (payMethod === 'Cheque') {
      finalRef = chequeNo.trim() || finalRef
      if (!finalRef) {
        showToast('Please enter the Cheque Number', 'error')
        return
      }
      if (chequeBank.trim()) noteParts.push(`Issuing Bank: ${chequeBank.trim()}`)
      if (chequeDate) noteParts.push(`Cheque Date: ${chequeDate}`)
    }

    const combinedNotes = noteParts.filter(Boolean).join(' | ')

    setSaving(true)
    showLoading('Processing customer payment...')
    try {
      const res = await api.payments.create({
        payment_type: 'installment',
        installment_id: parseInt(selectedInstId),
        amount: val,
        payment_method: payMethod,
        reference_no: finalRef || null,
        payment_date: payDate,
        notes: combinedNotes || null,
        user_id: user?.user_id || 1,
        has_agent: hasAgent,
        assigned_agent_id: hasAgent && assignedAgentId ? parseInt(assignedAgentId, 10) : null,
        agent_id: hasAgent && assignedAgentId ? parseInt(assignedAgentId, 10) : null,
      })

      showToast(res.message || 'Customer payment processed successfully!', 'success')
      setNewPayModal(false)
      resetNewPaymentForm()

      if (res.payment) {
        setPayments(prev => [res.payment, ...prev])
        // Automatically open official receipt so Store Admin can inspect or print immediately
        setViewReceipt(res.payment)
      }
      triggerDataSync('payments')
      triggerDataSync('installments')
      loadData(true)
    } catch (err) {
      showToast(err.message || 'Failed to record payment', 'error')
    } finally {
      setSaving(false)
      closeLoading()
    }
  }

  const handleDeletePayment = async (id) => {
    const confirmed = await confirmDelete(
      'this payment record',
      'Are you sure you want to delete this payment record? This action cannot be undone.'
    );

    if (!confirmed) return;

    showLoading('Deleting payment...')
    try {
      await api.payments.delete(id)
      showToast('Payment deleted successfully', 'success')
      triggerDataSync('payments')
    } catch (err) {
      showToast(err.message || 'Failed to delete payment', 'error')
    } finally {
      closeLoading()
    }
  }

  const handleReceivePayment = async (p) => {
    if (!p) return;
    const isStoreAdminApproval = p.status === 'Pending Store Admin Approval';
    const isCollectorRemittance = isStoreAdminApproval || p.status === 'Collected by Collector' || p.cash_channel === 'collector';
    const instDet = p.installment_details || null;
    const proofUrl = formatProofUrl(p.proof_of_payment);
    const isDark = document.documentElement.classList.contains('dark');
    const borderCol = isDark ? 'rgba(52, 211, 153, 0.2)' : '#e2e8f0';
    const bgBox = isDark ? '#061710' : '#f8fafc';
    const textMuted = isDark ? '#94a3b8' : '#64748b';
    const textMain = isDark ? '#f8fafc' : '#0f172a';

    const result = await unifiedAlert({
      title: isStoreAdminApproval
        ? 'Approve Collector Payment (Verified by Cashier)?'
        : (isCollectorRemittance ? 'Verify Collector Remittance?' : 'Receive & Confirm Payment?'),
      html: `
        <div style="text-align: left; font-size: 13px; margin-top: 8px;">
          <div style="background: ${isDark ? 'rgba(6, 23, 16, 0.7)' : 'rgba(241, 245, 249, 0.7)'}; border: 1px solid ${borderCol}; border-radius: 12px; padding: 12px; margin-bottom: 12px; line-height: 1.6;">
            <div><strong style="color: ${textMuted}; font-size: 11px;">Receipt #:</strong> <span style="font-family: monospace; font-weight: bold; color: ${textMain};">${p.receipt_no}</span></div>
            <div><strong style="color: ${textMuted}; font-size: 11px;">Account #:</strong> <span style="font-family: monospace; font-weight: bold; color: #10b981;">${p.account_no}</span> <span style="color: ${textMuted};">(${p.customer_name}${p.customer_code ? ` • ${p.customer_code}` : ''})</span></div>
            ${p.product_name ? `<div><strong style="color: ${textMuted}; font-size: 11px;">Financed Item:</strong> <span style="font-weight: 600; color: ${textMain};">${p.product_name}</span></div>` : ''}
            <div><strong style="color: ${textMuted}; font-size: 11px;">Amount:</strong> <span style="color: #10b981; font-family: monospace; font-weight: bold; font-size: 14px;">${fmt(p.amount)}</span> <span style="color: ${textMuted}; font-size: 12px;">via ${p.payment_method}</span></div>
            ${instDet ? `
              <div style="margin-top: 6px; padding-top: 6px; border-top: 1px dashed ${borderCol}; font-size: 11px;">
                <div><strong style="color: ${textMuted};">Contract Total / Paid:</strong> <span style="font-family: monospace; color: ${textMain};">${fmt(instDet.total_payable)} / ${fmt(instDet.total_paid)}</span></div>
                <div><strong style="color: ${textMuted};">Remaining Balance:</strong> <span style="font-family: monospace; font-weight: bold; color: #f43f5e;">${fmt(instDet.remaining_balance)}</span> <span style="color: ${textMuted};">(${instDet.terms_paid}/${instDet.total_terms || '—'} terms paid)</span></div>
              </div>
            ` : ''}
            ${p.reference_no ? `<div><strong style="color: ${textMuted}; font-size: 11px;">Ref Code:</strong> <code style="font-family: monospace; font-weight: bold; background: ${isDark ? '#0c2b1e' : '#e2e8f0'}; padding: 1px 6px; border-radius: 4px; color: ${textMain};">${p.reference_no}</code></div>` : ''}
            ${p.collector_name ? `<div><strong style="color: ${textMuted}; font-size: 11px;">Collected By (Collector):</strong> <span style="font-weight: bold; color: ${textMain};">${p.collector_name}${p.collector_code ? ` (${p.collector_code})` : ''}</span></div>` : ''}
            ${p.cashier_name ? `<div><strong style="color: ${textMuted}; font-size: 11px;">Verified By (Cashier):</strong> <span style="font-weight: bold; color: #10b981;">${p.cashier_name}${p.cashier_code ? ` (${p.cashier_code})` : ''}</span></div>` : ''}
            ${p.receipt_reference ? `<div><strong style="color: ${textMuted}; font-size: 11px;">Official Receipt #:</strong> <code style="font-family: monospace; font-weight: bold; background: ${isDark ? '#0c2b1e' : '#e2e8f0'}; padding: 1px 6px; border-radius: 4px; color: #10b981;">${p.receipt_reference}</code></div>` : ''}
          </div>

          <div style="margin-bottom: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <strong style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: ${textMuted};">Proof of Payment:</strong>
              ${proofUrl ? `<a href="${proofUrl}" target="_blank" rel="noopener noreferrer" style="font-size: 11px; color: #10b981; font-weight: 600; text-decoration: underline; cursor: pointer;">View Full Image ↗</a>` : ''}
            </div>
            ${proofUrl ? `
              <div style="border: 1px solid ${borderCol}; border-radius: 12px; overflow: hidden; background: ${bgBox}; padding: 6px; display: flex; flex-direction: column; align-items: center; justify-content: center; max-height: 220px;">
                <img src="${proofUrl}" alt="Proof of Payment" style="max-height: 205px; max-width: 100%; object-fit: contain; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); cursor: pointer;" onclick="window.open('${proofUrl}', '_blank')" title="Click to view full image" onerror="this.style.display='none'; if (this.nextElementSibling) this.nextElementSibling.style.display='block';" />
                <div style="display: none; padding: 12px; text-align: center; color: ${textMuted}; font-size: 11px;">
                  Proof image file is missing or could not be loaded.
                </div>
              </div>
            ` : `
              <div style="border: 1px dashed ${borderCol}; border-radius: 8px; padding: 12px; text-align: center; color: ${textMuted}; font-size: 11px; background: ${bgBox};">
                No proof of payment attached.
              </div>
            `}
          </div>

          <p style="font-size: 11px; color: ${textMuted}; text-align: center; margin: 0; line-height: 1.4;">
            ${isStoreAdminApproval
              ? 'Approving this Cashier-verified payment will credit the Customer Installment ledger and mark the payment as Completed.'
              : "Confirming receipt will credit the customer's account and mark the payment as Completed."}
          </p>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: isStoreAdminApproval ? 'Yes, Approve Payment' : 'Yes, Receive Payment',
      cancelButtonText: 'Cancel',
      reverseButtons: true,
      icon: 'question',
      width: '14.23cm',
      height: '18.47cm',
    });

    if (!result.isConfirmed) return;

    showLoading('Receiving payment...');
    try {
      await api.payments.receive(p.payment_id);
      showToast('Payment received and credited successfully!', 'success');
      triggerDataSync('payments');
    } catch (err) {
      showToast(err.message || 'Failed to receive payment', 'error');
    } finally {
      closeLoading();
    }
  };

  const handleRejectPayment = async (p) => {
    if (!p) return;
    const result = await unifiedAlert({
      title: 'Reject Pending Payment?',
      html: `
        <div style="text-align: left; font-size: 13px; margin-top: 6px;">
          <p style="margin-bottom: 10px;">
            Reject payment <strong>${p.receipt_no}</strong> (${fmt(p.amount)}) from <strong>${p.customer_name}</strong>?
          </p>
          <input id="pace-reject-reason" type="text" placeholder="Reason for rejection (optional)" style="width: 100%; padding: 8px 10px; border-radius: 8px; border: 1px solid #cbd5e1; font-size: 12px;" />
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Yes, Reject Payment',
      cancelButtonText: 'Cancel',
      reverseButtons: true,
      icon: 'warning',
      preConfirm: () => {
        const el = document.getElementById('pace-reject-reason');
        return el ? el.value.trim() : '';
      },
    });

    if (!result.isConfirmed) return;

    showLoading('Rejecting payment...');
    try {
      await api.payments.reject(p.payment_id, { reason: result.value || undefined });
      showToast('Payment rejected and customer notified.', 'info');
      triggerDataSync('payments');
      loadData(true);
    } catch (err) {
      showToast(err.message || 'Failed to reject payment', 'error');
    } finally {
      closeLoading();
    }
  };

  const handlePrintSummary = async () => {
    setPrintMode('summary')
    setPrintReceiptData(null)
    try {
      await api.payments.logPrint()
    } catch (e) {
      console.warn('Could not log print event:', e)
    }
    setTimeout(() => {
      window.print()
    }, 120)
  }

  const handlePrintReceipt = async (p) => {
    if (!p) return
    showLoading('Preparing receipt...')
    try {
      const res = await api.payments.getById(p.payment_id)
      const data = res?.payment || p
      setPrintReceiptData(data)
      setPrintMode('receipt')
      try {
        await api.payments.logPrint(p.payment_id)
      } catch (e) {
        console.warn('Could not log print event:', e)
      }
      closeLoading()
      setTimeout(() => {
        window.print()
      }, 150)
    } catch (err) {
      closeLoading()
      setPrintReceiptData(p)
      setPrintMode('receipt')
      setTimeout(() => {
        window.print()
      }, 150)
    }
  }

  const printReceipt = () => {
    if (viewReceipt) {
      handlePrintReceipt(viewReceipt)
    } else {
      handlePrintSummary()
    }
  }

  const filteredPayments = useMemo(() => {
    let list = payments
    if (deferredSearch.trim()) {
      const q = deferredSearch.toLowerCase().trim()
      list = list.filter(p => {
        const receipt = (p.receipt_no || '').toLowerCase()
        const acc = (p.account_no || p.installment_account?.account_no || '').toLowerCase()
        const custName = (p.customer_name || '').toLowerCase()
        const custFirst = (p.installment_account?.customer?.first_name || '').toLowerCase()
        const custLast = (p.installment_account?.customer?.last_name || '').toLowerCase()
        const prodName = (p.product_name || '').toLowerCase()
        const ref = (p.reference_no || '').toLowerCase()
        const method = (p.payment_method || '').toLowerCase()
        return receipt.includes(q) || acc.includes(q) || custName.includes(q) || custFirst.includes(q) || custLast.includes(q) || prodName.includes(q) || ref.includes(q) || method.includes(q)
      })
    }
    return list
  }, [payments, deferredSearch])

  const total = filteredPayments.length
  const paginated = filteredPayments.slice((page - 1) * pageSize, page * pageSize)

  const [exporting, setExporting] = useState(false)
  const handleExportCSV = async () => {
    setExporting(true)
    try {
      await downloadCsv('/payments', {
        search: search || undefined,
        payment_method: methodFilter !== 'All' ? methodFilter : undefined,
        branch: branchFilter !== 'All' ? branchFilter : undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      })
      showToast('Payments exported successfully', 'success')
    } catch (err) {
      showToast(err.message || 'Export failed', 'error')
    } finally {
      setExporting(false)
    }
  }

  return (
    <>
      <div className="space-y-6 print:hidden">
        <PageHeader
          title="Payment Collections & Receipts"
          subtitle={
            isStoreAdmin
              ? `Store Branch Collections (${userBranchName || branchFilter || 'Assigned Branch'})`
              : 'Track official payment receipts, cash vs digital collection breakdown, and installments paid'
          }
          action={
            <div className="flex items-center gap-2 flex-wrap">
              <SyncButton sync={syncPayments} isSyncing={isSyncingPayments} label="Sync" />
              <button
                onClick={handlePrintSummary}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-border bg-card hover:bg-muted font-semibold text-xs text-foreground cursor-pointer shadow-2xs transition-colors"
                title="Print / PDF Collections Summary"
              >
                <FiPrinter className="w-4 h-4 text-primary" />
                <span>Print / PDF</span>
              </button>
              <button
                onClick={handleExportCSV}
                disabled={exporting}
                className="flex items-center gap-2 px-4 py-2 bg-muted hover:bg-muted/80 text-foreground font-semibold text-xs rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50"
              >
                {exporting ? <FiAlertTriangle className="w-4 h-4 animate-spin" /> : <FiDownload className="w-4 h-4" />}
                <span>{exporting ? 'Exporting...' : 'Export CSV'}</span>
              </button>
              {isStoreAdmin && (
                <button
                  onClick={() => {
                    resetNewPaymentForm()
                    if (products.length === 0 || customers.length === 0) {
                      ensureCashCatalogLoaded()
                    }
                    setNewPayModal(true)
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
                >
                  <FiPlus className="w-4 h-4" />
                  <span>Customer Payment</span>
                </button>
              )}
            </div>
          }
        />

        {/* Collection Monitoring Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard title="Today's Collections" value={fmt(monitoring?.today?.collected || 0)} sub={`${monitoring?.today?.count || 0} payments today`} icon={<TbCurrencyPeso className="w-5 h-5 text-emerald-500" />} color="green" />
          <StatCard title="Monthly Collections" value={fmt(monitoring?.month?.collected || 0)} sub={`${monitoring?.month?.count || 0} payments this month`} icon={<FiTrendingUp className="w-5 h-5 text-blue-500" />} color="blue" />
          <StatCard title="Total Cash Collected" value={fmt(monitoring?.total?.cash || 0)} sub="cash in register" icon={<TbCurrencyPeso className="w-5 h-5 text-indigo-500" />} color="indigo" />
          <StatCard title="Digital Collections" value={fmt(monitoring?.total?.digital || 0)} sub="GCash / Maya / Bank" icon={<FiSmartphone className="w-5 h-5 text-purple-500" />} color="purple" />
        </div>

        {/* Filter Bar */}
        <Card noPad className="p-3.5 border border-border print:hidden">
          <form onSubmit={e => { e.preventDefault(); loadData(); }} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
            <div className="lg:col-span-2 relative">
              <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                placeholder="Search receipt #, account #, customer..."
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                className="w-full pl-9 pr-8 py-2 text-xs border border-border rounded-xl bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-muted-foreground/70"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <FiX className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div>
              <select
                value={methodFilter}
                onChange={e => setMethodFilter(e.target.value)}
                className="w-full border border-border rounded-xl px-3 py-2 text-xs font-semibold bg-card text-foreground cursor-pointer"
              >
                <option value="All">All Payment Methods</option>
                <option value="Cash">Cash</option>
                <option value="GCash">GCash</option>
                <option value="Maya">Maya</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Cheque">Cheque</option>
              </select>
            </div>

            <div>
              <select
                value={isStoreAdmin ? (userBranchName || branchFilter) : branchFilter}
                disabled={isStoreAdmin}
                onChange={e => setBranchFilter(e.target.value)}
                className="w-full border border-border rounded-xl px-3 py-2 text-xs font-semibold bg-card text-foreground cursor-pointer disabled:opacity-70 disabled:bg-muted/50"
              >
                {isStoreAdmin ? (
                  <option value={userBranchName || branchFilter || 'Branch'}>{userBranchName || branchFilter || 'Assigned Branch'}</option>
                ) : (
                  <>
                    <option value="All">All Branches</option>
                    {branches.map(b => (
                      <option key={b.branch_id || b.id || b.name} value={b.name}>{b.name}</option>
                    ))}
                  </>
                )}
              </select>
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-primary text-primary-foreground font-bold text-xs rounded-xl cursor-pointer"
              >
                <FiFilter className="w-3.5 h-3.5" />
                <span>Filter</span>
              </button>
              <button
                type="button"
                onClick={() => { setSearch(''); setMethodFilter('All'); if (!isStoreAdmin) setBranchFilter('All'); setTimeout(loadData, 50); }}
                className="px-3 py-2 border border-border rounded-xl hover:bg-muted font-semibold text-xs text-muted-foreground cursor-pointer"
              >
                Reset
              </button>
            </div>
          </form>
        </Card>

        {error && <ErrorAlert message={error} onRetry={loadData} />}

        {/* Payments Table */}
        {loading ? (
          <TableSkeleton rows={6} cols={7} />
        ) : (
          <Card noPad className="border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[760px]">
                <thead>
                  <tr className="border-b border-border bg-muted/50 text-muted-foreground uppercase font-semibold text-[11px]">
                    <th className="py-3 px-4 text-left">Receipt #</th>
                    <th className="py-3 px-4 text-left">Date</th>
                    <th className="py-3 px-4 text-left">Account #</th>
                    <th className="py-3 px-4 text-left">Customer</th>
                    <th className="py-3 px-4 text-left">Branch</th>
                    <th className="py-3 px-4 text-right">Amount</th>
                    <th className="py-3 px-4 text-left">Method</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-left">Received By</th>
                    <th className="py-3 px-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {paginated.length === 0 ? (
                    <tr><td colSpan={10} className="py-8 text-center text-muted-foreground">No payments recorded</td></tr>
                  ) : (
                    paginated.map((p, i) => (
                      <tr key={p.payment_id || i} className={`hover:bg-muted/40 transition-colors ${i % 2 === 1 ? 'bg-muted/10' : ''}`}>
                        <td className="py-3 px-4 font-mono font-bold text-foreground">{p.receipt_no}</td>
                        <td className="py-3 px-4 font-mono text-muted-foreground">{p.payment_date}</td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono text-primary font-bold">{p.account_no}</span>
                            {p.payment_type === 'product_cash' && (
                              <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold">
                                Cash Product
                              </span>
                            )}
                          </div>
                          {p.product_name && (
                            <div className="text-[10px] text-muted-foreground truncate max-w-[180px]">{p.product_name}</div>
                          )}
                        </td>
                        <td className="py-3 px-4 font-semibold text-foreground">{p.customer_name}</td>
                        <td className="py-3 px-4 text-muted-foreground">{p.branch}</td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-emerald-600">{fmt(p.amount)}</td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5">
                            <PaymentMethodBadge method={p.payment_method} />
                            {p.proof_of_payment && (
                              <a
                                href={formatProofUrl(p.proof_of_payment)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 transition-colors cursor-pointer"
                                title="View Proof of Payment"
                              >
                                <FiImage className="w-3.5 h-3.5" />
                              </a>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center">
                          {p.status === 'Pending' || p.status === 'pending_collector' ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-700 shadow-xs">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                              <span>{p.status === 'pending_collector' ? 'Awaiting Collector' : 'Pending Payment'}</span>
                            </span>
                          ) : p.status === 'Collected by Collector' ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-cyan-100 text-cyan-800 dark:bg-cyan-950/60 dark:text-cyan-300 border border-cyan-300 dark:border-cyan-700 shadow-xs">
                              <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse"></span>
                              <span>Sent to Cashier</span>
                            </span>
                          ) : p.status === 'Pending Store Admin Approval' ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-700 shadow-xs">
                              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></span>
                              <span>Pending Store Admin Approval</span>
                            </span>
                          ) : p.status === 'Confirmed / Received by Cashier' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
                              <FiCheckCircle className="w-3 h-3 text-emerald-600" />
                              <span>Received by Cashier</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
                              <FiCheckCircle className="w-3 h-3 text-emerald-600" />
                              <span>{p.status || 'Completed'}</span>
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {p.status === 'Pending' || p.status === 'pending_collector' || p.status === 'Collected by Collector' || p.status === 'Pending Store Admin Approval' ? (
                            <div>
                              <span className={`italic font-semibold text-[11px] block ${p.status === 'Pending Store Admin Approval' ? 'text-indigo-600 dark:text-indigo-400' : 'text-amber-600 dark:text-amber-400'}`}>
                                {p.status === 'Pending Store Admin Approval'
                                  ? 'Cashier Verified — Ready to Approve'
                                  : p.status === 'Collected by Collector'
                                    ? 'Awaiting Cashier Receipt'
                                    : (p.status === 'pending_collector' ? 'Awaiting Collector Pickup' : 'Pending Receipt')}
                              </span>
                              {p.collector_name && (
                                <span className="text-[10px] text-muted-foreground block">
                                  Collector: {p.collector_name}
                                </span>
                              )}
                              {p.cashier_name && (
                                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold block">
                                  Cashier: {p.cashier_name}
                                </span>
                              )}
                            </div>
                          ) : (
                            <div>
                              <span className="text-muted-foreground block">{p.received_by}</span>
                              {p.collector_name && (
                                <span className="text-[10px] text-muted-foreground block">
                                  Collector: {p.collector_name}
                                </span>
                              )}
                              {p.has_agent && (
                                <span className="text-[10px] font-semibold text-primary block">
                                  {p.agent_name ? `Agent: ${p.agent_name}` : 'With Agent'} ({fmt(p.total_agent_contribution)})
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center flex items-center justify-center gap-1.5">
                          {(p.status === 'Pending' || p.status === 'Pending Store Admin Approval') && (
                            <button
                              onClick={() => handleReceivePayment(p)}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg text-white font-bold cursor-pointer transition-colors shadow-xs ${
                                p.status === 'Pending Store Admin Approval'
                                  ? 'bg-indigo-600 hover:bg-indigo-700'
                                  : 'bg-emerald-600 hover:bg-emerald-700'
                              }`}
                              title={p.status === 'Pending Store Admin Approval' ? 'Approve Cashier-Verified Payment' : 'Receive & Confirm Payment'}
                            >
                              <FiCheckCircle className="w-3.5 h-3.5" />
                              <span>{p.status === 'Pending Store Admin Approval' ? 'Approve' : 'Receive'}</span>
                            </button>
                          )}
                          {(p.status === 'Pending' || p.status === 'pending_collector' || p.status === 'Pending Store Admin Approval') && (
                            <button
                              onClick={() => handleRejectPayment(p)}
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold cursor-pointer transition-colors shadow-xs"
                              title="Reject Pending Payment"
                            >
                              <FiX className="w-3.5 h-3.5" />
                              <span>Reject</span>
                            </button>
                          )}
                          <button
                            onClick={() => setViewPayment(p)}
                            className="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-border hover:bg-muted font-semibold cursor-pointer transition-colors"
                            title="View Payment Details"
                          >
                            <FiEye className="w-4 h-4 text-blue-500" />
                          </button>
                          <button
                            onClick={() => setViewReceipt(p)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg border border-border hover:bg-muted font-semibold cursor-pointer transition-colors"
                            title="View Official Receipt"
                          >
                            <FiFileText className="w-3.5 h-3.5 text-amber-500" />
                            <span>Receipt</span>
                          </button>
                          <button
                            onClick={() => handleDeletePayment(p.payment_id)}
                            className="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-border hover:bg-rose-500/10 hover:text-rose-600 font-semibold cursor-pointer transition-colors text-rose-500"
                            title="Delete Payment"
                          >
                            <FiTrash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <Pagination page={page} total={total} pageSize={pageSize} onChange={setPage} />
          </Card>
        )}

        {/* OFFICIAL RECEIPT MODAL */}
        {viewReceipt && (
          <Modal
            isOpen={true}
            onClose={() => setViewReceipt(null)}
            title="Official Payment Receipt"
            size="lg"
          >
            <div className="space-y-4 text-xs">
              <div className="text-center pb-3 border-b border-border space-y-0.5">
                <div className="text-base font-black tracking-wider text-foreground">Z-LICZ APPLIANCES & FURNITURE</div>
                <div className="text-[11px] text-muted-foreground">{viewReceipt.branch || 'Headquarters'} · Official Collection Receipt</div>
                <div className="text-xs font-mono font-bold text-primary pt-1">Receipt #{viewReceipt.receipt_no}</div>
              </div>

              <div className="space-y-2 p-3 bg-muted/20 rounded-xl border border-border">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Payment Date:</span>
                  <span className="font-mono font-semibold text-foreground">{viewReceipt.payment_date}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {viewReceipt.payment_type === 'product_cash' ? 'Invoice # (Cash Sale):' : viewReceipt.account_no?.startsWith('REQ') ? 'Request / Order:' : 'Installment:'}
                  </span>
                  <span className="font-mono font-bold text-primary">{viewReceipt.account_no}</span>
                </div>
                {viewReceipt.product_name && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Product:</span>
                    <span className="font-semibold text-foreground">{viewReceipt.product_name}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Received From (Customer):</span>
                  <span className="font-semibold text-foreground">{viewReceipt.customer_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Payment Method:</span>
                  <PaymentMethodBadge method={viewReceipt.payment_method} />
                </div>
                {viewReceipt.reference_no && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Reference Number:</span>
                    <span className="font-mono text-foreground">{viewReceipt.reference_no}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Authorized Staff:</span>
                  <span className="font-medium text-foreground">{viewReceipt.received_by}</span>
                </div>
                {viewReceipt.has_agent && (
                  <>
                    <div className="flex justify-between pt-1 border-t border-border/60">
                      <span className="text-muted-foreground">Sales Agent:</span>
                      <span className="font-semibold text-primary">
                        {viewReceipt.agent_name ? `${viewReceipt.agent_name}${viewReceipt.agent_code ? ` (${viewReceipt.agent_code})` : ''}` : 'With Agent'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Agent Contribution:</span>
                      <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        {fmt(viewReceipt.total_agent_contribution)}
                      </span>
                    </div>
                  </>
                )}

                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl border border-emerald-200 dark:border-emerald-900 mt-2 flex justify-between items-center">
                  <span className="text-xs font-bold text-emerald-900 dark:text-emerald-300 uppercase">Amount Paid:</span>
                  <span className="text-lg font-mono font-bold text-emerald-600">{fmt(viewReceipt.amount)}</span>
                </div>
              </div>

              {viewReceipt.notes && (
                <div className="text-[11px] text-muted-foreground bg-muted/30 p-2.5 rounded-xl border border-border">
                  <strong>Remarks:</strong> {summarizePaymentNotes(viewReceipt.notes)}
                </div>
              )}

              <div className="flex justify-between items-center pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => handlePrintReceipt(viewReceipt)}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-border bg-primary text-primary-foreground hover:bg-primary/90 font-semibold cursor-pointer shadow-xs"
                >
                  <FiPrinter className="w-3.5 h-3.5" />
                  <span>Print / PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewReceipt(null)}
                  className="flex items-center gap-1 px-4 py-1.5 rounded-xl border border-border hover:bg-muted font-semibold cursor-pointer"
                >
                  <FiX className="w-3.5 h-3.5" />
                  <span>Close</span>
                </button>
              </div>
            </div>
          </Modal>
        )}

        {/* CUSTOMER PAYMENT MODAL */}
        {newPayModal && (() => {
          const selectedInst = installments.find(i => i.installment_id === parseInt(selectedInstId))
          const accountPayments = selectedInst ? payments.filter(p => p.installment_id === selectedInst.installment_id) : []
          const currentBal = selectedInst ? Number(selectedInst.balance) || 0 : 0
          const inputAmount = parseFloat(payAmount) || 0
          const balanceAfter = Math.max(0, currentBal - inputAmount)
          const isFullPayment = currentBal > 0 && inputAmount >= currentBal
          const isOverpayment = currentBal > 0 && inputAmount > currentBal
          const monthlyDue = selectedInst ? (selectedInst.installment_amount || selectedInst.next_amount_due || 0) : 0
          const progressPct = selectedInst && selectedInst.total_payable > 0
            ? Math.min(100, Math.round(((selectedInst.paid || 0) / selectedInst.total_payable) * 100))
            : 0
          const cashTenderedVal = parseFloat(cashTendered) || 0
          const changeDue = payMethod === 'Cash' && cashTenderedVal > inputAmount
            ? cashTenderedVal - inputAmount
            : 0

          const filteredAccounts = installments.filter(inst => {
            if (!instSearchQuery.trim()) return true
            const q = instSearchQuery.toLowerCase()
            return (
              (inst.account_no && inst.account_no.toLowerCase().includes(q)) ||
              (inst.customer_name && inst.customer_name.toLowerCase().includes(q)) ||
              (inst.customer_phone && inst.customer_phone.toLowerCase().includes(q)) ||
              (inst.product_name && inst.product_name.toLowerCase().includes(q))
            )
          })

          const paymentAgentSummary = (() => {
            if (!hasAgent || !selectedInst || inputAmount <= 0) {
              return summarizeAgentContributions([], hasAgent)
            }
            const itemsSummary =
              Array.isArray(selectedInst.sale_items_summary) && selectedInst.sale_items_summary.length > 0
                ? selectedInst.sale_items_summary
                : selectedInst.product_category
                  ? [{ category: selectedInst.product_category, line_total: 1 }]
                  : []
            const totalWeight = itemsSummary.reduce((sum, it) => sum + Math.max(0, Number(it.line_total) || 0), 0)
            if (totalWeight <= 0) {
              return summarizeAgentContributions(
                selectedInst.product_category
                  ? [{ netLineTotal: inputAmount, category: selectedInst.product_category }]
                  : [],
                true
              )
            }
            let remaining = Math.round(inputAmount * 100) / 100
            const scaledItems = itemsSummary.map((it, idx) => {
              const isLast = idx === itemsSummary.length - 1
              const share = isLast
                ? Math.max(0, Math.round(remaining * 100) / 100)
                : Math.round(inputAmount * ((Math.max(0, Number(it.line_total) || 0)) / totalWeight) * 100) / 100
              remaining = Math.max(0, Math.round((remaining - share) * 100) / 100)
              return {
                netLineTotal: share,
                category: it.category_domain || it.category || '',
                category_domain: it.category_domain || null,
              }
            })
            return summarizeAgentContributions(scaledItems, true)
          })()

          const selectedCashProduct = products.find(p => String(p.product_id) === String(cashProductId)) || null
          const cashUnitPrice = selectedCashProduct
            ? (selectedCashProduct.discount_price ? Number(selectedCashProduct.discount_price) : Number(selectedCashProduct.unit_price || 0))
            : 0
          const cashQtyNum = Math.max(1, parseInt(cashQty, 10) || 1)
          const cashGrossTotal = Math.round(cashUnitPrice * cashQtyNum * 100) / 100
          const cashDiscNum = Math.min(cashGrossTotal, Math.max(0, parseFloat(cashDiscount) || 0))
          const cashNetPayable = Math.max(0, Math.round((cashGrossTotal - cashDiscNum) * 100) / 100)
          const cashStockAvail = selectedCashProduct ? Number(selectedCashProduct.stock_quantity || 0) : 0
          const isCashOverStock = Boolean(selectedCashProduct) && cashQtyNum > cashStockAvail
          const cashTenderedProductVal = cashTendered !== '' ? (parseFloat(cashTendered) || 0) : cashNetPayable
          const cashProductChangeDue = Math.max(0, cashTenderedProductVal - cashNetPayable)
          const isCashProductInsufficient = cashTendered !== '' && cashTenderedProductVal < cashNetPayable

          const cashProductAgentSummary = summarizeAgentContributions(
            selectedCashProduct && cashNetPayable > 0
              ? [{
                  netLineTotal: cashNetPayable,
                  product: selectedCashProduct,
                  category: selectedCashProduct.category || cashProdCat || cashMainCat || '',
                }]
              : [],
            hasAgent
          )

          const isSubmitDisabled = paymentMode === 'product_cash'
            ? (saving || !cashMainCat || !selectedCashProduct || cashNetPayable <= 0 || isCashOverStock || isCashProductInsufficient)
            : (saving || !selectedInst || inputAmount <= 0 || isOverpayment)

          return (
            <Modal
              isOpen={true}
              onClose={() => {
                setNewPayModal(false)
                resetNewPaymentForm()
              }}
              title="Customer Payment"
              size="xl"
            >
              <form onSubmit={handleRecordPayment} className="space-y-4 text-xs">
                <div className="p-3 rounded-2xl bg-muted/30 border border-border space-y-2">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Select Payment Type
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => handlePaymentModeChange('installment')}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-3 ${
                        paymentMode === 'installment'
                          ? 'border-primary bg-primary/10 shadow-xs'
                          : 'border-border bg-card hover:bg-muted/40'
                      }`}
                    >
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                        paymentMode === 'installment'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground'
                      }`}>
                        <FiCreditCard className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-xs text-foreground">Installment Payment</div>
                        <div className="text-[11px] text-muted-foreground">Pay active installment balance or amortization</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => handlePaymentModeChange('product_cash')}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-3 ${
                        paymentMode === 'product_cash'
                          ? 'border-emerald-600 bg-emerald-500/10 shadow-xs'
                          : 'border-border bg-card hover:bg-muted/40'
                      }`}
                    >
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                        paymentMode === 'product_cash'
                          ? 'bg-emerald-600 text-white'
                          : 'bg-muted text-muted-foreground'
                      }`}>
                        <FiPackage className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-xs text-foreground">Pay Product Cash</div>
                        <div className="text-[11px] text-muted-foreground">Direct cash payment for a catalog product</div>
                      </div>
                    </button>
                  </div>
                </div>

                {paymentMode === 'product_cash' ? (
                  <>
                    <div className="p-4 rounded-2xl bg-muted/30 border border-border space-y-3">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-primary text-[11px]">
                          <FiUser className="w-4 h-4" />
                          <span>Customer Information</span>
                        </div>
                        <div className="inline-flex rounded-xl border border-border bg-card p-0.5 text-[11px]">
                          <button
                            type="button"
                            onClick={() => setCashCustMode('existing')}
                            className={`px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
                              cashCustMode === 'existing'
                                ? 'bg-primary text-primary-foreground'
                                : 'text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            Existing Customer
                          </button>
                          <button
                            type="button"
                            onClick={() => setCashCustMode('new')}
                            className={`px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
                              cashCustMode === 'new'
                                ? 'bg-primary text-primary-foreground'
                                : 'text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            + New Customer
                          </button>
                        </div>
                      </div>

                      {cashCustMode === 'existing' ? (
                        <div className="space-y-2">
                          <div className="relative">
                            <FiSearch className="w-3.5 h-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                            <input
                              type="text"
                              value={cashCustSearch}
                              onChange={e => setCashCustSearch(e.target.value)}
                              placeholder="Quick search customer name, code, or phone..."
                              className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-border bg-card text-foreground text-xs"
                            />
                          </div>
                          <select
                            value={cashCustId}
                            onChange={e => setCashCustId(e.target.value)}
                            required
                            className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-semibold cursor-pointer"
                          >
                            <option value="">-- Select Customer ({selectableCashCustomers.length} available) --</option>
                            {selectableCashCustomers.map(c => (
                              <option key={c.customer_id} value={c.customer_id}>
                                {c.customer_code ? `[${c.customer_code}] ` : ''}{c.first_name} {c.last_name}{c.phone ? ` — ${c.phone}` : ''}
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <div>
                            <label className="block font-bold text-muted-foreground mb-1 text-[11px]">First Name *</label>
                            <input
                              type="text"
                              value={cashFirstName}
                              onChange={e => setCashFirstName(e.target.value)}
                              placeholder="Juan"
                              required
                              className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-medium"
                            />
                          </div>
                          <div>
                            <label className="block font-bold text-muted-foreground mb-1 text-[11px]">Last Name *</label>
                            <input
                              type="text"
                              value={cashLastName}
                              onChange={e => setCashLastName(e.target.value)}
                              placeholder="Dela Cruz"
                              required
                              className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-medium"
                            />
                          </div>
                          <div>
                            <label className="block font-bold text-muted-foreground mb-1 text-[11px]">Phone Number</label>
                            <input
                              type="text"
                              value={cashPhone}
                              onChange={e => setCashPhone(e.target.value)}
                              placeholder="09XXXXXXXXX"
                              className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-mono"
                            />
                          </div>
                          <div>
                            <label className="block font-bold text-muted-foreground mb-1 text-[11px]">Address</label>
                            <input
                              type="text"
                              value={cashAddress}
                              onChange={e => setCashAddress(e.target.value)}
                              placeholder="Customer address"
                              className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground"
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="p-4 rounded-2xl bg-card border border-border space-y-3">
                      <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider flex items-center gap-1.5">
                        <FiPackage className="text-emerald-500" /> Product Selection & Cash Payment
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        <div>
                          <label className="block font-bold text-muted-foreground mb-1 text-[11px]">Main Category *</label>
                          <select
                            value={cashMainCat}
                            onChange={e => {
                              const nextMain = e.target.value
                              setCashMainCat(nextMain)
                              if (selectedCashProduct && nextMain && resolveCategoryDomain(selectedCashProduct) !== nextMain) {
                                setCashProductId('')
                                setCashQty('1')
                                setCashDiscount('0')
                                setCashTendered('')
                              }
                              if (cashProdCat && nextMain) {
                                const catStillValid = products.some(
                                  p =>
                                    resolveCategoryDomain(p) === nextMain &&
                                    (p?.category || p?.category_group || p?.main_category || 'Uncategorized') === cashProdCat
                                )
                                if (!catStillValid) setCashProdCat('')
                              }
                            }}
                            required
                            className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-semibold cursor-pointer"
                          >
                            <option value="">-- Select Main Category --</option>
                            <option value="Appliances">Appliances ({mainCategoryCounts.appliances})</option>
                            <option value="Furniture">Furniture ({mainCategoryCounts.furniture})</option>
                          </select>
                        </div>

                        <div>
                          <label className="block font-bold text-muted-foreground mb-1 text-[11px]">Product Category</label>
                          <select
                            value={cashProdCat}
                            onChange={e => {
                              const nextCat = e.target.value
                              setCashProdCat(nextCat)
                              if (selectedCashProduct && nextCat && (selectedCashProduct.category || 'Uncategorized') !== nextCat) {
                                setCashProductId('')
                              }
                            }}
                            className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-medium cursor-pointer"
                          >
                            <option value="">
                              All {cashMainCat ? `${cashMainCat} ` : ''}Categories ({filteredCashProducts.length})
                            </option>
                            {productCategories.map(cat => (
                              <option key={cat.name} value={cat.name}>
                                {cat.name} ({cat.count})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block font-bold text-muted-foreground mb-1 text-[11px]">Select Product *</label>
                          <select
                            value={cashProductId}
                            onChange={e => {
                              const nextProdId = e.target.value
                              setCashProductId(nextProdId)
                              const picked = products.find(p => String(p.product_id) === String(nextProdId))
                              if (picked) {
                                const domain = resolveCategoryDomain(picked)
                                if (domain && !cashMainCat) setCashMainCat(domain)
                                const catLabel = picked?.category || picked?.category_group || picked?.main_category || ''
                                if (catLabel && !cashProdCat) setCashProdCat(catLabel)
                              }
                              setCashQty('1')
                              setCashDiscount('0')
                              setCashTendered('')
                            }}
                            required
                            className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-semibold cursor-pointer"
                          >
                            <option value="">-- Choose Product Item --</option>
                            {filteredCashProducts.map(p => {
                              const eff = p.discount_price ? Number(p.discount_price) : Number(p.unit_price || 0)
                              const outOfStock = Number(p.stock_quantity || 0) <= 0
                              return (
                                <option key={p.product_id} value={p.product_id} disabled={outOfStock}>
                                  {!cashProdCat ? `[${p.category || 'Item'}] ` : ''}{p.product_name} — {fmt(eff)} ({outOfStock ? 'Out of Stock' : `Stock: ${p.stock_quantity}`})
                                </option>
                              )
                            })}
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        <div>
                          <label className="block font-bold text-muted-foreground mb-1 text-[11px]">Unit Price</label>
                          <div className="px-3 py-2 rounded-xl border border-border bg-muted/30 font-mono font-bold text-foreground">
                            {selectedCashProduct ? fmt(cashUnitPrice) : '—'}
                          </div>
                        </div>

                        <div>
                          <label className="block font-bold text-muted-foreground mb-1 text-[11px]">Quantity *</label>
                          <input
                            type="number"
                            min="1"
                            max={selectedCashProduct && cashStockAvail > 0 ? cashStockAvail : undefined}
                            value={cashQty}
                            onChange={e => setCashQty(e.target.value)}
                            required
                            className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-mono font-bold"
                          />
                        </div>

                        <div>
                          <label className="block font-bold text-muted-foreground mb-1 text-[11px]">Discount (PHP)</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            max={cashGrossTotal || undefined}
                            value={cashDiscount}
                            onChange={e => setCashDiscount(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-mono"
                          />
                        </div>

                        <div>
                          <label className="block font-bold text-muted-foreground mb-1 text-[11px]">Payment Date *</label>
                          <input
                            type="date"
                            value={payDate}
                            onChange={e => setPayDate(e.target.value)}
                            required
                            className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-mono"
                          />
                        </div>
                      </div>

                      {isCashOverStock && (
                        <div className="text-[11px] font-semibold text-rose-500 flex items-center gap-1">
                          <FiAlertTriangle className="w-3.5 h-3.5" />
                          Requested quantity ({cashQtyNum}) exceeds available stock ({cashStockAvail})
                        </div>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 items-center">
                        <div>
                          <div className="text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-300">Net Cash Payable</div>
                          <div className="font-mono font-black text-lg text-emerald-600 dark:text-emerald-400">
                            {fmt(cashNetPayable)}
                          </div>
                        </div>

                        <div>
                          <label className="block font-bold text-foreground mb-1 text-[11px]">
                            Cash Tendered (PHP)
                          </label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground font-mono">₱</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={cashTendered}
                              onChange={e => setCashTendered(e.target.value)}
                              placeholder={cashNetPayable > 0 ? cashNetPayable.toFixed(2) : '0.00'}
                              className="w-full pl-7 pr-3 py-2 rounded-xl border border-border bg-card text-foreground text-xs font-mono font-bold"
                            />
                          </div>
                        </div>

                        <div className="p-2.5 rounded-xl bg-card border border-border text-center">
                          <div className="text-[10px] text-muted-foreground uppercase font-bold">Sukli / Change Due</div>
                          <div className={`font-mono font-extrabold text-base ${isCashProductInsufficient ? 'text-rose-500' : cashProductChangeDue > 0 ? 'text-primary' : 'text-muted-foreground'}`}>
                            {isCashProductInsufficient ? 'Insufficient' : fmt(cashProductChangeDue)}
                          </div>
                        </div>
                      </div>
                    </div>

                    <AgentAssignmentSection
                      hasAgent={hasAgent}
                      onToggleAgent={handleToggleAgent}
                      selectedAgentId={assignedAgentId}
                      onSelectAgent={setAssignedAgentId}
                      agents={salesAgents}
                      loadingAgents={loadingAgents}
                      agentsError={agentsError}
                      summary={cashProductAgentSummary}
                    />

                    <div className="p-3 rounded-xl bg-muted/20 border border-border flex flex-col sm:flex-row sm:items-center justify-between text-xs text-muted-foreground gap-2">
                      <div className="flex items-center gap-1.5">
                        <FiShield className="text-primary shrink-0" />
                        <span>Issuing Branch:</span>
                        <strong className="text-foreground">{userBranchName || 'Assigned Branch'}</strong>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <FiUser className="text-primary shrink-0" />
                        <span>Cashier / Store Admin:</span>
                        <strong className="text-foreground">{user?.username || 'Store Administrator'}</strong>
                      </div>
                    </div>

                    <div>
                      <label className="block font-bold text-muted-foreground mb-1 text-[11px]">
                        Payment Notes & Remarks (Optional)
                      </label>
                      <textarea
                        placeholder="e.g. Paid cash over-the-counter, includes official sales invoice and store warranty..."
                        value={payNotes}
                        onChange={e => setPayNotes(e.target.value)}
                        rows={2}
                        className="w-full border border-border rounded-xl px-3 py-2 text-xs bg-card text-foreground"
                      />
                    </div>
                  </>
                ) : (
                  <>
                {!selectedInst ? (
                  <div className="p-4 rounded-2xl bg-muted/30 border border-border space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <label className="font-bold text-foreground text-xs uppercase tracking-wider flex items-center gap-1.5">
                        <FiSearch className="text-primary" /> Select Active Customer Installment Account *
                      </label>
                      <span className="text-[11px] text-muted-foreground font-mono">
                        {filteredAccounts.length} Available Accounts
                      </span>
                    </div>

                    <div className="relative">
                      <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                      <input
                        type="text"
                        value={instSearchQuery}
                        onChange={e => setInstSearchQuery(e.target.value)}
                        placeholder="Search by customer name, account #, phone, or product..."
                        className="w-full pl-9 pr-3 py-2 rounded-xl border border-border bg-card text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
                      />
                    </div>

                    <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                      {filteredAccounts.length === 0 ? (
                        <div className="p-4 text-center text-muted-foreground text-xs rounded-xl bg-card border border-border">
                          No active installment accounts match your search.
                        </div>
                      ) : (
                        filteredAccounts.map(inst => (
                          <div
                            key={inst.installment_id}
                            onClick={() => handleInstSelect(inst.installment_id)}
                            className="p-3 rounded-xl bg-card hover:bg-primary/5 hover:border-primary border border-border flex items-center justify-between gap-3 cursor-pointer transition-all shadow-2xs group"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono font-bold text-primary text-xs">{inst.account_no}</span>
                                <span className="font-bold text-foreground truncate">{inst.customer_name}</span>
                                <Badge
                                  variant={inst.days_overdue > 0 ? 'danger' : 'success'}
                                >
                                  {inst.days_overdue > 0 ? `Overdue (${inst.days_overdue}d)` : 'Active'}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-0.5">
                                <span className="truncate flex items-center gap-1">
                                  <FiPackage className="w-3 h-3 text-muted-foreground shrink-0" />
                                  {inst.product_name}
                                </span>
                                {inst.customer_phone && (
                                  <span className="font-mono hidden sm:inline">📞 {inst.customer_phone}</span>
                                )}
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <div className="text-[10px] text-muted-foreground uppercase font-bold">Outstanding Balance</div>
                              <div className="font-mono font-bold text-rose-600 dark:text-rose-400 text-xs">
                                {fmt(inst.balance)}
                              </div>
                              <div className="text-[10px] text-muted-foreground font-mono">
                                Due: {fmt(inst.next_amount_due || inst.installment_amount)}
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="p-3.5 rounded-2xl bg-primary/10 border border-primary/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center font-bold text-base shrink-0">
                        <FiUser />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-bold text-primary text-xs">{selectedInst.account_no}</span>
                          <h4 className="font-bold text-foreground text-sm truncate">{selectedInst.customer_name}</h4>
                          <Badge variant={selectedInst.days_overdue > 0 ? 'danger' : 'success'}>
                            {selectedInst.days_overdue > 0 ? `Overdue (${selectedInst.days_overdue}d)` : selectedInst.status || 'Active'}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {selectedInst.product_name} • {selectedInst.branch || 'Assigned Branch'}
                          {selectedInst.has_agent && selectedInst.agent_name ? ` • Contract Agent: ${selectedInst.agent_name}` : ''}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedInstId('')
                        setInstSearchQuery('')
                        setHasAgent(false)
                        setAssignedAgentId('')
                        setAgentsError('')
                      }}
                      className="px-3 py-1.5 rounded-xl border border-primary/30 text-primary hover:bg-primary/20 font-bold text-xs cursor-pointer shrink-0 transition-colors"
                    >
                      Change Account
                    </button>
                  </div>
                )}

                {selectedInst && (
                  <>
                    <div className="p-4 rounded-2xl bg-card border border-border space-y-3">
                      <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider flex items-center gap-1.5">
                        <FiLayers className="text-primary" /> Customer Profile & Contract Specification
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                        <div>
                          <span className="text-[10px] text-muted-foreground uppercase font-bold block">Contact Phone</span>
                          <span className="font-mono text-foreground font-medium">{selectedInst.customer_phone || '—'}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-muted-foreground uppercase font-bold block">Email Address</span>
                          <span className="text-foreground font-medium truncate block">{selectedInst.customer_email || '—'}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-muted-foreground uppercase font-bold block">Invoice Reference</span>
                          <span className="font-mono text-foreground font-semibold">{selectedInst.invoice_no || '—'}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-muted-foreground uppercase font-bold block">Payment Term</span>
                          <span className="text-foreground font-medium">
                            {selectedInst.number_of_installments || 12} Months ({selectedInst.frequency || 'Monthly'})
                          </span>
                        </div>
                      </div>
                      {selectedInst.customer_address && (
                        <div className="text-xs pt-2 border-t border-border flex items-center gap-1.5 text-muted-foreground">
                          <FiMapPin className="text-primary shrink-0 w-3.5 h-3.5" />
                          <span className="truncate">{selectedInst.customer_address}</span>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center">
                      <div className="p-3 rounded-xl bg-card border border-border">
                        <div className="text-[10px] uppercase font-bold text-muted-foreground">Contract Price</div>
                        <div className="font-mono font-bold text-foreground text-sm">{fmt(selectedInst.total_payable)}</div>
                        <div className="text-[10px] text-muted-foreground">Total Financed</div>
                      </div>

                      <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                        <div className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400">Total Paid</div>
                        <div className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-sm">{fmt(selectedInst.paid)}</div>
                        <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">{progressPct}% Repaid</div>
                      </div>

                      <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
                        <div className="text-[10px] uppercase font-bold text-rose-600 dark:text-rose-400">Remaining Balance</div>
                        <div className="font-mono font-bold text-rose-600 dark:text-rose-400 text-sm">{fmt(selectedInst.balance)}</div>
                        <div className="text-[10px] text-rose-600 dark:text-rose-400">Outstanding</div>
                      </div>

                      <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
                        <div className="text-[10px] uppercase font-bold text-blue-600 dark:text-blue-400">Monthly Amortization</div>
                        <div className="font-mono font-bold text-blue-600 dark:text-blue-400 text-sm">
                          {fmt(selectedInst.installment_amount || selectedInst.next_amount_due)}
                        </div>
                        <div className="text-[10px] text-blue-600 dark:text-blue-400">
                          {selectedInst.next_due_date ? `Due: ${fmtDate(selectedInst.next_due_date)}` : 'Per Installment'}
                        </div>
                      </div>
                    </div>

                    <div className="w-full bg-muted/60 h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>

                    <div className="p-3 rounded-xl bg-muted/30 border border-border space-y-2">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                          <FiTag className="text-primary" /> Quick-Pay Amount Presets
                        </span>
                        <span className="text-muted-foreground">Click to automatically populate payment amount</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {selectedInst.next_amount_due > 0 && (
                          <button
                            type="button"
                            onClick={() => setPayAmount(selectedInst.next_amount_due.toString())}
                            className={`px-3 py-1.5 rounded-lg font-mono font-semibold text-xs border transition-all cursor-pointer ${
                              parseFloat(payAmount) === Number(selectedInst.next_amount_due)
                                ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                                : 'bg-card text-foreground border-border hover:bg-muted'
                            }`}
                          >
                            Next Due: {fmt(selectedInst.next_amount_due)}
                          </button>
                        )}
                        {monthlyDue > 0 && Number(selectedInst.next_amount_due) !== Number(monthlyDue) && (
                          <button
                            type="button"
                            onClick={() => setPayAmount(monthlyDue.toString())}
                            className={`px-3 py-1.5 rounded-lg font-mono font-semibold text-xs border transition-all cursor-pointer ${
                              parseFloat(payAmount) === Number(monthlyDue)
                                ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                                : 'bg-card text-foreground border-border hover:bg-muted'
                            }`}
                          >
                            1 Month: {fmt(monthlyDue)}
                          </button>
                        )}
                        {monthlyDue > 0 && currentBal >= monthlyDue * 2 && (
                          <button
                            type="button"
                            onClick={() => setPayAmount((monthlyDue * 2).toString())}
                            className={`px-3 py-1.5 rounded-lg font-mono font-semibold text-xs border transition-all cursor-pointer ${
                              parseFloat(payAmount) === Number(monthlyDue * 2)
                                ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                                : 'bg-card text-foreground border-border hover:bg-muted'
                            }`}
                          >
                            2 Months: {fmt(monthlyDue * 2)}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setPayAmount(currentBal.toString())}
                          className={`px-3 py-1.5 rounded-lg font-mono font-bold text-xs border transition-all cursor-pointer ${
                            parseFloat(payAmount) === currentBal
                              ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                              : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                          }`}
                        >
                          Full Settlement: {fmt(currentBal)}
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
                      <div className="p-3.5 rounded-2xl bg-card border border-border space-y-2">
                        <label className="block font-bold text-foreground mb-1 text-xs uppercase tracking-wider">
                          Payment Amount (PHP) *
                        </label>
                        <div className="relative">
                          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground font-mono">
                            ₱
                          </span>
                          <input
                            type="number"
                            step="0.01"
                            min="1"
                            max={currentBal}
                            value={payAmount}
                            onChange={e => setPayAmount(e.target.value)}
                            placeholder="0.00"
                            required
                            className="w-full pl-8 pr-3 py-2.5 rounded-xl border border-border bg-card text-foreground font-mono font-bold text-base focus:ring-2 focus:ring-primary/20 focus:outline-none"
                          />
                        </div>
                        {isOverpayment && (
                          <div className="text-[11px] font-semibold text-rose-500 flex items-center gap-1">
                            <FiAlertTriangle className="w-3.5 h-3.5" />
                            Amount exceeds remaining balance by {fmt(inputAmount - currentBal)}
                          </div>
                        )}
                      </div>

                      <div className={`p-3.5 rounded-2xl border transition-all space-y-2 ${
                        isFullPayment
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-900 dark:text-emerald-200'
                          : 'bg-muted/30 border-border text-foreground'
                      }`}>
                        <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                          <span>Balance Calculation</span>
                          {isFullPayment && (
                            <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                              <FiCheckCircle className="w-3.5 h-3.5" /> Full Settlement
                            </span>
                          )}
                        </div>
                        <div className="space-y-1 text-xs">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Current Balance:</span>
                            <span className="font-mono font-semibold">{fmt(currentBal)}</span>
                          </div>
                          <div className="flex justify-between text-primary">
                            <span>Deducting Payment:</span>
                            <span className="font-mono font-bold">- {fmt(inputAmount)}</span>
                          </div>
                          <div className="flex justify-between pt-1.5 border-t border-border/80 font-bold">
                            <span>Balance After Payment:</span>
                            <span className={`font-mono text-sm ${isFullPayment ? 'text-emerald-600 dark:text-emerald-400 font-extrabold' : 'text-foreground'}`}>
                              {fmt(balanceAfter)}
                            </span>
                          </div>
                        </div>
                        {isFullPayment && (
                          <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold bg-emerald-500/10 p-1.5 rounded-lg text-center">
                            This payment will completely pay off and close this installment account!
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="p-4 rounded-2xl bg-card border border-border space-y-3">
                      <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider flex items-center gap-1.5">
                        <FiCreditCard className="text-primary" /> Payment Method & Transaction Verification
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                        <div>
                          <label className="block font-bold text-muted-foreground mb-1 text-[11px]">Payment Method *</label>
                          <select
                            value={payMethod}
                            onChange={e => setPayMethod(e.target.value)}
                            className="w-full border border-border rounded-xl px-3 py-2 text-xs bg-card text-foreground font-semibold cursor-pointer"
                          >
                            <option value="Cash">Cash</option>
                            <option value="GCash">GCash</option>
                            <option value="Maya">Maya</option>
                            <option value="Bank Transfer">Bank Transfer</option>
                            <option value="Cheque">Cheque</option>
                          </select>
                        </div>

                        <div>
                          <label className="block font-bold text-muted-foreground mb-1 text-[11px]">Payment Date *</label>
                          <input
                            type="date"
                            value={payDate}
                            onChange={e => setPayDate(e.target.value)}
                            required
                            className="w-full border border-border rounded-xl px-3 py-2 text-xs bg-card text-foreground font-mono"
                          />
                        </div>

                        <div>
                          <label className="block font-bold text-muted-foreground mb-1 text-[11px]">
                            {payMethod === 'Cash' ? 'Official Receipt Preview' : 'Reference / Transaction #'}
                          </label>
                          {payMethod === 'Cash' ? (
                            <div className="py-2 px-3 rounded-xl bg-muted/40 border border-border text-[11px] font-mono text-muted-foreground truncate">
                              Auto REC-2026-XXXXX
                            </div>
                          ) : (
                            <input
                              type="text"
                              placeholder={payMethod === 'GCash' ? 'GCash Ref (e.g. 1002...)' : payMethod === 'Maya' ? 'Maya Ref #' : 'Trace / Transaction #'}
                              value={payRef}
                              onChange={e => setPayRef(e.target.value)}
                              required
                              className="w-full border border-border rounded-xl px-3 py-2 text-xs bg-card text-foreground font-mono"
                            />
                          )}
                        </div>
                      </div>

                      {payMethod === 'Cash' && (
                        <div className="p-3 rounded-xl bg-muted/30 border border-border grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                          <div>
                            <label className="block font-bold text-foreground mb-1 text-[11px]">
                              Cash Tendered / Received from Customer
                            </label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground font-mono">₱</span>
                              <input
                                type="number"
                                step="0.01"
                                value={cashTendered}
                                onChange={e => setCashTendered(e.target.value)}
                                placeholder={payAmount || '0.00'}
                                className="w-full pl-7 pr-3 py-2 rounded-xl border border-border bg-card text-foreground text-xs font-mono font-bold"
                              />
                            </div>
                          </div>

                          <div className="p-2.5 rounded-xl bg-card border border-border text-center">
                            <div className="text-[10px] text-muted-foreground uppercase font-bold">Sukli / Change Due</div>
                            <div className={`font-mono font-extrabold text-base ${changeDue > 0 ? 'text-primary' : 'text-muted-foreground'}`}>
                              {fmt(changeDue)}
                            </div>
                          </div>
                        </div>
                      )}

                      {(payMethod === 'GCash' || payMethod === 'Maya') && (
                        <div className="p-3 rounded-xl bg-muted/30 border border-border">
                          <label className="block font-bold text-foreground mb-1 text-[11px]">
                            Sender Mobile Number / Account Name (Optional)
                          </label>
                          <input
                            type="text"
                            value={senderName}
                            onChange={e => setSenderName(e.target.value)}
                            placeholder="e.g. 0917-123-4567 / Juan Dela Cruz"
                            className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground text-xs font-mono"
                          />
                        </div>
                      )}

                      {payMethod === 'Bank Transfer' && (
                        <div className="p-3 rounded-xl bg-muted/30 border border-border grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block font-bold text-foreground mb-1 text-[11px]">Bank Name</label>
                            <select
                              value={bankName}
                              onChange={e => setBankName(e.target.value)}
                              className="w-full border border-border rounded-xl px-3 py-2 text-xs bg-card text-foreground font-medium"
                            >
                              <option value="BDO">BDO Unibank</option>
                              <option value="BPI">Bank of the Philippine Islands (BPI)</option>
                              <option value="Metrobank">Metrobank</option>
                              <option value="Landbank">Landbank of the Philippines</option>
                              <option value="UnionBank">UnionBank of the Philippines</option>
                              <option value="Security Bank">Security Bank</option>
                              <option value="RCBC">RCBC</option>
                              <option value="PNB">Philippine National Bank (PNB)</option>
                              <option value="Other">Other Domestic Bank</option>
                            </select>
                          </div>
                          <div>
                            <label className="block font-bold text-foreground mb-1 text-[11px]">Sender / Remitter Name</label>
                            <input
                              type="text"
                              value={senderName}
                              onChange={e => setSenderName(e.target.value)}
                              placeholder="Account Holder Name"
                              className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground text-xs"
                            />
                          </div>
                        </div>
                      )}

                      {payMethod === 'Cheque' && (
                        <div className="p-3 rounded-xl bg-muted/30 border border-border grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <label className="block font-bold text-foreground mb-1 text-[11px]">Cheque Number *</label>
                            <input
                              type="text"
                              value={chequeNo}
                              onChange={e => setChequeNo(e.target.value)}
                              placeholder="e.g. 00012345"
                              required
                              className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground text-xs font-mono"
                            />
                          </div>
                          <div>
                            <label className="block font-bold text-foreground mb-1 text-[11px]">Issuing Bank & Branch</label>
                            <input
                              type="text"
                              value={chequeBank}
                              onChange={e => setChequeBank(e.target.value)}
                              placeholder="e.g. BDO Iligan Branch"
                              className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground text-xs"
                            />
                          </div>
                          <div>
                            <label className="block font-bold text-foreground mb-1 text-[11px]">Cheque Date</label>
                            <input
                              type="date"
                              value={chequeDate}
                              onChange={e => setChequeDate(e.target.value)}
                              className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground text-xs font-mono"
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    <AgentAssignmentSection
                      hasAgent={hasAgent}
                      onToggleAgent={(nextHas) => handleToggleAgent(nextHas, selectedInst)}
                      selectedAgentId={assignedAgentId}
                      onSelectAgent={setAssignedAgentId}
                      agents={salesAgents}
                      loadingAgents={loadingAgents}
                      agentsError={agentsError}
                      summary={paymentAgentSummary}
                    />

                    <div className="p-3 rounded-xl bg-muted/20 border border-border flex flex-col sm:flex-row sm:items-center justify-between text-xs text-muted-foreground gap-2">
                      <div className="flex items-center gap-1.5">
                        <FiShield className="text-primary shrink-0" />
                        <span>Issuing Branch:</span>
                        <strong className="text-foreground">{userBranchName || selectedInst.branch || 'Assigned Branch'}</strong>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <FiUser className="text-primary shrink-0" />
                        <span>Collector / Store Admin:</span>
                        <strong className="text-foreground">{user?.username || 'Store Administrator'}</strong>
                      </div>
                    </div>

                    <div className="rounded-xl border border-border overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setShowAccountHistory(prev => !prev)}
                        className="w-full p-3 bg-muted/30 hover:bg-muted/50 flex items-center justify-between text-xs font-bold text-foreground cursor-pointer transition-colors"
                      >
                        <span className="flex items-center gap-1.5">
                          <FiClock className="text-primary" /> Past Payment Receipts for this Account ({accountPayments.length})
                        </span>
                        {showAccountHistory ? <FiChevronUp className="w-4 h-4" /> : <FiChevronDown className="w-4 h-4" />}
                      </button>

                      {showAccountHistory && (
                        <div className="p-3 bg-card border-t border-border">
                          {accountPayments.length === 0 ? (
                            <div className="text-center py-2 text-muted-foreground text-xs">
                              No prior recorded payments for this account yet.
                            </div>
                          ) : (
                            <div className="max-h-36 overflow-y-auto">
                              <table className="w-full text-[11px]">
                                <thead>
                                  <tr className="border-b border-border text-muted-foreground text-left">
                                    <th className="py-1.5 px-2">Receipt #</th>
                                    <th className="py-1.5 px-2">Date</th>
                                    <th className="py-1.5 px-2">Method</th>
                                    <th className="py-1.5 px-2">Amount</th>
                                    <th className="py-1.5 px-2">Collector</th>
                                    <th className="py-1.5 px-2 text-center">Status</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                  {accountPayments.map((p, idx) => (
                                    <tr key={p.payment_id || idx} className="hover:bg-muted/20">
                                      <td className="py-1.5 px-2 font-mono font-bold text-primary">{p.receipt_no}</td>
                                      <td className="py-1.5 px-2 font-mono text-muted-foreground">{p.payment_date}</td>
                                      <td className="py-1.5 px-2">{p.payment_method}</td>
                                      <td className="py-1.5 px-2 font-mono font-bold text-emerald-600 dark:text-emerald-400">{fmt(p.amount)}</td>
                                      <td className="py-1.5 px-2 text-muted-foreground">{p.received_by_name || 'Admin'}</td>
                                      <td className="py-1.5 px-2 text-center">
                                        <Badge variant={p.status === 'Completed' ? 'success' : 'warning'}>
                                          {p.status}
                                        </Badge>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block font-bold text-muted-foreground mb-1 text-[11px]">
                        Collection Notes & Remarks (Optional)
                      </label>
                      <textarea
                        placeholder="e.g. Paid at store cashier counter, verified customer ID, customer requested text receipt..."
                        value={payNotes}
                        onChange={e => setPayNotes(e.target.value)}
                        rows={2}
                        className="w-full border border-border rounded-xl px-3 py-2 text-xs bg-card text-foreground"
                      />
                    </div>
                  </>
                )}

                  </>
                )}

                <div className="flex justify-between items-center pt-4 border-t border-border">
                  <button
                    type="button"
                    onClick={() => {
                      setNewPayModal(false)
                      resetNewPaymentForm()
                    }}
                    className="flex items-center gap-1 px-4 py-2 rounded-xl border border-border hover:bg-muted font-semibold cursor-pointer text-xs"
                  >
                    <FiX className="w-3.5 h-3.5" />
                    <span>Cancel</span>
                  </button>

                  <button
                    type="submit"
                    disabled={isSubmitDisabled}
                    className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-xs transition-all"
                  >
                    <FiCheckCircle className="w-4 h-4" />
                    <span>
                      {saving
                        ? 'Processing Payment...'
                        : paymentMode === 'product_cash'
                          ? 'Confirm Cash Product Payment'
                          : 'Confirm Customer Payment'}
                    </span>
                  </button>
                </div>
              </form>
            </Modal>
          )
        })()}

        {/* VIEW PAYMENT DETAILS MODAL */}
        {viewPayment && (
          <Modal
            isOpen={true}
            onClose={() => setViewPayment(null)}
            title="Payment Details"
            size="lg"
          >
            <div className="space-y-4 text-xs">
              {(viewPayment.status === 'Pending' || viewPayment.status === 'Collected by Collector' || viewPayment.status === 'Pending Store Admin Approval' || viewPayment.status === 'pending_collector') && (
                <div className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 shadow-xs ${
                  viewPayment.status === 'Pending Store Admin Approval'
                    ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-800'
                    : 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800'
                }`}>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <FiClock className={`w-5 h-5 shrink-0 animate-pulse ${viewPayment.status === 'Pending Store Admin Approval' ? 'text-indigo-600' : 'text-amber-600'}`} />
                    <div className="min-w-0">
                      <p className={`font-bold text-xs ${viewPayment.status === 'Pending Store Admin Approval' ? 'text-indigo-900 dark:text-indigo-200' : 'text-amber-900 dark:text-amber-200'}`}>
                        {viewPayment.status === 'Pending Store Admin Approval'
                          ? 'Cashier Verified — Pending Store Admin Approval'
                          : viewPayment.status === 'Collected by Collector'
                            ? 'Collected by Collector — Sent to Cashier'
                            : (viewPayment.status === 'pending_collector'
                              ? 'Awaiting Door-to-Door Collector Confirmation'
                              : 'Pending Store Admin Receipt')}
                      </p>
                      <p className={`text-[11px] truncate ${viewPayment.status === 'Pending Store Admin Approval' ? 'text-indigo-700 dark:text-indigo-300' : 'text-amber-700 dark:text-amber-300'}`}>
                        {viewPayment.status === 'Pending Store Admin Approval'
                          ? 'Cashier has received the cash from the Collector. Approve to settle the Customer Installment ledger.'
                          : viewPayment.status === 'Collected by Collector'
                            ? 'Waiting for the branch Cashier to receive and verify the collected cash before Store Admin approval.'
                            : (viewPayment.status === 'pending_collector'
                              ? 'Assigned Collector must confirm physical cash pickup first.'
                              : 'This payment has not yet been received or credited to the account.')}
                      </p>
                    </div>
                  </div>
                  {(viewPayment.status === 'Pending' || viewPayment.status === 'Pending Store Admin Approval') && (
                    <button
                      type="button"
                      onClick={() => {
                        const p = viewPayment;
                        setViewPayment(null);
                        handleReceivePayment(p);
                      }}
                      className={`px-3 py-1.5 text-white font-bold text-xs rounded-xl cursor-pointer transition-colors shadow-xs shrink-0 flex items-center gap-1.5 ${
                        viewPayment.status === 'Pending Store Admin Approval'
                          ? 'bg-indigo-600 hover:bg-indigo-700'
                          : 'bg-emerald-600 hover:bg-emerald-700'
                      }`}
                    >
                      <FiCheckCircle className="w-3.5 h-3.5" />
                      <span>{viewPayment.status === 'Pending Store Admin Approval' ? 'Approve Payment' : 'Receive Payment'}</span>
                    </button>
                  )}
                </div>
              )}

              <div className="space-y-2 p-3 bg-muted/20 rounded-xl border border-border">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Receipt #:</span>
                  <span className="font-mono font-bold text-foreground">{viewPayment.receipt_no}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Payment Date:</span>
                  <span className="font-mono font-semibold text-foreground">{viewPayment.payment_date}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {viewPayment.payment_type === 'product_cash' ? 'Invoice # (Cash Sale):' : 'Account #:'}
                  </span>
                  <span className="font-mono font-bold text-primary">{viewPayment.account_no}</span>
                </div>
                {viewPayment.product_name && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Product:</span>
                    <span className="font-semibold text-foreground">{viewPayment.product_name}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Customer:</span>
                  <span className="font-semibold text-foreground">
                    {viewPayment.customer_name}{viewPayment.customer_code ? ` (${viewPayment.customer_code})` : ''}
                  </span>
                </div>
                {viewPayment.installment_details && (
                  <div className="pt-2 mt-1 border-t border-border/70 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] bg-primary/5 rounded-lg p-2.5">
                    <div>
                      <span className="text-muted-foreground block">Contract Total</span>
                      <span className="font-mono font-bold text-foreground">{fmt(viewPayment.installment_details.total_payable)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">Total Paid</span>
                      <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{fmt(viewPayment.installment_details.total_paid)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">Remaining Balance</span>
                      <span className="font-mono font-black text-rose-500">{fmt(viewPayment.installment_details.remaining_balance)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">Terms / Monthly</span>
                      <span className="font-mono font-semibold text-foreground">
                        {viewPayment.installment_details.terms_paid}/{viewPayment.installment_details.total_terms || '—'} • {fmt(viewPayment.installment_details.installment_amount)}
                      </span>
                    </div>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Method:</span>
                  <PaymentMethodBadge method={viewPayment.payment_method} />
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status:</span>
                  <span className={`font-bold ${['Pending', 'pending_collector', 'Collected by Collector', 'Pending Store Admin Approval'].includes(viewPayment.status) ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600'}`}>
                    {viewPayment.status === 'Pending'
                      ? 'Pending Payment (Not Received)'
                      : (viewPayment.status === 'pending_collector' ? 'Awaiting Collector Pickup' : viewPayment.status)}
                  </span>
                </div>
                {viewPayment.collector_name && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Collected By (Collector):</span>
                    <span className="font-semibold text-foreground">
                      {viewPayment.collector_name}{viewPayment.collector_code ? ` (${viewPayment.collector_code})` : ''}
                    </span>
                  </div>
                )}
                {viewPayment.cashier_name && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Verified By (Cashier):</span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                      {viewPayment.cashier_name}{viewPayment.cashier_code ? ` (${viewPayment.cashier_code})` : ''}
                    </span>
                  </div>
                )}
                {viewPayment.receipt_reference && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Official Receipt #:</span>
                    <span className="font-mono font-bold text-emerald-600">{viewPayment.receipt_reference}</span>
                  </div>
                )}
                {viewPayment.cash_tendered !== null && viewPayment.cash_tendered !== undefined && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Cash Tendered / Change:</span>
                    <span className="font-mono font-semibold text-foreground">
                      {fmt(viewPayment.cash_tendered)} / Change {fmt(viewPayment.change_due || 0)}
                    </span>
                  </div>
                )}
                {viewPayment.reference_no && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Reference Number:</span>
                    <span className="font-mono font-bold text-purple-600 dark:text-purple-400">{viewPayment.reference_no}</span>
                  </div>
                )}
                {viewPayment.has_agent && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Sales Agent:</span>
                      <span className="font-semibold text-primary">
                        {viewPayment.agent_name ? `${viewPayment.agent_name}${viewPayment.agent_code ? ` (${viewPayment.agent_code})` : ''}` : 'With Agent'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Agent Contribution:</span>
                      <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        {fmt(viewPayment.total_agent_contribution)}
                      </span>
                    </div>
                  </>
                )}
                <div className="flex justify-between items-center pt-2 border-t border-border mt-2">
                  <span className="text-xs font-bold text-emerald-900 dark:text-emerald-300 uppercase">Amount Paid:</span>
                  <span className="text-lg font-mono font-bold text-emerald-600">{fmt(viewPayment.amount)}</span>
                </div>
              </div>

              {viewPayment.proof_of_payment ? (
                <div className="space-y-1">
                  <div className="flex items-center justify-between mb-1">
                    <label className="block font-bold text-muted-foreground text-[11px] uppercase">Proof of Payment</label>
                    <a
                      href={formatProofUrl(viewPayment.proof_of_payment)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-emerald-600 dark:text-emerald-400 font-semibold hover:underline text-[11px]"
                    >
                      View Full Image ↗
                    </a>
                  </div>
                  <div className="border border-border rounded-xl overflow-hidden bg-muted/20 flex flex-col items-center justify-center p-2">
                    <a href={formatProofUrl(viewPayment.proof_of_payment)} target="_blank" rel="noopener noreferrer">
                      <img
                        src={formatProofUrl(viewPayment.proof_of_payment)}
                        alt="Proof of Payment"
                        className="max-h-64 object-contain rounded-lg shadow-sm"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          if (e.currentTarget.parentElement?.nextElementSibling) {
                            e.currentTarget.parentElement.nextElementSibling.style.display = 'block';
                          }
                        }}
                      />
                    </a>
                    <p className="hidden py-4 text-xs text-muted-foreground text-center">
                      Proof image file is missing or could not be loaded from storage.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-4 border border-dashed border-border rounded-xl text-center text-muted-foreground bg-muted/10">
                  No proof of payment uploaded.
                </div>
              )}

              {viewPayment.notes && (
                <div className="text-[11px] text-muted-foreground bg-muted/30 p-2.5 rounded-xl border border-border">
                  <strong>Remarks:</strong> {summarizePaymentNotes(viewPayment.notes)}
                </div>
              )}

              <div className="flex justify-between items-center pt-3 border-t border-border mt-3">
                <button
                  type="button"
                  onClick={() => handlePrintReceipt(viewPayment)}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-border bg-primary text-primary-foreground hover:bg-primary/90 font-semibold cursor-pointer shadow-xs"
                >
                  <FiPrinter className="w-3.5 h-3.5" />
                  <span>Print / PDF</span>
                </button>
                <div className="flex items-center gap-2">
                  {(viewPayment.status === 'Pending' || viewPayment.status === 'Pending Store Admin Approval') && (
                    <button
                      type="button"
                      onClick={() => {
                        const p = viewPayment;
                        setViewPayment(null);
                        handleReceivePayment(p);
                      }}
                      className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-white font-bold cursor-pointer transition-colors shadow-xs ${
                        viewPayment.status === 'Pending Store Admin Approval'
                          ? 'bg-indigo-600 hover:bg-indigo-700'
                          : 'bg-emerald-600 hover:bg-emerald-700'
                      }`}
                    >
                      <FiCheckCircle className="w-3.5 h-3.5" />
                      <span>{viewPayment.status === 'Pending Store Admin Approval' ? 'Approve Payment' : 'Receive Payment'}</span>
                    </button>
                  )}
                  {(viewPayment.status === 'Pending' || viewPayment.status === 'pending_collector' || viewPayment.status === 'Pending Store Admin Approval') && (
                    <button
                      type="button"
                      onClick={() => {
                        const p = viewPayment;
                        setViewPayment(null);
                        handleRejectPayment(p);
                      }}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold cursor-pointer transition-colors shadow-xs"
                    >
                      <FiX className="w-3.5 h-3.5" />
                      <span>Reject</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setViewPayment(null)}
                    className="flex items-center gap-1 px-4 py-1.5 rounded-xl border border-border hover:bg-muted font-semibold cursor-pointer"
                  >
                    <FiX className="w-3.5 h-3.5" />
                    <span>Close</span>
                  </button>
                </div>
              </div>
            </div>
          </Modal>
        )}
      </div>

      {/* Dedicated Printable Area (Active only during browser Print / PDF export) */}
      <div className="hidden print:block bg-white text-black min-h-screen w-full font-sans print:m-0 print:p-6">
        {printMode === 'receipt' && (printReceiptData || viewReceipt || viewPayment) ? (
          (() => {
            const receipt = printReceiptData || viewReceipt || viewPayment
            const companyTitle = receipt.company_settings?.company_name || settings?.company_name || 'PROJECT: PACE Z-LICZ'
            const branchTitle = receipt.branch || user?.employee?.branch?.name || receipt.company_settings?.branch_name || settings?.branch_name || 'C-LICZ CDO'
            const branchAddress = receipt.branch_location || receipt.branch_address || receipt.company_settings?.address || settings?.address || 'Cagayan de Oro City'
            const branchContact = receipt.branch_phone || receipt.company_settings?.phone || settings?.phone || '+63 88 856 1234'
            const taxId = receipt.company_settings?.tax_id || settings?.tax_id || '000-000-000'

            return (
              <div className="max-w-xl mx-auto border-2 border-black p-6 rounded-lg space-y-5 bg-white">
                {/* Header */}
                <div className="text-center pb-3 border-b-2 border-black space-y-0.5">
                  <h1 className="text-2xl font-black tracking-wider uppercase">{companyTitle}</h1>
                  <p className="text-sm font-bold uppercase">{branchTitle}</p>
                  <p className="text-xs text-gray-700">{branchAddress} • Tel: {branchContact}</p>
                  <p className="text-[11px] text-gray-600 font-mono">TIN: {taxId}</p>
                  <div className="mt-2 inline-block px-3 py-1 border border-black font-bold uppercase tracking-widest text-xs bg-gray-100">
                    OFFICIAL PAYMENT RECEIPT
                  </div>
                </div>

                {/* Receipt Info Header */}
                <div className="flex justify-between items-center text-xs font-mono border-b border-gray-300 pb-2.5">
                  <div>
                    <span className="font-bold text-gray-600">RECEIPT NO: </span>
                    <span className="font-bold text-sm text-black">{receipt.receipt_no}</span>
                  </div>
                  <div>
                    <span className="font-bold text-gray-600">DATE: </span>
                    <span className="font-bold">{receipt.payment_date}</span>
                  </div>
                </div>

                {/* Transaction Breakdown */}
                <table className="w-full text-xs border-collapse">
                  <tbody>
                    <tr className="border-b border-gray-200">
                      <td className="py-2 text-gray-600 font-medium w-1/3">Received From:</td>
                      <td className="py-2 font-bold uppercase text-black">{receipt.customer_name}</td>
                    </tr>
                    {receipt.customer_phone && (
                      <tr className="border-b border-gray-200">
                        <td className="py-2 text-gray-600 font-medium">Contact Number:</td>
                        <td className="py-2 font-mono">{receipt.customer_phone}</td>
                      </tr>
                    )}
                    {receipt.customer_address && (
                      <tr className="border-b border-gray-200">
                        <td className="py-2 text-gray-600 font-medium">Customer Address:</td>
                        <td className="py-2">{receipt.customer_address}</td>
                      </tr>
                    )}
                    <tr className="border-b border-gray-200">
                      <td className="py-2 text-gray-600 font-medium">
                        {receipt.payment_type === 'product_cash' ? 'Invoice Reference (Cash Product):' : 'Account Reference:'}
                      </td>
                      <td className="py-2 font-mono font-bold">{receipt.account_no}</td>
                    </tr>
                    {receipt.product_name && (
                      <tr className="border-b border-gray-200">
                        <td className="py-2 text-gray-600 font-medium">Product:</td>
                        <td className="py-2 font-semibold">{receipt.product_name}</td>
                      </tr>
                    )}
                    <tr className="border-b border-gray-200">
                      <td className="py-2 text-gray-600 font-medium">Payment Method:</td>
                      <td className="py-2 font-semibold uppercase">{receipt.payment_method}</td>
                    </tr>
                    {receipt.reference_no && (
                      <tr className="border-b border-gray-200">
                        <td className="py-2 text-gray-600 font-medium">Reference / Trace #:</td>
                        <td className="py-2 font-mono">{receipt.reference_no}</td>
                      </tr>
                    )}
                    {receipt.has_agent && (
                      <tr className="border-b border-gray-200">
                        <td className="py-2 text-gray-600 font-medium">Sales Agent:</td>
                        <td className="py-2 font-semibold">
                          {receipt.agent_name ? `${receipt.agent_name}${receipt.agent_code ? ` (${receipt.agent_code})` : ''}` : 'With Agent'} — ₱{Number(receipt.total_agent_contribution || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    )}
                  {receipt.notes && (
                    <tr className="border-b border-gray-200">
                      <td className="py-2 text-gray-600 font-medium">Remarks:</td>
                      <td className="py-2 italic text-gray-700">{summarizePaymentNotes(receipt.notes)}</td>
                    </tr>
                  )}
                </tbody>
              </table>

                {/* Amount Paid Box */}
                <div className="border-2 border-black p-3.5 bg-gray-50 flex justify-between items-center rounded">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-gray-600 block">TOTAL AMOUNT RECEIVED</span>
                    <span className="text-2xl font-black font-mono">
                      ₱{Number(receipt.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  {receipt.remaining_balance !== undefined && (
                    <div className="text-right">
                      <span className="text-[10px] uppercase font-bold text-gray-600 block">Remaining Account Balance</span>
                      <span className="text-sm font-bold font-mono text-gray-800">
                        ₱{Number(receipt.remaining_balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  )}
                </div>

                {/* Signatures */}
                <div className="pt-6 grid grid-cols-2 gap-6 text-xs text-center">
                  <div>
                    <div className="border-b border-black w-40 mx-auto pb-1 font-semibold uppercase">
                      {receipt.customer_name}
                    </div>
                    <p className="mt-1 text-gray-600">Customer Signature</p>
                  </div>
                  <div>
                    <div className="border-b border-black w-40 mx-auto pb-1 font-semibold uppercase">
                      {receipt.received_by || 'Authorized Cashier'}
                    </div>
                    <p className="mt-1 text-gray-600">Authorized Collector / Cashier</p>
                  </div>
                </div>

                {/* Footer Note */}
                <div className="text-center pt-3 border-t border-gray-300 text-[10px] text-gray-500">
                  <p>This is a system-generated official receipt acknowledged by {companyTitle}.</p>
                  <p>Timestamp: {new Date().toLocaleString()}</p>
                </div>
              </div>
            )
          })()
        ) : (
          <div>
            {/* Summary Report Header */}
            <div className="border-b-2 border-black pb-3 mb-6">
              <div className="flex justify-between items-start">
                <div>
                  <h1 className="text-2xl font-black uppercase tracking-wider">{settings?.company_name || 'PROJECT: PACE Z-LICZ'}</h1>
                  <p className="text-sm font-semibold uppercase text-gray-800">{user?.employee?.branch?.name || settings?.branch_name || 'Headquarters'}</p>
                  <h2 className="text-lg font-bold text-gray-700 mt-2">PAYMENT COLLECTIONS & RECEIPTS REPORT</h2>
                </div>
                <div className="text-right text-xs">
                  <p><span className="font-semibold text-gray-600">Generated Date:</span> {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                  <p><span className="font-semibold text-gray-600">Generated By:</span> {user?.username || 'Staff'}</p>
                  <p><span className="font-semibold text-gray-600">Branch Filter:</span> {branchFilter}</p>
                  <p><span className="font-semibold text-gray-600">Method Filter:</span> {methodFilter}</p>
                </div>
              </div>
            </div>

            {/* Metrics Box */}
            <div className="grid grid-cols-4 gap-3 mb-6 text-xs border border-gray-300 p-3 bg-gray-50">
              <div>
                <span className="text-gray-500 block uppercase text-[10px] font-bold">Today's Collections</span>
                <span className="font-mono font-bold text-base">{fmt(monitoring?.today?.collected || 0)}</span>
                <span className="text-[10px] text-gray-500 block">{monitoring?.today?.count || 0} payments</span>
              </div>
              <div>
                <span className="text-gray-500 block uppercase text-[10px] font-bold">Monthly Collections</span>
                <span className="font-mono font-bold text-base">{fmt(monitoring?.month?.collected || 0)}</span>
                <span className="text-[10px] text-gray-500 block">{monitoring?.month?.count || 0} payments</span>
              </div>
              <div>
                <span className="text-gray-500 block uppercase text-[10px] font-bold">Total Cash Collected</span>
                <span className="font-mono font-bold text-base">{fmt(monitoring?.total?.cash || 0)}</span>
                <span className="text-[10px] text-gray-500 block">Cash in register</span>
              </div>
              <div>
                <span className="text-gray-500 block uppercase text-[10px] font-bold">Digital Collections</span>
                <span className="font-mono font-bold text-base">{fmt(monitoring?.total?.digital || 0)}</span>
                <span className="text-[10px] text-gray-500 block">GCash / Maya / Bank</span>
              </div>
            </div>

            {/* Payments List Table */}
            <table className="w-full text-[11px] border-collapse mb-6">
              <thead>
                <tr className="border-y-2 border-black bg-gray-100">
                  <th className="py-2 px-2 text-left font-bold uppercase">Receipt #</th>
                  <th className="py-2 px-2 text-left font-bold uppercase">Date</th>
                  <th className="py-2 px-2 text-left font-bold uppercase">Account #</th>
                  <th className="py-2 px-2 text-left font-bold uppercase">Customer</th>
                  <th className="py-2 px-2 text-left font-bold uppercase">Branch</th>
                  <th className="py-2 px-2 text-left font-bold uppercase">Method</th>
                  <th className="py-2 px-2 text-left font-bold uppercase">Received By</th>
                  <th className="py-2 px-2 text-right font-bold uppercase">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredPayments.map((p, idx) => (
                  <tr key={p.payment_id || idx}>
                    <td className="py-1.5 px-2 font-mono font-bold">{p.receipt_no}</td>
                    <td className="py-1.5 px-2 font-mono">{p.payment_date}</td>
                    <td className="py-1.5 px-2 font-mono font-semibold">{p.account_no}</td>
                    <td className="py-1.5 px-2 font-medium">{p.customer_name}</td>
                    <td className="py-1.5 px-2 text-gray-700">{p.branch}</td>
                    <td className="py-1.5 px-2 font-medium">{p.payment_method}</td>
                    <td className="py-1.5 px-2 text-gray-700">{p.received_by}</td>
                    <td className="py-1.5 px-2 text-right font-mono font-bold">{fmt(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-black font-bold">
                  <td colSpan={7} className="py-2 px-2 text-right uppercase">Total Amount ({filteredPayments.length} transactions):</td>
                  <td className="py-2 px-2 text-right font-mono text-base">
                    {fmt(filteredPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0))}
                  </td>
                </tr>
              </tfoot>
            </table>

            {/* Signatures */}
            <div className="grid grid-cols-3 gap-6 pt-6 text-xs text-center border-t border-gray-300">
              <div>
                <div className="border-b border-black pb-1 font-semibold uppercase">{user?.username || 'Staff'}</div>
                <p className="mt-1 text-gray-600">Prepared By</p>
              </div>
              <div>
                <div className="border-b border-black pb-1 font-semibold uppercase">Branch Accountant</div>
                <p className="mt-1 text-gray-600">Reviewed & Verified By</p>
              </div>
              <div>
                <div className="border-b border-black pb-1 font-semibold uppercase">Store Manager</div>
                <p className="mt-1 text-gray-600">Approved By</p>
              </div>
            </div>
          </div>
        )}

      </div>
    </>
  )
}
