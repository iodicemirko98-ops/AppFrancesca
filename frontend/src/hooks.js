import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api'
import { useApp } from './state'
import { cacheGet, cacheable } from './offline'

const mem = new Map()

// Carica `path` e lo ricarica quando il partner (o un altro dispositivo) cambia una delle `entities`.
export function useLive(path, entities = []) {
  const { subscribe } = useApp()
  const [data, setData] = useState(() => mem.get(path) ?? null)
  const [error, setError] = useState('')
  const key = entities.join(',')
  const pathRef = useRef(path)
  pathRef.current = path
  const load = useCallback(async () => {
    try { const d = await api.get(pathRef.current); mem.set(pathRef.current, d); setData(d); setError('') } catch (e) { setError(e.message) }
  }, [])
  useEffect(() => {
    let alive = true
    if (!mem.has(path) && cacheable(path)) cacheGet(path).then((d) => { if (alive && d != null && !mem.has(path)) setData((x) => x ?? d) }).catch(() => {})
    else if (mem.has(path)) setData(mem.get(path))
    load()
    return () => { alive = false }
  }, [path, load])
  useEffect(() => {
    let t
    const off = subscribe((m) => { if (m.entity === '*' || key.split(',').includes(m.entity)) { clearTimeout(t); t = setTimeout(load, 120) } })
    return () => { off(); clearTimeout(t) }
  }, [subscribe, key, load])
  return { data, error, reload: load, setData }
}

export const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
