import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { useAuth } from './AuthContext'

const ThemeContext = createContext()

function normalizeRoleKey(role) {
  const r = String(role || '').trim().toLowerCase()
  if (r === 'administrator' || r === 'admin') return 'admin'
  if (r === 'store administrator' || r === 'store admin' || r === 'store_admin') return 'store_admin'
  if (r === 'employee') return 'employee'
  if (r === 'customer') return 'customer'
  return 'public'
}

function getCurrentRoleKey(user) {
  if (user?.role) {
    return normalizeRoleKey(user.role)
  }
  try {
    const raw = sessionStorage.getItem('pace_session')
    if (raw) {
      const parsed = JSON.parse(raw)
      const cachedRole = parsed?.cached_user?.role || parsed?.role
      if (cachedRole) return normalizeRoleKey(cachedRole)
    }
  } catch (_) {}
  return 'public'
}

function getStorageKeyForRole(roleKey) {
  return `app_theme_${roleKey}`
}

function readModeForRole(roleKey) {
  try {
    const val = localStorage.getItem(getStorageKeyForRole(roleKey))
    if (val === 'dark' || val === 'light') return val
  } catch (_) {}
  return 'light'
}

export function ThemeProvider({ children }) {
  const auth = useAuth()
  const roleKey = getCurrentRoleKey(auth?.user)

  const [themesByRole, setThemesByRole] = useState(() => ({
    admin: readModeForRole('admin'),
    store_admin: readModeForRole('store_admin'),
    employee: readModeForRole('employee'),
    customer: readModeForRole('customer'),
    public: readModeForRole('public'),
  }))

  // Ensure latest value from localStorage is synced when switching roles
  useEffect(() => {
    const saved = readModeForRole(roleKey)
    setThemesByRole((prev) => (prev[roleKey] === saved ? prev : { ...prev, [roleKey]: saved }))
  }, [roleKey])

  const mode = themesByRole[roleKey] || 'light'

  useEffect(() => {
    const root = document.documentElement
    if (mode === 'dark') {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
  }, [mode, roleKey])

  const setMode = useCallback((nextModeOrUpdater) => {
    setThemesByRole((prev) => {
      const currentMode = prev[roleKey] || readModeForRole(roleKey)
      const resolved = typeof nextModeOrUpdater === 'function'
        ? nextModeOrUpdater(currentMode)
        : nextModeOrUpdater
      const finalMode = resolved === 'dark' ? 'dark' : 'light'
      try {
        localStorage.setItem(getStorageKeyForRole(roleKey), finalMode)
      } catch (_) {}
      return { ...prev, [roleKey]: finalMode }
    })
  }, [roleKey])

  const toggleMode = useCallback(() => {
    setMode((prev) => (prev === 'light' ? 'dark' : 'light'))
  }, [setMode])

  const isDark = mode === 'dark'

  return (
    <ThemeContext.Provider value={{ mode, theme: mode, roleKey, setMode, toggleMode, isDark }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}
