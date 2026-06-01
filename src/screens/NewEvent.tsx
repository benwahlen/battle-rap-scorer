import { useRef, useState } from 'react'
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

const SUPPORTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

async function analyzeBattlecard(file: File): Promise<{
  name?: string
  location?: string
  date?: string
  battles?: { mc1: string; mc2: string; format: string }[]
}> {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY as string
  if (!apiKey) throw new Error('VITE_ANTHROPIC_API_KEY nicht konfiguriert')

  const base64 = await fileToBase64(file)
  const mediaType = file.type as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-client-side-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: base64 },
            },
            {
              type: 'text',
              text: 'Das ist eine Battle Rap Battlecard. Extrahiere: 1) Event-Name, 2) Ort/Stadt, 3) Datum falls sichtbar, 4) alle Battles als Liste mit MC1 vs MC2 und Format (1v1 oder 2v2). Antworte nur als JSON: {name, location, date, battles: [{mc1, mc2, format}]}',
            },
          ],
        },
      ],
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { message?: string } }
    throw new Error(err.error?.message ?? `API-Fehler ${res.status}`)
  }

  const data = await res.json() as { content: { type: string; text: string }[] }
  const text = data.content?.[0]?.text ?? ''
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('Kein JSON in der Antwort')
  return JSON.parse(match[0]) as ReturnType<typeof analyzeBattlecard> extends Promise<infer T> ? T : never
}

export default function NewEvent({ onBack, onCreated }: Props) {
  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [location, setLocation] = useState('')
  const [battles, setBattles] = useState<BattleInput[]>([{ mc1: '', mc2: '', format: '1v1' }])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [scanStatus, setScanStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [scanError, setScanError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!SUPPORTED_TYPES.includes(file.type)) {
      setScanStatus('error')
      setScanError('Nicht unterstütztes Format. Bitte JPEG, PNG oder WebP verwenden.')
      return
    }

    // Show preview immediately
    const reader = new FileReader()
    reader.onload = (ev) => setImagePreview(ev.target?.result as string)
    reader.readAsDataURL(file)

    setScanning(true)
    setScanStatus('idle')
    setScanError(null)

    try {
      const extracted = await analyzeBattlecard(file)
      if (extracted.name) setName(extracted.name)
      if (extracted.location) setLocation(extracted.location)
      if (extracted.date) setDate(extracted.date)
      if (extracted.battles && extracted.battles.length > 0) {
        setBattles(
          extracted.battles.map((b) => ({
            mc1: b.mc1 ?? '',
            mc2: b.mc2 ?? '',
            format: b.format === '2v2' ? '2v2' : '1v1',
          }))
        )
      }
      setScanStatus('success')
    } catch (e) {
      setScanStatus('error')
      setScanError(e instanceof Error ? e.message : 'Analyse fehlgeschlagen.')
    } finally {
      setScanning(false)
    }
  }

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

        {/* Battlecard Scanner */}
        <div className="flex flex-col gap-3">
          <label className="text-zinc-500 text-xs font-semibold uppercase tracking-wider">
            Battlecard scannen
          </label>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageChange}
            className="hidden"
          />

          {!imagePreview ? (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-zinc-700 rounded-2xl py-8 flex flex-col items-center gap-2 active:scale-95 transition-transform"
            >
              <span className="text-3xl">📷</span>
              <span className="text-zinc-400 font-medium text-sm">Battlecard-Foto hochladen</span>
              <span className="text-zinc-600 text-xs">Formular wird automatisch ausgefüllt</span>
            </button>
          ) : (
            <div className="flex flex-col gap-3">
              {/* Image preview */}
              <div className="relative rounded-2xl overflow-hidden border border-zinc-800">
                <img src={imagePreview} alt="Battlecard" className="w-full object-contain max-h-48" />
                {scanning && (
                  <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-2">
                    <div className="w-8 h-8 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
                    <span className="text-yellow-400 text-sm font-medium">Analysiere Battlecard…</span>
                  </div>
                )}
              </div>

              {/* Scan result banner */}
              {scanStatus === 'success' && (
                <div className="bg-green-900/30 border border-green-800 rounded-xl px-4 py-3 flex items-center gap-2">
                  <span className="text-green-400 text-base">✓</span>
                  <span className="text-green-400 text-sm">Formular ausgefüllt — bitte prüfen und ggf. korrigieren.</span>
                </div>
              )}
              {scanStatus === 'error' && (
                <div className="bg-red-900/30 border border-red-800 rounded-xl px-4 py-3 flex items-center gap-2">
                  <span className="text-red-400 text-sm">{scanError ?? 'Analyse fehlgeschlagen.'}</span>
                </div>
              )}

              <button
                onClick={() => {
                  setImagePreview(null)
                  setScanStatus('idle')
                  setScanError(null)
                  if (fileInputRef.current) fileInputRef.current.value = ''
                }}
                className="text-zinc-600 text-xs text-center"
              >
                Anderes Bild wählen
              </button>
            </div>
          )}
        </div>

        {/* Event Details */}
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

        {/* Battles */}
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
          disabled={saving || scanning}
          className="w-full bg-yellow-400 text-black font-black py-4 rounded-2xl text-base disabled:opacity-50 active:scale-95 transition-transform"
        >
          {saving ? 'Speichern…' : 'Event erstellen'}
        </button>
      </div>
    </div>
  )
}
