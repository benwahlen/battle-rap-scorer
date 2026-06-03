import { useRef, useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth, useIsSuperAdmin } from '../context/AuthContext'

interface BattleInput {
  mc1: string
  mc2: string
  format: '1v1' | '2v2'
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
  const base64 = await fileToBase64(file)

  let res: Response
  try {
    res = await fetch('/api/analyze-battlecard', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ base64, mediaType: file.type }),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`Netzwerkfehler: ${msg} — Ist die App auf Vercel deployed?`)
  }

  const text = await res.text()
  let parsed: { error?: string; [key: string]: unknown }
  try {
    parsed = JSON.parse(text) as { error?: string; [key: string]: unknown }
  } catch {
    throw new Error(`Ungültige Server-Antwort (HTTP ${res.status}): ${text.slice(0, 120)}`)
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${parsed.error ?? text.slice(0, 120)}`)
  }

  return parsed as ReturnType<typeof analyzeBattlecard> extends Promise<infer T> ? T : never
}

export default function NewEvent() {
  const { roomId } = useParams<{ roomId: string }>()
  const navigate = useNavigate()
  const { user, loading: authLoading } = useAuth()
  const isSuperAdmin = useIsSuperAdmin()

  useEffect(() => {
    if (!authLoading && !isSuperAdmin) {
      navigate(roomId ? `/room/${roomId}` : '/', { replace: true })
    }
  }, [authLoading, isSuperAdmin, navigate, roomId])

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
        .insert({ name: name.trim(), date: date.trim() || null, location: location.trim() || null, room_id: roomId ?? null })
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

      if (roomId) {
        await supabase.from('room_events').upsert(
          { room_id: roomId, event_id: event.id, added_by: user?.id ?? null },
          { onConflict: 'room_id,event_id' }
        )
      }

      navigate(roomId ? `/room/${roomId}` : '/', { replace: true })
    } catch {
      setError('Fehler beim Speichern. Bitte erneut versuchen.')
      setSaving(false)
    }
  }

  const inputCls = "w-full bg-white/5 border border-white/10 rounded px-4 py-3.5 text-app-text placeholder-app-muted/50 focus:outline-none focus:border-primary/50 font-inter text-sm"

  return (
    <div className="min-h-screen">
      <div className="sticky top-0 bg-app-bg/90 backdrop-blur border-b border-white/5 px-4 py-4 flex items-center gap-3 z-10 noise-header">
        <button onClick={() => navigate(roomId ? `/room/${roomId}` : '/')} className="text-app-muted text-xl w-8">←</button>
        <h1 className="font-bebas text-xl text-app-text tracking-wider">Neues Event</h1>
      </div>

      <div className="p-4 flex flex-col gap-6 pb-32">

        {/* Battlecard Scanner */}
        <div className="flex flex-col gap-3">
          <label className="font-inter text-[10px] uppercase tracking-[0.1em] text-app-muted">Battlecard scannen</label>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageChange} className="hidden" />

          {!imagePreview ? (
            <button onClick={() => fileInputRef.current?.click()}
              className="card rounded-lg border-dashed border-primary/30 py-8 flex flex-col items-center gap-2 active:scale-95 transition-transform">
              <span className="text-3xl">📷</span>
              <span className="font-bebas text-base text-app-text tracking-wider">Battlecard-Foto hochladen</span>
              <span className="font-inter text-[10px] text-app-muted uppercase tracking-[0.1em]">Formular wird automatisch ausgefüllt</span>
            </button>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="relative rounded-lg overflow-hidden border border-white/10">
                <img src={imagePreview} alt="Battlecard" className="w-full object-contain max-h-48" />
                {scanning && (
                  <div className="absolute inset-0 bg-app-bg/80 flex flex-col items-center justify-center gap-2">
                    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    <span className="font-inter text-primary text-sm">Analysiere Battlecard…</span>
                  </div>
                )}
              </div>
              {scanStatus === 'success' && (
                <div className="card border-secondary/30 rounded-lg px-4 py-3 flex items-center gap-2">
                  <span className="text-secondary">✓</span>
                  <span className="font-inter text-secondary text-sm">Formular ausgefüllt — bitte prüfen und ggf. korrigieren.</span>
                </div>
              )}
              {scanStatus === 'error' && (
                <div className="card border-red-800/50 rounded-lg px-4 py-3">
                  <span className="font-inter text-red-400 text-sm">{scanError ?? 'Analyse fehlgeschlagen.'}</span>
                </div>
              )}
              <button onClick={() => { setImagePreview(null); setScanStatus('idle'); setScanError(null); if (fileInputRef.current) fileInputRef.current.value = '' }}
                className="font-inter text-app-muted text-xs text-center">
                Anderes Bild wählen
              </button>
            </div>
          )}
        </div>

        {/* Event Details */}
        <div className="flex flex-col gap-3">
          <label className="font-inter text-[10px] uppercase tracking-[0.1em] text-app-muted">Event</label>
          <input type="text" placeholder="Event-Name *" value={name} onChange={e => setName(e.target.value)} className={inputCls} />
          <input type="text" placeholder="Datum (z.B. 15.06.2025)" value={date} onChange={e => setDate(e.target.value)} className={inputCls} />
          <input type="text" placeholder="Ort (optional)" value={location} onChange={e => setLocation(e.target.value)} className={inputCls} />
        </div>

        {/* Battles */}
        <div className="flex flex-col gap-3">
          <label className="font-inter text-[10px] uppercase tracking-[0.1em] text-app-muted">Battles</label>
          {battles.map((battle, i) => (
            <div key={i} className="card rounded-lg p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="font-inter text-[10px] uppercase tracking-[0.1em] text-app-muted">Battle {i + 1}</span>
                {battles.length > 1 && (
                  <button onClick={() => setBattles(prev => prev.filter((_, idx) => idx !== i))}
                    className="text-app-muted text-base w-7 h-7 flex items-center justify-center">✕</button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <input type="text" placeholder="MC 1" value={battle.mc1} onChange={e => updateBattle(i, 'mc1', e.target.value)}
                  className="flex-1 bg-white/5 border border-white/10 rounded px-3 py-2.5 text-app-text placeholder-app-muted/50 focus:outline-none focus:border-primary/50 font-inter text-sm" />
                <span className="font-bebas text-app-muted tracking-wider">vs</span>
                <input type="text" placeholder="MC 2" value={battle.mc2} onChange={e => updateBattle(i, 'mc2', e.target.value)}
                  className="flex-1 bg-white/5 border border-white/10 rounded px-3 py-2.5 text-app-text placeholder-app-muted/50 focus:outline-none focus:border-primary/50 font-inter text-sm" />
              </div>
              <div className="flex gap-2">
                {(['1v1', '2v2'] as const).map(fmt => (
                  <button key={fmt} onClick={() => updateBattle(i, 'format', fmt)}
                    className={`flex-1 py-2 rounded font-bebas tracking-[2px] text-sm transition-colors ${battle.format === fmt ? 'bg-primary text-white' : 'bg-white/10 text-app-muted'}`}>
                    {fmt}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <button onClick={() => setBattles(prev => [...prev, { mc1: '', mc2: '', format: '1v1' }])}
            className="card border-dashed border-primary/20 rounded-lg py-4 font-inter text-app-muted text-sm active:scale-95 transition-transform">
            + Battle hinzufügen
          </button>
        </div>

        {error && <div className="card border-red-800/50 rounded-lg p-3 text-red-400 font-inter text-sm">{error}</div>}
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-app-bg/90 backdrop-blur border-t border-white/5">
        <button onClick={handleSubmit} disabled={saving || scanning}
          className="w-full bg-primary font-bebas text-app-text py-4 rounded-lg tracking-[2px] text-base disabled:opacity-50 active:scale-95 transition-transform shadow-lg shadow-primary/30">
          {saving ? 'Speichern…' : 'Event erstellen'}
        </button>
      </div>
    </div>
  )
}
