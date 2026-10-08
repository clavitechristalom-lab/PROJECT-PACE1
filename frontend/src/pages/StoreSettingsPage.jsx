import { useState, useEffect } from 'react'
import {
  FiBriefcase, FiMapPin, FiPhone, FiImage, FiSettings, FiCheck, FiSave
} from 'react-icons/fi'
import {
  Btn, Input, Card, PageHeader, showToast, showLoading, closeLoading, TabBar, ErrorAlert, Spinner
} from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'

export default function StoreSettingsPage() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('details')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [branchId, setBranchId] = useState(null)
  
  const [settings, setSettings] = useState({
    name: '',
    location: '',
    contact_number: '',
    color: '#2563eb',
    image_url: ''
  })
  const [logoFile, setLogoFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchBranchDetails()
  }, [])

  const fetchBranchDetails = async () => {
    setLoading(true)
    try {
      // Assuming user object has employee.branch_id or we need to fetch the branch tied to the Store Admin
      const branch_id = user?.employee?.branch_id || user?.branch_id
      if (!branch_id) {
        throw new Error("No branch associated with this Store Admin account.")
      }
      setBranchId(branch_id)
      const data = await api.branches.getById(branch_id)
      if (data && data.branch) {
        setSettings({
          name: data.branch.name || '',
          location: data.branch.location || '',
          contact_number: data.branch.contact_number || '',
          color: data.branch.color || '#2563eb',
          image_url: data.branch.image_url || ''
        })
        if (data.branch.image_url) {
          setPreviewUrl(
            data.branch.image_url.startsWith('http') 
              ? data.branch.image_url 
              : `http://localhost:8000${data.branch.image_url}`
          )
        }
      }
    } catch (err) {
      console.error(err)
      setError(err.message || 'Failed to load store settings.')
    } finally {
      setLoading(false)
    }
  }

  const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (file) {
      setLogoFile(file)
      setPreviewUrl(URL.createObjectURL(file))
    }
  }

  const handleSave = async (e) => {
    e.preventDefault()
    if (!branchId) return
    
    setSaving(true)
    showLoading('Saving store settings...')
    try {
      const formData = new FormData()
      formData.append('_method', 'PUT')
      formData.append('name', settings.name)
      formData.append('location', settings.location)
      formData.append('contact_number', settings.contact_number)
      formData.append('color', settings.color)
      
      if (logoFile) {
        formData.append('image', logoFile)
      }

      await api.branches.update(branchId, formData)
      
      showToast('Store settings updated successfully', 'success')
      fetchBranchDetails()
    } catch (err) {
      showToast(err.message || 'Failed to update store settings', 'error')
    } finally {
      setSaving(false)
      closeLoading()
    }
  }

  const tabs = [
    { id: 'details', label: 'Store Details', icon: <FiBriefcase className="w-3.5 h-3.5" /> },
    { id: 'preferences', label: 'Preferences', icon: <FiSettings className="w-3.5 h-3.5" /> }
  ]

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <Spinner className="w-8 h-8 mb-4 text-primary" />
        <p className="text-sm">Loading store settings...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Store Settings"
        subtitle="Manage your branch profile and configurations"
      />

      {error && <ErrorAlert message={error} onRetry={fetchBranchDetails} />}

      <TabBar tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === 'details' && (
        <Card className="max-w-3xl border border-border">
          <form onSubmit={handleSave} className="space-y-6">
            <div className="flex flex-col sm:flex-row items-center gap-6 pb-6 border-b border-border">
              <div className="w-24 h-24 rounded-2xl bg-muted/50 border-2 border-dashed border-border flex items-center justify-center overflow-hidden shrink-0 relative group">
                {previewUrl ? (
                  <img src={previewUrl} alt="Store Cover" className="w-full h-full object-cover" />
                ) : (
                  <FiImage className="w-8 h-8 text-muted-foreground/50" />
                )}
                <label className="absolute inset-0 bg-black/50 text-white opacity-0 group-hover:opacity-100 flex items-center justify-center text-xs font-semibold cursor-pointer transition-opacity">
                  Upload Image
                  <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
                </label>
              </div>
              <div className="text-center sm:text-left">
                <h3 className="font-bold text-foreground text-lg">Store Display Image</h3>
                <p className="text-xs text-muted-foreground mt-1 mb-3">Upload a high-quality image representing your store branch. Recommended size: 800x600px.</p>
                <Btn
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => document.querySelector('input[type="file"]').click()}
                >
                  Choose File
                </Btn>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-xs font-bold text-foreground ml-1">Store / Branch Name</label>
                <div className="relative">
                  <FiBriefcase className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={settings.name}
                    onChange={(e) => setSettings({ ...settings, name: e.target.value })}
                    className="w-full pl-10 pr-4 py-2.5 bg-muted/40 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                    placeholder="Enter store name"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <label className="text-xs font-bold text-foreground ml-1">Location / Address</label>
                <div className="relative">
                  <FiMapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={settings.location}
                    onChange={(e) => setSettings({ ...settings, location: e.target.value })}
                    className="w-full pl-10 pr-4 py-2.5 bg-muted/40 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                    placeholder="Complete store address"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground ml-1">Contact Number</label>
                <div className="relative">
                  <FiPhone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={settings.contact_number}
                    onChange={(e) => setSettings({ ...settings, contact_number: e.target.value })}
                    className="w-full pl-10 pr-4 py-2.5 bg-muted/40 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                    placeholder="e.g. +63 912 345 6789"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground ml-1">Theme Color</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={settings.color}
                    onChange={(e) => setSettings({ ...settings, color: e.target.value })}
                    className="w-10 h-10 rounded-xl cursor-pointer bg-transparent border-0 p-0"
                  />
                  <input
                    type="text"
                    value={settings.color}
                    onChange={(e) => setSettings({ ...settings, color: e.target.value })}
                    className="flex-1 px-4 py-2.5 bg-muted/40 border border-border rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all uppercase"
                    placeholder="#HEXCODE"
                  />
                </div>
              </div>
            </div>

            <div className="pt-6 border-t border-border flex justify-end">
              <Btn type="submit" disabled={saving} className="flex items-center gap-2">
                <FiSave className="w-4 h-4" />
                {saving ? 'Saving Changes...' : 'Save Settings'}
              </Btn>
            </div>
          </form>
        </Card>
      )}

      {activeTab === 'preferences' && (
        <Card className="max-w-3xl border border-border">
          <div className="p-6 text-center text-muted-foreground space-y-3">
            <FiSettings className="w-12 h-12 mx-auto text-muted-foreground/30" />
            <h3 className="text-lg font-bold text-foreground">Advanced Preferences</h3>
            <p className="text-sm">Additional store configurations will be available in future updates.</p>
          </div>
        </Card>
      )}
    </div>
  )
}
