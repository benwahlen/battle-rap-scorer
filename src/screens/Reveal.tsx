import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Battle, Score, BattleVerdict } from '../types'
import { CATEGORIES } from '../types'

interface BattleReveal {
  battle: Battle
  userNames: string[]                       // all users who scored, in order
  scores: Record<string, Score[]>           // keyed by user_name
  verdicts: Record<string, BattleVerdict>   // keyed by user_name
}

interface Props {
  displayName: string
  eventId: string
  onBack: () => void
}

const winnerLabel = (w: string | null, mc1: string, mc2: string) =>
  w === 'mc1' ? mc1 : w === 'mc2' ? mc2 : w === 'draw' ? 'Draw' : '–'

// Color for each user slot: first = primary, second = secondary, rest = accent
const USER_COLORS = ['text-primary', 'text-secondary', 'text-accent']
const USER_BG_COLORS = ['bg-primary/20', 'bg-secondary/20', 'bg-accent/20']

export default function Reveal({ displayName, eventId, onBack }: Props) {
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
        const ids = (battles ?? []).map((b: Battle) => b.id)

        const [{ data: allScores }, { data: allVerdicts }] = await Promise.all([
          supabase.from('scores').select('*').in('battle_id', ids),
          supabase.from('battle_verdicts').select('*').in('battle_id', ids),
        ])

        setReveals((battles ?? []).map((battle: Battle) => {
          const bScores: Score[] = (allScores ?? []).filter((s: Score) => s.battle_id === battle.id)
          const bVerdicts: BattleVerdict[] = (allVerdicts ?? []).filter((v: BattleVerdict) => v.battle_id === battle.id)

          // Collect unique user names — put current user first
          const allNames = [...new Set(bVerdicts.map((v: BattleVerdict) => v.user_name))]
          const userNames = [
            displayName,
            ...allNames.filter(n => n !== displayName),
          ].filter(n => allNames.includes(n))

          const scores: Record<string, Score[]> = {}
          const verdicts: Record<string, BattleVerdict> = {}
          for (const name of userNames) {
            scores[name] = bScores.filter((s: Score) => s.user_name === name).sort((a, b) => a.round_number - b.round_number)
            const v = bVerdicts.find((v: BattleVerdict) => v.user_name === name)
            if (v) verdicts[name] = v
          }
          return { battle, userNames, scores, verdicts }
        }))
      } catch { /* stille Fehlerbehandlung */ }
      finally { setLoading(false) }
    }
    load()
  }, [eventId, displayName])

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
        {reveals.map(({ battle, userNames, scores, verdicts }) => (
          <div key={battle.id} className="flex flex-col gap-3">
            {/* Battle header */}
            <div className="text-center py-2">
              <p className="font-inter text-app-muted text-[10px] uppercase tracking-[0.15em]">{battle.format}</p>
              <h2 className="font-bebas text-2xl text-primary tracking-wider">{battle.mc1} vs {battle.mc2}</h2>
            </div>

            {/* User legend */}
            <div className="flex gap-2 justify-center">
              {userNames.map((name, idx) => (
                <span key={name} className={`font-inter text-[10px] px-2.5 py-1 rounded uppercase tracking-[0.1em] font-bold ${USER_BG_COLORS[idx] ?? 'bg-white/10'} ${USER_COLORS[idx] ?? 'text-app-muted'}`}>
                  {name}
                </span>
              ))}
            </div>

            {[1, 2, 3].map(round => {
              const roundScores = userNames.map(name => scores[name]?.[round - 1])
              if (roundScores.every(s => !s)) return null
              const roundWinners = userNames.map(name => scores[name]?.[round - 1]?.round_winner ?? null)
              const allAgree = roundWinners.every(w => w === roundWinners[0])

              return (
                <div key={round} className="card rounded-lg overflow-hidden">
                  <div className="px-4 py-2.5 bg-white/5 border-b border-white/5">
                    <span className="font-bebas text-primary tracking-widest">Runde {round}</span>
                  </div>

                  <div className="px-4 py-3 flex flex-col gap-3">
                    {CATEGORIES.map(cat => {
                      return (
                        <div key={cat.key}>
                          <div className="flex items-center gap-2 mb-1.5">
                            <p className="font-inter text-[10px] uppercase tracking-[0.1em] text-app-muted">{cat.label}</p>
                            {userNames.some(n => scores[n]?.[round - 1]?.double_down_category === cat.key) && (
                              <span className="font-bebas text-[10px] text-primary bg-primary/10 px-1.5 rounded tracking-wider">2×</span>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            {/* MC1 */}
                            <div className="bg-white/5 rounded px-3 py-2">
                              <p className="font-inter text-[9px] text-app-muted mb-1 truncate">{battle.mc1}</p>
                              <div className="flex items-baseline gap-2 flex-wrap">
                                {userNames.map((name, idx) => {
                                  const s = scores[name]?.[round - 1]
                                  if (!s) return null
                                  const myVal = s[`${cat.key}_mc1` as keyof Score] as number
                                  const otherVals = userNames
                                    .filter(n => n !== name)
                                    .map(n => scores[n]?.[round - 1]?.[`${cat.key}_mc1` as keyof Score] as number ?? 0)
                                  const isLeading = otherVals.every(v => myVal >= v)
                                  return (
                                    <span key={name}>
                                      <span className="font-inter text-[10px] text-app-muted">{name} </span>
                                      <span className={`font-bebas text-[22px] leading-none ${isLeading ? USER_COLORS[idx] ?? 'text-app-text' : 'text-[#444]'}`}>{myVal}</span>
                                    </span>
                                  )
                                })}
                              </div>
                            </div>
                            {/* MC2 */}
                            <div className="bg-white/5 rounded px-3 py-2">
                              <p className="font-inter text-[9px] text-app-muted mb-1 truncate">{battle.mc2}</p>
                              <div className="flex items-baseline gap-2 flex-wrap">
                                {userNames.map((name, idx) => {
                                  const s = scores[name]?.[round - 1]
                                  if (!s) return null
                                  const myVal = s[`${cat.key}_mc2` as keyof Score] as number
                                  const otherVals = userNames
                                    .filter(n => n !== name)
                                    .map(n => scores[n]?.[round - 1]?.[`${cat.key}_mc2` as keyof Score] as number ?? 0)
                                  const isLeading = otherVals.every(v => myVal >= v)
                                  return (
                                    <span key={name}>
                                      <span className="font-inter text-[10px] text-app-muted">{name} </span>
                                      <span className={`font-bebas text-[22px] leading-none ${isLeading ? USER_COLORS[idx] ?? 'text-app-text' : 'text-[#444]'}`}>{myVal}</span>
                                    </span>
                                  )
                                })}
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Round winners */}
                  <div className={`px-4 py-3 border-t border-white/5 ${allAgree ? 'bg-secondary/10' : 'bg-accent/10'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex gap-3 flex-wrap">
                        {userNames.map((name, idx) => (
                          <div key={name}>
                            <p className={`font-inter text-[9px] uppercase mb-0.5 ${USER_COLORS[idx] ?? 'text-app-muted'}`}>{name}</p>
                            <p className="font-bebas text-base text-app-text tracking-wider">
                              {winnerLabel(roundWinners[idx], battle.mc1, battle.mc2)}
                            </p>
                          </div>
                        ))}
                      </div>
                      <span className={`font-inter text-[10px] font-bold uppercase tracking-[0.1em] flex-shrink-0 ${allAgree ? 'text-secondary' : 'text-accent'}`}>
                        {allAgree ? 'Einig ✓' : 'Diskussion!'}
                      </span>
                    </div>
                  </div>

                  {/* Round comments */}
                  {userNames.some(name => scores[name]?.[round - 1]?.round_comment) && (
                    <div className="px-4 pb-3 pt-3 border-t border-white/5 flex flex-col gap-2">
                      {userNames.map((name, idx) => {
                        const comment = scores[name]?.[round - 1]?.round_comment
                        if (!comment) return null
                        return (
                          <div key={name} className="bg-white/5 rounded px-3 py-2">
                            <p className={`font-inter text-[9px] uppercase font-bold mb-0.5 ${USER_COLORS[idx] ?? 'text-app-muted'}`}>{name}</p>
                            <p className="font-inter text-app-muted text-sm">{comment}</p>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}

            {/* Overall verdict */}
            {userNames.length >= 2 && userNames.every(n => verdicts[n]) && (() => {
              const allWinners = userNames.map(n => verdicts[n].overall_winner)
              const agree = allWinners.every(w => w === allWinners[0])
              return (
                <div className={`card rounded-lg p-4 ${agree ? 'border-secondary/30' : 'border-accent/30'}`}>
                  <p className="font-inter text-[10px] uppercase tracking-[0.15em] text-app-muted text-center mb-3">Gesamtsieger</p>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex gap-4 flex-wrap">
                      {userNames.map((name, idx) => (
                        <div key={name}>
                          <p className={`font-inter text-[9px] uppercase mb-0.5 ${USER_COLORS[idx] ?? 'text-app-muted'}`}>{name}</p>
                          <p className="font-bebas text-lg text-app-text tracking-wider">
                            {winnerLabel(verdicts[name].overall_winner, battle.mc1, battle.mc2)}
                          </p>
                        </div>
                      ))}
                    </div>
                    <span className={`font-inter text-xs font-bold uppercase tracking-[0.1em] flex-shrink-0 ${agree ? 'text-secondary' : 'text-accent'}`}>
                      {agree ? 'Einig! ✓' : 'Diskussion!'}
                    </span>
                  </div>
                </div>
              )
            })()}

            {/* Battle comments */}
            {userNames.some(n => verdicts[n]?.battle_comment) && (
              <div className="flex flex-col gap-2">
                <p className="font-inter text-[10px] uppercase tracking-[0.15em] text-app-muted">Battle-Fazit</p>
                {userNames.map((name, idx) => {
                  const comment = verdicts[name]?.battle_comment
                  if (!comment) return null
                  return (
                    <div key={name} className="card rounded-lg px-4 py-3">
                      <p className={`font-inter text-[9px] uppercase font-bold mb-1 ${USER_COLORS[idx] ?? 'text-app-muted'}`}>{name}</p>
                      <p className="font-inter text-app-muted text-sm">{comment}</p>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
