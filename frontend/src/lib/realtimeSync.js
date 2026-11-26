import { useState, useEffect, useRef, useCallback } from 'react'
import { clearApiCacheForModule, RELATED_MODULE_INVALIDATIONS } from './api'
export { fastDeepEqual, setIfChanged } from './diff'
export { SyncButton, OnDemandSyncButton, default as DefaultSyncButton } from '../components/SyncButton'

const MODULE_SESSION_CACHE_KEYS = {
  attendance: ['pace_cached_attendance_records', 'pace_cached_attendance_summary'],
  employees: ['pace_cached_employees'],
  customers: ['pace_cached_customers', 'pace_cached_cust_stats', 'pace_cached_cust_inst'],
  products: ['pace_cached_products', 'pace_cached_branches'],
  categories: ['pace_cached_products'],
  branches: ['pace_cached_branches', 'pace_cached_dash_branches'],
  sales: ['pace_cached_sales', 'pace_cached_dash_stats', 'pace_cached_dash_charts', 'pace_cached_dash_recent'],
  payments: ['pace_cached_cust_stats', 'pace_cached_cust_inst', 'pace_cached_dash_stats', 'pace_cached_dash_charts', 'pace_cached_dash_recent'],
  installments: ['pace_cached_installments', 'pace_cached_cust_stats', 'pace_cached_cust_inst', 'pace_cached_dash_stats'],
  customer_installments: ['pace_cached_installments', 'pace_cached_cust_stats', 'pace_cached_cust_inst', 'pace_cached_dash_stats'],
  payroll: ['pace_cached_payroll', 'pace_cached_periods'],
  dashboard: ['pace_cached_dash_stats', 'pace_cached_dash_charts', 'pace_cached_dash_recent', 'pace_cached_dash_branches'],
  store_dashboard: ['pace_cached_dash_stats', 'pace_cached_dash_charts', 'pace_cached_dash_recent', 'pace_cached_dash_branches'],
  employee_dashboard: ['pace_cached_dash_stats', 'pace_cached_dash_charts', 'pace_cached_dash_recent', 'pace_cached_dash_branches'],
}

function clearSessionCacheForModules(modules) {
  try {
    if (typeof sessionStorage === 'undefined') return
    for (const mod of modules) {
      const keys = MODULE_SESSION_CACHE_KEYS[mod]
      if (keys) {
        keys.forEach((k) => sessionStorage.removeItem(k))
      }
    }
  } catch {
  }
}

const activeSyncLocks = new Set()
const syncDebounceTimestamps = new Map()
const syncAbortControllers = new Map()
const pendingDispatchTimers = new Map()

export function isSyncing(key = 'general') {
  return activeSyncLocks.has(key)
}

export async function executeOnDemandSync({
  module = 'general',
  targetId = null,
  action = 'sync',
  payload = null,
  syncFn = null,
  onSuccess = null,
  onError = null,
} = {}) {
  const lockKey = targetId !== null && targetId !== undefined ? `${module}:${targetId}` : module

  if (activeSyncLocks.has(lockKey) || activeSyncLocks.has(`${module}:all`)) {
    return { status: 'ignored', reason: 'already_syncing' }
  }

  const now = Date.now()
  const lastTime = syncDebounceTimestamps.get(lockKey) || 0
  if (now - lastTime < 400) {
    return { status: 'ignored', reason: 'debounced' }
  }
  syncDebounceTimestamps.set(lockKey, now)

  activeSyncLocks.add(lockKey)

  if (syncAbortControllers.has(lockKey)) {
    try {
      syncAbortControllers.get(lockKey).abort()
    } catch {
    }
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
        signal: controller.signal,
      })
    }

    if (module) {
      clearApiCacheForModule(module, targetId)
    }

    if (typeof onSuccess === 'function') {
      onSuccess({ module, targetId, action, result })
    }

    return { status: 'success', result }
  } catch (err) {
    if (err?.name !== 'AbortError') {
      console.error(`[RealtimeSync] Action failed for ${module}${targetId ? ` (ID: ${targetId})` : ''}:`, err?.message || err)
      if (typeof onError === 'function') {
        onError(err)
      }
    }
    return { status: 'error', error: err }
  } finally {
    activeSyncLocks.delete(lockKey)
    syncAbortControllers.delete(lockKey)
  }
}

export function triggerDataSync(module = 'general', extra = {}) {
  const targetId = extra?.id || extra?.targetId || null
  const action = extra?.action || 'mutation'

  if (module && module !== 'general') {
    const modKey = String(module).toLowerCase()
    const modulesToClear = RELATED_MODULE_INVALIDATIONS[modKey] || [modKey]
    modulesToClear.forEach((m) => clearApiCacheForModule(m, m === modKey ? targetId : null))
    clearSessionCacheForModules(modulesToClear)
  }

  if (typeof window !== 'undefined') {
    const eventName = module && module !== 'general' ? `pace:sync:${module}` : 'pace:data-sync'
    const existingTimer = pendingDispatchTimers.get(eventName)
    if (existingTimer) {
      clearTimeout(existingTimer)
    }
    const timer = setTimeout(() => {
      pendingDispatchTimers.delete(eventName)
      const detail = {
        module,
        targetId,
        action,
        payload: extra?.payload || null,
        eventName: extra?.eventName || null,
        timestamp: Date.now(),
      }
      window.dispatchEvent(new CustomEvent(eventName, { detail }))
    }, 60)
    pendingDispatchTimers.set(eventName, timer)
  }

  return { status: 'dispatched', module, targetId, action }
}

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

  const handleManualSync = useCallback(async (targetId = null, extraData = null) => {
    if (!enabled || !isMountedRef.current) return

    const lockKey = targetId !== null && targetId !== undefined ? `${module}:${targetId}` : module
    if (activeSyncLocks.has(lockKey) || activeSyncLocks.has(`${module}:all`)) {
      return
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
        },
      })
    } finally {
      if (isMountedRef.current) setIsSyncingState(false)
    }
  }, [enabled, module])

  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || !module || module === 'general') {
      return
    }

    const onDataSync = (e) => {
      const mod = e?.detail?.module
      if (!mod || mod !== module || isFetchingRef.current) return

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
        } catch {
        } finally {
          isFetchingRef.current = false
        }
      }, 50)
    }

    const specificEvent = `pace:sync:${module}`
    window.addEventListener(specificEvent, onDataSync)

    return () => {
      window.removeEventListener(specificEvent, onDataSync)
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [enabled, module])

  return {
    sync: handleManualSync,
    triggerSync: handleManualSync,
    isSyncing: isSyncingState,
  }
}

export function useOnDemandSync(module, syncFn, options = {}) {
  return useRealtimeSync(syncFn, [], { ...options, module })
}

export function startRealtimeEngine() {
  return () => {}
}
