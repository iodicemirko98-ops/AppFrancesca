import { Fragment, useState } from 'react'
import { Plus, Tag, Check, HandMetal, ListChecks } from 'lucide-react'
import { api } from '../api'
import { PageHeader } from '../components/ui'
import { useApp } from '../state'
import { useLive } from '../hooks'
import { SelectBar, SelectMark, useSelect } from '../select'
import Sheet from '../components/Sheet'

const dueLabel = (due, today) => {
  if (!due) return ''
  const diff = Math.round((new Date(due + 'T12:00') - new Date(today + 'T12:00')) / 864e5)
  if (diff < 0) return diff === -1 ? 'ieri' : `${-diff} giorni fa`
  if (diff === 0) return 'oggi'
  if (diff === 1) return 'domani'
  return new Date(due + 'T12:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })
}

function TaskForm({ task, cats, onDone }) {
  const { couple, user, showToast } = useApp()
  const [f, setF] = useState({ title: task?.title || '', notes: task?.notes || '', due: task?.due || '', assignee: task?.assignee || '', category_id: task?.category_id || '' })
  const [err, setErr] = useState('')
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  const body = () => ({ title: f.title.trim(), notes: f.notes.trim() || null, due: f.due || null, assignee: f.assignee || null, category_id: f.category_id || null })
  const save = async (e) => {
    e.preventDefault()
    try { task ? await api.patch(`/tasks/${task.id}`, body()) : await api.post('/tasks', body()); onDone() } catch (x) { setErr(x.message) }
  }
  const remove = async () => { await api.del(`/tasks/${task.id}`); onDone(); showToast('Attività eliminata', { label: 'Annulla', run: () => api.post(`/trash/tasks/${task.id}/restore`) }) }
  const partner = couple.members.find((m) => m.id !== user.id)
  return (
    <form onSubmit={save} className="space-y-3">
      <div><label className="label" htmlFor="t-titolo">Cosa c'è da fare?</label><input id="t-titolo" className="input" value={f.title} onChange={set('title')} autoFocus required maxLength={140} /></div>
      <div className="grid grid-cols-2 gap-2">
        <div><label className="label" htmlFor="t-scad">Scadenza</label><input id="t-scad" type="date" className="input" value={f.due} onChange={set('due')} /></div>
        <div><label className="label" htmlFor="t-ass">Di chi è?</label>
          <select id="t-ass" className="input" value={f.assignee} onChange={set('assignee')}>
            <option value="">Di nessuno</option><option value={user.id}>Mia</option>
            {partner && <option value={partner.id}>Di {partner.name}</option>}{partner && <option value="both">Di entrambi</option>}
          </select></div>
      </div>
      <div><label className="label" htmlFor="t-cat">Categoria</label>
        <select id="t-cat" className="input" value={f.category_id} onChange={set('category_id')}><option value="">Nessuna</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
      <div><label className="label" htmlFor="t-note">Note</label><textarea id="t-note" className="input" rows={2} value={f.notes} onChange={set('notes')} maxLength={1000} /></div>
      {err && <p className="text-sm text-red-600 dark:text-red-400">{err}</p>}
      <div className="flex gap-2">{task && <button type="button" className="btn-danger" onClick={remove}>Elimina</button>}<button className="btn flex-1" disabled={!f.title.trim()}>{task ? 'Salva' : 'Aggiungi'}</button></div>
    </form>
  )
}

function Cats({ cats, onChange }) {
  const [name, setName] = useState('')
  const colors = ['#C2603F', '#D49A3A', '#6E9B6B', '#4F8FA8', '#8B6BB1', '#C4577A']
  const add = async (e) => { e.preventDefault(); if (!name.trim()) return; await api.post('/task-categories', { name: name.trim(), color: colors[cats.length % colors.length] }); setName(''); onChange() }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">{cats.length === 0 && <p className="text-mute">Ancora nessuna categoria.</p>}
        {cats.map((c) => <span key={c.id} className="flex items-center gap-2 rounded-full bg-soft py-1.5 pl-3 pr-2"><i className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />{c.name}
          <button aria-label={`Elimina ${c.name}`} onClick={async () => { await api.del(`/task-categories/${c.id}`); onChange() }} className="px-1 text-mute">✕</button></span>)}</div>
      <form onSubmit={add} className="flex gap-2"><input aria-label="Nuova categoria" className="input" placeholder="Nuova categoria" value={name} onChange={(e) => setName(e.target.value)} maxLength={30} /><button className="btn">Aggiungi</button></form>
    </div>
  )
}

