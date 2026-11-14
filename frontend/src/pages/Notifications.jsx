import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { api } from '../api'
import { PageHeader } from '../components/ui'
import { useApp } from '../state'
import { useLive } from '../hooks'

const when = (iso) => {
  const d = new Date(iso), mins = Math.round((Date.now() - d) / 60000)
  if (mins < 1) return 'adesso'
  if (mins < 60) return `${mins} min fa`
  if (mins < 1440) return `${Math.round(mins / 60)} h fa`
  return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })
}

export default function Notifications() {
  const { reload } = useApp()
  const { data, reload: load } = useLive('/notifications', ['notifications'])
  const unread = data?.unread || 0
  useEffect(() => { if (unread) api.post('/notifications/read').then(() => reload()) }, [unread]) // eslint-disable-line
  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Per te" title="Notifiche" action={<Link to="/" aria-label="Indietro" className="icon-btn-soft"><ChevronLeft size={20} /></Link>} />
      {data === null ? <p className="text-mute">Un attimo…</p> : data.items.length === 0 ? <div className="card text-center text-mute">Nessuna notifica, per ora. 🌿</div> : (
        <div className="space-y-2">{data.items.map((n) => (
          <Link key={n.id} to={n.link || '/'} className={`block rounded-2xl px-4 py-3 ${n.read ? 'bg-card ring-1 ring-line' : 'bg-accent/15 ring-1 ring-accent/40'}`}>
            <div>{n.text}</div><div className="text-xs text-mute">{when(n.created_at)}</div>
          </Link>))}</div>
      )}
    </div>
  )
}
