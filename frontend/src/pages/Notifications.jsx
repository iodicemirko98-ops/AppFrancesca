import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
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
      <div className="flex items-center gap-2"><Link to="/" aria-label="Indietro" className="btn-soft !px-4 !py-2">‹</Link><h1 className="text-xl font-bold">Notifiche</h1></div>
      {data === null ? <p className="text-mute">Un attimo…</p> : data.items.length === 0 ? <div className="card text-center text-mute">Nessuna notifica, per ora. 🌿</div> : (
        <div className="space-y-2">{data.items.map((n) => (
          <Link key={n.id} to={n.link || '/'} className={`block rounded-2xl px-4 py-3 ${n.read ? 'bg-soft' : 'bg-accent/15 ring-1 ring-accent/40'}`}>
            <div>{n.text}</div><div className="text-xs text-mute">{when(n.created_at)}</div>
          </Link>))}</div>
      )}
    </div>
  )
}
