import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export default function CreateRoom() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (name.trim().length < 3) { setError('Gruppenname muss mindestens 3 Zeichen haben.'); return }

    setSaving(true)
    setError(null)
    try {
      // Create room
      const { data: room, error: roomErr } = await supabase
        .from('rooms')
        .insert({ name: name.trim(), created_by: user!.id })
        .select()
        .single()
      if (roomErr) { console.error('[CreateRoom] rooms insert:', roomErr.code, roomErr.message, roomErr.details); throw roomErr }

      // Add creator as member
      const { error: memberErr } = await supabase
        .from('room_members')
        .insert({ room_id: room.id, user_id: user!.id })
      if (memberErr) { console.error('[CreateRoom] room_members insert:', memberErr.code, memberErr.message, memberErr.details); throw memberErr }

      navigate(`/room/${room.id}`, { replace: true })
    } catch (e) {
      console.error('[CreateRoom] caught:', e)
      setError('Fehler beim Erstellen. Bitte erneut versuchen.')
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen">
      <div className="sticky top-0 bg-app-bg/90 backdrop-blur border-b border-white/5 px-4 py-4 flex items-center gap-3 z-10 noise-header">
        <button onClick={() => navigate('/')} className="text-app-muted text-xl w-8">←</button>
        <h1 className="font-bebas text-xl text-app-text tracking-wider">Neue Gruppe</h1>
      </div>

      <div className="p-4">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 max-w-sm">
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
              className="w-full bg-white/5 border border-white/10 rounded px-4 py-3.5 text-app-text placeholder-app-muted/50 focus:outline-none focus:border-primary/50 font-inter text-sm"
            />
          </div>

          {error && <p className="font-inter text-red-400 text-sm">{error}</p>}

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
