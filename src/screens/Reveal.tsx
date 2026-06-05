import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Battle, Score, BattleVerdict, EventMode, RoomMode } from '../types'
import { CATEGORIES } from '../types'
import { getRoomMode } from '../lib/eventUtils'

// ── Farben ────────────────────────────────────────────────────────────────────
const C_BEN   = '#A855F7'
const C_OTHER = '#06B6D4'
const C_EQUAL = '#2A2A4A'
const C_DIM   = '#3A3A5A'
const C_CAT   = '#C0B8E8'

// ── Typen ─────────────────────────────────────────────────────────────────────
interface BattleReveal {
  battle: Battle
  userNames: string[]
  scores: Record<string, Score[]>
  verdicts: Record<string, BattleVerdict>
}

const winnerLabel = (w: string | null, mc1: string, mc2: string) =>
  w === 'mc1' ? mc1 : w === 'mc2' ? mc2 : w === 'draw' ? 'Draw' : '–'

const CAT_STYLE: React.CSSProperties = {
  color: C_CAT, fontSize: '9px', fontWeight: 700,
  fontFamily: 'Inter, sans-serif', textTransform: 'uppercase', letterSpacing: '0.08em',
}

function roundAvgForMC(roundScores: (Score | undefined)[], mc: 'mc1' | 'mc2') {
  const valid = roundScores.filter(Boolean) as Score[]
  if (!valid.length) return 0
  return valid.reduce((s, rs) =>
    s + CATEGORIES.reduce((cs, cat) => cs + ((rs[`${cat.key}_${mc}` as keyof Score] as number) || 0), 0), 0
  ) / (valid.length * CATEGORIES.length)
}

// ── Community-Daten berechnen ─────────────────────────────────────────────────
function buildCommunityScores(
  userNames: string[], scores: Record<string, Score[]>, excludeUser: string
): Score[] {
  const others = userNames.filter(n => n !== excludeUser)
  if (!others.length) return []
  return [1, 2, 3].map(round => {
    const rs = others.map(n => scores[n]?.[round - 1]).filter(Boolean) as Score[]
    if (!rs.length) return null
    const avg = { ...rs[0], user_name: 'Community Ø' } as Score & Record<string, number>
    for (const cat of CATEGORIES) {
      const k1 = `${cat.key}_mc1`; const k2 = `${cat.key}_mc2`
      const v1 = rs.map(s => s[k1 as keyof Score] as number)
      const v2 = rs.map(s => s[k2 as keyof Score] as number)
      avg[k1] = v1.reduce((a, b) => a + b, 0) / v1.length
      avg[k2] = v2.reduce((a, b) => a + b, 0) / v2.length
    }
    const picks = { mc1: 0, mc2: 0, draw: 0 }
    rs.forEach(s => { if (s.round_winner) picks[s.round_winner as keyof typeof picks]++ })
    avg.round_winner = (['mc1', 'mc2', 'draw'] as const).reduce((a, b) => picks[a] >= picks[b] ? a : b)
    return avg
  }).filter(Boolean) as Score[]
}

function buildCommunityVerdict(
  userNames: string[], verdicts: Record<string, BattleVerdict>,
  battleId: string, excludeUser: string
): BattleVerdict | null {
  const others = userNames.filter(n => n !== excludeUser)
  const ovs = others.map(n => verdicts[n]).filter(Boolean)
  if (!ovs.length) return null
  const picks = { mc1: 0, mc2: 0 }
  ovs.forEach(v => { if (v.overall_winner in picks) picks[v.overall_winner as 'mc1' | 'mc2']++ })
  return {
    id: 'community', battle_id: battleId, user_name: 'Community Ø',
    overall_winner: picks.mc1 >= picks.mc2 ? 'mc1' : 'mc2',
    battle_comment: null, submitted_at: '',
  }
}

function communityMajorityPct(
  userNames: string[], scores: Record<string, Score[]>,
  round: number, excludeUser: string, mc: 'mc1' | 'mc2' | 'draw'
): number {
  const others = userNames.filter(n => n !== excludeUser)
  const total = others.length
  if (!total) return 0
  const count = others.filter(n => scores[n]?.[round - 1]?.round_winner === mc).length
  return Math.round((count / total) * 100)
}

