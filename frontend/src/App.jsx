import { Link, NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { useApp } from './state'
import { Spinner } from './components/ui'
import Auth from './pages/Auth'
import Home from './pages/Home'
import Settings from './pages/Settings'
import Calendar from './pages/Calendar'
import Tasks from './pages/Tasks'
import { ListsPage, ListDetail } from './pages/Lists'
import Notifications from './pages/Notifications'
import Trash from './pages/Trash'

const Tab = ({ to, icon, label, badge }) => (
  <NavLink to={to} end={to === '/'} className={({ isActive }) => `relative flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-semibold ${isActive ? 'text-accent' : 'text-mute'}`}>
    <span className="text-2xl leading-none">{icon}</span>{label}
    {badge > 0 && <span className="absolute right-[22%] top-1 min-w-[1.1rem] rounded-full bg-accent px-1 text-center text-[10px] leading-[1.1rem] text-accent-ink">{badge}</span>}
  </NavLink>
)

// Sezioni attivabili dalle impostazioni: chiave modulo → [percorso, icona, etichetta]
const SECTIONS = [['calendario', '/calendario', '📅', 'Calendario'], ['attivita', '/attivita', '✅', 'Attività'], ['liste', '/liste', '🛒', 'Liste']]

function Toast() {
  const { toast, closeToast } = useApp()
  if (!toast) return null
  return (
    <div role="status" className="fixed inset-x-0 bottom-20 z-40 mx-auto flex w-[calc(100%-2rem)] max-w-sm items-center justify-between gap-3 rounded-2xl bg-ink px-4 py-3 text-bg shadow-lg" style={{ marginBottom: 'env(safe-area-inset-bottom)' }}>
      <span>{toast.text}</span>
      {toast.action && <button className="font-bold underline" onClick={async () => { closeToast(); await toast.action.run() }}>{toast.action.label}</button>}
    </div>
  )
}

export default function App() {
  const { user, home, loading, couple } = useApp()
  if (loading) return <Spinner />
  if (!user || !home) return <Auth />
  const on = (k) => couple.modules?.[k] !== false
  const sections = SECTIONS.filter(([k]) => on(k))
  return (
    <div className="mx-auto min-h-screen max-w-md">
      <main className="px-4 pb-28 pt-[max(1.25rem,env(safe-area-inset-top))]">
        <Routes>
          <Route path="/" element={<Home />} />
          {on('calendario') && <Route path="/calendario" element={<Calendar />} />}
          {on('attivita') && <Route path="/attivita" element={<Tasks />} />}
          {on('liste') && <Route path="/liste" element={<ListsPage />} />}
          {on('liste') && <Route path="/liste/:id" element={<ListDetail />} />}
          <Route path="/notifiche" element={<Notifications />} />
          <Route path="/cestino" element={<Trash />} />
          <Route path="/impostazioni" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <Toast />
      <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-card/90 backdrop-blur" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="mx-auto flex max-w-md">
          <Tab to="/" icon="🏠" label="Home" badge={home.unread_notifications} />
          {sections.map(([, to, icon, label]) => <Tab key={to} to={to} icon={icon} label={label} />)}
          <Tab to="/impostazioni" icon="⚙️" label="Impostazioni" />
        </div>
      </nav>
    </div>
  )
}
