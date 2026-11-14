import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { useApp } from './state'
import { Spinner } from './components/ui'
import Auth from './pages/Auth'
import Home from './pages/Home'
import Settings from './pages/Settings'

const Tab = ({ to, icon, label }) => (
  <NavLink to={to} end className={({ isActive }) => `flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-semibold ${isActive ? 'text-accent' : 'text-mute'}`}>
    <span className="text-2xl leading-none">{icon}</span>{label}
  </NavLink>
)

export default function App() {
  const { user, home, loading } = useApp()
  if (loading) return <Spinner />
  if (!user || !home) return <Auth />
  return (
    <div className="mx-auto min-h-screen max-w-md">
      <main className="px-4 pb-28 pt-[max(1.25rem,env(safe-area-inset-top))]">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/impostazioni" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-card/90 backdrop-blur" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="mx-auto flex max-w-md">
          <Tab to="/" icon="🏠" label="Home" />
          <Tab to="/impostazioni" icon="⚙️" label="Impostazioni" />
        </div>
      </nav>
    </div>
  )
}
