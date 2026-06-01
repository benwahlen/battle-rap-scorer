import { useState } from 'react'
import { supabase } from '../lib/supabase'

interface BattleInput {
  mc1: string
  mc2: string
  format: '1v1' | '2v2'
}

interface Props {
  onBack: () => void
  onCreated: () => void
}

export default function NewEvent({ onBack, onCreated }: Props) {
  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [location, setLocation] = useState('')
  const [battles, setBattles] = useState<BattleInput[]>([{ mc1: '', mc2: '', format: '1v1' }])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const updateBattle = (index: number, field: keyof BattleInput, value: string) => {
    setBattles((prev) => prev.map((b, i) => (i === index ? { ...b, [field]: value } : b)))
  }

  const handleSubmit = async () => {
    if (!name.trim()) { setError('Event-Name ist erforderlich.'); return }
    const validBattles = battles.filter((b) => b.mc1.trim() && b.mc2.trim())
    if (validBattles.length === 0) { setError('Mindestens ein Battle mit beiden MC-Namen ist erforderlich.'); return }

    setSaving(true)
    setError(null)
    try {
      const { data: event, error: eventError } = await supabase
        .from('events')
        .insert({ name: name.trim(), date: date.trim() || null, location: location.trim() || null })
        .select()
        .single()
      if (eventError) throw eventError

      const { error: battlesError } = await supabase.from('battles').insert(
        validBattles.map((b, i) => ({
          event_id: event.id,
          mc1: b.mc1.trim(),
          mc2: b.mc2.trim(),
          format: b.format,
          position: i,
        }))
      )
      if (battlesError) throw battlesError

      onCreated()
    } catch {
      setError('Fehler beim Speichern. Bitte erneut versuchen.')
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="sticky top-0 bg-black/95 backdrop-blur border-b border-zinc-900 px-4 py-4 flex items-center gap-3 z-10">
        <button onClick={onBack} className="text-zinc-400 text-xl w-8">←</button>
        <h1 className="text-xl font-black">Neues Event</h1>
      </div>

      <div className="p-4 flex flex-col gap-6 pb-32">
        <div className="flex flex-col gap-3">
          <label className="text-zinc-500 text-xs font-semibold uppercase tracking-wider">Event</label>
          <input
            type="text"
            placeholder="Event-Name *"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3.5 text-white placeholder-zinc-600 focus:outline-none focus:border-yellow-400"
          />
          <input
            type="text"
            placeholder="Datum (z.B. 15.06.2025)"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3.5 text-white placeholder-zinc-600 focus:outline-none focus:border-yellow-400"
          />
          <input
            type="text"
            placeholder="Ort (optional)"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3.5 text-white placeholder-zinc-600 focus:outline-none focus:border-yellow-400"
          />
        </div>

        <div className="flex flex-col gap-3">
          <label className="text-zinc-500 text-xs font-semibold uppercase tracking-wider">Battles</label>
          {battles.map((battle, i) => (
            <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-zinc-500 text-sm font-medium">Battle {i + 1}</span>
                {battles.length > 1 && (
                  <button
                    onClick={() => setBattles((prev) => prev.filter((_, idx) => idx !== i))}
                    className="text-zinc-600 text-base w-7 h-7 flex items-center justify-center"
                  >
                    ✕
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="MC 1"
                  value={battle.mc1}
                  onChange={(e) => updateBattle(i, 'mc1', e.target.value)}
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-white placeholder-zinc-600 focus:outline-none focus:border-yellow-400 text-sm"
                />
                <span className="text-zinc-600 font-bold text-sm">vs</span>
                <input
                  type="text"
                  placeholder="MC 2"
                  value={battle.mc2}
                  onChange={(e) => updateBattle(i, 'mc2', e.target.value)}
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-white placeholder-zinc-600 focus:outline-none focus:border-yellow-400 text-sm"
                />
              </div>
              <div className="flex gap-2">
                {(['1v1', '2v2'] as const).map((fmt) => (
                  <button
                    key={fmt}
                    onClick={() => updateBattle(i, 'format', fmt)}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                      battle.format === fmt ? 'bg-yellow-400 text-black' : 'bg-zinc-800 text-zinc-400'
                    }`}
                  >
                    {fmt}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <button
            onClick={() => setBattles((prev) => [...prev, { mc1: '', mc2: '', format: '1v1' }])}
            className="border border-dashed border-zinc-700 rounded-2xl py-4 text-zinc-500 text-sm active:scale-95 transition-transform"
          >
            + Battle hinzufügen
          </button>
        </div>

        {error && (
          <div className="bg-red-900/30 border border-red-800 rounded-xl p-3 text-red-400 text-sm">{error}</div>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-black border-t border-zinc-900">
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="w-full bg-yellow-400 text-black font-black py-4 rounded-2xl text-base disabled:opacity-50 active:scale-95 transition-transform"
        >
          {saving ? 'Speichern…' : 'Event erstellen'}
        </button>
      </div>
    </div>
  )
}
