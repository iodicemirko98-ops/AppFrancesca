import { useState } from 'react'
import { Plus, ChevronLeft, ChevronRight, Scale, Home, ShoppingBasket, Plane, Zap, PartyPopper, Gift, CircleEllipsis, Handshake, Trash2 } from 'lucide-react'
import { api } from '../api'
import { useApp } from '../state'
import { useLive, iso } from '../hooks'
import { PageHeader } from '../components/ui'
import Sheet from '../components/Sheet'
import { eur, fmtShort } from '../util'

const CATS = { casa: ['Casa', Home, '#C2603F'], spesa: ['Spesa', ShoppingBasket, '#6E9B6B'], viaggi: ['Viaggi', Plane, '#4F8FA8'], bollette: ['Bollette', Zap, '#D49A3A'], uscite: ['Uscite', PartyPopper, '#C4577A'], regali: ['Regali', Gift, '#8B6BB1'], altro: ['Altro', CircleEllipsis, '#7A6A5E'], saldo: ['Saldo', Handshake, '#7A6A5E'] }
const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']

function Form({ item, onDone }) {
  const { couple, user, showToast } = useApp()
  const partner = couple.members.find((m) => m.id !== user.id)
  const [f, setF] = useState({ title: item?.title || '', amount: item?.amount ?? '', paid_by: item?.paid_by || user.id, category: item?.category || 'spesa', split: item?.split || 'equal', date: item?.date || iso(new Date()) })
  const [err, setErr] = useState('')
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  const save = async (e) => {
    e.preventDefault()
    const body = { ...f, title: f.title.trim(), amount: Number(f.amount) }
    try { item ? await api.patch(`/expenses/${item.id}`, body) : await api.post('/expenses', body); onDone() } catch (x) { setErr(x.message) }
  }
  const remove = async () => { await api.del(`/expenses/${item.id}`); onDone(); showToast('Spesa eliminata', { label: 'Annulla', run: () => api.post(`/trash/expenses/${item.id}/restore`) }) }
  const names = couple.members.map((m) => [m.id, m.id === user.id ? 'Io' : m.name])
  return (
    <form onSubmit={save} className="space-y-3">
      <div><label className="label" htmlFor="s-titolo">Cosa avete pagato?</label><input id="s-titolo" className="input" value={f.title} onChange={set('title')} required maxLength={100} autoFocus /></div>
      <div className="grid grid-cols-2 gap-2">
        <div><label className="label" htmlFor="s-importo">Importo €</label><input id="s-importo" className="input" type="number" inputMode="decimal" min="0.01" step="0.01" value={f.amount} onChange={set('amount')} required /></div>
        <div><label className="label" htmlFor="s-data">Data</label><input id="s-data" className="input" type="date" value={f.date} onChange={set('date')} required /></div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div><label className="label" htmlFor="s-chi">Ha pagato</label><select id="s-chi" className="input" value={f.paid_by} onChange={set('paid_by')}>{names.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div><label className="label" htmlFor="s-cat">Categoria</label><select id="s-cat" className="input" value={f.category} onChange={set('category')}>{Object.entries(CATS).filter(([k]) => k !== 'saldo').map(([k, [v]]) => <option key={k} value={k}>{v}</option>)}</select></div>
      </div>
      {item?.settlement ? null : <div><label className="label" htmlFor="s-div">Come si divide</label><select id="s-div" className="input" value={f.split} onChange={set('split')}><option value="equal">A metà</option><option value="other">{partner ? `Tutto a carico di ${f.paid_by === user.id ? partner.name : 'me'}` : 'Tutto all\'altro'}</option><option value="self">Spesa personale (non si divide)</option></select></div>}
      {err && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{err}</p>}
      <div className="flex gap-2">{item && <button type="button" className="btn-danger" aria-label="Elimina" onClick={remove}><Trash2 size={18} /></button>}<button className="btn flex-1" disabled={!f.title.trim() || !f.amount}>{item ? 'Salva' : 'Aggiungi'}</button></div>
    </form>
  )
}

export default function Spese() {
  const { couple, user, showToast } = useApp()
  const [cur, setCur] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const month = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`
  const { data, reload } = useLive(`/expenses?month=${month}`, ['expenses'])
  const [sheet, setSheet] = useState(null)
  const nm = (id) => (id === user.id ? 'Tu' : couple.members.find((m) => m.id === id)?.name)
  const move = (n) => setCur(new Date(cur.getFullYear(), cur.getMonth() + n, 1))
  const settle = async () => { try { await api.post('/expenses/settle'); reload(); showToast('Saldo registrato: siete pari!') } catch (e) { showToast(e.message) } }
  const b = data?.month_balance, ob = data?.balance
  const sentence = (bal) => bal?.from ? <><span className="font-medium">{nm(bal.from)}</span> {bal.from === user.id ? 'devi' : 'deve'} a <span className="font-medium">{nm(bal.to)}</span></> : 'Siete pari'
  const groups = []
  for (const e of data?.items || []) { const g = groups[groups.length - 1]; if (g && g.date === e.date) g.items.push(e); else groups.push({ date: e.date, items: [e] }) }
  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Da dividere" title="Spese comuni" action={<button aria-label="Nuova spesa" className="icon-btn" onClick={() => setSheet({})}><Plus size={22} /></button>} />
      <div className="flex items-center justify-between">
        <button aria-label="Mese precedente" className="icon-btn-soft" onClick={() => move(-1)}><ChevronLeft size={20} /></button>
        <h2 className="display text-2xl capitalize">{MONTHS[cur.getMonth()]} {cur.getFullYear()}</h2>
        <button aria-label="Mese successivo" className="icon-btn-soft" onClick={() => move(1)}><ChevronRight size={20} /></button>
      </div>
      {data && (
        <>
          <div className="relative overflow-hidden rounded-3xl bg-accent p-6 text-accent-ink">
            <div className="pointer-events-none absolute -bottom-10 right-4 h-32 w-32 rounded-full border-[12px] border-white/15" />
            <div className="eyebrow flex items-center gap-2 !text-accent-ink/80"><Scale size={14} />Saldo del mese</div>
            <div className="display mt-2 text-2xl">{sentence(b)}</div>
            <div className="display text-6xl leading-tight">{eur(b.amount)}</div>
            <div className="mt-2 text-sm opacity-90">Totale {eur(data.total)}{couple.members.map((m) => ` · ${m.id === user.id ? 'Tu' : m.name} ${eur(data.paid_by[m.id] || 0)}`).join('')}</div>
          </div>
          {ob?.from && <div className="card flex items-center justify-between gap-3 !p-4"><span className="text-sm">Saldo complessivo: {sentence(ob)} <span className="font-semibold">{eur(ob.amount)}</span></span><button className="btn !px-4 !py-2" onClick={settle}>Salda</button></div>}
          {data.by_category.length > 0 && (
            <div className="card space-y-3">
              <div className="eyebrow">Per categoria</div>
              <div className="flex h-3 overflow-hidden rounded-full">{data.by_category.map((c) => <span key={c.category} style={{ width: c.pct + '%', background: CATS[c.category][2] }} />)}</div>
              {data.by_category.map((c) => { const [l, I, col] = CATS[c.category]; return (
                <div key={c.category} className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-full" style={{ background: col + '26', color: col }}><I size={17} strokeWidth={1.6} /></span><span className="flex-1">{l}</span><span className="text-sm text-mute">{c.pct}%</span><span className="w-24 text-right font-medium">{eur(c.amount)}</span></div>) })}
            </div>
          )}
          {groups.length === 0 && <div className="card text-center text-mute">Nessuna spesa questo mese.</div>}
          {groups.map((g) => (
            <section key={g.date} className="space-y-2"><h3 className="eyebrow px-1">{new Date(g.date + 'T12:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
              {g.items.map((e) => { const [, I, col] = CATS[e.category]; return (
                <button key={e.id} onClick={() => setSheet({ item: e })} className="card flex w-full items-center gap-3 !rounded-2xl !p-4 text-left">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ background: col + '26', color: col }}><I size={18} strokeWidth={1.6} /></span>
                  <span className="min-w-0 flex-1"><span className="block truncate font-medium">{e.title}</span><span className="text-xs text-mute">{e.settlement ? `${nm(e.paid_by)} ha saldato` : `Ha pagato ${nm(e.paid_by).toLowerCase() === 'tu' ? 'tu' : nm(e.paid_by)}${e.split === 'self' ? ' · personale' : e.split === 'other' ? ' · tutto all\'altro' : ''}`}</span></span>
                  <span className="font-semibold">{eur(e.amount)}</span>
                </button>) })}
            </section>))}
        </>
      )}
      {sheet && <Sheet title={sheet.item ? 'Modifica spesa' : 'Nuova spesa'} onClose={() => setSheet(null)}><Form item={sheet.item} onDone={() => { setSheet(null); reload() }} /></Sheet>}
    </div>
  )
}
