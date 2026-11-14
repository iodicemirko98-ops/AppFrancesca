import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, Check, X, Trophy } from 'lucide-react'
import { api } from '../api'
import { useApp } from '../state'
import { useLive } from '../hooks'
import { PageHeader } from '../components/ui'

const TIME_MS = 15000
const catInfo = (cats, id) => (id === 'mix' ? { name: 'Mix', emoji: '🎲' } : cats.find((c) => c.id === id) || { name: 'Trivia', emoji: '❓' })

const TAGS = { 'Curiosità': '💡 Curiosità', Libri: '📖 Libri', Film: '🎬 Film', Magia: '✨ Magia', Trama: '📜 Trama' }
const RANKS = [[10, 'Mago del secolo 🧙'], [8, 'Auror del Ministero 🪄'], [6, 'Prefetto di Hogwarts 🎖️'], [4, 'Studente modello 📚'], [2, 'Primo anno 🧹'], [0, 'Babbano 🫏']]
const rankOf = (n) => RANKS.find(([min]) => n >= min)[1]
const HP_BG = 'linear-gradient(135deg,#2a1a4a 0%,#5b2a86 55%,#c9962b 130%)'

export function TriviaHome() {
  const { couple, user, showToast } = useApp()
  const nav = useNavigate()
  const { data } = useLive('/trivia/matches', ['trivia'])
  const [cats, setCats] = useState([])
  const [busy, setBusy] = useState(false)
  useEffect(() => { api.get('/trivia/categories').then(setCats).catch(() => {}) }, [])
  const partner = couple.members.find((m) => m.id !== user.id)
  const start = async (cat) => {
    if (busy) return
    setBusy(true)
    try { nav(`/trivia/${(await api.post('/trivia/matches', { cat })).id}`) } catch (e) { showToast(e.message) } finally { setBusy(false) }
  }
  const s = data?.stats
  const status = (m) => {
    if (m.status === 'finita') return m.partner_score === undefined ? `${m.score} punti` : `${m.score} – ${m.partner_score}`
    if (m.status === 'tocca_a_te') return m.answered > 0 ? `Continua (${m.answered}/${m.total})` : 'Tocca a te'
    return partner ? `Aspetti ${partner.name}` : 'In attesa'
  }
  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Giochiamo" title="Trivia" />
      {partner && s && (
        <div className="card text-center">
          <div className="eyebrow mb-2">Sfida a due</div>
          <div className="flex items-center justify-center gap-6">
            <div><div className="display text-5xl">{s.wins[user.id] || 0}</div><div className="text-sm text-mute">{user.name}</div></div>
            <div className="text-mute">–</div>
            <div><div className="display text-5xl">{s.wins[partner.id] || 0}</div><div className="text-sm text-mute">{partner.name}</div></div>
          </div>
          <p className="mt-2 text-sm text-mute">{s.played === 0 ? 'Nessuna sfida conclusa: iniziate la prima!' : `${s.played} ${s.played === 1 ? "sfida giocata" : "sfide giocate"}${s.draws ? ` · ${s.draws} pareggi` : ''}`}</p>
        </div>
      )}
      <div>
        <h2 className="eyebrow mb-2 px-1">Scegli un argomento</h2>
        {cats.filter((c) => c.themed).map((c) => (
          <button key={c.id} disabled={busy} onClick={() => start(c.id)} className="mb-2 flex w-full items-center gap-4 rounded-3xl p-5 text-left text-white shadow-lg" style={{ background: HP_BG }}>
            <span className="text-4xl" aria-hidden>{c.emoji}</span>
            <span className="min-w-0 flex-1"><span className="display block text-2xl leading-tight">{c.name}</span>
              <span className="text-sm opacity-90">Libri, film, magia e curiosità · {c.count} domande</span></span>
          </button>
        ))}
        <div className="grid grid-cols-2 gap-2">
          {[{ id: 'mix', name: 'Un po\' di tutto', emoji: '🎲' }, ...cats.filter((c) => !c.themed)].map((c) => (
            <button key={c.id} disabled={busy} onClick={() => start(c.id)} className="card flex items-center gap-3 !rounded-2xl !p-4 text-left">
              <span className="text-2xl" aria-hidden>{c.emoji}</span><span className="font-medium leading-tight">{c.name}</span>
            </button>
          ))}
        </div>
        <p className="mt-2 px-1 text-xs text-mute">10 domande, 15 secondi l'una. {partner ? `${partner.name} gioca le stesse domande quando vuole: i risultati si vedono quando avete finito entrambi.` : ''}</p>
      </div>
      {data?.matches.length > 0 && (
        <div className="space-y-2">
          <h2 className="eyebrow px-1">Le vostre partite</h2>
          {data.matches.map((m) => {
            const c = catInfo(cats, m.cat)
            return (
              <Link key={m.id} to={`/trivia/${m.id}`} className="card flex items-center gap-3 !rounded-2xl !p-4">
                <span className="text-2xl" aria-hidden>{c.emoji}</span>
                <span className="min-w-0 flex-1"><span className="block font-medium">{c.name}</span>
                  <span className="text-sm text-mute">{new Date(m.created_at).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}</span></span>
                <span className={`rounded-full px-3 py-1 text-sm font-semibold ${m.status === 'tocca_a_te' ? 'bg-accent text-accent-ink' : 'bg-soft text-mute'}`}>{status(m)}</span>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function TriviaMatch() {
  const { id } = useParams()
  const { couple, user, showToast } = useApp()
  const { data, error, reload } = useLive(`/trivia/matches/${id}`, ['trivia'])
  const [cats, setCats] = useState([])
  const [idx, setIdx] = useState(null)
  const [fb, setFb] = useState(null) // {choice, right, points}
  const [picked, setPicked] = useState(null) // scelta immediata, prima della risposta del server
  const [left, setLeft] = useState(TIME_MS)
  const t0 = useRef(0)
  const lock = useRef(false)
  const partner = couple.members.find((m) => m.id !== user.id)
  useEffect(() => { api.get('/trivia/categories').then(setCats).catch(() => {}) }, [])
  useEffect(() => { if (data && idx === null) setIdx(data.answered) }, [data, idx])

  const playing = data && idx !== null && idx < data.total
  // timer: riparte a ogni nuova domanda
  useEffect(() => {
    if (!playing || fb || picked) return
    t0.current = Date.now(); setLeft(TIME_MS)
    const t = setInterval(() => {
      const l = TIME_MS - (Date.now() - t0.current)
      if (l <= 0) { clearInterval(t); setLeft(0); submit(null) } else setLeft(l)
    }, 100)
    return () => clearInterval(t)
  }, [playing, idx, fb, picked]) // eslint-disable-line react-hooks/exhaustive-deps

  const next = async (done) => {
    setFb(null); setPicked(null); lock.current = false
    if (done) await reload()
    setIdx((i) => i + 1)
  }

  const submit = async (choice) => {
    if (lock.current) return
    lock.current = true
    const ms = Date.now() - t0.current
    setPicked({ choice })
    try {
      const r = await api.post(`/trivia/matches/${id}/answer`, { q: idx, choice, ms })
      setFb({ choice, right: r.right, points: r.points, fact: r.fact, done: r.done })
      if (!r.fact) setTimeout(next, 1300, r.done)
    } catch (e) {
      lock.current = false; setPicked(null)
      if (e.status === 409) { await reload(); setIdx(null) } else showToast(e.message)
    }
  }

  if (error && !data) return <div className="card text-center"><p className="mb-3 text-mute">Sfida non trovata.</p><Link to="/trivia" className="btn">Torna al Trivia</Link></div>
  if (!data || idx === null) return <div className="skeleton" aria-busy="true"><i /><i /><i /></div>
  const c = catInfo(cats, data.cat)
  const back = <Link to="/trivia" aria-label="Indietro" className="icon-btn-soft"><ChevronLeft size={20} /></Link>

  if (playing) {
    const q = data.questions[idx]
    const secs = Math.ceil(left / 1000)
    const urgent = left < 5000
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">{back}
          <div className="min-w-0 flex-1"><div className="eyebrow">{c.emoji} {c.name}</div><div className="font-medium">Domanda {idx + 1} di {data.total}</div></div>
          <div className={`display text-3xl tabular-nums ${urgent ? 'text-red-600 dark:text-red-400' : ''}`} aria-label={`${secs} secondi`}>{secs}</div>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-soft" role="progressbar" aria-valuemin={0} aria-valuemax={15} aria-valuenow={secs}>
          <div className={`h-full rounded-full ${urgent ? 'bg-red-500' : 'bg-accent'}`} style={{ width: `${(left / TIME_MS) * 100}%`, transition: 'width .1s linear' }} />
        </div>
        <div key={idx} className="space-y-4" style={{ animation: 'noidue-fade .25s ease-out both' }}>
          <div className="card">{q.tag && <span className="mb-2 inline-block rounded-full bg-soft px-3 py-1 text-xs font-semibold text-mute">{TAGS[q.tag] || q.tag}</span>}
            <h1 className="display text-[1.7rem] leading-snug">{q.q}</h1></div>
          <div className="space-y-2">
            {q.options.map((o, i) => {
              const state = !fb ? (picked?.choice === i ? 'ring-2 ring-accent bg-accent/15' : picked ? 'opacity-60' : '') : i === fb.right ? 'ring-2 ring-green-600 bg-green-500/15' : i === fb.choice ? 'ring-2 ring-red-500 bg-red-500/15' : 'opacity-50'
              return (
                <button key={i} disabled={!!fb || !!picked} onClick={() => submit(i)}
                  className={`card flex w-full items-center gap-3 !rounded-2xl !p-4 text-left font-medium ${state}`}>
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-soft text-sm font-bold">{'ABCD'[i]}</span>
                  <span className="flex-1">{o}</span>
                  {!fb && picked?.choice === i && <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" aria-label="Invio" />}
                  {fb && i === fb.right && <Check size={20} className="text-green-600" />}
                  {fb && i === fb.choice && i !== fb.right && <X size={20} className="text-red-500" />}
                </button>
              )
            })}
          </div>
          {fb && <p className="text-center font-semibold">{fb.points > 0 ? `+${fb.points} punti` : fb.choice === null ? 'Tempo scaduto!' : 'Peccato!'}</p>}
          {fb?.fact && (
            <div className="rounded-3xl p-4 text-white" style={{ background: HP_BG, animation: 'noidue-fade .3s ease-out both' }}>
              <div className="eyebrow !text-white/80">⚡ Lo sapevi?</div>
              <p className="mt-1 leading-snug">{fb.fact}</p>
              <button onClick={() => next(fb.done)} className="mt-3 w-full rounded-2xl bg-white/20 py-2.5 font-semibold backdrop-blur-0">Avanti</button>
            </div>
          )}
        </div>
      </div>
    )
  }

  // risultati
  const mine = data.score ?? 0
  const hp = data.cat === 'harry_potter'
  const rights = data.questions.filter((q) => q.mine === q.right).length
  const pRights = data.partner_choices ? data.questions.filter((q, i) => data.partner_choices[i] === q.right).length : 0
  const verdict = !data.finished ? null : data.winner === null ? 'Pareggio! 🤝' : data.winner === user.id ? 'Hai vinto! 🏆' : `Ha vinto ${partner?.name} 👏`
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">{back}<div className="min-w-0 flex-1"><div className="eyebrow">{c.emoji} {c.name}</div><div className="font-medium">Risultato</div></div></div>
      <div className="card text-center">
        <Trophy size={28} className="mx-auto mb-2 text-accent" strokeWidth={1.5} />
        {data.finished && partner ? (
          <>
            <div className="flex items-center justify-center gap-6">
              <div><div className="display text-5xl">{mine}</div><div className="text-sm text-mute">{user.name}</div></div>
              <div className="text-mute">–</div>
              <div><div className="display text-5xl">{data.partner_score}</div><div className="text-sm text-mute">{partner.name}</div></div>
            </div>
            <p className="mt-3 text-xl font-semibold">{verdict}</p>
          </>
        ) : (
          <>
            <div className="display text-6xl">{mine}</div><div className="text-mute">punti</div>
            {partner && <p className="mt-3 text-sm text-mute">{`${partner.name} non ha ancora finito: i risultati compaiono quando avete concluso entrambi. Ti avviso io!`}</p>}
          </>
        )}
      </div>
      {hp && (
        <div className="rounded-3xl p-5 text-center text-white" style={{ background: HP_BG }}>
          <div className="eyebrow !text-white/80">Il Cappello Parlante dice</div>
          <div className="display mt-1 text-2xl">{rankOf(rights)}</div>
          <p className="text-sm opacity-90">{rights}/{data.total} risposte giuste</p>
          {data.finished && partner && <p className="mt-2 text-sm opacity-90">{partner.name}: {rankOf(pRights)} ({pRights}/{data.total})</p>}
        </div>
      )}
      <h2 className="eyebrow px-1">Domande</h2>
      <div className="space-y-2">
        {data.questions.map((q, i) => {
          const ok = q.mine === q.right, pc = data.partner_choices?.[i]
          return (
            <div key={i} className="card !rounded-2xl !p-4">
              <p className="font-medium">{i + 1}. {q.q}</p>
              <p className="mt-1 text-sm text-green-700 dark:text-green-400">✓ {q.options[q.right]}</p>
              {q.fact && <p className="mt-1 text-sm">⚡ {q.fact}</p>}
              <p className="text-sm text-mute">
                Tu: {q.mine === null || q.mine === undefined ? 'nessuna risposta' : q.options[q.mine]} {ok ? '✅' : '❌'}
                {data.finished && partner && <> · {partner.name}: {pc === null || pc === undefined ? 'nessuna risposta' : q.options[pc]} {pc === q.right ? '✅' : '❌'}</>}
              </p>
            </div>
          )
        })}
      </div>
      <Link to="/trivia" className="btn block w-full text-center">Nuova partita</Link>
    </div>
  )
}
