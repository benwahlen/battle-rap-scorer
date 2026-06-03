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
  const [debugError, setDebugError] = useState<string | null>(null)

  useEffect(() => {
    if (!inviteCode) { setState('not-found'); return }
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
    setDebugError(null)
    try {
      // Step 1: find room by invite_code
      const { data: room, error: roomErr } = await supabase
        .from('rooms').select('id, name').eq('invite_code', inviteCode).single()

      if (roomErr) {
        const msg = `rooms lookup\ncode: ${roomErr.code}\nmessage: ${roomErr.message}\nhint: ${roomErr.hint ?? '–'}`
        console.error('[JoinRoom] checkRoom rooms lookup:', roomErr)
        setDebugError(msg)
        setState('error')
        return
      }
      if (!room) {
        console.error('[JoinRoom] no room found for invite_code:', inviteCode)
        setState('not-found')
        return
      }

      setRoomName(room.name)
      setRoomId(room.id)

      // Step 2: check if already a member
      const { data: existing, error: memberCheckErr } = await supabase
        .from('room_members').select('id')
        .eq('room_id', room.id).eq('user_id', user!.id).maybeSingle()

      if (memberCheckErr) {
        console.error('[JoinRoom] member check error:', memberCheckErr)
        // Non-fatal — proceed to show join screen
      }

      if (existing) {
        setState('already-member')
        setTimeout(() => navigate(`/room/${room.id}`, { replace: true }), 1500)
      } else {
        setState('join')
      }
    } catch (e) {
      console.error('[JoinRoom] checkRoom unexpected error:', e)
      setDebugError(e instanceof Error ? e.message : JSON.stringify(e))
      setState('error')
    }
  }

  async function joinRoom() {
    setState('joining')
    setDebugError(null)
    try {
      const { error } = await supabase
        .from('room_members').insert({ room_id: roomId, user_id: user!.id })
      if (error) {
        const msg = `room_members insert\ncode: ${error.code}\nmessage: ${error.message}\nhint: ${error.hint ?? '–'}`
        console.error('[JoinRoom] joinRoom insert error:', error)
        setDebugError(msg)
        setState('error')
        return
      }
      setState('done')
      setTimeout(() => navigate(`/room/${roomId}`, { replace: true }), 1200)
    } catch (e) {
      console.error('[JoinRoom] joinRoom unexpected error:', e)
      setDebugError(e instanceof Error ? e.message : JSON.stringify(e))
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
          <p className="font-mono text-app-muted text-xs mt-1">invite_code: {inviteCode}</p>
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
            <p className="font-inter text-app-muted text-sm mt-1">Du wurdest zur Gruppe eingeladen:</p>
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
        <div className="flex flex-col items-center gap-4 max-w-xs w-full">
          <div className="text-5xl">⚠️</div>
          <p className="font-inter text-red-400 text-sm font-bold">Fehler beim Beitreten</p>
          {debugError && (
            <pre className="w-full bg-red-950 border border-red-700 rounded-lg p-3 font-mono text-red-300 text-xs whitespace-pre-wrap break-all text-left">
              {debugError}
            </pre>
          )}
          <button onClick={checkRoom} className="font-inter text-primary text-sm underline">Erneut versuchen</button>
          <button onClick={() => navigate('/')} className="font-inter text-app-muted text-xs">Zum Dashboard</button>
        </div>
      )}
    </div>
  )
}
