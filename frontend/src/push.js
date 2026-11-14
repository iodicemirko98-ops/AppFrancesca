import { api } from './api'

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true

const b64 = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), (c) => c.charCodeAt(0))

export async function pushState() {
  if (!pushSupported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  const reg = await navigator.serviceWorker.ready
  return (await reg.pushManager.getSubscription()) ? 'on' : 'off'
}

export async function enablePush() {
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') throw new Error('Permesso negato: abilitalo dalle impostazioni del browser')
  const reg = await navigator.serviceWorker.ready
  const { key } = await api.get('/push/key')
  const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(key) }))
  await api.post('/push/subscribe', sub.toJSON())
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (sub) { await api.post('/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {}); await sub.unsubscribe() }
}
