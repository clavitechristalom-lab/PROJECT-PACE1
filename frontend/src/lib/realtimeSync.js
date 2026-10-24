import { useEffect, useRef } from 'react'
import { api } from './api'

let syncInterval = null
let broadcastChannel = null
let lastLogId = null
let lastNotifId = null
let lastUnreadCount = null
let lastVerifCount = null
let lastQrCount = null
let isPolling = false

let eventSource = null

// Initialize BroadcastChannel if supported
try {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    broadcastChannel = new BroadcastChannel('pace_realtime_sync')
    broadcastChannel.onmessage = (event) => {
      if (event.data?.type === 'pace:data-sync') {
        window.dispatchEvent(new CustomEvent('pace:data-sync', { detail: event.data }))
      }
    }
  }
} catch (e) {
  // Fallback to storage event
}

// Fallback for cross-tab sync via localStorage
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === 'pace_cross_tab_sync' && e.newValue) {
      try {
        const payload = JSON.parse(e.newValue)
        window.dispatchEvent(new CustomEvent('pace:data-sync', { detail: payload }))
      } catch (_) {}
    }
  })
}

let lastEventSourceAttempt = 0
let sseSupported = true

/**
 * Connect to live Server-Sent Events (SSE) stream
 */
function connectEventSource() {
  if (!sseSupported || typeof window === 'undefined' || typeof EventSource === 'undefined') return

  // Prevent frantic reconnection loops (wait at least 15s between connection attempts)
  const now = Date.now()
  if (now - lastEventSourceAttempt < 15000) return
  lastEventSourceAttempt = now

  try {
    const raw = sessionStorage.getItem('pace_session') || localStorage.getItem('pace_session')
    let token = null
    if (raw) {
      try {
        const parsed = JSON.parse(raw)
        token = parsed.token || parsed.access_token
      } catch (_) {}
    }

    if (!token) return

    if (eventSource) {
      eventSource.close()
      eventSource = null
    }

    const streamUrl = `/api/sync/stream?token=${encodeURIComponent(token)}`
    eventSource = new EventSource(streamUrl)

    eventSource.addEventListener('connected', (e) => {
      try {
        const data = JSON.parse(e.data)
        if (data?.cli_server) {
          // Single-threaded PHP CLI server immediately closes SSE streams; rely on pollStatus() instead of reconnecting every 15s
          sseSupported = false
          if (eventSource) {
            eventSource.close()
            eventSource = null
          }
        }
      } catch (_) {}
    })

    eventSource.addEventListener('sync', (e) => {
      try {
        const data = JSON.parse(e.data)
        window.dispatchEvent(new CustomEvent('pace:data-sync', { detail: data }))
        if (data.type === 'notifications') {
          window.dispatchEvent(new CustomEvent('pace:notifications-sync', { detail: data }))
        }
      } catch (_) {}
    })

    eventSource.onerror = () => {
      if (eventSource) {
        eventSource.close()
        eventSource = null
      }
    }
  } catch (err) {
    // Falls back seamlessly to pollStatus
  }
}

/**
 * Trigger an immediate data sync across all components, open tabs, and connected users
 */
export function triggerDataSync(module = 'general', extra = {}) {
  const detail = { type: 'mutation', module, timestamp: Date.now(), ...extra }
  
  // 1. Local window dispatch
  window.dispatchEvent(new CustomEvent('pace:data-sync', { detail }))
  if (module === 'notifications') {
    window.dispatchEvent(new CustomEvent('pace:notifications-sync', { detail }))
  }

  // 2. Cross-tab broadcast
  try {
    if (broadcastChannel) {
      broadcastChannel.postMessage(detail)
    }
    localStorage.setItem('pace_cross_tab_sync', JSON.stringify(detail))
  } catch (e) {}

  // 3. Inform server so other remote dashboards receive instant SSE notification
  if (api.sync?.triggerSync) {
    api.sync.triggerSync(module).catch(() => {})
  }
}

/**
 * Poll sync status from backend (high-reliability fallback)
 */
let pollAbortController = null

async function pollStatus() {
  if (isPolling) return
  isPolling = true

  // Cancel prior hung poll if any
  if (pollAbortController) {
    try { pollAbortController.abort() } catch (_) {}
  }
  pollAbortController = new AbortController()

  try {
    const raw = sessionStorage.getItem('pace_session') || localStorage.getItem('pace_session')
    if (!raw) return

    const res = await api.sync.getStatus({ signal: pollAbortController.signal })
    if (!res) return

    // 1. Database log changes
    if (lastLogId !== null && res.latest_log_id !== lastLogId) {
      window.dispatchEvent(new CustomEvent('pace:data-sync', { 
        detail: { type: 'database', logId: res.latest_log_id, previousLogId: lastLogId } 
      }))
    }
    lastLogId = res.latest_log_id

    // 2. Notifications changes (ID changed or unread count changed)
    const notifsChanged = (
      lastNotifId !== null && (
        res.latest_notif_id !== lastNotifId ||
        res.unread_notifications !== lastUnreadCount
      )
    )

    if (notifsChanged) {
      window.dispatchEvent(new CustomEvent('pace:notifications-sync', { detail: res }))
    }
    lastNotifId = res.latest_notif_id
    lastUnreadCount = res.unread_notifications

    // 3. Attendance verifications
    if (lastVerifCount !== null && res.pending_verifications !== lastVerifCount) {
      window.dispatchEvent(new CustomEvent('pace:verifications-sync', { detail: res }))
    }
    lastVerifCount = res.pending_verifications

    // 4. QR requests
    if (lastQrCount !== null && res.pending_qr_requests !== lastQrCount) {
      window.dispatchEvent(new CustomEvent('pace:qr-requests-sync', { detail: res }))
    }
    lastQrCount = res.pending_qr_requests

    // 5. Centralized periodic tick (fires every 1.4s for synchronized 1-2s auto-refresh)
    window.dispatchEvent(new CustomEvent('pace:periodic-tick', { detail: res }))

  } catch (err) {
    // Silent fail on background poll (aborted, token expired, network momentary drop)
  } finally {
    isPolling = false
    pollAbortController = null
  }
}

