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

const winnerLabel = (w: string | null, mc1: string, mc2: string) =>
  w === 'mc1' ? mc1 : w === 'mc2' ? mc2 : w === 'draw' ? 'Draw' : '–'

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
        const ids = (battles ?? []).map(b => b.id)

        const [{ data: allScores }, { data: allVerdicts }] = await Promise.all([
          supabase.from('scores').select('*').in('battle_id', ids),
          supabase.from('battle_verdicts').select('*').in('battle_id', ids),
        ])

        setReveals((battles ?? []).map(battle => ({
          battle,
          scores: {
            Ben: (allScores ?? []).filter(s => s.battle_id === battle.id && s.user_name === 'Ben').sort((a, b) => a.round_number - b.round_number),
            Löwe: (allScores ?? []).filter(s => s.battle_id === battle.id && s.user_name === 'Löwe').sort((a, b) => a.round_number - b.round_number),
          },
          verdicts: {
            Ben: (allVerdicts ?? []).find(v => v.battle_id === battle.id && v.user_name === 'Ben') ?? null,
            Löwe: (allVerdicts ?? []).find(v => v.battle_id === battle.id && v.user_name === 'Löwe') ?? null,
          },
        })))
      } catch { /* stille Fehlerbehandlung */ }
      finally { setLoading(false) }
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
      <div className="sticky top-0 bg-black/95 backdrop-blur border-b border-zinc-800 px-4 py-4 flex items-center gap-3 z-10 noise-header">
        <button onClick={onBack} className="text-zinc-400 text-xl w-8">←</button>
        <div>
          <p className="text-zinc-500 text-xs uppercase tracking-widest">Reveal</p>
          <h1 className="text-lg font-black uppercase tracking-tight">{eventName}</h1>
        </div>
      </div>

      <div className="p-4 flex flex-col gap-8 pb-10">
        {reveals.map(({ battle, scores, verdicts }) => (
          <div key={battle.id} className="flex flex-col gap-3">
            {/* Battle header */}
            <div className="text-center py-2">
              <p className="text-zinc-600 text-xs uppercase tracking-widest">{battle.format}</p>
              <h2 className="text-yellow-400 font-black text-xl uppercase tracking-tight">
                {battle.mc1} vs {battle.mc2}
              </h2>
            </div>

            {[1, 2, 3].map(round => {
              const benR = scores.Ben[round - 1]
              const loeweR = scores.Löwe[round - 1]
              if (!benR || !loeweR) return null
              const winnersAgree = benR.round_winner === loeweR.round_winner

              return (
                <div key={round} className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
                  <div className="px-4 py-2.5 bg-zinc-950 border-b border-zinc-800 flex items-center justify-between">
                    <span className="text-yellow-400 text-xs font-black uppercase tracking-widest">Runde {round}</span>
                  </div>

                  <div className="px-4 py-3 flex flex-col gap-3">
                    {CATEGORIES.map(cat => {
                      const bMc1 = benR[`${cat.key}_mc1` as keyof Score] as number
                      const bMc2 = benR[`${cat.key}_mc2` as keyof Score] as number
                      const lMc1 = loeweR[`${cat.key}_mc1` as keyof Score] as number
                      const lMc2 = loeweR[`${cat.key}_mc2` as keyof Score] as number

                      const benDoubled = benR.double_down_category === cat.key
                      const loeweDoubled = loeweR.double_down_category === cat.key

                      return (
                        <div key={cat.key}>
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-xs font-black uppercase tracking-wider text-zinc-500">{cat.label}</p>
                            {(benDoubled || loeweDoubled) && (
                              <span className="text-xs font-black text-yellow-400 bg-yellow-400/10 px-1.5 rounded">2×</span>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="bg-zinc-800 rounded px-3 py-1.5 text-xs">
                              <span className="text-zinc-500">{battle.mc1}: </span>
                              <span className="text-white font-bold">Ben: {bMc1}</span>
                              <span className="text-zinc-600"> · </span>
                              <span className="text-white font-bold">Löwe: {lMc1}</span>
                            </div>
                            <div className="bg-zinc-800 rounded px-3 py-1.5 text-xs">
                              <span className="text-zinc-500">{battle.mc2}: </span>
                              <span className="text-white font-bold">Ben: {bMc2}</span>
                              <span className="text-zinc-600"> · </span>
                              <span className="text-white font-bold">Löwe: {lMc2}</span>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Round winner */}
                  <div className={`px-4 py-3 border-t border-zinc-800 ${winnersAgree ? 'bg-green-900/20' : 'bg-amber-900/20'}`}>
                    <div className="grid grid-cols-3 items-center text-center">
                      <div>
                        <p className="text-zinc-600 text-xs uppercase mb-0.5">Ben</p>
                        <p className="text-sm font-black text-white">{winnerLabel(benR.round_winner, battle.mc1, battle.mc2)}</p>
                      </div>
                      <span className={`text-xs font-black uppercase tracking-wider ${winnersAgree ? 'text-green-400' : 'text-amber-400'}`}>
                        {winnersAgree ? 'Einig ✓' : 'Diskussion!'}
                      </span>
                      <div>
                        <p className="text-zinc-600 text-xs uppercase mb-0.5">Löwe</p>
                        <p className="text-sm font-black text-white">{winnerLabel(loeweR.round_winner, battle.mc1, battle.mc2)}</p>
                      </div>
                    </div>
                  </div>

                  {/* Round comments */}
                  {(benR.round_comment || loeweR.round_comment) && (
                    <div className="px-4 pb-3 border-t border-zinc-800 pt-3 flex flex-col gap-2">
                      {benR.round_comment && (
                        <div className="bg-zinc-800 rounded px-3 py-2">
                          <p className="text-zinc-500 text-xs uppercase font-bold mb-0.5">Ben</p>
                          <p className="text-zinc-300 text-sm">{benR.round_comment}</p>
                        </div>
                      )}
                      {loeweR.round_comment && (
                        <div className="bg-zinc-800 rounded px-3 py-2">
                          <p className="text-zinc-500 text-xs uppercase font-bold mb-0.5">Löwe</p>
                          <p className="text-zinc-300 text-sm">{loeweR.round_comment}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}

            {/* Overall verdict */}
            {verdicts.Ben && verdicts.Löwe && (() => {
              const agree = verdicts.Ben.overall_winner === verdicts.Löwe.overall_winner
              return (
                <div className={`rounded-lg border p-4 ${agree ? 'bg-green-900/20 border-green-800' : 'bg-amber-900/20 border-amber-700'}`}>
                  <p className="text-xs font-black uppercase tracking-widest text-zinc-500 text-center mb-3">Gesamtsieger</p>
                  <div className="grid grid-cols-3 items-center text-center">
                    <div>
                      <p className="text-zinc-600 text-xs uppercase mb-0.5">Ben</p>
                      <p className="font-black text-white">{winnerLabel(verdicts.Ben.overall_winner, battle.mc1, battle.mc2)}</p>
                    </div>
                    <span className={`text-sm font-black uppercase tracking-wider ${agree ? 'text-green-400' : 'text-amber-400'}`}>
                      {agree ? 'Einig! ✓' : 'Diskussion!'}
                    </span>
                    <div>
                      <p className="text-zinc-600 text-xs uppercase mb-0.5">Löwe</p>
                      <p className="font-black text-white">{winnerLabel(verdicts.Löwe.overall_winner, battle.mc1, battle.mc2)}</p>
                    </div>
                  </div>
                </div>
              )
            })()}

            {/* Battle comments */}
            {(verdicts.Ben?.battle_comment || verdicts.Löwe?.battle_comment) && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-black uppercase tracking-widest text-zinc-600">Battle-Fazit</p>
                {verdicts.Ben?.battle_comment && (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3">
                    <p className="text-zinc-500 text-xs uppercase font-bold mb-1">Ben</p>
                    <p className="text-zinc-300 text-sm">{verdicts.Ben.battle_comment}</p>
                  </div>
                )}
                {verdicts.Löwe?.battle_comment && (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3">
                    <p className="text-zinc-500 text-xs uppercase font-bold mb-1">Löwe</p>
                    <p className="text-zinc-300 text-sm">{verdicts.Löwe.battle_comment}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
