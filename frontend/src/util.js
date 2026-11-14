export function applyTheme(theme) {
  const dark = theme === 'scuro' || (theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
  try { localStorage.setItem('tema', theme) } catch {}
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#1E1815' : '#C2603F')
}

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
