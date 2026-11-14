import { useEffect, useState } from 'react'
import { WifiOff } from 'lucide-react'
import { onStatus } from '../offline'

export default function OfflineBanner() {
  const [s, setS] = useState({ online: true, pending: 0 })
  useEffect(() => onStatus(setS), [])
  if (s.online && !s.pending) return null
  return (
    <div role="status" className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 bg-ink px-4 py-1.5 text-center text-sm text-bg">
      <WifiOff size={15} />
      {s.online ? `Sincronizzo ${s.pending} modific${s.pending === 1 ? 'a' : 'he'}…` : `Sei offline${s.pending ? ` · ${s.pending} modific${s.pending === 1 ? 'a' : 'he'} da inviare` : ' · vedi i dati salvati'}`}
    </div>
  )
}
