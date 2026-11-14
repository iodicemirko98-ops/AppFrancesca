import { CalendarDays, CheckCircle2, ListChecks, MessageCircleQuestion, Scale, Rocket, Gift, Lightbulb, StickyNote, PiggyBank, Lock, Brush, Flower2, Sparkles, MapPin, Wallet, Bell, Trash2, Settings, Home, Trophy, Images, ChefHat } from 'lucide-react'

// Registro delle sezioni. `nav`: compare nella barra in basso. `ready`: la sezione esiste già.
export const SECTIONS = [
  { key: 'calendario', path: '/calendario', label: 'Calendario', icon: CalendarDays, nav: true, ready: true },
  { key: 'attivita', path: '/attivita', label: 'Attività', icon: CheckCircle2, nav: true, ready: true },
  { key: 'liste', path: '/liste', label: 'Liste', icon: ListChecks, nav: true, ready: true },
  { key: 'domanda', path: '/domanda', label: 'Domanda del giorno', icon: MessageCircleQuestion, ready: true },
  { key: 'decidere', path: '/decidere', label: 'Decidere insieme', icon: Scale, ready: true },
  { key: 'fare_insieme', path: '/fare-insieme', label: 'Da fare insieme', icon: Rocket, ready: true },
  { key: 'desideri', path: '/desideri', label: 'Desideri e regali', icon: Gift, ready: true },
  { key: 'buono_a_sapersi', path: '/buono-a-sapersi', label: 'Buono a sapersi', icon: Lightbulb, ready: true },
  { key: 'note', path: '/note', label: 'Note e capsule', icon: StickyNote, ready: true },
  { key: 'viaggi', path: '/viaggi', label: 'Viaggi', icon: MapPin, ready: true },
  { key: 'risparmi', path: '/risparmi', label: 'Risparmi', icon: PiggyBank, ready: true },
  { key: 'spese', path: '/spese', label: 'Spese comuni', icon: Wallet, ready: true },
  { key: 'cassaforte', path: '/cassaforte', label: 'Cassaforte', icon: Lock, ready: true },
  { key: 'disegno', path: '/disegno', label: 'Disegno condiviso', icon: Brush, ready: true },
  { key: 'foto', path: '/foto', label: 'Le nostre foto', icon: Images, ready: true },
  { key: 'ricette', path: '/ricette', label: 'Ricettario', icon: ChefHat, ready: true },
  { key: 'trivia', path: '/trivia', label: 'Trivia', icon: Trophy, ready: true },
  { key: 'ciclo', path: '/ciclo', label: 'Ciclo', icon: Flower2, ready: true },
  { key: 'anno', path: '/anno', label: 'Il nostro anno', icon: Sparkles, ready: true },
]
export const UTILITY = [
  { path: '/notifiche', label: 'Notifiche', icon: Bell },
  { path: '/cestino', label: 'Eliminati di recente', icon: Trash2 },
  { path: '/impostazioni', label: 'Impostazioni', icon: Settings },
]
export { Home }
