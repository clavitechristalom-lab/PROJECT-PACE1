import { useState, useEffect, useMemo, useRef } from 'react'
import {
  FiShoppingCart, FiPlus, FiDownload, FiCreditCard,
  FiEye, FiTrash2, FiPrinter, FiSearch, FiCalendar, FiUser,
  FiPackage, FiCheckCircle, FiX, FiTag, FiPercent, FiFileText,
  FiAlertTriangle
} from 'react-icons/fi'
import {
  Btn, Badge, StatusBadge, Input, Select, Textarea, Modal,
  Table, TR, TD, SearchBar, PageHeader, StatCard, Card, CardHeader, Pagination, showToast,
  LoadingState, ErrorAlert, TableSkeleton, EmptyState, TabBar, showLoading, closeLoading
} from '../components/ui'
import { fmt, fmtDate, filterBySearch, fastDeepEqual } from '../lib/utils'
import { formatQty, extractDigitalRefAndNotes, printOfficialInvoice } from '../lib/invoicePrint'
import { useAuth } from '../context/AuthContext'
import api, { downloadCsv } from '../lib/api'
import { useRealtimeSync, triggerDataSync, SyncButton } from '../lib/realtimeSync'
import { TbCurrencyPeso } from 'react-icons/tb'
import MySalesChart from '../components/MySalesChart'

