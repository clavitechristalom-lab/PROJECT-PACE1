import React, { useState, useEffect, useRef } from 'react'
import {
  FiX,
  FiSave,
  FiUploadCloud,
  FiClock,
  FiTrash2,
  FiMapPin,
  FiPhone,
  FiMail,
  FiGlobe,
  FiUsers,
  FiPackage,
  FiShoppingBag,
  FiUserCheck,
  FiSliders,
  FiShield
} from 'react-icons/fi'
import { showLoading, closeLoading, showSuccess, showError } from '../lib/swal'
import { api, STORAGE_BASE } from '../lib/api'
import { triggerDataSync } from '../lib/realtimeSync'
import { useAuth } from '../context/AuthContext'

export const resolveLogoUrl = (logo) => {
  if (!logo) return null
  if (logo.startsWith('blob:') || logo.startsWith('data:')) return logo
  if (logo.includes('/storage/')) return `${STORAGE_BASE}${logo.substring(logo.indexOf('/storage/'))}`
  if (logo.startsWith('http://') || logo.startsWith('https://')) return logo
  const path = logo.startsWith('/') ? logo : (logo.startsWith('storage/') ? `/${logo}` : `/storage/${logo}`)
  return `${STORAGE_BASE}${path}`
}

const INITIAL_FORM_DATA = {
  company_name: 'PROJECT: PACE Z-LICZ',
  name: 'PROJECT: PACE Z-LICZ',
  branch_name: '',
  tax_id: '',
  address: '',
  phone: '',
  email: '',
  currency: 'PHP',
  attendance_cutoff: '08:00',
  cutoff_time: '08:00',
  date_format: 'YYYY-MM-DD',
  timezone: 'Asia/Manila (GMT+8)',
  web_links: '',
  status: 'open'
}

