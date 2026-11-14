import { useEffect, useState } from 'react'
import { Lock, LockOpen, Plus, Eye, EyeOff, Copy, Trash2, KeyRound } from 'lucide-react'
import { api, setVaultToken, hasVaultToken } from '../api'
import { useApp } from '../state'
import { PageHeader } from '../components/ui'
import Sheet from '../components/Sheet'

const KINDS = { codice: 'Codice', documento: 'Documento', accesso: 'Accesso', altro: 'Altro' }

function Pin({ hasPin, onOpen }) {
  const [pin, setPin] = useState('')
  const [pin2, setPin2] = useState('')
  const [err, setErr] = useState('')
  const go = async (e) => {
    e.preventDefault(); setErr('')
    if (!hasPin && pin !== pin2) return setErr('I due PIN non coincidono')
    try { const r = await api.post(hasPin ? '/vault/unlock' : '/vault/pin', { pin }); setVaultToken(r.token); onOpen() } catch (x) { setErr(x.message); setPin('') }
  }
  return (
    <form onSubmit={go} className="card mx-auto max-w-sm space-y-4 text-center">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent/15 text-accent"><Lock size={26} strokeWidth={1.5} /></span>
      <div><div className="display text-2xl">{hasPin ? 'Inserisci il tuo PIN' : 'Crea il tuo PIN'}</div><p className="mt-1 text-sm text-mute">{hasPin ? 'Il PIN è personale: ognuno di voi ha il suo.' : 'Da 4 a 8 cifre. Ognuno di voi ha il proprio PIN; i contenuti sono condivisi e cifrati.'}</p></div>
      <input aria-label="PIN" className="input text-center text-2xl tracking-[.5em]" type="password" inputMode="numeric" pattern="\d{4,8}" maxLength={8} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} autoFocus autoComplete="off" />
      {!hasPin && <input aria-label="Ripeti il PIN" className="input text-center text-2xl tracking-[.5em]" type="password" inputMode="numeric" maxLength={8} placeholder="ripeti" value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, ''))} autoComplete="off" />}
      {err && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{err}</p>}
      <button className="btn w-full" disabled={pin.length < 4}>{hasPin ? 'Sblocca' : 'Crea PIN'}</button>
    </form>
  )
}

