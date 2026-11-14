import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api, getToken, setToken } from './api'
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

  const enter = async (path, body) => {
    const r = await api.post(path, body)
    setToken(r.token)
    await loadAll()
  }

  const value = {
    user, home, loading,
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