// ── AgreeBadge ────────────────────────────────────────────────────────────────
function AgreeBadge({ agree }: { agree: boolean }) {
  return (
    <span style={{
      display: 'inline-block', fontSize: '10px', fontWeight: 700,
      fontFamily: 'Inter, sans-serif', textTransform: 'uppercase', letterSpacing: '0.08em',
      padding: '2px 10px', borderRadius: '999px',
      border: `1px solid ${agree ? 'rgba(6,182,212,0.5)' : 'rgba(236,72,153,0.5)'}`,
      backgroundColor: agree ? 'rgba(6,182,212,0.12)' : 'rgba(236,72,153,0.12)',
      color: agree ? C_OTHER : '#EC4899',
    }}>
      {agree ? 'Einig ✓' : 'Diskussion'}
    </span>
  )
}

// ── ScoreBox ──────────────────────────────────────────────────────────────────
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
              {typeof val === 'number' ? (Number.isInteger(val) ? val : val.toFixed(1)) : '–'}
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

// ── Battle-Anzeige (wiederverwendet für alle Modi) ────────────────────────────
interface BattleViewProps {
  reveal: BattleReveal
  user0: string; user1: string
  color0: string; color1: string
  expandedRounds: Set<string>
  onToggle: (key: string) => void
  communityMode?: boolean
  allUserNames?: string[]
  allScores?: Record<string, Score[]>
}

