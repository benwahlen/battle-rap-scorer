import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Battle, Score, BattleVerdict } from '../types'
import { CATEGORIES } from '../types'

interface BattleReveal {
  battle: Battle
  userNames: string[]
  scores: Record<string, Score[]>
  verdicts: Record<string, BattleVerdict>
}

const winnerLabel = (w: string | null, mc1: string, mc2: string) =>
  w === 'mc1' ? mc1 : w === 'mc2' ? mc2 : w === 'draw' ? 'Draw' : '–'

const CAT_LABEL_STYLE: React.CSSProperties = {
  color: '#C0B8E8', fontSize: '10px', fontWeight: 700,
  letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: 'Inter, sans-serif',
}

export default function Reveal() {
  const { roomId, eventId } = useParams<{ roomId: string; eventId: string }>()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const displayName = profile?.display_name ?? ''
  const [eventName, setEventName] = useState('')
  const [reveals, setReveals] = useState<BattleReveal[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedRounds, setExpandedRounds] = useState<Set<string>>(new Set())

  const toggleRound = (key: string) => setExpandedRounds(prev => {
    const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s
  })

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
          const allNames = [...new Set(bVerdicts.map((v: BattleVerdict) => v.user_name))]
          const userNames = [displayName, ...allNames.filter(n => n !== displayName)].filter(n => allNames.includes(n))
          const scores: Record<string, Score[]> = {}
          const verdicts: Record<string, BattleVerdict> = {}
          for (const name of userNames) {
            scores[name] = bScores.filter((s: Score) => s.user_name === name).sort((a, b) => a.round_number - b.round_number)
            const v = bVerdicts.find((v: BattleVerdict) => v.user_name === name)
            if (v) verdicts[name] = v
          }
          return { battle, userNames, scores, verdicts }
        }))
      } catch { /* silent */ }
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
        <button onClick={() => navigate(roomId ? `/room/${roomId}` : '/')} className="text-app-muted text-xl w-8 flex-shrink-0">←</button>
        <div className="flex-1 min-w-0">
          <p className="font-inter text-app-muted text-[10px] uppercase tracking-[0.15em]">Reveal</p>
          <h1 className="font-bebas text-xl text-app-text tracking-wider truncate">{eventName}</h1>
        </div>
      </div>

      <div className="p-4 flex flex-col gap-8 pb-10">
        {reveals.map(({ battle, userNames, scores, verdicts }) => {
          const user0 = userNames[0] ?? ''
          const user1 = userNames[1] ?? ''

          return (
            <div key={battle.id} className="flex flex-col gap-3">

              {/* ── Battle Header ──────────────────────────────────────────── */}
              <div className="flex flex-col items-center gap-2 py-1">
                <p className="font-inter text-app-muted text-[10px] uppercase tracking-[0.15em]">{battle.format}</p>
                <h2 className="font-bebas text-2xl text-app-text tracking-wider text-center leading-tight">
                  {battle.mc1} vs {battle.mc2}
                </h2>
                <div className="flex gap-2">
                  {userNames.map((name, idx) => (
                    <span key={name} className={`font-inter text-[10px] px-3 py-1 rounded-full font-bold uppercase tracking-[0.08em] ${
                      idx === 0 ? 'bg-primary/20 text-primary' : 'bg-secondary/20 text-secondary'
                    }`}>
                      {name}
                    </span>
                  ))}
                </div>
              </div>

              {/* ── Rounds ────────────────────────────────────────────────── */}
              {[1, 2, 3].map(round => {
                const roundScores = userNames.map(name => scores[name]?.[round - 1])
                if (roundScores.every(s => !s)) return null
                const roundWinners = userNames.map(name => scores[name]?.[round - 1]?.round_winner ?? null)
                const allAgree = roundWinners.length >= 2 && roundWinners[0] !== null && roundWinners.every(w => w === roundWinners[0])
                const roundKey = `${battle.id}_${round}`
                const isExpanded = expandedRounds.has(roundKey)

                const allRoundScores = userNames.map(n => scores[n]?.[round - 1]).filter(Boolean) as Score[]
                const mc1Avg = allRoundScores.length === 0 ? 0 :
                  CATEGORIES.reduce((sum, cat) => sum + allRoundScores.reduce((s, rs) => s + ((rs[`${cat.key}_mc1` as keyof Score] as number) || 0), 0), 0) /
                  (allRoundScores.length * CATEGORIES.length)
                const mc2Avg = allRoundScores.length === 0 ? 0 :
                  CATEGORIES.reduce((sum, cat) => sum + allRoundScores.reduce((s, rs) => s + ((rs[`${cat.key}_mc2` as keyof Score] as number) || 0), 0), 0) /
                  (allRoundScores.length * CATEGORIES.length)

                return (
                  <div key={round} className="card rounded-lg overflow-hidden">
                    {/* Collapsed header */}
                    <button onClick={() => toggleRound(roundKey)}
                      className="w-full px-4 pt-3 pb-2.5 text-left active:bg-white/5 transition-colors">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-bebas text-primary tracking-widest text-base leading-tight mb-1.5">Runde {round}</p>
                          <div className="flex flex-col gap-0.5">
                            {userNames.map((name, idx) => (
                              <p key={name} className="font-inter text-[11px] leading-snug">
                                <span className={`font-bold ${idx === 0 ? 'text-primary' : 'text-secondary'}`}>{name}</span>
                                <span className="text-app-muted/50"> → </span>
                                <span className="text-app-text">{winnerLabel(roundWinners[idx], battle.mc1, battle.mc2)}</span>
                              </p>
                            ))}
                          </div>
                          <p className="font-inter text-[10px] text-app-muted/50 mt-1.5">
                            Ø {battle.mc1}: {mc1Avg.toFixed(1)} · {battle.mc2}: {mc2Avg.toFixed(1)}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1.5 flex-shrink-0 pt-0.5">
                          <span className={`font-inter text-[10px] font-bold px-2.5 py-0.5 rounded uppercase tracking-[0.08em] ${
                            allAgree ? 'bg-secondary/15 text-secondary' : 'bg-accent/15 text-accent'
                          }`}>
                            {allAgree ? 'Einig ✓' : 'Diskussion'}
                          </span>
                          <span className="text-app-muted/60 text-xs">{isExpanded ? '▲' : '▾'}</span>
                        </div>
                      </div>
                    </button>

                    {/* Expanded: categories */}
                    {isExpanded && (() => {
                      const s0 = scores[user0]?.[round - 1]
                      const s1 = scores[user1]?.[round - 1]
                      return (
                        <div className="border-t border-white/5 px-4 pt-3 pb-3 flex flex-col gap-3">
                          {CATEGORIES.map(cat => {
                            const mc1Key = `${cat.key}_mc1` as keyof Score
                            const mc2Key = `${cat.key}_mc2` as keyof Score
                            const v0mc1 = s0 ? (s0[mc1Key] as number) : 0
                            const v1mc1 = s1 ? (s1[mc1Key] as number) : 0
                            const v0mc2 = s0 ? (s0[mc2Key] as number) : 0
                            const v1mc2 = s1 ? (s1[mc2Key] as number) : 0
                            const isDoubled = userNames.some(n => scores[n]?.[round - 1]?.double_down_category === cat.key)

                            return (
                              <div key={cat.key}>
                                <div className="flex items-center gap-2 mb-1.5">
                                  <p style={CAT_LABEL_STYLE}>{cat.label}</p>
                                  {isDoubled && (
                                    <span className="font-bebas text-[10px] text-primary bg-primary/10 px-1.5 rounded tracking-wider">2×</span>
                                  )}
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  {/* User0 (Ben) — Lila */}
                                  <div className="bg-white/5 rounded-lg px-3 py-2">
                                    <p className="font-inter text-[9px] text-primary font-bold uppercase tracking-[0.05em] mb-2">{user0}</p>
                                    <div className="flex justify-around">
                                      <div className="text-center">
                                        <p className="font-inter text-[8px] text-app-muted/50 mb-0.5 truncate max-w-[52px]">{battle.mc1}</p>
                                        <span className={`font-bebas text-[18px] leading-none ${
                                          v0mc1 > v1mc1 ? 'text-primary' : v0mc1 === v1mc1 ? 'text-[#6B6B8A]' : 'text-[#3A3A4A]'
                                        }`}>{v0mc1 || '–'}</span>
                                      </div>
                                      <span className="text-app-muted/20 text-sm self-end mb-0.5">·</span>
                                      <div className="text-center">
                                        <p className="font-inter text-[8px] text-app-muted/50 mb-0.5 truncate max-w-[52px]">{battle.mc2}</p>
                                        <span className={`font-bebas text-[18px] leading-none ${
                                          v0mc2 > v1mc2 ? 'text-primary' : v0mc2 === v1mc2 ? 'text-[#6B6B8A]' : 'text-[#3A3A4A]'
                                        }`}>{v0mc2 || '–'}</span>
                                      </div>
                                    </div>
                                  </div>
                                  {/* User1 (anderer) — Cyan */}
                                  <div className="bg-white/5 rounded-lg px-3 py-2">
                                    <p className="font-inter text-[9px] text-secondary font-bold uppercase tracking-[0.05em] mb-2">{user1 || '–'}</p>
                                    <div className="flex justify-around">
                                      <div className="text-center">
                                        <p className="font-inter text-[8px] text-app-muted/50 mb-0.5 truncate max-w-[52px]">{battle.mc1}</p>
                                        <span className={`font-bebas text-[18px] leading-none ${
                                          v1mc1 > v0mc1 ? 'text-secondary' : v1mc1 === v0mc1 ? 'text-[#6B6B8A]' : 'text-[#3A3A4A]'
                                        }`}>{v1mc1 || '–'}</span>
                                      </div>
                                      <span className="text-app-muted/20 text-sm self-end mb-0.5">·</span>
                                      <div className="text-center">
                                        <p className="font-inter text-[8px] text-app-muted/50 mb-0.5 truncate max-w-[52px]">{battle.mc2}</p>
                                        <span className={`font-bebas text-[18px] leading-none ${
                                          v1mc2 > v0mc2 ? 'text-secondary' : v1mc2 === v0mc2 ? 'text-[#6B6B8A]' : 'text-[#3A3A4A]'
                                        }`}>{v1mc2 || '–'}</span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )
                    })()}
                  </div>
                )
              })}

              {/* ── Gesamtsieger ───────────────────────────────────────────── */}
              {userNames.length >= 2 && userNames.every(n => verdicts[n]) && (() => {
                const allWinners = userNames.map(n => verdicts[n].overall_winner)
                const agree = allWinners.every(w => w === allWinners[0])
                return (
                  <div className="flex flex-col gap-2 mt-1">
                    <p className="font-inter text-[10px] uppercase tracking-[0.15em] text-app-muted text-center">Gesamtsieger</p>
                    <div className="grid grid-cols-2 gap-2">
                      {userNames.map((name, idx) => (
                        <div key={name} className={`rounded-lg p-4 text-center ${
                          idx === 0 ? 'bg-primary/10 border border-primary/25' : 'bg-secondary/10 border border-secondary/25'
                        }`}>
                          <p className={`font-inter text-[9px] uppercase font-bold tracking-[0.08em] mb-1 ${
                            idx === 0 ? 'text-primary' : 'text-secondary'
                          }`}>{name}</p>
                          <p className={`font-bebas text-xl tracking-wider leading-tight ${
                            idx === 0 ? 'text-primary' : 'text-secondary'
                          }`}>
                            {winnerLabel(verdicts[name].overall_winner, battle.mc1, battle.mc2)}
                          </p>
                        </div>
                      ))}
                    </div>
                    <div className="text-center">
                      <span className={`font-inter text-[10px] font-bold uppercase tracking-[0.1em] px-3 py-1 rounded ${
                        agree ? 'bg-secondary/15 text-secondary' : 'bg-accent/15 text-accent'
                      }`}>
                        {agree ? 'Einig ✓' : 'Diskussion'}
                      </span>
                    </div>
                  </div>
                )
              })()}

              {/* ── Battle-Fazit ───────────────────────────────────────────── */}
              {userNames.some(n => verdicts[n]?.battle_comment) && (
                <div className="flex flex-col gap-2">
                  <p className="font-inter text-[10px] uppercase tracking-[0.15em] text-app-muted">Battle-Fazit</p>
                  {userNames.map((name, idx) => {
                    const comment = verdicts[name]?.battle_comment
                    if (!comment) return null
                    return (
                      <div key={name} className="card rounded-lg px-4 py-3">
                        <p className={`font-inter text-[9px] uppercase font-bold mb-1 ${idx === 0 ? 'text-primary' : 'text-secondary'}`}>{name}</p>
                        <p className="font-inter text-app-muted text-sm">{comment}</p>
                      </div>
                    )
                  })}
                </div>
              )}

            </div>
          )
        })}
      </div>
    </div>
  )
}
