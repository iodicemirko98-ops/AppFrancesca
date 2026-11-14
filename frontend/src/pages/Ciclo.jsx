import { useState } from 'react'
import { Lock, Droplets, Trash2, Share2 } from 'lucide-react'
import { api } from '../api'
import { useApp } from '../state'
import { useLive, iso } from '../hooks'
import { PageHeader, Row, Toggle } from '../components/ui'
import { fmtDate, fmtShort } from '../util'

export default function Ciclo() {
  const { couple, user, showToast } = useApp()
  const { data, setData } = useLive('/cycle', [])
  const { data: shared } = useLive('/cycle/partner', [])
  const [start, setStart] = useState(iso(new Date()))
  const partner = couple.members.find((m) => m.id !== user.id)
  if (!data) return <div className="skeleton" aria-busy="true"><i /><i /><i /></div>
  const p = data.prediction
  const run = (fn) => async (...a) => { try { setData(await fn(...a)) } catch (e) { showToast(e.message) } }
  const add = run(() => api.post('/cycle/periods', { start }))
  const setEnd = run((id, s) => api.patch(`/cycle/periods/${id}`, { start: s, end: iso(new Date()) }))
  const del = run((id) => api.del(`/cycle/periods/${id}`))
  const settings = run((b) => api.put('/cycle/settings', b))
  const open = data.periods.find((x) => !x.end && x.start >= iso(new Date(Date.now() - 12 * 864e5)))
  const when = (n) => (n == null ? '' : n === 0 ? 'oggi' : n === 1 ? 'domani' : n > 0 ? `tra ${n} giorni` : `${-n} giorni fa`)
  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Solo per te" title="Ciclo" />
      <p className="flex items-start gap-2 text-sm text-mute"><Lock size={14} className="mt-0.5 shrink-0" />Questi dati sono personali: {partner ? `${partner.name} non li vede, a meno che tu non scelga di condividere un piccolo riassunto.` : 'nessuno oltre a te li vede.'}</p>
      {shared && <div className="card flex items-center gap-3 !p-4"><Droplets size={20} className="text-accent" strokeWidth={1.6} /><span>{partner?.name} condivide con te: giorno {shared.day} del ciclo, prossimo ciclo {when(shared.days_to_next)}.</span></div>}
      <div className="card text-center">
        {p.day ? (<>
          <div className="eyebrow">Oggi</div><div className="display mt-1 text-6xl text-accent">giorno {p.day}</div>
          <div className="mt-2 text-mute">Prossimo ciclo previsto {when(p.days_to_next)} · {fmtDate(p.next_start)}</div>
          <div className="mt-1 text-sm text-mute">Finestra fertile stimata: {fmtShort(p.fertile_from)} – {fmtShort(p.fertile_to)}</div>
          <p className="mt-3 text-xs text-mute">{p.estimated ? `Stima basata su un ciclo di ${p.cycle_length} giorni: si affina con i prossimi dati.` : `Calcolata sulla tua durata media (${p.cycle_length} giorni).`} Sono solo stime: non sono un metodo contraccettivo né un parere medico.</p>
        </>) : <p className="text-mute">Registra il primo giorno del ciclo per vedere le previsioni.</p>}
      </div>
      <div className="card space-y-3">
        <label className="label" htmlFor="c-inizio">Il ciclo è iniziato il</label>
        <div className="flex gap-2"><input id="c-inizio" type="date" className="input" max={iso(new Date())} value={start} onChange={(e) => setStart(e.target.value)} /><button className="btn" onClick={add}>Registra</button></div>
        {open && <button className="btn-soft w-full" onClick={() => setEnd(open.id, open.start)}>È finito oggi</button>}
      </div>
      {data.periods.length > 0 && <div className="card divide-y divide-line !py-1">{data.periods.slice(0, 12).map((x) => (
        <div key={x.id} className="flex items-center justify-between py-3"><span>{fmtDate(x.start)}{x.end ? ` → ${fmtShort(x.end)}` : ''}</span><button aria-label="Elimina" className="p-1 text-mute" onClick={() => del(x.id)}><Trash2 size={16} /></button></div>))}</div>}
      <div className="card divide-y divide-line !py-2">
        <Row title="Condividi un riassunto" hint={partner ? `${partner.name} vedrà solo giorno del ciclo e prossima data` : 'Disponibile quando il partner si collega'}><Toggle label="Condividi un riassunto" disabled={!partner} checked={data.settings.share} onChange={(v) => settings({ share: v })} /></Row>
        <Row title="Durata del ciclo" hint="Usata finché non ci sono abbastanza dati"><select aria-label="Durata del ciclo" className="input !w-24" value={data.settings.cycle_length} onChange={(e) => settings({ cycle_length: Number(e.target.value) })}>{Array.from({ length: 26 }, (_, i) => 20 + i).map((n) => <option key={n} value={n}>{n} gg</option>)}</select></Row>
      </div>
    </div>
  )
}
