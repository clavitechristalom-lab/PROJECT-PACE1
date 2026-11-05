import { useState, useEffect, useRef, useCallback } from 'react'
import { clearApiCacheForModule } from './api'
export { fastDeepEqual, setIfChanged } from './diff'
export { SyncButton, OnDemandSyncButton, default as DefaultSyncButton } from '../components/SyncButton'

// Active sync locks registry: tracks module/targetId currently in an active sync operation
const activeSyncLocks = new Set()
// Debounce timestamps registry: prevents rapid multi-clicks
const syncDebounceTimestamps = new Map()
// Active AbortControllers: to cleanly cancel an in-flight operation if needed
const syncAbortControllers = new Map()

/**
 * Checks whether an on-demand sync is currently in-flight for a specific key
 * @param {string} [key='general']
 * @returns {boolean}
 */
export function isSyncing(key = 'general') {
  return activeSyncLocks.has(key)
}

/**
 * Strictly on-demand, click-driven sync execution handler.
 * Enforces single-run locking, debouncing, and strictly targeted cache & payload dispatching.
 *
 * @param {Object} options
 * @param {string} [options.module='general'] - Targeted module (e.g. 'customers', 'employees', 'notifications')
 * @param {string|number|null} [options.targetId=null] - Specific entity ID being synced/updated
 * @param {string} [options.action='sync'] - Action verb (e.g. 'refresh', 'mutation', 'click')
 * @param {Object|null} [options.payload=null] - Minimal targeted payload (only target ID/action, never full DB)
 * @param {Function|null} [options.syncFn=null] - Targeted async network/sync fetcher to execute
 * @param {Function|null} [options.onSuccess=null] - Targeted success callback
 * @param {Function|null} [options.onError=null] - Targeted error callback
 * @returns {Promise<{ status: string, result?: any, error?: any, reason?: string }>}
 */
export async function executeOnDemandSync({
  module = 'general',
  targetId = null,
  action = 'sync',
  payload = null,
  syncFn = null,
  onSuccess = null,
  onError = null
} = {}) {
  const lockKey = targetId !== null && targetId !== undefined ? `${module}:${targetId}` : module

  // 1. Single-Run Locking Guard: If sync is already in progress, safely ignore subsequent clicks
  if (activeSyncLocks.has(lockKey) || activeSyncLocks.has(`${module}:all`)) {
    return { status: 'ignored', reason: 'already_syncing' }
  }

  // 2. Debounce Guard: 400ms cooldown to block rapid-fire multi-clicks
  const now = Date.now()
  const lastTime = syncDebounceTimestamps.get(lockKey) || 0
  if (now - lastTime < 400) {
    return { status: 'ignored', reason: 'debounced' }
  }
  syncDebounceTimestamps.set(lockKey, now)

  // 3. Acquire Lock
  activeSyncLocks.add(lockKey)

  // Manage AbortController for clean cancellation
  if (syncAbortControllers.has(lockKey)) {
    try { syncAbortControllers.get(lockKey).abort() } catch (_) {}
  }
  const controller = new AbortController()
  syncAbortControllers.set(lockKey, controller)

  try {
    let result = null
    if (typeof syncFn === 'function') {
      result = await syncFn({
        module,
        targetId,
        action,
        payload,
        signal: controller.signal
      })
    }

    // 4. Targeted Cache Invalidation: Only clear cache keys related to this module & targetId
    if (module) {
      clearApiCacheForModule(module, targetId)
    }

    if (typeof onSuccess === 'function') {
      onSuccess({ module, targetId, action, result })
    }

    return { status: 'success', result }
  } catch (err) {
    if (err?.name !== 'AbortError') {
      // Clean, targeted error logging strictly for the explicit user-triggered action
      console.error(`[RealtimeSync] Action failed for ${module}${targetId ? ` (ID: ${targetId})` : ''}:`, err?.message || err)
      if (typeof onError === 'function') {
        onError(err)
      }
    }
    return { status: 'error', error: err }
  } finally {
    // 5. Release Lock
    activeSyncLocks.delete(lockKey)
    syncAbortControllers.delete(lockKey)
  }
}

/**
 * On-demand data sync trigger for user actions (create, edit, delete, status toggle).
 * Restricts payload to ONLY the specific item/target and drops duplicate clicks.
 */
export function triggerDataSync(module = 'general', extra = {}) {
  const targetId = extra?.id || extra?.targetId || null
  const action = extra?.action || 'mutation'

  return executeOnDemandSync({
    module,
    targetId,
    action,
    payload: {
      module,
      targetId,
      action,
      timestamp: Date.now()
    }
  })
}

/**
 * React hook for strictly on-demand, click-driven synchronization.
 * Completely eliminates background intervals, auto-sync useEffects, and global polling.
 * Returns { sync, isSyncing, triggerSync } to attach explicitly to user-clicked elements (e.g. Refresh/Sync buttons).
 *
 * @param {Function} refreshFn - Sync callback to execute when user clicks (receives source, signal, extraData)
 * @param {Array} deps - Dependency array
 * @param {Object} options - { enabled?: boolean, module?: string }
 */
export function useRealtimeSync(refreshFn, deps = [], options = {}) {
  const { enabled = true, module = 'general' } = typeof options === 'object' ? options : {}
  const [isSyncingState, setIsSyncingState] = useState(false)
  const refreshFnRef = useRef(refreshFn)

  useEffect(() => {
    refreshFnRef.current = refreshFn
  }, [refreshFn])

  // Explicit, click-driven sync trigger with concurrency locking
  const handleManualSync = useCallback(async (targetId = null, extraData = null) => {
    if (!enabled) return

    const lockKey = targetId !== null && targetId !== undefined ? `${module}:${targetId}` : module
    if (activeSyncLocks.has(lockKey) || activeSyncLocks.has(`${module}:all`)) {
      return // Single-run locking: safely ignore duplicate concurrent clicks
    }

    setIsSyncingState(true)
    try {
      await executeOnDemandSync({
        module,
        targetId,
        action: 'manual-click',
        syncFn: async ({ signal }) => {
          if (refreshFnRef.current) {
            await refreshFnRef.current('manual', signal, extraData)
          }
        }
      })
    } finally {
      setIsSyncingState(false)
    }
  }, [enabled, module])

  return {
    sync: handleManualSync,
    triggerSync: handleManualSync,
    isSyncing: isSyncingState
  }
}

/**
 * Dedicated hook for binding on-demand sync to specific UI action buttons
 */
export function useOnDemandSync(module, syncFn, options = {}) {
  return useRealtimeSync(syncFn, [], { ...options, module })
}

/**
 * Retained for backward-compatibility.
 * Background auto-engine is permanently disabled to eliminate background lag.
 */
export function startRealtimeEngine() {
  return () => {}
}
