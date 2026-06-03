import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Room } from '../types'

interface RoomWithMeta extends Room {
  memberCount: number
  openEventCount: number
}

export default function Dashboard() {
  const { profile, user } = useAuth()
  const navigate = useNavigate()
  const [rooms, setRooms] = useState<RoomWithMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (user) loadRooms()
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadRooms() {
    setLoading(true)
    setError(null)
    try {
      // Get rooms the user belongs to
      const { data: memberships, error: mErr } = await supabase
        .from('room_members')
        .select('room_id')
        .eq('user_id', user!.id)
      if (mErr) { console.error('[Dashboard] room_members query:', mErr.code, mErr.message, mErr.details); throw mErr }

      const roomIds = (memberships ?? []).map((m: { room_id: string }) => m.room_id)
      if (roomIds.length === 0) { setRooms([]); setLoading(false); return }

      const [
        { data: roomsData, error: roomsErr },
        { data: allMembers, error: membersErr },
        { data: allEvents, error: eventsErr },
      ] = await Promise.all([
        supabase.from('rooms').select('*').in('id', roomIds),
        supabase.from('room_members').select('room_id').in('room_id', roomIds),
        supabase.from('events').select('id, room_id').in('room_id', roomIds),
      ])
      if (roomsErr) console.error('[Dashboard] rooms query:', roomsErr.code, roomsErr.message)
      if (membersErr) console.error('[Dashboard] allMembers query:', membersErr.code, membersErr.message)
      if (eventsErr) console.error('[Dashboard] events query:', eventsErr.code, eventsErr.message)

      // Build open event count: events where this user has no battle_verdicts at all
      const eventIds = (allEvents ?? []).map((e: { id: string }) => e.id)
      let verdictedEventIds: string[] = []
      if (eventIds.length > 0) {
        const { data: battles } = await supabase
          .from('battles').select('id, event_id').in('event_id', eventIds)
        const battleIds = (battles ?? []).map((b: { id: string }) => b.id)
        if (battleIds.length > 0) {
          const { data: myVerdicts } = await supabase
            .from('battle_verdicts').select('battle_id')
            .in('battle_id', battleIds).eq('user_name', profile?.display_name ?? '')
          const myBattleIds = new Set((myVerdicts ?? []).map((v: { battle_id: string }) => v.battle_id))
          // An event is "open" if user hasn't submitted verdicts for ALL its battles
          for (const b of (battles ?? [])) {
            if (myBattleIds.has(b.id)) verdictedEventIds.push(b.event_id)
          }
        }
      }

      const withMeta: RoomWithMeta[] = (roomsData ?? []).map((room: Room) => {
        const memberCount = (allMembers ?? []).filter(
          (m: { room_id: string }) => m.room_id === room.id
        ).length
        const roomEvents = (allEvents ?? []).filter((e: { room_id: string }) => e.room_id === room.id)
        const openEventCount = roomEvents.filter(
          (e: { id: string }) => !verdictedEventIds.includes(e.id)
        ).length
        return { ...room, memberCount, openEventCount }
      })

      setRooms(withMeta)
    } catch (e) {
      console.error('[Dashboard] loadRooms caught:', e)
      setError('Fehler beim Laden. Bitte Internetverbindung prüfen.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="sticky top-0 bg-app-bg/90 backdrop-blur border-b border-white/5 px-4 py-4 flex items-center justify-between z-10 noise-header">
        <div>
          <p className="font-inter text-app-muted text-[10px] uppercase tracking-[0.15em]">Dashboard</p>
          <h1 className="font-bebas text-2xl text-app-text tracking-wider leading-none">
            Hey {profile?.display_name} 👋
          </h1>
        </div>
        <button
          onClick={() => navigate('/profile')}
          className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center"
        >
          <span className="font-bebas text-primary text-sm">
            {profile?.display_name?.charAt(0).toUpperCase()}
          </span>
        </button>
      </div>

      <div className="p-4 flex flex-col gap-6">
        {/* Gruppen */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bebas text-lg text-app-text tracking-wider">Meine Gruppen</h2>
            <button
              onClick={() => navigate('/room/new')}
              className="bg-primary font-bebas text-white text-xs px-3 py-1.5 rounded tracking-[2px] active:scale-95 transition-transform"
            >
              + Gruppe
            </button>
          </div>

          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {error && (
            <div className="card rounded-lg p-4 border-red-800/50">
              <p className="font-inter text-red-400 text-sm">{error}</p>
              <button onClick={loadRooms} className="font-inter text-red-300 text-xs underline mt-1">Erneut versuchen</button>
            </div>
          )}

          {!loading && !error && rooms.length === 0 && (
            <div className="card rounded-lg p-8 flex flex-col items-center gap-4 text-center border-dashed border-primary/20">
              <div className="text-5xl">🎤</div>
              <div>
                <p className="font-bebas text-lg text-app-text tracking-wider">Noch keine Gruppe</p>
                <p className="font-inter text-app-muted text-xs mt-1">
                  Erstelle eine Gruppe oder tritt einer per Einladungslink bei.
                </p>
              </div>
              <button
                onClick={() => navigate('/room/new')}
                className="bg-primary font-bebas text-white px-6 py-3 rounded-lg tracking-[2px] text-sm active:scale-95 transition-transform shadow-md shadow-primary/30"
              >
                Gruppe erstellen
              </button>
            </div>
          )}

          <div className="flex flex-col gap-3">
            {rooms.map(room => (
              <button
                key={room.id}
                onClick={() => navigate(`/room/${room.id}`)}
                className="card rounded-lg p-4 text-left active:scale-95 transition-transform w-full"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bebas text-lg text-app-text tracking-wider truncate leading-tight">{room.name}</h3>
                    <p className="font-inter text-app-muted text-xs mt-0.5">
                      {room.memberCount} {room.memberCount === 1 ? 'Mitglied' : 'Mitglieder'}
                    </p>
                  </div>
                  {room.openEventCount > 0 && (
                    <span className="font-inter text-[10px] bg-primary/20 text-primary px-2.5 py-1 rounded uppercase tracking-[0.1em] flex-shrink-0">
                      {room.openEventCount} offen
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
