import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Battle, UserName, CategoryKey } from '../types'
import { CATEGORIES } from '../types'
import Stepper from '../components/Stepper'

// ── Local score types ────────────────────────────────────────────────────────

type RoundWinner = 'mc1' | 'draw' | 'mc2'
type OverallWinner = 'mc1' | 'mc2'

interface RoundScore {
  bars_mc1: number; bars_mc2: number
  personalisierung_mc1: number; personalisierung_mc2: number
  delivery_mc1: number; delivery_mc2: number
  struktur_mc1: number; struktur_mc2: number
  crowd_mc1: number; crowd_mc2: number
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
  bars_mc1: 5, bars_mc2: 5,
  personalisierung_mc1: 5, personalisierung_mc2: 5,
  delivery_mc1: 5, delivery_mc2: 5,
  struktur_mc1: 5, struktur_mc2: 5,
  crowd_mc1: 5, crowd_mc2: 5,
  round_winner: null,
  round_comment: '',
  double_down_category: null,
})

const defaultBattleScore = (): BattleScore => ({
  rounds: { 1: defaultRound(), 2: defaultRound(), 3: defaultRound() },
  overall_winner: null,
  battle_comment: '',
})

// ── Helpers ──────────────────────────────────────────────────────────────────

function roundAvg(rs: RoundScore) {
  let s1 = 0, s2 = 0, count = 0
  for (const cat of CATEGORIES) {
    const w = rs.double_down_category === cat.key ? 2 : 1
    s1 += (rs[`${cat.key}_mc1` as keyof RoundScore] as number) * w
    s2 += (rs[`${cat.key}_mc2` as keyof RoundScore] as number) * w
    count += w
  }
  return { mc1: s1 / count, mc2: s2 / count }
}

function battleAvg(bs: BattleScore) {
  const avgs = [1, 2, 3].map(r => roundAvg(bs.rounds[r]))
  return {
    mc1: avgs.reduce((s, a) => s + a.mc1, 0) / 3,
    mc2: avgs.reduce((s, a) => s + a.mc2, 0) / 3,
  }
}

function isBattleComplete(bs: BattleScore) {
  return bs.overall_winner !== null &&
    [1, 2, 3].every(r => bs.rounds[r]?.round_winner !== null)
}

// ── Props ────────────────────────────────────────────────────────────────────

interface Props {
  user: UserName
  eventId: string
  onBack: () => void
  onSubmitted: (otherAlreadyDone: boolean) => void
}

// ── Main component ───────────────────────────────────────────────────────────

