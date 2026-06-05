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
  const { user, profile, loading: authLoading } = useAuth()
  const isSuperAdmin = useIsSuperAdmin()
  const showPublishing = isSuperAdmin && !roomId
  const canAccess = isSuperAdmin || (profile?.role === 'group_admin' && !!roomId)

  useEffect(() => {
    if (!authLoading && !canAccess) {
      navigate(roomId ? `/room/${roomId}` : '/', { replace: true })
    }
  }, [authLoading, canAccess, navigate, roomId])

  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [location, setLocation] = useState('')
  const [battles, setBattles] = useState<BattleInput[]>([{ mc1: '', mc2: '', format: '1v1' }])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [publishAll, setPublishAll] = useState(true)
  const [selectedRoomIds, setSelectedRoomIds] = useState<Set<string>>(new Set())
  const [publishRooms, setPublishRooms] = useState<{ id: string; name: string }[]>([])
  const [publishError, setPublishError] = useState<string | null>(null)

  interface DebugState {
    profileRole: string | undefined
    showPublishingFlag: boolean
    publishRoomsLoaded: number
    targetIds: string[]
    upsertResult: string
  }
  const [debugInfo, setDebugInfo] = useState<DebugState | null>(null)
  const [successInfo, setSuccessInfo] = useState<{ eventName: string; publishedToCount: number } | null>(null)

  useEffect(() => {
    if (!showPublishing) return
    supabase.from('rooms').select('id, name').order('name')
      .then(({ data, error }) => {
        if (error) {
          console.error('[NewEvent] rooms query failed:', error.code, error.message, error.details)
          setPublishError(`Gruppen konnten nicht geladen werden: ${error.message}`)
        } else {
          console.log('[NewEvent] publishRooms loaded:', data?.length, 'rooms', data)
          setPublishRooms((data ?? []) as { id: string; name: string }[])
        }
      })
  }, [showPublishing])

  const toggleRoom = (rid: string) => {
    setSelectedRoomIds(prev => {
      const next = new Set(prev)
      if (next.has(rid)) next.delete(rid)
      else next.add(rid)
      return next
    })
  }

  const [votingOpensAt, setVotingOpensAt] = useState('')

  const resetForm = () => {
    setName(''); setDate(''); setLocation('')
    setBattles([{ mc1: '', mc2: '', format: '1v1' }])
    setError(null); setPublishError(null); setDebugInfo(null); setSuccessInfo(null)
    setPublishAll(true); setSelectedRoomIds(new Set())
    setVotingOpensAt('')
    setImagePreview(null); setScanStatus('idle'); setScanError(null)
  }

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
    setPublishError(null)
    setDebugInfo(null)
    setSuccessInfo(null)
    try {
      const { data: event, error: eventError } = await supabase
        .from('events')
        .insert({
          name: name.trim(),
          date: date.trim() || null,
          location: location.trim() || null,
          room_id: roomId ?? null,
          voting_opens_at: votingOpensAt ? new Date(votingOpensAt).toISOString() : null,
        })
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

      if (showPublishing) {
        // ── Publishing flow: stay on page, show debug + success ─────────────
        const targetIds = publishAll ? publishRooms.map(r => r.id) : [...selectedRoomIds]
        let upsertResult = 'kein Upsert (targetIds leer)'
        let publishedToCount = 0

        if (targetIds.length > 0) {
          const { data: reData, error: reErr } = await supabase.from('room_events').upsert(
            targetIds.map(rid => ({ room_id: rid, event_id: event.id, added_by: user?.id ?? null })),
            { onConflict: 'room_id,event_id' }
          )
          upsertResult = JSON.stringify({
            data: reData,
            error: reErr ? { code: reErr.code, message: reErr.message, hint: reErr.hint, details: reErr.details } : null,
          }, null, 2)
          if (reErr) {
            setPublishError(`Publish fehlgeschlagen (${reErr.code}): ${reErr.message}`)
          } else {
            publishedToCount = targetIds.length
          }
        }

        setDebugInfo({
          profileRole: profile?.role,
          showPublishingFlag: showPublishing,
          publishRoomsLoaded: publishRooms.length,
          targetIds,
          upsertResult,
        })
        setSuccessInfo({ eventName: event.name, publishedToCount })
        setSaving(false)

      } else if (roomId) {
        // ── Room-based flow: navigate back ───────────────────────────────────
        const { error: reErr } = await supabase.from('room_events').upsert(
          { room_id: roomId, event_id: event.id, added_by: user?.id ?? null },
          { onConflict: 'room_id,event_id' }
        )
        if (reErr) console.error('[NewEvent] room_events upsert failed:', reErr.code, reErr.message)
        navigate(`/room/${roomId}`, { replace: true })
      } else {
        navigate('/', { replace: true })
      }
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

      {/* ── Success Screen ──────────────────────────────────────────────────── */}
      {successInfo && (
        <div className="p-4 flex flex-col gap-5 pt-10">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="w-16 h-16 rounded-full bg-secondary/20 flex items-center justify-center text-3xl">✓</div>
            <div>
              <p className="font-bebas text-2xl text-secondary tracking-wider">Event erfolgreich angelegt</p>
              <p className="font-bebas text-lg text-app-text tracking-wider mt-0.5">{successInfo.eventName}</p>
              {showPublishing && (
                <p className="font-inter text-app-muted text-sm mt-1">
                  In {successInfo.publishedToCount} {successInfo.publishedToCount === 1 ? 'Gruppe' : 'Gruppen'} publiziert
                </p>
              )}
            </div>
          </div>

          {/* ── Debug Block (immer sichtbar nach Submit) ── */}
          {debugInfo && (
            <div className="card border-red-700/50 rounded-lg p-4 bg-red-950/10 flex flex-col gap-1.5">
              <p className="font-bebas text-red-400 tracking-wider text-sm mb-1">DEBUG</p>
              <p className="font-mono text-[10px] text-red-300"><span className="text-red-500">profile.role:</span> {debugInfo.profileRole ?? 'null'}</p>
              <p className="font-mono text-[10px] text-red-300"><span className="text-red-500">showPublishing:</span> {String(debugInfo.showPublishingFlag)}</p>
              <p className="font-mono text-[10px] text-red-300"><span className="text-red-500">publishRooms geladen:</span> {debugInfo.publishRoomsLoaded}</p>
              <p className="font-mono text-[10px] text-red-300"><span className="text-red-500">targetIds ({debugInfo.targetIds.length}):</span> {debugInfo.targetIds.join(', ') || '— leer —'}</p>
              <p className="font-mono text-[10px] text-red-500 mt-1">upsert result:</p>
              <pre className="font-mono text-[9px] text-red-300 whitespace-pre-wrap break-all bg-black/30 rounded p-2">{debugInfo.upsertResult}</pre>
            </div>
          )}

          {publishError && (
            <div className="card border-red-800/50 rounded-lg p-3">
              <p className="text-red-400 font-inter text-sm font-semibold">Publishing-Fehler:</p>
              <p className="text-red-300 font-inter text-sm break-all mt-1">{publishError}</p>
            </div>
          )}

          <div className="flex flex-col gap-3 mt-2">
            <button
              onClick={() => navigate('/backoffice')}
              className="w-full bg-primary font-bebas text-white py-4 rounded-lg tracking-[2px] text-base active:scale-95 transition-transform shadow-lg shadow-primary/30"
            >
              Zum Backoffice
            </button>
            <button
              onClick={resetForm}
              className="w-full card font-bebas text-app-text py-4 rounded-lg tracking-[2px] text-base active:scale-95 transition-transform"
            >
              Weiteres Event anlegen
            </button>
          </div>
        </div>
      )}

      {/* ── Form ─────────────────────────────────────────────────────────────── */}
      {!successInfo && <div className="p-4 flex flex-col gap-6 pb-32">

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

        {/* Voting Freigabe */}
        <div className="flex flex-col gap-3">
          <label className="font-inter text-[10px] uppercase tracking-[0.1em] text-app-muted">Voting Freigabe (optional)</label>
          <div className="flex gap-2">
            <button onClick={() => setVotingOpensAt('')}
              className={`flex-1 py-2 rounded font-bebas tracking-[1px] text-sm transition-colors ${!votingOpensAt ? 'bg-primary text-white' : 'bg-white/10 text-app-muted'}`}>
              Sofort
            </button>
            <button onClick={() => { if (!votingOpensAt) setVotingOpensAt(new Date().toISOString().slice(0, 16)) }}
              className={`flex-1 py-2 rounded font-bebas tracking-[1px] text-sm transition-colors ${votingOpensAt ? 'bg-primary text-white' : 'bg-white/10 text-app-muted'}`}>
              Ab Datum
            </button>
          </div>
          {votingOpensAt && (
            <input type="datetime-local" value={votingOpensAt} onChange={e => setVotingOpensAt(e.target.value)} className={inputCls} />
          )}
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
              <div className="flex items-center gap-2 min-w-0">
                <input type="text" placeholder="MC 1" value={battle.mc1} onChange={e => updateBattle(i, 'mc1', e.target.value)}
                  className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded px-3 py-2.5 text-app-text placeholder-app-muted/50 focus:outline-none focus:border-primary/50 font-inter text-sm" />
                <span className="font-bebas text-app-muted tracking-wider flex-shrink-0">vs</span>
                <input type="text" placeholder="MC 2" value={battle.mc2} onChange={e => updateBattle(i, 'mc2', e.target.value)}
                  className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded px-3 py-2.5 text-app-text placeholder-app-muted/50 focus:outline-none focus:border-primary/50 font-inter text-sm" />
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

        {/* Publizieren (nur super_admin ohne roomId) */}
        {showPublishing && (
          <div className="flex flex-col gap-3">
            <label className="font-inter text-[10px] uppercase tracking-[0.1em] text-app-muted">Publizieren</label>
            <div className="flex gap-2">
              {(['all', 'select'] as const).map(mode => (
                <button key={mode} onClick={() => setPublishAll(mode === 'all')}
                  className={`flex-1 py-2 rounded font-bebas tracking-[1px] text-sm transition-colors ${publishAll === (mode === 'all') ? 'bg-primary text-white' : 'bg-white/10 text-app-muted'}`}>
                  {mode === 'all' ? 'Alle Gruppen' : 'Auswählen'}
                </button>
              ))}
            </div>
            {publishAll ? (
              publishRooms.length > 0 && (
                <p className="font-inter text-[10px] text-app-muted/60 uppercase tracking-[0.1em]">
                  Wird in {publishRooms.length} {publishRooms.length === 1 ? 'Gruppe' : 'Gruppen'} publiziert
                </p>
              )
            ) : (
              <div className="flex flex-col gap-2">
                {publishRooms.length === 0 ? (
                  <p className="font-inter text-app-muted text-xs text-center py-2">Noch keine Gruppen vorhanden.</p>
                ) : publishRooms.map(room => (
                  <button key={room.id} onClick={() => toggleRoom(room.id)}
                    className={`card rounded-lg px-4 py-3 flex items-center gap-3 text-left w-full active:scale-95 transition-transform ${selectedRoomIds.has(room.id) ? 'border-primary/40' : ''}`}>
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${selectedRoomIds.has(room.id) ? 'bg-primary border-primary' : 'border-white/30'}`}>
                      {selectedRoomIds.has(room.id) && <span className="text-white font-inter text-[10px] leading-none">✓</span>}
                    </div>
                    <span className="font-bebas text-base text-app-text tracking-wider">{room.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {publishError && (
          <div className="card border-red-800/50 rounded-lg p-3 font-inter text-sm">
            <p className="text-red-400 font-semibold mb-1">Publishing-Fehler:</p>
            <p className="text-red-300 break-all">{publishError}</p>
          </div>
        )}

        {error && <div className="card border-red-800/50 rounded-lg p-3 text-red-400 font-inter text-sm">{error}</div>}
      </div>}

      {!successInfo && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-app-bg/90 backdrop-blur border-t border-white/5">
          <button onClick={handleSubmit} disabled={saving || scanning}
            className="w-full bg-primary font-bebas text-app-text py-4 rounded-lg tracking-[2px] text-base disabled:opacity-50 active:scale-95 transition-transform shadow-lg shadow-primary/30">
            {saving ? 'Speichern…' : 'Event erstellen'}
          </button>
        </div>
      )}
    </div>
  )
}
