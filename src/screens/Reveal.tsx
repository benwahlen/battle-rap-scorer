import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Battle, Score, BattleVerdict } from '../types'
import { CATEGORIES } from '../types'

// ── Farben ───────────────────────────────────────────────────────────────────
const C_BEN    = '#A855F7'  // Lila
const C_OTHER  = '#06B6D4'  // Cyan
const C_AGREE_BG   = 'rgba(6,182,212,0.12)'
const C_DIS_BG     = 'rgba(236,72,153,0.12)'
const C_EQUAL  = '#2A2A4A'
const C_DIM    = '#3A3A5A'
const C_CAT    = '#C0B8E8'

// ── Typen ────────────────────────────────────────────────────────────────────
interface BattleReveal {
  battle: Battle
  userNames: string[]
  scores: Record<string, Score[]>
  verdicts: Record<string, BattleVerdict>
}

const winnerLabel = (w: string | null, mc1: string, mc2: string) =>
  w === 'mc1' ? mc1 : w === 'mc2' ? mc2 : w === 'draw' ? 'Draw' : '–'

function roundAvgForMC(roundScores: (Score | undefined)[], mc: 'mc1' | 'mc2') {
  const valid = roundScores.filter(Boolean) as Score[]
  if (!valid.length) return 0
  const sum = valid.reduce((s, rs) =>
    s + CATEGORIES.reduce((cs, cat) => cs + ((rs[`${cat.key}_${mc}` as keyof Score] as number) || 0), 0), 0)
  return sum / (valid.length * CATEGORIES.length)
}

// ── AgreeDisagree Badge ───────────────────────────────────────────────────────
function AgreeBadge({ agree }: { agree: boolean }) {
  return (
    <span style={{
      display: 'inline-block',
      fontSize: '10px', fontWeight: 700, fontFamily: 'Inter, sans-serif',
      textTransform: 'uppercase', letterSpacing: '0.08em',
      padding: '2px 10px', borderRadius: '999px',
      border: `1px solid ${agree ? C_AGREE_BG.replace('0.12', '0.5') : C_DIS_BG.replace('0.12', '0.5')}`,
      backgroundColor: agree ? 'rgba(6,182,212,0.12)' : 'rgba(236,72,153,0.12)',
      color: agree ? C_OTHER : '#EC4899',
    }}>
      {agree ? 'Einig ✓' : 'Diskussion'}
    </span>
  )
}