function BattleView({
  reveal, user0, user1, color0, color1,
  expandedRounds, onToggle,
  communityMode = false, allUserNames, allScores,
}: BattleViewProps) {
  const { battle, scores, verdicts } = reveal
  const hasTwo = !!user0 && !!user1 && !!verdicts[user0] && !!verdicts[user1]
  const overallAgree = hasTwo && verdicts[user0].overall_winner === verdicts[user1].overall_winner

  return (
    <div className="flex flex-col gap-3">
      {/* Gesamtsieger */}
      {hasTwo && (
        <div className="rounded-xl p-4 border border-white/8"
          style={{ background: `linear-gradient(135deg, ${overallAgree ? 'rgba(6,182,212,0.08)' : 'rgba(236,72,153,0.08)'}, rgba(168,85,247,0.06))` }}>
          <p style={{ color: '#888', fontSize: '10px', fontFamily: 'Inter, sans-serif',
            textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center', marginBottom: '12px' }}>
            Gesamtsieger
          </p>
          <div className="grid grid-cols-2 gap-3">
            {[{ name: user0, color: color0 }, { name: user1, color: color1 }].map(({ name, color }) => {
              const winner = verdicts[name]?.overall_winner
              return (
                <div key={name} className="rounded-lg py-4 px-3 text-center"
                  style={{ background: `${color}14`, border: `1px solid ${color}30` }}>
                  <p style={{ color, fontSize: '9px', fontWeight: 700, fontFamily: 'Inter, sans-serif',
                    textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>{name}</p>
                  <p className="font-bebas tracking-wider" style={{ color, fontSize: '20px' }}>
                    {winnerLabel(winner, battle.mc1, battle.mc2)}
                  </p>
                </div>
              )
            })}
          </div>
          <div className="flex justify-center mt-3"><AgreeBadge agree={overallAgree} /></div>
        </div>
      )}

      <p style={{ color: C_CAT, fontSize: '10px', fontWeight: 700, fontFamily: 'Inter, sans-serif',
        textTransform: 'uppercase', letterSpacing: '0.15em' }}>Runden im Detail</p>

      <div className="flex flex-col gap-2">
        {[1, 2, 3].map(round => {
          const s0 = scores[user0]?.[round - 1]
          const s1 = scores[user1]?.[round - 1]
          if (!s0 && !s1) return null
          const w0 = s0?.round_winner ?? null
          const w1 = s1?.round_winner ?? null
          const roundAgree = w0 !== null && w1 !== null && w0 === w1
          const roundKey = `${battle.id}_${round}`
          const isExpanded = expandedRounds.has(roundKey)

          const avg0mc1 = roundAvgForMC([s0], 'mc1')
          const avg0mc2 = roundAvgForMC([s0], 'mc2')
          const avg1mc1 = roundAvgForMC([s1], 'mc1')
          const avg1mc2 = roundAvgForMC([s1], 'mc2')
          const avgMc1 = (avg0mc1 + avg1mc1) / (s0 && s1 ? 2 : 1)
          const avgMc2 = (avg0mc2 + avg1mc2) / (s0 && s1 ? 2 : 1)
          const mc1Leads = avgMc1 > avgMc2

          const w1Label = communityMode && allUserNames && allScores
            ? `${winnerLabel(w1, battle.mc1, battle.mc2)} (${communityMajorityPct(allUserNames, allScores, round, user0, w1 as 'mc1' | 'mc2' | 'draw')}%)`
            : winnerLabel(w1, battle.mc1, battle.mc2)

          return (
            <div key={round} className="card rounded-xl overflow-hidden">
              <button onClick={() => onToggle(roundKey)}
                className="w-full px-4 pt-3 pb-2.5 text-left active:bg-white/5 transition-colors">
                <div className="flex items-center gap-2">
                  <p className="font-bebas tracking-widest flex-shrink-0"
                    style={{ color: C_BEN, fontSize: '15px', width: '64px' }}>Runde {round}</p>
                  <div className="flex gap-2 flex-1 min-w-0">
                    {[{ name: user0, color: color0, label: winnerLabel(w0, battle.mc1, battle.mc2) },
                      { name: user1, color: color1, label: w1Label }].map(({ name, color, label }) => (
                      <div key={name} className="flex-1 min-w-0">
                        <p style={{ color, fontSize: '9px', fontWeight: 700, fontFamily: 'Inter, sans-serif',
                          textTransform: 'uppercase', letterSpacing: '0.06em' }} className="truncate">{name}</p>
                        <p className="font-bebas tracking-wider truncate"
                          style={{ fontSize: '13px', color: '#F1F0FF' }}>{label}</p>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <AgreeBadge agree={roundAgree} />
                    <span style={{ color: '#555', fontSize: '11px' }}>{isExpanded ? '▲' : '▾'}</span>
                  </div>
                </div>
                <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '10px', marginTop: '6px' }}>
                  <span style={{ color: mc1Leads ? C_BEN : '#555' }}>Ø {battle.mc1}: {avgMc1.toFixed(1)}</span>
                  <span style={{ color: '#444' }}> · </span>
                  <span style={{ color: !mc1Leads ? C_BEN : '#555' }}>Ø {battle.mc2}: {avgMc2.toFixed(1)}</span>
                </p>
              </button>

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
                    const sc = (mine: number, theirs: number, myColor: string) =>
                      mine > theirs ? myColor : mine === theirs ? C_EQUAL : C_DIM
                    return (
                      <div key={cat.key}
                        style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr', gap: '8px', alignItems: 'start' }}>
                        <div className="flex items-center gap-1 pt-1">
                          <p style={CAT_STYLE}>{cat.label}</p>
                          {isDoubled && <span style={{ color: C_BEN, fontSize: '9px', fontWeight: 700, fontFamily: 'Inter, sans-serif' }}>2×</span>}
                        </div>
                        <ScoreBox name={user0} color={color0} mc1={battle.mc1} mc2={battle.mc2}
                          val1={v0mc1} val2={v0mc2}
                          col1={sc(v0mc1, v1mc1, color0)} col2={sc(v0mc2, v1mc2, color0)} />
                        <ScoreBox name={user1 || '–'} color={color1} mc1={battle.mc1} mc2={battle.mc2}
                          val1={v1mc1} val2={v1mc2}
                          col1={sc(v1mc1, v0mc1, color1)} col2={sc(v1mc2, v0mc2, color1)} />
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Battle-Fazit */}
      {[user0, user1].some(n => verdicts[n]?.battle_comment) && (
        <div className="flex flex-col gap-2">
          <p style={{ color: '#666', fontSize: '10px', fontFamily: 'Inter, sans-serif',
            textTransform: 'uppercase', letterSpacing: '0.15em' }}>Battle-Fazit</p>
          {[{ name: user0, color: color0 }, { name: user1, color: color1 }].map(({ name, color }) => {
            const comment = verdicts[name]?.battle_comment
            if (!comment) return null
            return (
              <div key={name} className="card rounded-lg px-4 py-3">
                <p style={{ color, fontSize: '9px', fontWeight: 700, fontFamily: 'Inter, sans-serif',
                  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>{name}</p>
                <p className="font-inter text-app-muted text-sm">{comment}</p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Hauptkomponente ───────────────────────────────────────────────────────────
export default function Reveal() {
  const { roomId, eventId } = useParams<{ roomId: string; eventId: string }>()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const displayName = profile?.display_name ?? ''

  const [eventName, setEventName] = useState('')
  const [eventMode, setEventMode] = useState<EventMode>('heads_up')
  const [expertUserName, setExpertUserName] = useState('')
  const [reveals, setReveals] = useState<BattleReveal[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedRounds, setExpandedRounds] = useState<Set<string>>(new Set())
  const [expertTab, setExpertTab] = useState<'me' | 'community'>('me')

  const toggleRound = (key: string) => setExpandedRounds(prev => {
    const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s
  })

  useEffect(() => {
    async function load() {
      try {
        const [{ data: event }, { data: battles }, { data: room }, { data: members }] = await Promise.all([
          supabase.from('events').select('name').eq('id', eventId).single(),
          supabase.from('battles').select('*').eq('event_id', eventId).order('position'),
          roomId ? supabase.from('rooms').select('mode, expert_user_id').eq('id', roomId).single() : Promise.resolve({ data: null, error: null }),
          roomId ? supabase.from('room_members').select('id').eq('room_id', roomId) : Promise.resolve({ data: [], error: null }),
        ])
        setEventName(event?.name ?? '')
        const roomMode: RoomMode = (room?.mode as RoomMode) ?? 'auto'
        const mode = getRoomMode(roomMode, members?.length ?? 2)
        setEventMode(mode)

        if (mode === 'expert' && room?.expert_user_id) {
          const { data: ep } = await supabase.from('profiles').select('display_name').eq('id', room.expert_user_id).single()
          setExpertUserName(ep?.display_name ?? '')
        }

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
      <div className="sticky top-0 bg-app-bg/90 backdrop-blur border-b border-white/5 px-4 py-4 flex items-center gap-3 z-10 noise-header">
        <button onClick={() => navigate(roomId ? `/room/${roomId}` : '/')} className="text-app-muted text-xl w-8 flex-shrink-0">←</button>
        <div className="flex-1 min-w-0">
          <p className="font-inter text-app-muted text-[10px] uppercase tracking-[0.15em]">Reveal</p>
          <h1 className="font-bebas text-xl text-app-text tracking-wider truncate">{eventName}</h1>
        </div>
        {/* Modus-Badge */}
        <span className="font-inter text-[9px] px-2 py-1 rounded uppercase tracking-[0.08em] bg-white/5 text-app-muted flex-shrink-0">
          {eventMode === 'heads_up' ? 'Heads Up' : eventMode === 'community' ? 'Community' : 'Expert'}
        </span>
      </div>

      {/* Expert Mode: Tab-Bar */}
      {eventMode === 'expert' && (
        <div className="flex border-b border-white/5">
          {([['me', `Ich vs. ${expertUserName || 'Expert'}`], ['community', 'Community vs. Expert']] as const).map(([key, label]) => (
            <button key={key} onClick={() => setExpertTab(key)}
              className={`flex-1 py-3 font-bebas text-sm tracking-[1px] transition-colors ${expertTab === key ? 'text-primary border-b-2 border-primary' : 'text-app-muted'}`}>
              {label}
            </button>
          ))}
        </div>
      )}

      <div className="p-4 flex flex-col gap-10 pb-10">
        {reveals.map(reveal => {
          const { battle, userNames } = reveal

          // Community-Daten vorbereiten
          const communityScores = buildCommunityScores(userNames, reveal.scores, displayName)
          const communityVerdict = buildCommunityVerdict(userNames, reveal.verdicts, battle.id, displayName)
          const commScoresMap = { ...reveal.scores, 'Community Ø': communityScores }
          const commVerdictsMap = communityVerdict
            ? { ...reveal.verdicts, 'Community Ø': communityVerdict }
            : reveal.verdicts

          return (
            <div key={battle.id} className="flex flex-col gap-4">
              {/* Battle-Header */}
              <div className="text-center">
                <span style={{ color: '#666', fontSize: '10px', fontFamily: 'Inter, sans-serif',
                  textTransform: 'uppercase', letterSpacing: '0.15em' }}>{battle.format}</span>
                <h2 className="font-bebas tracking-wider leading-tight mt-0.5"
                  style={{ fontSize: '28px', color: '#F1F0FF' }}>
                  {battle.mc1} vs {battle.mc2}
                </h2>
                {/* User-Tags */}
                <div className="flex gap-2 justify-center mt-2">
                  {userNames.map((name, idx) => (
                    <span key={name} className="font-inter text-[10px] px-3 py-1 rounded-full font-bold uppercase tracking-[0.08em]"
                      style={{ background: `${idx === 0 ? C_BEN : C_OTHER}20`, color: idx === 0 ? C_BEN : C_OTHER }}>
                      {name}
                    </span>
                  ))}
                </div>
              </div>

              {/* Heads Up: alle User direkt */}
              {eventMode === 'heads_up' && (() => {
                const u0 = userNames[0] ?? ''; const u1 = userNames[1] ?? ''
                return (
                  <BattleView reveal={reveal} user0={u0} user1={u1}
                    color0={C_BEN} color1={C_OTHER}
                    expandedRounds={expandedRounds} onToggle={toggleRound} />
                )
              })()}

              {/* Community Vote: Ich vs. Community Ø */}
              {eventMode === 'community' && (() => {
                const comReveal = {
                  ...reveal,
                  userNames: [displayName, 'Community Ø'],
                  scores: commScoresMap,
                  verdicts: commVerdictsMap,
                }
                return (
                  <BattleView reveal={comReveal} user0={displayName} user1="Community Ø"
                    color0={C_BEN} color1={C_OTHER}
                    expandedRounds={expandedRounds} onToggle={toggleRound}
                    communityMode allUserNames={userNames} allScores={reveal.scores} />
                )
              })()}

              {/* Expert Mode: Tab 1 (Ich vs. Expert) oder Tab 2 (Community vs. Expert) */}
              {eventMode === 'expert' && (() => {
                if (expertTab === 'me') {
                  const expertReveal = {
                    ...reveal,
                    userNames: [displayName, expertUserName].filter(n => reveal.userNames.includes(n)),
                  }
                  const u0 = expertReveal.userNames[0] ?? ''
                  const u1 = expertReveal.userNames[1] ?? ''
                  return (
                    <BattleView reveal={expertReveal} user0={u0} user1={u1}
                      color0={C_BEN} color1={C_OTHER}
                      expandedRounds={expandedRounds} onToggle={toggleRound} />
                  )
                } else {
                  // Community vs. Expert
                  const expertReveal = {
                    ...reveal,
                    userNames: ['Community Ø', expertUserName],
                    scores: { 'Community Ø': commScoresMap['Community Ø'] ?? [], [expertUserName]: reveal.scores[expertUserName] ?? [] },
                    verdicts: {
                      'Community Ø': commVerdictsMap['Community Ø'] ?? { id: '', battle_id: battle.id, user_name: 'Community Ø', overall_winner: 'mc1', battle_comment: null, submitted_at: '' },
                      [expertUserName]: reveal.verdicts[expertUserName],
                    },
                  }
                  return (
                    <BattleView reveal={expertReveal} user0="Community Ø" user1={expertUserName}
                      color0={C_OTHER} color1={C_BEN}
                      expandedRounds={expandedRounds} onToggle={toggleRound}
                      communityMode allUserNames={userNames} allScores={reveal.scores} />
                  )
                }
              })()}
            </div>
          )
        })}
      </div>
    </div>
  )
}
