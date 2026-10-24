import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../lib/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const raw = sessionStorage.getItem('pace_session')
      if (!raw) return null
      const parsed = JSON.parse(raw)
      return parsed?.cached_user || null
    } catch {
      return null
    }
  })
  const [checkingAuth, setCheckingAuth] = useState(() => {
    const raw = sessionStorage.getItem('pace_session')
    if (!raw) return false
    try {
      const parsed = JSON.parse(raw)
      return !parsed?.cached_user
    } catch {
      return false
    }
  })
  const skipNextVerifyRef = useRef(false)

  const verifySession = useCallback(async () => {
    // If login() just succeeded, skip this verify cycle to prevent flashing a loader
    if (skipNextVerifyRef.current) {
      skipNextVerifyRef.current = false
      setCheckingAuth(false)
      return
    }

    const rawSession = sessionStorage.getItem('pace_session')
    if (!rawSession) {
      setUser(null)
      setCheckingAuth(false)
      return
    }

    let session = null
    try {
      session = JSON.parse(rawSession)
      if (!session?.user_id) {
        sessionStorage.removeItem('pace_session')
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
      } else {
        sessionStorage.removeItem('pace_session')
        setUser(null)
      }
    } catch (err) {
      console.warn('Session verification failed:', err)
      if (err.status === 401 || err.status === 403) {
        sessionStorage.removeItem('pace_session')
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
      setCheckingAuth(false)
      sessionStorage.removeItem('pace_session')
    }
    window.addEventListener('auth:expired', handleExpired)
    return () => window.removeEventListener('auth:expired', handleExpired)
  }, [verifySession])

  const login = async (username, password, remember = true) => {
    try {
      const data = await api.auth.login(username, password)
      if (data?.requires_otp) {
        return {
          success: true,
          requires_otp: true,
          user_id: data.user_id,
          username: data.username,
          masked_email: data.masked_email,
          message: data.message,
          expires_in_seconds: data.expires_in_seconds,
          cooldown_seconds: data.cooldown_seconds || 60,
        }
      }
      if (data?.user) {
        // Mark to skip the next verifySession triggered by storage change
        skipNextVerifyRef.current = true
        setUser(data.user)
        setCheckingAuth(false)
        const sessionPayload = JSON.stringify({
          user_id: data.user.user_id,
          token: data.session_token,
          cached_user: data.user,
        })
        sessionStorage.setItem('pace_session', sessionPayload)
        return { success: true, user: data.user }
      }
      return { success: false, message: data?.message || 'Login failed' }
    } catch (error) {
      console.error('Login error:', error)
      return { success: false, message: error.message || 'Incorrect email or password. Please try again.' }
    }
  }

  const verifyLoginOtp = async (userIdOrTarget, otp) => {
    try {
      const data = await api.auth.loginVerifyOtp(userIdOrTarget, otp)
      const token = data?.session_token || data?.token;
      if (data?.user && token) {
        skipNextVerifyRef.current = true
        setUser(data.user)
        setCheckingAuth(false)
        const sessionPayload = JSON.stringify({
          user_id: data.user.user_id,
          token: token,
          cached_user: data.user,
        })
        sessionStorage.setItem('pace_session', sessionPayload)
        return { success: true, user: data.user }
      }
      return { success: false, message: data?.message || 'Login verification failed' }
    } catch (error) {
      console.error('Verify login OTP error:', error)
      return { success: false, message: error.message || 'Invalid or expired OTP code.' }
    }
  }

  const resendLoginOtp = async (userIdOrTarget) => {
    try {
      const data = await api.auth.loginResendOtp(userIdOrTarget)
      return {
        success: true,
        message: data.message,
        cooldown_seconds: data.cooldown_seconds || 60,
      }
    } catch (error) {
      console.error('Resend login OTP error:', error)
      return {
        success: false,
        message: error.message || 'Failed to resend code. Please try again.',
      }
    }
  }

  const register = async (signUpData) => {
    try {
      const data = await api.auth.register(signUpData)
      if (data?.requires_otp) {
        return {
          success: true,
          requires_otp: true,
          user_id: data.user_id,
          username: data.username,
          email: data.email,
          masked_email: data.masked_email,
          message: data.message,
          expires_in_seconds: data.expires_in_seconds || 900,
          cooldown_seconds: data.cooldown_seconds || 60,
        }
      }
      const token = data?.session_token || data?.token
      if (data?.user && token) {
        skipNextVerifyRef.current = true
        setUser(data.user)
        setCheckingAuth(false)
        const sessionPayload = JSON.stringify({
          user_id: data.user.user_id,
          token: token,
          cached_user: data.user,
        })
        sessionStorage.setItem('pace_session', sessionPayload)
      }
      return { success: true, user: data?.user, token: token, message: data?.message }
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
      sessionStorage.removeItem('pace_last_path')
    }
  }

  return (
    <AuthContext.Provider value={{ user, login, verifyLoginOtp, resendLoginOtp, register, logout, checkingAuth, verifySession }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be inside AuthProvider')
  return ctx
}
