import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { api, getToken, setToken, wsUrl } from './api'
import { applyTheme } from './util'

const Ctx = createContext(null)
export const useApp = () => useContext(Ctx)

export function AppProvider({ children }) {
  const [user, setUser] = useState(null)
  const [home, setHome] = useState(null)
  const [loading, setLoading] = useState(!!getToken())

  const loadAll = useCallback(async () => {
    const [u, h] = await Promise.all([api.get('/me'), api.get('/home')])
    setUser(u)
    setHome(h)
    applyTheme(u.theme)
    return u
  }, [])

  useEffect(() => {
    if (!getToken()) return
    loadAll()
      .catch((e) => { if (e.status === 401) setToken(null) })
      .finally(() => setLoading(false))
  }, [loadAll])

  // aggiorna quando si torna sull'app (ad es. il partner si è collegato)
  useEffect(() => {
    const onVis = () => document.visibilityState === 'visible' && getToken() && loadAll().catch(() => {})
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [loadAll])

  // ---- sincronizzazione in tempo reale (WebSocket con riconnessione) ----
  const subs = useRef(new Set())
  const subscribe = useCallback((fn) => { subs.current.add(fn); return () => subs.current.delete(fn) }, [])
  const userId = user?.id
  useEffect(() => {
    if (!userId) return
    let ws, timer, ping, tries = 0, stopped = false
    const fire = (m) => subs.current.forEach((f) => f(m))
    const open = () => {
      ws = new WebSocket(wsUrl(getToken()))
      ws.onopen = () => {
        if (tries > 0) { fire({ entity: '*' }); loadAll().catch(() => {}) } // dopo una pausa: rileggi tutto
        tries = 0
        ping = setInterval(() => ws.readyState === 1 && ws.send('ping'), 25000)
      }
      ws.onmessage = (e) => {
        if (e.data === 'pong') return
        const m = JSON.parse(e.data)
        if (m.entity === 'hello') return
        fire(m)
        if (['notifications', 'tasks', 'events', 'answers', 'notes', 'couple'].includes(m.entity)) loadAll().catch(() => {})
      }
      ws.onclose = () => {
        clearInterval(ping)
        if (!stopped) timer = setTimeout(open, Math.min(15000, 1000 * 2 ** tries++))
      }
    }
    open()
    return () => { stopped = true; clearTimeout(timer); clearInterval(ping); ws?.close() }
  }, [userId, loadAll])

  // ---- avviso temporaneo con "Annulla" ----
  const [toast, setToast] = useState(null)
  const showToast = useCallback((text, action) => {
    const id = Math.random()
    setToast({ id, text, action })
    setTimeout(() => setToast((t) => (t?.id === id ? null : t)), 6000)
  }, [])

  const enter = async (path, body) => {
    const r = await api.post(path, body)
    setToken(r.token)
    await loadAll()
  }

  const value = {
    user, home, loading, subscribe, toast, showToast, closeToast: () => setToast(null),
    couple: home?.couple,
    login: (email, password) => enter('/auth/login', { email, password }),
    register: (b) => enter('/auth/register', b),
    logout: () => { setToken(null); setUser(null); setHome(null) },
    reload: loadAll,
    saveProfile: async (patch) => { const u = await api.patch('/me', patch); setUser(u); if (patch.theme) applyTheme(u.theme); await loadAll() },
    saveCouple: async (patch) => { await api.patch('/couple', patch); await loadAll() },
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
