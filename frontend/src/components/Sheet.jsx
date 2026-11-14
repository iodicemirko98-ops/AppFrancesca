import { createPortal } from 'react-dom'

// Pannello che sale dal basso, per moduli e dettagli. Resta fuori dalla pagina (portal) per non risentire di animazioni e trasformazioni.
export default function Sheet({ title, onClose, children }) {
  return createPortal(
    <div className="sheet-overlay fixed inset-0 z-30 flex items-end justify-center bg-black/50" onClick={onClose}>
      <div role="dialog" aria-label={title} className="sheet-panel max-h-[90dvh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-3xl bg-bg p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} aria-label="Chiudi" className="rounded-full bg-soft px-3 py-1 text-mute">✕</button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  )
}
