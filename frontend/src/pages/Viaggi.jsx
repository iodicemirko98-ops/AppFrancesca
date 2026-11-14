import { useEffect, useRef, useState } from 'react'
import { Plus, MapPin, Globe2, Search, LocateFixed, Trash2 } from 'lucide-react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { api } from '../api'
import { useApp } from '../state'
import { useLive } from '../hooks'
import { PageHeader } from '../components/ui'
import Sheet from '../components/Sheet'

const pin = L.divIcon({ className: '', iconSize: [30, 30], iconAnchor: [15, 28],
  html: '<div style="width:30px;height:30px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#C2603F;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)"></div>' })
const fmtWhen = (w) => (!w ? '' : w.length === 7 ? new Date(w + '-01T12:00').toLocaleDateString('it-IT', { month: 'long', year: 'numeric' }) : new Date(w + 'T12:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }))

function TripMap({ items, onPick }) {
  const el = useRef(), map = useRef(), layer = useRef()
  useEffect(() => {
    map.current = L.map(el.current, { zoomControl: true, attributionControl: true }).setView([42.5, 12.5], 4)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap' }).addTo(map.current)
    layer.current = L.layerGroup().addTo(map.current)
    return () => map.current.remove()
  }, [])
  useEffect(() => {
    layer.current.clearLayers()
    items.forEach((t) => L.marker([t.lat, t.lon], { icon: pin, title: t.name }).on('click', () => onPick(t)).addTo(layer.current))
    if (items.length) map.current.fitBounds(L.latLngBounds(items.map((t) => [t.lat, t.lon])), { padding: [30, 30], maxZoom: 7 })
  }, [items]) // eslint-disable-line
  return <div ref={el} className="h-64 overflow-hidden rounded-3xl ring-1 ring-line" data-testid="mappa" />
}

function Search_({ onPlace }) {
  const [q, setQ] = useState('')
  const [res, setRes] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const find = async (e) => {
    e?.preventDefault(); if (q.trim().length < 2) return
    setBusy(true); setErr('')
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&accept-language=it&q=${encodeURIComponent(q.trim())}`)
      if (!r.ok) throw new Error()
      setRes(await r.json())
    } catch { setErr('Ricerca non disponibile ora. Riprova tra poco.') } finally { setBusy(false) }
  }
  const pick = (r) => onPlace({ name: r.name || r.display_name.split(',')[0], country: r.address?.country || '', lat: Number(r.lat), lon: Number(r.lon), full: r.display_name })
  const here = () => navigator.geolocation?.getCurrentPosition((p) => onPlace({ name: 'La mia posizione', country: '', lat: p.coords.latitude, lon: p.coords.longitude, full: '' }), () => setErr('Posizione non disponibile'))
  return (
    <div className="space-y-3">
      <form onSubmit={find} className="flex gap-2"><input aria-label="Cerca un luogo" className="input" placeholder="Es. Verona" value={q} onChange={(e) => setQ(e.target.value)} autoFocus /><button className="icon-btn" disabled={busy} aria-label="Cerca"><Search size={20} /></button></form>
      <button className="flex items-center gap-2 text-sm font-medium text-accent" onClick={here}><LocateFixed size={16} />Usa la mia posizione</button>
      {err && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{err}</p>}
      {res && res.length === 0 && <p className="text-mute">Nessun risultato.</p>}
      {res?.map((r) => <button key={r.place_id} onClick={() => pick(r)} className="block w-full rounded-2xl bg-card p-3 text-left ring-1 ring-line"><span className="block font-medium">{r.name || r.display_name.split(',')[0]}</span><span className="block truncate text-sm text-mute">{r.display_name}</span></button>)}
    </div>
  )
}

function Details({ place, trip, onDone }) {
  const { showToast } = useApp()
  const [f, setF] = useState({ name: trip?.name || place?.name || '', country: trip?.country || place?.country || '', when: trip?.when || '', notes: trip?.notes || '' })
  const [err, setErr] = useState('')
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  const save = async (e) => {
    e.preventDefault()
    const body = { name: f.name.trim(), country: f.country.trim() || null, when: f.when || null, notes: f.notes.trim() || null }
    try { trip ? await api.patch(`/trips/${trip.id}`, body) : await api.post('/trips', { ...body, lat: place.lat, lon: place.lon }); onDone() } catch (x) { setErr(x.message) }
  }
  const remove = async () => { await api.del(`/trips/${trip.id}`); onDone(); showToast('Luogo eliminato', { label: 'Annulla', run: () => api.post(`/trash/trips/${trip.id}/restore`) }) }
  return (
    <form onSubmit={save} className="space-y-3">
      <div><label className="label" htmlFor="v-nome">Luogo</label><input id="v-nome" className="input" value={f.name} onChange={set('name')} required maxLength={120} /></div>
      <div className="grid grid-cols-2 gap-2">
        <div><label className="label" htmlFor="v-paese">Paese</label><input id="v-paese" className="input" value={f.country} onChange={set('country')} maxLength={60} /></div>
        <div><label className="label" htmlFor="v-quando">Quando</label><input id="v-quando" type="month" className="input" value={(f.when || '').slice(0, 7)} onChange={set('when')} /></div>
      </div>
      <div><label className="label" htmlFor="v-note">Il ricordo</label><textarea id="v-note" className="input" rows={3} value={f.notes} onChange={set('notes')} maxLength={1000} placeholder="Gita improvvisata, gelato sul lago…" /></div>
      {err && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{err}</p>}
      <div className="flex gap-2">{trip && <button type="button" className="btn-danger" aria-label="Elimina" onClick={remove}><Trash2 size={18} /></button>}<button className="btn flex-1" disabled={!f.name.trim()}>{trip ? 'Salva' : 'Aggiungi al diario'}</button></div>
    </form>
  )
}

export default function Viaggi() {
  const { data, reload } = useLive('/trips', ['trips'])
  const [sheet, setSheet] = useState(null) // {step:'search'} | {place} | {trip}
  const items = data?.items || []
  return (
    <div className="space-y-4">
      <PageHeader eyebrow="I nostri posti" title="Viaggi" action={<button aria-label="Aggiungi un luogo" className="icon-btn" onClick={() => setSheet({ step: 'search' })}><Plus size={22} /></button>} />
      {data && <div className="flex gap-2"><span className="chip"><MapPin size={14} />{data.places} {data.places === 1 ? 'posto' : 'posti'}</span><span className="chip-line"><Globe2 size={14} />{data.countries} {data.countries === 1 ? 'paese' : 'paesi'}</span></div>}
      <TripMap items={items} onPick={(t) => setSheet({ trip: t })} />
      <h2 className="eyebrow px-1 pt-1">Diario dei viaggi</h2>
      {data === null ? <div className="skeleton" aria-busy="true"><i /><i /><i /></div> : items.length === 0 ? <div className="card text-center text-mute">Dove siete stati? Aggiungete il primo posto.</div> : <div className="space-y-2">{items.map((t) => (
        <button key={t.id} onClick={() => setSheet({ trip: t })} className="card flex w-full items-center gap-4 !rounded-2xl !p-4 text-left">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent/15 text-accent"><MapPin size={20} strokeWidth={1.6} /></span>
          <span className="min-w-0 flex-1"><span className="display block truncate text-xl">{t.name}</span><span className="block text-sm text-mute">{[fmtWhen(t.when), t.country].filter(Boolean).join(' · ')}</span>{t.notes && <span className="display block truncate italic text-mute">{t.notes}</span>}</span>
        </button>))}</div>}
      {sheet?.step === 'search' && <Sheet title="Dove siete stati?" onClose={() => setSheet(null)}><Search_ onPlace={(place) => setSheet({ place })} /></Sheet>}
      {sheet?.place && <Sheet title="Aggiungi al diario" onClose={() => setSheet(null)}><Details place={sheet.place} onDone={() => { setSheet(null); reload() }} /></Sheet>}
      {sheet?.trip && <Sheet title="Modifica luogo" onClose={() => setSheet(null)}><Details trip={sheet.trip} onDone={() => { setSheet(null); reload() }} /></Sheet>}
    </div>
  )
}
