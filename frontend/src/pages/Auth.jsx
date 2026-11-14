import { useState } from 'react'
import { useApp } from '../state'

export default function Auth() {
  const { login, register } = useApp()
  const [mode, setMode] = useState('login') // login | crea | unisciti
  const [f, setF] = useState({ name: '', email: '', password: '', code: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    setErr(''); setBusy(true)
    try {
      if (mode === 'login') await login(f.email.trim(), f.password)
      else await register({ name: f.name, email: f.email.trim(), password: f.password, invite_code: mode === 'unisciti' ? f.code.trim() : null })
    } catch (e2) {
      setErr(e2.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-10">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-accent text-3xl text-accent-ink">♡</div>
        <h1 className="text-3xl font-bold">NoiDue</h1>
        <p className="mt-1 text-mute">Il vostro spazio privato</p>
      </div>

      <div className="mb-5 grid grid-cols-3 gap-1 rounded-2xl bg-soft p-1 text-sm font-semibold">
        {[['login', 'Accedi'], ['crea', 'Crea spazio'], ['unisciti', 'Ho un codice']].map(([k, l]) => (
          <button key={k} onClick={() => { setMode(k); setErr('') }}
            className={`rounded-xl py-2 transition ${mode === k ? 'bg-card shadow-sm' : 'text-mute'}`}>{l}</button>
        ))}
      </div>

      <form onSubmit={submit} className="card space-y-4">
        {mode === 'unisciti' && (
          <div>
            <label className="label" htmlFor="a-codice">Codice invito del partner</label>
            <input id="a-codice" className="input text-center text-xl font-semibold uppercase tracking-[.4em]" maxLength={6}
              value={f.code} onChange={set('code')} placeholder="······" required autoCapitalize="characters" autoComplete="off" />
          </div>
        )}
        {mode !== 'login' && (
          <div>
            <label className="label" htmlFor="a-nome">Il tuo nome</label>
            <input id="a-nome" className="input" value={f.name} onChange={set('name')} placeholder="Come ti chiama il partner?" required maxLength={40} autoComplete="given-name" />
          </div>
        )}
        <div>
          <label className="label" htmlFor="a-email">Email</label>
          <input id="a-email" className="input" type="email" value={f.email} onChange={set('email')} required autoComplete="email" inputMode="email" />
        </div>
        <div>
          <label className="label" htmlFor="a-pw">Password {mode !== 'login' && <span className="font-normal">(almeno 8 caratteri)</span>}</label>
          <input id="a-pw" className="input" type="password" value={f.password} onChange={set('password')} required minLength={mode === 'login' ? 1 : 8}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
        </div>
        {err && <p role="alert" className="rounded-2xl bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">{err}</p>}
        <button className="btn w-full" disabled={busy}>
          {busy ? 'Un attimo…' : mode === 'login' ? 'Accedi' : mode === 'crea' ? 'Crea il nostro spazio' : 'Collegati al partner'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-mute">
        {mode === 'login' && 'Nuovo qui? Il primo dei due crea lo spazio e riceve un codice da condividere.'}
        {mode === 'crea' && 'Dopo la registrazione riceverai un codice da mandare al partner.'}
        {mode === 'unisciti' && 'Chiedi al partner il codice di 6 caratteri che trovi nella sua Home.'}
      </p>
    </div>
  )
}
