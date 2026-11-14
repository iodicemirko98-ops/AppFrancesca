import { useState } from 'react'
import { Download, MapPin } from 'lucide-react'
import { useApp } from '../state'
import { useLive } from '../hooks'
import { PageHeader } from '../components/ui'
import { downloadBlob, eur } from '../util'

const Stat = ({ n, label }) => (
  <div className="card !p-4 text-center"><div className="display text-5xl leading-none text-accent">{n}</div><div className="mt-1 text-sm text-mute">{label}</div></div>
)

function draw(r, names) {
  const W = 1080, H = 1350, c = document.createElement('canvas'); c.width = W; c.height = H
  const g = c.getContext('2d'); const grad = g.createLinearGradient(0, 0, W, H); grad.addColorStop(0, '#D67D5C'); grad.addColorStop(1, '#A94E31')
  g.fillStyle = grad; g.fillRect(0, 0, W, H); g.fillStyle = '#fff'; g.textAlign = 'center'
  const serif = '"Cormorant Garamond", Georgia, serif'
  g.globalAlpha = .85; g.font = `500 42px ${serif}`; g.fillText('IL NOSTRO ANNO', W / 2, 190); g.globalAlpha = 1
  g.font = `600 260px ${serif}`; g.fillText(String(r.year), W / 2, 450)
  g.font = `italic 500 70px ${serif}`; g.fillText(names, W / 2, 560, W - 140)
  const rows = [[r.days_together ?? '—', 'giorni insieme'], [r.places.length, 'posti visitati'], [r.together_done.length, 'cose fatte insieme'], [r.questions_answered, 'domande del giorno'], [r.tasks_done, 'attività completate']]
  rows.forEach(([n, l], i) => { const y = 740 + i * 118; g.font = `600 84px ${serif}`; g.textAlign = 'right'; g.fillText(String(n), W / 2 - 24, y); g.font = `500 44px ${serif}`; g.textAlign = 'left'; g.globalAlpha = .9; g.fillText(l, W / 2 + 24, y - 6); g.globalAlpha = 1 })
  return new Promise((res) => c.toBlob(res, 'image/png'))
}

export default function Anno() {
  const { couple } = useApp()
  const [year, setYear] = useState(null)
  const { data: r } = useLive(year ? `/year?year=${year}` : '/year', [])
  if (!r) return <div className="skeleton" aria-busy="true"><i /><i /><i /></div>
  const names = couple.members.map((m) => m.name).join(' & ')
  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Il riepilogo di" title={`Il nostro ${r.year}`} />
      {r.years.length > 1 && <div className="flex gap-2 overflow-x-auto" role="tablist">{r.years.map((y) => <button key={y} role="tab" aria-selected={y === r.year} onClick={() => setYear(y)} className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium ${y === r.year ? 'bg-accent text-accent-ink' : 'bg-card text-mute ring-1 ring-line'}`}>{y}</button>)}</div>}
      <div className="relative overflow-hidden rounded-3xl bg-accent p-6 text-accent-ink">
        <div className="pointer-events-none absolute -right-8 -top-10 h-44 w-44 rounded-full border-[14px] border-white/20" />
        <div className="eyebrow !text-accent-ink/80">{names}</div>
        <div className="display mt-3 text-7xl leading-none">{r.days_together ?? '—'}</div>
        <div className="display text-2xl italic">giorni insieme</div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Stat n={r.together_done.length} label="cose fatte insieme" />
        <Stat n={r.places.length} label={r.places.length === 1 ? 'posto visitato' : 'posti visitati'} />
        <Stat n={r.questions_answered} label="domande del giorno" />
        <Stat n={r.tasks_done} label="attività completate" />
        <Stat n={r.events} label="eventi in calendario" />
        <Stat n={r.polls_decided} label="decisioni prese" />
      </div>
      {r.places.length > 0 && <section className="space-y-2"><h2 className="eyebrow px-1">Dove siamo stati</h2><div className="card divide-y divide-line !py-1">{r.places.map((p) => <div key={p.name + p.when} className="flex items-center gap-3 py-3"><MapPin size={18} className="text-accent" strokeWidth={1.6} /><div className="min-w-0"><div className="display text-xl">{p.name}</div><div className="text-sm text-mute">{[p.country, p.notes].filter(Boolean).join(' · ')}</div></div></div>)}</div></section>}
      {r.together_done.length > 0 && <section className="space-y-2"><h2 className="eyebrow px-1">Quello che abbiamo vissuto</h2><div className="card divide-y divide-line !py-1">{r.together_done.map((b) => <div key={b.title + b.date} className="py-3"><div className="font-medium">{b.title}</div>{b.memory && <div className="display italic text-mute">{b.memory}</div>}</div>)}</div></section>}
      <div className="grid grid-cols-2 gap-3">
        <Stat n={r.notes_written + r.capsules} label="note e capsule scritte" />
        <Stat n={r.gifts_received} label="regali ricevuti" />
        {r.expenses_total > 0 && <Stat n={eur(r.expenses_total).replace(',00', '')} label="spese comuni" />}
        {r.saved > 0 && <Stat n={eur(r.saved).replace(',00', '')} label="messi da parte" />}
      </div>
      <button onClick={async () => downloadBlob(await draw(r, names), `noidue-${r.year}.png`)} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-card py-3 font-medium ring-1 ring-line"><Download size={18} strokeWidth={1.6} />Scarica come immagine</button>
    </div>
  )
}
