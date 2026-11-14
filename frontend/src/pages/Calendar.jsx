import { useMemo, useState } from 'react'
import { Plus, ChevronLeft, ChevronRight, Repeat } from 'lucide-react'
import { api } from '../api'
import { PageHeader } from '../components/ui'
import { useApp } from '../state'
import { useLive, iso } from '../hooks'
import Sheet from '../components/Sheet'

export const CATS = { noi: ['Noi', '#C2603F'], lavoro: ['Lavoro', '#4F8FA8'], famiglia: ['Famiglia', '#6E9B6B'], amici: ['Amici', '#D49A3A'], viaggi: ['Viaggi', '#8B6BB1'], casa: ['Casa', '#7A6A5E'] }
const TYPES = { evento: 'Evento', compleanno: '🎂 Compleanno', anniversario: '💞 Anniversario' }
const RECS = { nessuna: 'Non si ripete', giornaliera: 'Ogni giorno', settimanale: 'Ogni settimana', mensile: 'Ogni mese', annuale: 'Ogni anno' }
const REMINDERS = [[null, 'Nessuno'], [0, "All'ora dell'evento"], [30, '30 minuti prima'], [60, '1 ora prima'], [1440, '1 giorno prima']]
const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']

export const timeOf = (e) => (e.all_day ? 'Tutto il giorno' : e.start.slice(11) + (e.end !== e.start ? '–' + (e.end.slice(0, 10) === e.start.slice(0, 10) ? e.end.slice(11) : e.end.slice(8, 10) + '/' + e.end.slice(5, 7)) : ''))

