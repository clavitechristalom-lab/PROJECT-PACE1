import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import { IconContext } from 'react-icons'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <IconContext.Provider value={{ className: "theme-icon" }}>
          <App />
        </IconContext.Provider>
      </AuthProvider>
    </ThemeProvider>
  </React.StrictMode>,
)
