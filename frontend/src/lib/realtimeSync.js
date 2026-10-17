import { useEffect, useRef } from 'react'
import { api } from './api'

let syncInterval = null
let broadcastChannel = null
let lastLogId = null
let lastNotifId = null
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

/**
 * Connect to live Server-Sent Events (SSE) stream
 */
function connectEventSource() {
  if (typeof window === 'undefined' || typeof EventSource === 'undefined') return

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
async function pollStatus() {
  if (isPolling) return
  isPolling = true
  try {
    const raw = sessionStorage.getItem('pace_session') || localStorage.getItem('pace_session')
    if (!raw) return

    const res = await api.sync.getStatus()
    if (!res) return

    // 1. Database log changes
    if (lastLogId !== null && res.latest_log_id > lastLogId) {
      window.dispatchEvent(new CustomEvent('pace:data-sync', { 
        detail: { type: 'database', logId: res.latest_log_id, previousLogId: lastLogId } 
      }))
    }
    lastLogId = res.latest_log_id

    // 2. Notifications changes
    if (lastNotifId === null || res.latest_notif_id !== lastNotifId || res.unread_notifications !== lastNotifId) {
      window.dispatchEvent(new CustomEvent('pace:notifications-sync', { detail: res }))
      lastNotifId = res.latest_notif_id
    }

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

  } catch (err) {
    // Silent fail on background poll (e.g. token expired, network momentary drop)
  } finally {
    isPolling = false
  }
}

/**
 * Start global real-time synchronization engine
 */
export function startRealtimeEngine() {
  if (syncInterval) clearInterval(syncInterval)
  
  // 1. Initial status check & SSE stream connection
  pollStatus()
  connectEventSource()

  // 2. Periodic poll fallback (every 2.5s when tab is active)
  syncInterval = setInterval(() => {
    if (document.visibilityState === 'visible') {
      pollStatus()
      if (!eventSource) {
        connectEventSource()
      }
    }
  }, 2500)

  // 3. When tab becomes visible again, immediately re-verify
  const handleVisibility = () => {
    if (document.visibilityState === 'visible') {
      pollStatus()
      if (!eventSource) {
        connectEventSource()
      }
      window.dispatchEvent(new CustomEvent('pace:data-sync', { detail: { type: 'tab_focus' } }))
    }
  }
  document.addEventListener('visibilitychange', handleVisibility)

  return () => {
    if (syncInterval) clearInterval(syncInterval)
    if (eventSource) {
      eventSource.close()
      eventSource = null
    }
    document.removeEventListener('visibilitychange', handleVisibility)
  }
}

/**
 * React hook to automatically keep any page or component updated in real time.
 * @param {Function} refreshFn - The callback to execute when data should be refreshed
 * @param {Array} deps - Dependency array
 * @param {Object} options - { interval: ms (default 5000), enabled: boolean }
 */
export function useRealtimeSync(refreshFn, deps = [], options = {}) {
  const { interval = 5000, enabled = true } = options
  const isRefreshingRef = useRef(false)
  const refreshFnRef = useRef(refreshFn)

  useEffect(() => {
    refreshFnRef.current = refreshFn
  }, [refreshFn])

  useEffect(() => {
    if (!enabled) return

    const executeRefresh = async (source = 'auto') => {
      if (isRefreshingRef.current) return
      isRefreshingRef.current = true
      try {
        await refreshFnRef.current(source)
      } catch (err) {
        console.warn(`[RealtimeSync] Auto-refresh (${source}) error:`, err)
      } finally {
        isRefreshingRef.current = false
      }
    }

    // 1. Listen for system-wide sync events
    const handleSync = (e) => {
      executeRefresh(e.detail?.type || 'event')
    }
    window.addEventListener('pace:data-sync', handleSync)

    // 2. Periodic background refresh
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        executeRefresh('timer')
      }
    }, interval)

    // 3. Window focus / visibility
    const handleFocus = () => {
      executeRefresh('focus')
    }
    window.addEventListener('focus', handleFocus)

    return () => {
      window.removeEventListener('pace:data-sync', handleSync)
      window.removeEventListener('focus', handleFocus)
      clearInterval(timer)
    }
  }, [enabled, interval, ...deps])
}
