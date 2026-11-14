import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, Sparkles, ChevronRight } from 'lucide-react'
import { useApp } from '../state'
import { Avatar } from '../components/ui'
import MilestoneCard from '../components/MilestoneCard'
import { fmtDate } from '../util'
import { EventRow } from './Calendar'

function Invite({ code }) {
  const [copied, setCopied] = useState(false)
  const text = `Entra nel nostro spazio su NoiDue! Registrati e inserisci il codice invito: ${code}\n${location.origin}`
  const share = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: 'NoiDue', text }); return } catch (e) { if (e.name === 'AbortError') return }
    }
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2500) } catch {}
  }
  return (
    <div className="card text-center">
      <div className="eyebrow">Invita il tuo partner</div>
      <div className="my-3 display text-5xl tracking-[.3em] text-accent">{code}</div>
      <p className="mb-4 text-sm text-mute">Può usare l'app anche da solo: i vostri contenuti si uniranno appena si collega.</p>
      <button onClick={share} className="btn w-full">{copied ? 'Copiato negli appunti ✓' : 'Condividi il codice'}</button>
    </div>
  )
}

function StartDate() {
  const { saveCouple } = useApp()
  const [d, setD] = useState('')
  const [err, setErr] = useState('')
  const save = async () => { try { setErr(''); await saveCouple({ start_date: d }) } catch (e) { setErr(e.message) } }
  return (
    <div className="card">
      <div className="display text-2xl">Da quando state insieme?</div>
      <p className="mb-3 text-sm text-mute">Con la data possiamo contare i vostri giorni e ricordarvi le date tonde.</p>
      <div className="flex gap-2">
        <input type="date" className="input" value={d} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setD(e.target.value)} />
        <button className="btn" disabled={!d} onClick={save}>Salva</button>
      </div>
      {err && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{err}</p>}
    </div>
  )
}

export default function Home() {
  const { home, user } = useApp()
  const { couple } = home
  const me = couple.members.find((m) => m.id === user.id)
  const partner = couple.members.find((m) => m.id !== user.id)
  const names = couple.members.map((m) => m.name).join(' & ')
  const m = home.milestone
  const dateLabel = new Date(home.today + 'T12:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="space-y-4">
      <header className="flex items-center gap-3">
        <div className="flex shrink-0"><Avatar person={me} size={48} /><div className="-ml-3"><Avatar person={partner || { name: '?' }} size={48} /></div></div>
        <div className="min-w-0 flex-1">
          <div className="eyebrow truncate">{dateLabel}</div>
          <h1 className="display truncate text-[1.65rem] leading-tight">{partner ? names : `${me?.name} & …`}</h1>
        </div>
        <Link to="/notifiche" aria-label="Notifiche" className="icon-btn-soft relative">
          <Bell size={20} strokeWidth={1.6} />
          {home.unread_notifications > 0 && <span className="absolute -right-1 -top-1 min-w-[1.25rem] rounded-full bg-accent px-1 text-center text-[11px] font-semibold leading-5 text-accent-ink">{home.unread_notifications}</span>}
        </Link>
      </header>

      <div className="card">
        <div className="eyebrow">Insieme da</div>
        {home.days_together != null ? (
          <>
            <div className="mt-3 flex items-baseline gap-3"><span className="display text-7xl leading-none text-accent">{home.days_together}</span><span className="display text-2xl italic">giorni</span></div>
            <div className="mt-2 text-sm text-mute">dal {fmtDate(couple.start_date)}</div>
            {m?.next && !m.today && <div className="chip mt-3"><Sparkles size={14} />{m.next.label} {m.next.in_days === 1 ? 'domani' : `tra ${m.next.in_days} giorni`}</div>}
          </>
        ) : (
          <p className="mt-2 text-mute">Aggiungi la data di inizio per far partire il contatore</p>
        )}
      </div>

      {m?.today && <MilestoneCard label={m.today} names={names} days={home.days_together} date={fmtDate(home.today)} />}

      {couple.modules?.calendario !== false && home.next_events.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between px-1"><h2 className="eyebrow">Prossimi appuntamenti</h2><Link to="/calendario" className="flex items-center text-sm font-medium text-accent">Calendario<ChevronRight size={16} /></Link></div>
          {home.next_events.map((e) => <Link key={e.key} to="/calendario" className="block"><EventRow e={e} showDate /></Link>)}
        </section>
      )}

      {couple.modules?.attivita !== false && home.due_tasks.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between px-1"><h2 className="eyebrow">Da fare a breve</h2><Link to="/attivita" className="flex items-center text-sm font-medium text-accent">Attività<ChevronRight size={16} /></Link></div>
          {home.due_tasks.map((t) => (
            <Link key={t.id} to="/attivita" className="card flex items-center gap-3 !rounded-2xl !p-4">
              <span className="flex-1 truncate font-medium">{t.title}</span>
              <span className={`text-sm ${t.overdue ? 'font-medium text-red-600 dark:text-red-400' : 'text-mute'}`}>{t.overdue ? 'in ritardo' : fmtDate(t.due).replace(/ \d{4}$/, '')}</span>
            </Link>))}
        </section>
      )}

      {home.days_together == null && <StartDate />}
      {!couple.paired && <Invite code={couple.invite_code} />}
    </div>
  )
}
