import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth, useIsSuperAdmin } from '../context/AuthContext'
import type { RoomMode } from '../types'

export default function CreateRoom() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const isSuperAdmin = useIsSuperAdmin()

  const [name, setName] = useState('')
  const [roomMode, setRoomMode] = useState<RoomMode>('auto')
  const [expertUserId, setExpertUserId] = useState('')
  const [allProfiles, setAllProfiles] = useState<{ id: string; display_name: string }[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [debugInfo, setDebugInfo] = useState<string | null>(null)

  useEffect(() => {
    if (!isSuperAdmin || roomMode !== 'expert') return
    supabase.from('profiles').select('id, display_name').order('display_name')
      .then(({ data }) => setAllProfiles((data ?? []) as { id: string; display_name: string }[]))
  }, [isSuperAdmin, roomMode])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (name.trim().length < 3) { setError('Gruppenname muss mindestens 3 Zeichen haben.'); return }
    if (roomMode === 'expert' && !expertUserId) { setError('Bitte einen Expert auswählen.'); return }

    setSaving(true)
    setError(null)
    try {
      const { data: room, error: roomErr } = await supabase
        .from('rooms')
        .insert({
          name: name.trim(),
          created_by: user!.id,
          mode: roomMode,
          expert_user_id: roomMode === 'expert' ? expertUserId : null,
        })
        .select()
        .single()
      if (roomErr) {
        setDebugInfo(`rooms INSERT\ncode: ${roomErr.code}\nmessage: ${roomErr.message}\ndetails: ${roomErr.details ?? '–'}\nhint: ${roomErr.hint ?? '–'}`)
        throw roomErr
      }

      const { error: memberErr } = await supabase
        .from('room_members')
        .insert({ room_id: room.id, user_id: user!.id })
      if (memberErr) {
        setDebugInfo(`room_members INSERT\ncode: ${memberErr.code}\nmessage: ${memberErr.message}\ndetails: ${memberErr.details ?? '–'}\nhint: ${memberErr.hint ?? '–'}`)
        throw memberErr
      }

      navigate(`/room/${room.id}`, { replace: true })
    } catch (e) {
      const msg = e instanceof Error ? e.message : JSON.stringify(e)
      setError(msg)
      setSaving(false)
    }
  }

  const inputCls = "w-full bg-white/5 border border-white/10 rounded px-4 py-3.5 text-app-text placeholder-app-muted/50 focus:outline-none focus:border-primary/50 font-inter text-sm"

  return (
    <div className="min-h-screen">
      <div className="sticky top-0 bg-app-bg/90 backdrop-blur border-b border-white/5 px-4 py-4 flex items-center gap-3 z-10 noise-header">
        <button onClick={() => navigate('/')} className="text-app-muted text-xl w-8">←</button>
        <h1 className="font-bebas text-xl text-app-text tracking-wider">Neue Gruppe</h1>
      </div>

      <div className="p-4">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 max-w-sm">
          {/* Gruppenname */}
          <div>
            <label className="font-inter text-[10px] uppercase tracking-[0.1em] text-app-muted block mb-2">
              Gruppenname
            </label>
            <input
              type="text"
              placeholder="z.B. Ben & Löwe"
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
              className={inputCls}
            />
          </div>

          {/* Bewertungs-Modus (nur Super Admin) */}
          {isSuperAdmin && (
            <div className="flex flex-col gap-3">
              <label className="font-inter text-[10px] uppercase tracking-[0.1em] text-app-muted">Raum-Modus</label>
              <div className="flex gap-2">
                {([
                  { value: 'auto' as RoomMode, label: 'Auto', sub: '2 → 1v1 · 3+ → Community' },
                  { value: 'expert' as RoomMode, label: 'Expert', sub: 'Judge vs. Publikum' },
                ]).map(m => (
                  <button key={m.value} type="button" onClick={() => setRoomMode(m.value)}
                    className={`flex-1 py-2.5 px-2 rounded-lg text-center transition-colors active:scale-95 ${roomMode === m.value ? 'bg-primary text-white' : 'bg-white/10 text-app-muted'}`}>
                    <p className="font-bebas text-sm tracking-[1px] leading-tight">{m.label}</p>
                    <p className="font-inter text-[9px] opacity-70 leading-tight mt-0.5">{m.sub}</p>
                  </button>
                ))}
              </div>

              {roomMode === 'expert' && (
                <div className="flex flex-col gap-2">
                  <p className="font-inter text-[10px] text-app-muted/60">Der Expert bewertet unabhängig — alle anderen sind Community.</p>
                  <select
                    value={expertUserId}
                    onChange={e => setExpertUserId(e.target.value)}
                    className={inputCls}
                  >
                    <option value="">Expert auswählen…</option>
                    {allProfiles.map(p => (
                      <option key={p.id} value={p.id}>{p.display_name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {(error || debugInfo) && (
            <div className="bg-red-950 border border-red-700 rounded-lg p-4 flex flex-col gap-2">
              {error && <p className="font-inter text-red-300 text-sm font-bold">{error}</p>}
              {debugInfo && (
                <pre className="font-mono text-red-400 text-xs whitespace-pre-wrap break-all">{debugInfo}</pre>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={saving || name.trim().length < 3}
            className="w-full bg-primary font-bebas text-white py-4 rounded-lg tracking-[2px] text-base disabled:opacity-50 active:scale-95 transition-transform shadow-lg shadow-primary/30 mt-2"
          >
            {saving ? 'Erstellen…' : 'Gruppe erstellen'}
          </button>

          <p className="font-inter text-app-muted text-xs text-center">
            Du kannst danach andere per Einladungslink hinzufügen.
          </p>
        </form>
      </div>
    </div>
  )
}
