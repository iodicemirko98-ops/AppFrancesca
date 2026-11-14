import { useState } from 'react'
import { Check } from 'lucide-react'
import { api } from './api'
import { useApp } from './state'

// Selezione multipla per eliminare più elementi insieme (con "Annulla" per riaverli).
export function useSelect(coll, allIds, onDone) {
  const { showToast } = useApp()
  const [on, setOn] = useState(false)
  const [ids, setIds] = useState(() => new Set())
  const toggle = (id) => setIds((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const stop = () => { setOn(false); setIds(new Set()) }
  const all = () => setIds((s) => (s.size >= allIds.length ? new Set() : new Set(allIds)))
  const remove = async () => {
    const list = [...ids]
    if (!list.length) return
    try {
      const r = await api.post(`/bulk/${coll}/delete`, { ids: list })
      const n = r.deleted.length
      stop(); onDone?.()
      showToast(`${n} ${n === 1 ? 'elemento eliminato' : 'elementi eliminati'}`, {
        label: 'Annulla', run: async () => { await api.post(`/bulk/${coll}/restore`, { ids: r.deleted }); onDone?.() },
      })
    } catch (e) { showToast(e.message) }
  }
  return { on, ids, total: allIds.length, start: () => setOn(true), stop, toggle, all, remove }
}

export function SelectMark({ checked }) {
  return (
    <span aria-hidden className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ring-2 transition ${checked ? 'bg-accent text-accent-ink ring-accent' : 'ring-line'}`}>
      {checked ? <Check size={14} strokeWidth={3} /> : null}
    </span>
  )
}

export function SelectBar({ sel }) {
  if (!sel.on) return null
  const n = sel.ids.size
  return (
    <div role="toolbar" aria-label="Selezione" className="toast-in fixed inset-x-0 bottom-24 z-40 mx-auto flex w-[calc(100%-2rem)] max-w-sm items-center gap-2 rounded-2xl bg-ink px-3 py-2.5 text-bg shadow-lg" style={{ marginBottom: 'env(safe-area-inset-bottom)' }}>
      <button className="px-2 py-1.5 text-sm font-semibold" onClick={sel.stop}>Annulla</button>
      <button className="px-2 py-1.5 text-sm font-semibold" onClick={sel.all}>{n >= sel.total ? 'Nessuno' : 'Tutti'}</button>
      <span className="flex-1 text-center text-sm opacity-70">{n === 0 ? 'Tocca per scegliere' : `${n} selezionat${n === 1 ? 'o' : 'i'}`}</span>
      <button disabled={n === 0} onClick={sel.remove} className="rounded-xl bg-red-600 px-3 py-1.5 text-sm font-bold text-white disabled:opacity-40">Elimina</button>
    </div>
  )
}
