import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { useApp } from '../state'
import { PageHeader } from '../components/ui'
import { SECTIONS, UTILITY } from '../modules'

const Item = ({ to, icon: Icon, label, badge }) => (
  <Link to={to} className="flex items-center gap-4 px-1 py-3.5">
    <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent/15 text-accent"><Icon size={20} strokeWidth={1.7} /></span>
    <span className="flex-1 font-medium">{label}</span>
    {badge > 0 && <span className="rounded-full bg-accent px-2 text-xs font-semibold text-accent-ink">{badge}</span>}
    <ChevronRight size={18} className="text-mute" />
  </Link>
)

export default function More() {
  const { couple, home } = useApp()
  const extra = SECTIONS.filter((s) => !s.nav && s.ready && couple.modules?.[s.key] !== false)
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Tutto il resto" title="Altro" />
      {extra.length > 0 && <div className="card divide-y divide-line !py-2">{extra.map((s) => <Item key={s.key} to={s.path} icon={s.icon} label={s.label} />)}</div>}
      <div className="card divide-y divide-line !py-2">{UTILITY.map((u) => <Item key={u.path} to={u.path} icon={u.icon} label={u.label} badge={u.path === '/notifiche' ? home.unread_notifications : 0} />)}</div>
    </div>
  )
}
