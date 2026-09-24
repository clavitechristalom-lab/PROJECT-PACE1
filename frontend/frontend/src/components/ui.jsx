import React, { useState, useEffect, useRef, Component } from 'react'
import { Link } from 'react-router-dom'
import { TbCurrencyPeso } from 'react-icons/tb'
import {
  FiCheckCircle, FiAlertCircle, FiAlertTriangle, FiInfo, FiX,
  FiChevronLeft, FiChevronRight, FiSearch, FiBell, FiClock, FiCreditCard, FiPackage, FiUser, FiShield,
  FiActivity, FiInbox, FiSettings, FiShoppingCart, FiFileText, FiFilter, FiXCircle
} from 'react-icons/fi'
import {
  showToast as swalToast,
  showSuccess,
  showError,
  showWarning,
  showLoading,
  closeLoading,
  confirmAction,
  confirmDelete
} from '../lib/swal'

export {
  swalToast,
  showSuccess,
  showError,
  showWarning,
  showLoading,
  closeLoading,
  confirmAction,
  confirmDelete
}

// ─── Error Boundary ───────────────────────────────────────────────────────────
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('UI Runtime Error caught by ErrorBoundary:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 max-w-2xl mx-auto my-12 bg-card border border-rose-200 dark:border-rose-900 rounded-2xl shadow-lg text-center space-y-4">
          <FiAlertTriangle className="w-12 h-12 text-rose-500 mx-auto" />
          <h2 className="text-lg font-bold text-foreground">An error occurred in this view</h2>
          <p className="text-xs font-mono text-rose-600 bg-rose-50 dark:bg-rose-950/40 p-3 rounded-xl border border-rose-100 dark:border-rose-900 text-left overflow-x-auto">
            {this.state.error?.message || 'Unexpected rendering error'}
          </p>
          <div className="flex justify-center gap-3 pt-2">
            <button
              onClick={() => { this.setState({ hasError: false, error: null }) }}
              className="px-4 py-2 bg-primary hover:opacity-90 text-primary-foreground text-xs font-semibold rounded-xl cursor-pointer transition-all shadow-xs"
            >
              Retry View
            </button>
            <button
              onClick={() => { this.setState({ hasError: false, error: null }); window.location.hash = '#/dashboard' }}
              className="px-4 py-2 bg-muted hover:bg-muted/80 text-foreground text-xs font-semibold rounded-xl cursor-pointer transition-all"
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// ─── Button ───────────────────────────────────────────────────────────────────
export function Btn({
  children,
  onClick,
  variant = 'primary',
  size = 'md',
  disabled,
  type = 'button',
  fullWidth,
  title,
  icon,
  className = '',
}) {
  const base = 'inline-flex items-center justify-center gap-1.5 font-medium rounded-xl cursor-pointer transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs active:scale-98'
  const sizes = {
    xs: 'px-2.5 py-1 text-xs',
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-5 py-2.5 text-base',
  }
  const variants = {
    primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
    secondary: 'bg-secondary text-primary hover:bg-secondary/80',
    ghost: 'bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground shadow-none',
    danger: 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900 hover:bg-rose-100',
    outline: 'bg-card border border-border text-foreground hover:bg-muted',
    success: 'bg-emerald-600 text-white hover:bg-emerald-700',
  }
  return (
    <button
      type={type}
      title={title}
      className={`${base} ${sizes[size] || sizes.md} ${variants[variant] || variants.primary} ${fullWidth ? 'w-full' : ''} ${className}`}
      onClick={onClick}
      disabled={disabled}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      {children}
    </button>
  )
}

// ─── Badge ────────────────────────────────────────────────────────────────────
const badgeMap = {
  green: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
  red: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800',
  yellow: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
  blue: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800',
  gray: 'bg-muted text-muted-foreground border-border',
  purple: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800',
  indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800',
}

export function Badge({ label, text, color = 'gray', variant, icon }) {
  const content = text !== undefined ? text : label
  let col = color
  if (variant) {
    if (variant === 'success') col = 'green'
    else if (variant === 'danger') col = 'red'
    else if (variant === 'info') col = 'blue'
    else if (variant === 'warning') col = 'yellow'
    else if (variant === 'neutral') col = 'gray'
    else col = variant
  }
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${badgeMap[col] || badgeMap.gray}`}>
      {icon && <span className="shrink-0">{icon}</span>}
      <span>{content}</span>
    </span>
  )
}

const STATUS_COLORS = {
  Active: 'green', Completed: 'green', Paid: 'green', Present: 'green', Approved: 'blue', Responded: 'green',
  Overdue: 'red', Inactive: 'red', Absent: 'red', Cancelled: 'red',
  Pending: 'yellow', Draft: 'yellow', Late: 'yellow', Open: 'yellow', 'Half Day': 'yellow',
  'Partially Paid': 'purple', Processing: 'blue', 'On Leave': 'indigo', 'Rest Day': 'gray',
  'In Stock': 'green', 'Low Stock': 'yellow', 'Out of Stock': 'red',
  Administrator: 'blue', 'Store Administrator': 'indigo', Employee: 'gray',
  Closed: 'gray',
}

export function StatusBadge({ status }) {
  if (!status) return null

  let icon = null
  const s = String(status).toLowerCase()
  if (s.includes('active') || s.includes('completed') || s.includes('paid') || s.includes('present')) {
    icon = <FiCheckCircle className="w-3 h-3" />
  } else if (s.includes('overdue') || s.includes('absent') || s.includes('cancelled')) {
    icon = <FiAlertCircle className="w-3 h-3" />
  } else if (s.includes('pending') || s.includes('late') || s.includes('low stock')) {
    icon = <FiAlertTriangle className="w-3 h-3" />
  }

  return <Badge label={status} color={STATUS_COLORS[status] || 'gray'} icon={icon} />
}

// ─── Input / Select / Textarea ────────────────────────────────────────────────
const inputBase = 'w-full border border-border rounded-xl px-3 py-2 text-xs bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all placeholder:text-muted-foreground/70'

export function Input({ label, required, error, value, onChange, className = '', icon, ...props }) {
  const handleChange = (e) => {
    if (onChange) {
      onChange(e.target.value, e)
    }
  }
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">
          {label}{required && <span className="text-rose-500 ml-0.5">*</span>}
        </label>
      )}
      <div className="relative">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
            {icon}
          </div>
        )}
        <input
          className={`${inputBase} ${icon ? 'pl-9' : ''} ${className}`}
          value={value !== undefined ? value : ''}
          onChange={handleChange}
          {...props}
        />
      </div>
      {error && <p className="text-xs text-rose-500">{error}</p>}
    </div>
  )
}

export function Select({ label, required, error, value, onChange, options, children, className = '', ...props }) {
  const handleChange = (e) => {
    if (onChange) {
      onChange(e.target.value, e)
    }
  }
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">
          {label}{required && <span className="text-rose-500 ml-0.5">*</span>}
        </label>
      )}
      <select
        className={`${inputBase} cursor-pointer ${className}`}
        value={value !== undefined ? value : ''}
        onChange={handleChange}
        {...props}
      >
        {options ? (
          options.map((opt) => {
            const val = typeof opt === 'object' && opt !== null ? opt.value : opt
            const lbl = typeof opt === 'object' && opt !== null ? opt.label : opt
            return <option key={val} value={val}>{lbl}</option>
          })
        ) : children}
      </select>
      {error && <p className="text-xs text-rose-500">{error}</p>}
    </div>
  )
}

export function Textarea({ label, required, value, onChange, rows = 3, className = '', ...props }) {
  const handleChange = (e) => {
    if (onChange) {
      onChange(e.target.value, e)
    }
  }
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">
          {label}{required && <span className="text-rose-500 ml-0.5">*</span>}
        </label>
      )}
      <textarea
        className={`${inputBase} ${className}`}
        rows={rows}
        value={value !== undefined ? value : ''}
        onChange={handleChange}
        {...props}
      />
    </div>
  )
}

// ─── Modal ────────────────────────────────────────────────────────────────────
export function Modal({ title, onClose, children, footer, size = 'md' }) {
  useEffect(() => {
    const fn = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', fn)
    return () => document.removeEventListener('keydown', fn)
  }, [onClose])

  const widths = { sm: 'max-w-sm', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-[fadeIn_0.15s_ease]"
      style={{ background: 'rgba(15,31,61,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className={`bg-card rounded-2xl shadow-2xl border border-border w-full ${widths[size] || widths.md} max-h-[92vh] flex flex-col animate-[slideUp_0.15s_ease] overflow-hidden`}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border flex-shrink-0 bg-muted/40">
          <h2 className="font-bold text-foreground text-sm flex items-center gap-2">{title}</h2>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-xl hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            aria-label="Close"
          >
            <FiX className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-4">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-muted/50 flex-shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Confirm Dialog ───────────────────────────────────────────────────────────
export function ConfirmDialog({ title, message, onConfirm, onCancel, confirmLabel = 'Confirm', danger }) {
  return (
    <Modal title={title} onClose={onCancel} size="sm">
      <div className="space-y-4">
        <p className="text-xs text-muted-foreground leading-relaxed">{message}</p>
        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <Btn variant="outline" size="sm" onClick={onCancel} icon={<FiX className="w-3.5 h-3.5" />}>Cancel</Btn>
          <Btn variant={danger ? 'danger' : 'primary'} size="sm" onClick={onConfirm} icon={<FiCheckCircle className="w-3.5 h-3.5" />}>
            {confirmLabel}
          </Btn>
        </div>
      </div>
    </Modal>
  )
}

// ─── Table ────────────────────────────────────────────────────────────────────
export function Table({ headers = [], children, empty }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs min-w-max">
        <thead>
          <tr className="border-b border-border bg-muted/50 text-muted-foreground font-semibold uppercase tracking-wider text-[11px]">
            {headers.map(h => (
              <th key={h} className="text-left py-2.5 px-3 whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {empty ? (
            <tr>
              <td colSpan={headers.length} className="py-12 text-center text-xs text-muted-foreground">
                <div className="flex flex-col items-center gap-2">
                  <FiInbox className="w-8 h-8 opacity-30 mx-auto" />
                  <span>No records found</span>
                </div>
              </td>
            </tr>
          ) : children}
        </tbody>
      </table>
    </div>
  )
}

export function TR({ children, stripe }) {
  return (
    <tr className={`border-b border-border hover:bg-muted/40 transition-colors ${stripe ? 'bg-muted/10' : 'bg-card'}`}>
      {children}
    </tr>
  )
}

export function TD({ children, text, mono, muted, bold, className = '' }) {
  return (
    <td className={`py-2.5 px-3 ${mono ? 'font-mono text-xs' : 'text-xs'} ${bold ? 'font-semibold' : ''} ${muted ? 'text-muted-foreground' : 'text-foreground'} ${className}`}>
      {text !== undefined ? text : children}
    </td>
  )
}

// ─── Search Bar ───────────────────────────────────────────────────────────────
export function SearchBar({ value, onChange, placeholder = 'Search...', className = '', ...props }) {
  return (
    <div className={`relative ${className}`}>
      <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
      <input
        type="text"
        className="w-full pl-9 pr-8 py-2 border border-border rounded-xl text-xs bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary placeholder:text-muted-foreground/70 transition-all"
        placeholder={placeholder}
        value={value !== undefined ? value : ''}
        onChange={e => onChange && onChange(e.target.value)}
        {...props}
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange && onChange('')}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer p-0.5 rounded-full hover:bg-muted transition-colors"
          title="Clear search"
        >
          <FiX className="w-3.5 h-3.5" />
        </button>
      ) : null}
    </div>
  )
}

// ─── Page Header ──────────────────────────────────────────────────────────────
export function PageHeader({ title, subtitle, action }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start justify-between mb-5 gap-3">
      <div>
        <h1 className="text-lg md:text-xl font-bold text-foreground tracking-tight">{title}</h1>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {action && <div className="flex-shrink-0 flex items-center gap-2 flex-wrap">{action}</div>}
    </div>
  )
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
export function StatCard({ title, value, sub, icon, color = 'blue' }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-600 border border-blue-200',
    green: 'bg-emerald-50 text-emerald-600 border border-emerald-200',
    red: 'bg-rose-50 text-rose-600 border border-rose-200',
    yellow: 'bg-amber-50 text-amber-600 border border-amber-200',
    purple: 'bg-purple-50 text-purple-600 border border-purple-200',
    indigo: 'bg-indigo-50 text-indigo-600 border border-indigo-200',
  }
  return (
    <div className="bg-card rounded-2xl border border-border p-4 hover:shadow-sm transition-all">
      <div className="flex items-start justify-between mb-2.5">
        <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider leading-tight">{title}</span>
        <span className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm flex-shrink-0 shadow-2xs ${colors[color] || colors.blue}`}>
          {icon}
        </span>
      </div>
      <div className="text-xl md:text-2xl font-black text-foreground tracking-tight font-mono">{value !== undefined ? value : '—'}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-1 font-mono">{sub}</div>}
    </div>
  )
}

