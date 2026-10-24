import React, { useState, useEffect, useRef } from 'react'
import { Modal, showError, showWarning, showToast } from '../ui'
import { api } from '../../lib/api'
import { FiMapPin, FiUser, FiPhone, FiTrash2, FiImage, FiCamera, FiUploadCloud } from 'react-icons/fi'

export default function EditBranchModal({ isOpen, onClose, onUpdate, initialData, onDelete }) {
  const [formData, setFormData] = useState({
    name: '',
    location: '',
    manager_id: '',
    contact_number: '',
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
          const users = res.users || res || [];
          setAdmins(users.filter(u => u.role === 'Store Administrator'))
        })
        .catch(err => console.error(err))
    }
  }, [isOpen])

  // Populate form data once when modal opens or initialData changes ID, preventing unexpected resets during editing
  useEffect(() => {
    if (isOpen && initialData) {
      const currentId = initialData.id || initialData.branch_id;
      if (isInitializedRef.current !== currentId) {
        setFormData({
          name: initialData.branch || initialData.name || '',
          location: initialData.location || '',
          manager_id: initialData.manager_id || '',
          contact_number: initialData.contact_number || initialData.contact || '',
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

    // Store the selected file in state for FormData submission
    setSelectedFile(file)

    // 1. Create a temporary object URL for instant UI preview
    const objectUrl = URL.createObjectURL(file)
    setImagePreview(objectUrl)

    // 2. Fallback read via FileReader
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
    setLoading(true)
    try {
      // Build FormData payload (multipart/form-data)
      const payload = new FormData()
      payload.append('name', (formData.name || '').trim())
      payload.append('location', (formData.location || '').trim())
      payload.append('contact_number', (formData.contact_number || '').trim())
      if (formData.manager_id) {
        payload.append('manager_id', formData.manager_id)
      }

      if (selectedFile instanceof File) {
        payload.append('image', selectedFile)
      }

      if (onUpdate) {
        await onUpdate(initialData.id, payload)
      } else {
        await api.branches.update(initialData.id, payload)
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
    setFormData({ ...formData, [e.target.name]: e.target.value })
  }

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit Branch Details">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Hidden single file input with click reset */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/jpg,image/webp"
          className="hidden"
          onChange={handleImageChange}
          onClick={(e) => { e.target.value = null }}
        />

        {/* Branch Image */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-muted-foreground uppercase flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <FiImage className="w-3.5 h-3.5" /> Branch Image
            </span>
            {imagePreview && (
              <span className="text-[10px] text-muted-foreground font-normal lowercase">
                (click photo to change)
              </span>
            )}
          </label>

          <div className="flex items-center gap-4 p-3 bg-muted/20 border border-border rounded-2xl">
            <div className="relative group shrink-0">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl bg-card border-2 border-dashed border-border flex flex-col items-center justify-center cursor-pointer overflow-hidden transition-all hover:border-primary/50 relative block shadow-xs p-0 text-left"
              >
                {imagePreview ? (
                  <img
                    src={imagePreview}
                    alt="Branch Preview"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center text-muted-foreground p-2 text-center w-full h-full">
                    <FiImage className="w-6 h-6 mb-1 text-muted-foreground/50" />
                    <span className="text-[10px] font-semibold">No Image</span>
                  </div>
                )}

                <div className="absolute inset-0 bg-black/60 text-white flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-xl">
                  <FiCamera className="w-5 h-5 mb-1 text-blue-400" />
                  <span className="text-[9px] font-bold">Change</span>
                </div>
              </button>
            </div>

            <div className="flex-1 space-y-2">
              <p className="text-xs text-muted-foreground leading-relaxed">
                Upload a photo of this storefront or location. PNG, JPG or WebP up to 5MB.
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-xs font-semibold cursor-pointer transition-colors"
                >
                  <FiUploadCloud className="w-3.5 h-3.5" />
                  <span>{imagePreview ? 'Change Photo' : 'Upload Photo'}</span>
                </button>

                {selectedFile && (
                  <button
                    type="button"
                    onClick={handleResetImage}
                    className="text-xs text-rose-500 hover:text-rose-600 font-semibold px-2 py-1 transition-colors cursor-pointer"
                  >
                    Revert
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Name */}
        <div className="space-y-1">
          <label className="text-xs font-bold text-muted-foreground uppercase">Branch Name *</label>
          <input 
            required
            name="name"
            value={formData.name || ''}
            onChange={handleChange}
            placeholder="e.g. Cagayan de Oro Branch"
            className="w-full px-3 py-2 bg-muted/40 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        {/* Location & Contact */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1">
              <FiMapPin className="w-3 h-3" /> Location
            </label>
            <input 
              name="location"
              value={formData.location || ''}
              onChange={handleChange}
              placeholder="City or Address"
              className="w-full px-3 py-2 bg-muted/40 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1">
              <FiPhone className="w-3 h-3" /> Contact #
            </label>
            <input 
              name="contact_number"
              value={formData.contact_number || ''}
              onChange={handleChange}
              placeholder="(+63) 900-000-0000"
              className="w-full px-3 py-2 bg-muted/40 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
        </div>

        {/* Manager */}
        <div className="space-y-1">
          <label className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1">
            <FiUser className="w-3 h-3" /> Store Manager
          </label>
          <select 
            name="manager_id"
            value={formData.manager_id || ''}
            onChange={handleChange}
            className="w-full px-3 py-2 bg-muted/40 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            <option value="">Select a Manager...</option>
            {admins.map(admin => {
               const empName = admin.employee ? `${admin.employee.first_name} ${admin.employee.last_name}`.trim() : admin.username;
               return (
                 <option key={admin.user_id} value={admin.user_id}>
                   {empName}
                 </option>
               )
            })}
          </select>
        </div>

        {/* Action Buttons */}
        <div className="pt-4 flex justify-between gap-2 border-t border-border">
          {onDelete && (
            <button 
              type="button" 
              onClick={onDelete}
              className="px-4 py-2 text-sm font-bold text-rose-600 bg-rose-500/10 hover:bg-rose-500/20 rounded-xl flex items-center gap-2 cursor-pointer"
              disabled={loading}
            >
              <FiTrash2 className="w-4 h-4" /> Delete Branch
            </button>
          )}
          <div className="flex gap-2 ml-auto">
            <button 
              type="button" 
              onClick={onClose}
              className="px-4 py-2 text-sm font-bold text-muted-foreground bg-muted hover:bg-muted/80 rounded-xl cursor-pointer"
              disabled={loading}
            >
              Cancel
            </button>
            <button 
              type="submit"
              className="px-4 py-2 text-sm font-bold text-white bg-primary hover:bg-primary/90 rounded-xl flex items-center gap-2 cursor-pointer"
              disabled={loading}
            >
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
