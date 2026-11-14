import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import { AppProvider } from './state'
import App from './App'
import './index.css'
import { applyLook } from './util'

try {
  if (new URLSearchParams(location.search).get('sfondo') === 'off') {
    localStorage.removeItem('sfondo-foto'); localStorage.setItem('sfondo-off', '1')
    const l = JSON.parse(localStorage.getItem('look') || '{}'); l.bg = 'nessuno'; localStorage.setItem('look', JSON.stringify(l))
    history.replaceState(null, '', location.pathname)
  }
} catch { /* ignora */ }
applyLook() // colori e sfondo salvati su questo dispositivo, subito all'avvio

registerSW({ immediate: true })

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AppProvider>
        <App />
      </AppProvider>
    </BrowserRouter>
  </StrictMode>,
)
