import { useCallback, useEffect, useRef, useState } from 'react'
import { Plus, ChevronLeft, Undo2, Eraser, Trash2, Download, Pencil } from 'lucide-react'
import { api } from '../api'
import { useApp } from '../state'
import { useLive } from '../hooks'
import { PageHeader } from '../components/ui'
import { downloadBlob } from '../util'

const COLORS = ['#2B211C', '#C2603F', '#D49A3A', '#6E9B6B', '#4F8FA8', '#8B6BB1', '#C4577A']
const SIZES = [0.006, 0.014, 0.03]

function paint(ctx, strokes, W) {
  ctx.clearRect(0, 0, W, W)
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  for (const s of strokes) {
    ctx.globalCompositeOperation = s.eraser ? 'destination-out' : 'source-over'
    ctx.strokeStyle = s.color; ctx.fillStyle = s.color; ctx.lineWidth = Math.max(1, s.size * W)
    const p = s.pts
    if (p.length === 1) { ctx.beginPath(); ctx.arc(p[0][0] * W, p[0][1] * W, ctx.lineWidth / 2, 0, 7); ctx.fill(); continue }
    ctx.beginPath(); ctx.moveTo(p[0][0] * W, p[0][1] * W)
    for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0] * W, p[i][1] * W)
    ctx.stroke()
  }
  ctx.globalCompositeOperation = 'source-over'
}

function Thumb({ strokes }) {
  const ref = useRef()
  useEffect(() => { const c = ref.current; c.width = c.height = 240; paint(c.getContext('2d'), strokes, 240) }, [strokes])
  return <canvas ref={ref} className="h-full w-full" />
}

function Board({ id, onBack }) {
  const { user, subscribe, showToast } = useApp()
  const { data: d } = useLive(`/drawings/${id}`, [])
  const [strokes, setStrokes] = useState([])
  const [color, setColor] = useState(COLORS[0])
  const [size, setSize] = useState(1)
  const [eraser, setEraser] = useState(false)
  const cv = useRef(), cur = useRef(null), W = useRef(600)
  const redraw = useCallback((list, live) => { const ctx = cv.current?.getContext('2d'); if (ctx) paint(ctx, live ? [...list, live] : list, W.current) }, [])
  useEffect(() => { if (d) { setStrokes(d.strokes) } }, [d])
  useEffect(() => { redraw(strokes) }, [strokes, redraw])
  const ready = !!d
  useEffect(() => {
    const el = cv.current
    if (!el) return
    const fit = () => { const w = Math.round(el.getBoundingClientRect().width * (window.devicePixelRatio || 1)); if (w && w !== W.current) { W.current = w; el.width = el.height = w; redraw(strokesRef.current) } }
    el.width = el.height = W.current = Math.round(el.getBoundingClientRect().width * (window.devicePixelRatio || 1)) || 600
    const ro = new ResizeObserver(fit); ro.observe(el); redraw(strokesRef.current); return () => ro.disconnect()
  }, [ready]) // eslint-disable-line
  const strokesRef = useRef([]); strokesRef.current = strokes
  useEffect(() => subscribe((m) => {
    if (m.entity !== 'drawings' || m.id !== id || m.origin === user.id) return
    if (m.op === 'stroke') setStrokes((s) => [...s, m.data])
    if (m.op === 'undo') setStrokes((s) => s.filter((x) => x.id !== m.data.id))
    if (m.op === 'clear') setStrokes([])
  }), [subscribe, id, user.id])

  const pos = (e) => { const r = cv.current.getBoundingClientRect(); return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))] }
  const down = (e) => { e.preventDefault(); cv.current.setPointerCapture(e.pointerId); cur.current = { id: Math.random().toString(36).slice(2, 12), color, size: SIZES[size], eraser, pts: [pos(e)], by: user.id }; redraw(strokes, cur.current) }
  const move = (e) => { if (!cur.current) return; const p = pos(e), l = cur.current.pts.at(-1); if (Math.hypot(p[0] - l[0], p[1] - l[1]) < 0.002) return; if (cur.current.pts.length < 1400) cur.current.pts.push(p); redraw(strokes, cur.current) }
  const up = async () => {
    const s = cur.current; cur.current = null; if (!s) return
    setStrokes((x) => [...x, s])
    try { await api.post(`/drawings/${id}/strokes`, { id: s.id, color: s.color, size: s.size, eraser: s.eraser, pts: s.pts }) } catch (e) { setStrokes((x) => x.filter((y) => y.id !== s.id)); showToast(e.message) }
  }
  const undo = async () => {
    const mine = [...strokes].reverse().find((s) => s.by === user.id); if (!mine) return
    setStrokes((x) => x.filter((s) => s.id !== mine.id))
    try { await api.del(`/drawings/${id}/strokes/${mine.id}`) } catch (e) { showToast(e.message) }
  }
  const clear = async () => { if (!strokes.length || !confirm('Cancellare tutto il disegno per entrambi?')) return; setStrokes([]); await api.post(`/drawings/${id}/clear`) }
  const save = () => {
    const c = document.createElement('canvas'); c.width = c.height = 1200; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 1200, 1200)
    const layer = document.createElement('canvas'); layer.width = layer.height = 1200; paint(layer.getContext('2d'), strokes, 1200); x.drawImage(layer, 0, 0)
    c.toBlob((b) => downloadBlob(b, `${(d?.name || 'disegno').replace(/\s+/g, '-')}.png`))
  }
  if (!d) return <p className="text-mute">Un attimo…</p>
  return (
    <div className="space-y-3">
      <PageHeader eyebrow="Disegniamo insieme" title={d.name} action={<button aria-label="Indietro" className="icon-btn-soft" onClick={onBack}><ChevronLeft size={20} /></button>} />
      <canvas ref={cv} data-testid="tela" aria-label="Tela" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        className="aspect-square w-full touch-none rounded-3xl bg-white ring-1 ring-line" style={{ touchAction: 'none' }} />
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1.5">{COLORS.map((c) => <button key={c} aria-label={`Colore ${c}`} onClick={() => { setColor(c); setEraser(false) }} className={`h-8 w-8 rounded-full ring-offset-2 ring-offset-bg ${color === c && !eraser ? 'ring-2 ring-accent' : ''}`} style={{ background: c }} />)}</div>
        <button aria-label="Gomma" aria-pressed={eraser} className={`icon-btn-soft !h-9 !w-9 ${eraser ? '!bg-accent !text-accent-ink' : ''}`} onClick={() => setEraser(!eraser)}><Eraser size={17} strokeWidth={1.6} /></button>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex gap-2">{SIZES.map((s, i) => <button key={s} aria-label={`Spessore ${i + 1}`} onClick={() => setSize(i)} className={`flex h-9 w-9 items-center justify-center rounded-full bg-card ring-1 ${size === i ? 'ring-2 ring-accent' : 'ring-line'}`}><i className="rounded-full bg-ink" style={{ width: 4 + i * 5, height: 4 + i * 5 }} /></button>)}</div>
        <div className="flex gap-2"><button aria-label="Annulla l'ultimo tratto" className="icon-btn-soft !h-9 !w-9" onClick={undo}><Undo2 size={17} strokeWidth={1.6} /></button><button aria-label="Cancella tutto" className="icon-btn-soft !h-9 !w-9" onClick={clear}><Trash2 size={17} strokeWidth={1.6} /></button><button aria-label="Scarica" className="icon-btn-soft !h-9 !w-9" onClick={save}><Download size={17} strokeWidth={1.6} /></button></div>
      </div>
      <p className="text-center text-xs text-mute">I tratti di chi disegna con voi compaiono subito.</p>
    </div>
  )
}

