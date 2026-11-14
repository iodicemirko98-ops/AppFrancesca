import { useState } from 'react'
import { Plus, PiggyBank, Trash2, Target, X } from 'lucide-react'
import { api } from '../api'
import { useApp } from '../state'
import { useLive } from '../hooks'
import { PageHeader } from '../components/ui'
import Sheet from '../components/Sheet'
import { eur, fmtShort, fmtDate } from '../util'

function GoalForm({ goal, onDone }) {
  const { showToast } = useApp()
  const [f, setF] = useState({ name: goal?.name || '', target: goal?.target ?? '', deadline: goal?.deadline || '' })
  const [err, setErr] = useState('')
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  const save = async (e) => {
    e.preventDefault()
    const body = { name: f.name.trim(), target: Number(f.target), deadline: f.deadline || null }
    try { goal ? await api.patch(`/goals/${goal.id}`, body) : await api.post('/goals', body); onDone() } catch (x) { setErr(x.message) }
  }
  const remove = async () => { await api.del(`/goals/${goal.id}`); onDone(); showToast('Obiettivo eliminato', { label: 'Annulla', run: () => api.post(`/trash/goals/${goal.id}/restore`) }) }
  return (
    <form onSubmit={save} className="space-y-3">
      <div><label className="label" htmlFor="g-nome">Per cosa risparmiate?</label><input id="g-nome" className="input" value={f.name} onChange={set('name')} placeholder="Es. Vacanza in Giappone" required maxLength={80} autoFocus /></div>
      <div className="grid grid-cols-2 gap-2">
        <div><label className="label" htmlFor="g-importo">Obiettivo €</label><input id="g-importo" className="input" type="number" inputMode="decimal" min="1" step="0.01" value={f.target} onChange={set('target')} required /></div>
        <div><label className="label" htmlFor="g-scad">Entro il</label><input id="g-scad" className="input" type="date" value={f.deadline} onChange={set('deadline')} /></div>
      </div>
      {err && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{err}</p>}
      <div className="flex gap-2">{goal && <button type="button" className="btn-danger" aria-label="Elimina" onClick={remove}><Trash2 size={18} /></button>}<button className="btn flex-1" disabled={!f.name.trim() || !f.target}>{goal ? 'Salva' : 'Crea obiettivo'}</button></div>
    </form>
  )
}

function Detail({ id, onClose, onEdit }) {
  const { couple, user, showToast } = useApp()
  const { data: g, setData, reload } = useLive(`/goals/${id}`, ['goals'])
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const name = (uid) => (uid === user.id ? 'Tu' : couple.members.find((m) => m.id === uid)?.name)
  if (!g) return <p className="text-mute">Un attimo…</p>
  const add = async (sign) => {
    const v = Number(amount); if (!v) return
    try { setData(await api.post(`/goals/${id}/deposits`, { amount: sign * Math.abs(v), note: note.trim() || null })); setAmount(''); setNote('') } catch (e) { showToast(e.message) }
  }
  const del = async (d) => { try { setData(await api.del(`/goals/${id}/deposits/${d.id}`)) } catch (e) { showToast(e.message) } }
  return (
    <div className="space-y-4">
      <div className="text-center"><div className="display text-5xl text-accent">{eur(g.saved)}</div><div className="text-mute">di {eur(g.target)} · {g.pct}%</div></div>
      <div className="h-3 overflow-hidden rounded-full bg-soft"><div className="h-full rounded-full bg-accent transition-all" style={{ width: g.pct + '%' }} /></div>
      {g.reached ? <p className="text-center font-medium text-accent">Obiettivo raggiunto! 🎉</p> : g.monthly_needed ? <p className="text-center text-sm text-mute">Per farcela entro il {fmtDate(g.deadline)} servono circa {eur(g.monthly_needed)} al mese.</p> : null}
      <div className="grid grid-cols-2 gap-2">{couple.members.map((m) => <div key={m.id} className="rounded-2xl bg-soft p-3 text-center"><div className="eyebrow">{name(m.id)}</div><div className="display text-2xl">{eur(g.by_member[m.id] || 0)}</div></div>)}</div>
      <div className="space-y-2">
        <label className="label" htmlFor="d-importo">Nuovo versamento</label>
        <div className="flex gap-2"><input id="d-importo" className="input" type="number" inputMode="decimal" min="0" step="0.01" placeholder="€" value={amount} onChange={(e) => setAmount(e.target.value)} /><input aria-label="Nota" className="input" placeholder="Nota (facoltativa)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} /></div>
        <div className="flex gap-2"><button className="btn flex-1" disabled={!Number(amount)} onClick={() => add(1)}>Aggiungi</button><button className="btn-soft flex-1" disabled={!Number(amount)} onClick={() => add(-1)}>Preleva</button></div>
      </div>
      {g.deposits.length > 0 && <div className="card divide-y divide-line !py-1">{g.deposits.map((d) => (
        <div key={d.id} className="flex items-center gap-3 py-2.5"><div className="min-w-0 flex-1"><div className="font-medium">{d.amount > 0 ? '+' : ''}{eur(d.amount)}</div><div className="truncate text-xs text-mute">{name(d.by)} · {fmtShort(d.date)}{d.note ? ` · ${d.note}` : ''}</div></div><button aria-label="Rimuovi versamento" className="p-1 text-mute" onClick={() => del(d)}><X size={16} /></button></div>))}</div>}
      <button className="btn-soft w-full" onClick={onEdit}>Modifica obiettivo</button>
    </div>
  )
}

export default function Risparmi() {
  const { data, reload } = useLive('/goals', ['goals'])
  const [sheet, setSheet] = useState(null)
  const done = () => { setSheet(null); reload() }
  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Mettiamo da parte" title="Risparmi" action={<button aria-label="Nuovo obiettivo" className="icon-btn" onClick={() => setSheet({ form: true })}><Plus size={22} /></button>} />
      {data === null ? <p className="text-mute">Un attimo…</p> : data.length === 0 ? <div className="card text-center text-mute">Nessun obiettivo ancora.<br />Una vacanza, un divano, un fondo emergenze: da dove partite?</div> : data.map((g) => (
        <button key={g.id} onClick={() => setSheet({ id: g.id })} className="card block w-full space-y-3 text-left">
          <div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent/15 text-accent">{g.reached ? <Target size={20} strokeWidth={1.6} /> : <PiggyBank size={20} strokeWidth={1.6} />}</span>
            <span className="min-w-0 flex-1"><span className="display block truncate text-xl">{g.name}</span><span className="text-sm text-mute">{eur(g.saved)} di {eur(g.target)}</span></span><span className="font-medium text-accent">{g.pct}%</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-soft"><div className="h-full rounded-full bg-accent" style={{ width: g.pct + '%' }} /></div>
        </button>))}
      {sheet?.form && <Sheet title={sheet.goal ? 'Modifica obiettivo' : 'Nuovo obiettivo'} onClose={() => setSheet(null)}><GoalForm goal={sheet.goal} onDone={done} /></Sheet>}
      {sheet?.id && <Sheet title="Obiettivo" onClose={done}><Detail id={sheet.id} onClose={done} onEdit={async () => setSheet({ form: true, goal: await api.get(`/goals`).then((l) => l.find((x) => x.id === sheet.id)) })} /></Sheet>}
    </div>
  )
}
