export type UserRole = 'member' | 'group_admin' | 'super_admin'
export type RoomMemberRole = 'member' | 'admin'
export type RoomMode = 'auto' | 'expert'
export type EventMode = 'heads_up' | 'community' | 'expert'  // computed at runtime from RoomMode + member count

export interface Room {
  id: string
  name: string
  invite_code: string
  created_by: string | null
  created_at: string
  mode: RoomMode
  expert_user_id: string | null
}

export interface RoomMember {
  id: string
  room_id: string
  user_id: string
  role: RoomMemberRole
  joined_at: string
}

export interface RoomEvent {
  id: string
  room_id: string
  event_id: string
  added_by: string | null
  added_at: string
}

export interface Event {
  id: string
  name: string
  date: string | null
  location: string | null
  room_id: string | null
  created_at: string
  voting_opens_at: string | null
  voting_released_at: string | null
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
  round_comment: string | null
  double_down_category: string | null
  submitted_at: string
}

export interface BattleVerdict {
  id: string
  battle_id: string
  user_name: string
  overall_winner: string
  battle_comment: string | null
  submitted_at: string
}

export const CATEGORIES = [
  { key: 'bars', label: 'BARS / TEXT' },
  { key: 'personalisierung', label: 'PERSONALISIERUNG' },
  { key: 'delivery', label: 'DELIVERY / PERFORMANCE' },
  { key: 'struktur', label: 'STRUKTUR / DRAMATURGIE' },
  { key: 'crowd', label: 'CROWD REACTION' },
] as const

export type CategoryKey = typeof CATEGORIES[number]['key']
