import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Battle } from '../types'
import { CATEGORIES } from '../types'
import Stepper from '../components/Stepper'

type RoundWinner = 'mc1' | 'draw' | 'mc2'
type OverallWinner = 'mc1' | 'mc2'

interface RoundScore {
  bars_mc1: number; bars_mc2: number
  personalisierung_mc1: number; personalisierung_mc2: number
  delivery_mc1: number; delivery_mc2: number
  struktur_mc1: number; struktur_mc2: number
  humor_mc1: number; humor_mc2: number
  innovation_mc1: number; innovation_mc2: number
  round_winner: RoundWinner | null
}

interface BattleScore {
  rounds: Record<number, RoundScore>
  overall_winner: OverallWinner | null
}

const defaultRound = (): RoundScore => ({
  bars_mc1: 5, bars_mc2: 5,
  personalisierung_mc1: 5, personalisierung_mc2: 5,
  delivery_mc1: 5, delivery_mc2: 5,
  struktur_mc1: 5, struktur_mc2: 5,
  humor_mc1: 5, humor_mc2: 5,
  innovation_mc1: 5, innovation_mc2: 5,
  round_winner: null,
})

const defaultBattleScore = (): BattleScore => ({
  rounds: { 1: defaultRound(), 2: defaultRound(), 3: defaultRound() },
  overall_winner: null,
})

interface Props {
  user: string
  eventId: string
  onBack: () => void
  onSubmitted: (otherAlreadyDone: boolean) => void
}

