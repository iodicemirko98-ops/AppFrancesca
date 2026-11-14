import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { ChevronLeft, ImagePlus, ListChecks, Star, Trash2, X } from 'lucide-react'
import { api } from '../api'
import { useApp } from '../state'
import { useLive } from '../hooks'
import { SelectBar, SelectMark, useSelect } from '../select'
import { resizePhoto } from '../util'

function Viewer({ photo, onClose, onChanged }) {
  const { showToast } = useApp()
  const [full, setFull] = useState(null)
  const [cap, setCap] = useState(photo.caption || '')
  useEffect(() => { api.get(`/photos/${photo.id}`).then(setFull).catch(() => {}) }, [photo.id])
  const saveCap = async () => { if (cap.trim() !== (photo.caption || '')) { await api.patch(`/photos/${photo.id}`, { caption: cap }); onChanged() } }
  const fav = async () => { await api.patch(`/photos/${photo.id}`, { fav: !photo.fav }); onChanged(); onClose() }
  const del = async () => {
    await api.del(`/photos/${photo.id}`); onClose(); onChanged()
    showToast('Foto eliminata', { label: 'Annulla', run: async () => { await api.post(`/trash/photos/${photo.id}/restore`); onChanged() } })
  }
  return createPortal(
    <div className="sheet-overlay fixed inset-0 z-30 flex flex-col bg-black/90" onClick={() => { saveCap(); onClose() }}>
      <div className="flex items-center justify-between p-4 text-white" onClick={(e) => e.stopPropagation()}>
        <button aria-label="Chiudi" className="rounded-full bg-white/15 p-2" onClick={() => { saveCap(); onClose() }}><X size={20} /></button>
        <div className="flex gap-2">
          <button aria-label={photo.fav ? 'Togli dal carosello' : 'Metti nel carosello'} aria-pressed={photo.fav} className="rounded-full bg-white/15 p-2" onClick={fav}><Star size={20} className={photo.fav ? 'fill-yellow-300 text-yellow-300' : ''} /></button>
          <button aria-label="Elimina foto" className="rounded-full bg-white/15 p-2" onClick={del}><Trash2 size={20} /></button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center px-2"><img src={full?.data || photo.thumb} alt={photo.caption || ''} className="max-h-full max-w-full rounded-xl object-contain" /></div>
      <div className="p-4" onClick={(e) => e.stopPropagation()}>
        <input aria-label="Didascalia" className="input !bg-white/10 !text-white placeholder:!text-white/50" placeholder="Aggiungi una didascalia…" maxLength={140}
          value={cap} onChange={(e) => setCap(e.target.value)} onBlur={saveCap} />
        <p className="mt-2 text-center text-xs text-white/60">{photo.fav ? 'Compare nel carosello della home' : 'Non è nel carosello: tocca la stella per aggiungerla'}</p>
      </div>
    </div>, document.body)
}

export default function Foto() {
  const { showToast } = useApp()
  const { data, reload } = useLive('/photos', ['photos'])
  const [open, setOpen] = useState(null)
  const [busy, setBusy] = useState(null) // {done, total}
  const file = useRef()
  const sel = useSelect('photos', (data || []).map((p) => p.id), reload)

  const upload = async (e) => {
    const files = [...e.target.files]; e.target.value = ''
    if (!files.length) return
    let ok = 0
    for (let k = 0; k < files.length; k++) {
      setBusy({ done: k, total: files.length })
      try {
        const [d, t] = [await resizePhoto(files[k], 1000, 0.72), await resizePhoto(files[k], 360, 0.7)]
        await api.post('/photos', { data: d, thumb: t, fav: true }); ok++
      } catch (x) { showToast(x.message); break }
    }
    setBusy(null); reload()
    if (ok) showToast(ok === 1 ? 'Foto aggiunta' : `${ok} foto aggiunte`)
  }

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0"><div className="eyebrow">I nostri ricordi</div><h1 className="display text-[2.1rem] leading-tight">Le nostre foto</h1></div>
        <div className="flex gap-2">
          <Link to="/altro" aria-label="Indietro" className="icon-btn-soft"><ChevronLeft size={20} /></Link>
          {data?.length > 0 && <button aria-label="Seleziona" className="icon-btn-soft" onClick={() => (sel.on ? sel.stop() : sel.start())}><ListChecks size={19} strokeWidth={1.6} /></button>}
          <button aria-label="Aggiungi foto" className="icon-btn" disabled={!!busy} onClick={() => file.current.click()}><ImagePlus size={21} /></button>
        </div>
      </header>
      <input ref={file} type="file" accept="image/*" multiple hidden onChange={upload} />
      {busy && <p role="status" className="text-sm text-mute">Carico la foto {busy.done + 1} di {busy.total}…</p>}
      {data === null ? <div className="skeleton" aria-busy="true"><i /><i /></div> : data.length === 0 ? (
        <div className="card text-center text-mute">Ancora nessuna foto.<br />Aggiungete le vostre preferite: compariranno nella home.</div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-1.5">
            {data.map((p) => (
              <button key={p.id} onClick={() => (sel.on ? sel.toggle(p.id) : setOpen(p))} aria-label={p.caption || 'Foto'} className="relative aspect-square overflow-hidden rounded-2xl bg-soft">
                <img src={p.thumb} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                {p.fav && !sel.on && <Star size={16} className="absolute right-1.5 top-1.5 fill-yellow-300 text-yellow-300 drop-shadow" />}
                {sel.on && <span className="absolute left-1.5 top-1.5"><SelectMark checked={sel.ids.has(p.id)} /></span>}
              </button>
            ))}
          </div>
          <p className="text-center text-xs text-mute">{data.length} foto · la ★ indica quelle nel carosello della home</p>
        </>
      )}
      <SelectBar sel={sel} />
      {open && <Viewer photo={open} onClose={() => setOpen(null)} onChanged={reload} />}
    </div>
  )
}
