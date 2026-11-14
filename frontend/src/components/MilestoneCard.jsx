import { Download } from 'lucide-react'
import { downloadBlob } from '../util'

// Disegna la card celebrativa su canvas e la scarica come PNG (nessun servizio esterno).
function draw({ label, names, days }) {
  const W = 1080, H = 1350
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const g = c.getContext('2d')
  const grad = g.createLinearGradient(0, 0, W, H)
  grad.addColorStop(0, '#D67D5C'); grad.addColorStop(1, '#A94E31')
  g.fillStyle = grad; g.fillRect(0, 0, W, H)

  g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 22
  for (const x of [W / 2 - 70, W / 2 + 70]) { g.beginPath(); g.arc(x, 330, 130, 0, Math.PI * 2); g.stroke() }

  g.fillStyle = '#fff'; g.textAlign = 'center'
  const font = '"Cormorant Garamond", Georgia, serif'
  g.font = `600 52px ${font}`; g.globalAlpha = 0.85
  g.fillText('Oggi festeggiamo', W / 2, 640)
  g.globalAlpha = 1
  g.font = `600 190px ${font}`
  g.fillText(label.toUpperCase(), W / 2, 820, W - 120)
  g.font = `italic 500 84px ${font}`
  g.fillText('insieme', W / 2, 910)
  g.font = `600 80px ${font}`
  g.fillText(names, W / 2, 1100, W - 120)
  g.font = `500 44px ${font}`; g.globalAlpha = 0.8
  g.fillText(`${days} giorni di noi`, W / 2, 1180)
  return new Promise((r) => c.toBlob(r, 'image/png'))
}

export default function MilestoneCard({ label, names, days, date }) {
  const save = async () => downloadBlob(await draw({ label, names, days }), `noidue-${label.replace(/\s+/g, '-')}.png`)
  return (
    <>
      <div className="relative overflow-hidden rounded-3xl bg-accent p-6 text-accent-ink">
        <div className="pointer-events-none absolute -right-8 -top-10 h-44 w-44 rounded-full border-[14px] border-white/20" />
        <div className="pointer-events-none absolute -bottom-10 right-8 h-32 w-32 rounded-full border-[12px] border-white/15" />
        <div className="relative">
          <div className="text-[11px] font-medium uppercase tracking-[.2em] opacity-85">✦ Traguardo</div>
          <div className="display mt-4 text-6xl leading-none">{label}</div>
          <div className="display mt-1 text-3xl italic">insieme</div>
          <div className="mt-6 font-medium">{names}</div>
          <div className="text-sm opacity-80">{date} · {days} giorni</div>
        </div>
      </div>
      <button onClick={save} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-card py-3 font-medium ring-1 ring-line active:scale-[.99]">
        <Download size={18} strokeWidth={1.6} />Scarica come immagine
      </button>
    </>
  )
}
