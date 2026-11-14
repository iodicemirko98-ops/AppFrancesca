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
  const font = 'ui-rounded, "SF Pro Rounded", system-ui, sans-serif'
  g.font = `600 52px ${font}`; g.globalAlpha = 0.85
  g.fillText('Oggi festeggiamo', W / 2, 640)
  g.globalAlpha = 1
  g.font = `800 150px ${font}`
  g.fillText(label.toUpperCase(), W / 2, 820, W - 120)
  g.font = `600 64px ${font}`
  g.fillText('insieme', W / 2, 910)
  g.font = `700 70px ${font}`
  g.fillText(names, W / 2, 1100, W - 120)
  g.font = `500 44px ${font}`; g.globalAlpha = 0.8
  g.fillText(`${days} giorni di noi`, W / 2, 1180)
  return new Promise((r) => c.toBlob(r, 'image/png'))
}

export default function MilestoneCard({ label, names, days }) {
  const save = async () => downloadBlob(await draw({ label, names, days }), `noidue-${label.replace(/\s+/g, '-')}.png`)
  return (
    <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-[#D67D5C] to-[#A94E31] p-6 text-center text-white shadow-md">
      <div className="text-5xl">🎉</div>
      <div className="mt-2 text-sm font-medium opacity-90">Oggi festeggiamo</div>
      <div className="text-3xl font-extrabold uppercase">{label}</div>
      <div className="text-lg font-semibold">insieme</div>
      <button onClick={save} className="mt-4 rounded-2xl bg-white/20 px-5 py-2.5 text-sm font-semibold backdrop-blur active:scale-[.98]">
        Scarica la card
      </button>
    </div>
  )
}
