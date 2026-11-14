import { useState } from 'react'
import { useApp } from '../state'
import { Avatar } from '../components/ui'
import MilestoneCard from '../components/MilestoneCard'
import { fmtDate } from '../util'

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
      <div className="text-sm font-medium text-mute">Invita il tuo partner</div>
      <div className="my-3 text-4xl font-extrabold tracking-[.35em] text-accent">{code}</div>
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
      <div className="font-semibold">Da quando state insieme?</div>
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

  return (
    <div className="space-y-4">
      <div className="card text-center">
        <div className="mb-3 flex items-center justify-center">
          <Avatar person={me} size={72} />
          <div className="-ml-3"><Avatar person={partner || { name: '?' }} size={72} /></div>
        </div>
        <h1 className="text-xl font-bold">{partner ? names : `${me?.name} & …`}</h1>
        {home.days_together != null ? (
          <div className="mt-3">
            <div className="text-6xl font-extrabold text-accent">{home.days_together}</div>
            <div className="text-mute">giorni insieme</div>
            <div className="mt-1 text-xs text-mute">dal {fmtDate(couple.start_date)}</div>
          </div>
        ) : (
          <div className="mt-2 text-mute">Aggiungi la data di inizio per far partire il contatore</div>
        )}
      </div>

      {m?.today && <MilestoneCard label={m.today} names={names} days={home.days_together} />}
      {!m?.today && m?.next && (
        <div className="card flex items-center gap-4">
          <div className="text-3xl">🎈</div>
          <div>
            <div className="font-semibold">Prossima data tonda: {m.next.label}</div>
            <div className="text-sm text-mute">{m.next.in_days === 1 ? 'domani' : `tra ${m.next.in_days} giorni`} · {fmtDate(m.next.date)}</div>
          </div>
        </div>
      )}

      {home.days_together == null && <StartDate />}
      {!couple.paired && <Invite code={couple.invite_code} />}
    </div>
  )
}
