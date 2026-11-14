import { Fragment, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, ExternalLink, Heart, Search, Star, Trash2, Pencil, Camera, ChefHat, Check } from 'lucide-react'
import { api } from '../api'
import { useApp } from '../state'
import { useLive } from '../hooks'
import { PageHeader } from '../components/ui'
import Sheet from '../components/Sheet'
import { resizePhoto } from '../util'

const CATS = ['Antipasti', 'Primi', 'Secondi', 'Contorni', 'Dolci', 'Colazione', 'Lievitati', 'Altro']
const EMOJI = { Antipasti: '🥗', Primi: '🍝', Secondi: '🍗', Contorni: '🥦', Dolci: '🍰', Colazione: '🥐', Lievitati: '🍞', Altro: '🍽️' }
const URL_RE = /https?:\/\/[^\s]+/i

function Form({ item, init, onDone }) {
  const { showToast } = useApp()
  const [f, setF] = useState({ title: item?.title || init?.title || '', url: item?.url || init?.url || '', category: item?.category || 'Altro', ingredients: item?.ingredients || '', steps: item?.steps || '', notes: item?.notes || '' })
  const [photo, setPhoto] = useState(item?.photo || null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const file = useRef()
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  const save = async (e) => {
    e.preventDefault(); setBusy(true)
    const body = { title: f.title.trim(), url: f.url.trim() || null, category: f.category, ingredients: f.ingredients, steps: f.steps, notes: f.notes, photo }
    try { item ? await api.patch(`/recipes/${item.id}`, body) : await api.post('/recipes', body); onDone(!item) } catch (x) { setErr(x.message); setBusy(false) }
  }
  const remove = async () => {
    await api.del(`/recipes/${item.id}`); onDone(false)
    showToast('Ricetta eliminata', { label: 'Annulla', run: () => api.post(`/trash/recipes/${item.id}/restore`) })
  }
  const pick = async (e) => {
    const fl = e.target.files?.[0]; e.target.value = ''
    if (fl) try { setPhoto(await resizePhoto(fl, 520, 0.6)) } catch (x) { setErr(x.message) }
  }
  return (
    <form onSubmit={save} className="space-y-3">
      <div><label className="label" htmlFor="r-titolo">Nome della ricetta</label><input id="r-titolo" className="input" value={f.title} onChange={set('title')} autoFocus={!init} required maxLength={140} /></div>
      <div><label className="label" htmlFor="r-url">Link (Instagram o altro)</label><input id="r-url" className="input" inputMode="url" placeholder="https://www.instagram.com/…" value={f.url} onChange={set('url')} maxLength={600} /></div>
      <div>
        <span className="label">Categoria</span>
        <div className="flex flex-wrap gap-2">{CATS.map((c) => <button type="button" key={c} aria-pressed={f.category === c} onClick={() => setF((x) => ({ ...x, category: c }))} className={`rounded-full px-3 py-1.5 text-sm font-medium ${f.category === c ? 'bg-accent text-accent-ink' : 'bg-card text-mute ring-1 ring-line'}`}>{EMOJI[c]} {c}</button>)}</div>
      </div>
      <div><label className="label" htmlFor="r-ing">Ingredienti (uno per riga)</label><textarea id="r-ing" className="input" rows={4} value={f.ingredients} onChange={set('ingredients')} maxLength={3000} /></div>
      <div><label className="label" htmlFor="r-steps">Procedimento</label><textarea id="r-steps" className="input" rows={4} value={f.steps} onChange={set('steps')} maxLength={6000} /></div>
      <div><label className="label" htmlFor="r-note">Note</label><textarea id="r-note" className="input" rows={2} value={f.notes} onChange={set('notes')} maxLength={1000} /></div>
      <div className="flex items-center gap-3">
        {photo ? <img src={photo} alt="" className="h-16 w-16 rounded-2xl object-cover" /> : null}
        <button type="button" className="btn-soft flex items-center gap-2 !px-4 !py-2" onClick={() => file.current.click()}><Camera size={16} />{photo ? 'Cambia foto' : 'Aggiungi foto'}</button>
        {photo && <button type="button" className="text-sm font-semibold text-mute" onClick={() => setPhoto(null)}>Rimuovi</button>}
        <input ref={file} type="file" accept="image/*" className="hidden" onChange={pick} />
      </div>
      {err && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{err}</p>}
      <div className="flex gap-2">{item && <button type="button" className="btn-danger" aria-label="Elimina" onClick={remove}><Trash2 size={18} /></button>}<button className="btn flex-1" disabled={busy || !f.title.trim()}>{item ? 'Salva' : 'Aggiungi al ricettario'}</button></div>
    </form>
  )
}

function Detail({ id, items, onClose, onEdit, reload }) {
  const r = items.find((x) => x.id === id)
  if (!r) return null
  const patch = async (b) => { await api.patch(`/recipes/${r.id}`, b); reload() }
  const lines = (t) => t.split('\n').map((l) => l.trim()).filter(Boolean)
  return (
    <Sheet title={r.title} onClose={onClose}>
      <div className="space-y-4">
        {r.photo && <img src={r.photo} alt="" className="h-44 w-full rounded-2xl object-cover" />}
        <div className="flex flex-wrap items-center gap-2 text-sm text-mute"><span className="rounded-full bg-soft px-3 py-1">{EMOJI[r.category]} {r.category}</span></div>
        {r.url && <a href={r.url} target="_blank" rel="noopener noreferrer" className="btn flex items-center justify-center gap-2"><ExternalLink size={16} />{r.source === 'instagram' ? 'Apri su Instagram' : 'Apri il link'}</a>}
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => patch({ fav: !r.fav })} aria-pressed={r.fav} className={`flex items-center justify-center gap-2 rounded-2xl py-2.5 text-sm font-medium ${r.fav ? 'bg-accent text-accent-ink' : 'bg-soft text-ink'}`}><Heart size={16} fill={r.fav ? 'currentColor' : 'none'} />{r.fav ? 'Preferita' : 'Preferita?'}</button>
          <button onClick={() => patch({ tried: !r.tried })} aria-pressed={r.tried} className={`flex items-center justify-center gap-2 rounded-2xl py-2.5 text-sm font-medium ${r.tried ? 'bg-accent text-accent-ink' : 'bg-soft text-ink'}`}><ChefHat size={16} />{r.tried ? 'Provata' : 'Da provare'}</button>
        </div>
        {r.tried && (
          <div className="flex items-center justify-center gap-1" role="group" aria-label="Voto">
            {[1, 2, 3, 4, 5].map((n) => <button key={n} aria-label={`${n} stelle`} onClick={() => patch({ rating: r.rating === n ? 0 : n })} className="p-1"><Star size={26} className="text-accent" fill={n <= r.rating ? 'currentColor' : 'none'} strokeWidth={1.5} /></button>)}
          </div>
        )}
        {r.ingredients && <div><h3 className="eyebrow mb-1">Ingredienti</h3><ul className="space-y-1">{lines(r.ingredients).map((l, i) => <li key={i} className="flex gap-2"><span className="text-accent">•</span><span>{l}</span></li>)}</ul></div>}
        {r.steps && <div><h3 className="eyebrow mb-1">Procedimento</h3><p className="whitespace-pre-line leading-relaxed">{r.steps}</p></div>}
        {r.notes && <div><h3 className="eyebrow mb-1">Note</h3><p className="whitespace-pre-line text-mute">{r.notes}</p></div>}
        <button className="btn-soft flex w-full items-center justify-center gap-2" onClick={() => onEdit(r)}><Pencil size={16} />Modifica</button>
      </div>
    </Sheet>
  )
}

