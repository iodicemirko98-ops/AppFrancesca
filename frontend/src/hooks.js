import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api'
import { useApp } from './state'

// Carica `path` e lo ricarica quando il partner (o un altro dispositivo) cambia una delle `entities`.
export function useLive(path, entities = []) {
  const { subscribe } = useApp()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const key = entities.join(',')
  const pathRef = useRef(path)
  pathRef.current = path
  const load = useCallback(async () => {
    try { setData(await api.get(pathRef.current)); setError('') } catch (e) { setError(e.message) }
  }, [])
  useEffect(() => { load() }, [path, load])
  useEffect(() => subscribe((m) => (m.entity === '*' || key.split(',').includes(m.entity)) && load()), [subscribe, key, load])
  return { data, error, reload: load, setData }
}

export const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
