import { useState, useEffect, useMemo } from 'react'
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
import { fmt, fmtDate, filterBySearch } from '../lib/utils'
import { useAuth } from '../context/AuthContext'
import api, { downloadCsv } from '../lib/api'
import { useRealtimeSync, triggerDataSync } from '../lib/realtimeSync'
import { TbCurrencyPeso } from 'react-icons/tb'
import MySalesChart from '../components/MySalesChart'

export default function SalesPage({ branchFilter, embedded }) {
  const { user } = useAuth()
  const isAdmin = user?.role === 'Administrator'
  const [sales, setSales] = useState([])
  const [products, setProducts] = useState([])
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
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

  // New Sale Form State
  const [customerId, setCustomerId] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('Cash')
  const [items, setItems] = useState([{ product_id: '', quantity: 1, discount: 0 }])
  const [downPayment, setDownPayment] = useState('0')
  const [interestRate, setInterestRate] = useState('0')
  const [numInstallments, setNumInstallments] = useState('12')
  const [frequency, setFrequency] = useState('Monthly')
  const [notes, setNotes] = useState('')

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true)
    if (!silent) setError('')
    try {
      const [salesRes, productsRes, customersRes] = await Promise.all([
        api.sales.getAll({
          search: search || undefined,
          payment_method: methodFilter !== 'All' ? methodFilter : undefined,
          status: statusFilter !== 'All' ? statusFilter : undefined,
          branch: branchFilter || undefined,
        }),
        api.products.getAll({ branch: branchFilter || undefined }),
        api.customers.getAll({ status: 'Active', branch: branchFilter || undefined }),
      ])
      setSales(salesRes.sales || [])
      setProducts(productsRes.products || [])
      setCustomers(customersRes.customers || [])
    } catch (err) {
      console.error('Failed to load sales data:', err)
      if (!silent) setError(err.message || 'Failed to fetch sales transactions')
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [methodFilter, statusFilter, branchFilter, search])

  // Real-time synchronization across multi-user accounts
  useRealtimeSync(() => loadData(true), [methodFilter, statusFilter, branchFilter, search])

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

  // Calculate live totals for the new sale
  const calculatedSubtotal = items.reduce((sum, item) => {
    const prod = products.find(p => p.product_id === parseInt(item.product_id))
    let price = 0
    if (prod) {
      price = prod.discount_price ? parseFloat(prod.discount_price) : parseFloat(prod.unit_price)
    }
    return sum + (price * (parseInt(item.quantity) || 0))
  }, 0)

  const calculatedDiscount = items.reduce((sum, item) => sum + (parseFloat(item.discount) || 0), 0)
  const calculatedTotal = Math.max(0, calculatedSubtotal - calculatedDiscount)

  const downPayNum = parseFloat(downPayment) || 0
  const interestNum = parseFloat(interestRate) || 0
  const principal = Math.max(0, calculatedTotal - downPayNum)
  const totalInterest = principal * (interestNum / 100)
  const totalInstallmentPayable = principal + totalInterest
  const monthlyInstallment = parseInt(numInstallments) > 0 ? (totalInstallmentPayable / parseInt(numInstallments)) : 0

  const handleCreateSale = async (e) => {
    e.preventDefault()
    if (!customerId) {
      showToast('Please select a customer', 'error')
      return
    }

    const validItems = items.filter(it => it.product_id && it.quantity > 0)
    if (validItems.length === 0) {
      showToast('Please add at least one product to the sale', 'error')
      return
    }

    setSaving(true)
    showLoading('Processing sale...')
    try {
      const payload = {
        customer_id: parseInt(customerId),
        payment_method: paymentMethod,
        user_id: user?.user_id || 1,
        items: validItems.map(it => ({
          product_id: parseInt(it.product_id),
          quantity: parseInt(it.quantity),
          discount: parseFloat(it.discount) || 0,
        })),
        down_payment: downPayNum,
        interest_rate: interestNum,
        number_of_installments: parseInt(numInstallments),
        frequency,
        notes,
      }

      const res = await api.sales.create(payload)
      if (res.sale) {
        setSales(prev => [res.sale, ...prev])
      } else {
        loadData()
      }

      showToast('Sale transaction completed successfully', 'success')
      triggerDataSync('sales')
      setNewSaleModal(false)
      // Reset form
      setCustomerId('')
      setPaymentMethod('Cash')
      setItems([{ product_id: '', quantity: 1, discount: 0 }])
      setDownPayment('0')
      setInterestRate('0')
      setNotes('')
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
  const cashSalesVal = sales.filter(s => s.payment_method === 'Cash').reduce((acc, s) => acc + (s.total_amount || 0), 0)
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
                  onClick={() => setNewSaleModal(true)}
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

      <MySalesChart />

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
              !isAdmin ? (
                <button
                  onClick={() => setNewSaleModal(true)}
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
              <table className="w-full text-xs">
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
                          variant={s.payment_method === 'Cash' ? 'success' : 'info'}
                          icon={s.payment_method === 'Cash' ? <TbCurrencyPeso className="w-3 h-3" /> : <FiCreditCard className="w-3 h-3" />}
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

      {/* View Invoice Modal */}
      {viewSale && (
        <Modal
          isOpen={true}
          title={`Sales Invoice: ${viewSale.sale.invoice_no}`}
          onClose={() => setViewSale(null)}
          size="md"
        >
          <div className="space-y-4 text-xs">
            <div className="text-center pb-2 border-b border-border">
              <h2 className="text-lg font-black tracking-tight text-foreground">PROJECT PACE APPLIANCES</h2>
              <p className="text-[11px] text-muted-foreground font-medium">Official Sales Transaction Invoice</p>
            </div>
            
            <div className="grid grid-cols-2 gap-2 p-3 bg-muted/20 rounded-xl border border-border">
              <div>
                <span className="text-[10px] uppercase font-bold text-muted-foreground block mb-0.5">Billed To</span>
                <p className="font-bold text-foreground text-sm">{viewSale.sale.customer_name}</p>
                <div className="mt-1">
                  <Badge text={viewSale.sale.payment_method} variant={viewSale.sale.payment_method === 'Cash' ? 'success' : 'info'} />
                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] uppercase font-bold text-muted-foreground block mb-0.5">Invoice Details</span>
                <p className="font-mono font-bold text-foreground">{viewSale.sale.invoice_no}</p>
                <p className="font-mono text-muted-foreground text-[11px] mt-0.5">{viewSale.sale.sale_date}</p>
              </div>
            </div>

            <div className="border border-border rounded-xl overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/50 text-muted-foreground uppercase text-[10px]">
                    <th className="py-2 px-3 text-left">Item Description</th>
                    <th className="py-2 px-3 text-center">Qty</th>
                    <th className="py-2 px-3 text-right">Line Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {viewSale.items?.map(it => (
                    <tr key={it.sale_item_id}>
                      <td className="py-2.5 px-3">
                        <p className="font-semibold text-foreground leading-tight">{it.product_name}</p>
                        {it.discount_amount > 0 && <p className="text-[10px] text-rose-500 font-mono mt-0.5">Discount: -{fmt(it.discount_amount)}</p>}
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono text-muted-foreground">{it.quantity} x {fmt(it.unit_price)}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-foreground">{fmt(it.line_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-1.5 p-3 bg-card border border-border rounded-xl text-xs">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span className="font-mono font-semibold text-foreground">{fmt(viewSale.sale.subtotal)}</span>
              </div>
              {viewSale.sale.discount_amount > 0 && (
                <div className="flex justify-between text-rose-600">
                  <span>Total Discount</span>
                  <span className="font-mono">- {fmt(viewSale.sale.discount_amount)}</span>
                </div>
              )}
              <div className="flex justify-between items-center font-black text-sm text-foreground border-t border-border pt-1.5 mt-1.5">
                <span>TOTAL AMOUNT</span>
                <span className="font-mono text-base font-bold text-primary">{fmt(viewSale.sale.total_amount)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground pt-1">
                <span>Amount Paid</span>
                <span className="font-mono font-bold text-emerald-600">{fmt(viewSale.sale.amount_paid)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Balance Due</span>
                <span className="font-mono font-bold text-rose-600">{fmt(viewSale.sale.balance_due)}</span>
              </div>
            </div>

            <div className="flex justify-between items-center pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex items-center gap-1 px-3.5 py-1.5 rounded-xl border border-border hover:bg-muted font-semibold cursor-pointer"
              >
                <FiPrinter className="w-3.5 h-3.5" />
                <span>Print Invoice</span>
              </button>
              <button
                type="button"
                onClick={() => setViewSale(null)}
                className="flex items-center gap-1 px-4 py-1.5 rounded-xl border border-border hover:bg-muted font-semibold cursor-pointer"
              >
                <FiX className="w-3.5 h-3.5" />
                <span>Close</span>
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* New Sale Modal */}
      {newSaleModal && (
        <Modal
          isOpen={true}
          title="Create New Sales Transaction"
          onClose={() => setNewSaleModal(false)}
          size="lg"
        >
          <form onSubmit={handleCreateSale} className="space-y-3.5 text-xs">
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block font-bold text-muted-foreground mb-1">Select Customer *</label>
                <select
                  value={customerId}
                  onChange={e => setCustomerId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-semibold"
                  required
                >
                  <option value="">-- Choose Customer --</option>
                  {customers.map(c => (
                    <option key={c.customer_id} value={c.customer_id}>
                      {c.first_name} {c.last_name} ({c.customer_code})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-bold text-muted-foreground mb-1">Payment Method *</label>
                <select
                  value={paymentMethod}
                  onChange={e => setPaymentMethod(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-semibold"
                  required
                >
                  <option value="Cash">Cash (Immediate Settlement)</option>
                  <option value="Installment">Installment (Financing Contract)</option>
                </select>
              </div>
            </div>

            {/* Cart Items */}
            <div className="border border-border rounded-2xl p-3 space-y-2.5 bg-muted/20">
              <div className="flex justify-between items-center">
                <span className="text-[11px] font-bold text-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <FiPackage className="w-3.5 h-3.5 text-primary" />
                  <span>Sales Cart Items</span>
                </span>
                <button
                  type="button"
                  onClick={handleAddItem}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary text-primary-foreground font-bold text-[11px] cursor-pointer"
                >
                  <FiPlus className="w-3 h-3" />
                  <span>Add Item</span>
                </button>
              </div>

              {items.map((item, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-card p-2.5 rounded-xl border border-border">
                  <div className="col-span-6">
                    <select
                      value={item.product_id}
                      onChange={e => handleItemChange(idx, 'product_id', e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-card text-foreground font-medium text-xs"
                      required
                    >
                      <option value="">-- Select Product Item --</option>
                      {products.map(p => (
                        <option key={p.product_id} value={p.product_id}>
                          {p.product_name} — {fmt(p.unit_price)} (Stock: {p.stock_quantity})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <input
                      type="number"
                      min="1"
                      placeholder="Qty"
                      value={item.quantity}
                      onChange={e => handleItemChange(idx, 'quantity', e.target.value)}
                      className="w-full px-2 py-1.5 rounded-lg border border-border bg-card text-foreground font-mono text-center"
                      required
                    />
                  </div>
                  <div className="col-span-3">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Disc (₱)"
                      value={item.discount}
                      onChange={e => handleItemChange(idx, 'discount', e.target.value)}
                      className="w-full px-2 py-1.5 rounded-lg border border-border bg-card text-foreground font-mono"
                    />
                  </div>
                  <div className="col-span-1 text-center">
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(idx)}
                        className="text-rose-500 hover:text-rose-700 cursor-pointer p-1"
                      >
                        <FiTrash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Installment Financing Options (if Installment) */}
            {paymentMethod === 'Installment' && (
              <div className="p-3.5 bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-2xl space-y-2.5">
                <div className="font-bold text-amber-900 dark:text-amber-300 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <FiCreditCard className="w-3.5 h-3.5" />
                  <span>Installment Financing Agreement</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-muted-foreground mb-1">Down Payment (₱)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={downPayment}
                      onChange={e => setDownPayment(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-card text-foreground font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-muted-foreground mb-1">Interest Rate (%)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={interestRate}
                      onChange={e => setInterestRate(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-card text-foreground font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-muted-foreground mb-1">Terms (Months)</label>
                    <select
                      value={numInstallments}
                      onChange={e => setNumInstallments(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-card text-foreground font-semibold"
                    >
                      <option value="3">3 Months</option>
                      <option value="6">6 Months</option>
                      <option value="12">12 Months</option>
                      <option value="18">18 Months</option>
                      <option value="24">24 Months</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-muted-foreground mb-1">Monthly Amortization</label>
                    <div className="font-mono font-bold text-primary text-sm pt-1.5">{fmt(monthlyInstallment)}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Total Calculation */}
            <div className="p-3 bg-muted/30 border border-border rounded-xl flex justify-between items-center font-bold">
              <span>Total Payable Amount:</span>
              <span className="font-mono text-base text-primary">{fmt(calculatedTotal)}</span>
            </div>

            <div>
              <label className="block font-bold text-muted-foreground mb-1">Notes / Warranty Remarks</label>
              <textarea
                rows={2}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Optional sales notes..."
                className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
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
                disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold cursor-pointer"
              >
                <FiCheckCircle className="w-3.5 h-3.5" />
                <span>{saving ? 'Processing...' : 'Complete & Generate Invoice'}</span>
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
