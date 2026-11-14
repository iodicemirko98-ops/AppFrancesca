import { Fragment, useState } from 'react'
import { Plus, Check, Dices, Trash2 } from 'lucide-react'
import { api } from '../api'
import { useApp } from '../state'
import { useLive } from '../hooks'
import { PageHeader } from '../components/ui'
import Sheet from '../components/Sheet'
import { fmtDate } from '../util'

const CATS = { esperienze: 'Esperienze', viaggi: 'Viaggi', cibo: 'Cibo', casa: 'Casa', natura: 'Natura', cultura: 'Cultura', altro: 'Altro' }

function Form({ item, onDone }) {
  const { showToast } = useApp()
  const [f, setF] = useState({ title: item?.title || '', category: item?.category || 'esperienze', notes: item?.notes || '', memory: item?.memory || '' })
  const [err, setErr] = useState('')
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  const save = async (e) => {
    e.preventDefault()
    try {
      if (item) await api.patch(`/bucket/${item.id}`, { title: f.title.trim(), category: f.category, notes: f.notes.trim() || null, ...(item.done ? { memory: f.memory.trim() || null } : {}) })
      else await api.post('/bucket', { title: f.title.trim(), category: f.category, notes: f.notes.trim() || null })
      onDone()
    } catch (x) { setErr(x.message) }
  }
  const remove = async () => { await api.del(`/bucket/${item.id}`); onDone(); showToast('Idea eliminata', { label: 'Annulla', run: () => api.post(`/trash/bucket/${item.id}/restore`) }) }
  return (
    <form onSubmit={save} className="space-y-3">
      <div><label className="label" htmlFor="b-titolo">Cosa vorreste fare?</label><input id="b-titolo" className="input" value={f.title} onChange={set('title')} placeholder="Es. Vedere l'alba al mare" autoFocus required maxLength={140} /></div>
      <div><label className="label" htmlFor="b-cat">Categoria</label><select id="b-cat" className="input" value={f.category} onChange={set('category')}>{Object.entries(CATS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
      <div><label className="label" htmlFor="b-note">Note</label><textarea id="b-note" className="input" rows={2} value={f.notes} onChange={set('notes')} maxLength={600} /></div>
      {item?.done && <div><label className="label" htmlFor="b-ricordo">Il ricordo</label><textarea id="b-ricordo" className="input" rows={3} value={f.memory} onChange={set('memory')} maxLength={800} placeholder="Com'è andata?" /></div>}
      {err && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{err}</p>}
      <div className="flex gap-2">{item && <button type="button" className="btn-danger" onClick={remove}><Trash2 size={18} /></button>}<button className="btn flex-1" disabled={!f.title.trim()}>{item ? 'Salva' : 'Aggiungi'}</button></div>
    </form>
  )
}

export default function FareInsieme() {
  const { data, reload } = useLive('/bucket', ['bucket'])
  const { showToast } = useApp()
  const [sheet, setSheet] = useState(null)
  const [cat, setCat] = useState('tutte')
  const [pick, setPick] = useState(null)
  const list = (data || []).filter((i) => cat === 'tutte' || i.category === cat)
  const todo = list.filter((i) => !i.done), done = list.filter((i) => i.done)
  const toggle = async (i) => {
    await api.patch(`/bucket/${i.id}`, { done: !i.done }); reload()
    if (!i.done) setSheet({ item: { ...i, done: true }, memory: true })
  }
  const spin = async () => { try { setPick(await api.post('/bucket/random')) } catch (e) { showToast(e.message) } }
  const Item = ({ i }) => (
    <div className="card flex items-center gap-3 !rounded-2xl !p-4">
      <button role="checkbox" aria-checked={i.done} aria-label={`Fatta: ${i.title}`} onClick={() => toggle(i)} className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-2 ${i.done ? 'bg-accent text-accent-ink ring-accent' : 'ring-line'}`}>{i.done ? <Check size={16} strokeWidth={2.5} /> : null}</button>
      <button className="min-w-0 flex-1 text-left" onClick={() => setSheet({ item: i })}>
        <span className={`block font-medium ${i.done ? 'text-mute line-through' : ''}`}>{i.title}</span>
        <span className="block truncate text-sm text-mute">{CATS[i.category]}{i.done && i.done_on ? ` · fatta il ${fmtDate(i.done_on).replace(/ \d{4}$/, '')}` : ''}{i.memory ? ` · ${i.memory}` : ''}</span>
      </button>
    </div>
  )
  return (
    <div className="space-y-4">
      <PageHeader eyebrow="La nostra lista dei desideri" title="Da fare insieme" action={<><button aria-label="Cosa facciamo?" className="icon-btn-soft" onClick={spin}><Dices size={20} strokeWidth={1.6} /></button><button aria-label="Nuova idea" className="icon-btn" onClick={() => setSheet({})}><Plus size={22} /></button></>} />
      {data && <div className="chip w-fit">{data.filter((i) => i.done).length} fatte su {data.length}</div>}
      <div className="flex gap-2 overflow-x-auto" role="tablist">
        {['tutte', ...Object.keys(CATS)].map((k) => <button key={k} role="tab" aria-selected={cat === k} onClick={() => setCat(k)} className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium ${cat === k ? 'bg-accent text-accent-ink' : 'bg-card text-mute ring-1 ring-line'}`}>{k === 'tutte' ? 'Tutte' : CATS[k]}</button>)}
      </div>
      {data === null ? <div className="skeleton" aria-busy="true"><i /><i /><i /></div> : todo.length === 0 ? <div className="card text-center text-mute">Niente in lista. Quale avventura vi manca?</div> : <div className="space-y-2">{todo.map((i) => <Fragment key={i.id}>{Item({ i })}</Fragment>)}</div>}
      {done.length > 0 && <><h2 className="eyebrow px-1 pt-2">Già fatte</h2><div className="space-y-2">{done.map((i) => <Fragment key={i.id}>{Item({ i })}</Fragment>)}</div></>}
      {sheet && <Sheet title={sheet.memory ? 'Che bello! Un ricordo?' : sheet.item ? 'Modifica idea' : 'Nuova idea'} onClose={() => setSheet(null)}><Form item={sheet.item} onDone={() => { setSheet(null); reload() }} /></Sheet>}
      {pick && <Sheet title="Cosa facciamo?" onClose={() => setPick(null)}><div className="space-y-4 text-center"><div className="display text-4xl text-accent">{pick.title}</div><div className="text-mute">{CATS[pick.category]}</div><div className="flex gap-2"><button className="btn-soft flex-1" onClick={spin}>Un'altra</button><button className="btn flex-1" onClick={() => setPick(null)}>Ci sto!</button></div></div></Sheet>}
    </div>
  )
}
