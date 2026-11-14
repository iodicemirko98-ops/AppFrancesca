const BASE = import.meta.env.VITE_API_URL || ''

export const getToken = () => localStorage.getItem('token')
export const setToken = (t) => (t ? localStorage.setItem('token', t) : localStorage.removeItem('token'))

export class ApiError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

async function request(method, path, body) {
  let res
  try {
    res = await fetch(BASE + '/api' + path, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError(0, 'Nessuna connessione. Riprova tra poco.')
  }
  if (res.status === 204) return null
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const d = data.detail
    const msg = typeof d === 'string' ? d : Array.isArray(d) ? validationMessage(d) : 'Qualcosa è andato storto'
    throw new ApiError(res.status, msg)
  }
  return data
}

function validationMessage(errors) {
  const f = errors[0]?.loc?.slice(-1)[0]
  const names = { email: "L'email non è valida", password: 'La password deve avere almeno 8 caratteri', name: 'Inserisci un nome' }
  return names[f] || 'Controlla i dati inseriti'
}

export const api = {
  get: (p) => request('GET', p),
  post: (p, b) => request('POST', p, b ?? {}),
  patch: (p, b) => request('PATCH', p, b),
  del: (p, b) => request('DELETE', p, b),
}
