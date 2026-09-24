import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  FiPlus, FiSearch, FiEye, FiEdit, FiTrash2,
  FiCalendar, FiUser, FiCreditCard, FiAlertTriangle, FiCheckCircle,
  FiX, FiPhone, FiMapPin, FiPackage, FiPercent, FiFileText,
  FiClock, FiPrinter, FiFilter, FiInfo, FiLayers
} from 'react-icons/fi'
import {
  Btn, Badge, StatusBadge, Modal, PageHeader, StatCard, Card,
  CardHeader, ProgressBar, Pagination, showToast, TabBar,
  LoadingState, ErrorAlert, TableSkeleton, EmptyState, confirmAction
} from '../components/ui'
import { fmt, fmtDate } from '../lib/utils'
import { useAuth } from '../context/AuthContext'
import api, { downloadCsv } from '../lib/api'
import { TbCurrencyPeso } from 'react-icons/tb'
import { FiDownload } from 'react-icons/fi'

export default function InstallmentsPage({ branchFilter: propBranchFilter, embedded }) {
  const [searchParams] = useSearchParams()
  const { user } = useAuth()
  const isStoreAdmin = user?.role === 'Store Administrator' || user?.role === 'Store Admin'
  const isAdmin = user?.role === 'Administrator'

  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'all')
  const [installments, setInstallments] = useState([])
  const [customers, setCustomers] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Filters (Immediate reactive search & status)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [localBranchFilter, setLocalBranchFilter] = useState(isStoreAdmin ? (user?.employee?.branch || 'Main Branch') : 'All')
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

  // ─── ADD ACCOUNT FORM STATE ──────────────────────────────────────────────────
  const initialAddForm = {
    customer_mode: 'existing', // 'existing' | 'new'
    customer_id: '',
    first_name: '',
    last_name: '',
    phone: '',
    email: '',
    address: '',

    product_mode: 'catalog', // 'catalog' | 'custom'
    product_id: '',
    product_name: '',
    principal_amount: '',
    down_payment: '0',
    interest_rate: '10', // default 10%
    number_of_installments: '6', // default 6 months
    frequency: 'Monthly',
    start_date: new Date().toISOString().slice(0, 10),
    due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    status: 'Active',
    notes: '',
  }
  const [addForm, setAddForm] = useState(initialAddForm)

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

  // ─── INITIAL DATA LOAD ──────────────────────────────────────────────────────
  const loadInitialData = async (silent = false) => {
    if (!silent) setLoading(true)
    if (!silent) setError('')
    try {
      const [instRes, custRes, prodRes] = await Promise.all([
        api.installments.getAll({
          branch: branchFilter !== 'All' ? branchFilter : undefined,
        }),
        api.customers.getAll().catch(() => ({ customers: [] })),
        api.products.getAll().catch(() => ({ products: [] })),
      ])

      setInstallments(instRes.installments || [])
      setCustomers(custRes.customers || [])
      setProducts(prodRes.products || [])
    } catch (err) {
      console.error('Failed to load installment data:', err)
      if (!silent) setError(err.message || 'Failed to fetch customer installment records')
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    loadInitialData()
    const interval = setInterval(() => loadInitialData(true), 10000)
    return () => clearInterval(interval)
  }, [branchFilter, search, statusFilter, activeTab])

  useEffect(() => {
    const id = searchParams.get('id')
    if (id) {
      openDetail({ installment_id: id })
    }
  }, [searchParams])

  // ─── CALCULATED VALUES FOR ADD FORM ─────────────────────────────────────────
  const calculatedAddValues = useMemo(() => {
    const price = parseFloat(addForm.principal_amount) || 0
    const down = parseFloat(addForm.down_payment) || 0
    const rate = parseFloat(addForm.interest_rate) || 0
    const terms = parseInt(addForm.number_of_installments) || 1

    const financed = Math.max(0, price - down)
    const interestAmt = Math.round(financed * (rate / 100) * 100) / 100
    const totalPayable = Math.round((price + interestAmt) * 100) / 100
    const outstanding = Math.max(0, Math.round((totalPayable - down) * 100) / 100)
    const monthlyAmt = terms > 0 ? Math.round((outstanding / terms) * 100) / 100 : 0

    return {
      price,
      down,
      rate,
      terms,
      financed,
      interestAmt,
      totalPayable,
      outstanding,
      monthlyAmt,
    }
  }, [addForm.principal_amount, addForm.down_payment, addForm.interest_rate, addForm.number_of_installments])

  // Handle Product Selection in Add Form
  const handleProductSelect = (prodId) => {
    const p = products.find(x => String(x.product_id) === String(prodId))
    if (p) {
      const effectivePrice = p.discount_price ? p.discount_price : p.unit_price;
      setAddForm(prev => ({
        ...prev,
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

  // Handle Customer Selection in Add Form
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
    }
  }

  // ─── FILTER & SEARCH LOGIC ──────────────────────────────────────────────────
  const filteredInstallments = useMemo(() => {
    return installments.filter(inst => {
      // Tab filter
      if (activeTab === 'overdue' && inst.status !== 'Overdue') {
        return false
      }

      // Status filter
      if (statusFilter !== 'All' && inst.status !== statusFilter) {
        return false
      }

      // Search query (Customer name, account #, phone, invoice, product)
      if (search.trim()) {
        const q = search.toLowerCase().trim()
        const matchAcc = (inst.account_no || '').toLowerCase().includes(q)
        const matchCust = (inst.customer_name || '').toLowerCase().includes(q)
        const matchPhone = (inst.customer_phone || '').toLowerCase().includes(q)
        const matchInv = (inst.invoice_no || '').toLowerCase().includes(q)
        const matchProd = (inst.product_name || '').toLowerCase().includes(q)
        if (!matchAcc && !matchCust && !matchPhone && !matchInv && !matchProd) {
          return false
        }
      }

      return true
    })
  }, [installments, activeTab, statusFilter, search])

  // Summary KPI values computed from live state
  const liveSummary = useMemo(() => {
    const totalFinanced = installments.reduce((acc, i) => acc + (i.total_payable || 0), 0)
    const totalPaid = installments.reduce((acc, i) => acc + (i.paid || 0), 0)
    const totalOutstanding = installments.reduce((acc, i) => acc + (i.balance || 0), 0)
    const activeCount = installments.filter(i => i.status === 'Active').length
    const overdueCount = installments.filter(i => i.status === 'Overdue').length
    const completedCount = installments.filter(i => i.status === 'Completed').length
    const pendingCount = installments.filter(i => i.status === 'Pending').length

    return {
      totalFinanced,
      totalPaid,
      totalOutstanding,
      activeCount,
      overdueCount,
      completedCount,
      pendingCount,
      totalCount: installments.length,
    }
  }, [installments])

  // ─── CREATE CUSTOMER ACCOUNT (AUTOMATIC REACT STATE UPDATE) ───────────────────
  const handleAddAccount = async (e) => {
    e.preventDefault()

    if (calculatedAddValues.price <= 0) {
      showToast('Please enter a valid product purchase price', 'error')
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

    setSaving(true)
    try {
      const payload = {
        customer_id: addForm.customer_mode === 'existing' ? parseInt(addForm.customer_id) : undefined,
        first_name: addForm.first_name,
        last_name: addForm.last_name,
        phone: addForm.phone,
        email: addForm.email,
        address: addForm.address,
        product_id: addForm.product_id ? parseInt(addForm.product_id) : undefined,
        product_name: addForm.product_name,
        principal_amount: calculatedAddValues.price,
        down_payment: calculatedAddValues.down,
        interest_rate: calculatedAddValues.rate,
        interest_amount: calculatedAddValues.interestAmt,
        total_payable: calculatedAddValues.totalPayable,
        installment_amount: calculatedAddValues.monthlyAmt,
        number_of_installments: calculatedAddValues.terms,
        frequency: addForm.frequency,
        start_date: addForm.start_date,
        due_date: addForm.due_date,
        status: addForm.status,
        notes: addForm.notes,
      }

      const res = await api.installments.create(payload)

      if (res.account) {
        // AUTOMATIC STATE UPDATE: Prepend new account to list immediately without browser reload
        setInstallments(prev => [res.account, ...prev])
      }

      showToast(res.message || 'Customer installment created successfully', 'success')
      setAddModalOpen(false)
      setAddForm(initialAddForm)
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

      showToast(res.message || 'Installment deleted successfully', 'success')
    } catch (err) {
      showToast(err.message || 'Failed to delete installment', 'error')
    } finally {
      setSaving(false)
    }
  }

  // ─── VIEW ACCOUNT DETAILS ─────────────────────────────────────────────────────
  const openDetail = async (inst) => {
    setDetailItem(null)
    setDetailTab('schedules')
    setDetailLoading(true)
    try {
      const data = await api.installments.getById(inst.installment_id)
      setDetailItem(data)
    } catch (err) {
      showToast(err.message || 'Failed to load installment details', 'error')
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
            const newStatus = newBal <= 0 ? 'Completed' : (res.account.status || item.status)
            return {
              ...item,
              paid: newPaid,
              balance: newBal,
              status: newStatus,
              payment_status: newBal <= 0 ? 'Paid in Full' : 'Partially Paid',
              progress_percentage: item.total_payable > 0 ? Math.min(100, Math.round((newPaid / item.total_payable) * 100)) : 100,
            }
          }
          return item
        }))
      }

      showToast(res.message || 'Payment recorded successfully', 'success')
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
    { id: 'all', label: 'All Customer Accounts', icon: <FiCreditCard className="w-4 h-4" /> },
    {
      id: 'overdue',
      label: `Overdue Accounts (${liveSummary.overdueCount})`,
      icon: <FiAlertTriangle className="w-4 h-4 text-rose-500" />,
      badge: liveSummary.overdueCount > 0 ? liveSummary.overdueCount : null
    },
  ]

  return (
    <div className={embedded ? "animate-fadeIn" : "space-y-6 animate-fadeIn"}>
      {/* ─── PAGE HEADER WITH ADD ACCOUNT BUTTON (NO REFRESH BUTTON) ─── */}
      {!embedded && (
        <PageHeader
          title="Customer Installment"
          subtitle={
            isStoreAdmin
              ? `Store Branch Ledger (${user?.employee?.branch || 'Main Branch'})`
              : 'Manage customer credit contracts, payment amortization schedules, and receivables'
          }
          action={
            <div className="flex gap-2">
              <button
                onClick={handleExportCSV}
                disabled={exporting}
                className="flex items-center gap-2 px-4 py-2 bg-muted hover:bg-muted/80 text-foreground font-semibold text-xs rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50"
              >
                {exporting ? <FiAlertTriangle className="w-4 h-4 animate-spin" /> : <FiDownload className="w-4 h-4" />}
                <span>{exporting ? 'Exporting...' : 'Export CSV'}</span>
              </button>
              {!isAdmin && (
                <button
                  onClick={() => setAddModalOpen(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
                >
                  <FiPlus className="w-4 h-4" />
                  <span>New Account</span>
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
              <option value="Completed">Completed ({liveSummary.completedCount})</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>

          {/* Branch Filter (if Admin) */}
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
              <option value="Main Branch">Main Branch</option>
              <option value="North Branch">North Branch</option>
              <option value="South Branch">South Branch</option>
            </select>
          </div>
        </div>
      </Card>

      {/* ─── CUSTOMER INSTALLMENT ACCOUNTS TABLE ─── */}
      {loading ? (
        <TableSkeleton rows={6} cols={8} />
      ) : (
        <Card noPad className="border border-border overflow-hidden shadow-2xs">
          <CardHeader
            title={activeTab === 'overdue' ? 'Overdue Installment' : 'Customer Installment Ledger'}
            action={
              <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
                <span>Showing {paginated.length} of {filteredInstallments.length} accounts</span>
              </div>
            }
          />

          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[920px]">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-muted-foreground uppercase font-semibold tracking-wider text-[11px]">
                  <th className="py-3 px-4 text-left">Account #</th>
                  <th className="py-3 px-4 text-left">Customer Name</th>
                  <th className="py-3 px-4 text-left">Product / Item</th>
                  <th className="py-3 px-4 text-right">Total Amount</th>
                  <th className="py-3 px-4 text-right">Down Payment</th>
                  <th className="py-3 px-4 text-right">Monthly Inst.</th>
                  <th className="py-3 px-4 text-right">Paid Amount</th>
                  <th className="py-3 px-4 text-right">Outstanding</th>
                  <th className="py-3 px-4 text-left">Next Due Date</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paginated.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-12 text-center text-muted-foreground">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <FiCreditCard className="w-8 h-8 text-muted-foreground/50" />
                        <span className="font-semibold text-foreground">No customer installment found</span>
                        <span className="text-xs">Click "Add Customer Account" to create a new installment financing agreement.</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginated.map((inst, i) => {
                    const isOverdue = inst.status === 'Overdue' || inst.days_overdue > 0
                    return (
                      <tr
                        key={inst.installment_id}
                        className={`hover:bg-muted/40 transition-colors ${
                          i % 2 === 1 ? 'bg-muted/10' : ''
                        } ${isOverdue ? 'bg-rose-50/20 dark:bg-rose-950/10' : ''}`}
                      >
                        {/* Account # */}
                        <td className="py-3 px-4 font-mono font-bold text-foreground">
                          <div className="flex items-center gap-1.5">
                            <FiCreditCard className="w-3.5 h-3.5 text-primary shrink-0" />
                            <span>{inst.account_no}</span>
                          </div>
                        </td>

                        {/* Customer */}
                        <td className="py-3 px-4">
                          <div className="font-semibold text-foreground flex items-center gap-1.5">
                            <FiUser className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            <span>{inst.customer_name}</span>
                          </div>
                          {inst.customer_phone && (
                            <div className="text-[10px] text-muted-foreground font-mono pl-5">
                              {inst.customer_phone}
                            </div>
                          )}
                        </td>

                        {/* Product */}
                        <td className="py-3 px-4">
                          <div className="font-medium text-foreground flex items-center gap-1.5 max-w-[200px] truncate" title={inst.product_name}>
                            <FiPackage className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                            <span className="truncate">{inst.product_name || 'Appliance / Furniture'}</span>
                          </div>
                        </td>

                        {/* Total Amount */}
                        <td className="py-3 px-4 text-right font-mono font-semibold text-foreground">
                          {fmt(inst.total_payable)}
                        </td>

                        {/* Down Payment */}
                        <td className="py-3 px-4 text-right font-mono text-muted-foreground">
                          {fmt(inst.down_payment)}
                        </td>

                        {/* Monthly Installment */}
                        <td className="py-3 px-4 text-right font-mono font-semibold text-primary">
                          {fmt(inst.installment_amount)}
                        </td>

                        {/* Paid Amount */}
                        <td className="py-3 px-4 text-right font-mono text-emerald-600 font-bold">
                          {fmt(inst.paid)}
                        </td>

                        {/* Outstanding Balance */}
                        <td className="py-3 px-4 text-right font-mono font-bold text-rose-600">
                          {fmt(inst.balance)}
                        </td>

                        {/* Next Due Date */}
                        <td className="py-3 px-4">
                          {inst.next_due_date ? (
                            <div className="flex items-center gap-1.5 font-mono text-xs">
                              <FiCalendar className={`w-3.5 h-3.5 ${isOverdue ? 'text-rose-500' : 'text-muted-foreground'}`} />
                              <span className={isOverdue ? 'text-rose-600 font-bold' : 'text-foreground'}>
                                {inst.next_due_date}
                              </span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground font-mono">—</span>
                          )}
                        </td>

                        {/* Status */}
                        <td className="py-3 px-4 text-center">
                          <StatusBadge status={inst.status} />
                        </td>

                        {/* Actions with React Icons */}
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {/* View Action */}
                            <button
                              onClick={() => openDetail(inst)}
                              title="View Full Contract & Schedules"
                              className="p-1.5 rounded-lg border border-border hover:bg-muted text-foreground transition-colors cursor-pointer"
                            >
                              <FiEye className="w-3.5 h-3.5" />
                            </button>

                            {/* Record Payment Action */}
                            {!isAdmin && inst.balance > 0 && (
                              <button
                                onClick={() => openPaymentModal(inst)}
                                title="Record Installment Payment"
                                className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:hover:bg-emerald-900 dark:text-emerald-300 border border-emerald-200 transition-colors cursor-pointer"
                              >
                                <TbCurrencyPeso className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {/* Edit Action */}
                            <button
                              onClick={() => openEditModal(inst)}
                              title="Edit Account Details"
                              className="p-1.5 rounded-lg border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                            >
                              <FiEdit className="w-3.5 h-3.5" />
                            </button>

                            {/* Delete Action */}
                            <button
                              onClick={() => handleDeleteAccount(inst)}
                              title="Delete Account"
                              className="p-1.5 rounded-lg border border-border hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 text-muted-foreground transition-colors cursor-pointer"
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
          size="lg"
        >
          <form onSubmit={handleAddAccount} className="space-y-4 text-xs">
            {/* Customer Section */}
            <div className="p-3.5 rounded-xl bg-muted/30 border border-border space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-primary text-[11px]">
                  <FiUser className="w-4 h-4" />
                  <span>Customer Information</span>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setAddForm(p => ({ ...p, customer_mode: 'existing' }))}
                    className={`px-2.5 py-1 rounded-lg font-semibold text-[11px] cursor-pointer transition-all ${
                      addForm.customer_mode === 'existing'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-card border border-border text-muted-foreground'
                    }`}
                  >
                    Existing Customer
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddForm(p => ({ ...p, customer_mode: 'new', customer_id: '' }))}
                    className={`px-2.5 py-1 rounded-lg font-semibold text-[11px] cursor-pointer transition-all ${
                      addForm.customer_mode === 'new'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-card border border-border text-muted-foreground'
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
                    {customers.map(c => (
                      <option key={c.customer_id} value={c.customer_id}>
                        {c.customer_code ? `[${c.customer_code}] ` : ''}{c.first_name} {c.last_name} {c.phone ? `(${c.phone})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block font-bold text-muted-foreground mb-1">First Name *</label>
                    <input
                      type="text"
                      placeholder="e.g. Maria"
                      value={addForm.first_name}
                      onChange={e => setAddForm(p => ({ ...p, first_name: e.target.value }))}
                      required
                      className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-muted-foreground mb-1">Last Name *</label>
                    <input
                      type="text"
                      placeholder="e.g. Santos"
                      value={addForm.last_name}
                      onChange={e => setAddForm(p => ({ ...p, last_name: e.target.value }))}
                      required
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
                      type="text"
                      placeholder="0917XXXXXXX"
                      value={addForm.phone}
                      onChange={e => setAddForm(p => ({ ...p, phone: e.target.value }))}
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-bold text-muted-foreground mb-1">Product Selection</label>
                  <select
                    value={addForm.product_id}
                    onChange={e => handleProductSelect(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-medium"
                  >
                    <option value="">-- Choose from Catalog (or custom) --</option>
                    {products.map(p => {
                      const effPrice = p.discount_price ? p.discount_price : p.unit_price;
                      return (
                        <option key={p.product_id} value={p.product_id}>
                          {p.product_name} — {fmt(effPrice)} (Stock: {p.stock_quantity}) {p.discount_price ? '[SALE]' : ''}
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

              {/* Numerical Pricing Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div>
                  <label className="block font-bold text-muted-foreground mb-1">Product Price (PHP) *</label>
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

                <div>
                  <label className="block font-bold text-muted-foreground mb-1">Term (Months) *</label>
                  <select
                    value={addForm.number_of_installments}
                    onChange={e => setAddForm(p => ({ ...p, number_of_installments: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-semibold"
                  >
                    <option value="3">3 Months</option>
                    <option value="6">6 Months</option>
                    <option value="9">9 Months</option>
                    <option value="12">12 Months</option>
                    <option value="18">18 Months</option>
                    <option value="24">24 Months</option>
                    <option value="36">36 Months</option>
                  </select>
                </div>
              </div>

              {/* Dates & Frequency */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="block font-bold text-muted-foreground mb-1">Payment Frequency</label>
                  <select
                    value={addForm.frequency}
                    onChange={e => setAddForm(p => ({ ...p, frequency: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-medium"
                  >
                    <option value="Monthly">Monthly</option>
                    <option value="Bi-weekly">Bi-weekly</option>
                    <option value="Weekly">Weekly</option>
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
                  <label className="block font-bold text-muted-foreground mb-1">First Due Date</label>
                  <input
                    type="date"
                    value={addForm.due_date}
                    onChange={e => setAddForm(p => ({ ...p, due_date: e.target.value }))}
                    required
                    className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Live Calculation Summary Card */}
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
                <div className="text-[10px] uppercase font-bold text-muted-foreground">Monthly Installment</div>
                <div className="font-mono font-bold text-primary text-sm">{fmt(calculatedAddValues.monthlyAmt)}</div>
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
            <div className="flex justify-end gap-2 pt-3 border-t border-border">
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
          size="md"
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
                <option value="Completed">Completed</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block font-bold text-muted-foreground mb-1">Contact Phone</label>
                <input
                  type="text"
                  value={editForm.phone}
                  onChange={e => setEditForm(p => ({ ...p, phone: e.target.value }))}
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

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
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
          title={`Installment — ${detailItem.account?.account_no}`}
          size="lg"
        >
          {detailLoading ? (
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
                  <div className="font-bold text-sm text-foreground">{detailItem.account?.customer_name}</div>
                  <div className="text-muted-foreground flex items-center gap-1">
                    <FiPhone className="w-3 h-3" /> {detailItem.account?.customer_phone || '—'}
                  </div>
                  <div className="text-muted-foreground flex items-center gap-1">
                    <FiMapPin className="w-3 h-3" /> {detailItem.account?.customer_address || '—'}
                  </div>
                </div>

                <div className="space-y-1 md:text-right">
                  <div className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1 md:justify-end">
                    <FiFileText className="w-3 h-3" />
                    <span>Contract & Branch</span>
                  </div>
                  <div className="font-bold text-sm text-primary">{detailItem.account?.branch}</div>
                  <div className="font-mono text-muted-foreground">Invoice: {detailItem.account?.invoice_no}</div>
                  <div className="font-mono text-muted-foreground">Start Date: {detailItem.account?.start_date}</div>
                </div>
              </div>

              {/* Purchased Product Ledger */}
              {detailItem.sale_items && detailItem.sale_items.length > 0 && (
                <div className="p-3 bg-card rounded-xl border border-border">
                  <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                    <FiPackage className="w-3.5 h-3.5 text-amber-500" />
                    <span>Purchased Items & Financed Products</span>
                  </div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-muted/40 text-muted-foreground text-left">
                        <th className="py-1.5 px-2">SKU</th>
                        <th className="py-1.5 px-2">Product Name</th>
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
                          <td className="py-1.5 px-2 text-right font-mono">{item.quantity}</td>
                          <td className="py-1.5 px-2 text-right font-mono">{fmt(item.unit_price)}</td>
                          <td className="py-1.5 px-2 text-right font-mono font-bold">{fmt(item.line_total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Financing Terms Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-2.5 bg-muted/20 rounded-xl border border-border">
                  <div className="text-[10px] text-muted-foreground uppercase font-bold">Principal Price</div>
                  <div className="font-mono font-bold text-foreground mt-0.5">{fmt(detailItem.account?.principal_amount)}</div>
                </div>
                <div className="p-2.5 bg-muted/20 rounded-xl border border-border">
                  <div className="text-[10px] text-muted-foreground uppercase font-bold">Down Payment</div>
                  <div className="font-mono font-bold text-emerald-600 mt-0.5">{fmt(detailItem.account?.down_payment)}</div>
                </div>
                <div className="p-2.5 bg-muted/20 rounded-xl border border-border">
                  <div className="text-[10px] text-muted-foreground uppercase font-bold">Financed Balance</div>
                  <div className="font-mono font-bold text-foreground mt-0.5">{fmt(detailItem.account?.financed_amount)}</div>
                </div>
                <div className="p-2.5 bg-muted/20 rounded-xl border border-border">
                  <div className="text-[10px] text-muted-foreground uppercase font-bold">Term / Rate</div>
                  <div className="font-bold text-foreground mt-0.5">{detailItem.account?.number_of_installments} Mo ({detailItem.account?.interest_rate}%)</div>
                </div>
              </div>

              {/* Payment Progress Bar */}
              <div className="p-3.5 bg-muted/30 rounded-xl border border-border space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-foreground">Payment Progress ({detailItem.account?.progress_percentage}%)</span>
                  <div className="flex gap-4 font-mono">
                    <span>Paid: <strong className="text-emerald-600">{fmt(detailItem.account?.paid)}</strong></span>
                    <span>Remaining: <strong className="text-rose-600">{fmt(detailItem.account?.balance)}</strong></span>
                  </div>
                </div>
                <ProgressBar value={detailItem.account?.progress_percentage || 0} />
              </div>

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
                    onClick={() => setDetailTab('schedules')}
                    className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold border-b-2 cursor-pointer transition-colors ${
                      detailTab === 'schedules' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'
                    }`}
                  >
                    <FiCalendar className="w-3.5 h-3.5" />
                    <span>Amortization Schedule ({detailItem.schedules?.length || 0})</span>
                  </button>
                  <button
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
                          <th className="py-2 px-3">Method</th>
                          <th className="py-2 px-3">Ref #</th>
                          <th className="py-2 px-3">Staff</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailItem.payments?.length === 0 ? (
                          <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">No payments recorded yet</td></tr>
                        ) : (
                          detailItem.payments?.map(p => (
                            <tr key={p.payment_id} className="border-b border-border hover:bg-muted/30">
                              <td className="py-2 px-3 font-mono font-bold text-foreground">{p.receipt_no}</td>
                              <td className="py-2 px-3 font-mono">{p.payment_date}</td>
                              <td className="py-2 px-3 text-right font-mono font-bold text-emerald-600">{fmt(p.amount)}</td>
                              <td className="py-2 px-3">{p.payment_method}</td>
                              <td className="py-2 px-3 font-mono text-muted-foreground">{p.reference_no || '—'}</td>
                              <td className="py-2 px-3 text-muted-foreground">{p.received_by}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex justify-between items-center pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-border hover:bg-muted text-foreground font-semibold cursor-pointer"
                >
                  <FiPrinter className="w-4 h-4" />
                  <span>Print Statement</span>
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setDetailItem(null)}
                    className="flex items-center gap-1 px-4 py-1.5 rounded-xl border border-border hover:bg-muted text-foreground font-semibold cursor-pointer"
                  >
                    <FiX className="w-3.5 h-3.5" />
                    <span>Close</span>
                  </button>
                  {detailItem.account?.balance > 0 && (
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
          size="md"
        >
          <form onSubmit={handleRecordPayment} className="space-y-4 text-xs">
            <div className="p-3.5 bg-muted/40 rounded-xl border border-border space-y-1.5">
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
              <div className="flex justify-between border-t border-border pt-1.5 font-bold">
                <span className="text-rose-600">Remaining Balance:</span>
                <span className="font-mono text-rose-600 text-sm">{fmt(payModalItem.balance)}</span>
              </div>
            </div>

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

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
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
    </div>
  )
}
