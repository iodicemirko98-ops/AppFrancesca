export function Avatar({ person, size = 56 }) {
  const style = { width: size, height: size, fontSize: size * 0.42 }
  if (person?.photo) return <img src={person.photo} alt={person.name} style={style} className="rounded-full object-cover ring-2 ring-card" />
  return (
    <div style={style} className="flex items-center justify-center rounded-full bg-accent/15 font-semibold text-accent ring-2 ring-card">
      {(person?.name || '?').trim()[0]?.toUpperCase()}
    </div>
  )
}

export function Toggle({ checked, onChange, disabled, label }) {
  return (
    <button
      type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition ${checked ? 'bg-accent' : 'bg-line'} ${disabled ? 'opacity-40' : ''}`}
    >
      <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  )
}

export function Row({ title, hint, children }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <div className="font-medium">{title}</div>
        {hint && <div className="text-sm text-mute">{hint}</div>}
      </div>
      {children}
    </div>
  )
}

export function Spinner() {
  return <div className="flex min-h-[60vh] items-center justify-center text-mute">Un attimo…</div>
}
