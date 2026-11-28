import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from './AuthContext'
import { getEcho, disconnectEcho } from '../lib/echo'
import { triggerDataSync } from '../lib/realtimeSync'
import { showToast } from '../components/ui'

const RealtimeSyncContext = createContext({
  connected: false,
  channels: [],
  lastEvent: null,
})

const DOMAIN_EVENTS = [
  '.sales.created',
  '.installment.created',
  '.installment.schedule.updated',
  '.installment.completed',
  '.payment.workflow.updated',
  '.inventory.updated',
  '.attendance.logged',
  '.leave.updated',
  '.payroll.generated',
  '.notification.created',
]

function resolveAuthorizedChannels(user) {
  if (!user) return []
  const role = String(user.role || '').trim().toLowerCase()
  const channels = new Set()

  if (role === 'administrator' || role === 'admin') {
    channels.add('admin.global')
    if (user.user_id) {
      channels.add(`employee.${user.user_id}`)
    }
    return Array.from(channels)
  }

  if (role === 'store administrator' || role === 'store admin' || role === 'employee') {
    const branchId = user.employee?.branch_id || user.branch_id
    if (branchId) {
      channels.add(`branch.${branchId}`)
    }
    if (user.user_id) {
      channels.add(`employee.${user.user_id}`)
    }
    return Array.from(channels)
  }

  if (role === 'customer') {
    const customerId = user.customer?.customer_id || user.customer_id
    if (customerId) {
      channels.add(`customer.${customerId}`)
    }
    return Array.from(channels)
  }

  return []
}

function getSessionToken() {
  try {
    const raw = sessionStorage.getItem('pace_session')
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed?.token || null
  } catch {
    return null
  }
}

export function RealtimeSyncProvider({ children }) {
  const { user } = useAuth()
  const [connected, setConnected] = useState(false)
  const [lastEvent, setLastEvent] = useState(null)
  const seenEventsRef = useRef(new Map())
  const subscribedChannelsRef = useRef([])

  const userKey = useMemo(() => {
    if (!user) return ''
    const branchId = user.employee?.branch_id || user.branch_id || ''
    const customerId = user.customer?.customer_id || user.customer_id || ''
    const dept = user.employee?.department || user.employee?.position || ''
    return `${user.user_id || ''}:${user.role || ''}:${branchId}:${customerId}:${dept}`
  }, [user])

  const channels = useMemo(() => resolveAuthorizedChannels(user), [userKey])

  useEffect(() => {
    const token = getSessionToken()
    if (!user || !token || channels.length === 0) {
      subscribedChannelsRef.current = []
      setConnected(false)
      disconnectEcho()
      return
    }

    const echo = getEcho(token)
    if (!echo) {
      setConnected(false)
      return
    }

    const pusherConn = echo.connector?.pusher?.connection
    const handleConnected = () => setConnected(true)
    const handleDisconnected = () => setConnected(false)

    if (pusherConn) {
      setConnected(pusherConn.state === 'connected')
      pusherConn.bind('connected', handleConnected)
      pusherConn.bind('disconnected', handleDisconnected)
      pusherConn.bind('unavailable', handleDisconnected)
      pusherConn.bind('failed', handleDisconnected)
    }

    const handleDomainPayload = (eventName, payload) => {
      if (!payload || typeof payload !== 'object') return

      const now = Date.now()
      for (const [sig, ts] of seenEventsRef.current.entries()) {
        if (now - ts > 3000) {
          seenEventsRef.current.delete(sig)
        }
      }

      const entityId =
        payload.payment_id ||
        payload.installment_id ||
        payload.sale_id ||
        payload.scan_log_id ||
        payload.letter_id ||
        payload.payroll_id ||
        payload.period_id ||
        payload.product_id ||
        payload.notification_id ||
        ''
      const dedupeKey = `${eventName}:${entityId}:${payload.stage || payload.action || payload.status || ''}:${payload.timestamp || ''}`
      if (seenEventsRef.current.has(dedupeKey)) {
        return
      }
      seenEventsRef.current.set(dedupeKey, now)

      setLastEvent({ name: eventName, payload, receivedAt: now })

      const modules = Array.isArray(payload.modules) ? payload.modules : []
      modules.forEach((mod) => {
        if (mod && mod !== 'notifications') {
          triggerDataSync(mod, {
            id: entityId || null,
            action: 'broadcast',
            eventName,
            payload,
          })
        }
      })

      if (eventName === '.notification.created' || modules.includes('notifications')) {
        window.dispatchEvent(new CustomEvent('pace:notifications-sync', { detail: payload }))
      }

      if (eventName === '.attendance.logged') {
        window.dispatchEvent(new CustomEvent('pace:verifications-sync', { detail: payload }))
        window.dispatchEvent(new CustomEvent('pace:attendance-scan-update', { detail: payload }))
      }

      if (eventName === '.payment.workflow.updated') {
        window.dispatchEvent(new CustomEvent('pace:payment-status-update', { detail: payload }))
      }

      if (eventName === '.installment.completed') {
        window.dispatchEvent(new CustomEvent('pace:installment-completed', { detail: payload }))
      }

      const isSelfAction =
        payload.actor_user_id !== null &&
        payload.actor_user_id !== undefined &&
        Number(payload.actor_user_id) === Number(user.user_id)

      if (!isSelfAction && payload.toast_message) {
        const toastType = payload.stage === 'store_admin_rejected' ? 'warning' : 'info'
        const text = payload.toast_title
          ? `${payload.toast_title}: ${payload.toast_message}`
          : payload.toast_message
        showToast(text, toastType)
      }
    }

    const activeRefs = []
    channels.forEach((channelName) => {
      const ch = echo.private(channelName)
      DOMAIN_EVENTS.forEach((evt) => {
        ch.listen(evt, (payload) => handleDomainPayload(evt, payload))
      })
      activeRefs.push(channelName)
    })
    subscribedChannelsRef.current = activeRefs

    return () => {
      activeRefs.forEach((channelName) => {
        try {
          echo.leave(channelName)
        } catch {
        }
      })
      if (pusherConn) {
        pusherConn.unbind('connected', handleConnected)
        pusherConn.unbind('disconnected', handleDisconnected)
        pusherConn.unbind('unavailable', handleDisconnected)
        pusherConn.unbind('failed', handleDisconnected)
      }
      subscribedChannelsRef.current = []
      disconnectEcho()
      setConnected(false)
    }
  }, [userKey, channels])

  const value = useMemo(
    () => ({
      connected,
      channels,
      lastEvent,
    }),
    [connected, channels, lastEvent]
  )

  return (
    <RealtimeSyncContext.Provider value={value}>
      {children}
    </RealtimeSyncContext.Provider>
  )
}

export function useRealtimeConnection() {
  return useContext(RealtimeSyncContext)
}