// ─── Card ─────────────────────────────────────────────────────────────────────
export function Card({ children, className = '', noPad }) {
  return (
    <div className={`bg-card rounded-2xl border border-border ${noPad ? '' : 'p-4'} ${className}`}>
      {children}
    </div>
  )
}

export function CardHeader({ title, action }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-border">
      <span className="text-xs font-bold text-foreground uppercase tracking-wider">{title}</span>
      {action}
    </div>
  )
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────
export function ProgressBar({ value = 0, pct, color }) {
  const p = typeof value === 'number' ? value : (typeof pct === 'number' ? pct : (parseFloat(value || pct) || 0))
  const c = p >= 100 ? '#10b981' : p >= 60 ? '#2563eb' : p >= 30 ? '#f59e0b' : '#ef4444'
  return (
    <div className="w-full bg-secondary rounded-full h-1.5 overflow-hidden">
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, Math.max(0, p))}%`, background: color || c }} />
    </div>
  )
}

// ─── Pagination ───────────────────────────────────────────────────────────────
export function Pagination({ page = 1, total = 0, perPage = 10, pageSize, onChange, onPageChange }) {
  const size = pageSize || perPage || 10
  const changeFn = onPageChange || onChange || (() => {})
  const pages = Math.max(1, Math.ceil(total / size))
  const start = total === 0 ? 0 : (page - 1) * size + 1
  const end = Math.min(page * size, total)

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/10 text-xs">
      <span className="text-muted-foreground font-mono">
        Showing {start}–{end} of {total}
      </span>
      <div className="flex items-center gap-1">
        <button
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-border bg-card text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
          onClick={() => changeFn(page - 1)}
          disabled={page === 1}
        >
          <FiChevronLeft className="w-3.5 h-3.5" />
          <span>Prev</span>
        </button>
        {Array.from({ length: Math.min(pages, 5) }, (_, i) => i + 1).map(p => (
          <button
            key={p}
            className={`w-7 h-7 rounded-lg border text-xs font-semibold cursor-pointer transition-colors ${
              p === page
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border bg-card text-muted-foreground hover:bg-muted'
            }`}
            onClick={() => changeFn(p)}
          >
            {p}
          </button>
        ))}
        <button
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-border bg-card text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
          onClick={() => changeFn(page + 1)}
          disabled={page === pages}
        >
          <span>Next</span>
          <FiChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

// ─── Loading Skeleton & Spinners ─────────────────────────────────────────────
export function Spinner({ className = 'w-5 h-5 text-primary' }) {
  return (
    <svg className={`animate-spin ${className}`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

export function LoadingState({ message = 'Loading data from server...' }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
      <Spinner className="w-8 h-8 text-primary" />
      <p className="text-xs font-medium text-muted-foreground">{message}</p>
    </div>
  )
}

export function ErrorAlert({ message, onRetry }) {
  return (
    <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/60 rounded-2xl p-4 mb-4 flex items-start justify-between gap-3 text-rose-700 dark:text-rose-300">
      <div className="flex items-start gap-2.5">
        <FiAlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-bold uppercase tracking-wider">Error Communicating with Server</p>
          <p className="text-xs text-rose-600 dark:text-rose-400 mt-0.5">{message || 'An unexpected error occurred.'}</p>
        </div>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg cursor-pointer transition-colors shadow-2xs shrink-0"
        >
          Retry Action
        </button>
      )}
    </div>
  )
}

export function Skeleton({ className = '', style }) {
  return <div className={`bg-muted rounded-xl animate-pulse ${className}`} style={style} />
}

export function TableSkeleton({ rows = 5, cols = 5 }) {
  return (
    <div className="p-4 space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-3">
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton key={j} className="h-4 flex-1" style={{ opacity: 1 - j * 0.1 }} />
          ))}
        </div>
      ))}
    </div>
  )
}

export function StatSkeleton({ count = 4 }) {
  return (
    <div className={`grid grid-cols-2 lg:grid-cols-${count} gap-3 mb-6`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-card rounded-2xl border border-border p-4 animate-pulse">
          <div className="h-3 w-20 bg-muted rounded mb-3" />
          <div className="h-7 w-28 bg-muted rounded mb-2" />
          <div className="h-2.5 w-16 bg-muted rounded" />
        </div>
      ))}
    </div>
  )
}

// ─── Toast ────────────────────────────────────────────────────────────────────
let toastId = 0
const toastListeners = []

export function showToast(message, type = 'success') {
  swalToast(message, type)
}

export function ToastContainer() {
  return null
}

// ─── Empty State ──────────────────────────────────────────────────────────────
export function EmptyState({ icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
      <span className="text-muted-foreground/40 text-4xl">{icon || <FiInbox className="w-12 h-12" />}</span>
      <div>
        <p className="font-bold text-foreground text-sm">{title}</p>
        {description && <p className="text-xs text-muted-foreground mt-1 max-w-sm">{description}</p>}
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

// ─── Tab Bar ──────────────────────────────────────────────────────────────────
export function TabBar({ tabs = [], activeTab, active, onChange }) {
  const current = activeTab || active
  return (
    <div className="flex border-b border-border mb-5 overflow-x-auto gap-2">
      {tabs.map(tab => {
        const id = typeof tab === 'object' && tab !== null ? tab.id : tab
        const label = typeof tab === 'object' && tab !== null ? tab.label : tab
        const icon = typeof tab === 'object' && tab !== null ? tab.icon : null
        const badge = typeof tab === 'object' && tab !== null ? tab.badge : null
        const isActive = current === id

        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold cursor-pointer transition-colors border-b-2 -mb-px whitespace-nowrap ${
              isActive
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {icon && <span className="shrink-0">{icon}</span>}
            <span>{label}</span>
            {badge && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-rose-500 text-white font-mono">
                {badge}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ─── Notification Dropdown ────────────────────────────────────────────────────
export function NotificationBell({ 
  notifications = [], 
  unreadCount = 0, 
  onMarkAllRead, 
  onNotificationClick,
  onViewAll,
  onRefresh,
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const fn = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [])

  const getPriorityBadge = (p) => {
    switch (String(p || '').toLowerCase()) {
      case 'critical':
        return { badge: 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800', label: 'CRITICAL' }
      case 'high':
        return { badge: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800', label: 'HIGH' }
      case 'low':
        return { badge: 'bg-muted text-muted-foreground border-border', label: 'LOW' }
      default:
        return { badge: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800', label: 'INFO' }
    }
  }

  const getModuleIcon = (mod) => {
    const m = String(mod || '').toLowerCase()
    if (m.includes('attendance')) return <FiClock className="w-4 h-4 text-indigo-500" />
    if (m.includes('payroll')) return <TbCurrencyPeso className="w-4 h-4 text-emerald-500" />
    if (m.includes('user') || m.includes('account')) return <FiUser className="w-4 h-4 text-blue-500" />
    if (m.includes('security')) return <FiShield className="w-4 h-4 text-rose-500" />
    if (m.includes('inventory') || m.includes('product')) return <FiPackage className="w-4 h-4 text-amber-500" />
    if (m.includes('sale')) return <FiShoppingCart className="w-4 h-4 text-purple-500" />
    if (m.includes('payment') || m.includes('installment')) return <FiCreditCard className="w-4 h-4 text-teal-500" />
    if (m.includes('system') || m.includes('backup')) return <FiSettings className="w-4 h-4 text-slate-500" />
    return <FiBell className="w-4 h-4 text-primary" />
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => {
          setOpen(o => !o)
          if (!open && onRefresh) onRefresh()
        }}
        className="w-9 h-9 rounded-xl border border-border hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors cursor-pointer relative shadow-2xs"
        aria-label="Notifications"
        title="Notification Center"
      >
        <FiBell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-4 h-4 bg-rose-500 text-white text-[10px] font-bold font-mono px-1 rounded-full flex items-center justify-center shadow-xs animate-fadeIn">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-88 sm:w-[420px] bg-card rounded-2xl shadow-2xl border border-border z-50 animate-[slideUp_0.15s_ease] overflow-hidden flex flex-col max-h-[500px]">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/40 shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-foreground">Notification Bar</span>
              {unreadCount > 0 && (
                <span className="text-[10px] font-bold font-mono bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800 px-1.5 py-0.2 rounded-full">
                  {unreadCount} unread
                </span>
              )}
            </div>
            {unreadCount > 0 && onMarkAllRead && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onMarkAllRead()
                }}
                className="text-[11px] font-semibold text-primary hover:underline cursor-pointer flex items-center gap-1"
              >
                <FiCheckCircle className="w-3.5 h-3.5" />
                <span>Mark all read</span>
              </button>
            )}
          </div>

          <div className="overflow-y-auto divide-y divide-border/60 flex-1">
            {notifications.length === 0 ? (
              <div className="px-4 py-12 text-center text-xs text-muted-foreground space-y-2">
                <FiBell className="w-9 h-9 text-muted-foreground/30 mx-auto" />
                <p className="font-bold text-foreground text-sm">No new notifications</p>
                <p className="text-[11px] text-muted-foreground">All operational and account updates are up to date.</p>
              </div>
            ) : (
              notifications.map(n => {
                const pInfo = getPriorityBadge(n.priority)
                const isUnread = !n.is_read
                return (
                  <div
                    key={n.id || n.notification_id}
                    onClick={() => {
                      if (onNotificationClick) onNotificationClick(n)
                      setOpen(false)
                    }}
                    className={`p-3.5 hover:bg-muted/60 transition-colors flex gap-3 cursor-pointer relative group ${
                      isUnread ? 'bg-primary/5 dark:bg-primary/10' : ''
                    }`}
                  >
                    <span className="w-9 h-9 rounded-xl bg-muted/80 border border-border flex items-center justify-center text-sm shrink-0 mt-0.5 shadow-2xs">
                      {getModuleIcon(n.module)}
                    </span>
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-1.5 flex-wrap">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-xs font-bold text-foreground truncate">{n.title}</span>
                          {n.module && (
                            <span className="text-[9px] font-semibold uppercase px-1.5 py-0.2 bg-muted text-muted-foreground border border-border rounded">
                              {n.module}
                            </span>
                          )}
                        </div>
                        {n.priority && (
                          <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full border shrink-0 ${pInfo.badge}`}>
                            {pInfo.label}
                          </span>
                        )}
                      </div>

                      {/* Full Message Details (No Truncation) */}
                      <p className="text-xs text-foreground/90 leading-relaxed break-words font-normal">
                        {n.message}
                      </p>

                      <div className="flex items-center justify-between pt-1 text-[11px]">
                        <span className="font-mono text-muted-foreground flex items-center gap-1 text-[10px]">
                          <FiClock className="w-3 h-3 text-muted-foreground" />
                          <span>{n.time_ago || n.time || (n.created_at ? new Date(n.created_at).toLocaleDateString() : '')}</span>
                        </span>

                        <div className="flex items-center gap-2">
                          {n.action_url && (
                            <span className="font-bold text-[11px] text-primary hover:underline flex items-center gap-0.5">
                              <span>View</span>
                              <span>→</span>
                            </span>
                          )}
                          {isUnread && (
                            <span className="inline-flex items-center gap-1 font-semibold text-primary text-[10px]">
                              <span className="w-1.5 h-1.5 rounded-full bg-primary" /> Unread
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          <div className="p-2.5 border-t border-border bg-muted/20 text-center shrink-0">
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                if (onViewAll) onViewAll()
              }}
              className="text-xs font-bold text-primary hover:underline cursor-pointer py-1 block w-full"
            >
              Open Full Notification Center →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
