// Pannello che sale dal basso, per moduli e dettagli.
export default function Sheet({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div role="dialog" aria-label={title} className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-bg p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} aria-label="Chiudi" className="rounded-full bg-soft px-3 py-1 text-mute">✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}
