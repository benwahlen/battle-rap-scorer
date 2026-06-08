import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Battle, CategoryKey, EventMode, RoomMode } from '../types'
import { CATEGORIES } from '../types'
import Slider from '../components/Slider'
import { canVote, formatVotingDate, getRoomMode } from '../lib/eventUtils'

// ── Local score types ────────────────────────────────────────────────────────

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
  round_comment: string
  double_down_category: CategoryKey | null
}

interface BattleScore {
  rounds: Record<number, RoundScore>
  overall_winner: OverallWinner | null
  battle_comment: string
}

const defaultRound = (): RoundScore => ({
  bars_mc1: 3, bars_mc2: 3,
  personalisierung_mc1: 3, personalisierung_mc2: 3,
  delivery_mc1: 3, delivery_mc2: 3,
  struktur_mc1: 3, struktur_mc2: 3,
  humor_mc1: 3, humor_mc2: 3,
  innovation_mc1: 3, innovation_mc2: 3,
  round_winner: null, round_comment: '', double_down_category: null,
})

const defaultBattleScore = (): BattleScore => ({
  rounds: { 1: defaultRound(), 2: defaultRound(), 3: defaultRound() },
  overall_winner: null, battle_comment: '',
})

// ── Helpers ──────────────────────────────────────────────────────────────────

function roundAvg(rs: RoundScore) {
  // Doubled category counts twice → denominator = CATEGORIES.length + 1 when active
  const totalWeight = CATEGORIES.length + (rs.double_down_category ? 1 : 0)
  let s1 = 0, s2 = 0
  for (const cat of CATEGORIES) {
    const w = rs.double_down_category === cat.key ? 2 : 1
    s1 += (rs[`${cat.key}_mc1` as keyof RoundScore] as number) * w
    s2 += (rs[`${cat.key}_mc2` as keyof RoundScore] as number) * w
  }
  return { mc1: s1 / totalWeight, mc2: s2 / totalWeight }
}

function battleAvg(bs: BattleScore) {
  const avgs = [1, 2, 3].map(r => roundAvg(bs.rounds[r]))
  return {
    mc1: avgs.reduce((s, a) => s + a.mc1, 0) / 3,
    mc2: avgs.reduce((s, a) => s + a.mc2, 0) / 3,
  }
}


// ── Props ────────────────────────────────────────────────────────────────────

// ── Main component ───────────────────────────────────────────────────────────

