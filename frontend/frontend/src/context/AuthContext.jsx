import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { api } from '../lib/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const raw = sessionStorage.getItem('pace_session') || localStorage.getItem('pace_session')
      if (!raw) return null
      const parsed = JSON.parse(raw)
      return parsed?.cached_user || null
    } catch {
      return null
    }
  })
  const [checkingAuth, setCheckingAuth] = useState(() => {
    const raw = sessionStorage.getItem('pace_session') || localStorage.getItem('pace_session')
    return !!raw
  })

  const verifySession = useCallback(async () => {
    const rawSession = sessionStorage.getItem('pace_session') || localStorage.getItem('pace_session')
    if (!rawSession) {
      setUser(null)
      setCheckingAuth(false)
      return
    }

    try {
      const session = JSON.parse(rawSession)
      if (!session?.user_id) {
        sessionStorage.removeItem('pace_session')
        localStorage.removeItem('pace_session')
        setUser(null)
        setCheckingAuth(false)
        return
      }

      // Verify session with Laravel API
      const data = await api.auth.me(session.user_id)
      if (data?.user && data.user.is_active) {
        setUser(data.user)
        // Update cached user payload
        const updated = JSON.stringify({
          ...session,
          cached_user: {
            ...data.user,
            role: data.user.role ? data.user.role.trim() : ''
          },
        })
        sessionStorage.setItem('pace_session', updated)
        localStorage.setItem('pace_session', updated)
      } else {
        sessionStorage.removeItem('pace_session')
        localStorage.removeItem('pace_session')
        setUser(null)
      }
    } catch (err) {
      console.warn('Session verification failed:', err)
      if (err.status === 401 || err.status === 403) {
        sessionStorage.removeItem('pace_session')
        localStorage.removeItem('pace_session')
        setUser(null)
      } else if (session?.cached_user) {
        // Retain cached user during network hiccups so user is not redirected
        setUser(session.cached_user)
      }
    } finally {
      setCheckingAuth(false)
    }
  }, [])

  useEffect(() => {
    verifySession()

    const handleExpired = () => {
      setUser(null)
      sessionStorage.removeItem('pace_session')
      localStorage.removeItem('pace_session')
    }
    window.addEventListener('auth:expired', handleExpired)
    return () => window.removeEventListener('auth:expired', handleExpired)
  }, [verifySession])

  const login = async (username, password, remember = true) => {
    try {
      const data = await api.auth.login(username, password)
      if (data?.user) {
        setUser(data.user)
        const sessionPayload = JSON.stringify({
          user_id: data.user.user_id,
          token: data.session_token,
          cached_user: data.user,
        })
        sessionStorage.setItem('pace_session', sessionPayload)
        localStorage.setItem('pace_session', sessionPayload)
        return { success: true, user: data.user }
      }
      return { success: false, message: data?.message || 'Login failed' }
    } catch (error) {
      console.error('Login error:', error)
      return { success: false, message: error.message || 'Invalid username or password' }
    }
  }

  const register = async (signUpData) => {
    try {
      const data = await api.auth.register(signUpData)
      return { success: true, user: data.user }
    } catch (error) {
      console.error('Register error:', error)
      return { success: false, message: error.message || 'Registration failed', errors: error.data?.errors || {} }
    }
  }

  const logout = async () => {
    try {
      if (user?.user_id) {
        await api.auth.logout(user.user_id)
      }
    } catch (e) {
      console.warn('Logout API error:', e)
    } finally {
      setUser(null)
      sessionStorage.removeItem('pace_session')
      localStorage.removeItem('pace_session')
    }
  }

  return (
    <AuthContext.Provider value={{ user, login, register, logout, checkingAuth, verifySession }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be inside AuthProvider')
  return ctx
}
