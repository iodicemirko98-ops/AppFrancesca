import { CalendarDays, CheckCircle2, ListChecks, MessageCircleQuestion, Scale, Rocket, Gift, Lightbulb, StickyNote, PiggyBank, Lock, Brush, Flower2, Sparkles, MapPin, Wallet, Bell, Trash2, Settings, Home } from 'lucide-react'

// Registro delle sezioni. `nav`: compare nella barra in basso. `ready`: la sezione esiste già.
export const SECTIONS = [
  { key: 'calendario', path: '/calendario', label: 'Calendario', icon: CalendarDays, nav: true, ready: true },
  { key: 'attivita', path: '/attivita', label: 'Attività', icon: CheckCircle2, nav: true, ready: true },
  { key: 'liste', path: '/liste', label: 'Liste', icon: ListChecks, nav: true, ready: true },
  { key: 'domanda', path: '/domanda', label: 'Domanda del giorno', icon: MessageCircleQuestion, ready: false },
  { key: 'decidere', path: '/decidere', label: 'Decidere insieme', icon: Scale, ready: false },
  { key: 'fare_insieme', path: '/fare-insieme', label: 'Da fare insieme', icon: Rocket, ready: false },
  { key: 'desideri', path: '/desideri', label: 'Desideri e regali', icon: Gift, ready: false },
  { key: 'buono_a_sapersi', path: '/buono-a-sapersi', label: 'Buono a sapersi', icon: Lightbulb, ready: false },
  { key: 'note', path: '/note', label: 'Note e capsule', icon: StickyNote, ready: false },
  { key: 'viaggi', path: '/viaggi', label: 'Viaggi', icon: MapPin, ready: false },
  { key: 'risparmi', path: '/risparmi', label: 'Risparmi', icon: PiggyBank, ready: false },
  { key: 'spese', path: '/spese', label: 'Spese comuni', icon: Wallet, ready: false },
  { key: 'cassaforte', path: '/cassaforte', label: 'Cassaforte', icon: Lock, ready: false },
  { key: 'disegno', path: '/disegno', label: 'Disegno condiviso', icon: Brush, ready: false },
  { key: 'ciclo', path: '/ciclo', label: 'Ciclo', icon: Flower2, ready: false },
  { key: 'anno', path: '/anno', label: 'Il nostro anno', icon: Sparkles, ready: false },
]
export const UTILITY = [
  { path: '/notifiche', label: 'Notifiche', icon: Bell },
  { path: '/cestino', label: 'Eliminati di recente', icon: Trash2 },
  { path: '/impostazioni', label: 'Impostazioni', icon: Settings },
]
export { Home }
