import { useState } from 'react'
import { Plus, ExternalLink, Gift, Check, Trash2, EyeOff } from 'lucide-react'
import { api } from '../api'
import { useApp } from '../state'
import { useLive } from '../hooks'
import { PageHeader } from '../components/ui'
import Sheet from '../components/Sheet'

const eur = (n) => n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: n % 1 ? 2 : 0 })

function Form({ item, forPartner, onDone }) {
  const { showToast } = useApp()
  const [f, setF] = useState({ title: item?.title || '', url: item?.url || '', price: item?.price ?? '', notes: item?.notes || '' })
  const [err, setErr] = useState('')
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  const body = () => ({ title: f.title.trim(), url: f.url.trim() || null, price: f.price === '' ? null : Number(f.price), notes: f.notes.trim() || null })
  const save = async (e) => {
    e.preventDefault()
    try { item ? await api.patch(`/wishes/${item.id}`, body()) : await api.post('/wishes', { ...body(), for_partner: forPartner }); onDone() } catch (x) { setErr(x.message) }
  }
  const remove = async () => { await api.del(`/wishes/${item.id}`); onDone(); showToast('Eliminato', { label: 'Annulla', run: () => api.post(`/trash/wishes/${item.id}/restore`) }) }
  return (
    <form onSubmit={save} className="space-y-3">
      <div><label className="label" htmlFor="w-titolo">{forPartner ? 'Idea regalo' : 'Cosa desideri?'}</label><input id="w-titolo" className="input" value={f.title} onChange={set('title')} autoFocus required maxLength={140} /></div>
      <div className="grid grid-cols-[1fr_7rem] gap-2">
        <div><label className="label" htmlFor="w-url">Link</label><input id="w-url" className="input" inputMode="url" placeholder="https://…" value={f.url} onChange={set('url')} maxLength={500} /></div>
        <div><label className="label" htmlFor="w-prezzo">Prezzo €</label><input id="w-prezzo" className="input" inputMode="decimal" type="number" min="0" step="0.01" value={f.price} onChange={set('price')} /></div>
      </div>
      <div><label className="label" htmlFor="w-note">Note</label><textarea id="w-note" className="input" rows={2} value={f.notes} onChange={set('notes')} maxLength={600} /></div>
      {forPartner && !item && <p className="flex items-center gap-2 text-sm text-mute"><EyeOff size={14} />Solo tu la vedi: sarà una sorpresa.</p>}
      {err && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{err}</p>}
      <div className="flex gap-2">{item && <button type="button" className="btn-danger" aria-label="Elimina" onClick={remove}><Trash2 size={18} /></button>}<button className="btn flex-1" disabled={!f.title.trim()}>{item ? 'Salva' : 'Aggiungi'}</button></div>
    </form>
  )
}

export default function Desideri() {
  const { couple, user } = useApp()
  const partner = couple.members.find((m) => m.id !== user.id)
  const { data, reload } = useLive('/wishes', ['wishes'])
  const [tab, setTab] = useState('miei')
  const [sheet, setSheet] = useState(null)
  const mine = (data || []).filter((w) => w.mine)
  const theirs = (data || []).filter((w) => !w.mine && !w.secret)
  const radar = (data || []).filter((w) => w.secret)
  const claim = async (w) => { await api.post(`/wishes/${w.id}/claim`); reload() }
  const received = async (w) => { await api.post(`/wishes/${w.id}/received`); reload() }
  const tabs = [['miei', 'I miei'], ...(partner ? [['loro', `Di ${partner.name}`], ['radar', 'Radar']] : [])]
  const list = tab === 'miei' ? mine : tab === 'loro' ? theirs : radar

  const Item = ({ w }) => (
    <div className={`card !rounded-2xl !p-4 ${w.received ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-3">
        <button className="min-w-0 flex-1 text-left" onClick={() => (w.mine || w.secret) && setSheet({ item: w, forPartner: w.secret })}>
          <span className={`block font-medium ${w.received ? 'line-through' : ''}`}>{w.title}</span>
          <span className="flex flex-wrap items-center gap-x-2 text-sm text-mute">{w.price != null && <span>{eur(w.price)}</span>}{w.notes && <span className="truncate">{w.notes}</span>}</span>
        </button>
        {w.url && <a href={w.url} target="_blank" rel="noopener noreferrer" aria-label={`Apri il link di ${w.title}`} className="icon-btn-soft !h-10 !w-10"><ExternalLink size={16} strokeWidth={1.6} /></a>}
      </div>
      {tab === 'loro' && <button onClick={() => claim(w)} aria-pressed={w.claimed} className={`mt-3 flex w-full items-center justify-center gap-2 rounded-2xl py-2.5 text-sm font-medium ${w.claimed ? 'bg-accent text-accent-ink' : 'bg-accent/15 text-accent'}`}><Gift size={16} strokeWidth={1.6} />{w.claimed ? 'Lo regali tu (segreto)' : 'Lo regalo io'}</button>}
      {tab === 'miei' && !w.received && <button onClick={() => received(w)} className="mt-2 text-sm font-medium text-accent">Ricevuto!</button>}
      {tab === 'miei' && w.received && <button onClick={() => received(w)} className="mt-2 flex items-center gap-1 text-sm font-medium text-mute"><Check size={14} />Ricevuto · annulla</button>}
    </div>
  )

  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Radar regali" title="Desideri" action={tab !== 'loro' && <button aria-label={tab === 'radar' ? 'Nuova idea regalo' : 'Nuovo desiderio'} className="icon-btn" onClick={() => setSheet({ forPartner: tab === 'radar' })}><Plus size={22} /></button>} />
      <div className="flex gap-2 overflow-x-auto" role="tablist">
        {tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium ${tab === k ? 'bg-accent text-accent-ink' : 'bg-card text-mute ring-1 ring-line'}`}>{l}</button>)}
      </div>
      {tab === 'loro' && <p className="text-sm text-mute">Tocca «Lo regalo io» per non regalare la stessa cosa: {partner?.name} non vedrà mai chi l'ha prenotato.</p>}
      {tab === 'radar' && <p className="flex items-start gap-2 text-sm text-mute"><EyeOff size={16} className="mt-0.5 shrink-0" />Le tue idee segrete per {partner?.name}: le vedi solo tu.</p>}
      {data === null ? <p className="text-mute">Un attimo…</p> : list.length === 0 ? <div className="card text-center text-mute">{tab === 'miei' ? 'Ancora nessun desiderio. Cosa ti farebbe felice?' : tab === 'loro' ? `${partner?.name} non ha ancora aggiunto nulla.` : 'Nessuna idea segreta. Annota qui ciò che noti!'}</div> : <div className="space-y-2">{list.map((w) => <Item key={w.id} w={w} />)}</div>}
      {sheet && <Sheet title={sheet.item ? 'Modifica' : sheet.forPartner ? 'Nuova idea regalo' : 'Nuovo desiderio'} onClose={() => setSheet(null)}><Form item={sheet.item} forPartner={sheet.forPartner} onDone={() => { setSheet(null); reload() }} /></Sheet>}
    </div>
  )
}
