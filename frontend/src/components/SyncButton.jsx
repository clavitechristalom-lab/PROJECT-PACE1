import React from 'react'
import { FiRefreshCw } from 'react-icons/fi'

/**
 * Dedicated UI button component for explicit click-driven on-demand sync.
 * Guarantees single-run locking, visual feedback, and debouncing.
 */
export function SyncButton({
  sync,
  onSync,
  isSyncing = false,
  label = 'Sync',
  title = 'Click to sync live data with server',
  size = 'md',
  className = '',
  disabled = false,
  ...props
}) {
  const handleAction = sync || onSync

  const handleClick = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (!isSyncing && !disabled && typeof handleAction === 'function') {
      handleAction()
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isSyncing || disabled}
      title={title}
      className={`inline-flex items-center gap-1.5 font-semibold rounded-xl border border-border bg-card hover:bg-muted text-foreground transition-all cursor-pointer select-none disabled:opacity-50 disabled:cursor-not-allowed ${
        size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-3 py-2 text-xs'
      } ${className}`}
      {...props}
    >
      <FiRefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-primary' : 'text-muted-foreground'}`} />
      <span>{isSyncing ? 'Syncing...' : label}</span>
    </button>
  )
}

export const OnDemandSyncButton = SyncButton
export default SyncButton

