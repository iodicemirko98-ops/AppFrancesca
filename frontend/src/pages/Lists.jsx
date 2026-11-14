import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Plus, ChevronLeft, ChevronRight, Pencil, Trash2, Check, X, ShoppingBasket, Plane, Clapperboard, UtensilsCrossed, Gift, StickyNote } from 'lucide-react'
import { api } from '../api'
import { PageHeader } from '../components/ui'
import { useApp } from '../state'
import { useLive } from '../hooks'
import Sheet from '../components/Sheet'

const KINDS = { spesa: [ShoppingBasket, 'Spesa'], viaggio: [Plane, 'Viaggio'], film: [Clapperboard, 'Film da vedere'], ristoranti: [UtensilsCrossed, 'Ristoranti'], regali: [Gift, 'Regali'], generica: [StickyNote, 'Lista'] }
const KIcon = ({ kind, size = 22 }) => { const I = (KINDS[kind] || KINDS.generica)[0]; return <I size={size} strokeWidth={1.6} /> }

export function ListsPage() {
  const { data, reload } = useLive('/lists', ['lists'])
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [kind, setKind] = useState('spesa')
  const create = async (e) => {
    e.preventDefault()
    const l = await api.post('/lists', { name: name.trim(), kind })
    setOpen(false); setName(''); reload(); nav(`/liste/${l.id}`)
  }
  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Insieme" title="Liste" action={<button aria-label="Nuova lista" className="icon-btn" onClick={() => setOpen(true)}><Plus size={22} /></button>} />
      {data === null ? <div className="skeleton" aria-busy="true"><i /><i /><i /></div> : data.length === 0 ? <div className="card text-center text-mute">Nessuna lista ancora.<br />Create la prima: spesa, film da vedere, idee di viaggio…</div> : (
        <div className="space-y-2">{data.map((l) => (
          <Link key={l.id} to={`/liste/${l.id}`} className="card flex items-center gap-4 !p-4">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/15 text-accent"><KIcon kind={l.kind} /></span>
            <span className="min-w-0 flex-1"><span className="display block truncate text-xl">{l.name}</span><span className="text-sm text-mute">{l.total === 0 ? 'Vuota' : `${l.done_count} di ${l.total} fatte`}</span></span>
            <ChevronRight size={18} className="text-mute" />
          </Link>))}</div>
      )}
      {open && (
        <Sheet title="Nuova lista" onClose={() => setOpen(false)}>
          <form onSubmit={create} className="space-y-3">
            <div><label className="label" htmlFor="l-nome">Nome</label><input id="l-nome" className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus required maxLength={60} placeholder="Es. Spesa della settimana" /></div>
            <div><label className="label" htmlFor="l-tipo">Tipo</label><select id="l-tipo" className="input" value={kind} onChange={(e) => setKind(e.target.value)}>{Object.entries(KINDS).map(([k, [, l]]) => <option key={k} value={k}>{l}</option>)}</select></div>
            <button className="btn w-full" disabled={!name.trim()}>Crea lista</button>
          </form>
        </Sheet>
      )}
    </div>
  )
}

export function ListDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const { showToast } = useApp()
  const { data: l, error, setData } = useLive(`/lists/${id}`, ['lists'])
  const [text, setText] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState('')
  if (error && !l) return <div className="card text-center"><p className="mb-3 text-mute">Questa lista non c'è più.</p><Link to="/liste" className="btn">Torna alle liste</Link></div>
  if (!l) return <div className="skeleton" aria-busy="true"><i /><i /><i /></div>
  const add = async (e) => { e.preventDefault(); const t = text.trim(); if (!t) return; setText(''); setData(await api.post(`/lists/${id}/items`, { text: t })) }
  const toggle = async (i) => setData(await api.patch(`/lists/${id}/items/${i.id}`, { done: !i.done }))
  const del = async (i) => setData(await api.del(`/lists/${id}/items/${i.id}`))
  const clear = async () => setData(await api.post(`/lists/${id}/clear-done`))
  const remove = async () => { await api.del(`/lists/${id}`); nav('/liste'); showToast('Lista eliminata', { label: 'Annulla', run: () => api.post(`/trash/lists/${id}/restore`) }) }
  const rename = async (e) => { e.preventDefault(); setData(await api.patch(`/lists/${id}`, { name: name.trim() })); setRenaming(false) }
  const open = l.items.filter((i) => !i.done), done = l.items.filter((i) => i.done)
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link to="/liste" aria-label="Indietro" className="icon-btn-soft"><ChevronLeft size={20} /></Link>
        <h1 className="display min-w-0 flex-1 truncate text-3xl">{l.name}</h1>
        <button aria-label="Rinomina lista" className="icon-btn-soft" onClick={() => { setName(l.name); setRenaming(true) }}><Pencil size={17} strokeWidth={1.6} /></button>
        <button aria-label="Elimina lista" className="icon-btn-soft" onClick={remove}><Trash2 size={17} strokeWidth={1.6} /></button>
      </div>
      <form onSubmit={add} className="flex gap-2"><input aria-label="Nuova voce" className="input" placeholder="Aggiungi una voce…" value={text} onChange={(e) => setText(e.target.value)} maxLength={160} /><button aria-label="Aggiungi voce" className="icon-btn" disabled={!text.trim()}><Plus size={22} /></button></form>
      {l.items.length === 0 && <p className="text-center text-mute">Lista vuota. Aggiungete la prima voce!</p>}
      <div className="space-y-2">{[...open, ...done].map((i) => (
        <div key={i.id} className="card flex items-center gap-3 !rounded-2xl !p-4">
          <button role="checkbox" aria-checked={i.done} aria-label={`Segna ${i.text}`} onClick={() => toggle(i)} className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-2 ${i.done ? 'bg-accent text-accent-ink ring-accent' : 'ring-line'}`}>{i.done ? <Check size={16} strokeWidth={2.5} /> : null}</button>
          <span className={`min-w-0 flex-1 break-words ${i.done ? 'text-mute line-through' : ''}`}>{i.text}</span>
          <button aria-label={`Rimuovi ${i.text}`} onClick={() => del(i)} className="px-1 text-mute"><X size={16} /></button>
        </div>))}</div>
      {done.length > 0 && <button className="btn-soft w-full" onClick={clear}>Rimuovi le {done.length} completate</button>}
      {renaming && <Sheet title="Rinomina lista" onClose={() => setRenaming(false)}><form onSubmit={rename} className="space-y-3"><input aria-label="Nome lista" className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus required maxLength={60} /><button className="btn w-full" disabled={!name.trim()}>Salva</button></form></Sheet>}
    </div>
  )
}
