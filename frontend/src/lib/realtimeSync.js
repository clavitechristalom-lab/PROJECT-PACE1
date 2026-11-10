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
 * Strictly targeted to the specific module and entity, invalidating isolated cache.
 */
export function triggerDataSync(module = 'general', extra = {}) {
  const targetId = extra?.id || extra?.targetId || null
  const action = extra?.action || 'mutation'

  // 1. Immediately invalidate targeted API cache so subsequent on-demand fetches are fresh
  if (module && module !== 'general') {
    clearApiCacheForModule(module, targetId)
  }

  // 2. Dispatch strictly targeted events
  if (typeof window !== 'undefined') {
    const detail = { module, targetId, action, timestamp: Date.now() }
    window.dispatchEvent(new CustomEvent('pace:data-sync', { detail }))
    if (module && module !== 'general') {
      window.dispatchEvent(new CustomEvent(`pace:sync:${module}`, { detail }))
    }
  }

  return { status: 'dispatched', module, targetId, action }
}

/**
 * React hook for strictly isolated, event-driven, on-demand synchronization.
 *
 * @param {Function} refreshFn - Sync callback to execute (receives source, signal, extraData)
 * @param {Array} deps - Dependency array
 * @param {Object} options - { enabled?: boolean, module?: string }
 */
export function useRealtimeSync(refreshFn, deps = [], options = {}) {
  const { enabled = true, module = 'general' } = typeof options === 'object' ? options : {}
  const [isSyncingState, setIsSyncingState] = useState(false)
  const refreshFnRef = useRef(refreshFn)
  const isFetchingRef = useRef(false)
  const isMountedRef = useRef(true)
  const debounceTimerRef = useRef(null)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    refreshFnRef.current = refreshFn
  }, [refreshFn])

  // Explicit, click-driven sync trigger with concurrency locking
  const handleManualSync = useCallback(async (targetId = null, extraData = null) => {
    if (!enabled || !isMountedRef.current) return

    const lockKey = targetId !== null && targetId !== undefined ? `${module}:${targetId}` : module
    if (activeSyncLocks.has(lockKey) || activeSyncLocks.has(`${module}:all`)) {
      return // Single-run locking: safely ignore duplicate concurrent clicks
    }

    if (isMountedRef.current) setIsSyncingState(true)
    try {
      await executeOnDemandSync({
        module,
        targetId,
        action: 'manual-click',
        syncFn: async ({ signal }) => {
          if (refreshFnRef.current && isMountedRef.current) {
            await refreshFnRef.current('manual', signal, extraData)
          }
        }
      })
    } finally {
      if (isMountedRef.current) setIsSyncingState(false)
    }
  }, [enabled, module])

  useEffect(() => {
    // Strictly isolate: do not attach wildcard listeners if module is generic or disabled
    if (!enabled || typeof window === 'undefined' || !module || module === 'general') {
      return
    }

    const onDataSync = (e) => {
      const mod = e?.detail?.module
      // Strictly isolated: only trigger if the event matches this component's specific module
      if (!mod || mod !== module) return

      // Micro-debounce & yield to the main thread (guarantees 60fps UI responsiveness)
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }

      debounceTimerRef.current = setTimeout(async () => {
        if (!isMountedRef.current || isFetchingRef.current) return
        isFetchingRef.current = true
        try {
          if (refreshFnRef.current && isMountedRef.current) {
            await refreshFnRef.current('event', undefined, e?.detail)
          }
        } catch (_) {
        } finally {
          isFetchingRef.current = false
        }
      }, 50)
    }

    window.addEventListener('pace:data-sync', onDataSync)
    const specificEvent = `pace:sync:${module}`
    window.addEventListener(specificEvent, onDataSync)

    return () => {
      window.removeEventListener('pace:data-sync', onDataSync)
      window.removeEventListener(specificEvent, onDataSync)
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
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
