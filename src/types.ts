// App-Datentypen (manuell — kein generierter Supabase-Typ)
export interface Event {
  id: string
  name: string
  date: string | null
  location: string | null
  created_at: string
}

export interface Battle {
  id: string
  event_id: string
  mc1: string
  mc2: string
  format: string
  position: number
  created_at: string
}

export interface Score {
  id: string
  battle_id: string
  user_name: string
  round_number: number
  bars_mc1: number
  bars_mc2: number
  personalisierung_mc1: number
  personalisierung_mc2: number
  delivery_mc1: number
  delivery_mc2: number
  struktur_mc1: number
  struktur_mc2: number
  crowd_mc1: number
  crowd_mc2: number
  round_winner: string | null
  submitted_at: string
}

export interface BattleVerdict {
  id: string
  battle_id: string
  user_name: string
  overall_winner: string
  submitted_at: string
}

export const USERS = ['Ben', 'Löwe'] as const
export type UserName = typeof USERS[number]

export const CATEGORIES = [
  { key: 'bars', label: 'Bars / Text' },
  { key: 'personalisierung', label: 'Personalisierung' },
  { key: 'delivery', label: 'Delivery' },
  { key: 'struktur', label: 'Struktur' },
  { key: 'crowd', label: 'Crowd Reaction' },
] as const

export type CategoryKey = typeof CATEGORIES[number]['key']