function SalesPage({ branchFilter, embedded }) {
  const { user } = useAuth()
  const isAdmin = user?.role === 'Administrator'
  const canCreateSale = !isAdmin
  const inFlightRef = useRef(false)
  const isMountedRef = useRef(true)

  const [sales, setSales] = useState(() => {
    try {
      const saved = sessionStorage.getItem('pace_cached_sales')
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })
  const [products, setProducts] = useState([])
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(() => {
    return !sessionStorage.getItem('pace_cached_sales')
  })
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [methodFilter, setMethodFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [page, setPage] = useState(1)
  const pageSize = 10

  // Modals
  const [newSaleModal, setNewSaleModal] = useState(false)
  const [viewSale, setViewSale] = useState(null)
  const [saving, setSaving] = useState(false)

  const getTodayLocalYMD = () => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  // New Sale Form State
  const [customerId, setCustomerId] = useState('')
  const [customerSearch, setCustomerSearch] = useState('')
  const [saleDate, setSaleDate] = useState(getTodayLocalYMD)
  const [paymentMethod, setPaymentMethod] = useState('Cash')
  const [items, setItems] = useState([{ product_id: '', quantity: 1, discount: 0 }])
  const [cashTendered, setCashTendered] = useState('')
  const [paymentReference, setPaymentReference] = useState('')
  const [downPayment, setDownPayment] = useState('0')
  const [digitalPaidFull, setDigitalPaidFull] = useState(true)
  const [interestRate, setInterestRate] = useState('0')
  const [numInstallments, setNumInstallments] = useState('12')
  const [frequency, setFrequency] = useState('Monthly')
  const [notes, setNotes] = useState('')
  const [autoOpenInvoice, setAutoOpenInvoice] = useState(true)

  const resetNewSaleForm = () => {
    setCustomerId('')
    setCustomerSearch('')
    setSaleDate(getTodayLocalYMD())
    setPaymentMethod('Cash')
    setItems([{ product_id: '', quantity: 1, discount: 0 }])
    setCashTendered('')
    setPaymentReference('')
    setDownPayment('0')
    setDigitalPaidFull(true)
    setInterestRate('0')
    setNumInstallments('12')
    setFrequency('Monthly')
    setNotes('')
  }

  const openNewSaleModal = () => {
    resetNewSaleForm()
    setNewSaleModal(true)
  }

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const loadData = async (silent = false, signal) => {
    // 1-2s Overlap Guard: Skip if previous request is still in-flight
    if (inFlightRef.current) return
    inFlightRef.current = true

    const isBg = silent || sales.length > 0
    if (!isBg) setLoading(true)
    if (!isBg) setError('')
    try {
      const reqOpts = signal ? { signal } : {}
      const needCatalog = products.length === 0 || customers.length === 0 || !silent

      const promises = [
        api.sales.getAll({
          search: search || undefined,
          payment_method: methodFilter !== 'All' ? methodFilter : undefined,
          status: statusFilter !== 'All' ? statusFilter : undefined,
          branch: branchFilter || undefined,
        }, reqOpts)
      ]

      if (needCatalog) {
        promises.push(
          api.products.getAll({ branch: branchFilter || undefined }, reqOpts).catch(() => ({ products: [] })),
          api.customers.getAll({ branch: branchFilter || undefined }, reqOpts).catch(() => ({ customers: [] }))
        )
      }

      const [salesRes, productsRes, customersRes] = await Promise.all(promises)

      if (!isMountedRef.current) return

      const newSales = salesRes?.sales || []
      setSales(prev => (fastDeepEqual(prev, newSales) ? prev : newSales))

      if (productsRes && productsRes.products) {
        setProducts(prev => (fastDeepEqual(prev, productsRes.products) ? prev : productsRes.products))
      }
      if (customersRes && customersRes.customers) {
        setCustomers(prev => (fastDeepEqual(prev, customersRes.customers) ? prev : customersRes.customers))
      }

      try {
        if (!search && methodFilter === 'All' && statusFilter === 'All') {
          sessionStorage.setItem('pace_cached_sales', JSON.stringify(newSales))
        }
      } catch (e) { }
    } catch (err) {
      if (!isMountedRef.current) return
      console.error('Failed to load sales data:', err)
      if (!isBg) setError(err.message || 'Failed to fetch sales transactions')
    } finally {
      inFlightRef.current = false
      if (!isBg && isMountedRef.current) setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [methodFilter, statusFilter, branchFilter, search])

  // On-demand click-driven synchronization
  const { sync: syncSales, isSyncing: isSyncingSales } = useRealtimeSync(
    (_, signal) => loadData(false, signal),
    [],
    { module: 'sales' }
  )

  const handlePrintInvoice = (invoiceData = viewSale) => {
    if (!invoiceData?.sale) return
    printOfficialInvoice({
      sale: invoiceData.sale,
      items: invoiceData.items || [],
      installmentAccount: invoiceData.installment_account || null,
      defaultBranch: staffBranch || 'Main Branch',
      onPopupBlocked: () => showToast('Please allow pop-ups to print the sales invoice', 'error'),
    })
  }

  const openViewSale = async (s) => {
    try {
      const data = await api.sales.getById(s.sale_id)
      setViewSale(data)
    } catch (err) {
      showToast(err.message || 'Failed to fetch invoice details', 'error')
    }
  }

  const handleAddItem = () => {
    setItems(prev => [...prev, { product_id: '', quantity: 1, discount: 0 }])
  }

  const handleRemoveItem = (index) => {
    setItems(prev => prev.filter((_, i) => i !== index))
  }

  const handleItemChange = (index, field, value) => {
    setItems(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item))
  }

  // Calculate live totals & line breakdowns for the new sale
  const detailedItems = items.map((item) => {
    const prod = products.find(p => p.product_id === parseInt(item.product_id, 10)) || null
    const qty = Math.max(0, parseInt(item.quantity, 10) || 0)
    const basePrice = prod ? (parseFloat(prod.unit_price) || 0) : 0
    const promoPrice = prod && prod.discount_price ? parseFloat(prod.discount_price) : null
    const unitPrice = promoPrice !== null ? promoPrice : basePrice
    const rawDiscount = Math.max(0, parseFloat(item.discount) || 0)
    const grossLine = unitPrice * qty
    const lineTotal = Math.max(0, grossLine - rawDiscount)
    const stockAvail = prod ? Number(prod.stock_quantity || 0) : 0
    const overStock = Boolean(prod) && qty > stockAvail
    return {
      ...item,
      prod,
      qty,
      basePrice,
      promoPrice,
      unitPrice,
      rawDiscount,
      grossLine,
      lineTotal,
      stockAvail,
      overStock,
    }
  })

  const calculatedSubtotal = detailedItems.reduce((sum, it) => sum + it.grossLine, 0)
  const calculatedDiscount = detailedItems.reduce((sum, it) => sum + it.rawDiscount, 0)
  const totalCartUnits = detailedItems.reduce((sum, it) => sum + (it.prod ? it.qty : 0), 0)
  const calculatedTotal = Math.max(0, calculatedSubtotal - calculatedDiscount)
  const hasStockIssue = detailedItems.some(it => it.prod && (it.stockAvail <= 0 || it.overStock))

  const isDigitalMethod = ['GCash', 'Maya', 'Bank Account'].includes(paymentMethod)
  const isInstallment = paymentMethod === 'Installment'

  const effectiveDigitalPaid = digitalPaidFull
    ? calculatedTotal
    : Math.min(calculatedTotal, Math.max(0, parseFloat(downPayment) || 0))
  const downPayNum = isInstallment
    ? Math.min(calculatedTotal, Math.max(0, parseFloat(downPayment) || 0))
    : (isDigitalMethod ? effectiveDigitalPaid : calculatedTotal)

  const cashTenderedNum = cashTendered !== '' ? (parseFloat(cashTendered) || 0) : calculatedTotal
  const cashChangeDue = paymentMethod === 'Cash' ? Math.max(0, cashTenderedNum - calculatedTotal) : 0
  const isCashInsufficient = paymentMethod === 'Cash' && cashTendered !== '' && cashTenderedNum < calculatedTotal

  const interestNum = Math.max(0, parseFloat(interestRate) || 0)
  const principal = Math.max(0, calculatedTotal - downPayNum)
  const totalInterest = principal * (interestNum / 100)
  const totalInstallmentPayable = principal + totalInterest
  const monthlyInstallment = parseInt(numInstallments, 10) > 0 ? (totalInstallmentPayable / parseInt(numInstallments, 10)) : 0
  const estimatedStatus = (paymentMethod === 'Cash' || (isDigitalMethod && calculatedTotal - downPayNum <= 0))
    ? 'Completed'
    : (downPayNum > 0 ? 'Partially Paid' : 'Pending')

  const selectedCustomer = useMemo(
    () => customers.find(c => String(c.customer_id) === String(customerId)) || null,
    [customers, customerId]
  )

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase()
    if (!q) return customers
    return customers.filter(c => {
      if (String(c.customer_id) === String(customerId)) return true
      const full = `${c.first_name || ''} ${c.last_name || ''} ${c.customer_code || ''} ${c.phone || ''}`.toLowerCase()
      return full.includes(q)
    })
  }, [customers, customerSearch, customerId])

  const staffName = user?.employee
    ? `${user.employee.first_name || ''} ${user.employee.last_name || ''}`.trim() || user?.username
    : (user?.username || 'Store Staff')
  const staffBranch = (branchFilter && branchFilter !== 'All' ? branchFilter : '') ||
    user?.employee?.branch?.name ||
    (typeof user?.employee?.branch === 'string' ? user.employee.branch : '') ||
    'Assigned Branch'

  const handlePaymentMethodChange = (nextMethod) => {
    setPaymentMethod(nextMethod)
    if (nextMethod === 'Installment') {
      setDigitalPaidFull(false)
      if (parseFloat(downPayment) >= calculatedTotal) {
        setDownPayment('0')
      }
    } else if (['GCash', 'Maya', 'Bank Account'].includes(nextMethod)) {
      setDigitalPaidFull(true)
      setDownPayment(calculatedTotal.toFixed(2))
    } else {
      setCashTendered('')
      setDownPayment('0')
    }
  }

  const handleCreateSale = async (e) => {
    e.preventDefault()
    if (!customerId) {
      showToast('Please select a customer', 'error')
      return
    }

    const validItems = detailedItems.filter(it => it.product_id && it.qty > 0)
    if (validItems.length === 0) {
      showToast('Please add at least one product to the sale', 'error')
      return
    }

    const stockErrorItem = validItems.find(it => it.overStock || it.stockAvail <= 0)
    if (stockErrorItem) {
      showToast(
        `Insufficient stock for ${stockErrorItem.prod?.product_name || 'selected item'} (Available: ${stockErrorItem.stockAvail})`,
        'error'
      )
      return
    }

    if (isCashInsufficient) {
      showToast('Cash tendered cannot be less than the total payable amount', 'error')
      return
    }

    const mergedNotes = [
      isDigitalMethod && paymentReference.trim() ? `Ref #: ${paymentReference.trim()}` : '',
      notes.trim(),
    ].filter(Boolean).join(' | ')

    setSaving(true)
    showLoading('Processing sale...')
    try {
      const payload = {
        customer_id: parseInt(customerId, 10),
        payment_method: paymentMethod,
        sale_date: saleDate || undefined,
        user_id: user?.user_id || 1,
        items: validItems.map(it => ({
          product_id: parseInt(it.product_id, 10),
          quantity: parseInt(it.qty, 10),
          discount: parseFloat(it.rawDiscount) || 0,
        })),
        down_payment: isInstallment ? downPayNum : (isDigitalMethod ? effectiveDigitalPaid : 0),
        interest_rate: isInstallment ? interestNum : 0,
        number_of_installments: isInstallment ? parseInt(numInstallments, 10) : undefined,
        frequency: isInstallment ? frequency : undefined,
        notes: mergedNotes,
      }

      const res = await api.sales.create(payload)
      const createdSale = res.sale
      if (createdSale) {
        const custLabel = selectedCustomer
          ? `${selectedCustomer.first_name} ${selectedCustomer.last_name}`.trim()
          : 'Walk-in'
        const enriched = {
          ...createdSale,
          customer_name: createdSale.customer_name || custLabel,
          processed_by: createdSale.processed_by || staffName,
          sale_date: createdSale.sale_date ? String(createdSale.sale_date).slice(0, 10) : saleDate,
          subtotal: Number(createdSale.subtotal ?? calculatedSubtotal),
          discount_amount: Number(createdSale.discount_amount ?? calculatedDiscount),
          total_amount: Number(createdSale.total_amount ?? calculatedTotal),
          amount_paid: Number(createdSale.amount_paid ?? downPayNum),
          balance_due: Number(createdSale.balance_due ?? Math.max(0, calculatedTotal - downPayNum)),
        }
        setSales(prev => [enriched, ...prev])
      }
      loadData(false)

      showToast('Sale transaction completed successfully', 'success')
      triggerDataSync('sales')
      setNewSaleModal(false)
      resetNewSaleForm()

      if (autoOpenInvoice && createdSale?.sale_id) {
        openViewSale(createdSale)
      }
    } catch (err) {
      showToast(err.message || 'Failed to process sale', 'error')
    } finally {
      setSaving(false)
      closeLoading()
    }
  }

  const filtered = useMemo(() => {
    return filterBySearch(sales, search, ['invoice_no', 'customer_name', 'payment_method'])
  }, [sales, search])

  const total = filtered.length
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize)

  // Live aggregates
  const totalSalesVal = sales.reduce((acc, s) => acc + (s.total_amount || 0), 0)
  const cashSalesVal = sales.filter(s => ['Cash', 'GCash', 'Maya', 'Bank Account'].includes(s.payment_method)).reduce((acc, s) => acc + (s.total_amount || 0), 0)
  const installmentSalesVal = sales.filter(s => s.payment_method === 'Installment').reduce((acc, s) => acc + (s.total_amount || 0), 0)
  const avgVal = sales.length > 0 ? totalSalesVal / sales.length : 0

  const [exporting, setExporting] = useState(false)
  const handleExportCSV = async () => {
    setExporting(true)
    try {
      await downloadCsv('/sales', {
        search: search || undefined,
        status: statusFilter !== 'All' ? statusFilter : undefined,
        branch: branchFilter || undefined,
      })
      showToast('Sales exported successfully', 'success')
    } catch (err) {
      showToast(err.message || 'Export failed', 'error')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className={embedded ? "" : "space-y-6"}>
      {!embedded && (
        <PageHeader
          title="Sales Transactions"
          subtitle="Process new sales, cash receipts, and installment contracts"
          action={
            <div className="flex items-center gap-2">
              <SyncButton sync={syncSales} isSyncing={isSyncingSales} label="Sync" />
              <button
                onClick={handleExportCSV}
                disabled={exporting}
                className="flex items-center gap-2 px-4 py-2 bg-muted hover:bg-muted/80 text-foreground font-semibold text-xs rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50"
              >
                {exporting ? <FiAlertTriangle className="w-4 h-4 animate-spin" /> : <FiDownload className="w-4 h-4" />}
                <span>{exporting ? 'Exporting...' : 'Export CSV'}</span>
              </button>
              {canCreateSale && (
                <button
                  onClick={openNewSaleModal}
                  className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
                >
                  <FiPlus className="w-4 h-4" />
                  <span>New Sale</span>
                </button>
              )}
            </div>
          }
        />
      )}

      <MySalesChart sales={sales} />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard title="Total Sales Volume" value={fmt(totalSalesVal)} sub={`${sales.length} transactions`} icon={<FiShoppingCart className="w-5 h-5" />} color="blue" />
        <StatCard title="Cash Sales Settled" value={fmt(cashSalesVal)} sub="fully settled" icon={<TbCurrencyPeso className="w-5 h-5 text-emerald-500" />} color="green" />
        <StatCard title="Installment Financing" value={fmt(installmentSalesVal)} sub="financed purchases" icon={<FiCreditCard className="w-5 h-5 text-purple-500" />} color="purple" />
        <StatCard title="Avg Ticket Value" value={fmt(avgVal)} sub="per customer order" icon={<FiFileText className="w-5 h-5 text-amber-500" />} color="yellow" />
      </div>

      {error && <ErrorAlert message={error} onRetry={loadData} />}

      {/* Filters */}
      <Card noPad className="p-3.5 border border-border">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search invoice number, customer name..."
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

          <div className="flex gap-2">
            <select
              value={methodFilter}
              onChange={e => { setMethodFilter(e.target.value); setPage(1) }}
              className="border border-border rounded-xl px-3 py-2 text-xs font-semibold text-foreground bg-card cursor-pointer"
            >
              <option value="All">All Methods</option>
              <option value="Cash">Cash</option>
              <option value="GCash">GCash</option>
              <option value="Maya">Maya</option>
              <option value="Bank Account">Bank Account</option>
              <option value="Installment">Installment</option>
            </select>
            <select
              value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
              className="border border-border rounded-xl px-3 py-2 text-xs font-semibold text-foreground bg-card cursor-pointer"
            >
              <option value="All">All Statuses</option>
              <option value="Completed">Completed</option>
              <option value="Partially Paid">Partially Paid</option>
              <option value="Pending">Pending</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card noPad className="border border-border overflow-hidden">
        {loading ? (
          <TableSkeleton rows={6} cols={8} />
        ) : paginated.length === 0 ? (
          <EmptyState
            icon={<FiShoppingCart className="w-12 h-12 text-muted-foreground/30 mx-auto" />}
            title="No sales transactions found"
            description={search || methodFilter !== 'All' ? 'Try adjusting your search filters' : 'Create your first sale to get started'}
            action={
              canCreateSale ? (
                <button
                  onClick={openNewSaleModal}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 bg-primary text-primary-foreground font-bold text-xs rounded-xl cursor-pointer"
                >
                  <FiPlus className="w-4 h-4" />
                  <span>New Sale</span>
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
                    <th className="py-3 px-4 text-left">Invoice No</th>
                    <th className="py-3 px-4 text-left">Date</th>
                    <th className="py-3 px-4 text-left">Customer</th>
                    <th className="py-3 px-4 text-left">Method</th>
                    <th className="py-3 px-4 text-right">Total Amount</th>
                    <th className="py-3 px-4 text-right">Amount Paid</th>
                    <th className="py-3 px-4 text-right">Balance Due</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {paginated.map((s, i) => (
                    <tr key={s.sale_id} className={`hover:bg-muted/40 transition-colors ${i % 2 === 1 ? 'bg-muted/10' : ''}`}>
                      <td className="py-3 px-4 font-mono font-bold text-foreground">
                        <div className="flex items-center gap-1.5">
                          <FiFileText className="w-3.5 h-3.5 text-primary shrink-0" />
                          <span>{s.invoice_no}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono text-muted-foreground">{s.sale_date}</td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-foreground flex items-center gap-1.5">
                          <FiUser className="w-3.5 h-3.5 text-muted-foreground" />
                          <span>{s.customer_name}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <Badge
                          text={s.payment_method}
                          variant={['Cash', 'GCash', 'Maya', 'Bank Account'].includes(s.payment_method) ? 'success' : 'info'}
                          icon={['Cash', 'GCash', 'Maya', 'Bank Account'].includes(s.payment_method) ? <TbCurrencyPeso className="w-3 h-3" /> : <FiCreditCard className="w-3 h-3" />}
                        />
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-foreground">{fmt(s.total_amount)}</td>
                      <td className="py-3 px-4 text-right font-mono text-emerald-600 font-semibold">{fmt(s.amount_paid)}</td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-rose-600">{fmt(s.balance_due)}</td>
                      <td className="py-3 px-4 text-center"><StatusBadge status={s.status} /></td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => openViewSale(s)}
                          title="View invoice & items"
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg border border-border hover:bg-muted font-semibold cursor-pointer transition-colors"
                        >
                          <FiEye className="w-3.5 h-3.5" />
                          <span>Invoice</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination total={total} page={page} pageSize={pageSize} onChange={setPage} />
          </>
        )}
      </Card>

      {/* View Invoice Modal - Detailed Official Invoice */}
      {viewSale && (() => {
        const inv = viewSale.sale || {}
        const invItems = viewSale.items || []
        const invInst = viewSale.installment_account || null
        const invSchedules = invInst?.payment_schedules || invInst?.paymentSchedules || []
        const invTotalUnits = invItems.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0)
        const { refNo: invRefNo, cleanNotes: invCleanNotes } = extractDigitalRefAndNotes(inv.notes, inv.reference_no, '', 'sales')

        return (
          <Modal
            isOpen={true}
            title={`Sales Invoice: ${inv.invoice_no}`}
            onClose={() => setViewSale(null)}
            size="xl"
          >
            <div className="space-y-4 text-xs">
              {/* Company & Branch Header */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-3 border-b border-border">
                <div>
                  <h2 className="text-lg font-black tracking-tight text-foreground">
                    {inv.company_name || 'Z-LICZ APPLIANCES'}
                  </h2>
                  <p className="text-[11px] font-semibold text-primary">
                    Official Sales Transaction Invoice
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {inv.branch_name || staffBranch}
                    {inv.branch_location ? ` • ${inv.branch_location}` : ''}
                  </p>
                  {(inv.branch_contact || inv.company_email || inv.company_tax_id) && (
                    <p className="text-[11px] text-muted-foreground font-mono">
                      {[
                        inv.branch_contact ? `Tel: ${inv.branch_contact}` : '',
                        inv.company_email || '',
                        inv.company_tax_id ? `TIN: ${inv.company_tax_id}` : '',
                      ].filter(Boolean).join(' • ')}
                    </p>
                  )}
                </div>

                <div className="sm:text-right space-y-1">
                  <div className="font-mono font-black text-base text-foreground">{inv.invoice_no}</div>
                  <div className="font-mono text-[11px] text-muted-foreground">
                    {inv.sale_datetime || inv.sale_date}
                  </div>
                  <div className="flex sm:justify-end gap-1.5 pt-0.5">
                    <StatusBadge status={inv.status || 'Completed'} />
                    <Badge
                      text={inv.payment_method}
                      variant={['Cash', 'GCash', 'Maya', 'Bank Account'].includes(inv.payment_method) ? 'success' : 'info'}
                    />
                  </div>
                </div>
              </div>

              {/* Billing & Transaction Info Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 bg-muted/20 rounded-2xl border border-border space-y-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block">
                    Billed To (Customer)
                  </span>
                  <p className="font-bold text-foreground text-sm">{inv.customer_name}</p>
                  <div className="text-[11px] text-muted-foreground space-y-0.5">
                    {inv.customer_code && (
                      <div>
                        Code: <strong className="font-mono text-foreground">{inv.customer_code}</strong>
                      </div>
                    )}
                    {inv.customer_phone && (
                      <div>
                        Phone: <strong className="font-mono text-foreground">{inv.customer_phone}</strong>
                      </div>
                    )}
                    {inv.customer_email && <div>Email: {inv.customer_email}</div>}
                    {inv.customer_address && <div>Address: {inv.customer_address}</div>}
                  </div>
                </div>

                <div className="p-3.5 bg-muted/20 rounded-2xl border border-border space-y-1.5">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block">
                    Transaction Metadata
                  </span>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-muted-foreground">Processed By:</span>
                    <span className="font-semibold text-foreground">{inv.processed_by || 'Staff'}</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-muted-foreground">Store Branch:</span>
                    <span className="font-semibold text-foreground">{inv.branch_name || staffBranch}</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-muted-foreground">Payment Method:</span>
                    <span className="font-semibold text-foreground">{inv.payment_method}</span>
                  </div>
                  {invRefNo && (
                    <div className="flex justify-between text-[11px]">
                      <span className="text-muted-foreground">Digital Ref / Trace #:</span>
                      <span className="font-mono font-semibold text-foreground">{invRefNo}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-[11px]">
                    <span className="text-muted-foreground">Items Summary:</span>
                    <span className="font-mono font-semibold text-foreground">
                      {invItems.length} item(s) · {formatQty(invTotalUnits)} unit(s)
                    </span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-muted-foreground">Currency:</span>
                    <span className="font-mono font-semibold text-foreground">PHP (₱)</span>
                  </div>
                </div>
              </div>

              {/* Detailed Line Items Table */}
              <div className="border border-border rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-muted/50 text-muted-foreground uppercase text-[10px]">
                        <th className="py-2.5 px-3 text-center w-10">#</th>
                        <th className="py-2.5 px-3 text-left">Item Description / SKU</th>
                        <th className="py-2.5 px-3 text-right">Unit Price</th>
                        <th className="py-2.5 px-3 text-center">Qty</th>
                        <th className="py-2.5 px-3 text-right">Discount</th>
                        <th className="py-2.5 px-3 text-right">Line Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {invItems.map((it, idx) => (
                        <tr key={it.sale_item_id || idx}>
                          <td className="py-2.5 px-3 text-center font-mono text-muted-foreground">{idx + 1}</td>
                          <td className="py-2.5 px-3">
                            <p className="font-semibold text-foreground leading-tight">{it.product_name}</p>
                            {(it.product_code || it.brand || it.category) && (
                              <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                                {[it.product_code, it.brand, it.category].filter(Boolean).join(' • ')}
                              </p>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-muted-foreground">{fmt(it.unit_price)}</td>
                          <td className="py-2.5 px-3 text-center font-mono font-bold text-foreground">{formatQty(it.quantity)}</td>
                          <td className="py-2.5 px-3 text-right font-mono">
                            {Number(it.discount_amount) > 0 ? (
                              <span className="text-rose-500">-{fmt(it.discount_amount)}</span>
                            ) : (
                              <span className="text-muted-foreground">₱0.00</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-foreground">{fmt(it.line_total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Installment Contract & Schedule Summary (when applicable) */}
              {invInst && (
                <div className="p-3.5 bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-2xl space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold uppercase tracking-wider text-[11px] text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
                      <FiCreditCard className="w-3.5 h-3.5" />
                      <span>Installment Contract ({invInst.account_no || 'Active'})</span>
                    </span>
                    <StatusBadge status={invInst.status || 'Active'} />
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                    <div className="p-2 rounded-xl bg-card border border-border">
                      <span className="text-[10px] text-muted-foreground block">Principal</span>
                      <strong className="font-mono text-foreground">{fmt(invInst.principal_amount)}</strong>
                    </div>
                    <div className="p-2 rounded-xl bg-card border border-border">
                      <span className="text-[10px] text-muted-foreground block">Interest ({Number(invInst.interest_rate || 0)}%)</span>
                      <strong className="font-mono text-amber-600 dark:text-amber-400">+{fmt(invInst.interest_amount)}</strong>
                    </div>
                    <div className="p-2 rounded-xl bg-card border border-border">
                      <span className="text-[10px] text-muted-foreground block">Total Financed</span>
                      <strong className="font-mono text-foreground">{fmt(invInst.total_payable)}</strong>
                    </div>
                    <div className="p-2 rounded-xl bg-primary/5 border border-primary/30">
                      <span className="text-[10px] text-muted-foreground block">{invInst.frequency || 'Monthly'} Due</span>
                      <strong className="font-mono text-primary">
                        {fmt(invInst.installment_amount)} &times; {invInst.number_of_installments}
                      </strong>
                    </div>
                  </div>

                  {invSchedules.length > 0 && (
                    <div className="border border-amber-500/20 rounded-xl overflow-hidden bg-card">
                      <div className="max-h-36 overflow-y-auto">
                        <table className="w-full text-[11px]">
                          <thead className="bg-muted/50 text-muted-foreground uppercase text-[10px] sticky top-0">
                            <tr>
                              <th className="py-1.5 px-2.5 text-center">#</th>
                              <th className="py-1.5 px-2.5 text-left">Due Date</th>
                              <th className="py-1.5 px-2.5 text-right">Amount Due</th>
                              <th className="py-1.5 px-2.5 text-right">Balance</th>
                              <th className="py-1.5 px-2.5 text-center">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {invSchedules.map(sc => (
                              <tr key={sc.schedule_id || sc.installment_no}>
                                <td className="py-1.5 px-2.5 text-center font-mono">{sc.installment_no}</td>
                                <td className="py-1.5 px-2.5 font-mono">{sc.due_date}</td>
                                <td className="py-1.5 px-2.5 text-right font-mono">{fmt(sc.amount_due)}</td>
                                <td className="py-1.5 px-2.5 text-right font-mono font-bold">{fmt(sc.balance_due)}</td>
                                <td className="py-1.5 px-2.5 text-center">
                                  <StatusBadge status={sc.status} />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Financial Summary & Notes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 bg-muted/20 border border-border rounded-2xl space-y-1.5">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block">
                    Notes / Warranty Remarks
                  </span>
                  <p className="text-[11px] text-foreground whitespace-pre-wrap leading-relaxed">
                    {invCleanNotes || 'Standard store warranty applies. Retain this invoice for warranty claims and account reference.'}
                  </p>
                </div>

                <div className="space-y-1.5 p-3.5 bg-card border border-border rounded-2xl text-xs">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Subtotal ({formatQty(invTotalUnits)} unit{invTotalUnits !== 1 ? 's' : ''})</span>
                    <span className="font-mono font-semibold text-foreground">{fmt(inv.subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Total Discount</span>
                    <span className="font-mono text-rose-600">- {fmt(inv.discount_amount)}</span>
                  </div>
                  <div className="flex justify-between items-center font-black text-sm text-foreground border-t border-border pt-1.5 mt-1.5">
                    <span>TOTAL AMOUNT</span>
                    <span className="font-mono text-base font-bold text-primary">{fmt(inv.total_amount)}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground pt-1">
                    <span>Amount Paid</span>
                    <span className="font-mono font-bold text-emerald-600">{fmt(inv.amount_paid)}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Balance Due</span>
                    <span className={`font-mono font-bold ${Number(inv.balance_due) > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {fmt(inv.balance_due)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => handlePrintInvoice(viewSale)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold cursor-pointer shadow-xs transition-all"
                >
                  <FiPrinter className="w-4 h-4" />
                  <span>Print Invoice</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewSale(null)}
                  className="flex items-center gap-1 px-4 py-2 rounded-xl border border-border hover:bg-muted font-semibold cursor-pointer"
                >
                  <FiX className="w-3.5 h-3.5" />
                  <span>Close</span>
                </button>
              </div>
            </div>
          </Modal>
        )
      })()}

      {/* New Sale Modal - Full Detailed POS Transaction Builder */}
      {newSaleModal && (
        <Modal
          isOpen={true}
          title="Create New Sales Transaction"
          onClose={() => setNewSaleModal(false)}
          size="xl"
        >
          <form onSubmit={handleCreateSale} className="space-y-5 text-xs">
            {/* Transaction Meta Bar: Date, Staff & Branch */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 rounded-2xl bg-muted/25 border border-border">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1.5">
                  <FiCalendar className="w-3.5 h-3.5 text-primary" />
                  <span>Transaction Date</span>
                </label>
                <input
                  type="date"
                  value={saleDate}
                  max={getTodayLocalYMD()}
                  onChange={e => setSaleDate(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl border border-border bg-card text-foreground font-mono text-xs"
                />
              </div>

              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                  Processed By
                </span>
                <div className="px-3 py-1.5 rounded-xl border border-border bg-card font-semibold text-foreground truncate">
                  {staffName}
                </div>
              </div>

              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                  Store Branch
                </span>
                <div className="px-3 py-1.5 rounded-xl border border-border bg-card font-semibold text-foreground truncate">
                  {staffBranch}
                </div>
              </div>
            </div>

            {/* Section 1: Customer & Payment Method */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Customer Column */}
              <div className="p-4 rounded-2xl border border-border bg-card space-y-3">
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                    <FiUser className="w-3.5 h-3.5 text-primary" />
                    <span>Customer Details *</span>
                  </span>
                  <span className="text-[10px] font-semibold text-muted-foreground">
                    {customers.length} available
                  </span>
                </div>

                <div className="relative">
                  <FiSearch className="w-3.5 h-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={customerSearch}
                    onChange={e => setCustomerSearch(e.target.value)}
                    placeholder="Quick filter customer name, code, or phone..."
                    className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-border bg-muted/20 text-foreground text-xs placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                <select
                  value={customerId}
                  onChange={e => setCustomerId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-semibold cursor-pointer"
                  required
                >
                  <option value="">-- Choose Customer --</option>
                  {filteredCustomers.map(c => (
                    <option key={c.customer_id} value={c.customer_id}>
                      {c.first_name} {c.last_name} ({c.customer_code}){c.phone ? ` — ${c.phone}` : ''}
                    </option>
                  ))}
                </select>

                {selectedCustomer && (
                  <div className="p-3 rounded-xl bg-muted/30 border border-border space-y-1.5 text-[11px]">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold text-foreground">
                        {selectedCustomer.first_name} {selectedCustomer.last_name}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <Badge
                          text={selectedCustomer.status || 'Active'}
                          variant={selectedCustomer.status === 'Inactive' ? 'danger' : 'success'}
                        />
                        <Badge
                          text={selectedCustomer.allow_installment ? 'Installment Approved' : 'Standard Account'}
                          variant={selectedCustomer.allow_installment ? 'info' : 'secondary'}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-muted-foreground">
                      <span className="truncate">
                        Code: <strong className="font-mono text-foreground">{selectedCustomer.customer_code}</strong>
                      </span>
                      <span className="truncate">
                        Phone: <strong className="font-mono text-foreground">{selectedCustomer.phone || '—'}</strong>
                      </span>
                      <span className="truncate">
                        Active Loans: <strong className="font-mono text-foreground">{selectedCustomer.active_installments ?? 0}</strong>
                      </span>
                      <span className="truncate">
                        Balance Due: <strong className="font-mono text-foreground">{fmt(selectedCustomer.balance ?? 0)}</strong>
                      </span>
                    </div>
                    {selectedCustomer.address && (
                      <p className="text-muted-foreground truncate">
                        Address: <span className="text-foreground">{selectedCustomer.address}</span>
                      </p>
                    )}
                    {isInstallment && !selectedCustomer.allow_installment && (
                      <div className="flex items-center gap-1.5 pt-1 text-amber-600 dark:text-amber-400 font-semibold">
                        <FiAlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span>Customer is not flagged as Installment Approved yet.</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Payment Setup Column */}
              <div className="p-4 rounded-2xl border border-border bg-card space-y-3">
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                    <FiCreditCard className="w-3.5 h-3.5 text-primary" />
                    <span>Payment & Settlement *</span>
                  </span>
                  <Badge
                    text={estimatedStatus}
                    variant={estimatedStatus === 'Completed' ? 'success' : estimatedStatus === 'Partially Paid' ? 'warning' : 'danger'}
                  />
                </div>

                <div>
                  <label className="block font-bold text-muted-foreground mb-1">Payment Method *</label>
                  <select
                    value={paymentMethod}
                    onChange={e => handlePaymentMethodChange(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-semibold cursor-pointer"
                    required
                  >
                    <option value="Cash">Cash (Full Spot Payment)</option>
                    <option value="GCash">GCash E-Wallet</option>
                    <option value="Maya">Maya E-Wallet</option>
                    <option value="Bank Account">Bank Transfer / Account</option>
                    <option value="Installment">Installment (Financing Contract)</option>
                  </select>
                </div>

                {paymentMethod === 'Cash' && (
                  <div className="p-3 rounded-xl bg-muted/25 border border-border space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-bold text-muted-foreground">Cash Tendered (₱)</label>
                      <button
                        type="button"
                        onClick={() => setCashTendered(calculatedTotal.toFixed(2))}
                        className="text-[11px] font-bold text-primary hover:underline cursor-pointer"
                      >
                        Exact ({fmt(calculatedTotal)})
                      </button>
                    </div>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={cashTendered}
                      onChange={e => setCashTendered(e.target.value)}
                      placeholder={calculatedTotal.toFixed(2)}
                      className="w-full px-3 py-1.5 rounded-xl border border-border bg-card text-foreground font-mono font-bold text-xs"
                    />
                    <div className="flex justify-between items-center text-[11px] pt-1 border-t border-border/60">
                      <span className="text-muted-foreground font-semibold">Change Due:</span>
                      <span className={`font-mono font-bold ${isCashInsufficient ? 'text-rose-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                        {isCashInsufficient
                          ? `Short by ${fmt(calculatedTotal - cashTenderedNum)}`
                          : fmt(cashChangeDue)}
                      </span>
                    </div>
                  </div>
                )}

                {isDigitalMethod && (
                  <div className="p-3 rounded-xl bg-muted/25 border border-border space-y-2.5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[11px] font-bold text-muted-foreground">Amount Paid (₱)</label>
                          <button
                            type="button"
                            onClick={() => {
                              setDigitalPaidFull(true)
                              setDownPayment(calculatedTotal.toFixed(2))
                            }}
                            className="text-[10px] font-bold text-primary hover:underline cursor-pointer"
                          >
                            Full
                          </button>
                        </div>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max={calculatedTotal || undefined}
                          value={digitalPaidFull ? calculatedTotal.toFixed(2) : downPayment}
                          onChange={e => {
                            setDigitalPaidFull(false)
                            setDownPayment(e.target.value)
                          }}
                          className="w-full px-2.5 py-1.5 rounded-xl border border-border bg-card text-foreground font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-muted-foreground mb-1">Reference #</label>
                        <input
                          type="text"
                          value={paymentReference}
                          onChange={e => setPaymentReference(e.target.value)}
                          placeholder="e.g. GC-849201"
                          className="w-full px-2.5 py-1.5 rounded-xl border border-border bg-card text-foreground font-mono text-xs"
                        />
                      </div>
                    </div>
                    <div className="flex justify-between text-[11px] pt-1 border-t border-border/60">
                      <span className="text-muted-foreground font-semibold">Remaining Balance:</span>
                      <span className="font-mono font-bold text-foreground">
                        {fmt(Math.max(0, calculatedTotal - downPayNum))}
                      </span>
                    </div>
                  </div>
                )}

                {isInstallment && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2 font-medium">
                    Configure Down Payment, Interest Rate, Terms, and Frequency below.
                  </p>
                )}
              </div>
            </div>

            {/* Section 2: Detailed Sales Cart Items */}
            <div className="border border-border rounded-2xl p-4 space-y-3 bg-muted/20">
              <div className="flex flex-wrap justify-between items-center gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <FiPackage className="w-4 h-4 text-primary" />
                    <span>Sales Cart Items</span>
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-card border border-border text-[10px] font-semibold text-muted-foreground">
                    {items.filter(it => it.product_id).length} item(s) · {totalCartUnits} unit(s)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleAddItem}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-[11px] cursor-pointer transition-all"
                >
                  <FiPlus className="w-3.5 h-3.5" />
                  <span>Add Product Row</span>
                </button>
              </div>

              {/* Desktop Table Header */}
              <div className="hidden md:grid grid-cols-12 gap-2 px-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                <div className="col-span-5">Product / SKU</div>
                <div className="col-span-2 text-right">Unit Price</div>
                <div className="col-span-1 text-center">Qty</div>
                <div className="col-span-2 text-right">Discount (₱)</div>
                <div className="col-span-1 text-right">Total</div>
                <div className="col-span-1 text-center">Act</div>
              </div>

              <div className="space-y-2">
                {detailedItems.map((item, idx) => (
                  <div
                    key={idx}
                    className={`bg-card p-3 rounded-xl border space-y-2 ${
                      item.overStock || (item.prod && item.stockAvail <= 0)
                        ? 'border-rose-500/60 bg-rose-500/5'
                        : 'border-border'
                    }`}
                  >
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-center">
                      <div className="md:col-span-5">
                        <label className="md:hidden text-[10px] font-bold text-muted-foreground block mb-1">Product</label>
                        <select
                          value={item.product_id}
                          onChange={e => handleItemChange(idx, 'product_id', e.target.value)}
                          className="w-full px-2.5 py-2 rounded-lg border border-border bg-card text-foreground font-medium text-xs cursor-pointer"
                          required
                        >
                          <option value="">-- Select Product Item --</option>
                          {products.map(p => {
                            const eff = p.discount_price ? parseFloat(p.discount_price) : parseFloat(p.unit_price)
                            const outOfStock = Number(p.stock_quantity || 0) <= 0
                            return (
                              <option key={p.product_id} value={p.product_id} disabled={outOfStock}>
                                {p.product_name}{p.product_code ? ` [${p.product_code}]` : ''} — {fmt(eff)} ({outOfStock ? 'Out of Stock' : `Stock: ${p.stock_quantity}`})
                              </option>
                            )
                          })}
                        </select>
                      </div>

                      <div className="md:col-span-2 md:text-right">
                        <label className="md:hidden text-[10px] font-bold text-muted-foreground block mb-1">Unit Price</label>
                        {item.prod ? (
                          <div className="font-mono font-semibold text-foreground">
                            <div>{fmt(item.unitPrice)}</div>
                            {item.promoPrice !== null && (
                              <div className="text-[10px] text-muted-foreground line-through">
                                {fmt(item.basePrice)}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="font-mono text-muted-foreground">—</span>
                        )}
                      </div>

                      <div className="md:col-span-1">
                        <label className="md:hidden text-[10px] font-bold text-muted-foreground block mb-1">Qty</label>
                        <input
                          type="number"
                          min="1"
                          max={item.prod && item.stockAvail > 0 ? item.stockAvail : undefined}
                          placeholder="Qty"
                          value={item.quantity}
                          onChange={e => handleItemChange(idx, 'quantity', e.target.value)}
                          className="w-full px-2 py-1.5 rounded-lg border border-border bg-card text-foreground font-mono text-center"
                          required
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label className="md:hidden text-[10px] font-bold text-muted-foreground block mb-1">Discount (₱)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          value={item.discount}
                          onChange={e => handleItemChange(idx, 'discount', e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-card text-foreground font-mono text-right"
                        />
                      </div>

                      <div className="md:col-span-1 md:text-right">
                        <label className="md:hidden text-[10px] font-bold text-muted-foreground block mb-1">Line Total</label>
                        <span className="font-mono font-bold text-foreground">
                          {fmt(item.lineTotal)}
                        </span>
                      </div>

                      <div className="md:col-span-1 flex md:justify-center">
                        {items.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(idx)}
                            title="Remove item"
                            className="text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 rounded-lg cursor-pointer p-1.5 transition-colors"
                          >
                            <FiTrash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {item.prod && (
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-border/60 text-[11px] text-muted-foreground">
                        <div className="flex flex-wrap items-center gap-2">
                          {item.prod.product_code && (
                            <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-foreground">
                              {item.prod.product_code}
                            </span>
                          )}
                          {(item.prod.brand || item.prod.category) && (
                            <span>
                              {[item.prod.brand, item.prod.category].filter(Boolean).join(' • ')}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`font-semibold ${
                              item.overStock || item.stockAvail <= 0
                                ? 'text-rose-500'
                                : item.stockAvail <= 2
                                  ? 'text-amber-500'
                                  : 'text-emerald-600 dark:text-emerald-400'
                            }`}
                          >
                            {item.overStock
                              ? `Exceeds stock (${item.stockAvail} left)`
                              : `Available Stock: ${item.stockAvail}`}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Section 3: Installment Financing Agreement (if Installment) */}
            {isInstallment && (
              <div className="p-4 bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-2xl space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-500/20 pb-2">
                  <div className="font-bold text-amber-900 dark:text-amber-300 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                    <FiPercent className="w-3.5 h-3.5" />
                    <span>Installment Financing Agreement</span>
                  </div>
                  <span className="text-[11px] font-semibold text-amber-800 dark:text-amber-300">
                    {numInstallments} {frequency} Payments
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-muted-foreground mb-1">Down Payment (₱)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max={calculatedTotal || undefined}
                      value={downPayment}
                      onChange={e => setDownPayment(e.target.value)}
                      className="w-full px-2.5 py-2 rounded-xl border border-border bg-card text-foreground font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-muted-foreground mb-1">Interest Rate (%)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={interestRate}
                      onChange={e => setInterestRate(e.target.value)}
                      className="w-full px-2.5 py-2 rounded-xl border border-border bg-card text-foreground font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-muted-foreground mb-1">Terms (Installments)</label>
                    <select
                      value={numInstallments}
                      onChange={e => setNumInstallments(e.target.value)}
                      className="w-full px-2.5 py-2 rounded-xl border border-border bg-card text-foreground font-semibold cursor-pointer"
                    >
                      <option value="3">3 Payments</option>
                      <option value="6">6 Payments</option>
                      <option value="12">12 Payments</option>
                      <option value="18">18 Payments</option>
                      <option value="24">24 Payments</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-muted-foreground mb-1">Payment Frequency</label>
                    <select
                      value={frequency}
                      onChange={e => setFrequency(e.target.value)}
                      className="w-full px-2.5 py-2 rounded-xl border border-border bg-card text-foreground font-semibold cursor-pointer"
                    >
                      <option value="Monthly">Monthly</option>
                      <option value="Biweekly">Biweekly</option>
                      <option value="Weekly">Weekly</option>
                    </select>
                  </div>
                </div>

                {/* Live Financing Breakdown Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-amber-500/20 text-[11px]">
                  <div className="p-2 rounded-xl bg-card border border-border">
                    <span className="text-muted-foreground block text-[10px]">Financed Principal</span>
                    <strong className="font-mono text-foreground">{fmt(principal)}</strong>
                  </div>
                  <div className="p-2 rounded-xl bg-card border border-border">
                    <span className="text-muted-foreground block text-[10px]">Interest ({interestNum}%)</span>
                    <strong className="font-mono text-amber-600 dark:text-amber-400">+{fmt(totalInterest)}</strong>
                  </div>
                  <div className="p-2 rounded-xl bg-card border border-border">
                    <span className="text-muted-foreground block text-[10px]">Total Financed Payable</span>
                    <strong className="font-mono text-foreground">{fmt(totalInstallmentPayable)}</strong>
                  </div>
                  <div className="p-2 rounded-xl bg-primary/5 border border-primary/30">
                    <span className="text-muted-foreground block text-[10px]">Per {frequency.replace(/ly$/, '')} Due</span>
                    <strong className="font-mono text-primary">{fmt(monthlyInstallment)}</strong>
                  </div>
                </div>
              </div>
            )}

            {/* Section 4: Receipt Financial Summary & Notes */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="font-bold text-muted-foreground flex items-center gap-1.5">
                  <FiFileText className="w-3.5 h-3.5 text-primary" />
                  <span>Notes / Warranty Remarks</span>
                </label>
                <textarea
                  rows={4}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Optional warranty terms, delivery schedule, serial numbers, or sales notes..."
                  className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground"
                />
                <div className="flex flex-wrap gap-1.5">
                  {['1 Year Store Warranty', 'For Pickup', 'For Delivery', 'Includes Official Receipt'].map(tag => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setNotes(prev => (prev ? `${prev}${prev.endsWith('.') ? '' : '.'} ${tag}` : tag))}
                      className="px-2 py-0.5 rounded-lg border border-border bg-muted/30 hover:bg-muted text-[10px] font-semibold text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                    >
                      + {tag}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-4 bg-muted/30 border border-border rounded-2xl space-y-2 text-xs">
                <div className="text-[11px] font-bold uppercase tracking-wider text-foreground border-b border-border pb-1.5 flex items-center gap-1.5">
                  <FiTag className="w-3.5 h-3.5 text-primary" />
                  <span>Transaction Summary</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Gross Subtotal ({totalCartUnits} unit{totalCartUnits !== 1 ? 's' : ''}):</span>
                  <span className="font-mono font-semibold text-foreground">{fmt(calculatedSubtotal)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Total Discounts:</span>
                  <span className="font-mono font-semibold text-rose-500">- {fmt(calculatedDiscount)}</span>
                </div>
                <div className="flex justify-between items-center font-black text-sm text-foreground border-t border-border pt-2">
                  <span>Net Payable Amount:</span>
                  <span className="font-mono text-base text-primary">{fmt(calculatedTotal)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground pt-1 border-t border-border/60">
                  <span>Amount Paid Now ({paymentMethod}):</span>
                  <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                    {fmt(paymentMethod === 'Cash' ? calculatedTotal : downPayNum)}
                  </span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Balance Due:</span>
                  <span className="font-mono font-bold text-foreground">
                    {fmt(paymentMethod === 'Cash' ? 0 : Math.max(0, calculatedTotal - downPayNum))}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-border">
              <label className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoOpenInvoice}
                  onChange={e => setAutoOpenInvoice(e.target.checked)}
                  className="rounded border-border text-primary cursor-pointer"
                />
                <span>Open printable invoice immediately after completion</span>
              </label>

              <div className="flex items-center gap-3 ml-auto">
                <button
                  type="button"
                  onClick={() => setNewSaleModal(false)}
                  className="flex items-center gap-1 px-4 py-2 rounded-xl border border-border hover:bg-muted font-semibold cursor-pointer"
                >
                  <FiX className="w-3.5 h-3.5" />
                  <span>Cancel</span>
                </button>
                <button
                  type="submit"
                  disabled={saving || hasStockIssue || isCashInsufficient}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  <FiCheckCircle className="w-3.5 h-3.5" />
                  <span>{saving ? 'Processing...' : 'Complete & Generate Invoice'}</span>
                </button>
              </div>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

export default SalesPage
