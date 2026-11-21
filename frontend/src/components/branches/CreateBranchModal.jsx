import React, { useState, useEffect, useRef } from 'react'
import { Modal, StatusBadge, showWarning } from '../ui'
import {
  FiMapPin, FiImage, FiBriefcase, FiCamera,
  FiUploadCloud, FiCheckCircle, FiX
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

const getInitialForm = () => ({
  name: '',
  city: '',
  location: '',
  description: '',
  status: 'open',
  color: '#2b5ce6',
})

export default function CreateBranchModal({ isOpen, onClose, onCreate }) {
  const [formData, setFormData] = useState(getInitialForm)
  const [locationManuallyEdited, setLocationManuallyEdited] = useState(false)
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState('')
  const [loading, setLoading] = useState(false)
  const fileInputRef = useRef(null)

  useEffect(() => {
    if (isOpen) {
      setFormData(getInitialForm())
      setLocationManuallyEdited(false)
      setImageFile(null)
      setImagePreview('')
    }
  }, [isOpen])

  const handleImageChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      showWarning('File Too Large', 'Please select an image smaller than 5MB.')
      return
    }
    if (!file.type.startsWith('image/')) {
      showWarning('Invalid File', 'Please upload a valid image file (PNG, JPG, WebP).')
      return
    }
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  const handleRemoveImage = () => {
    setImageFile(null)
    setImagePreview('')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => {
      const next = { ...prev, [name]: value }
      if (name === 'city' && !locationManuallyEdited) {
        next.location = (value || '').trim()
      }
      return next
    })
  }

  const handleSubmit = async (e) => {
    if (e) e.preventDefault()

    const nameVal = (e?.target?.elements?.name?.value || formData.name || '').trim()
    if (!nameVal) {
      showWarning('Branch Name Required', 'Please enter a Branch Name before creating.')
      return
    }

    const composedLocation = (formData.location || '').trim() || (formData.city || '').trim()

    setLoading(true)
    try {
      const finalData = {
        ...formData,
        name: nameVal,
        location: composedLocation,
        city: (formData.city || '').trim(),
        description: (formData.description || '').trim(),
      }
      await onCreate(finalData, imageFile)
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  const displayLocation = (formData.location || '').trim() ||
    (formData.city || '').trim() ||
    'Location not specified yet'

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Register New Branch" size="lg">
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/jpg,image/webp"
          className="hidden"
          onChange={handleImageChange}
          onClick={(e) => { e.target.value = null }}
        />

        {/* Top Live Branch Identity & Preview Banner */}
        <div className="p-3.5 rounded-2xl bg-muted/25 border border-border">
          <div className="flex flex-wrap items-center justify-between gap-3">
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
                <div className="font-bold text-sm text-foreground truncate">
                  {formData.name.trim() || 'New Store Branch'}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1.5">
                  <FiMapPin className="w-3 h-3 text-primary shrink-0" />
                  <span className="truncate">{displayLocation}</span>
                </div>
              </div>
            </div>
            <StatusBadge status="Active" />
          </div>
        </div>

        {/* Section 1: Storefront Hero Photo & Brand Accent */}
        <div className="p-3.5 rounded-2xl bg-card border border-border space-y-3">
          <div className="border-b border-border pb-2">
            <h4 className="font-bold text-foreground text-xs uppercase tracking-wider">
              1. Storefront Photo & Brand Theme
            </h4>
            <p className="text-[10px] text-muted-foreground">
              Upload a storefront hero image and select an accent color for branch badges and charts.
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
                  <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                ) : (
                  <div className="flex flex-col items-center justify-center text-muted-foreground p-1 text-center">
                    <FiImage className="w-5 h-5 mb-0.5 text-muted-foreground/60" />
                    <span className="text-[9px] font-semibold">Add Photo</span>
                  </div>
                )}
                <div className="absolute inset-0 bg-black/60 text-white flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <FiCamera className="w-4 h-4 mb-0.5 text-blue-400" />
                  <span className="text-[8px] font-bold">Upload</span>
                </div>
              </button>

              <div className="min-w-0 flex-1 space-y-1.5">
                <p className="text-[11px] text-muted-foreground leading-snug">
                  Storefront or showroom photo (PNG, JPG, WebP up to 5MB).
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
                  {imagePreview && (
                    <button
                      type="button"
                      onClick={handleRemoveImage}
                      className="text-[11px] text-rose-500 hover:text-rose-600 font-bold px-2 py-1 cursor-pointer"
                    >
                      Remove
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

        {/* Section 2: Branch Identification & Location */}
        <div className="p-3.5 rounded-2xl bg-card border border-border space-y-3">
          <div className="border-b border-border pb-2">
            <h4 className="font-bold text-foreground text-xs uppercase tracking-wider">
              2. Branch Name & Location
            </h4>
            <p className="text-[10px] text-muted-foreground">
              Set the official branch name, city/municipality, and display location label.
            </p>
          </div>

          <div>
            <label className="block font-bold text-muted-foreground mb-1">Branch Name *</label>
            <input
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="e.g. Z-LICZ Cagayan de Oro Branch"
              required
              className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-semibold"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-muted-foreground mb-1 flex items-center gap-1">
                <FiMapPin className="w-3 h-3 text-primary" /> City / Municipality *
              </label>
              <input
                name="city"
                value={formData.city}
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
                  onClick={() => {
                    setLocationManuallyEdited(false)
                    setFormData(prev => ({ ...prev, location: (prev.city || '').trim() }))
                  }}
                  className="text-[10px] font-bold text-primary hover:underline cursor-pointer"
                >
                  Sync from City
                </button>
              </div>
              <input
                name="location"
                value={formData.location}
                onChange={(e) => {
                  setLocationManuallyEdited(true)
                  setFormData(prev => ({ ...prev, location: e.target.value }))
                }}
                placeholder="e.g. Carmen, Cagayan de Oro City"
                className="w-full px-3 py-2 rounded-xl border border-border bg-card text-foreground font-semibold"
              />
            </div>
          </div>
        </div>

        {/* Section 3: Branch Description & Services Scope */}
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
            value={formData.description}
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
                  key={`branch-tpl-${idx}`}
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

        {/* Footer Action Buttons */}
        <div className="pt-3 flex items-center justify-end gap-3 border-t border-border">
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
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-primary-foreground bg-primary hover:bg-primary/90 rounded-xl cursor-pointer disabled:opacity-50"
            disabled={loading}
          >
            <FiCheckCircle className="w-3.5 h-3.5" />
            <span>{loading ? 'Registering Branch...' : 'Register Branch'}</span>
          </button>
        </div>
      </form>
    </Modal>
  )
}