export default function BattleOverview({ user, eventId, onBack, onSubmitted }: Props) {
  const [eventName, setEventName] = useState('')
  const [battles, setBattles] = useState<Battle[]>([])
  const [scores, setScores] = useState<Record<string, BattleScore>>({})
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [activeBattleId, setActiveBattleId] = useState<string | null>(null)

  const otherUser: UserName = user === 'Ben' ? 'Löwe' : 'Ben'

  useEffect(() => {
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, user])

  async function load() {
    try {
      const [{ data: event }, { data: battlesData }] = await Promise.all([
        supabase.from('events').select('name').eq('id', eventId).single(),
        supabase.from('battles').select('*').eq('event_id', eventId).order('position'),
      ])
      setEventName(event?.name ?? '')
      const list: Battle[] = battlesData ?? []
      setBattles(list)

      const ids = list.map(b => b.id)
      if (ids.length === 0) { setLoading(false); return }

      // Check if user already submitted
      const { data: verdicts } = await supabase
        .from('battle_verdicts').select('*').in('battle_id', ids).eq('user_name', user)

      const alreadyDone = (verdicts?.length ?? 0) === ids.length

      let init: Record<string, BattleScore> = {}

      if (alreadyDone) {
        const { data: existingScores } = await supabase
          .from('scores').select('*').in('battle_id', ids).eq('user_name', user)

        for (const b of list) {
          const verdict = verdicts!.find(v => v.battle_id === b.id)
          const bScores = (existingScores ?? []).filter(s => s.battle_id === b.id)
          const rounds: Record<number, RoundScore> = {}
          for (const rn of [1, 2, 3]) {
            const s = bScores.find(s => s.round_number === rn)
            rounds[rn] = s ? {
              bars_mc1: s.bars_mc1, bars_mc2: s.bars_mc2,
              personalisierung_mc1: s.personalisierung_mc1, personalisierung_mc2: s.personalisierung_mc2,
              delivery_mc1: s.delivery_mc1, delivery_mc2: s.delivery_mc2,
              struktur_mc1: s.struktur_mc1, struktur_mc2: s.struktur_mc2,
              crowd_mc1: s.crowd_mc1, crowd_mc2: s.crowd_mc2,
              round_winner: (s.round_winner as RoundWinner) ?? null,
              round_comment: s.round_comment ?? '',
              double_down_category: (s.double_down_category as CategoryKey) ?? null,
            } : defaultRound()
          }
          init[b.id] = {
            rounds,
            overall_winner: (verdict?.overall_winner as OverallWinner) ?? null,
            battle_comment: verdict?.battle_comment ?? '',
          }
        }
        setIsEditing(true)
      } else {
        for (const b of list) init[b.id] = defaultBattleScore()
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
    setSubmitting(true)
    setError(null)
    try {
      for (const b of battles) {
        const bs = scores[b.id]
        for (const round of [1, 2, 3] as const) {
          const rs = bs.rounds[round]
          const { error: e } = await supabase.from('scores').upsert({
            battle_id: b.id, user_name: user, round_number: round,
            bars_mc1: rs.bars_mc1, bars_mc2: rs.bars_mc2,
            personalisierung_mc1: rs.personalisierung_mc1, personalisierung_mc2: rs.personalisierung_mc2,
            delivery_mc1: rs.delivery_mc1, delivery_mc2: rs.delivery_mc2,
            struktur_mc1: rs.struktur_mc1, struktur_mc2: rs.struktur_mc2,
            crowd_mc1: rs.crowd_mc1, crowd_mc2: rs.crowd_mc2,
            round_winner: rs.round_winner,
            round_comment: rs.round_comment || null,
            double_down_category: rs.double_down_category || null,
          }, { onConflict: 'battle_id,user_name,round_number' })
          if (e) throw e
        }
        const { error: ve } = await supabase.from('battle_verdicts').upsert({
          battle_id: b.id, user_name: user,
          overall_winner: bs.overall_winner!,
          battle_comment: bs.battle_comment || null,
        }, { onConflict: 'battle_id,user_name' })
        if (ve) throw ve
      }

      const { data: otherVerdicts } = await supabase
        .from('battle_verdicts').select('battle_id')
        .in('battle_id', battles.map(b => b.id)).eq('user_name', otherUser)

      onSubmitted((otherVerdicts ?? []).length === battles.length)
    } catch {
      setError('Fehler beim Einreichen. Bitte erneut versuchen.')
      setSubmitting(false)
    }
  }

  // ── Render: single battle view ──────────────────────────────────────────────
  if (activeBattleId !== null) {
    const battle = battles.find(b => b.id === activeBattleId)
    if (!battle || !scores[activeBattleId]) return null
    return (
      <SingleBattleView
        battle={battle}
        battleIndex={battles.indexOf(battle)}
        battleCount={battles.length}
        score={scores[activeBattleId]}
        onChange={s => updateScore(activeBattleId, s)}
        onBack={() => setActiveBattleId(null)}
      />
    )
  }

  // ── Render: overview ────────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <p className="text-zinc-600">Lade…</p>
    </div>
  )

  const allComplete = battles.length > 0 && battles.every(b => scores[b.id] && isBattleComplete(scores[b.id]))

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="sticky top-0 bg-black/95 backdrop-blur border-b border-zinc-800 px-4 py-4 flex items-center gap-3 z-10 noise-header">
        <button onClick={onBack} className="text-zinc-400 text-xl w-8 flex-shrink-0">←</button>
        <div className="flex-1 min-w-0">
          <p className="text-zinc-500 text-xs uppercase tracking-widest">
            {isEditing ? 'BEWERTUNG BEARBEITEN' : 'BEWERTUNG'}
          </p>
          <h1 className="text-lg font-black uppercase tracking-tight truncate">{eventName}</h1>
        </div>
      </div>

      <div className="p-4 flex flex-col gap-3 pb-36">
        {battles.map((b, i) => {
          const bs = scores[b.id]
          const done = bs && isBattleComplete(bs)
          return (
            <button
              key={b.id}
              onClick={() => setActiveBattleId(b.id)}
              className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-left active:scale-95 transition-transform w-full"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-zinc-600 text-xs uppercase tracking-wider mb-0.5">Battle {i + 1} · {b.format}</p>
                  <p className="font-black text-white truncate">{b.mc1} vs {b.mc2}</p>
                </div>
                <span className={`text-xs font-bold px-2.5 py-1 rounded ${done ? 'bg-green-500/20 text-green-400' : 'bg-zinc-800 text-zinc-500'}`}>
                  {done ? '✓ FERTIG' : 'OFFEN'}
                </span>
              </div>
              {done && bs && (() => {
                const avg = battleAvg(bs)
                return (
                  <p className="text-xs text-zinc-600 mt-2">
                    {b.mc1} Ø {avg.mc1.toFixed(1)} · {b.mc2} Ø {avg.mc2.toFixed(1)}
                  </p>
                )
              })()}
            </button>
          )
        })}

        {error && (
          <div className="bg-red-900/30 border border-red-800 rounded-lg p-3 text-red-400 text-sm">{error}</div>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-black border-t border-zinc-800">
        {allComplete ? (
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full bg-yellow-400 text-black font-black py-4 rounded-lg uppercase tracking-wider text-sm disabled:opacity-50 active:scale-95 transition-transform"
          >
            {submitting ? 'WIRD EINGEREICHT…' : isEditing ? 'BEWERTUNG AKTUALISIEREN' : 'BEWERTUNG EINREICHEN'}
          </button>
        ) : (
          <div className="text-center text-zinc-600 text-xs uppercase tracking-wider py-3">
            {battles.filter(b => scores[b.id] && isBattleComplete(scores[b.id])).length}/{battles.length} Battles bewertet
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
  onChange: (score: BattleScore) => void
  onBack: () => void
}

function SingleBattleView({ battle, battleIndex, battleCount, score, onChange, onBack }: SingleBattleProps) {
  const setScore = (round: number, field: keyof Omit<RoundScore, 'round_winner' | 'round_comment' | 'double_down_category'>, value: number) => {
    onChange({
      ...score,
      rounds: { ...score.rounds, [round]: { ...score.rounds[round], [field]: value } },
    })
  }

  const setRoundWinner = (round: number, winner: RoundWinner) => {
    onChange({
      ...score,
      rounds: { ...score.rounds, [round]: { ...score.rounds[round], round_winner: winner } },
    })
  }

  const setRoundComment = (round: number, comment: string) => {
    onChange({
      ...score,
      rounds: { ...score.rounds, [round]: { ...score.rounds[round], round_comment: comment } },
    })
  }

  const toggleDoubleDown = (round: number, catKey: CategoryKey) => {
    const current = score.rounds[round].double_down_category
    onChange({
      ...score,
      rounds: { ...score.rounds, [round]: { ...score.rounds[round], double_down_category: current === catKey ? null : catKey } },
    })
  }

  const setOverallWinner = (winner: OverallWinner) => onChange({ ...score, overall_winner: winner })
  const setBattleComment = (c: string) => onChange({ ...score, battle_comment: c })

  const avg = battleAvg(score)

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="sticky top-0 bg-black/95 backdrop-blur border-b border-zinc-800 px-4 py-4 z-10 noise-header">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-zinc-400 text-xl w-8 flex-shrink-0">←</button>
          <div className="flex-1 min-w-0">
            <p className="text-zinc-500 text-xs uppercase tracking-widest">Battle {battleIndex + 1}/{battleCount}</p>
            <h1 className="font-black text-base uppercase tracking-tight truncate">{battle.mc1} vs {battle.mc2}</h1>
          </div>
          <span className="text-zinc-700 text-xs uppercase">{battle.format}</span>
        </div>
      </div>

      <div className="p-4 pb-24 flex flex-col gap-4">
        {[1, 2, 3].map(round => {
          const rs = score.rounds[round]
          const avg = roundAvg(rs)
          return (
            <div key={round} className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
              {/* Round header */}
              <div className="px-4 py-3 bg-zinc-950 border-b border-zinc-800 flex items-center justify-between">
                <span className="font-black text-yellow-400 text-sm uppercase tracking-widest">Runde {round}</span>
                <span className="text-zinc-600 text-xs">
                  {battle.mc1} Ø {avg.mc1.toFixed(1)} · {battle.mc2} Ø {avg.mc2.toFixed(1)}
                </span>
              </div>

              {/* MC name headers */}
              <div className="px-4 pt-3 pb-1 flex justify-between text-xs text-zinc-500 font-bold uppercase tracking-wider">
                <span className="w-[100px] text-center truncate">{battle.mc1}</span>
                <span className="w-[100px] text-center truncate">{battle.mc2}</span>
              </div>

              {/* Categories */}
              <div className="px-4 pb-3 flex flex-col gap-3">
                {CATEGORIES.map(cat => {
                  const mc1Key = `${cat.key}_mc1` as keyof Omit<RoundScore, 'round_winner' | 'round_comment' | 'double_down_category'>
                  const mc2Key = `${cat.key}_mc2` as keyof Omit<RoundScore, 'round_winner' | 'round_comment' | 'double_down_category'>
                  const isDoubled = rs.double_down_category === cat.key
                  return (
                    <div
                      key={cat.key}
                      className={`flex flex-col gap-1.5 p-2 rounded-lg transition-all ${isDoubled ? 'double-down-active bg-yellow-400/5' : ''}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">{cat.label}</span>
                        <button
                          onClick={() => toggleDoubleDown(round, cat.key)}
                          className={`text-xs font-black px-2 py-0.5 rounded transition-colors ${isDoubled ? 'bg-yellow-400 text-black' : 'bg-zinc-800 text-zinc-500'}`}
                        >
                          2×
                        </button>
                      </div>
                      <div className="flex items-center justify-between">
                        <Stepper
                          value={rs[mc1Key] as number}
                          onChange={v => setScore(round, mc1Key, v)}
                        />
                        <Stepper
                          value={rs[mc2Key] as number}
                          onChange={v => setScore(round, mc2Key, v)}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Round winner */}
              <div className="px-4 pb-4 border-t border-zinc-800 pt-3">
                <p className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2">Rundensieger</p>
                <div className="flex gap-2">
                  {(['mc1', 'draw', 'mc2'] as RoundWinner[]).map(w => (
                    <button
                      key={w}
                      onClick={() => setRoundWinner(round, w)}
                      className={`flex-1 py-2.5 rounded text-xs font-black uppercase tracking-wide transition-colors truncate px-1 ${rs.round_winner === w ? 'bg-yellow-400 text-black' : 'bg-zinc-800 text-zinc-400'}`}
                    >
                      {w === 'mc1' ? battle.mc1 : w === 'mc2' ? battle.mc2 : 'Draw'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Round comment */}
              <div className="px-4 pb-4">
                <textarea
                  placeholder="Kommentar zur Runde (optional)"
                  value={rs.round_comment}
                  onChange={e => setRoundComment(round, e.target.value)}
                  rows={2}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white placeholder-zinc-600 focus:outline-none focus:border-yellow-400 text-sm resize-none"
                />
              </div>
            </div>
          )
        })}

        {/* Overall winner + Battle avg */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-black text-sm uppercase tracking-wider">Gesamtsieger</h2>
            <span className="text-zinc-600 text-xs">
              {battle.mc1} Ø {avg.mc1.toFixed(1)} · {battle.mc2} Ø {avg.mc2.toFixed(1)}
            </span>
          </div>
          <div className="flex gap-2">
            {(['mc1', 'mc2'] as OverallWinner[]).map(w => (
              <button
                key={w}
                onClick={() => setOverallWinner(w)}
                className={`flex-1 py-3 rounded font-black uppercase tracking-wide text-sm transition-colors truncate ${score.overall_winner === w ? 'bg-yellow-400 text-black' : 'bg-zinc-800 text-zinc-400'}`}
              >
                {w === 'mc1' ? battle.mc1 : battle.mc2}
              </button>
            ))}
          </div>
        </div>

        {/* Battle comment */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2">Battle-Fazit (optional)</p>
          <textarea
            placeholder="Gesamteindruck, Highlights, Diskussionspunkte…"
            value={score.battle_comment}
            onChange={e => setBattleComment(e.target.value)}
            rows={3}
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white placeholder-zinc-600 focus:outline-none focus:border-yellow-400 text-sm resize-none"
          />
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-black border-t border-zinc-800">
        <button
          onClick={onBack}
          className="w-full bg-zinc-800 text-white font-black py-4 rounded-lg uppercase tracking-wider text-sm active:scale-95 transition-transform"
        >
          ← Zur Übersicht
        </button>
      </div>
    </div>
  )
}
