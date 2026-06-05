import type { RoomMode, EventMode } from '../types'

export interface VotingState {
  voting_opens_at: string | null
  voting_released_at: string | null
}

export function canVote(event: VotingState): boolean {
  if (!event.voting_opens_at) return true
  if (event.voting_released_at) return true
  return new Date(event.voting_opens_at) <= new Date()
}

export function formatVotingDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

/**
 * Bestimmt den effektiven Bewertungsmodus.
 * Priorität: 1) lockedMode (aus room_events) wenn gesetzt
 *            2) live aus roomMode + memberCount berechnen
 */
export function getRoomMode(
  roomMode: RoomMode,
  memberCount: number,
  lockedMode?: EventMode | null,
): EventMode {
  if (lockedMode) return lockedMode
  if (roomMode === 'expert') return 'expert'
  return memberCount >= 3 ? 'community' : 'heads_up'
}
