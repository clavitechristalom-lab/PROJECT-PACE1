import React, { useState, useEffect, useRef } from 'react'
import { Modal, StatusBadge, showError, showWarning } from '../ui'
import { api } from '../../lib/api'
import {
  FiMapPin, FiUser, FiPhone, FiTrash2, FiImage,
  FiCamera, FiUploadCloud, FiBriefcase, FiCheckCircle, FiX
} from 'react-icons/fi'

const COLOR_SWATCHES = [
  '#2b5ce6',
  '#10b981',
  '#f59e0b',
  '#8b5cf6',
  '#ec4899',
  '#0ea5e9',
  '#0f172a',
]

const SERVICE_TEMPLATES = [
  'Full furniture & home appliance showroom with walk-in POS sales and local delivery.',
  'Regional retail store with in-house installment billing desk, customer verification, and warranty support.',
  'Showroom display center offering living room, bedroom, dining furniture, and energy-efficient inverter appliances.',
]

export default function EditBranchModal({ isOpen, onClose, onUpdate, initialData, onDelete }) {
  const [formData, setFormData] = useState({
    name: '',
    city: '',
    location: '',
    manager_id: '',
    contact_number: '',
    description: '',
    status: 'open',
    color: '#2b5ce6',
  })

  const [loading, setLoading] = useState(false)
  const [admins, setAdmins] = useState([])
  const [selectedFile, setSelectedFile] = useState(null)
  const [imagePreview, setImagePreview] = useState('')
  const fileInputRef = useRef(null)
  const isInitializedRef = useRef(null)

  useEffect(() => {
    if (isOpen) {
      api.system.getUsers()
        .then(res => {
          const users = res.users || res || []
          setAdmins(
            Array.isArray(users)
              ? users.filter(u => u.role === 'Store Administrator' || u.role === 'Store Admin')
              : []
          )
        })
        .catch(() => setAdmins([]))
    }
  }, [isOpen])

  useEffect(() => {
    if (isOpen && initialData) {
      const currentId = initialData.id || initialData.branch_id
      if (isInitializedRef.current !== currentId) {
        setFormData({
          name: initialData.branch || initialData.name || '',
          city: initialData.city || '',
          location: initialData.location || '',
          manager_id: initialData.manager_id ? String(initialData.manager_id) : '',
          contact_number: initialData.contact_number || initialData.contact || '',
          description: initialData.description || '',
          status: initialData.status || 'open',
          color: initialData.color || '#2b5ce6',
        })
        setSelectedFile(null)
        setImagePreview(initialData.image_url || initialData.image || '')
        isInitializedRef.current = currentId
      }
    } else if (!isOpen) {
      isInitializedRef.current = null
      setSelectedFile(null)
      setImagePreview('')
    }
  }, [isOpen, initialData])

  const handleImageChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 5 * 1024 * 1024) {
      showWarning('File Too Large', 'Please select an image smaller than 5MB')
      return
    }

    if (!file.type.startsWith('image/')) {
      showWarning('Invalid File', 'Please upload a valid image file (PNG, JPG, WebP)')
      return
    }

    setSelectedFile(file)
    const objectUrl = URL.createObjectURL(file)
    setImagePreview(objectUrl)

    const reader = new FileReader()
    reader.onload = (event) => {
      if (event.target?.result) {
        setImagePreview(event.target.result)
      }
    }
    reader.readAsDataURL(file)
  }

  const handleResetImage = () => {
    setSelectedFile(null)
    setImagePreview(initialData?.image_url || initialData?.image || '')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!formData.name || !formData.name.trim()) {
      showWarning('Branch Name Required', 'Please enter a valid Branch Name.')
      return
    }
    setLoading(true)
    try {
      const payload = new FormData()
      payload.append('name', (formData.name || '').trim())
      payload.append('city', (formData.city || '').trim())
      payload.append('location', (formData.location || formData.city || '').trim())
      payload.append('contact_number', (formData.contact_number || '').trim())
      payload.append('description', (formData.description || '').trim())
      payload.append('status', formData.status || 'open')
      payload.append('color', formData.color || '#2b5ce6')
      if (formData.manager_id) {
        payload.append('manager_id', formData.manager_id)
      }

      if (selectedFile instanceof File) {
        payload.append('image', selectedFile)
      }

      const branchId = initialData?.id || initialData?.branch_id
      if (onUpdate) {
        await onUpdate(branchId, payload)
      } else {
        await api.branches.update(branchId, payload)
      }
      onClose()
    } catch (err) {
      console.error('Failed to update branch:', err)
      showError('Update Failed', err.message || 'Failed to update branch details.')
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (e) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  if (!isOpen) return null

  const branchId = initialData?.id || initialData?.branch_id
  const selectedManager = admins.find(a => String(a.user_id) === String(formData.manager_id))
  const managerDisplayName = selectedManager
    ? (selectedManager.employee
        ? `${selectedManager.employee.first_name || ''} ${selectedManager.employee.last_name || ''}`.trim()
        : (selectedManager.full_name || selectedManager.username))
    : (initialData?.manager_name || initialData?.manager || 'Unassigned')

  const displayLocation = (formData.location || '').trim() ||
    (formData.city || '').trim() ||
    'Location not set'

  const staffCount = initialData?.employees_count ?? 0
  const customerCount = initialData?.customers_count ?? 0
  const productCount = initialData?.catalog_products_count ?? initialData?.products_count ?? 0
  const salesCount = initialData?.sales_count ?? 0

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Edit Branch Details — ${initialData?.name || initialData?.branch || 'Branch'}`}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/jpg,image/webp"
          className="hidden"
          onChange={handleImageChange}
          onClick={(e) => { e.target.value = null }}
        />

        {/* Top Branch Identity & Live Operational Metrics Banner */}
        <div className="p-3.5 rounded-2xl bg-muted/25 border border-border space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {imagePreview ? (
                <img
                  src={imagePreview}
                  alt="Branch Preview"
                  className="w-12 h-12 rounded-xl object-cover shrink-0 border border-border shadow-xs"
                />
              ) : (
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center font-bold text-base shrink-0 border border-border shadow-2xs"
                  style={{
                    backgroundColor: `${formData.color || '#2b5ce6'}20`,
                    color: formData.color || '#2b5ce6',
                  }}
                >
                  <FiBriefcase className="w-5 h-5" />
                </div>
              )}
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-sm text-foreground truncate">
                    {formData.name.trim() || 'Store Branch'}
                  </span>
                  {branchId && (
                    <span className="px-2 py-0.5 rounded-md bg-muted border border-border font-mono text-[10px] font-bold text-muted-foreground">
                      ID #{branchId}
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5 flex flex-wrap items-center gap-1.5">
                  <FiMapPin className="w-3 h-3 text-primary shrink-0" />
                  <span className="truncate">{displayLocation}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1 bg-card px-2 py-0.5 rounded-md border border-border font-semibold text-foreground">
                    <FiUser className="w-3 h-3 text-primary" />
                    Manager: {managerDisplayName}
                  </span>
                  {formData.contact_number && (
                    <span className="inline-flex items-center gap-1 bg-card px-2 py-0.5 rounded-md border border-border font-mono text-foreground">
                      <FiPhone className="w-3 h-3 text-emerald-500" />
                      {formData.contact_number}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <StatusBadge status={formData.status === 'open' ? 'Active' : 'Inactive'} />
          </div>

          {/* 4 Live Branch KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
            <div className="p-2.5 rounded-xl bg-card border border-border">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                Assigned Staff
              </span>
              <div className="font-mono font-bold text-sm text-foreground mt-0.5">
                {staffCount} {staffCount === 1 ? 'Employee' : 'Employees'}
              </div>
              <span className="text-[10px] text-muted-foreground truncate block">
                Manager: {managerDisplayName}
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-card border border-border">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                Branch Customers
              </span>
              <div className="font-mono font-bold text-sm text-foreground mt-0.5">
                {customerCount} {customerCount === 1 ? 'Customer' : 'Customers'}
              </div>
              <span className="text-[10px] text-muted-foreground">
                Registered accounts
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-card border border-border">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                Available Catalog
              </span>
              <div className="font-mono font-bold text-sm text-primary mt-0.5">
                {productCount} Products
              </div>
              <span className="text-[10px] text-muted-foreground">
                Branch & global stock
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-card border border-border">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                Sales Records
              </span>
              <div className="font-mono font-bold text-sm text-emerald-600 mt-0.5">
                {salesCount} {salesCount === 1 ? 'Sale' : 'Sales'}
              </div>
              <span className="text-[10px] text-muted-foreground">
                Completed transactions
              </span>
            </div>
          </div>
        </div>

        {/* Section 1: Storefront Photo & Brand Theme */}
        <div className="p-3.5 rounded-2xl bg-card border border-border space-y-3">
          <div className="border-b border-border pb-2">
            <h4 className="font-bold text-foreground text-xs uppercase tracking-wider">
              1. Storefront Photo & Brand Theme
            </h4>
            <p className="text-[10px] text-muted-foreground">
              Update the storefront hero image and branch accent color used in badges and charts.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center">
            <div className="sm:col-span-7 flex items-center gap-3 p-2.5 bg-muted/20 border border-border rounded-xl">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-16 h-16 rounded-xl bg-card border-2 border-dashed border-border flex flex-col items-center justify-center cursor-pointer overflow-hidden transition-all hover:border-primary/50 relative shrink-0 group"
              >
                {imagePreview ? (
                  <img src={imagePreview} alt="Branch Preview" className="w-full h-full object-cover" />
                ) : (
                  <div className="flex flex-col items-center justify-center text-muted-foreground p-1 text-center">
                    <FiImage className="w-5 h-5 mb-0.5 text-muted-foreground/60" />
                    <span className="text-[9px] font-semibold">No Image</span>
                  </div>
                )}
                <div className="absolute inset-0 bg-black/60 text-white flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <FiCamera className="w-4 h-4 mb-0.5 text-blue-400" />
                  <span className="text-[8px] font-bold">Change</span>
                </div>
              </button>

              <div className="min-w-0 flex-1 space-y-1.5">
                <p className="text-[11px] text-muted-foreground leading-snug">
                  Upload a photo of this storefront or location (PNG, JPG, WebP up to 5MB).
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-[11px] font-bold cursor-pointer transition-colors"
                  >
                    <FiUploadCloud className="w-3.5 h-3.5" />
                    <span>{imagePreview ? 'Change Photo' : 'Upload Photo'}</span>
                  </button>
                  {selectedFile && (
                    <button
                      type="button"
                      onClick={handleResetImage}
                      className="text-[11px] text-rose-500 hover:text-rose-600 font-bold px-2 py-1 cursor-pointer"
                    >
                      Revert
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="sm:col-span-5 space-y-1.5">
              <label className="block font-bold text-muted-foreground">Branch Accent Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  name="color"
                  value={formData.color || '#2b5ce6'}
                  onChange={handleChange}
                  className="w-9 h-9 p-0.5 rounded-xl border border-border bg-card cursor-pointer shrink-0"
                />
                <input
                  type="text"
                  name="color"
                  value={formData.color}
                  onChange={handleChange}
                  placeholder="#2b5ce6"
                  className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-mono uppercase text-xs"
                />
              </div>
              <div className="flex items-center gap-1.5 pt-0.5">
                {COLOR_SWATCHES.map(sw => (
                  <button
                    key={sw}
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, color: sw }))}
                    title={`Select ${sw}`}
                    className={`w-5 h-5 rounded-full border transition-transform cursor-pointer ${
                      formData.color === sw ? 'scale-110 ring-2 ring-primary ring-offset-1 border-white' : 'border-border opacity-80 hover:opacity-100'
                    }`}
                    style={{ backgroundColor: sw }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: Branch Name, Location & Contact */}
        <div className="p-3.5 rounded-2xl bg-card border border-border space-y-3">
          <div className="border-b border-border pb-2">
            <h4 className="font-bold text-foreground text-xs uppercase tracking-wider">
              2. Branch Name, Location & Contact Details
            </h4>
            <p className="text-[10px] text-muted-foreground">
              Configure the official branch name, city, display location, contact hotline, and assigned manager.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-muted-foreground mb-1">Branch Name *</label>
              <input
                required
                name="name"
                value={formData.name || ''}
                onChange={handleChange}
                placeholder="e.g. Cagayan de Oro Branch"
                className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-semibold"
              />
            </div>

            <div>
              <label className="block font-bold text-muted-foreground mb-1 flex items-center gap-1">
                <FiPhone className="w-3 h-3 text-emerald-500" /> Contact #
              </label>
              <input
                name="contact_number"
                value={formData.contact_number || ''}
                onChange={handleChange}
                placeholder="e.g. 09631090031"
                className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-mono font-semibold"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-muted-foreground mb-1 flex items-center gap-1">
                <FiMapPin className="w-3 h-3 text-primary" /> City / Municipality
              </label>
              <input
                name="city"
                value={formData.city || ''}
                onChange={handleChange}
                placeholder="e.g. Cagayan de Oro City"
                className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-semibold"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-bold text-muted-foreground">Display Location Label</label>
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, location: (prev.city || '').trim() }))}
                  className="text-[10px] font-bold text-primary hover:underline cursor-pointer"
                >
                  Sync from City
                </button>
              </div>
              <input
                name="location"
                value={formData.location || ''}
                onChange={handleChange}
                placeholder="e.g. Carmen, Cagayan de Oro City"
                className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-semibold"
              />
            </div>
          </div>

          <div>
            <label className="block font-bold text-muted-foreground mb-1 flex items-center gap-1">
              <FiUser className="w-3 h-3 text-primary" /> Store Manager
            </label>
            <select
              name="manager_id"
              value={formData.manager_id || ''}
              onChange={handleChange}
              className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-semibold"
            >
              <option value="">Select a Store Manager...</option>
              {admins.map(admin => {
                const empName = admin.employee
                  ? `${admin.employee.first_name || ''} ${admin.employee.last_name || ''}`.trim()
                  : (admin.full_name || admin.username)
                return (
                  <option key={admin.user_id} value={String(admin.user_id)}>
                    {empName} ({admin.username})
                  </option>
                )
              })}
            </select>
          </div>
        </div>

        {/* Section 3: Branch Profile Description & Services Offered */}
        <div className="p-3.5 rounded-2xl bg-card border border-border space-y-2.5">
          <div className="flex items-center justify-between">
            <div>
              <label className="block font-bold text-foreground text-xs uppercase tracking-wider">
                3. Branch Profile Description & Services Offered
              </label>
              <p className="text-[10px] text-muted-foreground">
                Describe showroom capabilities, delivery coverage, installment desk availability, and customer support.
              </p>
            </div>
            <span className="text-[10px] font-mono text-muted-foreground">
              {(formData.description || '').length}/1000
            </span>
          </div>

          <textarea
            rows={2}
            maxLength={1000}
            name="description"
            value={formData.description || ''}
            onChange={handleChange}
            placeholder="Describe this branch's showroom offerings, delivery coverage, and customer services..."
            className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground leading-relaxed"
          />

          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
              Quick Service Templates (Click to Apply):
            </span>
            <div className="flex flex-wrap gap-1.5">
              {SERVICE_TEMPLATES.map((tpl, idx) => (
                <button
                  key={`edit-branch-tpl-${idx}`}
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, description: tpl }))}
                  className="px-2.5 py-1 rounded-lg bg-muted/50 hover:bg-muted border border-border text-[10px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer text-left truncate max-w-full"
                >
                  + {tpl}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="pt-3 flex items-center justify-between gap-3 border-t border-border">
          {onDelete ? (
            <button
              type="button"
              onClick={onDelete}
              className="px-3.5 py-2 text-xs font-bold text-rose-600 bg-rose-500/10 hover:bg-rose-500/20 rounded-xl flex items-center gap-1.5 cursor-pointer"
              disabled={loading}
            >
              <FiTrash2 className="w-3.5 h-3.5" />
              <span>Delete Branch</span>
            </button>
          ) : <div />}

          <div className="flex items-center gap-3 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-1 px-4 py-2 text-xs font-bold text-foreground bg-card hover:bg-muted border border-border rounded-xl cursor-pointer"
              disabled={loading}
            >
              <FiX className="w-3.5 h-3.5" />
              <span>Cancel</span>
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-primary-foreground bg-primary hover:bg-primary/90 rounded-xl flex items-center gap-2 cursor-pointer disabled:opacity-50"
              disabled={loading}
            >
              <FiCheckCircle className="w-3.5 h-3.5" />
              <span>{loading ? 'Saving...' : 'Save Changes'}</span>
            </button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