function EventForm({ event, day, onDone }) {
  const { showToast } = useApp()
  const [f, setF] = useState(() => event ? {
    title: event.title, all_day: event.all_day, start: event.start.slice(0, 10), start_t: event.all_day ? '20:00' : event.start.slice(11),
    end: event.end.slice(0, 10), end_t: event.all_day ? '21:00' : event.end.slice(11), location: event.location || '', notes: event.notes || '',
    category: event.category, type: event.type, recurrence: event.recurrence, reminder: event.reminder ?? null,
  } : { title: '', all_day: false, start: day, start_t: '20:00', end: day, end_t: '21:00', location: '', notes: '', category: 'noi', type: 'evento', recurrence: 'nessuna', reminder: null })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target?.value ?? e }))
  const body = () => ({
    title: f.title.trim(), location: f.location.trim() || null, notes: f.notes.trim() || null,
    category: f.category, type: f.type, recurrence: f.recurrence, reminder: f.all_day ? null : f.reminder,
    start: f.all_day ? f.start : `${f.start}T${f.start_t}`, end: f.all_day ? (f.end || f.start) : `${f.end || f.start}T${f.end_t}`,
  })
  const save = async (e) => {
    e.preventDefault(); setBusy(true); setErr('')
    try { event ? await api.patch(`/events/${event.id}`, body()) : await api.post('/events', body()); onDone() } catch (x) { setErr(x.message); setBusy(false) }
  }
  const remove = async () => {
    await api.del(`/events/${event.id}`); onDone()
    showToast('Evento eliminato', { label: 'Annulla', run: () => api.post(`/trash/events/${event.id}/restore`) })
  }
  return (
    <form onSubmit={save} className="space-y-3">
      <div><label className="label" htmlFor="ev-titolo">Titolo</label><input id="ev-titolo" className="input" value={f.title} onChange={set('title')} placeholder="Es. Cena da Luigi" autoFocus required maxLength={120} /></div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.all_day} onChange={(e) => set('all_day')(e.target.checked)} /> Tutto il giorno</label>
      <div className="grid grid-cols-2 gap-2">
        <div><label className="label" htmlFor="ev-inizio">Inizio</label><input id="ev-inizio" type="date" className="input" value={f.start} onChange={set('start')} required /></div>
        {!f.all_day && <div><label className="label" htmlFor="ev-ora">Ora</label><input id="ev-ora" type="time" className="input" value={f.start_t} onChange={set('start_t')} required /></div>}
        <div><label className="label" htmlFor="ev-fine">Fine</label><input id="ev-fine" type="date" className="input" value={f.end} min={f.start} onChange={set('end')} /></div>
        {!f.all_day && <div><label className="label" htmlFor="ev-ora-fine">Ora</label><input id="ev-ora-fine" type="time" className="input" value={f.end_t} onChange={set('end_t')} /></div>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div><label className="label" htmlFor="ev-tipo">Tipo</label><select id="ev-tipo" className="input" value={f.type} onChange={set('type')}>{Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div><label className="label" htmlFor="ev-cat">Categoria</label><select id="ev-cat" className="input" value={f.category} onChange={set('category')}>{Object.entries(CATS).map(([k, [v]]) => <option key={k} value={k}>{v}</option>)}</select></div>
      </div>
      <div><label className="label" htmlFor="ev-rec">Ripetizione</label><select id="ev-rec" className="input" value={f.recurrence} onChange={set('recurrence')}>{Object.entries(RECS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
      {!f.all_day && <div><label className="label" htmlFor="ev-prom">Promemoria</label><select id="ev-prom" className="input" value={f.reminder ?? ''} onChange={(e) => set('reminder')(e.target.value === '' ? null : Number(e.target.value))}>{REMINDERS.map(([k, v]) => <option key={v} value={k ?? ''}>{v}</option>)}</select></div>}
      <div><label className="label" htmlFor="ev-luogo">Luogo</label><input id="ev-luogo" className="input" value={f.location} onChange={set('location')} maxLength={160} /></div>
      <div><label className="label" htmlFor="ev-note">Note</label><textarea id="ev-note" className="input" rows={2} value={f.notes} onChange={set('notes')} maxLength={1000} /></div>
      {err && <p className="text-sm text-red-600 dark:text-red-400">{err}</p>}
      <div className="flex gap-2">
        {event && <button type="button" className="btn-danger" onClick={remove}>Elimina</button>}
        <button className="btn flex-1" disabled={busy || !f.title.trim()}>{event ? 'Salva' : 'Aggiungi'}</button>
      </div>
      {event?.is_recurring && <p className="text-xs text-mute">Le modifiche valgono per tutte le ripetizioni.</p>}
    </form>
  )
}

export function EventRow({ e, onClick, showDate }) {
  const [, color] = CATS[e.category] || CATS.noi
  const d = new Date(e.start.slice(0, 10) + 'T12:00:00')
  return (
    <button onClick={onClick} className="card flex w-full items-center gap-3 !rounded-2xl !p-4 text-left">
      <span className="h-10 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{e.type === 'compleanno' ? '🎂 ' : e.type === 'anniversario' ? '💞 ' : ''}{e.title}</span>
        <span className="block truncate text-sm text-mute">{showDate && `${d.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })} · `}{timeOf(e)}{e.location ? ` · ${e.location}` : ''}</span>
      </span>
      {e.is_recurring && <Repeat aria-label="Si ripete" size={16} className="text-mute" />}
    </button>
  )
}

export default function Calendar() {
  const today = iso(new Date())
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [sel, setSel] = useState(today)
  const [sheet, setSheet] = useState(null) // {event?} | {}
  const y = cursor.getFullYear(), m = cursor.getMonth()
  const offset = (new Date(y, m, 1).getDay() + 6) % 7 // settimana da lunedì
  const first = new Date(y, m, 1 - offset), last = new Date(first); last.setDate(first.getDate() + 41)
  const { data, error, reload } = useLive(`/events?from=${iso(first)}&to=${iso(last)}`, ['events'])
  const byDay = useMemo(() => {
    const map = {}
    for (const e of data || []) {
      const a = new Date(e.start.slice(0, 10) + 'T12:00'), b = new Date(e.end.slice(0, 10) + 'T12:00')
      for (let d = new Date(a); d <= b && d <= last; d.setDate(d.getDate() + 1)) (map[iso(d)] ||= []).push(e)
    }
    return map
  }, [data]) // eslint-disable-line
  const days = Array.from({ length: 42 }, (_, i) => { const d = new Date(first); d.setDate(first.getDate() + i); return d })
  const move = (n) => setCursor(new Date(y, m + n, 1))
  const dayEvents = byDay[sel] || []
  const monthEvents = (data || []).filter((e) => e.start.slice(0, 7) === `${y}-${String(m + 1).padStart(2, '0')}`)
  const done = () => { setSheet(null); reload() }

  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Il nostro tempo" title={<span className="capitalize">{MONTHS[m]} {y}</span>}
        action={<><button aria-label="Mese precedente" className="icon-btn-soft" onClick={() => move(-1)}><ChevronLeft size={20} /></button><button aria-label="Mese successivo" className="icon-btn-soft" onClick={() => move(1)}><ChevronRight size={20} /></button></>} />
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <div className="card !p-3">
        <div className="mb-1 grid grid-cols-7 text-center text-xs font-semibold text-mute">{['L', 'M', 'M', 'G', 'V', 'S', 'D'].map((l, i) => <div key={i}>{l}</div>)}</div>
        <div className="grid grid-cols-7 gap-y-1">
          {days.map((d) => {
            const k = iso(d), evs = byDay[k] || [], other = d.getMonth() !== m
            return (
              <button key={k} aria-label={d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })} onClick={() => setSel(k)}
                className={`mx-auto flex h-11 w-11 flex-col items-center justify-center rounded-full text-sm ${k === sel ? 'bg-accent text-accent-ink' : k === today ? 'ring-2 ring-accent' : ''} ${other && k !== sel ? 'text-mute/50' : ''}`}>
                {d.getDate()}
                <span className="flex h-1.5 gap-0.5">{evs.slice(0, 3).map((e, i) => <i key={i} className="h-1.5 w-1.5 rounded-full" style={{ background: k === sel ? 'currentColor' : (CATS[e.category] || CATS.noi)[1] }} />)}</span>
              </button>
            )
          })}
        </div>
      </div>
      <div className="flex items-center justify-between">
        <h2 className="display text-2xl">{new Date(sel + 'T12:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
        <button aria-label="Nuovo evento" className="icon-btn" onClick={() => setSheet({})}><Plus size={22} /></button>
      </div>
      <div className="space-y-2">
        {dayEvents.length === 0 && <p className="text-mute">Niente in programma per questo giorno.</p>}
        {dayEvents.map((e) => <EventRow key={e.key} e={e} onClick={() => setSheet({ event: e })} />)}
      </div>
      {monthEvents.length > 0 && (
        <>
          <h2 className="eyebrow pt-2">Agenda di {MONTHS[m]}</h2>
          <div className="space-y-2">{monthEvents.map((e) => <EventRow key={'a' + e.key} e={e} showDate onClick={() => setSheet({ event: e })} />)}</div>
        </>
      )}
      {sheet && <Sheet title={sheet.event ? 'Modifica evento' : 'Nuovo evento'} onClose={() => setSheet(null)}><EventForm event={sheet.event} day={sel} onDone={done} /></Sheet>}
    </div>
  )
}
