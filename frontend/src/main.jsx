import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ThemeProvider } from './context/ThemeContext'
import { AuthProvider } from './context/AuthContext'
import { IconContext } from 'react-icons'
import './index.css'

// Handle Vite dynamic import preload failures (e.g. after builds, dev server restarts, or network blips)
if (typeof window !== 'undefined') {
  // Open the native calendar picker whenever any enabled date input is clicked
  document.addEventListener('click', (event) => {
    const target = event.target
    if (!(target instanceof HTMLInputElement) || target.type !== 'date') return
    if (target.disabled || target.readOnly) return
    try {
      if (typeof target.showPicker === 'function') {
        target.showPicker()
      }
    } catch (_) {
      // Ignore if browser rejects showPicker() or picker is already active
    }
  })

  window.addEventListener('vite:preloadError', (event) => {
    console.warn('Vite preload error detected, refreshing page...', event)
    window.location.reload()
  })

  window.addEventListener('unhandledrejection', (event) => {
    if (event?.reason?.message?.includes('Failed to fetch dynamically imported module')) {
      console.warn('Dynamic import failure caught, reloading to pull latest assets...')
      const reloadKey = 'pace_dynamic_import_reload'
      const lastReload = sessionStorage.getItem(reloadKey)
      const now = Date.now()
      if (!lastReload || now - parseInt(lastReload, 10) > 8000) {
        sessionStorage.setItem(reloadKey, now.toString())
        window.location.reload()
      }
    }
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <ThemeProvider>
        <IconContext.Provider value={{ className: "theme-icon" }}>
          <App />
        </IconContext.Provider>
      </ThemeProvider>
    </AuthProvider>
  </React.StrictMode>,
)
