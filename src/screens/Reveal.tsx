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
    <div className="min-h-screen flex items-center justify-center">
      <p className="font-inter text-app-muted text-[10px] uppercase tracking-[0.15em]">Lade Reveal…</p>
    </div>
  )

  return (
    <div className="min-h-screen">
      <div className="sticky top-0 bg-app-bg/90 backdrop-blur border-b border-white/5 px-4 py-4 flex items-center gap-3 z-10 noise-header">
        <button onClick={onBack} className="text-app-muted text-xl w-8">←</button>
        <div>
          <p className="font-inter text-app-muted text-[10px] uppercase tracking-[0.15em]">Reveal</p>
          <h1 className="font-bebas text-xl text-app-text tracking-wider">{eventName}</h1>
        </div>
      </div>

      <div className="p-4 flex flex-col gap-8 pb-10">
        {reveals.map(({ battle, scores, verdicts }) => (
          <div key={battle.id} className="flex flex-col gap-3">
            {/* Battle header */}
            <div className="text-center py-2">
              <p className="font-inter text-app-muted text-[10px] uppercase tracking-[0.15em]">{battle.format}</p>
              <h2 className="font-bebas text-2xl text-primary tracking-wider">{battle.mc1} vs {battle.mc2}</h2>
            </div>

            {[1, 2, 3].map(round => {
              const benR = scores.Ben[round - 1]
              const loeweR = scores.Löwe[round - 1]
              if (!benR || !loeweR) return null
              const winnersAgree = benR.round_winner === loeweR.round_winner

              return (
                <div key={round} className="card rounded-lg overflow-hidden">
                  <div className="px-4 py-2.5 bg-white/5 border-b border-white/5 flex items-center justify-between">
                    <span className="font-bebas text-primary tracking-widest">Runde {round}</span>
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
                          <div className="flex items-center gap-2 mb-1.5">
                            <p className="font-inter text-[10px] uppercase tracking-[0.1em] text-app-muted">{cat.label}</p>
                            {(benDoubled || loeweDoubled) && (
                              <span className="font-bebas text-[10px] text-primary bg-primary/10 px-1.5 rounded tracking-wider">2×</span>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            {/* MC1 row */}
                            <div className="bg-white/5 rounded px-3 py-1.5">
                              <p className="font-inter text-[9px] text-app-muted mb-0.5 truncate">{battle.mc1}</p>
                              <p className="font-inter text-xs">
                                <span className="text-primary font-bold">Ben: {bMc1}</span>
                                <span className="text-app-muted"> · </span>
                                <span className="text-secondary font-bold">Löwe: {lMc1}</span>
                              </p>
                            </div>
                            {/* MC2 row */}
                            <div className="bg-white/5 rounded px-3 py-1.5">
                              <p className="font-inter text-[9px] text-app-muted mb-0.5 truncate">{battle.mc2}</p>
                              <p className="font-inter text-xs">
                                <span className="text-primary font-bold">Ben: {bMc2}</span>
                                <span className="text-app-muted"> · </span>
                                <span className="text-secondary font-bold">Löwe: {lMc2}</span>
                              </p>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Round winner comparison */}
                  <div className={`px-4 py-3 border-t border-white/5 ${winnersAgree ? 'bg-secondary/10' : 'bg-accent/10'}`}>
                    <div className="grid grid-cols-3 items-center text-center">
                      <div>
                        <p className="font-inter text-[9px] text-primary uppercase mb-0.5">Ben</p>
                        <p className="font-bebas text-base text-app-text tracking-wider">{winnerLabel(benR.round_winner, battle.mc1, battle.mc2)}</p>
                      </div>
                      <span className={`font-inter text-[10px] font-bold uppercase tracking-[0.1em] ${winnersAgree ? 'text-secondary' : 'text-accent'}`}>
                        {winnersAgree ? 'Einig ✓' : 'Diskussion!'}
                      </span>
                      <div>
                        <p className="font-inter text-[9px] text-secondary uppercase mb-0.5">Löwe</p>
                        <p className="font-bebas text-base text-app-text tracking-wider">{winnerLabel(loeweR.round_winner, battle.mc1, battle.mc2)}</p>
                      </div>
                    </div>
                  </div>

                  {/* Round comments */}
                  {(benR.round_comment || loeweR.round_comment) && (
                    <div className="px-4 pb-3 pt-3 border-t border-white/5 flex flex-col gap-2">
                      {benR.round_comment && (
                        <div className="bg-white/5 rounded px-3 py-2">
                          <p className="font-inter text-[9px] text-primary uppercase font-bold mb-0.5">Ben</p>
                          <p className="font-inter text-app-muted text-sm">{benR.round_comment}</p>
                        </div>
                      )}
                      {loeweR.round_comment && (
                        <div className="bg-white/5 rounded px-3 py-2">
                          <p className="font-inter text-[9px] text-secondary uppercase font-bold mb-0.5">Löwe</p>
                          <p className="font-inter text-app-muted text-sm">{loeweR.round_comment}</p>
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
                <div className={`card rounded-lg p-4 ${agree ? 'border-secondary/30' : 'border-accent/30'}`}>
                  <p className="font-inter text-[10px] uppercase tracking-[0.15em] text-app-muted text-center mb-3">Gesamtsieger</p>
                  <div className="grid grid-cols-3 items-center text-center">
                    <div>
                      <p className="font-inter text-[9px] text-primary uppercase mb-0.5">Ben</p>
                      <p className="font-bebas text-lg text-app-text tracking-wider">{winnerLabel(verdicts.Ben.overall_winner, battle.mc1, battle.mc2)}</p>
                    </div>
                    <span className={`font-inter text-xs font-bold uppercase tracking-[0.1em] ${agree ? 'text-secondary' : 'text-accent'}`}>
                      {agree ? 'Einig! ✓' : 'Diskussion!'}
                    </span>
                    <div>
                      <p className="font-inter text-[9px] text-secondary uppercase mb-0.5">Löwe</p>
                      <p className="font-bebas text-lg text-app-text tracking-wider">{winnerLabel(verdicts.Löwe.overall_winner, battle.mc1, battle.mc2)}</p>
                    </div>
                  </div>
                </div>
              )
            })()}

            {/* Battle comments */}
            {(verdicts.Ben?.battle_comment || verdicts.Löwe?.battle_comment) && (
              <div className="flex flex-col gap-2">
                <p className="font-inter text-[10px] uppercase tracking-[0.15em] text-app-muted">Battle-Fazit</p>
                {verdicts.Ben?.battle_comment && (
                  <div className="card rounded-lg px-4 py-3">
                    <p className="font-inter text-[9px] text-primary uppercase font-bold mb-1">Ben</p>
                    <p className="font-inter text-app-muted text-sm">{verdicts.Ben.battle_comment}</p>
                  </div>
                )}
                {verdicts.Löwe?.battle_comment && (
                  <div className="card rounded-lg px-4 py-3">
                    <p className="font-inter text-[9px] text-secondary uppercase font-bold mb-1">Löwe</p>
                    <p className="font-inter text-app-muted text-sm">{verdicts.Löwe.battle_comment}</p>
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
