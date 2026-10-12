import React, { useState, useEffect } from 'react'
import { FiX, FiSave, FiUploadCloud } from 'react-icons/fi'
import { showLoading, closeLoading, showSuccess, showError } from '../lib/swal'
import { api, STORAGE_BASE } from '../lib/api'
import { useAuth } from '../context/AuthContext'

export default function CompanyConfigurationModal({ isOpen, onClose, onSave, currentSettings }) {
  const { user } = useAuth()
  const isStoreAdmin = user?.role === 'Store Administrator' || user?.role === 'Store Admin'
  const [formData, setFormData] = useState({
    company_name: '',
    branch_name: '',
    address: '',
    phone: '',
    email: '',
    currency: 'PHP',
    date_format: 'YYYY-MM-DD',
    timezone: 'Asia/Manila',
    attendance_cutoff: '08:00',
    tax_id: '',
    web_links: ''
  })
  const [logoFile, setLogoFile] = useState(null)
  const [logoPreview, setLogoPreview] = useState(null)

  useEffect(() => {
    if (isOpen) {
      if (currentSettings) {
        setFormData({
          company_name: currentSettings.company_name || 'PROJECT: PACE Z-LICZ',
          branch_name: currentSettings.branch_name || user?.employee?.branch?.name || 'C-LICZ CDO',
          address: (isStoreAdmin && user?.employee?.branch?.location) ? user.employee.branch.location : (currentSettings.address || ''),
          phone: (isStoreAdmin && user?.employee?.branch?.contact_number) ? user.employee.branch.contact_number : (currentSettings.phone || ''),
          email: currentSettings.email || '',
          currency: currentSettings.currency || 'PHP',
          date_format: currentSettings.date_format || 'YYYY-MM-DD',
          timezone: currentSettings.timezone || 'Asia/Manila',
          attendance_cutoff: currentSettings.attendance_cutoff || '08:00',
          tax_id: currentSettings.tax_id || '',
          web_links: currentSettings.web_links || ''
        })
        if (currentSettings.logo) {
          setLogoPreview(`${STORAGE_BASE}${currentSettings.logo}`)
        }
      } else {
        loadSettings()
      }
    }
  }, [isOpen, currentSettings])

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
        setFormData({
          company_name: res.company_name || 'PROJECT: PACE Z-LICZ',
          branch_name: branchData?.name || res.branch_name || user?.employee?.branch?.name || 'C-LICZ CDO',
          address: (isStoreAdmin && branchData?.location) ? branchData.location : (res.address || user?.employee?.branch?.location || ''),
          phone: (isStoreAdmin && branchData?.contact_number) ? branchData.contact_number : (res.phone || user?.employee?.branch?.contact_number || ''),
          email: res.email || '',
          currency: res.currency || 'PHP',
          date_format: res.date_format || 'YYYY-MM-DD',
          timezone: res.timezone || 'Asia/Manila',
          attendance_cutoff: res.attendance_cutoff || '08:00',
          tax_id: res.tax_id || '',
          web_links: res.web_links || ''
        })
        if (res.logo) {
          setLogoPreview(`${STORAGE_BASE}${res.logo}`)
        }
      }
    } catch (error) {
      console.error('Error loading settings:', error)
    }
  }

  const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (file) {
      setLogoFile(file)
      const reader = new FileReader()
      reader.onloadend = () => {
        setLogoPreview(reader.result)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    showLoading('Saving settings...')

    try {
      const payload = new FormData()

      if (isStoreAdmin) {
        payload.append('branch_name', formData.branch_name || '')
        payload.append('address', formData.address || '')
        payload.append('phone', formData.phone || '')

        // Also update the Store Admin's specific branch profile in database
        const branchId = user?.employee?.branch_id || user?.branch_id
        if (branchId) {
          try {
            const branchPayload = new FormData()
            branchPayload.append('name', formData.branch_name || '')
            if (formData.address) branchPayload.append('location', formData.address)
            if (formData.phone) branchPayload.append('contact_number', formData.phone)
            await api.branches.update(branchId, branchPayload)
          } catch (branchErr) {
            console.warn('Direct branch sync error (handled by backend settings):', branchErr)
          }
        }
      } else {
        Object.keys(formData).forEach(key => {
          if (formData[key] !== null && formData[key] !== undefined) {
            payload.append(key, formData[key])
          }
        })

        if (logoFile) {
          payload.append('logo', logoFile)
        }
      }

      const res = await api.system.saveSettings(payload)

      closeLoading()

      if (res && res.message) {
        showSuccess('Settings Saved', isStoreAdmin ? 'Branch configuration updated successfully' : 'Company configuration updated successfully')
        if (onSave) onSave()
        onClose()
      }
    } catch (error) {
      closeLoading()
      showError('Save Failed', error.message || 'Could not save settings')
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-card rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-xl font-bold text-foreground">
            {isStoreAdmin ? 'Branch Configuration' : 'Company Configuration'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-muted-foreground hover:text-foreground rounded-full hover:bg-muted transition-colors"
          >
            <FiX className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[70vh]">
          <form id="configForm" onSubmit={handleSubmit} className="space-y-6">

            {/* Logo Section - Admin Only */}
            {!isStoreAdmin && (
              <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-border rounded-2xl bg-muted/50">
                <div className="mb-4 relative group">
                  {logoPreview ? (
                    <img src={logoPreview} alt="Logo" className="w-24 h-24 object-contain bg-white rounded-xl shadow-sm border border-slate-200" />
                  ) : (
                    <div className="w-24 h-24 rounded-xl bg-card border border-border flex items-center justify-center text-slate-400 shadow-sm">
                      No Logo
                    </div>
                  )}
                  <label className="absolute inset-0 flex items-center justify-center bg-black/50 text-white rounded-xl opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity">
                    <FiUploadCloud className="w-6 h-6" />
                    <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                  </label>
                </div>
                <p className="text-sm font-medium text-muted-foreground">Company Logo</p>
              </div>
            )}

            <div className="grid grid-cols-1 gap-5">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-foreground">
                  {isStoreAdmin ? 'Branch Name' : 'Company Name'}
                </label>
                <input
                  type="text"
                  value={isStoreAdmin ? formData.branch_name : formData.company_name}
                  onChange={e => {
                    const val = e.target.value
                    setFormData(prev => ({
                      ...prev,
                      [isStoreAdmin ? 'branch_name' : 'company_name']: val
                    }))
                  }}
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-card text-foreground focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                  placeholder={isStoreAdmin ? 'e.g. C-LICZ CDO' : 'e.g. PROJECT: PACE Z-LICZ'}
                />
              </div>

              {!isStoreAdmin && (
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-foreground">Tax ID / TIN</label>
                  <input
                    type="text"
                    value={formData.tax_id}
                    onChange={e => setFormData({ ...formData, tax_id: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-border bg-card text-foreground focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                    placeholder="000-000-000"
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-foreground">Address</label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={e => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-card text-foreground focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                  placeholder="Full business address"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-foreground">Phone</label>
                <input
                  type="text"
                  value={formData.phone}
                  onChange={e => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-card text-foreground focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                  placeholder="+63 900 000 0000"
                />
              </div>

              {!isStoreAdmin && (
                <>
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-foreground">Email</label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={e => setFormData({ ...formData, email: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-xl border border-border bg-card text-foreground focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                      placeholder="contact@clicz.com"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-foreground">Currency</label>
                    <input
                      type="text"
                      value={formData.currency}
                      onChange={e => setFormData({ ...formData, currency: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-xl border border-border bg-card text-foreground focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                      placeholder="PHP"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-foreground">Attendance Cutoff Time</label>
                    <input
                      type="time"
                      value={formData.attendance_cutoff}
                      onChange={e => setFormData({ ...formData, attendance_cutoff: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-xl border border-border bg-card text-foreground focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                    />
                  </div>
                </>
              )}
            </div>

          </form>
        </div>

        <div className="p-6 border-t border-border bg-slate-50 dark:bg-slate-800/30 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl font-bold text-muted-foreground bg-card border border-border hover:bg-muted/50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="configForm"
            className="px-6 py-2.5 rounded-xl font-bold text-white bg-[#007aff] hover:bg-[#0062cc] shadow-sm hover:shadow transition-all flex items-center gap-2"
          >
            <FiSave className="w-4 h-4" /> Save Settings
          </button>
        </div>
      </div>
    </div>
  )
}