export default function Ricette() {
  const { couple } = useApp()
  const nav = useNavigate()
  const { data, reload } = useLive('/recipes', ['recipes'])
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('Tutte')
  const [sheet, setSheet] = useState(null) // {item?, init?}
  const [open, setOpen] = useState(null)
  void couple
  // «Condividi» da Instagram verso l'app (Android): arriva /ricette?url=…&text=…&title=…
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    const shared = [p.get('url'), p.get('text'), p.get('title')].map((x) => x || '').join(' ')
    if (p.has('url') || p.has('text') || p.has('title')) {
      const link = (shared.match(URL_RE) || [''])[0]
      const t = (p.get('title') || '').replace(URL_RE, '').trim()
      setSheet({ init: { url: link, title: t } })
      nav('/ricette', { replace: true })
    }
  }, [nav])
  const items = data || []
  const cats = ['Tutte', '❤ Preferite', ...CATS.filter((c) => items.some((r) => r.category === c))]
  const list = items.filter((r) => (cat === 'Tutte' || (cat === '❤ Preferite' ? r.fav : r.category === cat)) &&
    (!q.trim() || `${r.title} ${r.ingredients}`.toLowerCase().includes(q.trim().toLowerCase())))
  const Card = ({ r }) => (
    <button onClick={() => setOpen(r.id)} className="card flex w-full items-center gap-3 !rounded-2xl !p-3 text-left">
      {r.photo ? <img src={r.photo} alt="" loading="lazy" className="h-16 w-16 shrink-0 rounded-xl object-cover" /> : <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-soft text-3xl" aria-hidden>{EMOJI[r.category]}</span>}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{r.title}</span>
        <span className="flex items-center gap-2 text-sm text-mute"><span>{r.category}</span>{r.source === 'instagram' && <span>· Instagram</span>}</span>
        <span className="flex items-center gap-2 text-xs text-mute">{r.tried ? <span className="flex items-center gap-1 text-accent"><Check size={12} />Provata{r.rating > 0 ? ` · ${'★'.repeat(r.rating)}` : ''}</span> : <span>Da provare</span>}</span>
      </span>
      {r.fav && <Heart size={18} className="shrink-0 text-accent" fill="currentColor" />}
    </button>
  )
  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Da provare insieme" title="Ricettario" action={<button aria-label="Nuova ricetta" className="icon-btn" onClick={() => setSheet({})}><Plus size={22} /></button>} />
      {items.length > 3 && (
        <div className="relative"><Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-mute" /><input className="input !pl-10" placeholder="Cerca per nome o ingrediente" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cerca ricette" /></div>
      )}
      {items.length > 0 && <div className="flex gap-2 overflow-x-auto" role="tablist">{cats.map((c) => <button key={c} role="tab" aria-selected={cat === c} onClick={() => setCat(c)} className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium ${cat === c ? 'bg-accent text-accent-ink' : 'bg-card text-mute ring-1 ring-line'}`}>{c}</button>)}</div>}
      {data === null ? <div className="skeleton" aria-busy="true"><i /><i /><i /></div> : items.length === 0 ? (
        <div className="card space-y-2 text-center text-mute"><div className="text-4xl" aria-hidden>🍳</div><p>Il ricettario è vuoto. Salvate qui le ricette che trovate su Instagram: incollate il link e aggiungete gli ingredienti.</p>
          <p className="text-sm">Su Android puoi anche usare «Condividi» da Instagram e scegliere NoiDue.</p></div>
      ) : list.length === 0 ? <div className="card text-center text-mute">Nessuna ricetta trovata.</div>
        : <div className="space-y-2">{list.map((r) => <Fragment key={r.id}>{Card({ r })}</Fragment>)}</div>}
      {sheet && <Sheet title={sheet.item ? 'Modifica ricetta' : 'Nuova ricetta'} onClose={() => setSheet(null)}><Form item={sheet.item} init={sheet.init} onDone={(isNew) => { setSheet(null); reload() }} /></Sheet>}
      {open && !sheet && <Detail id={open} items={items} reload={reload} onClose={() => setOpen(null)} onEdit={(r) => { setSheet({ item: r }) }} />}
    </div>
  )
}
