import React, { useState, useEffect } from 'react'
import { FiX, FiSave, FiUploadCloud } from 'react-icons/fi'
import { showLoading, closeLoading, showSuccess, showError } from '../lib/swal'
import { api, STORAGE_BASE } from '../lib/api'

export default function CompanyConfigurationModal({ isOpen, onClose, onSave, currentSettings }) {
  const [formData, setFormData] = useState({
    company_name: '',
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
          company_name: currentSettings.company_name || '',
          address: currentSettings.address || '',
          phone: currentSettings.phone || '',
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
      if (res) {
        setFormData({
          company_name: res.company_name || '',
          address: res.address || '',
          phone: res.phone || '',
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
      Object.keys(formData).forEach(key => {
        payload.append(key, formData[key])
      })
      
      if (logoFile) {
        payload.append('logo', logoFile)
      }

      const res = await api.system.saveSettings(payload)
      closeLoading()
      
      if (res && res.message) {
        showSuccess('Settings Saved', 'Company configuration updated successfully')
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
      <div className="relative bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            Company Configuration
          </h2>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <FiX className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[70vh]">
          <form id="configForm" onSubmit={handleSubmit} className="space-y-6">
            
            {/* Logo Section */}
            <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl bg-slate-50 dark:bg-slate-800/50">
              <div className="mb-4 relative group">
                {logoPreview ? (
                  <img src={logoPreview} alt="Logo" className="w-24 h-24 object-contain bg-white rounded-xl shadow-sm border border-slate-200" />
                ) : (
                  <div className="w-24 h-24 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-400 shadow-sm">
                    No Logo
                  </div>
                )}
                <label className="absolute inset-0 flex items-center justify-center bg-black/50 text-white rounded-xl opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity">
                  <FiUploadCloud className="w-6 h-6" />
                  <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                </label>
              </div>
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Company Logo</p>
            </div>

            <div className="grid grid-cols-1 gap-5">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Company Name</label>
                <input 
                  type="text" 
                  value={formData.company_name}
                  onChange={e => setFormData({...formData, company_name: e.target.value})}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                  placeholder="e.g. Z-LICZ Enterprises"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Tax ID / TIN</label>
                <input 
                  type="text" 
                  value={formData.tax_id}
                  onChange={e => setFormData({...formData, tax_id: e.target.value})}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                  placeholder="000-000-000"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Address</label>
                <input 
                  type="text" 
                  value={formData.address}
                  onChange={e => setFormData({...formData, address: e.target.value})}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                  placeholder="Full business address"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Phone</label>
                <input 
                  type="text" 
                  value={formData.phone}
                  onChange={e => setFormData({...formData, phone: e.target.value})}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                  placeholder="+63 900 000 0000"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Email</label>
                <input 
                  type="email" 
                  value={formData.email}
                  onChange={e => setFormData({...formData, email: e.target.value})}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                  placeholder="contact@company.com"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Currency</label>
                <input 
                  type="text" 
                  value={formData.currency}
                  onChange={e => setFormData({...formData, currency: e.target.value})}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                  placeholder="PHP"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Attendance Cutoff Time</label>
                <input 
                  type="time" 
                  value={formData.attendance_cutoff}
                  onChange={e => setFormData({...formData, attendance_cutoff: e.target.value})}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                />
              </div>
            </div>

          </form>
        </div>

        <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30 flex justify-end gap-3">
          <button 
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl font-bold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
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