function Form({ item, onDone }) {
  const [f, setF] = useState({ label: item?.label || '', secret: item?.secret || '', kind: item?.kind || 'codice', notes: item?.notes || '' })
  const [err, setErr] = useState('')
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  const save = async (e) => {
    e.preventDefault()
    const body = { label: f.label.trim(), secret: f.secret, kind: f.kind, notes: f.notes.trim() || null }
    try { item ? await api.patch(`/vault/${item.id}`, body) : await api.post('/vault', body); onDone() } catch (x) { setErr(x.message) }
  }
  const remove = async () => { if (confirm('Eliminare per sempre questo elemento?')) { await api.del(`/vault/${item.id}`); onDone() } }
  return (
    <form onSubmit={save} className="space-y-3">
      <div><label className="label" htmlFor="c-nome">Nome</label><input id="c-nome" className="input" value={f.label} onChange={set('label')} placeholder="Es. Codice allarme" required maxLength={80} autoFocus /></div>
      <div><label className="label" htmlFor="c-tipo">Tipo</label><select id="c-tipo" className="input" value={f.kind} onChange={set('kind')}>{Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
      <div><label className="label" htmlFor="c-segreto">Contenuto riservato</label><textarea id="c-segreto" className="input" rows={3} value={f.secret} onChange={set('secret')} required maxLength={2000} /></div>
      <div><label className="label" htmlFor="c-note">Note (non cifrate)</label><input id="c-note" className="input" value={f.notes} onChange={set('notes')} maxLength={300} /></div>
      {err && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{err}</p>}
      <div className="flex gap-2">{item && <button type="button" className="btn-danger" aria-label="Elimina" onClick={remove}><Trash2 size={18} /></button>}<button className="btn flex-1" disabled={!f.label.trim() || !f.secret}>{item ? 'Salva' : 'Aggiungi'}</button></div>
    </form>
  )
}

export default function Cassaforte() {
  const { subscribe, showToast } = useApp()
  const [status, setStatus] = useState(null)
  const [open, setOpen] = useState(hasVaultToken())
  const [items, setItems] = useState(null)
  const [shown, setShown] = useState({})
  const [sheet, setSheet] = useState(null)
  const lock = () => { setVaultToken(null); setOpen(false); setItems(null); setShown({}) }
  const load = async () => { try { setItems(await api.get('/vault')) } catch (e) { if (e.status === 403) lock() } }
  useEffect(() => { api.get('/vault/status').then(setStatus) }, [])
  useEffect(() => { if (open) load() }, [open]) // eslint-disable-line
  useEffect(() => subscribe((m) => open && (m.entity === 'vault' || m.entity === '*') && load()), [subscribe, open]) // eslint-disable-line
  // si richiude da sola: quando l'app va in secondo piano e dopo 10 minuti
  useEffect(() => {
    if (!open) return
    const onVis = () => document.visibilityState === 'hidden' && lock()
    document.addEventListener('visibilitychange', onVis)
    const t = setTimeout(lock, 10 * 60 * 1000)
    return () => { document.removeEventListener('visibilitychange', onVis); clearTimeout(t) }
  }, [open])
  useEffect(() => () => setVaultToken(null), [])
  const copy = async (s) => { try { await navigator.clipboard.writeText(s); showToast('Copiato') } catch { showToast('Impossibile copiare') } }
  if (!status) return <div className="skeleton" aria-busy="true"><i /><i /><i /></div>
  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Solo per voi due" title="Cassaforte" action={open && <><button aria-label="Blocca" className="icon-btn-soft" onClick={lock}><LockOpen size={19} strokeWidth={1.6} /></button><button aria-label="Nuovo elemento" className="icon-btn" onClick={() => setSheet({})}><Plus size={22} /></button></>} />
      {!open ? <Pin hasPin={status.has_pin} onOpen={() => { setStatus({ has_pin: true }); setOpen(true) }} /> : items === null ? <div className="skeleton" aria-busy="true"><i /><i /><i /></div> : items.length === 0 ? <div className="card text-center text-mute">Codici, documenti, accessi: cifrati e protetti dal PIN.<br />Aggiungete il primo elemento.</div> : (
        <div className="space-y-2">{items.map((i) => (
          <div key={i.id} className="card !rounded-2xl !p-4">
            <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent/15 text-accent"><KeyRound size={18} strokeWidth={1.6} /></span>
              <button className="min-w-0 flex-1 text-left" onClick={() => setSheet({ item: i })}><span className="block truncate font-medium">{i.label}</span><span className="text-xs text-mute">{KINDS[i.kind]}{i.notes ? ` · ${i.notes}` : ''}</span></button>
              <button aria-label={shown[i.id] ? 'Nascondi' : 'Mostra'} className="p-2 text-mute" onClick={() => setShown((s) => ({ ...s, [i.id]: !s[i.id] }))}>{shown[i.id] ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>
            {shown[i.id] && <div className="mt-3 flex items-start gap-2 rounded-2xl bg-soft p-3"><span className="min-w-0 flex-1 whitespace-pre-wrap break-words font-mono text-sm">{i.secret ?? i.error}</span><button aria-label="Copia" className="p-1 text-mute" onClick={() => copy(i.secret)}><Copy size={16} /></button></div>}
          </div>))}</div>
      )}
      {sheet && <Sheet title={sheet.item ? 'Modifica' : 'Nuovo elemento'} onClose={() => setSheet(null)}><Form item={sheet.item} onDone={() => { setSheet(null); load() }} /></Sheet>}
    </div>
  )
}