export default function ScoreScreen({ user, eventId, onBack, onSubmitted }: Props) {
  const [eventName, setEventName] = useState('')
  const [battles, setBattles] = useState<Battle[]>([])
  const [loading, setLoading] = useState(true)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [scores, setScores] = useState<Record<string, BattleScore>>({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const otherUser: string = user === 'Ben' ? 'Löwe' : 'Ben'

  useEffect(() => {
    async function load() {
      try {
        const [{ data: event }, { data: battlesData }] = await Promise.all([
          supabase.from('events').select('name').eq('id', eventId).single(),
          supabase.from('battles').select('*').eq('event_id', eventId).order('position'),
        ])
        setEventName(event?.name ?? '')
        const list = battlesData ?? []
        setBattles(list)
        const init: Record<string, BattleScore> = {}
        for (const b of list) init[b.id] = defaultBattleScore()
        setScores(init)
      } catch {
        setError('Fehler beim Laden der Battles.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [eventId])

  const setScore = (battleId: string, round: number, field: keyof Omit<RoundScore, 'round_winner'>, value: number) => {
    setScores((prev) => ({
      ...prev,
      [battleId]: {
        ...prev[battleId],
        rounds: {
          ...prev[battleId].rounds,
          [round]: { ...prev[battleId].rounds[round], [field]: value },
        },
      },
    }))
  }

  const setRoundWinner = (battleId: string, round: number, winner: RoundWinner) => {
    setScores((prev) => ({
      ...prev,
      [battleId]: {
        ...prev[battleId],
        rounds: {
          ...prev[battleId].rounds,
          [round]: { ...prev[battleId].rounds[round], round_winner: winner },
        },
      },
    }))
  }

  const setOverallWinner = (battleId: string, winner: OverallWinner) => {
    setScores((prev) => ({
      ...prev,
      [battleId]: { ...prev[battleId], overall_winner: winner },
    }))
  }

  const validateBattle = (battleId: string) => {
    const bs = scores[battleId]
    if (!bs || !bs.overall_winner) return false
    return [1, 2, 3].every((r) => bs.rounds[r]?.round_winner !== null)
  }

  const handleNext = () => {
    const battle = battles[currentIndex]
    if (!validateBattle(battle.id)) {
      setError('Bitte wähle für jede Runde einen Sieger und einen Gesamtsieger.')
      return
    }
    setError(null)
    setCurrentIndex((i) => i + 1)
    window.scrollTo({ top: 0 })
  }

  const handleSubmit = async () => {
    const battle = battles[currentIndex]
    if (!validateBattle(battle.id)) {
      setError('Bitte wähle für jede Runde einen Sieger und einen Gesamtsieger.')
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      for (const b of battles) {
        const bs = scores[b.id]
        for (const round of [1, 2, 3] as const) {
          const rs = bs.rounds[round]
          const { error: e } = await supabase.from('scores').upsert(
            {
              battle_id: b.id, user_name: user, round_number: round,
              bars_mc1: rs.bars_mc1, bars_mc2: rs.bars_mc2,
              personalisierung_mc1: rs.personalisierung_mc1, personalisierung_mc2: rs.personalisierung_mc2,
              delivery_mc1: rs.delivery_mc1, delivery_mc2: rs.delivery_mc2,
              struktur_mc1: rs.struktur_mc1, struktur_mc2: rs.struktur_mc2,
              humor_mc1: rs.humor_mc1, humor_mc2: rs.humor_mc2,
              innovation_mc1: rs.innovation_mc1, innovation_mc2: rs.innovation_mc2,
              round_winner: rs.round_winner,
            },
            { onConflict: 'battle_id,user_name,round_number' }
          )
          if (e) throw e
        }
        const { error: ve } = await supabase.from('battle_verdicts').upsert(
          { battle_id: b.id, user_name: user, overall_winner: bs.overall_winner! },
          { onConflict: 'battle_id,user_name' }
        )
        if (ve) throw ve
      }

      const { data: otherVerdicts } = await supabase
        .from('battle_verdicts')
        .select('battle_id')
        .in('battle_id', battles.map((b) => b.id))
        .eq('user_name', otherUser)

      onSubmitted((otherVerdicts ?? []).length === battles.length)
    } catch {
      setError('Fehler beim Einreichen. Bitte erneut versuchen.')
      setSubmitting(false)
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <p className="text-zinc-600">Lade Battles…</p>
    </div>
  )

  const battle = battles[currentIndex]
  const bs = battle ? scores[battle.id] : null
  if (!battle || !bs) return null

  const isLast = currentIndex === battles.length - 1

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="sticky top-0 bg-black/95 backdrop-blur border-b border-zinc-900 px-4 py-4 z-10">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-zinc-400 text-xl w-8 flex-shrink-0">←</button>
          <div className="flex-1 min-w-0">
            <p className="text-zinc-600 text-xs truncate">{eventName}</p>
            <h1 className="font-black text-base truncate">{battle.mc1} vs {battle.mc2}</h1>
          </div>
          <span className="text-zinc-600 text-sm flex-shrink-0">{currentIndex + 1}/{battles.length}</span>
        </div>
      </div>

      <div className="p-4 pb-32 flex flex-col gap-5">
        {[1, 2, 3].map((round) => {
          const rs = bs.rounds[round]
          return (
            <div key={round} className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 bg-zinc-950 border-b border-zinc-800">
                <h2 className="font-bold text-yellow-400 text-sm">Runde {round}</h2>
              </div>

              {/* MC header row */}
              <div className="px-4 pt-3 pb-1 flex justify-between text-xs text-zinc-500 font-medium">
                <span className="w-[100px] text-center truncate">{battle.mc1}</span>
                <span className="w-[100px] text-center truncate">{battle.mc2}</span>
              </div>

              <div className="px-4 pb-4 flex flex-col gap-4">
                {CATEGORIES.map((cat) => {
                  const mc1Key = `${cat.key}_mc1` as keyof Omit<RoundScore, 'round_winner'>
                  const mc2Key = `${cat.key}_mc2` as keyof Omit<RoundScore, 'round_winner'>
                  return (
                    <div key={cat.key} className="flex flex-col gap-1.5">
                      <span className="text-xs text-zinc-600 text-center">{cat.label}</span>
                      <div className="flex items-center justify-between">
                        <Stepper
                          value={rs[mc1Key] as number}
                          onChange={(v) => setScore(battle.id, round, mc1Key, v)}
                        />
                        <Stepper
                          value={rs[mc2Key] as number}
                          onChange={(v) => setScore(battle.id, round, mc2Key, v)}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Round winner */}
              <div className="px-4 pb-4 border-t border-zinc-800 pt-3">
                <p className="text-xs text-zinc-500 mb-2 text-center">Rundensieger</p>
                <div className="flex gap-2">
                  {(['mc1', 'draw', 'mc2'] as RoundWinner[]).map((w) => (
                    <button
                      key={w}
                      onClick={() => setRoundWinner(battle.id, round, w)}
                      className={`flex-1 py-2.5 rounded-xl text-xs font-semibold transition-colors truncate px-1 ${
                        rs.round_winner === w ? 'bg-yellow-400 text-black' : 'bg-zinc-800 text-zinc-400'
                      }`}
                    >
                      {w === 'mc1' ? battle.mc1 : w === 'mc2' ? battle.mc2 : 'Draw'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )
        })}

        {/* Overall winner */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <h2 className="font-bold text-white text-sm text-center mb-3">Gesamtsieger Battle</h2>
          <div className="flex gap-2">
            {(['mc1', 'mc2'] as OverallWinner[]).map((w) => (
              <button
                key={w}
                onClick={() => setOverallWinner(battle.id, w)}
                className={`flex-1 py-3 rounded-xl font-bold transition-colors text-sm truncate ${
                  bs.overall_winner === w ? 'bg-yellow-400 text-black' : 'bg-zinc-800 text-zinc-400'
                }`}
              >
                {w === 'mc1' ? battle.mc1 : battle.mc2}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="bg-red-900/30 border border-red-800 rounded-xl p-3 text-red-400 text-sm">{error}</div>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-black border-t border-zinc-900">
        {isLast ? (
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full bg-yellow-400 text-black font-black py-4 rounded-2xl text-base disabled:opacity-50 active:scale-95 transition-transform"
          >
            {submitting ? 'Wird eingereicht…' : 'Bewertung einreichen'}
          </button>
        ) : (
          <button
            onClick={handleNext}
            className="w-full bg-zinc-800 text-white font-black py-4 rounded-2xl text-base active:scale-95 transition-transform"
          >
            Nächstes Battle →
          </button>
        )}
      </div>
    </div>
  )
}
