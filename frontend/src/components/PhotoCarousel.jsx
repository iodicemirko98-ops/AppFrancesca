import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, ImagePlus } from 'lucide-react'
import { useLive } from '../hooks'

// Carosello delle foto preferite nella home: scorre con il dito e avanza da solo.
export default function PhotoCarousel() {
  const { data } = useLive('/photos/carousel', ['photos'])
  const box = useRef(null)
  const [i, setI] = useState(0)
  const paused = useRef(false)
  const n = data?.length || 0

  useEffect(() => {
    if (n < 2 || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const t = setInterval(() => {
      const el = box.current
      if (!el || paused.current || document.hidden) return
      const next = (Math.round(el.scrollLeft / el.clientWidth) + 1) % n
      el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' })
    }, 5000)
    return () => clearInterval(t)
  }, [n])

  if (data === null) return <div className="skeleton" aria-busy="true"><i style={{ height: '13rem' }} /></div>
  if (n === 0) return (
    <Link to="/foto" className="card flex items-center gap-4 !p-4">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent/15 text-accent"><ImagePlus size={20} strokeWidth={1.6} /></span>
      <span className="min-w-0 flex-1"><span className="display block text-xl">Le vostre foto preferite</span><span className="text-sm text-mute">Aggiungetele e compariranno qui, in un carosello</span></span>
      <ChevronRight size={18} className="text-mute" />
    </Link>
  )
  return (
    <section aria-label="Le nostre foto" className="space-y-2">
      <div className="flex items-center justify-between px-1"><h2 className="eyebrow">Le nostre foto</h2><Link to="/foto" className="flex items-center text-sm font-medium text-accent">Tutte<ChevronRight size={16} /></Link></div>
      <div className="relative">
        <div ref={box} onScroll={(e) => setI(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
          onTouchStart={() => { paused.current = true }} onTouchEnd={() => setTimeout(() => { paused.current = false }, 6000)}
          onPointerEnter={() => { paused.current = true }} onPointerLeave={() => { paused.current = false }}
          className="flex snap-x snap-mandatory overflow-x-auto rounded-3xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {data.map((p, k) => (
            <Link key={p.id} to="/foto" className="relative block aspect-[4/3] w-full shrink-0 snap-center" aria-label={p.caption || `Foto ${k + 1}`}>
              <img src={p.data} alt={p.caption || ''} loading={k === 0 ? 'eager' : 'lazy'} decoding="async" className="h-full w-full object-cover" />
              {p.caption && <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-4 pb-3 pt-10 text-sm font-medium text-white">{p.caption}</span>}
            </Link>
          ))}
        </div>
        {n > 1 && (
          <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center gap-1.5">
            {data.map((p, k) => <i key={p.id} className={`h-1.5 rounded-full bg-white/90 shadow transition-all ${k === i ? 'w-5' : 'w-1.5 opacity-60'}`} />)}
          </div>
        )}
      </div>
    </section>
  )
}
