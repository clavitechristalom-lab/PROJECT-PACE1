import Echo from 'laravel-echo'
import Pusher from 'pusher-js'

if (typeof window !== 'undefined') {
  window.Pusher = Pusher
}

let echoInstance = null
let activeToken = null

function getAuthToken() {
  try {
    const raw = sessionStorage.getItem('pace_session')
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed?.token || null
  } catch {
    return null
  }
}

export function getEcho(explicitToken = null) {
  if (typeof window === 'undefined') return null
  const token = explicitToken || getAuthToken()
  if (!token) return null

  if (echoInstance && activeToken === token) {
    return echoInstance
  }

  disconnectEcho()

  const apiBase = import.meta.env.VITE_API_URL || '/api'
  const authEndpoint = `${apiBase.replace(/\/+$/, '')}/broadcasting/auth`
  const driver = (import.meta.env.VITE_BROADCAST_DRIVER || 'reverb').toLowerCase()
  const authHeaders = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
  }

  if (driver === 'pusher' && import.meta.env.VITE_PUSHER_APP_KEY) {
    const scheme = import.meta.env.VITE_PUSHER_SCHEME || 'https'
    const port = Number(import.meta.env.VITE_PUSHER_PORT || (scheme === 'https' ? 443 : 80))
    echoInstance = new Echo({
      broadcaster: 'pusher',
      key: import.meta.env.VITE_PUSHER_APP_KEY,
      cluster: import.meta.env.VITE_PUSHER_APP_CLUSTER || 'ap1',
      wsHost: import.meta.env.VITE_PUSHER_HOST || undefined,
      wsPort: port,
      wssPort: port,
      forceTLS: scheme === 'https',
      enabledTransports: ['ws', 'wss'],
      authEndpoint,
      auth: { headers: authHeaders },
    })
  } else {
    const host = import.meta.env.VITE_REVERB_HOST || window.location.hostname || '127.0.0.1'
    const scheme = import.meta.env.VITE_REVERB_SCHEME || 'http'
    const port = Number(import.meta.env.VITE_REVERB_PORT || 8080)
    const isTls = scheme === 'https'

    echoInstance = new Echo({
      broadcaster: 'reverb',
      key: import.meta.env.VITE_REVERB_APP_KEY || 'pace-zlicz-reverb-key',
      wsHost: host,
      wsPort: port,
      wssPort: port,
      forceTLS: isTls,
      enabledTransports: isTls ? ['ws', 'wss'] : ['ws'],
      authEndpoint,
      auth: { headers: authHeaders },
    })
  }

  activeToken = token
  return echoInstance
}

export function disconnectEcho() {
  if (echoInstance) {
    try {
      echoInstance.disconnect()
    } catch {
    }
    echoInstance = null
    activeToken = null
  }
}
