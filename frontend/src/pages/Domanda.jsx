import { useEffect, useState } from 'react'
import { Lock, Check, Clock } from 'lucide-react'
import { api } from '../api'
import { useApp } from '../state'
import { useLive } from '../hooks'
import { PageHeader } from '../components/ui'

const fmt = (d) => new Date(d + 'T12:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })

export default function Domanda() {
  const { couple, user, reload } = useApp()
  const partner = couple.members.find((m) => m.id !== user.id)
  const { data: q, reload: load, setData } = useLive('/question/today', ['answers'])
  const { data: hist, reload: loadHist } = useLive('/question/history', ['answers'])
  const [text, setText] = useState('')
  const [editing, setEditing] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => { if (q?.my_answer != null && !editing) setText(q.my_answer) }, [q?.my_answer]) // eslint-disable-line
  if (!q) return <p className="text-mute">Un attimo…</p>
  const answered = q.my_answer != null
  const save = async (e) => {
    e.preventDefault(); setErr('')
    try { setData(await api.put('/question/today', { text })); setEditing(false); reload(); loadHist() } catch (x) { setErr(x.message) }
  }
  const pname = partner?.name || 'il partner'
  return (
    <div className="space-y-5">
      <PageHeader eyebrow={fmt(q.date)} title="Domanda del giorno" />
      <div className="relative overflow-hidden rounded-3xl bg-accent p-6 text-accent-ink">
        <div className="pointer-events-none absolute -right-8 -top-10 h-40 w-40 rounded-full border-[14px] border-white/20" />
        <div className="eyebrow !text-accent-ink/80">Oggi</div>
        <p className="display mt-3 text-[1.9rem] leading-tight">{q.question}</p>
      </div>

      {(!answered || editing) ? (
        <form onSubmit={save} className="card space-y-3">
          <label className="label" htmlFor="risposta">La tua risposta</label>
          <textarea id="risposta" className="input" rows={4} value={text} onChange={(e) => setText(e.target.value)} maxLength={1500} placeholder={`Scrivi con calma: ${pname} la leggerà solo dopo aver risposto`} />
          <p className="flex items-center gap-2 text-sm text-mute"><Lock size={14} />Resta segreta finché non rispondete entrambi.</p>
          {err && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{err}</p>}
          <div className="flex gap-2">{editing && <button type="button" className="btn-soft" onClick={() => { setEditing(false); setText(q.my_answer) }}>Annulla</button>}<button className="btn flex-1" disabled={!text.trim()}>{answered ? 'Salva modifica' : 'Invia risposta'}</button></div>
        </form>
      ) : (
        <div className="space-y-3">
          <div className="card">
            <div className="eyebrow">La tua risposta</div>
            <p className="mt-2 whitespace-pre-wrap">{q.my_answer}</p>
            <button className="mt-3 text-sm font-medium text-accent" onClick={() => setEditing(true)}>Modifica</button>
          </div>
          {q.partner_answer != null ? (
            <div className="card ring-accent/40">
              <div className="eyebrow">{pname}</div>
              <p className="display mt-2 whitespace-pre-wrap text-xl leading-snug">{q.partner_answer}</p>
            </div>
          ) : q.paired ? (
            <div className="card flex items-center gap-3 text-mute"><Clock size={20} strokeWidth={1.6} /><span>Ora tocca a {pname}: vedrai la risposta appena avrà scritto la sua.</span></div>
          ) : <div className="card text-mute">Quando il partner si collega, qui compariranno anche le sue risposte.</div>}
        </div>
      )}
      {!answered && q.partner_answered && <div className="card flex items-center gap-3 !p-4"><Check size={18} className="text-accent" /><span>{pname} ha già risposto. Scrivi la tua per leggerla!</span></div>}

      {hist && hist.length > 0 && (
        <section className="space-y-2">
          <h2 className="eyebrow px-1">Le scorse domande</h2>
          {hist.map((h) => (
            <div key={h.date} className="card !rounded-2xl !p-4">
              <div className="text-xs text-mute">{fmt(h.date)}</div>
              <div className="display mb-2 text-xl leading-snug">{h.question}</div>
              <p className="text-sm"><span className="font-medium">Tu:</span> {h.mine ?? <em className="text-mute">nessuna risposta</em>}</p>
              {partner && <p className="text-sm"><span className="font-medium">{partner.name}:</span> {h.partner ?? <em className="text-mute">nessuna risposta</em>}</p>}
            </div>
          ))}
        </section>
      )}
    </div>
  )
}
