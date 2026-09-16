import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  FiUser, FiUsers, FiPlus, FiEdit, FiTrash2, FiEye,
  FiPhone, FiMapPin, FiMail, FiSearch,
  FiCreditCard, FiCheckCircle, FiAlertTriangle, FiX,
  FiClock, FiFileText, FiFilter, FiGitBranch
} from 'react-icons/fi'
import {
  Btn, Badge, StatusBadge, Input, Select, Textarea, Modal, ConfirmDialog,
  Table, TR, TD, SearchBar, PageHeader, StatCard, Card, Pagination, showToast,
  TabBar, LoadingState, ErrorAlert, StatSkeleton, TableSkeleton, EmptyState, confirmAction,
} from '../components/ui'
import { fmt, filterBySearch } from '../lib/utils'
import api, { downloadCsv } from '../lib/api'
import { FiDownload } from 'react-icons/fi'
import { TbCurrencyPeso } from 'react-icons/tb'
import { useAuth } from '../context/AuthContext'

export default function CustomersPage({ branchFilter, embedded }) {
  const { user } = useAuth()
  const isAdmin = user?.role === 'Administrator'
  const isStoreAdmin = user?.role === 'Store Administrator' || user?.role === 'Store Admin'
  const [searchParams] = useSearchParams()
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [page, setPage] = useState(1)
  const pageSize = 10

  // Modals
  const [addModal, setAddModal] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [detailCustomer, setDetailCustomer] = useState(null)
  const [detailTab, setDetailTab] = useState('profile')
  const [detailLoading, setDetailLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)

  // Branch assignment (Admin only)
  const [branches, setBranches] = useState([])
  const [assignBranchModal, setAssignBranchModal] = useState(false)
  const [assignBranchCustomer, setAssignBranchCustomer] = useState(null)
  const [selectedBranchId, setSelectedBranchId] = useState('')
  const [assigningSaving, setAssigningSaving] = useState(false)

  const handleExport = async () => {
    setExporting(true)
    try {
      await downloadCsv('/customers', {
        search: search || undefined,
        status: statusFilter !== 'All' ? statusFilter : undefined,
        branch: branchFilter || undefined,
      })
      showToast('Customers exported successfully', 'success')
    } catch (err) {
      showToast(err.message || 'Export failed', 'error')
    } finally {
      setExporting(false)
    }
  }

  // Load branches list for Admin assign-branch feature
  useEffect(() => {
    if (isAdmin) {
      api.branches.getAll().then(res => setBranches(res.branches || [])).catch(() => {})
    }
  }, [isAdmin])

  const openAssignBranch = (c) => {
    setAssignBranchCustomer(c)
    setSelectedBranchId(c.branch_id !== null && c.branch_id !== undefined ? String(c.branch_id) : '')
    setAssignBranchModal(true)
  }

  const handleAssignBranch = async () => {
    if (!assignBranchCustomer) return
    setAssigningSaving(true)
    try {
      const branchId = selectedBranchId === '' ? null : parseInt(selectedBranchId)
      const res = await api.customers.assignBranch(assignBranchCustomer.customer_id, branchId)
      setCustomers(prev => prev.map(c =>
        c.customer_id === assignBranchCustomer.customer_id
          ? { ...c, branch_id: res.branch_id, branch_name: res.branch_name }
          : c
      ))
      showToast(`Branch updated to: ${res.branch_name}`, 'success')
      setAssignBranchModal(false)
      setAssignBranchCustomer(null)
    } catch (err) {
      showToast(err.message || 'Failed to assign branch', 'error')
    } finally {
      setAssigningSaving(false)
    }
  }

  // Form
  const emptyForm = {
    customer_code: '', first_name: '', middle_name: '', last_name: '',
    phone: '', email: '', address: '', status: 'Active', notes: ''
  }
  const [form, setForm] = useState(emptyForm)

  const loadCustomers = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await api.customers.getAll({
        search: search || undefined,
        status: statusFilter !== 'All' ? statusFilter : undefined,
        branch: branchFilter || undefined,
      })
      setCustomers(data.customers || [])
    } catch (err) {
      console.error('Failed to load customers:', err)
      setError(err.message || 'Failed to fetch customers')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCustomers()
  }, [statusFilter])

  useEffect(() => {
    const id = searchParams.get('id')
    if (id) {
      openDetail({ customer_id: id })
    }
  }, [searchParams])

  const handleSave = async (e) => {
    e.preventDefault()
    if (!form.first_name || !form.last_name || !form.phone) {
      showToast('First name, last name, and phone are required', 'error')
      return
    }

    setSaving(true)
    try {
      if (editItem) {
        const res = await api.customers.update(editItem.customer_id, form)
        if (res.customer) {
          setCustomers(prev => prev.map(c => c.customer_id === editItem.customer_id ? res.customer : c))
        } else {
          loadCustomers()
        }
        showToast('Customer updated successfully', 'success')
      } else {
        // Create new customer
        const res = await api.customers.create(form)
        if (res.customer) {
          setCustomers(prev => [...prev, res.customer])
        } else {
          loadCustomers()
        }
        showToast('Customer added successfully', 'success')
      }
      setAddModal(false)
      setEditItem(null)
      setForm(emptyForm)
    } catch (err) {
      showToast(err.message || 'Failed to save customer', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (customer) => {
    const confirmed = await confirmAction('Delete Customer?', `Are you sure you want to delete ${customer.first_name} ${customer.last_name}? This cannot be undone.`, 'Yes, Delete')
    if (!confirmed) return

    setSaving(true)
    try {
      await api.customers.delete(customer.customer_id)
      setCustomers(prev => prev.filter(c => c.customer_id !== customer.customer_id))
      showToast('Customer deleted successfully', 'success')
      if (detailCustomer?.customer?.customer_id === customer.customer_id) {
        setDetailCustomer(null)
      }
    } catch (err) {
      showToast(err.message || 'Failed to delete customer', 'error')
    } finally {
      setSaving(false)
    }
  }

  const openEdit = (c) => {
    setEditItem(c)
    setForm({
      customer_code: c.customer_code || '',
      first_name: c.first_name || '',
      middle_name: c.middle_name || '',
      last_name: c.last_name || '',
      phone: c.phone || '',
      email: c.email || '',
      address: c.address || '',
      status: c.status || 'Active',
      notes: c.notes || '',
    })
    setAddModal(true)
  }

  const openDetail = async (c) => {
    setDetailCustomer(null)
    setDetailTab('profile')
    setDetailLoading(true)
    try {
      const data = await api.customers.getById(c.customer_id)
      setDetailCustomer(data)
    } catch (err) {
      showToast(err.message || 'Failed to load customer details', 'error')
    } finally {
      setDetailLoading(false)
    }
  }

  const filtered = useMemo(() => {
    return filterBySearch(customers, search, ['first_name', 'last_name', 'customer_code', 'phone', 'email'])
  }, [customers, search])

  const total = filtered.length
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize)

  // Compute live aggregates from database records
  const totalCount = customers.length
  const activeCount = customers.filter(c => c.status === 'Active').length
  const totalBalance = customers.reduce((acc, c) => acc + (c.balance || 0), 0)
  const customersWithBalance = customers.filter(c => (c.balance || 0) > 0).length

  return (
    <div className={embedded ? "" : "space-y-6"}>
      {!embedded && (
        <PageHeader
          title="Customer Management"
          subtitle="Manage customer records, credit histories, and installment accounts"
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

              {isStoreAdmin && (
                <button
                  onClick={() => { setForm(emptyForm); setEditItem(null); setAddModal(true) }}
                  className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
                >
                  <FiPlus className="w-4 h-4" />
                  <span>Add Customer</span>
                </button>
              )}

            </div>
          }
        />
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard title="Total Customers" value={totalCount.toString()} sub="registered profiles" icon={<FiUsers className="w-5 h-5" />} color="blue" />
        <StatCard title="Active Accounts" value={activeCount.toString()} sub="in good standing" icon={<FiCheckCircle className="w-5 h-5 text-emerald-500" />} color="green" />
        <StatCard title="Total Credit Balance" value={fmt(totalBalance)} sub="outstanding installments" icon={<TbCurrencyPeso className="w-5 h-5 text-rose-500" />} color="red" />
        <StatCard title="Accounts with Balance" value={customersWithBalance.toString()} sub="customers owing balance" icon={<FiCreditCard className="w-5 h-5 text-amber-500" />} color="yellow" />
      </div>

      {error && <ErrorAlert message={error} onRetry={loadCustomers} />}

      {/* Search and Filters */}
      <Card noPad className="p-3.5 border border-border">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search customer name, code, phone, email..."
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
              value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
              className="border border-border rounded-xl px-3 py-2 text-xs font-semibold text-foreground bg-card cursor-pointer"
            >
              <option value="All">All Statuses</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
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
            icon={<FiUsers className="w-12 h-12 text-muted-foreground/30 mx-auto" />}
            title="No customers found"
            description={search || statusFilter !== 'All' ? 'Try adjusting your search query or filters' : 'Add your first customer to get started'}
            action={null}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/50 text-muted-foreground uppercase font-semibold text-[11px]">
                    <th className="py-3 px-4 text-left">Customer Code</th>
                    <th className="py-3 px-4 text-left">Full Name</th>
                    <th className="py-3 px-4 text-left">Contact Info</th>
                    <th className="py-3 px-4 text-left">Branch</th>
                    <th className="py-3 px-4 text-center">Active Accounts</th>
                    <th className="py-3 px-4 text-right">Total Balance</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {paginated.map((c, i) => (
                    <tr key={c.customer_id} className={`hover:bg-muted/40 transition-colors ${i % 2 === 1 ? 'bg-muted/10' : ''}`}>
                      <td className="py-3 px-4 font-mono font-bold text-foreground">
                        <div className="flex items-center gap-1.5">
                          <FiUser className="w-3.5 h-3.5 text-primary shrink-0" />
                          <span>{c.customer_code}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-foreground">{c.first_name} {c.middle_name ? `${c.middle_name}. ` : ''}{c.last_name}</div>
                        {c.notes && <div className="text-[11px] text-muted-foreground italic truncate max-w-xs">{c.notes}</div>}
                      </td>
                      <td className="py-3 px-4">
                        <div className="space-y-0.5">
                          <div className="font-mono text-foreground flex items-center gap-1">
                            <FiPhone className="w-3 h-3 text-muted-foreground" />
                            <span>{c.phone}</span>
                          </div>
                          {c.email && (
                            <div className="text-muted-foreground flex items-center gap-1">
                              <FiMail className="w-3 h-3" />
                              <span className="truncate">{c.email}</span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        {c.branch_name ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                            <FiGitBranch className="w-3 h-3" />
                            {c.branch_name}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                            Unassigned
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="font-mono text-xs px-2.5 py-0.5 rounded-full bg-primary/10 text-primary font-bold">
                          {c.active_installments || 0} active
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className={`font-mono font-bold ${(c.balance || 0) > 0 ? 'text-rose-600' : 'text-muted-foreground'}`}>
                          {fmt(c.balance || 0)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <StatusBadge status={c.status} />
                      </td>
                        <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => openDetail(c)}
                            title="View profile & history"
                            className="p-1.5 rounded-lg border border-border hover:bg-muted text-foreground transition-colors cursor-pointer"
                          >
                            <FiEye className="w-3.5 h-3.5" />
                          </button>
                          {isAdmin && (
                            <button
                              onClick={() => openAssignBranch(c)}
                              title="Assign to branch"
                              className="p-1.5 rounded-lg border border-border hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-900/30 text-muted-foreground transition-colors cursor-pointer"
                            >
                              <FiGitBranch className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {(isStoreAdmin || !isAdmin) && (
                            <button
                              onClick={() => openEdit(c)}
                              title="Edit profile"
                              className="p-1.5 rounded-lg border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                            >
                              <FiEdit className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {(isStoreAdmin || !isAdmin) && (
                            <button
                              onClick={() => handleDelete(c)}
                              title="Delete customer"
                              className="p-1.5 rounded-lg border border-border hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 text-muted-foreground transition-colors cursor-pointer"
                            >
                              <FiTrash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
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

      {/* Add / Edit Modal */}
      {addModal && (
        <Modal
          isOpen={true}
          title={editItem ? `Edit Customer — ${editItem?.customer_code || ''}` : 'Add New Customer'}
          onClose={() => { setAddModal(false); setEditItem(null); setForm(emptyForm) }}
          size="md"
        >
          <form onSubmit={handleSave} className="space-y-3.5 text-xs">
            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <label className="block font-bold text-muted-foreground mb-1">First Name *</label>
                <input
                  type="text"
                  value={form.first_name}
                  onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))}
                  placeholder="First name"
                  required
                  className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground"
                />
              </div>
              <div>
                <label className="block font-bold text-muted-foreground mb-1">Middle Initial</label>
                <input
                  type="text"
                  value={form.middle_name}
                  onChange={e => setForm(f => ({ ...f, middle_name: e.target.value }))}
                  placeholder="M.I."
                  className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground"
                />
              </div>
              <div>
                <label className="block font-bold text-muted-foreground mb-1">Last Name *</label>
                <input
                  type="text"
                  value={form.last_name}
                  onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))}
                  placeholder="Last name"
                  required
                  className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block font-bold text-muted-foreground mb-1">Phone Number *</label>
                <div className="relative">
                  <FiPhone className="absolute left-3 top-2.5 text-muted-foreground w-3.5 h-3.5" />
                  <input
                    type="text"
                    value={form.phone}
                    onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    placeholder="0917XXXXXXX"
                    required
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-border bg-card text-foreground font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-muted-foreground mb-1">Email Address</label>
                <div className="relative">
                  <FiMail className="absolute left-3 top-2.5 text-muted-foreground w-3.5 h-3.5" />
                  <input
                    type="email"
                    value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="customer@email.com"
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-border bg-card text-foreground"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block font-bold text-muted-foreground mb-1">Home / Delivery Address</label>
              <div className="relative">
                <FiMapPin className="absolute left-3 top-2.5 text-muted-foreground w-3.5 h-3.5" />
                <input
                  type="text"
                  value={form.address}
                  onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                  placeholder="Street, Barangay, City, Province"
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-border bg-card text-foreground"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block font-bold text-muted-foreground mb-1">Customer Code</label>
                <input
                  type="text"
                  value={form.customer_code}
                  onChange={e => setForm(f => ({ ...f, customer_code: e.target.value }))}
                  placeholder="Auto-generated if empty"
                  className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-mono"
                />
              </div>
              <div>
                <label className="block font-bold text-muted-foreground mb-1">Account Status</label>
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
              <label className="block font-bold text-muted-foreground mb-1">Notes & Remarks</label>
              <textarea
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Credit status, VIP tag, special delivery instructions..."
                rows={2}
                className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => { setAddModal(false); setEditItem(null) }}
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
                <span>{saving ? 'Saving...' : editItem ? 'Update Customer' : 'Save Customer'}</span>
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Customer Detail Drawer / Modal */}
      {(detailCustomer || detailLoading) && (
        <Modal
          isOpen={true}
          title={detailCustomer ? `${detailCustomer.customer.first_name} ${detailCustomer.customer.last_name} (${detailCustomer.customer.customer_code})` : 'Loading Customer...'}
          onClose={() => setDetailCustomer(null)}
          size="lg"
        >
          {detailLoading || !detailCustomer ? (
            <LoadingState message="Fetching complete customer credit & purchase history..." />
          ) : (
            <div className="space-y-4 text-xs">
              <TabBar
                tabs={[
                  { id: 'profile', label: 'Profile Summary', icon: <FiUser className="w-3.5 h-3.5" /> },
                  { id: 'installments', label: `Installments (${detailCustomer.installments?.length || 0})`, icon: <FiCreditCard className="w-3.5 h-3.5" /> },
                  { id: 'sales', label: `Sales History (${detailCustomer.sales?.length || 0})`, icon: <FiFileText className="w-3.5 h-3.5" /> },
                  { id: 'payments', label: `Payments (${detailCustomer.payments?.length || 0})`, icon: <TbCurrencyPeso className="w-3.5 h-3.5" /> },
                ]}
                active={detailTab}
                onChange={setDetailTab}
              />

              {detailTab === 'profile' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3 p-3.5 bg-muted/20 rounded-xl border border-border">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-muted-foreground">Customer Code:</span>
                      <p className="font-mono font-bold text-foreground">{detailCustomer.customer.customer_code}</p>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-muted-foreground">Account Status:</span>
                      <div><StatusBadge status={detailCustomer.customer.status} /></div>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-muted-foreground">Phone:</span>
                      <p className="font-mono text-foreground">{detailCustomer.customer.phone}</p>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-muted-foreground">Email:</span>
                      <p className="text-foreground">{detailCustomer.customer.email || '—'}</p>
                    </div>
                    <div className="col-span-2">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground">Address:</span>
                      <p className="text-foreground">{detailCustomer.customer.address || '—'}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div className="p-3 border border-border rounded-xl bg-blue-50/50 dark:bg-blue-950/20">
                      <span className="text-[10px] text-muted-foreground uppercase font-bold block mb-1">Active Accounts</span>
                      <span className="text-xl font-bold font-mono text-primary">{detailCustomer.customer.active_installments}</span>
                    </div>
                    <div className="p-3 border border-border rounded-xl bg-amber-50/50 dark:bg-amber-950/20">
                      <span className="text-[10px] text-muted-foreground uppercase font-bold block mb-1">Due Balance</span>
                      <span className="text-lg font-bold font-mono text-amber-600">{fmt(detailCustomer.customer.balance)}</span>
                    </div>
                    <div className="p-3 border border-border rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20">
                      <span className="text-[10px] text-muted-foreground uppercase font-bold block mb-1">Lifetime Spend</span>
                      <span className="text-lg font-bold font-mono text-emerald-600">{fmt(detailCustomer.customer.lifetime_spend)}</span>
                    </div>
                    <div className="p-3 border border-border rounded-xl bg-muted/30">
                      <span className="text-[10px] text-muted-foreground uppercase font-bold block mb-1">Last Purchase</span>
                      <span className="text-xs font-bold font-mono text-foreground">{detailCustomer.customer.last_purchase || 'No purchases'}</span>
                    </div>
                  </div>
                </div>
              )}

              {detailTab === 'installments' && (
                <div className="space-y-2">
                  {detailCustomer.installments?.length === 0 ? (
                    <div className="py-8 text-center text-muted-foreground">No installment accounts on file</div>
                  ) : (
                    detailCustomer.installments.map(inst => (
                      <div key={inst.installment_id} className="p-3 border border-border rounded-xl bg-card space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="font-mono font-bold text-primary">{inst.account_no} (Invoice: {inst.invoice_no})</span>
                          <StatusBadge status={inst.status} />
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div><span className="text-muted-foreground">Total:</span> <p className="font-mono font-semibold">{fmt(inst.total_payable)}</p></div>
                          <div><span className="text-muted-foreground">Paid:</span> <p className="font-mono font-semibold text-emerald-600">{fmt(inst.paid)}</p></div>
                          <div><span className="text-muted-foreground">Balance:</span> <p className="font-mono font-bold text-rose-600">{fmt(inst.balance)}</p></div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {detailTab === 'sales' && (
                <div className="space-y-2">
                  {detailCustomer.sales?.length === 0 ? (
                    <div className="py-8 text-center text-muted-foreground">No purchase records found</div>
                  ) : (
                    <div className="overflow-x-auto border border-border rounded-xl">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-border bg-muted/50 text-muted-foreground">
                            <th className="py-2 px-3 text-left">Invoice No</th>
                            <th className="py-2 px-3 text-left">Date</th>
                            <th className="py-2 px-3 text-left">Method</th>
                            <th className="py-2 px-3 text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detailCustomer.sales.map(s => (
                            <tr key={s.sale_id} className="border-b border-border">
                              <td className="py-2 px-3 font-mono font-bold text-primary">{s.invoice_no}</td>
                              <td className="py-2 px-3 font-mono">{s.sale_date}</td>
                              <td className="py-2 px-3">{s.payment_method}</td>
                              <td className="py-2 px-3 text-right font-mono font-bold">{fmt(s.total_amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {detailTab === 'payments' && (
                <div className="space-y-2">
                  {detailCustomer.payments?.length === 0 ? (
                    <div className="py-8 text-center text-muted-foreground">No payment records found</div>
                  ) : (
                    <div className="overflow-x-auto border border-border rounded-xl">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-border bg-muted/50 text-muted-foreground">
                            <th className="py-2 px-3 text-left">Receipt No</th>
                            <th className="py-2 px-3 text-left">Date</th>
                            <th className="py-2 px-3 text-left">Method</th>
                            <th className="py-2 px-3 text-right">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detailCustomer.payments.map(p => (
                            <tr key={p.payment_id} className="border-b border-border">
                              <td className="py-2 px-3 font-mono font-bold text-foreground">{p.receipt_no}</td>
                              <td className="py-2 px-3 font-mono">{p.payment_date}</td>
                              <td className="py-2 px-3">{p.payment_method}</td>
                              <td className="py-2 px-3 text-right font-mono font-bold text-emerald-600">{fmt(p.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setDetailCustomer(null)}
                  className="flex items-center gap-1 px-4 py-1.5 rounded-xl border border-border hover:bg-muted font-semibold cursor-pointer"
                >
                  <FiX className="w-3.5 h-3.5" />
                  <span>Close</span>
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* Assign Branch Modal — Admin Only */}
      {isAdmin && assignBranchModal && assignBranchCustomer && (
        <Modal
          isOpen={true}
          title={`Assign Branch — ${assignBranchCustomer.first_name} ${assignBranchCustomer.last_name}`}
          onClose={() => { setAssignBranchModal(false); setAssignBranchCustomer(null) }}
          size="sm"
        >
          <div className="space-y-4 text-xs">
            <div className="p-3 rounded-xl bg-muted/50 border border-border space-y-1">
              <div className="text-muted-foreground">Customer Code</div>
              <div className="font-mono font-bold text-foreground">{assignBranchCustomer.customer_code}</div>
              <div className="text-muted-foreground mt-1">Current Branch</div>
              <div className="font-semibold">
                {assignBranchCustomer.branch_name ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                    <FiGitBranch className="w-3 h-3" />
                    {assignBranchCustomer.branch_name}
                  </span>
                ) : (
                  <span className="text-amber-600">Unassigned</span>
                )}
              </div>
            </div>

            <div>
              <label className="block font-bold text-muted-foreground mb-1.5">Assign to Branch</label>
              <select
                value={selectedBranchId}
                onChange={e => setSelectedBranchId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="">— Unassigned (no branch) —</option>
                {branches.map(b => (
                  <option key={b.id} value={String(b.id)}>{b.name}</option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => { setAssignBranchModal(false); setAssignBranchCustomer(null) }}
                className="px-4 py-1.5 rounded-xl border border-border hover:bg-muted font-semibold cursor-pointer text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAssignBranch}
                disabled={assigningSaving}
                className="px-4 py-1.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold cursor-pointer text-xs disabled:opacity-50 flex items-center gap-1"
              >
                <FiGitBranch className="w-3.5 h-3.5" />
                {assigningSaving ? 'Saving...' : 'Save Branch'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
