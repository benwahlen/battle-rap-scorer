import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Battle, Score, BattleVerdict, UserName } from '../types'
import { CATEGORIES } from '../types'

interface BattleReveal {
  battle: Battle
  scores: { Ben: Score[]; Löwe: Score[] }
  verdicts: { Ben: BattleVerdict | null; Löwe: BattleVerdict | null }
}

interface Props {
  user: UserName
  eventId: string
  onBack: () => void
}

const winnerLabel = (winner: string | null, mc1: string, mc2: string) => {
  if (winner === 'mc1') return mc1
  if (winner === 'mc2') return mc2
  if (winner === 'draw') return 'Draw'
  return '–'
}

export default function Reveal({ user: _user, eventId, onBack }: Props) {
  const [eventName, setEventName] = useState('')
  const [reveals, setReveals] = useState<BattleReveal[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const [{ data: event }, { data: battles }] = await Promise.all([
          supabase.from('events').select('name').eq('id', eventId).single(),
          supabase.from('battles').select('*').eq('event_id', eventId).order('position'),
        ])
        setEventName(event?.name ?? '')
        const ids = (battles ?? []).map((b) => b.id)

        const [{ data: allScores }, { data: allVerdicts }] = await Promise.all([
          supabase.from('scores').select('*').in('battle_id', ids),
          supabase.from('battle_verdicts').select('*').in('battle_id', ids),
        ])

        setReveals(
          (battles ?? []).map((battle) => ({
            battle,
            scores: {
              Ben: (allScores ?? [])
                .filter((s) => s.battle_id === battle.id && s.user_name === 'Ben')
                .sort((a, b) => a.round_number - b.round_number),
              Löwe: (allScores ?? [])
                .filter((s) => s.battle_id === battle.id && s.user_name === 'Löwe')
                .sort((a, b) => a.round_number - b.round_number),
            },
            verdicts: {
              Ben: (allVerdicts ?? []).find((v) => v.battle_id === battle.id && v.user_name === 'Ben') ?? null,
              Löwe: (allVerdicts ?? []).find((v) => v.battle_id === battle.id && v.user_name === 'Löwe') ?? null,
            },
          }))
        )
      } catch {
        // stille Fehlerbehandlung
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [eventId])

  if (loading) return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <p className="text-zinc-600">Lade Reveal…</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="sticky top-0 bg-black/95 backdrop-blur border-b border-zinc-900 px-4 py-4 flex items-center gap-3 z-10">
        <button onClick={onBack} className="text-zinc-400 text-xl w-8">←</button>
        <div>
          <h1 className="text-xl font-black">Reveal</h1>
          <p className="text-zinc-500 text-xs">{eventName}</p>
        </div>
      </div>

      <div className="p-4 flex flex-col gap-8 pb-10">
        {reveals.map(({ battle, scores, verdicts }) => (
          <div key={battle.id} className="flex flex-col gap-3">
            <h2 className="text-yellow-400 font-black text-lg text-center">
              {battle.mc1} vs {battle.mc2}
              <span className="text-zinc-600 font-normal text-sm ml-2">({battle.format})</span>
            </h2>

            {[1, 2, 3].map((round) => {
              const benR = scores.Ben[round - 1]
              const loeweR = scores.Löwe[round - 1]
              if (!benR || !loeweR) return null

              const roundAgree = benR.round_winner === loeweR.round_winner

              return (
                <div key={round} className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
                  <div className="px-4 py-2.5 bg-zinc-950 border-b border-zinc-800 flex items-center justify-between">
                    <span className="text-yellow-400 text-sm font-bold">Runde {round}</span>
                  </div>

                  {/* Column headers */}
                  <div className="grid grid-cols-3 px-4 pt-3 pb-1 text-xs text-zinc-500 text-center">
                    <span>Ben</span>
                    <span>Kategorie</span>
                    <span>Löwe</span>
                  </div>

                  <div className="px-4 pb-3 flex flex-col gap-3">
                    {CATEGORIES.map((cat) => {
                      const bMc1 = benR[`${cat.key}_mc1` as keyof Score] as number
                      const bMc2 = benR[`${cat.key}_mc2` as keyof Score] as number
                      const lMc1 = loeweR[`${cat.key}_mc1` as keyof Score] as number
                      const lMc2 = loeweR[`${cat.key}_mc2` as keyof Score] as number
                      const scoresMatch = bMc1 === lMc1 && bMc2 === lMc2

                      return (
                        <div key={cat.key}>
                          <p className="text-xs text-zinc-600 text-center mb-1">{cat.label}</p>
                          <div className={`grid grid-cols-3 text-center items-center rounded-lg py-1 ${scoresMatch ? 'bg-zinc-800/50' : ''}`}>
                            <span className="font-mono text-sm text-white">
                              {bMc1}<span className="text-zinc-600">/</span>{bMc2}
                            </span>
                            <span className="text-zinc-600 text-xs">{battle.mc1}/{battle.mc2}</span>
                            <span className="font-mono text-sm text-white">
                              {lMc1}<span className="text-zinc-600">/</span>{lMc2}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Round winner */}
                  <div className={`px-4 py-3 border-t border-zinc-800 ${roundAgree ? 'bg-green-900/20' : 'bg-amber-900/20'}`}>
                    <div className="grid grid-cols-3 items-center text-center">
                      <span className="text-sm font-semibold text-white">
                        {winnerLabel(benR.round_winner, battle.mc1, battle.mc2)}
                      </span>
                      <span className={`text-xs font-bold ${roundAgree ? 'text-green-400' : 'text-amber-400'}`}>
                        {roundAgree ? 'Einig ✓' : 'Diskussion!'}
                      </span>
                      <span className="text-sm font-semibold text-white">
                        {winnerLabel(loeweR.round_winner, battle.mc1, battle.mc2)}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}

            {/* Overall verdict */}
            {verdicts.Ben && verdicts.Löwe && (() => {
              const agree = verdicts.Ben.overall_winner === verdicts.Löwe.overall_winner
              return (
                <div className={`rounded-2xl p-4 border ${agree ? 'bg-green-900/20 border-green-800' : 'bg-amber-900/20 border-amber-700'}`}>
                  <p className="text-xs text-zinc-500 text-center mb-3 font-medium uppercase tracking-wider">Gesamtsieger</p>
                  <div className="grid grid-cols-3 items-center text-center">
                    <div>
                      <p className="text-xs text-zinc-500 mb-1">Ben</p>
                      <p className="font-black text-white">{winnerLabel(verdicts.Ben.overall_winner, battle.mc1, battle.mc2)}</p>
                    </div>
                    <span className={`text-sm font-black ${agree ? 'text-green-400' : 'text-amber-400'}`}>
                      {agree ? 'Einig! ✓' : 'Diskussion!'}
                    </span>
                    <div>
                      <p className="text-xs text-zinc-500 mb-1">Löwe</p>
                      <p className="font-black text-white">{winnerLabel(verdicts.Löwe.overall_winner, battle.mc1, battle.mc2)}</p>
                    </div>
                  </div>
                </div>
              )
            })()}
          </div>
        ))}
      </div>
    </div>
  )
}