export default function Disegno() {
  const { data, reload } = useLive('/drawings', ['drawings'])
  const [open, setOpen] = useState(null)
  const { showToast } = useApp()
  const create = async () => { const d = await api.post('/drawings', { name: 'Senza titolo' }); reload(); setOpen(d.id) }
  const rename = async (d) => { const n = prompt('Nome del disegno', d.name); if (n?.trim()) { await api.patch(`/drawings/${d.id}`, { name: n.trim() }); reload() } }
  const remove = async (d) => { await api.del(`/drawings/${d.id}`); reload(); showToast('Disegno eliminato', { label: 'Annulla', run: async () => { await api.post(`/trash/drawings/${d.id}/restore`); reload() } }) }
  if (open) return <Board id={open} onBack={() => { setOpen(null); reload() }} />
  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Una tela per due" title="Disegno condiviso" action={<button aria-label="Nuovo disegno" className="icon-btn" onClick={create}><Plus size={22} /></button>} />
      {data === null ? <p className="text-mute">Un attimo…</p> : data.length === 0 ? <div className="card text-center text-mute">Nessun disegno. Aprite una tela e disegnate insieme, anche a distanza.</div> : (
        <div className="grid grid-cols-2 gap-3">{data.map((d) => (
          <div key={d.id} className="card !rounded-2xl !p-2">
            <button className="block aspect-square w-full overflow-hidden rounded-xl bg-white ring-1 ring-line" onClick={() => setOpen(d.id)} aria-label={`Apri ${d.name}`}><Thumb strokes={d.strokes} /></button>
            <div className="flex items-center justify-between px-1 pt-2"><span className="truncate text-sm font-medium">{d.name}</span><span className="flex"><button aria-label={`Rinomina ${d.name}`} className="p-1 text-mute" onClick={() => rename(d)}><Pencil size={14} /></button><button aria-label={`Elimina ${d.name}`} className="p-1 text-mute" onClick={() => remove(d)}><Trash2 size={14} /></button></span></div>
          </div>))}</div>
      )}
    </div>
  )
}
