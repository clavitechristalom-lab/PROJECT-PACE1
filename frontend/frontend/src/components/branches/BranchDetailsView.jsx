import React, { useState, useRef } from 'react'
import { 
  FiArrowLeft, FiPackage, FiUsers, FiShoppingCart, 
  FiCalendar, FiCreditCard, FiClock, FiMapPin, FiPhone, FiCamera, FiEdit2, FiTrash2
} from 'react-icons/fi'
import { Badge, StatCard, showToast, showError, showLoading, closeLoading, ConfirmDialog } from '../ui'
import { fmt } from '../../lib/utils'
import { api } from '../../lib/api'
import EditBranchModal from './EditBranchModal'

// Embedded pages
import ProductsPage from '../../pages/ProductsPage'
import CustomersPage from '../../pages/CustomersPage'
import SalesPage from '../../pages/SalesPage'
import InstallmentsPage from '../../pages/InstallmentsPage'
import PaymentSchedulePage from '../../pages/PaymentSchedulePage'
import PaymentsPage from '../../pages/PaymentsPage'
import EmployeesPage from '../../pages/EmployeesPage'

export default function BranchDetailsView({ branchData, onBack }) {
  const [activeTab, setActiveTab] = useState('products')
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef(null)

  const user = JSON.parse(localStorage.getItem('user')) || {}
  const canEditImage = user.role === 'admin' || user.role === 'store_admin'

  // We maintain a local copy of branchData so updates are reflected immediately
  const [localBranchData, setLocalBranchData] = useState(branchData)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)

  // Extract branch name for image generation and filtering
  const branchName = localBranchData.branch
  const [heroImage, setHeroImage] = useState(
    localBranchData.image || `https://picsum.photos/seed/${branchName.replace(/\s+/g, '')}/1200/400`
  )

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !branchData.id) return

    const formData = new FormData()
    formData.append('image', file)

    setIsUploading(true)
    showLoading('Uploading image...')
    try {
      const res = await api.branches.uploadImage(branchData.id, formData)
      if (res.image_url) {
        setHeroImage(res.image_url)
        showToast('Photo changed successfully', 'success')
      }
    } catch (error) {
      console.error('Failed to upload image:', error)
      showError('Upload Failed', error.message || 'Failed to upload image.')
    } finally {
      setIsUploading(false)
      closeLoading()
      // Reset input
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleUpdateBranch = async (id, formData) => {
    showLoading('Updating branch...')
    try {
      const res = await api.branches.update(id, formData)
      if (res.branch) {
        // Update local state to immediately reflect changes
        setLocalBranchData({
          ...localBranchData,
          branch: res.branch.name,
          location: res.branch.location,
          manager: res.branch.manager_name,
          contact: res.branch.contact_number,
        })
        showToast('Branch updated successfully', 'success')
      }
    } catch (error) {
      console.error('Failed to update branch:', error)
      showError('Update Failed', error.message || 'Failed to update branch.')
    } finally {
      closeLoading()
    }
  }

  const handleDeleteBranch = async () => {
    try {
      showLoading('Deleting branch...')
      await api.branches.delete(localBranchData.id)
      showToast('Branch deleted successfully', 'success')
      // The parent component should ideally refresh, but calling onBack will take us out of this view
      if (onBack) onBack(true) // Pass a flag to indicate deletion if parent supports it
    } catch (error) {
      console.error('Delete branch error:', error)
      showError('Delete Failed', error.message || 'Cannot delete branch because it has linked records.')
    } finally {
      closeLoading()
      setDeleteConfirmOpen(false)
    }
  }

  const tabs = [
    { id: 'products', label: 'Products', icon: <FiPackage className="w-4 h-4" /> },
    { id: 'customers', label: 'Customers', icon: <FiUsers className="w-4 h-4" /> },
    { id: 'employees', label: 'Employees', icon: <FiUsers className="w-4 h-4 text-emerald-500" /> },
    { id: 'sales', label: 'Sales', icon: <FiShoppingCart className="w-4 h-4" /> },
    { id: 'installments', label: 'Installment Accounts', icon: <FiCalendar className="w-4 h-4" /> },
    { id: 'schedule', label: 'Payment Schedule', icon: <FiClock className="w-4 h-4" /> },
    { id: 'payments', label: 'Payments', icon: <FiCreditCard className="w-4 h-4" /> },
  ]

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* ─── BRANCH HERO SECTION ─── */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
        <div className="relative w-full h-48 sm:h-64 group">
          <img 
            src={heroImage} 
            alt={branchName}
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
          />

          {canEditImage && (
            <>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleImageUpload} 
                accept="image/*" 
                className="hidden" 
              />
              <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
                <button
                  onClick={() => setIsEditModalOpen(true)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-background/50 hover:bg-background/80 backdrop-blur-md text-foreground font-semibold text-xs rounded-lg shadow-sm transition-all border border-border/50 cursor-pointer"
                >
                  <FiEdit2 className="w-4 h-4" />
                  Edit Details
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="flex items-center gap-2 px-3 py-1.5 bg-background/50 hover:bg-background/80 backdrop-blur-md text-foreground font-semibold text-xs rounded-lg shadow-sm transition-all border border-border/50 cursor-pointer"
                >
                  <FiCamera className="w-4 h-4" />
                  {isUploading ? 'Uploading...' : 'Change Photo'}
                </button>
              </div>
            </>
          )}

          <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/60 to-transparent flex flex-col justify-end p-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <Badge text="Open" variant="success" />
                  {localBranchData.manager && (
                    <Badge text={`Manager: ${localBranchData.manager}`} variant="default" className="bg-primary/20 text-primary border-primary/20" />
                  )}
                </div>
                <h1 className="text-3xl sm:text-4xl font-black text-foreground drop-shadow-md tracking-tight">
                  {branchName}
                </h1>
                <div className="flex items-center gap-4 text-muted-foreground text-sm mt-2 font-medium">
                  {localBranchData.location && (
                    <div className="flex items-center gap-1.5"><FiMapPin /> {localBranchData.location}</div>
                  )}
                  {localBranchData.contact && (
                    <div className="flex items-center gap-1.5"><FiPhone /> {localBranchData.contact}</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ─── BRANCH STATS ─── */}
        <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-border bg-card/50 backdrop-blur-md">
          <div className="p-4 sm:p-5 flex flex-col gap-1">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Total Sales</span>
            <span className="text-xl sm:text-2xl font-mono font-black text-emerald-600 dark:text-emerald-500">
              {fmt(branchData.sales || 0)}
            </span>
          </div>
          <div className="p-4 sm:p-5 flex flex-col gap-1">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Collections</span>
            <span className="text-xl sm:text-2xl font-mono font-black text-blue-600 dark:text-blue-500">
              {fmt(branchData.collections || 0)}
            </span>
          </div>
          <div className="p-4 sm:p-5 flex flex-col gap-1">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Installment Sales</span>
            <span className="text-xl sm:text-2xl font-mono font-black text-purple-600 dark:text-purple-500">
              {fmt(branchData.installment_sales || 0)}
            </span>
          </div>
          <div className="p-4 sm:p-5 flex flex-col gap-1">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Outstanding Balance</span>
            <span className="text-xl sm:text-2xl font-mono font-black text-rose-600 dark:text-rose-500">
              {fmt(branchData.outstanding_balance || 0)}
            </span>
          </div>
        </div>
      </div>

      {/* ─── TAB NAVIGATION ─── */}
      <div className="border-b border-border mb-6">
        <nav className="flex space-x-1 sm:space-x-4 overflow-x-auto overflow-y-hidden no-scrollbar" aria-label="Tabs">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex items-center gap-2 py-3 px-4 sm:px-6 font-semibold text-sm border-b-2 whitespace-nowrap transition-all outline-none
                  ${isActive 
                    ? 'border-primary text-primary' 
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30'}
                `}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            )
          })}
        </nav>
      </div>

      {/* ─── TAB CONTENT (EMBEDDED PAGES) ─── */}
      <div className="bg-card border border-border rounded-2xl shadow-sm p-4 sm:p-6 min-h-[500px]">
        {activeTab === 'products' && (
          <ProductsPage branchFilter={localBranchData.id} embedded={true} />
        )}
        {activeTab === 'customers' && (
          <CustomersPage branchFilter={localBranchData.id} embedded={true} />
        )}
        {activeTab === 'employees' && (
          <EmployeesPage branchFilter={localBranchData.id} embedded={true} />
        )}
        {activeTab === 'sales' && (
          <SalesPage branchFilter={localBranchData.id} embedded={true} />
        )}
        {activeTab === 'installments' && (
          <InstallmentsPage branchFilter={localBranchData.id} embedded={true} />
        )}
        {activeTab === 'schedule' && (
          <PaymentSchedulePage branchFilter={localBranchData.id} embedded={true} />
        )}
        {activeTab === 'payments' && (
          <PaymentsPage branchFilter={localBranchData.id} embedded={true} />
        )}
      </div>

      <EditBranchModal 
        isOpen={isEditModalOpen} 
        onClose={() => setIsEditModalOpen(false)} 
        initialData={localBranchData} 
        onUpdate={handleUpdateBranch}
        onDelete={() => {
          setIsEditModalOpen(false)
          setDeleteConfirmOpen(true)
        }}
      />

      {deleteConfirmOpen && (
        <ConfirmDialog
          title="Delete Branch"
          message={`Are you sure you want to delete ${branchName}? This action cannot be undone and will fail if there are employees, customers, or sales linked to this branch.`}
          confirmLabel="Delete Branch"
          danger={true}
          onConfirm={handleDeleteBranch}
          onCancel={() => setDeleteConfirmOpen(false)}
        />
      )}
    </div>
  )
}
