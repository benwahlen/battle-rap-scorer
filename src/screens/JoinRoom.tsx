import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

type State = 'loading' | 'join' | 'joining' | 'done' | 'already-member' | 'not-found' | 'error' | 'needs-login'

export default function JoinRoom() {
  const { inviteCode } = useParams<{ inviteCode: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [state, setState] = useState<State>('loading')
  const [roomName, setRoomName] = useState('')
  const [roomId, setRoomId] = useState('')

  useEffect(() => {
    if (!inviteCode) { setState('not-found'); return }

    // Not logged in → save invite code and prompt login
    if (!user) {
      sessionStorage.setItem('pendingInvite', inviteCode)
      setState('needs-login')
      return
    }

    checkRoom()
  }, [inviteCode, user]) // eslint-disable-line react-hooks/exhaustive-deps

  async function checkRoom() {
    if (!inviteCode) return
    setState('loading')
    try {
      // Find room by invite code
      const { data: room, error } = await supabase
        .from('rooms').select('id, name').eq('invite_code', inviteCode).single()
      if (error || !room) { setState('not-found'); return }

      setRoomName(room.name)
      setRoomId(room.id)

      // Check if already a member
      const { data: existing } = await supabase
        .from('room_members').select('id')
        .eq('room_id', room.id).eq('user_id', user!.id).maybeSingle()

      if (existing) {
        setState('already-member')
        setTimeout(() => navigate(`/room/${room.id}`, { replace: true }), 1500)
      } else {
        setState('join')
      }
    } catch {
      setState('error')
    }
  }

  async function joinRoom() {
    setState('joining')
    try {
      const { error } = await supabase
        .from('room_members').insert({ room_id: roomId, user_id: user!.id })
      if (error) throw error
      setState('done')
      setTimeout(() => navigate(`/room/${roomId}`, { replace: true }), 1200)
    } catch {
      setState('error')
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
      {state === 'loading' && (
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      )}

      {state === 'needs-login' && (
        <div className="flex flex-col items-center gap-5 max-w-xs">
          <div className="text-5xl">🔗</div>
          <h2 className="font-bebas text-2xl text-app-text tracking-wider">Einladungslink</h2>
          <p className="font-inter text-app-muted text-sm">
            Du musst eingeloggt sein um einer Gruppe beizutreten.
          </p>
          <button
            onClick={() => navigate('/')}
            className="w-full bg-primary font-bebas text-white py-4 rounded-lg tracking-[2px] text-base active:scale-95 transition-transform shadow-lg shadow-primary/30"
          >
            Einloggen / Registrieren
          </button>
        </div>
      )}

      {state === 'not-found' && (
        <div className="flex flex-col items-center gap-4 max-w-xs">
          <div className="text-5xl">🤔</div>
          <h2 className="font-bebas text-2xl text-app-text tracking-wider">Link ungültig</h2>
          <p className="font-inter text-app-muted text-sm">Dieser Einladungslink existiert nicht oder ist abgelaufen.</p>
          <button onClick={() => navigate('/')} className="font-inter text-primary text-sm underline">Zum Dashboard</button>
        </div>
      )}

      {state === 'already-member' && (
        <div className="flex flex-col items-center gap-4 max-w-xs">
          <div className="text-5xl">✅</div>
          <h2 className="font-bebas text-2xl text-secondary tracking-wider">Du bist bereits Mitglied!</h2>
          <p className="font-inter text-app-muted text-sm">Du wirst weitergeleitet…</p>
        </div>
      )}

      {state === 'join' && (
        <div className="flex flex-col items-center gap-5 max-w-xs">
          <div className="text-5xl">🎤</div>
          <div>
            <h2 className="font-bebas text-2xl text-app-text tracking-wider">Einladung</h2>
            <p className="font-inter text-app-muted text-sm mt-1">
              Du wurdest zur Gruppe eingeladen:
            </p>
            <p className="font-bebas text-xl text-primary tracking-wider mt-2">{roomName}</p>
          </div>
          <button
            onClick={joinRoom}
            className="w-full bg-primary font-bebas text-white py-4 rounded-lg tracking-[2px] text-base active:scale-95 transition-transform shadow-lg shadow-primary/30"
          >
            Gruppe beitreten
          </button>
          <button onClick={() => navigate('/')} className="font-inter text-app-muted text-xs">
            Abbrechen
          </button>
        </div>
      )}

      {state === 'joining' && (
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="font-inter text-app-muted text-sm">Trete bei…</p>
        </div>
      )}

      {state === 'done' && (
        <div className="flex flex-col items-center gap-4 max-w-xs">
          <div className="text-5xl">🎉</div>
          <h2 className="font-bebas text-2xl text-secondary tracking-wider">Beigetreten!</h2>
          <p className="font-inter text-app-muted text-sm">Du wirst weitergeleitet…</p>
        </div>
      )}

      {state === 'error' && (
        <div className="flex flex-col items-center gap-4 max-w-xs">
          <div className="text-5xl">⚠️</div>
          <p className="font-inter text-red-400 text-sm">Ein Fehler ist aufgetreten.</p>
          <button onClick={checkRoom} className="font-inter text-primary text-sm underline">Erneut versuchen</button>
          <button onClick={() => navigate('/')} className="font-inter text-app-muted text-xs">Zum Dashboard</button>
        </div>
      )}
    </div>
  )
}
