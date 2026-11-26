import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ThemeProvider } from './context/ThemeContext'
import { AuthProvider } from './context/AuthContext'
import { RealtimeSyncProvider } from './context/RealtimeSyncContext'
import { IconContext } from 'react-icons'
import './index.css'

if (typeof window !== 'undefined') {
  document.addEventListener('click', (event) => {
    const target = event.target
    if (!(target instanceof HTMLInputElement) || target.type !== 'date') return
    if (target.disabled || target.readOnly) return
    try {
      if (typeof target.showPicker === 'function') {
        target.showPicker()
      }
    } catch {
    }
  })

  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault()
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <RealtimeSyncProvider>
        <ThemeProvider>
          <IconContext.Provider value={{ className: 'theme-icon' }}>
            <App />
          </IconContext.Provider>
        </ThemeProvider>
      </RealtimeSyncProvider>
    </AuthProvider>
  </React.StrictMode>,
)
