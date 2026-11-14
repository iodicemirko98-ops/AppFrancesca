import { Link } from 'react-router-dom'
import { ChevronLeft, X } from 'lucide-react'
import { api } from '../api'
import { PageHeader } from '../components/ui'
import { useLive } from '../hooks'

const left = (iso) => { const d = Math.max(0, Math.ceil((new Date(iso) - Date.now()) / 864e5)); return d <= 1 ? 'scade oggi' : `scade tra ${d} giorni` }

export default function Trash() {
  const { data, reload } = useLive('/trash', ['events', 'tasks', 'lists'])
  const restore = async (t) => { await api.post(`/trash/${t.collection}/${t.id}/restore`); reload() }
  const purge = async (t) => { await api.del(`/trash/${t.collection}/${t.id}`); reload() }
  const empty = async () => { await api.del('/trash'); reload() }
  return (
    <div className="space-y-4">
      <PageHeader eyebrow="7 giorni" title="Eliminati di recente" action={<Link to="/altro" aria-label="Indietro" className="icon-btn-soft"><ChevronLeft size={20} /></Link>} />
      <p className="text-sm text-mute">Gli elementi eliminati restano qui 7 giorni, poi spariscono per sempre.</p>
      {data === null ? <p className="text-mute">Un attimo…</p> : data.length === 0 ? <div className="card text-center text-mute">Il cestino è vuoto. ✨</div> : (
        <>
          <div className="space-y-2">{data.map((t) => (
            <div key={t.collection + t.id} className="card flex items-center gap-3 !rounded-2xl !p-4">
              <div className="min-w-0 flex-1"><div className="truncate font-semibold">{t.title}</div><div className="text-sm text-mute">{t.kind} · {left(t.expires_at)}</div></div>
              <button className="btn !px-4 !py-2" onClick={() => restore(t)}>Ripristina</button>
              <button aria-label={`Elimina definitivamente ${t.title}`} className="px-1 text-mute" onClick={() => purge(t)}><X size={16} /></button>
            </div>))}</div>
          <button className="btn-danger w-full" onClick={empty}>Svuota il cestino</button>
        </>
      )}
    </div>
  )
}
