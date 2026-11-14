import { useState } from 'react'
import { Plus, Search, Trash2 } from 'lucide-react'
import { api } from '../api'
import { useApp } from '../state'
import { useLive } from '../hooks'
import { PageHeader } from '../components/ui'
import Sheet from '../components/Sheet'

const CATS = { taglie: 'Taglie', gusti: 'Gusti', famiglia: 'Famiglia', salute: 'Salute', indirizzi: 'Indirizzi', altro: 'Altro' }

function Form({ item, subjects, onDone }) {
  const { showToast } = useApp()
  const [f, setF] = useState({ subject: item?.subject || subjects[0][0], category: item?.category || 'taglie', label: item?.label || '', value: item?.value || '' })
  const [err, setErr] = useState('')
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  const save = async (e) => {
    e.preventDefault()
    const body = { ...f, label: f.label.trim(), value: f.value.trim() }
    try { item ? await api.patch(`/facts/${item.id}`, { category: body.category, label: body.label, value: body.value }) : await api.post('/facts', body); onDone() } catch (x) { setErr(x.message) }
  }
  const remove = async () => { await api.del(`/facts/${item.id}`); onDone(); showToast('Eliminato', { label: 'Annulla', run: () => api.post(`/trash/facts/${item.id}/restore`) }) }
  return (
    <form onSubmit={save} className="space-y-3">
      {!item && <div><label className="label" htmlFor="f-chi">Riguarda</label><select id="f-chi" className="input" value={f.subject} onChange={set('subject')}>{subjects.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>}
      <div><label className="label" htmlFor="f-cat">Categoria</label><select id="f-cat" className="input" value={f.category} onChange={set('category')}>{Object.entries(CATS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
      <div><label className="label" htmlFor="f-voce">Voce</label><input id="f-voce" className="input" placeholder="Es. Taglia scarpe" value={f.label} onChange={set('label')} required maxLength={60} autoFocus /></div>
      <div><label className="label" htmlFor="f-valore">Valore</label><input id="f-valore" className="input" placeholder="Es. 38" value={f.value} onChange={set('value')} required maxLength={300} /></div>
      {err && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{err}</p>}
      <div className="flex gap-2">{item && <button type="button" className="btn-danger" aria-label="Elimina" onClick={remove}><Trash2 size={18} /></button>}<button className="btn flex-1" disabled={!f.label.trim() || !f.value.trim()}>{item ? 'Salva' : 'Aggiungi'}</button></div>
    </form>
  )
}

export default function BuonoASapersi() {
  const { couple, user } = useApp()
  const { data, reload } = useLive('/facts', ['facts'])
  const [q, setQ] = useState('')
  const [sheet, setSheet] = useState(null)
  const partner = couple.members.find((m) => m.id !== user.id)
  const subjects = [[user.id, 'Me'], ...(partner ? [[partner.id, partner.name]] : []), ['both', 'Entrambi']]
  const who = (id) => (id === 'both' ? 'Entrambi' : id === user.id ? 'Io' : partner?.name || '')
  const items = (data || []).filter((f) => !q || `${f.label} ${f.value} ${CATS[f.category]} ${who(f.subject)}`.toLowerCase().includes(q.toLowerCase()))
  const groups = Object.keys(CATS).map((k) => [k, items.filter((f) => f.category === k)]).filter(([, l]) => l.length)
  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Le piccole cose" title="Buono a sapersi" action={<button aria-label="Nuova informazione" className="icon-btn" onClick={() => setSheet({})}><Plus size={22} /></button>} />
      <div className="relative"><Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-mute" /><input aria-label="Cerca" className="input !pl-11" placeholder="Cerca: scarpe, allergie, Wi-Fi…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {data === null ? <div className="skeleton" aria-busy="true"><i /><i /><i /></div> : groups.length === 0 ? <div className="card text-center text-mute">{q ? 'Nessun risultato.' : 'Taglie, gusti, codici, cose da ricordare: scrivetele qui, serviranno al momento giusto.'}</div> : groups.map(([k, list]) => (
        <section key={k} className="space-y-2">
          <h2 className="eyebrow px-1">{CATS[k]}</h2>
          <div className="card divide-y divide-line !py-1">
            {list.map((f) => (
              <button key={f.id} onClick={() => setSheet({ item: f })} className="flex w-full items-center justify-between gap-3 py-3 text-left">
                <span className="min-w-0"><span className="block font-medium">{f.label}</span><span className="text-xs text-mute">{who(f.subject)}</span></span>
                <span className="display max-w-[55%] break-words text-right text-xl">{f.value}</span>
              </button>))}
          </div>
        </section>))}
      {sheet && <Sheet title={sheet.item ? 'Modifica' : 'Nuova informazione'} onClose={() => setSheet(null)}><Form item={sheet.item} subjects={subjects} onDone={() => { setSheet(null); reload() }} /></Sheet>}
    </div>
  )
}
