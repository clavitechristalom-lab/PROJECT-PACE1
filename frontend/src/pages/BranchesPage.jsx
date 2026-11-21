import { useState, useEffect, useMemo, useRef } from 'react'
import {
  FiBriefcase, FiPlus, FiEdit, FiTrash2, FiSearch,
  FiMapPin, FiPhone, FiInfo, FiImage, FiCamera, FiUploadCloud
} from 'react-icons/fi'
import {
  Btn, Badge, StatusBadge, Input, Select, Modal, ConfirmDialog,
  Table, TR, TD, SearchBar, PageHeader, StatCard, Card, Pagination, showToast,
  LoadingState, ErrorAlert, TableSkeleton, EmptyState, confirmAction,
} from '../components/ui'
import { fmt, filterBySearch } from '../lib/utils'
import api from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { useRealtimeSync, triggerDataSync } from '../lib/realtimeSync'
import CreateBranchModal from '../components/branches/CreateBranchModal'
import EditBranchModal from '../components/branches/EditBranchModal'

export default function BranchesPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'Administrator'

  const [branches, setBranches] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [page, setPage] = useState(1)
  const pageSize = 10

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [saving, setSaving] = useState(false)
  const [editImageFile, setEditImageFile] = useState(null)
  const [editImagePreview, setEditImagePreview] = useState('')
  const editFileInputRef = useRef(null)

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true)
    if (!silent) setError('')
    try {
      const res = await api.branches.getAll()
      setBranches(res.branches || [])
    } catch (err) {
      console.error('Failed to load branches:', err)
      if (!silent) setError(err.message || 'Failed to fetch branches')
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  useRealtimeSync(() => {
    loadData(true)
  }, [], { module: 'branches' })

  // Form
  const emptyForm = {
    name: '',
    branch_code: '',
    branch_type: 'Main Showroom & Retail Branch',
    location: '',
    address: '',
    city: '',
    province: '',
    contact_number: '',
    email: '',
    operating_hours: 'Monday – Saturday, 8:00 AM – 5:00 PM',
    opening_date: '',
    description: '',
    status: 'open',
    color: '#2b5ce6',
  }
  const [form, setForm] = useState(emptyForm)
  const [formErrors, setFormErrors] = useState({})

  const handleCreateSuccess = () => {
    setShowCreateModal(false)
    showToast('Branch successfully created!', 'success')
    loadData(true)
    triggerDataSync('branches')
  }

  const openEdit = (b) => {
    setForm({
      name: b.name || '',
      branch_code: b.branch_code || '',
      branch_type: b.branch_type || 'Main Showroom & Retail Branch',
      location: b.location || '',
      address: b.address || '',
      city: b.city || '',
      province: b.province || '',
      contact_number: b.contact_number || '',
      email: b.email || '',
      operating_hours: b.operating_hours || 'Monday – Saturday, 8:00 AM – 5:00 PM',
      opening_date: b.opening_date || '',
      description: b.description || '',
      status: b.status || 'open',
      color: b.color || '#2b5ce6',
      image_url: b.image_url || '',
    })
    setEditImageFile(null)
    setEditImagePreview(b.image_url || '')
    setFormErrors({})
    setEditItem(b)
  }

  const handleImageChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 5 * 1024 * 1024) {
      showToast('Please select an image smaller than 5MB', 'error')
      return
    }

    if (!file.type.startsWith('image/')) {
      showToast('Please upload a valid image file (PNG, JPG, WebP)', 'error')
      return
    }

    setEditImageFile(file)

    // Instant live preview with object URL
    const objectUrl = URL.createObjectURL(file)
    setEditImagePreview(objectUrl)

    // Also read with FileReader for data URL fallback
    const reader = new FileReader()
    reader.onload = (event) => {
      if (event.target?.result) {
        setEditImagePreview(event.target.result)
      }
    }
    reader.readAsDataURL(file)
  }

  const handleResetImage = () => {
    setEditImageFile(null)
    setEditImagePreview(editItem?.image_url || '')
  }

  const handleDelete = async (id, name) => {
    const confirmed = await confirmAction(
      'Delete Branch',
      `Are you sure you want to delete "${name || 'this branch'}"? This action cannot be undone.`,
      'Yes, Delete'
    )
    if (!confirmed) return

    try {
      await api.branches.delete(id)
      showToast('Branch deleted successfully', 'success')
      triggerDataSync('branches')
    } catch (err) {
      showToast(err.message || 'Failed to delete branch', 'error')
    }
  }

  const handleEditSubmit = async (e) => {
    e.preventDefault()
    setFormErrors({})
    if (!form.name || !form.name.trim()) {
      setFormErrors({ name: 'Branch Name is required.' })
      return
    }

    const branchId = editItem?.id || editItem?.branch_id
    if (!branchId) {
      showToast('Invalid branch ID', 'error')
      return
    }

    setSaving(true)
    try {
      const payload = new FormData()
      payload.append('name', (form.name || '').trim())
      payload.append('branch_code', (form.branch_code || '').trim())
      payload.append('branch_type', (form.branch_type || '').trim())
      payload.append('location', (form.location || '').trim())
      payload.append('address', (form.address || '').trim())
      payload.append('city', (form.city || '').trim())
      payload.append('province', (form.province || '').trim())
      payload.append('contact_number', (form.contact_number || '').trim())
      payload.append('email', (form.email || '').trim())
      payload.append('operating_hours', (form.operating_hours || '').trim())
      payload.append('opening_date', (form.opening_date || '').trim())
      payload.append('description', (form.description || '').trim())
      payload.append('status', form.status || 'open')
      payload.append('color', form.color || '#2b5ce6')
      if (form.image_url) {
        payload.append('image_url', form.image_url)
      }

      if (editImageFile instanceof File) {
        payload.append('image', editImageFile)
      }

      await api.branches.update(branchId, payload)
      showToast('Branch updated successfully', 'success')
      setEditItem(null)
      setEditImageFile(null)
      setEditImagePreview('')
      triggerDataSync('branches')
    } catch (err) {
      showToast(err.message || 'Failed to update branch', 'error')
    } finally {
      setSaving(false)
    }
  }

  // Filtering & Pagination
  const filtered = useMemo(() => {
    let res = branches
    if (statusFilter !== 'All') {
      res = res.filter(b => b.status === statusFilter)
    }
    return filterBySearch(res, search, ['name', 'location', 'contact_number', 'status'])
  }, [branches, search, statusFilter])

  const paginated = useMemo(() => {
    const start = (page - 1) * pageSize
    return filtered.slice(start, start + pageSize)
  }, [filtered, page])

  const totalPages = Math.ceil(filtered.length / pageSize)

  // Stats
  const activeBranches = branches.filter(b => b.status === 'open').length
  const totalBranches = branches.length

  if (!isAdmin) {
    return <ErrorAlert message="You do not have permission to view this page." />
  }

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Branches Management"
        subtitle="Create and manage store branches and locations"
        action={
          <Btn onClick={() => setShowCreateModal(true)} icon={<FiPlus />} variant="primary">
            Create Branch
          </Btn>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Total Branches" value={totalBranches} icon={<FiBriefcase />} color="blue" />
        <StatCard title="Active Branches" value={activeBranches} icon={<FiBriefcase />} color="emerald" />
      </div>

      <Card>
        <div className="p-4 border-b border-border flex flex-col md:flex-row justify-between items-center gap-4 bg-muted/20">
          <SearchBar value={search} onChange={setSearch} placeholder="Search branches..." className="w-full md:w-80" />
          <div className="flex items-center gap-3 w-full md:w-auto">
            <Select value={statusFilter} onChange={e => setStatusFilter(e?.target ? e.target.value : e)} className="w-full md:w-40">
              <option value="All">All Status</option>
              <option value="open">Open</option>
              <option value="closed">Closed</option>
            </Select>
          </div>
        </div>

        {loading ? (
          <TableSkeleton rows={5} />
        ) : error ? (
          <ErrorAlert message={error} onRetry={loadData} className="m-4" />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<FiBriefcase className="w-12 h-12 text-muted-foreground/30" />}
            title="No branches found"
            message={search ? 'Try adjusting your search or filters.' : 'Get started by creating a new branch.'}
            action={!search && <Btn onClick={() => setShowCreateModal(true)}>Create First Branch</Btn>}
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <thead>
                <tr>
                  <th className="text-left font-bold text-muted-foreground uppercase text-[10px] tracking-wider py-3 px-4">Branch Details</th>
                  <th className="text-left font-bold text-muted-foreground uppercase text-[10px] tracking-wider py-3 px-4">Location</th>
                  <th className="text-left font-bold text-muted-foreground uppercase text-[10px] tracking-wider py-3 px-4">Contact</th>
                  <th className="text-center font-bold text-muted-foreground uppercase text-[10px] tracking-wider py-3 px-4">Status</th>
                  <th className="text-right font-bold text-muted-foreground uppercase text-[10px] tracking-wider py-3 px-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((b, i) => (
                  <TR key={b.id} index={i}>
                    <TD>
                      <div className="flex items-center gap-3">
                        {b.image_url ? (
                          <img
                            src={b.image_url}
                            alt={b.name}
                            className="w-8 h-8 rounded-xl object-cover shrink-0 border border-border shadow-xs"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border border-border" style={{ backgroundColor: `${b.color || '#3b82f6'}20`, color: b.color || '#3b82f6' }}>
                            <FiBriefcase className="w-4 h-4" />
                          </div>
                        )}
                        <div>
                          <div className="font-bold text-foreground text-sm flex items-center gap-2">
                            {b.name}
                          </div>
                          <div className="text-[10px] text-muted-foreground font-mono">ID: {b.id}</div>
                        </div>
                      </div>
                    </TD>
                    <TD>
                      {(b.location || b.city) ? (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <FiMapPin className="w-3 h-3" />
                          <span className="truncate max-w-[150px]">{b.location || b.city}</span>
                        </div>
                      ) : <span className="text-xs text-muted-foreground/50 italic">Not set</span>}
                    </TD>
                    <TD>
                      {b.contact_number ? (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
                          <FiPhone className="w-3 h-3" /> {b.contact_number}
                        </div>
                      ) : <span className="text-xs text-muted-foreground/50 italic">Not set</span>}
                    </TD>
                    <TD className="text-center">
                      <StatusBadge status={b.status === 'open' ? 'Active' : 'Inactive'} />
                    </TD>
                    <TD className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Btn size="sm" variant="outline" icon={<FiEdit />} onClick={() => openEdit(b)}>Edit</Btn>
                        <Btn size="sm" variant="danger-outline" icon={<FiTrash2 />} onClick={() => handleDelete(b.id, b.name)} />
                      </div>
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
            {filtered.length > pageSize && (
              <div className="p-4 border-t border-border bg-muted/10">
                <Pagination page={page} total={filtered.length} pageSize={pageSize} onChange={setPage} />
              </div>
            )}
          </div>
        )}
      </Card>

      {/* CREATE MODAL */}
      <CreateBranchModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={async (formData, imageFile) => {
          try {
            const res = await api.branches.create(formData)
            if (imageFile && res.branch?.id) {
              const fileData = new FormData()
              fileData.append('image', imageFile)
              await api.branches.uploadImage(res.branch.id, fileData)
            }
            handleCreateSuccess()
          } catch (err) {
            showToast(err.message || 'Failed to create branch', 'error')
            throw err
          }
        }}
      />

      {/* EDIT MODAL */}
      <EditBranchModal
        isOpen={Boolean(editItem)}
        onClose={() => setEditItem(null)}
        initialData={editItem}
        onUpdate={async (branchId, payload) => {
          await api.branches.update(branchId, payload)
          showToast('Branch updated successfully', 'success')
          setEditItem(null)
          loadData(true)
          triggerDataSync('branches')
        }}
        onDelete={editItem ? () => {
          const targetId = editItem.id
          const targetName = editItem.name
          setEditItem(null)
          handleDelete(targetId, targetName)
        } : undefined}
      />
    </div>
  )
}
