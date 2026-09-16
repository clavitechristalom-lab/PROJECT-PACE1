import React, { useState, useEffect } from 'react'
import { Modal } from '../ui'
import { api } from '../../lib/api'
import { FiMapPin, FiUser, FiPhone, FiImage } from 'react-icons/fi'

export default function CreateBranchModal({ isOpen, onClose, onCreate }) {
  const [formData, setFormData] = useState({
    name: '',
    location: '',
    manager_id: '',
    contact_number: '',
    status: 'open',
    color: '#2b5ce6',
  })
  
  const [imageFile, setImageFile] = useState(null)

  const [loading, setLoading] = useState(false)
  const [admins, setAdmins] = useState([])

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

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      await onCreate(formData, imageFile)
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
  }

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Register New Branch">
      <form onSubmit={handleSubmit} className="space-y-4">
        
        {/* Name */}
        <div className="space-y-1">
          <label className="text-xs font-bold text-muted-foreground uppercase">Branch Name *</label>
          <input 
            required
            name="name"
            value={formData.name}
            onChange={handleChange}
            placeholder="e.g. Main Branch"
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
              value={formData.location}
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
              value={formData.contact_number}
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
            value={formData.manager_id}
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

        {/* Image Upload */}
        <div className="space-y-1">
          <label className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1">
            <FiImage className="w-3 h-3" /> Hero Image
          </label>
          <input 
            type="file"
            name="image"
            accept="image/*"
            onChange={(e) => setImageFile(e.target.files[0])}
            className="w-full px-3 py-2 bg-muted/40 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 file:mr-4 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
          />
        </div>

        {/* Action Buttons */}
        <div className="pt-4 flex justify-end gap-2 border-t border-border">
          <button 
            type="button" 
            onClick={onClose}
            className="px-4 py-2 text-sm font-bold text-muted-foreground bg-muted hover:bg-muted/80 rounded-xl"
            disabled={loading}
          >
            Cancel
          </button>
          <button 
            type="submit"
            className="px-4 py-2 text-sm font-bold text-white bg-primary hover:bg-primary/90 rounded-xl flex items-center gap-2"
            disabled={loading}
          >
            {loading ? 'Creating...' : 'Create Branch'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
