import { useEffect, useRef, useState } from 'react'
import { disablePush, enablePush, isIOS, isStandalone, pushState } from '../push'
import { useApp } from '../state'
import { api } from '../api'
import { Avatar, PageHeader, Row, Toggle } from '../components/ui'
import { downloadBlob, resizeImage } from '../util'

const MODULES = {
  calendario: 'Calendario', attivita: 'Attività', liste: 'Liste', domanda: 'Domanda del giorno',
  decidere: 'Decidere insieme', fare_insieme: 'Da fare insieme', desideri: 'Desideri e radar regali',
  buono_a_sapersi: 'Buono a sapersi', note: 'Note, capsule e storie', viaggi: 'Viaggi', risparmi: 'Risparmi', spese: 'Spese comuni',
  cassaforte: 'Cassaforte', disegno: 'Disegno condiviso', ciclo: 'Ciclo (privato)', anno: 'Il nostro anno',
}
const NOTIFS = {
  eventi: 'Promemoria eventi', attivita: 'Attività assegnate e completate', solleciti: 'Solleciti',
  domanda: 'Domanda del giorno', risposta_partner: 'Risposta del partner', sondaggi: 'Nuovi sondaggi',
  capsule: 'Capsula sbloccata', regali: 'Radar regali',
}

function Section({ title, children }) {
  return (
    <section className="space-y-1">
      <h2 className="eyebrow px-2">{title}</h2>
      <div className="card divide-y divide-line !py-2">{children}</div>
    </section>
  )
}

