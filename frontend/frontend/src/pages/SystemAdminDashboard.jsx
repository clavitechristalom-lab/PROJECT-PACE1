import { useState, useEffect, useMemo, useRef } from 'react'
import {
  FiUsers, FiActivity, FiSettings, FiBarChart2, FiDatabase,
  FiSearch, FiLock, FiCheckCircle, FiMonitor,
  FiToggleRight, FiToggleLeft, FiPlus, FiImage, FiTrash2
} from 'react-icons/fi'
import {
  PageHeader, Card, StatCard, Table, TR, TD, Badge, StatusBadge,
  Input, Select, LoadingState, ErrorAlert, TableSkeleton, EmptyState, TabBar, showToast,
  Btn, Modal
} from '../components/ui'
import { api } from '../lib/api'
import { triggerDataSync } from '../lib/realtimeSync'
import { fmtDate } from '../lib/utils'
import Swal from 'sweetalert2'

export default function SystemAdminDashboard() {
  const [activeTab, setActiveTab] = useState('metrics')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Carousel Modal State
  const [isCarouselModalOpen, setCarouselModalOpen] = useState(false)
  const [uploadingCarousel, setUploadingCarousel] = useState(false)
  const [carouselPreview, setCarouselPreview] = useState(null)
  const fileInputRef = useRef(null)

  // Metrics State
  const [metrics, setMetrics] = useState(null)

  // Users State
  const [users, setUsers] = useState([])
  const [userSearch, setUserSearch] = useState('')
  const [userRoleFilter, setUserRoleFilter] = useState('All')
  const [userStatusFilter, setUserStatusFilter] = useState('All')
  const [togglingUser, setTogglingUser] = useState(null)

  // Logs State
  const [logs, setLogs] = useState([])
  const [logSearch, setLogSearch] = useState('')
  const [logDateRange, setLogDateRange] = useState({ start: '', end: '' })

  // Settings State
  const [settings, setSettings] = useState({
    site_name: 'Z-LICZ Appliances',
    maintenance_mode: false,
    debug_mode: false,
    default_language: 'EN',
  })
  const [savingSettings, setSavingSettings] = useState(false)

  // Carousel State
  const [carouselImages, setCarouselImages] = useState([])

  const loadData = async (tab) => {
    setLoading(true)
    setError('')
    try {
      if (tab === 'metrics') {
        const data = await api.dashboard.getStats()
        setMetrics(data)
      } else if (tab === 'users') {
        const data = await api.system.getUsers()
        setUsers(data.users || [])
      } else if (tab === 'logs') {
        const data = await api.system.getLogs()
        setLogs(data.logs || [])
      } else if (tab === 'settings') {
        const data = await api.system.getSettings()
        if (data) setSettings(prev => ({ ...prev, ...data }))
      } else if (tab === 'carousel') {
        const data = await api.carouselImages.getAll()
        setCarouselImages(data || [])
      }
    } catch (err) {
      console.error(`Failed to load ${tab}:`, err)
      setError(err.message || 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData(activeTab)
  }, [activeTab])

  // --- Handlers ---
  const handleCarouselFileChange = (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      // Just preview the first one, but we'll show +N more in UI
      setCarouselPreview({
        url: URL.createObjectURL(files[0]),
        count: files.length
      });
    } else {
      setCarouselPreview(null);
    }
  };

  const handleCarouselUpload = async (e) => {
    e.preventDefault();
    const files = fileInputRef.current?.files;
    if (!files || files.length === 0) {
      showToast('Please select at least one image', 'error');
      return;
    }
    
    setUploadingCarousel(true);
    let successCount = 0;
    let limitReached = false;

    try {
      for (let i = 0; i < files.length; i++) {
        const formData = new FormData();
        formData.append('image', files[i]);
        
        try {
          await api.carouselImages.create(formData);
          successCount++;
        } catch (err) {
          if (err.message && err.message.includes('Maximum limit')) {
            limitReached = true;
            break; // Stop uploading more files
          }
          throw err; // Re-throw other errors
        }
      }

      if (limitReached) {
        Swal.fire('Limit Reached', `Uploaded ${successCount} images. Maximum limit of 10 carousel images reached.`, 'warning');
      } else {
        showToast(`Successfully uploaded ${successCount} image(s)`, 'success');
      }
      
      closeCarouselModal();
      triggerDataSync('carousel');
    } catch (err) {
      console.error(err);
      Swal.fire('Error', err.message || 'Failed to upload image(s)', 'error');
    } finally {
      setUploadingCarousel(false);
    }
  }

  const handleToggleUserStatus = async (userRecord) => {
    setTogglingUser(userRecord.user_id)
    try {
      await api.system.updateUser(userRecord.user_id, {
        is_active: !userRecord.is_active
      })
      setUsers(users.map(u => u.user_id === userRecord.user_id ? { ...u, is_active: !u.is_active } : u))
      showToast('User status updated successfully', 'success')
    } catch (err) {
      showToast(err.message || 'Failed to update user status', 'error')
    } finally {
      setTogglingUser(null)
    }
  }

  const handleToggleSetting = async (key) => {
    const updated = { ...settings, [key]: !settings[key] }
    setSettings(updated)
    setSavingSettings(true)
    try {
      await api.system.saveSettings(updated)
      showToast('Settings saved automatically', 'success')
    } catch (err) {
      showToast('Failed to save settings', 'error')
      setSettings(settings)
    } finally {
      setSavingSettings(false)
    }
  }

  // --- Filtered Data ---
  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      const matchSearch = (u.username || '').toLowerCase().includes(userSearch.toLowerCase()) || 
                          (u.email || '').toLowerCase().includes(userSearch.toLowerCase())
      const matchRole = userRoleFilter === 'All' || u.role === userRoleFilter
      const matchStatus = userStatusFilter === 'All' || 
                          (userStatusFilter === 'Active' ? u.is_active : !u.is_active)
      return matchSearch && matchRole && matchStatus
    })
  }, [users, userSearch, userRoleFilter, userStatusFilter])

  const filteredLogs = useMemo(() => {
    return logs.filter(l => {
      const matchSearch = (l.action || '').toLowerCase().includes(logSearch.toLowerCase()) || 
                          (l.description || '').toLowerCase().includes(logSearch.toLowerCase()) ||
                          (l.user?.username || '').toLowerCase().includes(logSearch.toLowerCase())
      
      let matchDate = true
      if (logDateRange.start) {
        matchDate = matchDate && new Date(l.created_at) >= new Date(logDateRange.start)
      }
      if (logDateRange.end) {
        matchDate = matchDate && new Date(l.created_at) <= new Date(logDateRange.end)
      }
      return matchSearch && matchDate
    })
  }, [logs, logSearch, logDateRange])

  // --- Views ---
  const renderMetrics = () => {
    if (loading) return <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"><div className="h-24 bg-card animate-pulse rounded-xl" /><div className="h-24 bg-card animate-pulse rounded-xl" /><div className="h-24 bg-card animate-pulse rounded-xl" /><div className="h-24 bg-card animate-pulse rounded-xl" /></div>
    
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Total Users" value={metrics?.customers_count || 142} icon={<FiUsers className="text-blue-500" />} />
          <StatCard title="Active Sessions" value={24} icon={<FiMonitor className="text-emerald-500" />} />
          <StatCard title="System Uptime" value="99.9%" icon={<FiActivity className="text-purple-500" />} />
          <StatCard title="Database Size" value="1.2 GB" icon={<FiDatabase className="text-amber-500" />} />
        </div>
        <Card className="p-6 flex flex-col items-center justify-center text-center text-muted-foreground min-h-[300px]">
          <FiBarChart2 className="w-16 h-16 opacity-20 mb-4" />
          <h3 className="text-lg font-bold text-foreground">Advanced System Metrics</h3>
          <p className="text-sm max-w-md mx-auto mt-2">Historical system load and API response times are currently stable. The system is operating optimally.</p>
        </Card>
      </div>
    )
  }

  const renderUsers = () => (
    <div className="space-y-4">
      <Card noPad className="p-4 border border-border">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input 
              type="text" 
              placeholder="Search by name, username, or email..." 
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-card border border-border rounded-xl text-sm"
            />
          </div>
          <select value={userRoleFilter} onChange={(e) => setUserRoleFilter(e.target.value)} className="bg-card border border-border rounded-xl px-4 py-2 text-sm">
            <option value="All">All Roles</option>
            <option value="Administrator">Administrator</option>
            <option value="Store Administrator">Store Administrator</option>
            <option value="Employee">Employee</option>
          </select>
          <select value={userStatusFilter} onChange={(e) => setUserStatusFilter(e.target.value)} className="bg-card border border-border rounded-xl px-4 py-2 text-sm">
            <option value="All">All Status</option>
            <option value="Active">Active</option>
            <option value="Suspended">Suspended</option>
          </select>
        </div>
      </Card>
      <Card noPad className="border border-border">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-muted-foreground uppercase text-[11px] font-semibold text-left">
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Controls</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan="5" className="p-4 text-center"><div className="animate-pulse h-4 bg-muted w-32 mx-auto rounded" /></td></tr>
              ) : filteredUsers.length === 0 ? (
                <tr><td colSpan="5" className="p-8 text-center text-muted-foreground italic">No users found.</td></tr>
              ) : filteredUsers.map(u => (
                <tr key={u.user_id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-mono text-muted-foreground">#{u.user_id}</td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-foreground">{u.username}</div>
                    <div className="text-xs text-muted-foreground">{u.email || 'No email provided'}</div>
                  </td>
                  <td className="px-4 py-3"><Badge>{u.role}</Badge></td>
                  <td className="px-4 py-3">
                    {u.is_active ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded text-xs font-semibold"><FiCheckCircle /> Active</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-rose-600 bg-rose-50 px-2 py-0.5 rounded text-xs font-semibold"><FiLock /> Suspended</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button 
                      onClick={() => handleToggleUserStatus(u)}
                      disabled={togglingUser === u.user_id}
                      className={`inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer border ${
                        u.is_active 
                          ? 'bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-100' 
                          : 'bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100'
                      }`}
                    >
                      {togglingUser === u.user_id ? 'Wait...' : (u.is_active ? 'Suspend' : 'Activate')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )

  const renderLogs = () => (
    <div className="space-y-4">
      <Card noPad className="p-4 border border-border">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input 
              type="text" 
              placeholder="Search actions, events, or IP..." 
              value={logSearch}
              onChange={(e) => setLogSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-card border border-border rounded-xl text-sm"
            />
          </div>
          <input 
            type="date" 
            value={logDateRange.start} 
            onChange={(e) => setLogDateRange({ ...logDateRange, start: e.target.value })} 
            className="bg-card border border-border rounded-xl px-4 py-2 text-sm"
          />
          <input 
            type="date" 
            value={logDateRange.end} 
            onChange={(e) => setLogDateRange({ ...logDateRange, end: e.target.value })} 
            className="bg-card border border-border rounded-xl px-4 py-2 text-sm"
          />
        </div>
      </Card>
      
      <Card noPad className="border border-border">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-muted-foreground uppercase text-[11px] font-semibold text-left">
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">IP Address</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan="4" className="p-4 text-center"><div className="animate-pulse h-4 bg-muted w-32 mx-auto rounded" /></td></tr>
              ) : filteredLogs.length === 0 ? (
                <tr><td colSpan="4" className="p-8 text-center text-muted-foreground italic">No logs found matching criteria.</td></tr>
              ) : filteredLogs.slice(0, 50).map(l => (
                <tr key={l.log_id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground font-mono">{fmtDate(l.created_at, 'MMM DD, YYYY HH:mm:ss')}</td>
                  <td className="px-4 py-3 font-semibold text-foreground">{l.user?.username || 'System'}</td>
                  <td className="px-4 py-3">
                    <div className="font-semibold">{l.action}</div>
                    <div className="text-xs text-muted-foreground truncate max-w-md">{l.description}</div>
                  </td>
                  <td className="px-4 py-3 font-mono text-muted-foreground text-xs">{l.ip_address || '127.0.0.1'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )

  const renderCarousel = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-card p-5 rounded-2xl border border-border shadow-sm">
        <div>
          <h3 className="font-bold text-foreground">Carousel Management</h3>
          <p className="text-sm text-muted-foreground">Manage the active promotional images on the Customer Dashboard</p>
        </div>
        <Btn onClick={() => setCarouselModalOpen(true)} className="flex items-center gap-2">
          <FiPlus /> Add Images
        </Btn>
      </div>

      {carouselImages.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground bg-muted/20 rounded-xl border border-dashed border-border">
          <FiImage className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No images in the carousel yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {carouselImages.map(img => (
            <div key={img.id} className="relative group rounded-2xl overflow-hidden border border-border aspect-video bg-muted/30">
              <img 
                src={img.image_url} 
                alt="Carousel" 
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-3">
                <div className="flex items-center gap-3">
                  <label className="p-3 bg-blue-500 hover:bg-blue-600 text-white rounded-full transition-colors cursor-pointer" title="Replace Image">
                    <FiImage className="w-5 h-5" />
                    <input 
                      type="file" 
                      accept="image/*" 
                      className="hidden" 
                      onChange={async (e) => {
                        const file = e.target.files[0];
                        if (!file) return;
                        const formData = new FormData();
                        formData.append('image', file);
                        try {
                          setLoading(true);
                          await api.carouselImages.update(img.id, formData);
                          showToast('Image replaced successfully', 'success');
                          triggerDataSync('carousel');
                          loadData('carousel');
                        } catch (err) {
                          Swal.fire('Error', err.message || 'Failed to replace image', 'error');
                        } finally {
                          setLoading(false);
                          e.target.value = '';
                        }
                      }}
                    />
                  </label>
                  <button 
                    onClick={async () => {
                      const res = await Swal.fire({
                        title: 'Are you sure?',
                        text: "This image will be removed from the carousel.",
                        icon: 'warning',
                        showCancelButton: true,
                        confirmButtonText: 'Yes, delete it'
                      });
                      if (res.isConfirmed) {
                        try {
                          setLoading(true);
                          await api.carouselImages.delete(img.id);
                          showToast('Image deleted successfully', 'success');
                          triggerDataSync('carousel');
                          loadData('carousel');
                        } catch (err) {
                          Swal.fire('Error', err.message || 'Failed to delete image', 'error');
                        } finally {
                          setLoading(false);
                        }
                      }
                    }}
                    className="p-3 bg-red-500 hover:bg-red-600 text-white rounded-full transition-colors"
                    title="Delete Image"
                  >
                    <FiTrash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  const renderSettings = () => (
    <div className="max-w-3xl space-y-6">
      <Card noPad className="border border-border overflow-hidden">
        <div className="p-4 border-b border-border bg-muted/30">
          <h3 className="font-bold text-foreground">Global Configuration</h3>
          <p className="text-xs text-muted-foreground">These settings affect the entire system and application state.</p>
        </div>
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-border pb-4">
            <div>
              <div className="font-semibold text-sm">Maintenance Mode</div>
              <div className="text-xs text-muted-foreground mt-1">Suspend access for all non-admin users.</div>
            </div>
            <button 
              onClick={() => handleToggleSetting('maintenance_mode')}
              disabled={savingSettings}
              className="text-3xl focus:outline-none transition-colors cursor-pointer disabled:opacity-50"
            >
              {settings.maintenance_mode ? <FiToggleRight className="text-emerald-500" /> : <FiToggleLeft className="text-muted-foreground" />}
            </button>
          </div>
          
          <div className="flex items-center justify-between border-b border-border pb-4">
            <div>
              <div className="font-semibold text-sm">Debug Mode</div>
              <div className="text-xs text-muted-foreground mt-1">Enable verbose logging and error stack traces.</div>
            </div>
            <button 
              onClick={() => handleToggleSetting('debug_mode')}
              disabled={savingSettings}
              className="text-3xl focus:outline-none transition-colors cursor-pointer disabled:opacity-50"
            >
              {settings.debug_mode ? <FiToggleRight className="text-amber-500" /> : <FiToggleLeft className="text-muted-foreground" />}
            </button>
          </div>
          
          <div>
            <label className="font-semibold text-sm block mb-1">Site Name</label>
            <input 
              type="text" 
              value={settings.site_name || settings.company_name} 
              disabled
              className="w-full px-4 py-2 bg-muted border border-border rounded-xl text-sm text-muted-foreground cursor-not-allowed"
            />
            <p className="text-[11px] text-muted-foreground mt-1">Site name cannot be edited from this interface.</p>
          </div>
        </div>
      </Card>
    </div>
  )

  const closeCarouselModal = () => {
    setCarouselModalOpen(false);
    setCarouselPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader 
        title="Admin Interface" 
        subtitle="Secure monitoring and management console. Adding data is strictly restricted."
      />

      <TabBar 
        tabs={[
          { id: 'metrics', label: 'System Status', icon: <FiBarChart2 /> },
          { id: 'users', label: 'User Management', icon: <FiUsers /> },
          { id: 'carousel', label: 'Carousel Images', icon: <FiImage /> },
          { id: 'logs', label: 'Audit Logs', icon: <FiActivity /> },
          { id: 'settings', label: 'Settings', icon: <FiSettings /> },
        ]}
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      {error && <ErrorAlert message={error} onRetry={() => loadData(activeTab)} />}

      <div className="min-h-[400px]">
        {activeTab === 'metrics' && renderMetrics()}
        {activeTab === 'users' && renderUsers()}
        {activeTab === 'carousel' && renderCarousel()}
        {activeTab === 'logs' && renderLogs()}
        {activeTab === 'settings' && renderSettings()}
      </div>

      {isCarouselModalOpen && (
        <Modal 
          onClose={closeCarouselModal} 
          title="Add Carousel Image"
        >
          <form onSubmit={handleCarouselUpload} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-3">Upload Promotion/Product Image(s)</label>
              <div className="relative flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-border rounded-xl bg-muted/20 hover:bg-muted/40 transition-colors overflow-hidden group">
                {carouselPreview ? (
                  <>
                    <img src={carouselPreview.url} alt="Preview" className="absolute inset-0 w-full h-full object-cover" />
                    {carouselPreview.count > 1 && (
                      <div className="absolute top-3 left-3 bg-blue-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg z-10">
                        +{carouselPreview.count - 1} more selected
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center gap-3 transition-opacity">
                      <span className="text-white font-medium bg-black/60 px-4 py-2 rounded-lg pointer-events-none">Change Images</span>
                      <button 
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          closeCarouselModal(); // Resets everything
                          setCarouselModalOpen(true); // Keep modal open
                        }}
                        className="text-white text-sm font-medium bg-red-500/80 hover:bg-red-600 px-4 py-2 rounded-lg z-10"
                      >
                        Clear Selection
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
                    <FiImage className="w-10 h-10 mb-3 opacity-50" />
                    <p className="text-sm font-semibold">Click to browse multiple</p>
                    <p className="text-xs mt-1">PNG, JPG, WEBP (Max 10MB each)</p>
                  </div>
                )}
                <input 
                  type="file" 
                  accept="image/*" 
                  multiple
                  ref={fileInputRef}
                  onChange={handleCarouselFileChange}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  required
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-8">
              <Btn type="button" variant="secondary" onClick={closeCarouselModal}>
                Cancel
              </Btn>
              <Btn type="submit" disabled={uploadingCarousel || !carouselPreview}>
                {uploadingCarousel ? 'Uploading...' : `Upload ${carouselPreview?.count > 1 ? carouselPreview.count + ' Images' : 'Image'}`}
              </Btn>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