export default function CompanyConfigurationModal({ isOpen, onClose, onSave, currentSettings }) {
  const { user } = useAuth()
  const isStoreAdmin = user?.role === 'Store Administrator' || user?.role === 'Store Admin'
  const branchId =
    user?.employee?.branch_id ||
    user?.branch_id ||
    (typeof user?.employee?.branch === 'object' ? user?.employee?.branch?.id : null)

  const [formData, setFormData] = useState(INITIAL_FORM_DATA)
  const [branchDetails, setBranchDetails] = useState(null)
  const [branchLoading, setBranchLoading] = useState(false)
  const [logoFile, setLogoFile] = useState(null)
  const [logoPreview, setLogoPreview] = useState(null)
  const isInitializedRef = useRef(false)

  // Initialize state when modal opens and always refresh live settings/branch details
  useEffect(() => {
    if (!isOpen) {
      isInitializedRef.current = false
      return
    }

    if (isOpen && !isInitializedRef.current) {
      isInitializedRef.current = true
      setLogoFile(null)

      if (currentSettings) {
        const empBranch = user?.employee?.branch
        const isBranchObj = empBranch && typeof empBranch === 'object'
        const empBranchName = (isBranchObj ? empBranch?.name : empBranch) || ''
        const empBranchLocation = (isBranchObj ? empBranch?.location : '') || ''
        const empBranchContact = (isBranchObj ? empBranch?.contact_number : '') || ''
        const empBranchStatus = (isBranchObj ? empBranch?.status : '') || 'open'
        const empBranchImg = isBranchObj ? empBranch?.image_url : null

        setFormData({
          company_name: currentSettings.company_name || currentSettings.name || 'PROJECT: PACE Z-LICZ',
          name: currentSettings.name || currentSettings.company_name || 'PROJECT: PACE Z-LICZ',
          branch_name: currentSettings.branch_name || empBranchName,
          tax_id: currentSettings.tax_id || '',
          address: (isStoreAdmin && empBranchLocation) ? empBranchLocation : (currentSettings.address || ''),
          phone: (isStoreAdmin && empBranchContact) ? empBranchContact : (currentSettings.phone || ''),
          email: currentSettings.email || '',
          currency: currentSettings.currency || 'PHP',
          attendance_cutoff: currentSettings.attendance_cutoff || currentSettings.cutoff_time || '08:00',
          cutoff_time: currentSettings.cutoff_time || currentSettings.attendance_cutoff || '08:00',
          date_format: currentSettings.date_format || 'YYYY-MM-DD',
          timezone: currentSettings.timezone || 'Asia/Manila (GMT+8)',
          web_links: currentSettings.web_links || '',
          status: empBranchStatus
        })
        setLogoPreview(
          isStoreAdmin
            ? resolveLogoUrl(empBranchImg)
            : resolveLogoUrl(currentSettings.logo_url || currentSettings.logo)
        )
      }

      loadSettings()
    }
  }, [isOpen])

  const loadSettings = async () => {
    if (isStoreAdmin && branchId) {
      setBranchLoading(true)
    }

    try {
      const [settingsResult, branchResult] = await Promise.allSettled([
        api.system.getSettings(),
        isStoreAdmin && branchId ? api.branches.getById(branchId) : Promise.resolve(null)
      ])

      const res = settingsResult.status === 'fulfilled' ? settingsResult.value : null
      const bRes = branchResult.status === 'fulfilled' ? branchResult.value : null
      const branchData = bRes?.branch || null

      if (branchData) {
        setBranchDetails(branchData)
      }

      const empBranch = user?.employee?.branch
      const isBranchObj = empBranch && typeof empBranch === 'object'
      const empBranchName = (isBranchObj ? empBranch?.name : empBranch) || ''
      const empBranchLocation = (isBranchObj ? empBranch?.location : '') || ''
      const empBranchContact = (isBranchObj ? empBranch?.contact_number : '') || ''

      setFormData((prev) => ({
        ...prev,
        company_name: res?.company_name || res?.name || prev.company_name || 'PROJECT: PACE Z-LICZ',
        name: res?.name || res?.company_name || prev.name || 'PROJECT: PACE Z-LICZ',
        branch_name: branchData?.name || res?.branch_name || empBranchName || prev.branch_name,
        tax_id: res?.tax_id ?? prev.tax_id ?? '',
        address: (isStoreAdmin && branchData?.location != null)
          ? branchData.location
          : (res?.address || empBranchLocation || prev.address || ''),
        phone: (isStoreAdmin && branchData?.contact_number != null)
          ? branchData.contact_number
          : (res?.phone || empBranchContact || prev.phone || ''),
        email: res?.email ?? prev.email ?? '',
        currency: res?.currency || prev.currency || 'PHP',
        attendance_cutoff: res?.attendance_cutoff || res?.cutoff_time || prev.attendance_cutoff || '08:00',
        cutoff_time: res?.cutoff_time || res?.attendance_cutoff || prev.cutoff_time || '08:00',
        date_format: res?.date_format || prev.date_format || 'YYYY-MM-DD',
        timezone: res?.timezone || prev.timezone || 'Asia/Manila (GMT+8)',
        web_links: res?.web_links ?? prev.web_links ?? '',
        status: branchData?.status || prev.status || 'open'
      }))

      if (isStoreAdmin) {
        if (branchData?.image_url) {
          setLogoPreview(resolveLogoUrl(branchData.image_url))
        }
      } else if (res) {
        setLogoPreview(resolveLogoUrl(res.logo_url || res.logo))
      }
    } catch (error) {
      console.error('Error loading settings:', error)
    } finally {
      setBranchLoading(false)
    }
  }

  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      showError('File Too Large', 'Please select an image smaller than 5MB.')
      return
    }

    // Validate file type (BranchController::update accepts jpeg, png, jpg, gif, webp)
    if (!file.type.startsWith('image/') || (isStoreAdmin && file.type === 'image/svg+xml')) {
      showError(
        'Invalid File Type',
        isStoreAdmin
          ? 'Please upload a valid raster image (PNG, JPG, GIF, or WebP).'
          : 'Please upload a valid image file (PNG, JPG, SVG, WebP, etc.).'
      )
      return
    }

    setLogoFile(file)
    setLogoPreview(URL.createObjectURL(file))
  }

  const handleResetLogo = () => {
    setLogoFile(null)
    if (isStoreAdmin) {
      const fallbackImg =
        branchDetails?.image_url ||
        (typeof user?.employee?.branch === 'object' ? user?.employee?.branch?.image_url : null)
      setLogoPreview(resolveLogoUrl(fallbackImg))
    } else {
      setLogoPreview(resolveLogoUrl(currentSettings?.logo_url || currentSettings?.logo))
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    // Frontend validation
    if (!isStoreAdmin && !formData.company_name?.trim()) {
      showError('Validation Error', 'Company Name is required.')
      return
    }

    if (isStoreAdmin && !formData.branch_name?.trim()) {
      showError('Validation Error', 'Branch Name is required.')
      return
    }

    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
      showError('Validation Error', 'Please enter a valid email address (e.g. contact@clicz.com).')
      return
    }

    showLoading('Saving settings...')

    try {
      // For Store Admin, update full BranchProfile first (cascades branch rename + image + status)
      if (isStoreAdmin && branchId) {
        const branchPayload = new FormData()
        branchPayload.append('name', (formData.branch_name || '').trim())
        branchPayload.append('location', (formData.address || '').trim())
        branchPayload.append('contact_number', (formData.phone || '').trim())
        branchPayload.append('status', formData.status || 'open')
        if (logoFile instanceof File) {
          branchPayload.append('image', logoFile)
        }

        const branchRes = await api.branches.update(branchId, branchPayload)
        if (branchRes?.branch) {
          setBranchDetails((prev) => ({ ...(prev || {}), ...branchRes.branch }))
        }
      }

      const payload = new FormData()
      payload.append('address', (formData.address || '').trim())
      payload.append('phone', (formData.phone || '').trim())
      payload.append('email', (formData.email || '').trim())
      payload.append('web_links', (formData.web_links || '').trim())

      if (isStoreAdmin) {
        payload.append('branch_name', (formData.branch_name || '').trim())
        if (branchId) {
          payload.append('branch_id', branchId)
        }
      } else {
        const companyNameVal = (formData.company_name || formData.name || '').trim()
        payload.append('company_name', companyNameVal)
        payload.append('name', companyNameVal)
        payload.append('tax_id', (formData.tax_id || '').trim())
        payload.append('currency', (formData.currency || 'PHP').trim())

        const cutoffVal = (formData.attendance_cutoff || formData.cutoff_time || '08:00').trim()
        payload.append('attendance_cutoff', cutoffVal)
        payload.append('cutoff_time', cutoffVal)

        payload.append('date_format', formData.date_format || 'YYYY-MM-DD')
        payload.append('timezone', formData.timezone || 'Asia/Manila (GMT+8)')

        if (logoFile instanceof File) {
          payload.append('logo', logoFile)
        }
      }

      const res = await api.system.saveSettings(payload)

      closeLoading()

      const updatedSettings = res?.settings || res?.data || res
      showSuccess('Settings Saved', isStoreAdmin ? 'Branch configuration updated successfully.' : 'Company configuration updated successfully.')

      if (onSave) {
        onSave(updatedSettings)
      }

      // Dispatch global system event so entire UI immediately updates in real-time
      window.dispatchEvent(new CustomEvent('system:settingsUpdated', { detail: updatedSettings }))
      triggerDataSync('system', { settings: updatedSettings })
      if (isStoreAdmin) {
        triggerDataSync('branches', { branchId })
      }

      onClose()
    } catch (error) {
      closeLoading()
      showError('Save Failed', error.message || 'Could not save settings.')
    }
  }

  if (!isOpen) return null

  const normalizedStatus = String(formData.status || 'open').toLowerCase()
  const isBranchOpen = normalizedStatus === 'open' || normalizedStatus === 'active'
  const branchMetrics = [
    { label: 'Employees', value: branchDetails?.employees_count, icon: FiUsers, colorClass: 'text-blue-600 bg-blue-500/10' },
    { label: 'Customers', value: branchDetails?.customers_count, icon: FiUserCheck, colorClass: 'text-emerald-600 bg-emerald-500/10' },
    { label: 'Products', value: branchDetails?.products_count, icon: FiPackage, colorClass: 'text-amber-600 bg-amber-500/10' },
    { label: 'Sales Records', value: branchDetails?.sales_count, icon: FiShoppingBag, colorClass: 'text-purple-600 bg-purple-500/10' }
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className={`relative bg-card rounded-2xl shadow-2xl w-full ${isStoreAdmin ? 'max-w-4xl' : 'max-w-3xl'} max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 border border-border`}>
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/20 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <h2 className="text-base font-bold text-foreground truncate">
              {isStoreAdmin ? 'Branch Configuration' : 'Company Configuration'}
            </h2>
            {isStoreAdmin && (branchDetails?.id || branchId) && (
              <span className="hidden sm:inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-muted text-muted-foreground border border-border">
                Branch #{branchDetails?.id || branchId}
              </span>
            )}
            {isStoreAdmin && (
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                  isBranchOpen
                    ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                    : 'bg-rose-500/10 text-rose-600 border border-rose-500/20'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${isBranchOpen ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                {isBranchOpen ? 'Open' : 'Closed'}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            type="button"
            className="p-2 text-muted-foreground hover:text-foreground rounded-xl hover:bg-muted transition-colors cursor-pointer shrink-0"
            aria-label="Close modal"
          >
            <FiX className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 sm:p-7 overflow-y-auto flex-1 space-y-6">
          <form id="configForm" onSubmit={handleSubmit} className="space-y-6">
            {isStoreAdmin ? (
              <>
                {/* Branch Overview Banner + Cover Image + Live Metrics */}
                <div className="rounded-2xl border border-border bg-muted/25 p-5 space-y-5 relative overflow-hidden">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
                    {/* Branch Cover Photo */}
                    <div className="flex flex-col items-center shrink-0">
                      <div className="relative group">
                        <label className="w-24 h-24 rounded-2xl bg-card border border-border flex flex-col items-center justify-center shadow-xs cursor-pointer overflow-hidden transition-all hover:border-primary/50 block">
                          {logoPreview ? (
                            <img src={logoPreview} alt="Branch Cover" className="w-full h-full object-cover" />
                          ) : (
                            <div className="text-slate-400 font-medium text-[11px] flex flex-col items-center justify-center h-full text-center px-2">
                              <FiUploadCloud className="w-5 h-5 mb-1 opacity-70" />
                              No Image
                            </div>
                          )}
                          <div className="absolute inset-0 bg-black/60 text-white flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl">
                            <FiUploadCloud className="w-5 h-5 mb-1 text-blue-400" />
                            <span className="text-[10px] font-semibold tracking-wide">Branch Cover</span>
                          </div>
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/jpg,image/gif,image/webp"
                            className="hidden"
                            onChange={handleFileChange}
                          />
                        </label>
                      </div>
                      {logoFile && (
                        <button
                          type="button"
                          onClick={handleResetLogo}
                          title="Revert selected cover image"
                          className="mt-1.5 text-xs text-rose-500 hover:text-rose-400 flex items-center gap-1 cursor-pointer font-medium"
                        >
                          <FiTrash2 className="w-3 h-3" /> Revert
                        </button>
                      )}
                    </div>

                    {/* Branch Identity Summary */}
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-bold text-foreground truncate">
                          {formData.branch_name || branchDetails?.name || 'Assigned Branch'}
                        </h3>
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                            isBranchOpen
                              ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                              : 'bg-rose-500/10 text-rose-600 border border-rose-500/20'
                          }`}
                        >
                          {isBranchOpen ? 'Open for Operations' : 'Closed / Maintenance'}
                        </span>
                      </div>

                      <div className="text-xs text-muted-foreground space-y-1">
                        <p className="flex items-center gap-1.5">
                          <FiShield className="w-3.5 h-3.5 text-primary shrink-0" />
                          <span>
                            Store Manager:{' '}
                            <strong className="text-foreground font-semibold">
                              {branchDetails?.manager_name || branchDetails?.manager || user?.username || 'Assigned Store Admin'}
                            </strong>
                            {branchDetails?.manager && branchDetails?.manager_name && branchDetails.manager !== branchDetails.manager_name
                              ? ` (@${branchDetails.manager})`
                              : ''}
                          </span>
                        </p>
                        {(branchDetails?.manager_phone || branchDetails?.manager_email) && (
                          <p className="text-[11px] text-muted-foreground/90 pl-5">
                            {[branchDetails?.manager_phone, branchDetails?.manager_email].filter(Boolean).join(' • ')}
                          </p>
                        )}
                        <p className="flex items-center gap-1.5">
                          <FiMapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <span className="truncate">{formData.address || 'No branch address configured yet'}</span>
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Live Branch Resource Metrics */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-border/70">
                    {branchMetrics.map(({ label, value, icon: Icon, colorClass }) => (
                      <div
                        key={label}
                        className="rounded-xl bg-card border border-border px-3.5 py-2.5 flex items-center gap-3"
                      >
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${colorClass}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[11px] font-medium text-muted-foreground truncate">{label}</p>
                          <p className="text-base font-bold text-foreground tabular-nums">
                            {branchLoading && value == null ? '—' : (value ?? 0).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Section 1: Branch Identity & Operations */}
                <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
                  <div className="flex items-center gap-2 border-b border-border pb-3">
                    <FiSliders className="w-4 h-4 text-primary" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
                      Branch Identity & Operations
                    </h4>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-foreground">
                        Branch Name <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        name="branch_name"
                        required
                        value={formData.branch_name || ''}
                        onChange={(e) => setFormData({ ...formData, branch_name: e.target.value })}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-card text-foreground focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm placeholder:text-muted-foreground/60"
                        placeholder="e.g. Z-Lics Iligan Branch"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-foreground">Operational Status</label>
                      <select
                        name="status"
                        value={isBranchOpen ? 'open' : 'closed'}
                        onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-card text-foreground focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm cursor-pointer"
                      >
                        <option value="open">Open — Active Operations</option>
                        <option value="closed">Closed — Maintenance / Offline</option>
                      </select>
                    </div>

                    <div className="space-y-1.5 sm:col-span-2">
                      <label className="text-xs font-semibold text-foreground">Full Branch Address</label>
                      <input
                        type="text"
                        name="address"
                        value={formData.address || ''}
                        onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-card text-foreground focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm placeholder:text-muted-foreground/60"
                        placeholder="Street, Barangay, City / Province"
                      />
                    </div>
                  </div>
                </div>

                {/* Section 2: Contact & Digital Channels */}
                <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
                  <div className="flex items-center gap-2 border-b border-border pb-3">
                    <FiPhone className="w-4 h-4 text-primary" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
                      Contact & Digital Channels
                    </h4>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-foreground">Phone / Hotline</label>
                      <div className="relative">
                        <input
                          type="tel"
                          maxLength={20}
                          name="phone"
                          value={formData.phone || ''}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              phone: e.target.value.replace(/[^0-9+\-\s()]/g, '').slice(0, 20)
                            })
                          }
                          className="w-full px-3.5 py-2.5 pr-9 rounded-xl border border-border bg-card text-foreground focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm font-mono placeholder:text-muted-foreground/60"
                          placeholder="0917-889-4512"
                        />
                        <FiPhone className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-foreground">Branch Email</label>
                      <div className="relative">
                        <input
                          type="email"
                          name="email"
                          value={formData.email || ''}
                          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                          className="w-full px-3.5 py-2.5 pr-9 rounded-xl border border-border bg-card text-foreground focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm placeholder:text-muted-foreground/60"
                          placeholder="branch@clicz.com"
                        />
                        <FiMail className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                      </div>
                    </div>

                    <div className="space-y-1.5 sm:col-span-2">
                      <label className="text-xs font-semibold text-foreground">Website / Store Portal Link</label>
                      <div className="relative">
                        <input
                          type="text"
                          name="web_links"
                          value={formData.web_links || ''}
                          onChange={(e) => setFormData({ ...formData, web_links: e.target.value })}
                          className="w-full px-3.5 py-2.5 pr-9 rounded-xl border border-border bg-card text-foreground focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm placeholder:text-muted-foreground/60"
                          placeholder="https://portal.clicz.com/branch"
                        />
                        <FiGlobe className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                      </div>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Logo Section - Admin Only */}
                <div className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-border rounded-2xl bg-muted/30">
                  <div className="relative group">
                    <label className="w-20 h-20 rounded-2xl bg-card border border-border flex flex-col items-center justify-center shadow-xs cursor-pointer overflow-hidden transition-all hover:border-primary/50 block">
                      {logoPreview ? (
                        <img src={logoPreview} alt="Logo" className="w-full h-full object-contain p-2" />
                      ) : (
                        <div className="text-slate-400 font-medium text-xs flex flex-col items-center justify-center h-full">
                          No Logo
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/60 text-white flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl">
                        <FiUploadCloud className="w-5 h-5 mb-1 text-blue-400" />
                        <span className="text-[10px] font-semibold tracking-wide">Upload Logo</span>
                      </div>
                      <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                    </label>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <p className="text-xs font-medium text-muted-foreground">Company Logo</p>
                    {logoFile && (
                      <button
                        type="button"
                        onClick={handleResetLogo}
                        title="Revert selected logo"
                        className="text-xs text-rose-500 hover:text-rose-400 flex items-center gap-1 cursor-pointer font-medium ml-1"
                      >
                        <FiTrash2 className="w-3 h-3" /> Revert
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Company Name */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">Company Name</label>
                    <input
                      type="text"
                      name="company_name"
                      value={formData.company_name || ''}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          company_name: e.target.value,
                          name: e.target.value
                        })
                      }
                      className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-card text-foreground focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm placeholder:text-muted-foreground/60"
                      placeholder="PROJECT: PACE Z-LICZ"
                    />
                  </div>

                  {/* Tax ID / TIN */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">Tax ID / TIN</label>
                    <input
                      type="text"
                      name="tax_id"
                      value={formData.tax_id || ''}
                      onChange={(e) => setFormData({ ...formData, tax_id: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-card text-foreground focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm placeholder:text-muted-foreground/60"
                      placeholder="000-000-000"
                    />
                  </div>

                  {/* Address */}
                  <div className="space-y-1.5 sm:col-span-2">
                    <label className="text-xs font-semibold text-foreground">Address</label>
                    <input
                      type="text"
                      name="address"
                      value={formData.address || ''}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-card text-foreground focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm placeholder:text-muted-foreground/60"
                      placeholder="Full business address"
                    />
                  </div>

                  {/* Phone */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">Phone</label>
                    <input
                      type="tel"
                      maxLength={11}
                      name="phone"
                      value={formData.phone || ''}
                      onChange={(e) =>
                        setFormData({ ...formData, phone: e.target.value.replace(/\D/g, '').slice(0, 11) })
                      }
                      className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-card text-foreground focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm font-mono placeholder:text-muted-foreground/60"
                      placeholder="09XXXXXXXXX"
                    />
                  </div>

                  {/* Email */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">Email</label>
                    <input
                      type="email"
                      name="email"
                      value={formData.email || ''}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-card text-foreground focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm placeholder:text-muted-foreground/60"
                      placeholder="contact@clicz.com"
                    />
                  </div>

                  {/* Currency */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">Currency</label>
                    <input
                      type="text"
                      name="currency"
                      value={formData.currency || ''}
                      onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-card text-foreground focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm placeholder:text-muted-foreground/60"
                      placeholder="PHP"
                    />
                  </div>

                  {/* Attendance Cutoff Time */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">Attendance Cutoff Time</label>
                    <div className="relative">
                      <input
                        type="time"
                        name="attendance_cutoff"
                        value={formData.attendance_cutoff || ''}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            attendance_cutoff: e.target.value,
                            cutoff_time: e.target.value
                          })
                        }
                        className="w-full px-3.5 py-2.5 pr-10 rounded-xl border border-border bg-card text-foreground focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm cursor-pointer"
                      />
                      <FiClock className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                    </div>
                  </div>
                </div>
              </>
            )}
          </form>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-border bg-muted/20 flex items-center justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl font-bold text-muted-foreground bg-card border border-border hover:bg-muted/50 transition-colors cursor-pointer text-sm"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="configForm"
            className="px-5 py-2.5 rounded-xl font-bold text-white bg-[#007aff] hover:bg-[#0062cc] shadow-sm hover:shadow transition-all flex items-center gap-2 cursor-pointer text-sm active:scale-[0.99]"
          >
            <FiSave className="w-4 h-4" /> Save Settings
          </button>
        </div>
      </div>
    </div>
  )
}
