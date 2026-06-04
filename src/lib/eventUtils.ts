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
