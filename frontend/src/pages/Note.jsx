import { useState } from 'react'
import { Plus, Pin, Lock, Mail, Trash2 } from 'lucide-react'
import { api } from '../api'
import { useApp } from '../state'
import { useLive, iso } from '../hooks'
import { PageHeader } from '../components/ui'
import Sheet from '../components/Sheet'

const KIND = { nota: 'Note', capsula: 'Capsule', storia: 'Storie' }
const fmtDay = (d) => (d.length === 7 ? new Date(d + '-01T12:00').toLocaleDateString('it-IT', { month: 'long', year: 'numeric' }) : new Date(d + 'T12:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }))

function Form({ kind, item, onDone }) {
  const { showToast } = useApp()
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1)
  const [f, setF] = useState({ title: item?.title || '', body: item?.body || '', unlock_on: item?.unlock_on || '', on_date: item?.on_date || '', pinned: !!item?.pinned })
  const [err, setErr] = useState('')
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  const save = async (e) => {
    e.preventDefault()
    const body = { title: f.title.trim(), body: f.body.trim(), pinned: f.pinned, ...(kind === 'capsula' ? { unlock_on: f.unlock_on || null } : {}), ...(kind === 'storia' ? { on_date: f.on_date || null } : {}) }
    try { item ? await api.patch(`/notes/${item.id}`, body) : await api.post('/notes', { kind, ...body }); onDone() } catch (x) { setErr(x.message) }
  }
  const remove = async () => { await api.del(`/notes/${item.id}`); onDone(); showToast('Eliminato', { label: 'Annulla', run: () => api.post(`/trash/notes/${item.id}/restore`) }) }
  return (
    <form onSubmit={save} className="space-y-3">
      <div><label className="label" htmlFor="n-titolo">Titolo</label><input id="n-titolo" className="input" value={f.title} onChange={set('title')} required maxLength={120} autoFocus /></div>
      {kind === 'capsula' && <div><label className="label" htmlFor="n-apertura">Si apre il</label><input id="n-apertura" type="date" className="input" min={iso(tomorrow)} value={f.unlock_on} onChange={set('unlock_on')} required /></div>}
      {kind === 'storia' && <div><label className="label" htmlFor="n-quando">Quando è successo</label><input id="n-quando" type="date" className="input" value={f.on_date} onChange={set('on_date')} /></div>}
      <div><label className="label" htmlFor="n-testo">{kind === 'capsula' ? 'Il messaggio (nessuno lo leggerà fino a quel giorno)' : 'Testo'}</label><textarea id="n-testo" className="input" rows={7} value={f.body} onChange={set('body')} required maxLength={8000} /></div>
      {kind === 'nota' && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.pinned} onChange={set('pinned')} />Fissa in alto</label>}
      {err && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{err}</p>}
      <div className="flex gap-2">{item && <button type="button" className="btn-danger" aria-label="Elimina" onClick={remove}><Trash2 size={18} /></button>}<button className="btn flex-1" disabled={!f.title.trim() || !f.body.trim()}>{item ? 'Salva' : kind === 'capsula' ? 'Sigilla la capsula' : 'Salva'}</button></div>
    </form>
  )
}

export default function Note() {
  const { couple, user } = useApp()
  const [kind, setKind] = useState('nota')
  const { data, reload } = useLive(`/notes?kind=${kind}`, ['notes', 'notifications'])
  const [sheet, setSheet] = useState(null)
  const who = (id) => couple.members.find((m) => m.id === id)?.name
  const labels = { nota: 'Nuova nota', capsula: 'Nuova capsula', storia: 'Nuova storia' }
  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Scritti per noi" title="Note e capsule" action={<button aria-label={labels[kind]} className="icon-btn" onClick={() => setSheet({})}><Plus size={22} /></button>} />
      <div className="flex gap-2" role="tablist">{Object.entries(KIND).map(([k, l]) => <button key={k} role="tab" aria-selected={kind === k} onClick={() => { setKind(k) }} className={`rounded-full px-4 py-1.5 text-sm font-medium ${kind === k ? 'bg-accent text-accent-ink' : 'bg-card text-mute ring-1 ring-line'}`}>{l}</button>)}</div>
      {kind === 'capsula' && <p className="text-sm text-mute">Scrivete un messaggio per il futuro: resta sigillato per entrambi fino al giorno scelto.</p>}
      {kind === 'storia' && <p className="text-sm text-mute">I capitoli della vostra storia, in ordine di tempo.</p>}
      {data === null ? <div className="skeleton" aria-busy="true"><i /><i /><i /></div> : data.length === 0 ? <div className="card text-center text-mute">{kind === 'nota' ? 'Nessuna nota. Un pensiero, una lista, un promemoria.' : kind === 'capsula' ? 'Nessuna capsula. Scrivete la prima!' : 'Raccontate come tutto è iniziato.'}</div> : (
        <div className={kind === 'storia' ? 'space-y-4 border-l-2 border-accent/30 pl-4' : 'space-y-2'}>
          {data.map((n) => n.locked ? (
            <div key={n.id} className="card flex items-center gap-4 !p-4">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/15 text-accent"><Lock size={20} strokeWidth={1.6} /></span>
              <span className="min-w-0 flex-1"><span className="display block truncate text-xl">{n.title}</span><span className="text-sm text-mute">Sigillata da {who(n.created_by)} · si apre il {fmtDay(n.unlock_on)} ({n.days_left === 1 ? 'domani' : `tra ${n.days_left} giorni`})</span></span>
              {n.created_by === user.id && <button className="text-sm font-medium text-accent" onClick={() => setSheet({ item: n })}>Modifica</button>}
            </div>
          ) : (
            <button key={n.id} onClick={() => setSheet({ item: n })} className="card relative block w-full text-left">
              {kind === 'storia' && <span className="absolute -left-[1.62rem] top-6 h-3 w-3 rounded-full bg-accent" />}
              {n.pinned && <Pin size={14} className="absolute right-4 top-4 text-accent" />}
              {kind === 'capsula' && <span className="chip mb-2"><Mail size={13} />Aperta</span>}
              {kind === 'storia' && n.on_date && <div className="eyebrow mb-1">{fmtDay(n.on_date)}</div>}
              <div className="display text-2xl leading-snug">{n.title}</div>
              <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-mute">{n.body}</p>
              <div className="mt-2 text-xs text-mute">{who(n.created_by)}</div>
            </button>
          ))}
        </div>
      )}
      {sheet && <Sheet title={sheet.item ? sheet.item.title : labels[kind]} onClose={() => setSheet(null)}><Form kind={sheet.item?.kind || kind} item={sheet.item} onDone={() => { setSheet(null); reload() }} /></Sheet>}
    </div>
  )
}
