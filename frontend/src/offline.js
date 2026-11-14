// Modalità offline: cache delle letture + coda delle modifiche semplici (attività e voci delle liste).
const DB = 'noidue-offline'
const SENSITIVE = /^\/(vault|cycle|export|auth|push)/

let dbp
function db() {
  if (!dbp) dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => { r.result.createObjectStore('cache'); r.result.createObjectStore('outbox', { keyPath: 'id' }) }
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
  return dbp
}
async function tx(store, mode, fn) {
  try {
    const d = await db()
    return await new Promise((res, rej) => {
      const t = d.transaction(store, mode)
      const out = fn(t.objectStore(store))
      t.oncomplete = () => res(out?.result)
      t.onerror = () => rej(t.error)
    })
  } catch { return undefined }
}

export const cacheable = (path) => !SENSITIVE.test(path)
export const cachePut = (path, data) => cacheable(path) && tx('cache', 'readwrite', (s) => s.put(data, path))
export const cacheGet = (path) => tx('cache', 'readonly', (s) => s.get(path))
export const outboxAll = async () => ((await tx('outbox', 'readonly', (s) => s.getAll())) || []).sort((a, b) => a.id - b.id)
const outboxPut = (m) => tx('outbox', 'readwrite', (s) => s.put(m))
const outboxDel = (id) => tx('outbox', 'readwrite', (s) => s.delete(id))
export async function clearOffline() {
  await tx('cache', 'readwrite', (s) => s.clear())
  await tx('outbox', 'readwrite', (s) => s.clear())
  notify()
}

// ---- stato osservabile (per il banner) ----
const listeners = new Set()
let pendingCount = 0
async function notify() { pendingCount = (await outboxAll()).length; listeners.forEach((f) => f({ pending: pendingCount, online: navigator.onLine })) }
export const onStatus = (fn) => { listeners.add(fn); notify(); return () => listeners.delete(fn) }
let flushedCb = () => {}
export const onFlushed = (fn) => { flushedCb = fn }
window.addEventListener('online', () => { flush(); notify() })
window.addEventListener('offline', notify)

// ---- quali modifiche si possono fare offline ----
const RX = {
  taskNew: /^\/tasks$/, task: /^\/tasks\/([^/]+)$/,
  itemNew: /^\/lists\/([^/]+)\/items$/, item: /^\/lists\/([^/]+)\/items\/([^/]+)$/,
}
export function queueable(method, path) {
  if (method === 'POST') return RX.taskNew.test(path) || RX.itemNew.test(path)
  if (method === 'PATCH' || method === 'DELETE') return RX.task.test(path) || RX.item.test(path)
  return false
}

const tmpId = () => 'tmp-' + Math.random().toString(36).slice(2, 10)

// Applica la modifica alla copia locale e restituisce ciò che il server avrebbe risposto.
async function applyLocal(method, path, body, userId) {
  let m
  if (method === 'POST' && RX.taskNew.test(path)) {
    const list = (await cacheGet('/tasks')) || []
    const t = { id: tmpId(), title: '', assignee: null, due: null, category_id: null, notes: '', ...body, done: false, done_by: null, created_by: userId, pending: true }
    await cachePut('/tasks', [...list, t]); return t
  }
  if ((m = path.match(RX.task))) {
    const list = (await cacheGet('/tasks')) || []
    if (method === 'DELETE') { await cachePut('/tasks', list.filter((t) => t.id !== m[1])); return null }
    const next = list.map((t) => (t.id === m[1] ? { ...t, ...body, ...('done' in body ? { done_by: body.done ? userId : null } : {}) } : t))
    await cachePut('/tasks', next); return next.find((t) => t.id === m[1])
  }
  if ((m = path.match(RX.itemNew)) && method === 'POST') {
    const l = await cacheGet(`/lists/${m[1]}`); if (!l) return undefined
    const out = { ...l, items: [...l.items, { id: tmpId(), text: body.text, done: false, added_by: userId, done_by: null, pending: true }] }
    await cachePut(`/lists/${m[1]}`, out); return out
  }
  if ((m = path.match(RX.item))) {
    const l = await cacheGet(`/lists/${m[1]}`); if (!l) return undefined
    const items = method === 'DELETE' ? l.items.filter((i) => i.id !== m[2]) : l.items.map((i) => (i.id === m[2] ? { ...i, ...body } : i))
    const out = { ...l, items }; await cachePut(`/lists/${m[1]}`, out); return out
  }
}

export async function enqueue(method, path, body, userId) {
  const local = await applyLocal(method, path, body ?? {}, userId)
  if (local === undefined) return { ok: false }
  await outboxPut({ id: Date.now() + Math.random(), method, path, body: body ?? {} })
  notify()
  return { ok: true, data: local }
}

// ---- invio della coda ----
let flushing = false
export async function flush(send) {
  send = send || flushSender
  if (flushing || !navigator.onLine || !send) return
  flushing = true
  let did = false
  try {
    const idMap = {}
    const fix = (s) => Object.entries(idMap).reduce((acc, [a, b]) => acc.split(a).join(b), s)
    for (const m of await outboxAll()) {
      const path = fix(m.path)
      try {
        const r = await send(m.method, path, m.body)
        if (m.method === 'POST') {
          const tmp = (await tmpOf(m)) // id provvisorio associato
          const real = RX.taskNew.test(m.path) ? r?.id : r?.items?.[r.items.length - 1]?.id
          if (tmp && real) idMap[tmp] = real
        }
        await outboxDel(m.id); did = true
      } catch (e) {
        if (e.status === 0) break // ancora offline: riprova più tardi
        await outboxDel(m.id); did = true // rifiutata dal server (es. già eliminata): scartala
      }
    }
  } finally { flushing = false; notify() }
  if (did) flushedCb()
}
// l'id provvisorio viene ricostruito cercando l'elemento "pending" più vecchio nella copia locale
async function tmpOf(m) {
  if (RX.taskNew.test(m.path)) return ((await cacheGet('/tasks')) || []).find((t) => t.pending && t.id.startsWith('tmp-'))?.id
  const id = m.path.match(RX.itemNew)?.[1]
  return (await cacheGet(`/lists/${id}`))?.items.find((i) => i.pending && i.id.startsWith('tmp-'))?.id
}
let flushSender
export const setSender = (f) => { flushSender = f }
