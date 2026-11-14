import { lazy, Suspense } from 'react'
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { LayoutGrid, Home as HomeIcon } from 'lucide-react'
import { SECTIONS } from './modules'
import More from './pages/More'
import { useApp } from './state'
import { Spinner } from './components/ui'
import Auth from './pages/Auth'
import Home from './pages/Home'
const Settings = lazy(() => import('./pages/Settings'))
const Calendar = lazy(() => import('./pages/Calendar'))
const Tasks = lazy(() => import('./pages/Tasks'))
const ListsPage = lazy(() => import('./pages/Lists').then((m) => ({ default: m.ListsPage })))
const ListDetail = lazy(() => import('./pages/Lists').then((m) => ({ default: m.ListDetail })))
const Notifications = lazy(() => import('./pages/Notifications'))
const Trash = lazy(() => import('./pages/Trash'))
const Domanda = lazy(() => import('./pages/Domanda'))
const Decidere = lazy(() => import('./pages/Decidere'))
const FareInsieme = lazy(() => import('./pages/FareInsieme'))
const Desideri = lazy(() => import('./pages/Desideri'))
const BuonoASapersi = lazy(() => import('./pages/BuonoASapersi'))
const Note = lazy(() => import('./pages/Note'))
const Viaggi = lazy(() => import('./pages/Viaggi'))
const Risparmi = lazy(() => import('./pages/Risparmi'))
const Spese = lazy(() => import('./pages/Spese'))
const Cassaforte = lazy(() => import('./pages/Cassaforte'))
const Disegno = lazy(() => import('./pages/Disegno'))
const Ciclo = lazy(() => import('./pages/Ciclo'))
const Anno = lazy(() => import('./pages/Anno'))
const TriviaHome = lazy(() => import('./pages/Trivia').then((m) => ({ default: m.TriviaHome })))
const TriviaMatch = lazy(() => import('./pages/Trivia').then((m) => ({ default: m.TriviaMatch })))
const Foto = lazy(() => import('./pages/Foto'))

const Tab = ({ to, icon: Icon, label, active }) => (
  <NavLink to={to} end={to === '/'} className={({ isActive }) => `flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-2 text-[11px] font-medium transition ${(active ?? isActive) ? 'bg-accent/15 text-accent' : 'text-mute'}`}>
    <Icon size={22} strokeWidth={1.6} />{label}
  </NavLink>
)

import OfflineBanner from './components/OfflineBanner'

function Toast() {
  const { toast, closeToast } = useApp()
  if (!toast) return null
  return (
    <div role="status" className="toast-in fixed inset-x-0 bottom-24 z-40 mx-auto flex w-[calc(100%-2rem)] max-w-sm items-center justify-between gap-3 rounded-2xl bg-ink px-4 py-3 text-bg shadow-lg" style={{ marginBottom: 'env(safe-area-inset-bottom)' }}>
      <span>{toast.text}</span>
      {toast.action && <button className="font-bold underline" onClick={async () => { closeToast(); await toast.action.run() }}>{toast.action.label}</button>}
    </div>
  )
}

export default function App() {
  const { user, home, loading, couple } = useApp()
  const { pathname } = useLocation()
  if (loading) return <Spinner />
  if (!user || !home) return <Auth />
  const on = (k) => couple.modules?.[k] !== false
  const navItems = SECTIONS.filter((x) => x.nav && on(x.key))
  const inNav = pathname === '/' || navItems.some((x) => pathname.startsWith(x.path))
  return (
    <div className="mx-auto min-h-screen max-w-md">
      <OfflineBanner />
      <main className="px-4 pb-32 pt-[max(1.25rem,env(safe-area-inset-top))]">
        <Suspense fallback={<div className="skeleton" aria-busy="true"><i /><i /><i /></div>}>
        <Routes>
          <Route path="/" element={<Home />} />
          {on('calendario') && <Route path="/calendario" element={<Calendar />} />}
          {on('attivita') && <Route path="/attivita" element={<Tasks />} />}
          {on('liste') && <Route path="/liste" element={<ListsPage />} />}
          {on('liste') && <Route path="/liste/:id" element={<ListDetail />} />}
          {on('domanda') && <Route path="/domanda" element={<Domanda />} />}
          {on('decidere') && <Route path="/decidere" element={<Decidere />} />}
          {on('fare_insieme') && <Route path="/fare-insieme" element={<FareInsieme />} />}
          {on('desideri') && <Route path="/desideri" element={<Desideri />} />}
          {on('buono_a_sapersi') && <Route path="/buono-a-sapersi" element={<BuonoASapersi />} />}
          {on('note') && <Route path="/note" element={<Note />} />}
          {on('viaggi') && <Route path="/viaggi" element={<Viaggi />} />}
          {on('risparmi') && <Route path="/risparmi" element={<Risparmi />} />}
          {on('spese') && <Route path="/spese" element={<Spese />} />}
          {on('cassaforte') && <Route path="/cassaforte" element={<Cassaforte />} />}
          {on('disegno') && <Route path="/disegno" element={<Disegno />} />}
          {couple.modules?.ciclo === true && <Route path="/ciclo" element={<Ciclo />} />}
          {on('foto') && <Route path="/foto" element={<Foto />} />}
          {on('trivia') && <Route path="/trivia" element={<TriviaHome />} />}
          {on('trivia') && <Route path="/trivia/:id" element={<TriviaMatch />} />}
          {on('anno') && <Route path="/anno" element={<Anno />} />}
          <Route path="/notifiche" element={<Notifications />} />
          <Route path="/cestino" element={<Trash />} />
          <Route path="/altro" element={<More />} />
          <Route path="/impostazioni" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
      </main>
      <Toast />
      <nav className="fixed inset-x-0 bottom-0 z-10 px-3" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
        <div className="mx-auto flex max-w-md gap-1 rounded-3xl bg-card/95 p-1.5 shadow-lg ring-1 ring-line ">
          <Tab to="/" icon={HomeIcon} label="Home" />
          {navItems.map((x) => <Tab key={x.path} to={x.path} icon={x.icon} label={x.label.split(' ')[0]} />)}
          <Tab to="/altro" icon={LayoutGrid} label="Altro" active={!inNav} />
        </div>
      </nav>
    </div>
  )
}