export default function Tasks() {
  const { couple, user, home, showToast } = useApp()
  const { data: tasks, reload, setData: setTasks } = useLive('/tasks', ['tasks'])
  const { data: cats, reload: reloadCats } = useLive('/task-categories', ['task_categories'])
  const [sheet, setSheet] = useState(null)
  const [who, setWho] = useState('tutte')
  const [showDone, setShowDone] = useState(false)
  const partner = couple.members.find((m) => m.id !== user.id)
  const today = home.today
  const name = (id) => (id === 'both' ? 'Entrambi' : id === user.id ? 'Io' : couple.members.find((m) => m.id === id)?.name)
  const visible = (tasks || []).filter((t) => who === 'tutte' || t.assignee === who || t.assignee === 'both')
  const open = visible.filter((t) => !t.done), done = visible.filter((t) => t.done)
  const toggle = async (t) => {
    setTasks((cur) => cur.map((x) => (x.id === t.id ? { ...x, done: !t.done } : x))) // subito, senza aspettare la rete
    try { await api.patch(`/tasks/${t.id}`, { done: !t.done }) } finally { reload() }
  }
  const nudge = async (t) => {
    try { await api.post(`/tasks/${t.id}/nudge`); showToast(`Sollecito inviato a ${partner.name} 😏`); reload() } catch (e) { showToast(e.message) }
  }
  const sel = useSelect('tasks', visible.map((t) => t.id), reload)
  const catOf = (id) => (cats || []).find((c) => c.id === id)

  const Item = ({ t }) => {
    const c = catOf(t.category_id), late = !t.done && t.due && t.due < today
    const canNudge = !t.done && partner && t.assignee && t.assignee !== user.id
    if (sel.on) return (
      <button onClick={() => sel.toggle(t.id)} className="card flex w-full items-center gap-3 !rounded-2xl !p-4 text-left">
        <SelectMark checked={sel.ids.has(t.id)} />
        <span className={`min-w-0 flex-1 truncate font-medium ${t.done ? 'text-mute line-through' : ''}`}>{t.title}</span>
      </button>
    )
    return (
      <div className="card flex items-start gap-3 !rounded-2xl !p-4">
        <button role="checkbox" aria-checked={t.done} aria-label={`Completa ${t.title}`} onClick={() => toggle(t)}
          className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-2 ${t.done ? 'bg-accent text-accent-ink ring-accent' : 'ring-line'}`}>{t.done ? <Check size={16} strokeWidth={2.5} /> : null}</button>
        <button className="min-w-0 flex-1 text-left" onClick={() => setSheet({ task: t })}>
          <span className={`block font-medium ${t.done ? 'text-mute line-through' : ''}`}>{t.title}</span>
          <span className="flex flex-wrap items-center gap-x-2 text-sm text-mute">
            {t.due && <span className={late ? 'font-semibold text-red-600 dark:text-red-400' : ''}>{late ? '⚠ ' : ''}{dueLabel(t.due, today)}</span>}
            {t.assignee && <span>· {name(t.assignee)}</span>}
            {c && <span className="flex items-center gap-1">· <i className="h-2 w-2 rounded-full" style={{ background: c.color }} />{c.name}</span>}
            {t.done && t.done_by && <span>· fatta da {name(t.done_by)}</span>}
          </span>
        </button>
        {canNudge && <button aria-label={`Sollecita ${t.title}`} title="Sollecita" onClick={() => nudge(t)} className="icon-btn-soft !h-10 !w-10 text-accent"><HandMetal size={18} strokeWidth={1.6} /></button>}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Da fare" title="Attività" action={<><button aria-label="Seleziona" className="icon-btn-soft" onClick={() => (sel.on ? sel.stop() : sel.start())}><ListChecks size={19} strokeWidth={1.6} /></button><button aria-label="Categorie" className="icon-btn-soft" onClick={() => setSheet({ cats: true })}><Tag size={19} strokeWidth={1.6} /></button><button aria-label="Nuova attività" className="icon-btn" onClick={() => setSheet({})}><Plus size={22} /></button></>} />
      <div className="flex gap-2 overflow-x-auto" role="tablist">
        {[['tutte', 'Tutte'], [user.id, 'Mie'], ...(partner ? [[partner.id, `Di ${partner.name}`]] : [])].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={who === k} onClick={() => setWho(k)} className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium ${who === k ? 'bg-accent text-accent-ink' : 'bg-card text-mute ring-1 ring-line'}`}>{l}</button>
        ))}
      </div>
      {tasks === null ? <div className="skeleton" aria-busy="true"><i /><i /><i /></div> : open.length === 0 ? <div className="card text-center text-mute">Tutto fatto! 🎉<br />Niente da fare per ora.</div> : <div className="space-y-2">{open.map((t) => <Fragment key={t.id}>{Item({ t })}</Fragment>)}</div>}
      {done.length > 0 && (
        <>
          <button className="text-sm font-semibold text-mute" onClick={() => setShowDone(!showDone)}>{showDone ? '▾' : '▸'} Completate ({done.length})</button>
          {showDone && <div className="space-y-2">{done.map((t) => <Fragment key={t.id}>{Item({ t })}</Fragment>)}</div>}
        </>
      )}
      <SelectBar sel={sel} />
      {sheet && !sheet.cats && <Sheet title={sheet.task ? 'Modifica attività' : 'Nuova attività'} onClose={() => setSheet(null)}><TaskForm task={sheet.task} cats={cats || []} onDone={() => { setSheet(null); reload() }} /></Sheet>}
      {sheet?.cats && <Sheet title="Categorie" onClose={() => setSheet(null)}><Cats cats={cats || []} onChange={() => { reloadCats(); reload() }} /></Sheet>}
    </div>
  )
}
