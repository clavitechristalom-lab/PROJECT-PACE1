import React, { useState, useEffect, useRef } from 'react'
import { FiX, FiSave, FiUploadCloud, FiClock, FiTrash2 } from 'react-icons/fi'
import { showLoading, closeLoading, showSuccess, showError } from '../lib/swal'
import { api, STORAGE_BASE } from '../lib/api'
import { triggerDataSync } from '../lib/realtimeSync'
import { useAuth } from '../context/AuthContext'

export const resolveLogoUrl = (logo) => {
  if (!logo) return null
  if (logo.startsWith('blob:') || logo.startsWith('data:') || logo.startsWith('http://') || logo.startsWith('https://')) return logo
  const path = logo.startsWith('/') ? logo : (logo.startsWith('storage/') ? `/${logo}` : `/storage/${logo}`)
  return `${STORAGE_BASE || 'http://localhost:8000'}${path}`
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
  web_links: ''
}

export default function CompanyConfigurationModal({ isOpen, onClose, onSave, currentSettings }) {
  const { user } = useAuth()
  const isStoreAdmin = user?.role === 'Store Administrator' || user?.role === 'Store Admin'
  
  const [formData, setFormData] = useState(INITIAL_FORM_DATA)
  const [logoFile, setLogoFile] = useState(null)
  const [logoPreview, setLogoPreview] = useState(null)
  const isInitializedRef = useRef(false)

  // Initialize state only when modal opens, avoiding resets on parent re-renders/polls
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
        const empBranchName = (typeof empBranch === 'object' ? empBranch?.name : empBranch) || ''
        const empBranchLocation = (typeof empBranch === 'object' ? empBranch?.location : '') || ''
        const empBranchContact = (typeof empBranch === 'object' ? empBranch?.contact_number : '') || ''

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
          web_links: currentSettings.web_links || ''
        })
        setLogoPreview(resolveLogoUrl(currentSettings.logo_url || currentSettings.logo))
      } else {
        loadSettings()
      }
    }
  }, [isOpen])

  const loadSettings = async () => {
    try {
      const res = await api.system.getSettings()
      let branchData = null
      const branchId = user?.employee?.branch_id || user?.branch_id
      if (isStoreAdmin && branchId) {
        try {
          const bRes = await api.branches.getById(branchId)
          if (bRes && bRes.branch) branchData = bRes.branch
        } catch (e) {
          console.warn('Could not load specific branch details:', e)
        }
      }

      if (res) {
        const empBranch = user?.employee?.branch
        const empBranchName = (typeof empBranch === 'object' ? empBranch?.name : empBranch) || ''
        const empBranchLocation = (typeof empBranch === 'object' ? empBranch?.location : '') || ''
        const empBranchContact = (typeof empBranch === 'object' ? empBranch?.contact_number : '') || ''

        setFormData({
          company_name: res.company_name || res.name || 'PROJECT: PACE Z-LICZ',
          name: res.name || res.company_name || 'PROJECT: PACE Z-LICZ',
          branch_name: branchData?.name || res.branch_name || empBranchName,
          tax_id: res.tax_id || '',
          address: (isStoreAdmin && branchData?.location) ? branchData.location : (res.address || empBranchLocation),
          phone: (isStoreAdmin && branchData?.contact_number) ? branchData.contact_number : (res.phone || empBranchContact),
          email: res.email || '',
          currency: res.currency || 'PHP',
          attendance_cutoff: res.attendance_cutoff || res.cutoff_time || '08:00',
          cutoff_time: res.cutoff_time || res.attendance_cutoff || '08:00',
          date_format: res.date_format || 'YYYY-MM-DD',
          timezone: res.timezone || 'Asia/Manila (GMT+8)',
          web_links: res.web_links || ''
        })
        setLogoPreview(resolveLogoUrl(res.logo_url || res.logo))
      }
    } catch (error) {
      console.error('Error loading settings:', error)
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

    // Validate file type
    if (!file.type.startsWith('image/')) {
      showError('Invalid File Type', 'Please upload a valid image file (PNG, JPG, SVG, WebP, etc.).')
      return
    }

    setLogoFile(file)
    setLogoPreview(URL.createObjectURL(file))
  }

  const handleResetLogo = () => {
    setLogoFile(null)
    setLogoPreview(resolveLogoUrl(currentSettings?.logo_url || currentSettings?.logo))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    // Frontend validation
    if (!isStoreAdmin && !formData.company_name?.trim()) {
      showError('Validation Error', 'Company Name is required.')
      return
    }

    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
      showError('Validation Error', 'Please enter a valid email address (e.g. contact@clicz.com).')
      return
    }

    showLoading('Saving settings...')

    try {
      const payload = new FormData()

      const companyNameVal = (formData.company_name || formData.name || '').trim()
      payload.append('company_name', companyNameVal)
      payload.append('name', companyNameVal)
      payload.append('tax_id', (formData.tax_id || '').trim())
      payload.append('address', (formData.address || '').trim())
      payload.append('phone', (formData.phone || '').trim())
      payload.append('email', (formData.email || '').trim())
      payload.append('currency', (formData.currency || 'PHP').trim())

      const cutoffVal = (formData.attendance_cutoff || formData.cutoff_time || '08:00').trim()
      payload.append('attendance_cutoff', cutoffVal)
      payload.append('cutoff_time', cutoffVal)

      payload.append('date_format', formData.date_format || 'YYYY-MM-DD')
      payload.append('timezone', formData.timezone || 'Asia/Manila (GMT+8)')
      payload.append('web_links', formData.web_links || '')

      if (isStoreAdmin) {
        payload.append('branch_name', (formData.branch_name || '').trim())
        const branchId = user?.employee?.branch_id || user?.branch_id
        if (branchId) {
          payload.append('branch_id', branchId)
        }
      }

      if (logoFile instanceof File) {
        payload.append('logo', logoFile)
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

      onClose()
    } catch (error) {
      closeLoading()
      showError('Save Failed', error.message || 'Could not save settings.')
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-card rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200 border border-border">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-xl font-bold text-foreground">
            {isStoreAdmin ? 'Branch Configuration' : 'Company Configuration'}
          </h2>
          <button
            onClick={onClose}
            type="button"
            className="p-2 text-muted-foreground hover:text-foreground rounded-full hover:bg-muted transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <FiX className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto max-h-[75vh]">
          <form id="configForm" onSubmit={handleSubmit} className="space-y-5">

            {/* Logo Section - Admin Only */}
            {!isStoreAdmin && (
              <div className="flex flex-col items-center justify-center p-5 border-2 border-dashed border-border rounded-2xl bg-muted/30">
                <div className="relative group">
                  <label className="w-24 h-24 rounded-2xl bg-card border border-border flex flex-col items-center justify-center shadow-xs cursor-pointer overflow-hidden transition-all hover:border-primary/50 block">
                    {logoPreview ? (
                      <img src={logoPreview} alt="Logo" className="w-full h-full object-contain p-2" />
                    ) : (
                      <div className="text-slate-400 font-medium text-sm flex flex-col items-center justify-center h-full">
                        No Logo
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/60 text-white flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl">
                      <FiUploadCloud className="w-6 h-6 mb-1 text-blue-400" />
                      <span className="text-[10px] font-semibold tracking-wide">Upload Logo</span>
                    </div>
                    <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                  </label>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <p className="text-sm font-medium text-muted-foreground">Company Logo</p>
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
            )}

            <div className="grid grid-cols-1 gap-4">
              {/* Company / Branch Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  {isStoreAdmin ? 'Branch Name' : 'Company Name'}
                </label>
                <input
                  type="text"
                  name={isStoreAdmin ? 'branch_name' : 'company_name'}
                  value={isStoreAdmin ? (formData.branch_name || '') : (formData.company_name || '')}
                  onChange={(e) => setFormData({
                    ...formData,
                    [isStoreAdmin ? 'branch_name' : 'company_name']: e.target.value,
                    ...(isStoreAdmin ? {} : { name: e.target.value })
                  })}
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-card text-foreground focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm placeholder:text-muted-foreground/60"
                  placeholder={isStoreAdmin ? 'e.g. C-LICZ CDO' : 'PROJECT: PACE Z-LICZ'}
                />
              </div>

              {/* Tax ID / TIN */}
              {!isStoreAdmin && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Tax ID / TIN</label>
                  <input
                    type="text"
                    name="tax_id"
                    value={formData.tax_id || ''}
                    onChange={(e) => setFormData({ ...formData, tax_id: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-border bg-card text-foreground focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm placeholder:text-muted-foreground/60"
                    placeholder="000-000-000"
                  />
                </div>
              )}

              {/* Address */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Address</label>
                <input
                  type="text"
                  name="address"
                  value={formData.address || ''}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-card text-foreground focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm placeholder:text-muted-foreground/60"
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
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value.replace(/\D/g, '').slice(0, 11) })}
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-card text-foreground focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm font-mono placeholder:text-muted-foreground/60"
                  placeholder="09XXXXXXXXX"
                />
              </div>

              {/* Email, Currency, Attendance Cutoff */}
              {!isStoreAdmin && (
                <>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">Email</label>
                    <input
                      type="email"
                      name="email"
                      value={formData.email || ''}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-xl border border-border bg-card text-foreground focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm placeholder:text-muted-foreground/60"
                      placeholder="contact@clicz.com"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">Currency</label>
                    <input
                      type="text"
                      name="currency"
                      value={formData.currency || ''}
                      onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-xl border border-border bg-card text-foreground focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm placeholder:text-muted-foreground/60"
                      placeholder="PHP"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">Attendance Cutoff Time</label>
                    <div className="relative">
                      <input
                        type="time"
                        name="attendance_cutoff"
                        value={formData.attendance_cutoff || ''}
                        onChange={(e) => setFormData({ ...formData, attendance_cutoff: e.target.value, cutoff_time: e.target.value })}
                        className="w-full px-4 py-2.5 pr-10 rounded-xl border border-border bg-card text-foreground focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm cursor-pointer"
                      />
                      <FiClock className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                    </div>
                  </div>
                </>
              )}
            </div>

          </form>
        </div>

        {/* Modal Footer */}
        <div className="p-6 border-t border-border bg-slate-50 dark:bg-slate-800/30 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl font-bold text-muted-foreground bg-card border border-border hover:bg-muted/50 transition-colors cursor-pointer text-sm"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="configForm"
            className="px-6 py-2.5 rounded-xl font-bold text-white bg-[#007aff] hover:bg-[#0062cc] shadow-sm hover:shadow transition-all flex items-center gap-2 cursor-pointer text-sm active:scale-[0.99]"
          >
            <FiSave className="w-4 h-4" /> Save Settings
          </button>
        </div>
      </div>
    </div>
  )
}
