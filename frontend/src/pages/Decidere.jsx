import { useState } from 'react'
import { Plus, Trash2, Dices, Check, Lock, Shuffle, X } from 'lucide-react'
import { api } from '../api'
import { useApp } from '../state'
import { useLive } from '../hooks'
import { PageHeader } from '../components/ui'
import Sheet from '../components/Sheet'

function NewPoll({ onDone }) {
  const [title, setTitle] = useState('')
  const [opts, setOpts] = useState(['', ''])
  const [err, setErr] = useState('')
  const set = (i) => (e) => setOpts((o) => o.map((x, j) => (j === i ? e.target.value : x)))
  const ok = title.trim() && opts.filter((o) => o.trim()).length >= 2
  const save = async (e) => {
    e.preventDefault()
    try { await api.post('/polls', { title: title.trim(), options: opts.filter((o) => o.trim()) }); onDone() } catch (x) { setErr(x.message) }
  }
  return (
    <form onSubmit={save} className="space-y-3">
      <div><label className="label" htmlFor="p-titolo">Cosa dobbiamo decidere?</label><input id="p-titolo" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Es. Dove andiamo a cena?" autoFocus maxLength={140} /></div>
      {opts.map((o, i) => <input key={i} aria-label={`Opzione ${i + 1}`} className="input" value={o} onChange={set(i)} placeholder={`Opzione ${i + 1}`} maxLength={80} />)}
      {opts.length < 8 && <button type="button" className="text-sm font-medium text-accent" onClick={() => setOpts([...opts, ''])}>+ Aggiungi opzione</button>}
      {err && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{err}</p>}
      <button className="btn w-full" disabled={!ok}>Lanciamo il sondaggio</button>
    </form>
  )
}

function Poll({ p, reload }) {
  const { showToast, user, couple } = useApp()
  const partner = couple.members.find((m) => m.id !== user.id)
  const [busy, setBusy] = useState(false)
  const run = async (fn) => { setBusy(true); try { await fn(); } catch (e) { showToast(e.message) } finally { setBusy(false); reload() } }
  const vote = (id) => run(() => api.post(`/polls/${p.id}/vote`, { option_id: id }))
  const closed = p.status === 'closed'
  const total = p.options.reduce((s, o) => s + (o.votes || 0), 0)
  const remove = async () => { await api.del(`/polls/${p.id}`); reload(); showToast('Decisione eliminata', { label: 'Annulla', run: async () => { await api.post(`/trash/polls/${p.id}/restore`); reload() } }) }
  return (
    <div className="card space-y-3">
      <div className="flex items-start justify-between gap-2">
        <h3 className="display text-2xl leading-snug">{p.title}</h3>
        <button aria-label={`Elimina ${p.title}`} className="p-1 text-mute" onClick={remove}><Trash2 size={17} strokeWidth={1.6} /></button>
      </div>
      <div className="space-y-2">
        {p.options.map((o) => {
          const win = closed && p.winner_id === o.id, mine = p.my_vote === o.id
          const pct = p.revealed && total ? Math.round(((o.votes || 0) / total) * 100) : 0
          return (
            <button key={o.id} disabled={busy || closed} onClick={() => vote(o.id)} aria-pressed={mine}
              className={`relative flex w-full items-center justify-between overflow-hidden rounded-2xl px-4 py-3 text-left ring-1 ${win ? 'ring-2 ring-accent' : mine ? 'ring-accent/60' : 'ring-line'}`}>
              {p.revealed && <span className="absolute inset-y-0 left-0 bg-accent/15" style={{ width: pct + '%' }} />}
              <span className="relative flex items-center gap-2 font-medium">{(win || mine) && <Check size={16} className="text-accent" />}{o.text}</span>
              {p.revealed && <span className="relative text-sm text-mute">{o.votes}</span>}
            </button>
          )
        })}
      </div>
      {!p.revealed && <p className="flex items-center gap-2 text-sm text-mute"><Lock size={14} />{p.my_vote ? `Voto inviato: ora tocca a ${partner?.name || 'il partner'}.` : p.partner_voted ? `${partner?.name} ha già votato. Il tuo voto?` : 'I voti restano segreti finché votate entrambi.'}</p>}
      {p.tie && <button className="btn w-full" disabled={busy} onClick={() => run(() => api.post(`/polls/${p.id}/draw`))}><Dices size={18} className="mr-2" />Pareggio! Decida la sorte</button>}
      {closed && <div className="flex items-center justify-between"><span className="chip"><Check size={14} />{p.tie_broken ? 'Deciso dalla sorte' : 'Deciso'}: {p.options.find((o) => o.id === p.winner_id)?.text}</span><button className="text-sm font-medium text-mute" onClick={() => run(() => api.post(`/polls/${p.id}/reopen`))}>Riapri</button></div>}
    </div>
  )
}

function Coin() {
  const [text, setText] = useState('')
  const [pick, setPick] = useState(null)
  const roll = (e) => {
    e.preventDefault()
    const opts = text.split(/[\n,]/).map((s) => s.trim()).filter(Boolean)
    if (opts.length >= 2) setPick(opts[Math.floor(Math.random() * opts.length)])
  }
  return (
    <form onSubmit={roll} className="space-y-3">
      <label className="label" htmlFor="sorte">Scrivi le opzioni, una per riga (o separate da virgola)</label>
      <textarea id="sorte" className="input" rows={4} value={text} onChange={(e) => { setText(e.target.value); setPick(null) }} placeholder={'Pizza\nSushi\nTacos'} />
      <button className="btn w-full" disabled={text.split(/[\n,]/).filter((s) => s.trim()).length < 2}><Shuffle size={18} className="mr-2" />Sorteggia</button>
      {pick && <div className="rounded-3xl bg-accent/15 p-5 text-center"><div className="eyebrow">Ha deciso la sorte</div><div className="display mt-1 text-4xl text-accent">{pick}</div></div>}
    </form>
  )
}

export default function Decidere() {
  const { data, reload } = useLive('/polls', ['polls'])
  const [sheet, setSheet] = useState(null)
  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Scegliamo insieme" title="Decidere insieme" action={<><button aria-label="Sorteggio rapido" className="icon-btn-soft" onClick={() => setSheet('coin')}><Dices size={20} strokeWidth={1.6} /></button><button aria-label="Nuova decisione" className="icon-btn" onClick={() => setSheet('new')}><Plus size={22} /></button></>} />
      {data === null ? <div className="skeleton" aria-busy="true"><i /><i /><i /></div> : data.length === 0 ? <div className="card text-center text-mute">Nessuna decisione in corso.<br />Cena, film, weekend: lanciate un sondaggio e votate in segreto.</div> : data.map((p) => <Poll key={p.id} p={p} reload={reload} />)}
      {sheet === 'new' && <Sheet title="Nuova decisione" onClose={() => setSheet(null)}><NewPoll onDone={() => { setSheet(null); reload() }} /></Sheet>}
      {sheet === 'coin' && <Sheet title="Sorteggio rapido" onClose={() => setSheet(null)}><Coin /></Sheet>}
    </div>
  )
}
