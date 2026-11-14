// ---- aspetto: colore (da un cursore) e sfondo ----
const hsl = (h, s, l) => {
  s /= 100; l /= 100
  const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l)
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)]
}
const lum = ([r, g, b]) => { const c = [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] }
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
const trip = (c) => c.join(' ')
const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('')

// Colori dell'app a partire da una tinta (0-360); con hue null si torna al terracotta originale.
function palette(h, dark) {
  const white = [255, 255, 255], night = [30, 24, 21]
  let accent, ink
  if (!dark) {
    let l = 52; accent = hsl(h, 52, l)
    while (contrast(accent, white) < 4.5 && l > 20) accent = hsl(h, 52, (l -= 2))
    ink = white
  } else {
    let l = 62; accent = hsl(h, 58, l)
    while (contrast(accent, night) < 5 && l < 90) accent = hsl(h, 58, (l += 2))
    ink = night
  }
  const v = dark
    ? { bg: hsl(h, 16, 10), card: hsl(h, 14, 14), soft: hsl(h, 13, 18), line: hsl(h, 12, 24), ink: hsl(h, 30, 93), mute: hsl(h, 10, 68) }
    : { bg: hsl(h, 45, 96), card: [255, 255, 255], soft: hsl(h, 35, 92), line: hsl(h, 30, 86), ink: hsl(h, 30, 14), mute: hsl(h, 10, 42) }
  return { accent, 'accent-ink': ink, ...v }
}

let look = { hue: null, bg: 'nessuno', dim: 55, card: 62 }
try { look = { ...look, ...JSON.parse(localStorage.getItem('look') || '{}') } } catch { /* ignora */ }

export function applyLook(next) {
  if (next) { look = { hue: next.hue ?? null, bg: next.bg || 'nessuno', dim: next.dim ?? look.dim ?? 55, card: next.card ?? look.card ?? 62, bgv: next.bgv }; try { localStorage.setItem('look', JSON.stringify(look)) } catch { /* ignora */ } }
  const root = document.documentElement, dark = root.classList.contains('dark')
  const names = ['bg', 'card', 'soft', 'ink', 'mute', 'line', 'accent', 'accent-ink']
  if (look.hue === null) names.forEach((n) => root.style.removeProperty('--' + n))
  else { const p = palette(look.hue, dark); names.forEach((n) => root.style.setProperty('--' + n, trip(p[n]))) }
  // sfondo
  let bg = look.bg
  let foto = null
  try { foto = localStorage.getItem('sfondo-foto') } catch { /* ignora */ }
  let off = false; try { off = !!localStorage.getItem('sfondo-off') } catch { /* ignora */ }
  if (bg === 'foto' && (!foto || off)) bg = 'nessuno'
  root.dataset.sfondo = bg
  if (bg === 'foto') {
    root.style.setProperty('--foto', `url(${foto})`)
    root.style.setProperty('--dim', String((look.dim ?? 55) / 100))
    root.style.setProperty('--card-a', String((look.card ?? 62) / 100))
  }
  const acc = look.hue === null ? (dark ? [30, 24, 21] : [194, 96, 63]) : (dark ? palette(look.hue, true).bg : palette(look.hue, false).accent)
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', hex(acc))
}
export const getLook = () => look

export function applyTheme(theme) {
  const dark = theme === 'scuro' || (theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
  try { localStorage.setItem('tema', theme) } catch {}
  applyLook()
}

// Ridimensiona una foto mantenendo le proporzioni (lato lungo `max`) e la restituisce come data URL JPEG.
export function resizePhoto(file, max = 1000, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const img = new Image(), url = URL.createObjectURL(file)
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height))
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k)
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(url)
      resolve(c.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Immagine non leggibile')) }
    img.src = url
  })
}

// Foto di sfondo: ridimensionata; si salva sull'account (sincronizzata tra i dispositivi) e in locale per essere veloce.
export function resizeBackground(file, max = 1000) {
  return new Promise((resolve, reject) => {
    const img = new Image(), url = URL.createObjectURL(file)
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height))
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k)
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(url)
      resolve(c.toDataURL('image/jpeg', 0.6))
    }
    img.onerror = () => reject(new Error('Immagine non leggibile'))
    img.src = url
  })
}
export const storeBackground = (data, v) => { try { localStorage.removeItem('sfondo-off'); localStorage.setItem('sfondo-foto', data); localStorage.setItem('sfondo-foto-v', v || '') } catch { /* ignora */ } }
export const localBackgroundVersion = () => { try { return localStorage.getItem('sfondo-foto') ? localStorage.getItem('sfondo-foto-v') || '' : null } catch { return null } }
export const removeBackgroundPhoto = () => { try { localStorage.removeItem('sfondo-off'); localStorage.removeItem('sfondo-foto'); localStorage.removeItem('sfondo-foto-v') } catch { /* ignora */ } }

// Ridimensiona una foto a un quadrato (centrato) e la restituisce come data URL JPEG leggero.
export function resizeImage(file, size = 256) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const s = Math.min(img.width, img.height)
      const c = document.createElement('canvas')
      c.width = c.height = size
      c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size)
      URL.revokeObjectURL(url)
      resolve(c.toDataURL('image/jpeg', 0.82))
    }
    img.onerror = () => reject(new Error('Immagine non leggibile'))
    img.src = url
  })
}

export const fmtDate = (iso) =>
  iso ? new Date(iso + 'T12:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }) : ''

export function downloadBlob(blob, filename) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

export const eur = (n) => Number(n).toLocaleString('it-IT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const fmtShort = (iso) => (iso ? new Date(iso.slice(0, 10) + 'T12:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'short' }) : '')