export default function Settings() {
  const { user, couple, saveProfile, saveCouple, logout, reload } = useApp()
  const [name, setName] = useState(user.name)
  const [code, setCode] = useState('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [del, setDel] = useState(false)
  const [pw, setPw] = useState('')
  const file = useRef()

  const run = (fn, ok) => async (...a) => {
    setErr(''); setMsg('')
    try { await fn(...a); if (ok) setMsg(ok) } catch (e) { setErr(e.message) }
  }
  const [push, setPush] = useState('...')
  useEffect(() => { pushState().then(setPush).catch(() => setPush('unsupported')) }, [])
  const togglePush = run(async (v) => { if (v) await enablePush(); else await disablePush(); setPush(await pushState()) })
  const me = couple.members.find((m) => m.id === user.id)
  const notif = user.notifications

  const onPhoto = run(async (e) => {
    const f = e.target.files[0]
    if (f) await saveProfile({ photo: await resizeImage(f) })
  }, 'Foto aggiornata')

  const join = run(async () => { await api.post('/couple/join', { invite_code: code }); await reload(); setCode('') }, 'Collegati! Ora siete in due.')
  const exportData = run(async () => {
    const data = await api.get('/export')
    downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), 'noidue-dati.json')
  })
  const remove = run(async () => { await api.del('/me', { password: pw }); logout() })

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Per voi" title="Impostazioni" />
      {(msg || err) && (
        <p role="status" className={`rounded-2xl px-4 py-3 text-sm ${err ? 'bg-red-500/10 text-red-600 dark:text-red-400' : 'bg-accent/10 text-accent'}`}>{err || msg}</p>
      )}

      <Section title="Profilo">
        <div className="flex items-center gap-4 py-3">
          <button onClick={() => file.current.click()} aria-label="Cambia foto"><Avatar person={me} size={64} /></button>
          <input ref={file} type="file" accept="image/*" hidden onChange={onPhoto} />
          <div className="flex-1">
            <label className="label" htmlFor="nome">Nome</label>
            <div className="flex gap-2">
              <input id="nome" className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
              <button className="btn-soft" disabled={!name.trim() || name === user.name} onClick={run(() => saveProfile({ name }), 'Nome salvato')}>Salva</button>
            </div>
          </div>
        </div>
        {user.photo && (
          <Row title="Foto profilo"><button className="text-sm font-semibold text-accent" onClick={run(() => saveProfile({ photo: '' }), 'Foto rimossa')}>Rimuovi</button></Row>
        )}
        <div className="py-3">
          <label className="label" htmlFor="inizio">Data di inizio della relazione</label>
          <input id="inizio" type="date" className="input" value={couple.start_date || ''} max={new Date().toISOString().slice(0, 10)}
            onChange={run((e) => e.target.value && saveCouple({ start_date: e.target.value }), 'Data salvata')} />
        </div>
      </Section>

      <Section title="Tema">
        <div className="grid grid-cols-3 gap-1 py-2">
          {[['chiaro', 'Chiaro'], ['scuro', 'Scuro'], ['auto', 'Automatico']].map(([k, l]) => (
            <button key={k} onClick={run(() => saveProfile({ theme: k }))}
              className={`rounded-2xl py-2.5 text-sm font-semibold ${user.theme === k ? 'bg-accent text-accent-ink' : 'bg-soft'}`}>{l}</button>
          ))}
        </div>
      </Section>

      <Section title="Notifiche">
        <Row title="Notifiche attive" hint="Interruttore generale">
          <Toggle label="Notifiche attive" checked={notif.master} onChange={run((v) => saveProfile({ notifications: { master: v } }))} />
        </Row>
        <Row title="Su questo dispositivo" hint={push === 'unsupported' ? (isIOS() && !isStandalone() ? 'Su iPhone: Condividi → «Aggiungi a Home», poi riapri l\'app da lì' : 'Non supportato da questo browser') : push === 'denied' ? 'Bloccate: abilitale dalle impostazioni del browser' : 'Ricevi promemoria anche ad app chiusa'}>
          <Toggle label="Notifiche su questo dispositivo" checked={push === 'on'} disabled={push === 'unsupported' || push === 'denied' || push === '...'} onChange={togglePush} />
        </Row>
        {Object.entries(NOTIFS).map(([k, l]) => (
          <Row key={k} title={l}>
            <Toggle label={l} disabled={!notif.master} checked={notif.types[k]}
              onChange={run((v) => saveProfile({ notifications: { types: { [k]: v } } }))} />
          </Row>
        ))}
      </Section>

      <Section title="Sezioni dell'app">
        {Object.entries(MODULES).map(([k, l]) => (
          <Row key={k} title={l}>
            <Toggle label={l} checked={!!couple.modules[k]} onChange={run((v) => saveCouple({ modules: { [k]: v } }))} />
          </Row>
        ))}
      </Section>

      <Section title="Il nostro spazio">
        {couple.paired ? (
          <Row title="Collegati" hint={couple.members.map((m) => m.name).join(' e ')} />
        ) : (
          <>
            <Row title="Il tuo codice invito" hint="Mandalo al partner"><span className="text-xl font-extrabold tracking-[.25em] text-accent">{couple.invite_code}</span></Row>
            <div className="py-3">
              <label className="label" htmlFor="codice">Il partner ha già uno spazio? Inserisci il suo codice</label>
              <div className="flex gap-2">
                <input id="codice" className="input text-center font-semibold uppercase tracking-[.3em]" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} placeholder="······" autoCapitalize="characters" />
                <button className="btn" disabled={code.trim().length < 6} onClick={join}>Collegati</button>
              </div>
            </div>
          </>
        )}
      </Section>

      <Section title="Dati e account">
        <Row title="Esporta i dati" hint="Tutto in un file JSON"><button className="btn-soft !px-4 !py-2" onClick={exportData}>Esporta</button></Row>
        <Row title="Esci"><button className="btn-soft !px-4 !py-2" onClick={logout}>Esci</button></Row>
        <div className="py-3">
          {!del ? (
            <button className="text-sm font-semibold text-red-600 dark:text-red-400" onClick={() => setDel(true)}>Elimina il mio account…</button>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-mute">Il tuo account verrà cancellato per sempre. Se sei l'ultimo dello spazio, sparisce anche tutto il contenuto. Conferma con la password.</p>
              <input className="input" type="password" placeholder="Password" value={pw} onChange={(e) => setPw(e.target.value)} />
              <div className="flex gap-2">
                <button className="btn-soft flex-1" onClick={() => { setDel(false); setPw('') }}>Annulla</button>
                <button className="btn-danger flex-1" disabled={!pw} onClick={remove}>Elimina</button>
              </div>
            </div>
          )}
        </div>
      </Section>
      <p className="pb-4 text-center text-xs text-mute">NoiDue · nessuna pubblicità, nessun tracciamento</p>
    </div>
  )
}