export default function BattleOverview() {
  const { roomId, eventId } = useParams<{ roomId: string; eventId: string }>()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const displayName = profile?.display_name ?? ''

  const [eventName, setEventName] = useState('')
  const [eventMode, setEventMode] = useState<EventMode>('heads_up')
  const [lockedMode, setLockedMode] = useState<EventMode | null>(null)
  const [votingOpensAt, setVotingOpensAt] = useState<string | null>(null)
  const [votingReleasedAt, setVotingReleasedAt] = useState<string | null>(null)
  const [battles, setBattles] = useState<Battle[]>([])
  const [scores, setScores] = useState<Record<string, BattleScore>>({})
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [activeBattleId, setActiveBattleId] = useState<string | null>(null)
  const [otherVerdictStatus, setOtherVerdictStatus] = useState<Record<string, boolean>>({})
  const [savedBattleIds, setSavedBattleIds] = useState<Set<string>>(new Set())

  useEffect(() => { if (eventId) load() }, [eventId, displayName]) // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    try {
      const [{ data: event }, { data: battlesData }, { data: room }, { data: members }, { data: roomEvent }] = await Promise.all([
        supabase.from('events').select('name, voting_opens_at, voting_released_at').eq('id', eventId).single(),
        supabase.from('battles').select('*').eq('event_id', eventId).order('position'),
        roomId ? supabase.from('rooms').select('mode, expert_user_id').eq('id', roomId).single() : Promise.resolve({ data: null, error: null }),
        roomId ? supabase.from('room_members').select('id').eq('room_id', roomId) : Promise.resolve({ data: [], error: null }),
        (roomId && eventId) ? supabase.from('room_events').select('locked_mode').eq('room_id', roomId).eq('event_id', eventId).maybeSingle() : Promise.resolve({ data: null, error: null }),
      ])
      setEventName(event?.name ?? '')
      setVotingOpensAt(event?.voting_opens_at ?? null)
      setVotingReleasedAt(event?.voting_released_at ?? null)
      const locked = (roomEvent?.locked_mode as EventMode | null) ?? null
      setLockedMode(locked)
      const roomMode: RoomMode = (room?.mode as RoomMode) ?? 'auto'
      setEventMode(getRoomMode(roomMode, members?.length ?? 2, locked))
      const list: Battle[] = battlesData ?? []
      setBattles(list)
      const ids = list.map(b => b.id)
      if (ids.length === 0) { setLoading(false); return }

      const [{ data: verdicts }, { data: existingScores }, { data: allVerdicts }] = await Promise.all([
        supabase.from('battle_verdicts').select('*').in('battle_id', ids).eq('user_name', displayName),
        supabase.from('scores').select('*').in('battle_id', ids).eq('user_name', displayName),
        supabase.from('battle_verdicts').select('battle_id, user_name').in('battle_id', ids),
      ])

      const verdictSet = new Set([
        ...(verdicts ?? []).map((v: { battle_id: string }) => v.battle_id),
        ...(existingScores ?? []).map((s: { battle_id: string }) => s.battle_id),
      ])
      setSavedBattleIds(verdictSet)
      setIsEditing(verdictSet.size === ids.length)

      const otherStatus: Record<string, boolean> = {}
      for (const b of list) {
        otherStatus[b.id] = (allVerdicts ?? []).some(v => v.battle_id === b.id && v.user_name !== displayName)
      }
      setOtherVerdictStatus(otherStatus)

      const init: Record<string, BattleScore> = {}
      for (const b of list) {
        const verdict = (verdicts ?? []).find((v: { battle_id: string }) => v.battle_id === b.id) ?? null
        const bScores = (existingScores ?? []).filter((s: { battle_id: string }) => s.battle_id === b.id)
        if (verdict || bScores.length > 0) {
          const rounds: Record<number, RoundScore> = {}
          for (const rn of [1, 2, 3]) {
            const s = bScores.find((s: { round_number: number }) => s.round_number === rn)
            rounds[rn] = s ? {
              bars_mc1: s.bars_mc1, bars_mc2: s.bars_mc2,
              personalisierung_mc1: s.personalisierung_mc1, personalisierung_mc2: s.personalisierung_mc2,
              delivery_mc1: s.delivery_mc1, delivery_mc2: s.delivery_mc2,
              struktur_mc1: s.struktur_mc1, struktur_mc2: s.struktur_mc2,
              humor_mc1: s.humor_mc1 ?? 3, humor_mc2: s.humor_mc2 ?? 3,
              innovation_mc1: s.innovation_mc1 ?? 3, innovation_mc2: s.innovation_mc2 ?? 3,
              round_winner: (s.round_winner as RoundWinner) ?? null,
              round_comment: s.round_comment ?? '',
              double_down_category: (s.double_down_category as CategoryKey) ?? null,
            } : defaultRound()
          }
          init[b.id] = {
            rounds, overall_winner: (verdict?.overall_winner as OverallWinner) ?? null,
            battle_comment: verdict?.battle_comment ?? '',
          }
        } else {
          init[b.id] = defaultBattleScore()
        }
      }
      setScores(init)
    } catch {
      setError('Fehler beim Laden.')
    } finally {
      setLoading(false)
    }
  }

  const updateScore = (battleId: string, score: BattleScore) =>
    setScores(prev => ({ ...prev, [battleId]: score }))

  async function handleSubmit() {
    setSubmitting(true); setError(null)
    try {
      // Modus beim ersten Submit einfrieren (locked_mode noch nicht gesetzt)
      if (!lockedMode && roomId && eventId) {
        await supabase.from('room_events')
          .update({ locked_mode: eventMode })
          .eq('room_id', roomId)
          .eq('event_id', eventId)
      }
      // Reveal sobald irgendein anderer User mindestens eine Battle bewertet hat
      const { data: allOtherVerdicts } = await supabase
        .from('battle_verdicts').select('battle_id')
        .in('battle_id', battles.map(b => b.id))
        .neq('user_name', displayName)
      const anyShared = (allOtherVerdicts ?? []).length > 0
      if (eventMode === 'community' || anyShared) {
        navigate(`/room/${roomId}/reveal/${eventId}`, { replace: true })
      } else {
        navigate(`/room/${roomId}/wait/${eventId}`, { replace: true })
      }
    } catch {
      setError('Fehler beim Einreichen. Bitte erneut versuchen.')
      setSubmitting(false)
    }
  }

  // ── Single battle view ──────────────────────────────────────────────────────
  if (activeBattleId !== null) {
    const battle = battles.find(b => b.id === activeBattleId)
    if (!battle || !scores[activeBattleId]) return null
    return (
      <SingleBattleView
        battle={battle}
        battleIndex={battles.indexOf(battle)}
        battleCount={battles.length}
        score={scores[activeBattleId]}
        displayName={displayName}
        onChange={s => updateScore(activeBattleId, s)}
        onBack={() => setActiveBattleId(null)}
        onSaved={id => setSavedBattleIds(prev => new Set([...prev, id]))}
      />
    )
  }

  // ── Overview ────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="font-inter text-app-muted text-[10px] uppercase tracking-[0.15em]">Lade…</p>
    </div>
  )

  const allComplete = battles.length > 0 && savedBattleIds.size === battles.length
  const doneCount = savedBattleIds.size

  return (
    <div className="min-h-screen">
      <div className="sticky top-0 bg-app-bg/90 backdrop-blur border-b border-white/5 px-4 py-4 flex items-center gap-3 z-10 noise-header">
        <button onClick={() => navigate(roomId ? `/room/${roomId}` : '/')} className="text-app-muted text-xl w-8 flex-shrink-0">←</button>
        <div className="flex-1 min-w-0">
          <p className="font-inter text-app-muted text-[10px] uppercase tracking-[0.15em]">
            {isEditing ? 'Bewertung bearbeiten' : 'Bewertung'}
          </p>
          <h1 className="font-bebas text-xl text-app-text tracking-wider truncate">{eventName}</h1>
        </div>
      </div>

      <div className="p-4 flex flex-col gap-3 pb-36">
        {battles.map((b, i) => {
          const bs = scores[b.id]
          const mySaved = savedBattleIds.has(b.id)
          const otherDone = otherVerdictStatus[b.id] ?? false
          const statusVariant = mySaved && otherDone ? 'reveal' : mySaved ? 'saved' : otherDone ? 'my_turn' : 'pending'
          const avg = bs ? battleAvg(bs) : null
          const votingAllowed = canVote({ voting_opens_at: votingOpensAt, voting_released_at: votingReleasedAt })
          return (
            <button key={b.id}
              onClick={() => {
                if (!votingAllowed) return
                // State 3: another user has voted on this battle → go to reveal (frozen)
                if (mySaved && otherDone) {
                  navigate(`/room/${roomId}/reveal/${eventId}`)
                } else {
                  setActiveBattleId(b.id)
                }
              }}
              disabled={!votingAllowed}
              className={`card rounded-lg p-4 text-left transition-transform w-full ${votingAllowed ? 'active:scale-95' : 'opacity-60 cursor-default'}`}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-inter text-app-muted text-[10px] uppercase tracking-[0.1em] mb-0.5">
                    Battle {i + 1} · {b.format}
                  </p>
                  <p className="font-bebas text-lg text-app-text tracking-wider truncate leading-tight">
                    {b.mc1} vs {b.mc2}
                  </p>
                  {mySaved && avg && (
                    <p className="font-inter text-[10px] text-app-muted mt-1">
                      {b.mc1} Ø {avg.mc1.toFixed(1)} · {b.mc2} Ø {avg.mc2.toFixed(1)}
                    </p>
                  )}
                </div>
                <div className="flex-shrink-0">
                  {!votingAllowed ? (
                    <span className="font-inter text-[10px] font-bold px-2.5 py-1 rounded uppercase tracking-[0.1em] bg-white/5 text-app-muted">
                      🔒 {votingOpensAt ? formatVotingDate(votingOpensAt) : 'Gesperrt'}
                    </span>
                  ) : (
                    <>
                      {statusVariant === 'reveal' && <span className="font-inter text-[10px] font-bold px-2.5 py-1 rounded uppercase tracking-[0.1em] flex-shrink-0 bg-secondary/20 text-secondary">🔓 Reveal</span>}
                      {statusVariant === 'saved' && <span className="font-inter text-[10px] font-bold px-2.5 py-1 rounded uppercase tracking-[0.1em] flex-shrink-0 bg-green-900/30 text-green-400">✓ Bewertet</span>}
                      {statusVariant === 'my_turn' && <span className="font-inter text-[10px] font-bold px-2.5 py-1 rounded uppercase tracking-[0.1em] flex-shrink-0 bg-accent/20 text-accent animate-pulse">⚡ Nur noch du</span>}
                      {statusVariant === 'pending' && <span className="font-inter text-[10px] font-bold px-2.5 py-1 rounded uppercase tracking-[0.1em] flex-shrink-0 bg-primary/20 text-primary">Ausstehend</span>}
                    </>
                  )}
                </div>
              </div>
            </button>
          )
        })}
        {error && (
          <div className="card border-red-800/50 rounded-lg p-3 text-red-400 text-sm">{error}</div>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-app-bg/90 backdrop-blur border-t border-white/5">
        {allComplete ? (
          <button onClick={handleSubmit} disabled={submitting}
            className="w-full bg-primary font-bebas text-app-text py-4 rounded-lg tracking-[2px] text-base disabled:opacity-50 active:scale-95 transition-transform shadow-lg shadow-primary/30">
            {submitting ? 'Wird eingereicht…' : isEditing ? 'Bewertung aktualisieren' : 'Bewertung einreichen'}
          </button>
        ) : (
          <div className="text-center">
            <p className="font-inter text-app-muted text-[10px] uppercase tracking-[0.15em]">
              {doneCount}/{battles.length} Battles bewertet
            </p>
            <div className="mt-2 h-1 bg-white/5 rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all"
                style={{ width: battles.length ? `${(doneCount / battles.length) * 100}%` : '0%' }} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── SingleBattleView ─────────────────────────────────────────────────────────

interface SingleBattleProps {
  battle: Battle
  battleIndex: number
  battleCount: number
  score: BattleScore
  displayName: string
  onChange: (score: BattleScore) => void
  onBack: () => void
  onSaved: (battleId: string) => void
}

function SingleBattleView({ battle, battleIndex, battleCount, score, displayName, onChange, onBack, onSaved }: SingleBattleProps) {
  const [currentRound, setCurrentRound] = useState(1)
  const [animDir, setAnimDir] = useState<'forward' | 'back'>('forward')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const setScoreVal = (round: number, field: keyof Omit<RoundScore, 'round_winner' | 'round_comment' | 'double_down_category'>, value: number) =>
    onChange({ ...score, rounds: { ...score.rounds, [round]: { ...score.rounds[round], [field]: value } } })

  const setRoundWinner = (round: number, winner: RoundWinner) =>
    onChange({ ...score, rounds: { ...score.rounds, [round]: { ...score.rounds[round], round_winner: winner } } })

  const setRoundComment = (round: number, comment: string) =>
    onChange({ ...score, rounds: { ...score.rounds, [round]: { ...score.rounds[round], round_comment: comment } } })

  const toggleDoubleDown = (round: number, catKey: CategoryKey) => {
    const cur = score.rounds[round].double_down_category
    onChange({ ...score, rounds: { ...score.rounds, [round]: { ...score.rounds[round], double_down_category: cur === catKey ? null : catKey } } })
  }

  const setOverallWinner = (w: OverallWinner) => onChange({ ...score, overall_winner: w })
  const setBattleComment = (c: string) => onChange({ ...score, battle_comment: c })

  const goNext = () => {
    if (!score.rounds[currentRound]?.round_winner) {
      setSaveError('Bitte einen Rundensieger wählen.')
      return
    }
    setSaveError(null)
    setAnimDir('forward')
    setCurrentRound(r => r + 1)
  }

  const goPrev = () => {
    setSaveError(null)
    setAnimDir('back')
    setCurrentRound(r => r - 1)
  }

  const handleSaveAndBack = async () => {
    const allRoundsDone = [1, 2, 3].every(r => score.rounds[r]?.round_winner !== null)
    const overallDone = score.overall_winner !== null
    if (!allRoundsDone || !overallDone) {
      setSaveError('Bitte Sieger für alle Runden und Gesamtsieger wählen.')
      return
    }
    setSaveError(null)
    setSaving(true)
    try {
      for (const round of [1, 2, 3] as const) {
        const rs = score.rounds[round]
        const { error: e } = await supabase.from('scores').upsert({
          battle_id: battle.id, user_name: displayName, round_number: round,
          bars_mc1: rs.bars_mc1, bars_mc2: rs.bars_mc2,
          personalisierung_mc1: rs.personalisierung_mc1, personalisierung_mc2: rs.personalisierung_mc2,
          delivery_mc1: rs.delivery_mc1, delivery_mc2: rs.delivery_mc2,
          struktur_mc1: rs.struktur_mc1, struktur_mc2: rs.struktur_mc2,
          humor_mc1: rs.humor_mc1, humor_mc2: rs.humor_mc2,
          innovation_mc1: rs.innovation_mc1, innovation_mc2: rs.innovation_mc2,
          round_winner: rs.round_winner, round_comment: rs.round_comment || null,
          double_down_category: rs.double_down_category || null,
        }, { onConflict: 'battle_id,user_name,round_number' })
        if (e) throw e
      }
      const { error: ve } = await supabase.from('battle_verdicts').upsert({
        battle_id: battle.id, user_name: displayName,
        overall_winner: score.overall_winner!,
        battle_comment: score.battle_comment || null,
      }, { onConflict: 'battle_id,user_name' })
      if (ve) throw ve
      onSaved(battle.id)
      onBack()
    } catch {
      setSaveError('Fehler beim Speichern. Bitte erneut versuchen.')
      setSaving(false)
    }
  }

  const rs = score.rounds[currentRound]
  const rAvg = roundAvg(rs)
  const mc1Leading = rAvg.mc1 >= rAvg.mc2
  const avg = battleAvg(score)
  const isLastRound = currentRound === 3

  return (
    <div className="min-h-screen">
      <style>{`
        @keyframes slideFromRight { from { transform: translateX(48px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes slideFromLeft  { from { transform: translateX(-48px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
      `}</style>

      {/* Header */}
      <div className="sticky top-0 bg-app-bg/90 backdrop-blur border-b border-white/5 px-4 py-3 z-10 noise-header">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-app-muted text-xl w-8 flex-shrink-0">←</button>
          <div className="flex-1 min-w-0">
            <p className="font-inter text-app-muted text-[10px] uppercase tracking-[0.15em] truncate">
              Battle {battleIndex + 1}/{battleCount} · {battle.format}
            </p>
            <h1 className="font-bebas text-lg text-app-text tracking-wider truncate leading-tight">
              {battle.mc1} vs {battle.mc2}
            </h1>
          </div>
        </div>
        {/* Round progress indicator */}
        <div className="flex items-center gap-3 mt-2">
          <p className="font-bebas text-sm tracking-[2px] text-primary flex-shrink-0">RUNDE {currentRound} / 3</p>
          <div className="flex gap-1.5 flex-1">
            {[1, 2, 3].map(r => (
              <div key={r} className="h-1 rounded-full transition-all duration-300"
                style={{
                  flex: r === currentRound ? 1.5 : 1,
                  background: r < currentRound ? 'rgba(124,58,237,0.5)' : r === currentRound ? '#7C3AED' : 'rgba(255,255,255,0.1)',
                }} />
            ))}
          </div>
        </div>
      </div>

      {/* Paged round content — keyed on currentRound triggers slide animation */}
      <div
        key={currentRound}
        className="p-4 pb-28 flex flex-col gap-4"
        style={{ animation: `${animDir === 'forward' ? 'slideFromRight' : 'slideFromLeft'} 0.22s ease-out` }}
      >
        <div className="card rounded-lg overflow-hidden">
          {/* Categories */}
          <div className="px-3 pt-3 pb-2 flex flex-col gap-3">
            {CATEGORIES.map(cat => {
              const mc1Key = `${cat.key}_mc1` as keyof Omit<RoundScore, 'round_winner' | 'round_comment' | 'double_down_category'>
              const mc2Key = `${cat.key}_mc2` as keyof Omit<RoundScore, 'round_winner' | 'round_comment' | 'double_down_category'>
              const isDoubled = rs.double_down_category === cat.key
              return (
                <div key={cat.key} className={`rounded-lg p-2 ${isDoubled ? 'double-down-active' : ''}`}>
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <span className="font-inter font-bold uppercase" style={{ color: '#C0B8E8', fontSize: '11px', letterSpacing: '0.12em' }}>{cat.label}</span>
                    <button onClick={() => toggleDoubleDown(currentRound, cat.key)}
                      className={`font-bebas text-xs px-2 py-0.5 rounded tracking-wider transition-colors ${
                        isDoubled ? 'bg-primary text-white shadow-sm shadow-primary/50' : 'bg-white/10 text-app-muted'
                      }`}>2×</button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Slider mc={battle.mc1} value={rs[mc1Key] as number} onChange={v => setScoreVal(currentRound, mc1Key, v)} isLeading={(rs[mc1Key] as number) > (rs[mc2Key] as number)} />
                    <Slider mc={battle.mc2} value={rs[mc2Key] as number} onChange={v => setScoreVal(currentRound, mc2Key, v)} isLeading={(rs[mc2Key] as number) > (rs[mc1Key] as number)} />
                  </div>
                </div>
              )
            })}
          </div>

          {/* Live avg banner */}
          <div className="mx-3 mb-3 card rounded-lg px-4 py-3 flex items-center justify-between">
            <div className="text-center">
              <div className={`font-bebas text-[40px] leading-none ${mc1Leading ? 'text-primary' : 'text-app-muted'}`}>{rAvg.mc1.toFixed(1)}</div>
              <p className="font-inter text-[9px] uppercase tracking-wider text-app-muted">{battle.mc1}</p>
            </div>
            <span className="font-inter text-[10px] text-app-muted uppercase tracking-widest">Ø</span>
            <div className="text-center">
              <div className={`font-bebas text-[40px] leading-none ${!mc1Leading ? 'text-primary' : 'text-app-muted'}`}>{rAvg.mc2.toFixed(1)}</div>
              <p className="font-inter text-[9px] uppercase tracking-wider text-app-muted">{battle.mc2}</p>
            </div>
          </div>

          {/* Rundensieger */}
          <div className="px-3 pb-3 border-t border-white/5 pt-3">
            <p className="font-inter text-[10px] uppercase tracking-[0.1em] text-app-muted mb-2 text-center">Rundensieger</p>
            <div className="flex gap-2">
              {(['mc1', 'draw', 'mc2'] as RoundWinner[]).map(w => (
                <button key={w} onClick={() => setRoundWinner(currentRound, w)}
                  className={`flex-1 py-2.5 rounded font-bebas tracking-[2px] text-sm transition-colors truncate px-1 ${
                    rs.round_winner === w ? 'bg-primary text-white shadow-sm shadow-primary/40' : 'bg-white/10 text-app-muted'
                  }`}>
                  {w === 'mc1' ? battle.mc1 : w === 'mc2' ? battle.mc2 : 'Draw'}
                </button>
              ))}
            </div>
          </div>

          {/* Round comment */}
          <div className="px-3 pb-3">
            <textarea
              placeholder="Kommentar zur Runde (optional)"
              value={rs.round_comment}
              onChange={e => setRoundComment(currentRound, e.target.value)}
              onFocus={e => e.target.scrollIntoView({ behavior: 'smooth', block: 'nearest' })}
              rows={2}
              className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-app-text placeholder-app-muted/50 focus:outline-none focus:border-primary/50 font-inter text-sm resize-none"
            />
          </div>
        </div>

        {/* Gesamtsieger + Battle avg + Battle comment — only on round 3 */}
        {isLastRound && (
          <div className="card rounded-lg p-4 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="text-center flex-1">
                <div className={`font-bebas text-[40px] leading-none ${avg.mc1 >= avg.mc2 ? 'text-primary' : 'text-app-muted'}`}>{avg.mc1.toFixed(1)}</div>
                <p className="font-inter text-[9px] uppercase tracking-wider text-app-muted">{battle.mc1}</p>
              </div>
              <p className="font-inter text-[10px] text-app-muted uppercase tracking-widest px-3">Battle Ø</p>
              <div className="text-center flex-1">
                <div className={`font-bebas text-[40px] leading-none ${avg.mc2 > avg.mc1 ? 'text-primary' : 'text-app-muted'}`}>{avg.mc2.toFixed(1)}</div>
                <p className="font-inter text-[9px] uppercase tracking-wider text-app-muted">{battle.mc2}</p>
              </div>
            </div>
            <div>
              <p className="font-inter text-[10px] uppercase tracking-[0.1em] text-app-muted mb-2 text-center">Gesamtsieger</p>
              <div className="flex gap-2">
                {(['mc1', 'mc2'] as OverallWinner[]).map(w => (
                  <button key={w} onClick={() => setOverallWinner(w)}
                    className={`flex-1 py-3 rounded font-bebas tracking-[2px] text-sm transition-colors truncate ${
                      score.overall_winner === w ? 'bg-primary text-white shadow-md shadow-primary/40' : 'bg-white/10 text-app-muted'
                    }`}>
                    {w === 'mc1' ? battle.mc1 : battle.mc2}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="font-inter text-[10px] uppercase tracking-[0.1em] text-app-muted mb-2">Battle-Fazit (optional)</p>
              <textarea
                placeholder="Gesamteindruck, Highlights, Diskussionspunkte…"
                value={score.battle_comment}
                onChange={e => setBattleComment(e.target.value)}
                onFocus={e => e.target.scrollIntoView({ behavior: 'smooth', block: 'nearest' })}
                rows={3}
                className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-app-text placeholder-app-muted/50 focus:outline-none focus:border-primary/50 font-inter text-sm resize-none"
              />
            </div>
          </div>
        )}
      </div>

      {/* Bottom navigation */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-app-bg/90 backdrop-blur border-t border-white/5 flex flex-col gap-2">
        {saveError && <p className="font-inter text-accent text-xs text-center">{saveError}</p>}
        <div className="flex gap-2">
          {currentRound > 1 && (
            <button onClick={goPrev}
              className="flex-1 card rounded-lg py-4 font-bebas text-app-muted tracking-[2px] text-base active:scale-95 transition-transform">
              ← Zurück
            </button>
          )}
          {!isLastRound ? (
            <button onClick={goNext}
              className="flex-1 bg-primary font-bebas text-white py-4 rounded-lg tracking-[2px] text-base active:scale-95 transition-transform shadow-lg shadow-primary/30">
              Weiter →
            </button>
          ) : (
            <button onClick={handleSaveAndBack} disabled={saving}
              className="flex-1 font-bebas text-white py-4 rounded-lg tracking-[2px] text-base active:scale-95 transition-transform shadow-lg disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #7C3AED, #0EA5E9)' }}>
              {saving ? 'Wird gespeichert…' : 'Speichern und zur Übersicht'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