// ── Hauptkomponente ───────────────────────────────────────────────────────────
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

        const revealData: BattleReveal[] = (battles ?? []).map((battle: Battle) => {
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
        })

        setReveals(revealData)
        // Runde 1 pro Battle offen starten
        setExpandedRounds(new Set(revealData.map(r => `${r.battle.id}_1`)))
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
      {/* Header */}
      <div className="sticky top-0 bg-app-bg/90 backdrop-blur border-b border-white/5 px-4 py-4 flex items-center gap-3 z-10 noise-header">
        <button onClick={() => navigate(roomId ? `/room/${roomId}` : '/')} className="text-app-muted text-xl w-8 flex-shrink-0">←</button>
        <div className="flex-1 min-w-0">
          <p className="font-inter text-app-muted text-[10px] uppercase tracking-[0.15em]">Reveal</p>
          <h1 className="font-bebas text-xl text-app-text tracking-wider truncate">{eventName}</h1>
        </div>
      </div>

      <div className="p-4 flex flex-col gap-10 pb-10">
        {reveals.map(({ battle, userNames, scores, verdicts }) => {
          const u0 = userNames[0] ?? ''  // Ben — Lila
          const u1 = userNames[1] ?? ''  // Anderer — Cyan
          const hasTwo = !!u0 && !!u1 && !!verdicts[u0] && !!verdicts[u1]
          const overallAgree = hasTwo && verdicts[u0].overall_winner === verdicts[u1].overall_winner

          return (
            <div key={battle.id} className="flex flex-col gap-4">

              {/* ── Battle-Header ──────────────────────────────────────── */}
              <div className="text-center">
                <span style={{ color: '#666', fontSize: '10px', fontFamily: 'Inter, sans-serif',
                  textTransform: 'uppercase', letterSpacing: '0.15em' }}>{battle.format}</span>
                <h2 className="font-bebas tracking-wider leading-tight mt-0.5"
                  style={{ fontSize: '28px', color: '#F1F0FF' }}>
                  {battle.mc1} vs {battle.mc2}
                </h2>
              </div>

              {/* ── Gesamtsieger ───────────────────────────────────────── */}
              {hasTwo && (
                <div className="rounded-xl p-4 border border-white/8"
                  style={{ background: `linear-gradient(135deg, ${overallAgree ? C_AGREE_BG : C_DIS_BG}, rgba(168,85,247,0.06))` }}>
                  <p style={{ color: '#888', fontSize: '10px', fontFamily: 'Inter, sans-serif',
                    textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center', marginBottom: '12px' }}>
                    Gesamtsieger
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {[u0, u1].map((name, idx) => {
                      const winner = verdicts[name]?.overall_winner
                      const color = idx === 0 ? C_BEN : C_OTHER
                      return (
                        <div key={name} className="rounded-lg py-4 px-3 text-center"
                          style={{ background: `${color}14`, border: `1px solid ${color}30` }}>
                          <p style={{ color, fontSize: '9px', fontWeight: 700,
                            fontFamily: 'Inter, sans-serif', textTransform: 'uppercase',
                            letterSpacing: '0.08em', marginBottom: '6px' }}>{name}</p>
                          <p className="font-bebas tracking-wider leading-tight"
                            style={{ color, fontSize: '20px' }}>
                            {winnerLabel(winner, battle.mc1, battle.mc2)}
                          </p>
                        </div>
                      )
                    })}
                  </div>
                  <div className="flex justify-center mt-3">
                    <AgreeBadge agree={overallAgree} />
                  </div>
                </div>
              )}

              {/* ── Runden im Detail ───────────────────────────────────── */}
              <p style={{ color: C_CAT, fontSize: '10px', fontWeight: 700,
                fontFamily: 'Inter, sans-serif', textTransform: 'uppercase',
                letterSpacing: '0.15em' }}>
                Runden im Detail
              </p>

              <div className="flex flex-col gap-2">
                {[1, 2, 3].map(round => {
                  const s0 = scores[u0]?.[round - 1]
                  const s1 = scores[u1]?.[round - 1]
                  if (!s0 && !s1) return null

                  const winner0 = s0?.round_winner ?? null
                  const winner1 = s1?.round_winner ?? null
                  const roundAgree = winner0 !== null && winner1 !== null && winner0 === winner1
                  const roundKey = `${battle.id}_${round}`
                  const isExpanded = expandedRounds.has(roundKey)

                  const avg0mc1 = roundAvgForMC([s0], 'mc1')
                  const avg0mc2 = roundAvgForMC([s0], 'mc2')
                  const avg1mc1 = roundAvgForMC([s1], 'mc1')
                  const avg1mc2 = roundAvgForMC([s1], 'mc2')
                  const avgMc1 = (avg0mc1 + avg1mc1) / (s0 && s1 ? 2 : s0 ? 1 : 1)
                  const avgMc2 = (avg0mc2 + avg1mc2) / (s0 && s1 ? 2 : s1 ? 1 : 1)
                  const mc1Leads = avgMc1 > avgMc2

                  return (
                    <div key={round} className="card rounded-xl overflow-hidden">
                      {/* Round header button */}
                      <button onClick={() => toggleRound(roundKey)}
                        className="w-full px-4 pt-3 pb-2.5 text-left active:bg-white/5 transition-colors">
                        <div className="flex items-center gap-2">
                          {/* Round number */}
                          <p className="font-bebas tracking-widest flex-shrink-0"
                            style={{ color: C_BEN, fontSize: '15px', width: '64px' }}>
                            Runde {round}
                          </p>
                          {/* Two pick boxes */}
                          <div className="flex gap-2 flex-1 min-w-0">
                            {[u0, u1].map((name, idx) => {
                              const sc = idx === 0 ? s0 : s1
                              const winner = sc?.round_winner ?? null
                              const color = idx === 0 ? C_BEN : C_OTHER
                              return (
                                <div key={name} className="flex-1 min-w-0">
                                  <p style={{ color, fontSize: '9px', fontWeight: 700,
                                    fontFamily: 'Inter, sans-serif', textTransform: 'uppercase',
                                    letterSpacing: '0.06em' }} className="truncate">{name}</p>
                                  <p className="font-bebas tracking-wider truncate"
                                    style={{ fontSize: '14px', color: '#F1F0FF' }}>
                                    {winnerLabel(winner, battle.mc1, battle.mc2)}
                                  </p>
                                </div>
                              )
                            })}
                          </div>
                          {/* Badge + chevron */}
                          <div className="flex flex-col items-end gap-1 flex-shrink-0">
                            <AgreeBadge agree={roundAgree} />
                            <span style={{ color: '#555', fontSize: '11px' }}>{isExpanded ? '▲' : '▾'}</span>
                          </div>
                        </div>
                        {/* Avg line */}
                        <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '10px', marginTop: '6px' }}>
                          <span style={{ color: mc1Leads ? C_BEN : '#555' }}>Ø {battle.mc1}: {avgMc1.toFixed(1)}</span>
                          <span style={{ color: '#444' }}> · </span>
                          <span style={{ color: !mc1Leads ? C_BEN : '#555' }}>Ø {battle.mc2}: {avgMc2.toFixed(1)}</span>
                        </p>
                      </button>

                      {/* Expanded: categories */}
                      {isExpanded && (
                        <div className="border-t border-white/5 px-4 pt-3 pb-3 flex flex-col gap-3">
                          {CATEGORIES.map(cat => {
                            const mc1Key = `${cat.key}_mc1` as keyof Score
                            const mc2Key = `${cat.key}_mc2` as keyof Score
                            const v0mc1 = s0 ? (s0[mc1Key] as number) : 0
                            const v0mc2 = s0 ? (s0[mc2Key] as number) : 0
                            const v1mc1 = s1 ? (s1[mc1Key] as number) : 0
                            const v1mc2 = s1 ? (s1[mc2Key] as number) : 0
                            const isDoubled = [s0, s1].some(s => s?.double_down_category === cat.key)

                            const scoreColor = (mine: number, theirs: number, myColor: string) =>
                              mine > theirs ? myColor : mine === theirs ? C_EQUAL : C_DIM

                            return (
                              <div key={cat.key}
                                style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr', gap: '8px', alignItems: 'start' }}>
                                {/* Category name */}
                                <div className="flex items-center gap-1 pt-1">
                                  <p style={{ color: C_CAT, fontSize: '9px', fontWeight: 700,
                                    fontFamily: 'Inter, sans-serif', textTransform: 'uppercase',
                                    letterSpacing: '0.08em', lineHeight: 1.3 }}>
                                    {cat.label}
                                  </p>
                                  {isDoubled && (
                                    <span style={{ color: C_BEN, fontSize: '9px', fontWeight: 700,
                                      fontFamily: 'Inter, sans-serif' }}>2×</span>
                                  )}
                                </div>
                                {/* User 0 (Ben) scores */}
                                <ScoreBox name={u0} color={C_BEN}
                                  mc1={battle.mc1} mc2={battle.mc2}
                                  val1={v0mc1} val2={v0mc2}
                                  col1={scoreColor(v0mc1, v1mc1, C_BEN)}
                                  col2={scoreColor(v0mc2, v1mc2, C_BEN)} />
                                {/* User 1 scores */}
                                <ScoreBox name={u1 || '–'} color={C_OTHER}
                                  mc1={battle.mc1} mc2={battle.mc2}
                                  val1={v1mc1} val2={v1mc2}
                                  col1={scoreColor(v1mc1, v0mc1, C_OTHER)}
                                  col2={scoreColor(v1mc2, v0mc2, C_OTHER)} />
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* ── Battle-Fazit ───────────────────────────────────────── */}
              {userNames.some(n => verdicts[n]?.battle_comment) && (
                <div className="flex flex-col gap-2">
                  <p style={{ color: '#666', fontSize: '10px', fontFamily: 'Inter, sans-serif',
                    textTransform: 'uppercase', letterSpacing: '0.15em' }}>Battle-Fazit</p>
                  {userNames.map((name, idx) => {
                    const comment = verdicts[name]?.battle_comment
                    if (!comment) return null
                    const color = idx === 0 ? C_BEN : C_OTHER
                    return (
                      <div key={name} className="card rounded-lg px-4 py-3">
                        <p style={{ color, fontSize: '9px', fontWeight: 700,
                          fontFamily: 'Inter, sans-serif', textTransform: 'uppercase',
                          letterSpacing: '0.06em', marginBottom: '4px' }}>{name}</p>
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

// ── ScoreBox Subkomponente ────────────────────────────────────────────────────
interface ScoreBoxProps {
  name: string; color: string
  mc1: string; mc2: string
  val1: number; val2: number
  col1: string; col2: string
}

function ScoreBox({ name, color, mc1, mc2, val1, val2, col1, col2 }: ScoreBoxProps) {
  return (
    <div className="rounded-lg py-2 px-2" style={{ background: `${color}0D` }}>
      <p style={{ color, fontSize: '9px', fontWeight: 700, fontFamily: 'Inter, sans-serif',
        textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}
        className="truncate">{name}</p>
      <div className="flex gap-2">
        {[{ val: val1, col: col1, mc: mc1 }, { val: val2, col: col2, mc: mc2 }].map(({ val, col, mc }) => (
          <div key={mc} className="flex-1 min-w-0 text-center">
            <p className="font-bebas" style={{ color: col, fontSize: '20px', lineHeight: 1 }}>
              {val || '–'}
            </p>
            <p className="truncate" style={{ color: '#555', fontSize: '8px',
              fontFamily: 'Inter, sans-serif', textTransform: 'uppercase',
              letterSpacing: '0.04em', marginTop: '2px' }}>{mc}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