/**
 * Start global real-time synchronization engine with strict 1.2s - 1.5s refresh cycle
 */
export function startRealtimeEngine() {
  if (syncInterval) clearInterval(syncInterval)
  
  // 1. Initial status check & SSE stream connection
  pollStatus()
  connectEventSource()

  // 2. Fast 1.4s background polling (target 1 to 2 seconds refresh)
  syncInterval = setInterval(() => {
    if (document.visibilityState === 'visible') {
      pollStatus()
      if (!eventSource) {
        connectEventSource()
      }
    }
  }, 1400)

  // 3. When tab becomes visible again, immediately check for updates
  const handleVisibility = () => {
    if (document.visibilityState === 'visible') {
      pollStatus()
      if (!eventSource) {
        connectEventSource()
      }
    }
  }
  document.addEventListener('visibilitychange', handleVisibility)

  return () => {
    if (syncInterval) clearInterval(syncInterval)
    if (eventSource) {
      eventSource.close()
      eventSource = null
    }
    if (pollAbortController) {
      try { pollAbortController.abort() } catch (_) {}
      pollAbortController = null
    }
    document.removeEventListener('visibilitychange', handleVisibility)
  }
}

/**
 * React hook to automatically keep any page or component updated in real time
 * with non-blocking execution, overlapping request cancellation, and strict 1-2s tick support.
 * 
 * @param {Function} refreshFn - The callback to execute when data should be refreshed (receives source, signal)
 * @param {Array} deps - Dependency array
 * @param {Object} options - { interval: ms, enabled: boolean, periodic: boolean }
 */
export function useRealtimeSync(refreshFn, deps = [], options = {}) {
  const { enabled = true, interval = 0, periodic = true } = options
  const isRefreshingRef = useRef(false)
  const lastRefreshTimeRef = useRef(0)
  const refreshFnRef = useRef(refreshFn)
  const activeAbortRef = useRef(null)

  useEffect(() => {
    refreshFnRef.current = refreshFn
  }, [refreshFn])

  useEffect(() => {
    if (!enabled) return

    const executeRefresh = async (source = 'auto') => {
      // Async lock: prevent request pile-up
      if (isRefreshingRef.current) return
      
      const now = Date.now()
      // Responsive debounce: allow smooth 1-2s refreshes while blocking redundant sub-second bursts
      if (source !== 'mutation' && now - lastRefreshTimeRef.current < 750) return
      
      // Cancel previous in-flight request if still running
      if (activeAbortRef.current) {
        try { activeAbortRef.current.abort() } catch (_) {}
      }
      activeAbortRef.current = new AbortController()

      isRefreshingRef.current = true
      lastRefreshTimeRef.current = now

      try {
        await refreshFnRef.current(source, activeAbortRef.current.signal)
      } catch (err) {
        if (err?.name !== 'AbortError') {
          console.warn(`[RealtimeSync] Auto-refresh (${source}) error:`, err)
        }
      } finally {
        isRefreshingRef.current = false
        activeAbortRef.current = null
      }
    }

    // 1. Listen for system-wide sync events (fired on actual data mutation or DB change)
    const handleSync = (e) => {
      executeRefresh(e.detail?.type || 'event')
    }
    window.addEventListener('pace:data-sync', handleSync)

    // 2. Synchronized periodic tick (hooked into central 1.4s pulse)
    const handlePeriodic = () => {
      if (document.visibilityState === 'visible') {
        executeRefresh('timer')
      }
    }
    if (periodic) {
      window.addEventListener('pace:periodic-tick', handlePeriodic)
    }

    // 3. Fallback standalone timer if custom interval specified
    let customTimer = null
    if (interval > 0) {
      customTimer = setInterval(() => {
        if (document.visibilityState === 'visible') {
          executeRefresh('timer')
        }
      }, interval)
    }

    return () => {
      window.removeEventListener('pace:data-sync', handleSync)
      if (periodic) {
        window.removeEventListener('pace:periodic-tick', handlePeriodic)
      }
      if (customTimer) clearInterval(customTimer)
      if (activeAbortRef.current) {
        try { activeAbortRef.current.abort() } catch (_) {}
        activeAbortRef.current = null
      }
    }
  }, [enabled, interval, periodic, ...deps])
}
