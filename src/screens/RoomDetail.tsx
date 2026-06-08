import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth, useIsSuperAdmin, useIsGroupAdmin } from '../context/AuthContext'
import type { Event, Room, RoomMode } from '../types'
import { getRoomMode } from '../lib/eventUtils'
import Avatar from '../components/Avatar'

type EventStatus = 'unrated' | 'waiting' | 'reveal'

interface EventWithStatus extends Event {
  battleCount: number
  status: EventStatus
}

interface Member {
  user_id: string
  display_name: string
  avatar_index: number
}

export default function RoomDetail() {
  const { roomId } = useParams<{ roomId: string }>()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const isSuperAdmin = useIsSuperAdmin()
  const isRoomAdmin = useIsGroupAdmin(roomId)
  const canManageEvents = isSuperAdmin || isRoomAdmin

  const [room, setRoom] = useState<Room | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [events, setEvents] = useState<EventWithStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [removingEventId, setRemovingEventId] = useState<string | null>(null)

  const displayName = profile?.display_name ?? ''

  const load = useCallback(async () => {
    if (!roomId) return
    setLoading(true)
    setError(null)
    try {
      // Room info + members
      const [{ data: roomData }, { data: memberships }] = await Promise.all([
        supabase.from('rooms').select('*').eq('id', roomId).single(),
        supabase.from('room_members').select('user_id').eq('room_id', roomId),
      ])
      setRoom(roomData as Room)
      const roomMode: RoomMode = (roomData as Room)?.mode ?? 'auto'

      // Get member profiles
      const memberUserIds = (memberships ?? []).map((m: { user_id: string }) => m.user_id)
      const memberCount = memberUserIds.length
      const { data: profiles } = await supabase
        .from('profiles').select('id, display_name, avatar_index').in('id', memberUserIds)
      setMembers(
        (profiles ?? []).map((p: { id: string; display_name: string; avatar_index: number }) => ({
          user_id: p.id,
          display_name: p.display_name,
          avatar_index: p.avatar_index ?? 0,
        }))
      )

      // Events for this room: via room_events (new) + direct room_id (legacy), deduplicated
      const [{ data: roomEventsRows, error: eventsErr }, { data: legacyEvents }] = await Promise.all([
        supabase.from('room_events').select('events(*)').eq('room_id', roomId),
        supabase.from('events').select('*').eq('room_id', roomId),
      ])
      if (eventsErr) throw eventsErr
      const fromRoomEvents = (roomEventsRows ?? []).map((re: { events: unknown }) => re.events).filter(Boolean) as Event[]
      const legacy = (legacyEvents ?? []) as Event[]
      const seenIds = new Set<string>()
      const eventsData: Event[] = [...fromRoomEvents, ...legacy].filter(e => {
        if (seenIds.has(e.id)) return false
        seenIds.add(e.id)
        return true
      }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

      const withStatus: EventWithStatus[] = await Promise.all(
        (eventsData ?? []).map(async (event: Event) => {
          const { data: battles } = await supabase
            .from('battles').select('id').eq('event_id', event.id)
          const battleIds = (battles ?? []).map((b: { id: string }) => b.id)
          const battleCount = battleIds.length
          if (battleCount === 0) return { ...event, battleCount: 0, status: 'unrated' as EventStatus }

          const { data: verdicts } = await supabase
            .from('battle_verdicts').select('battle_id, user_name').in('battle_id', battleIds)
          const allVerdicts = verdicts ?? []
          // Per-battle 3-state logic:
          // State 1: I haven't voted on this battle
          // State 2: Only I have voted
          // State 3: Another user has also voted → reveal
          const myVotedIds = new Set(
            allVerdicts
              .filter((v: { user_name: string }) => v.user_name === displayName)
              .map((v: { battle_id: string }) => v.battle_id)
          )
          const myDone = myVotedIds.size === battleCount
          const anyBattleShared = allVerdicts.some(
            (v: { user_name: string; battle_id: string }) =>
              v.user_name !== displayName && myVotedIds.has(v.battle_id)
          )
          const effectiveMode = getRoomMode(roomMode, memberCount)
          let status: EventStatus
          if (effectiveMode === 'community') {
            status = myDone ? 'reveal' : 'unrated'
          } else {
            status = anyBattleShared ? 'reveal' : myDone ? 'waiting' : 'unrated'
          }
          return { ...event, battleCount, status }
        })
      )
      setEvents(withStatus)
    } catch {
      setError('Fehler beim Laden.')
    } finally {
      setLoading(false)
    }
  }, [roomId, displayName])

  useEffect(() => { load() }, [load])

  const copyInviteLink = async () => {
    if (!room) return
    const url = `${window.location.origin}/join/${room.invite_code}`
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      alert(`Einladungslink: ${url}`)
    }
  }

  const openEvent = (eventId: string, status: EventStatus) => {
    if (status === 'reveal') navigate(`/room/${roomId}/reveal/${eventId}`)
    else if (status === 'waiting') navigate(`/room/${roomId}/wait/${eventId}`)
    else navigate(`/room/${roomId}/score/${eventId}`)
  }

  const removeFromRoom = async (eventId: string, eventName: string) => {
    if (!confirm(`Event „${eventName}" aus dieser Gruppe entfernen? Bewertungen bleiben erhalten.`)) return
    setRemovingEventId(eventId)
    const { error: err } = await supabase
      .from('room_events').delete()
      .eq('room_id', roomId).eq('event_id', eventId)
    if (!err) setEvents(prev => prev.filter(e => e.id !== eventId))
    else setError('Fehler beim Entfernen des Events.')
    setRemovingEventId(null)
  }

  const statusBadge = (status: EventStatus) => {
    if (status === 'reveal')
      return <span className="font-inter text-[10px] bg-accent/20 text-accent px-2.5 py-1 rounded uppercase tracking-[0.1em]">🔓 Reveal</span>
    if (status === 'waiting')
      return <span className="font-inter text-[10px] bg-secondary/20 text-secondary px-2.5 py-1 rounded uppercase tracking-[0.1em]">⏳ Wartet</span>
    return <span className="font-inter text-[10px] bg-primary/20 text-primary px-2.5 py-1 rounded uppercase tracking-[0.1em]">Ausstehend</span>
  }

  return (
    <div className="min-h-screen">
      <div className="sticky top-0 bg-app-bg/90 backdrop-blur border-b border-white/5 px-4 py-4 flex items-center gap-3 z-10 noise-header">
        <button onClick={() => navigate('/')} className="text-app-muted text-xl w-8">←</button>
        <div className="flex-1 min-w-0">
          <p className="font-inter text-app-muted text-[10px] uppercase tracking-[0.15em]">Gruppe</p>
          <h1 className="font-bebas text-xl text-app-text tracking-wider truncate leading-none">{room?.name ?? '…'}</h1>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {(isSuperAdmin || profile?.role === 'group_admin') && (
            <button
              onClick={() => navigate(`/room/${roomId}/new-event`)}
              className="bg-primary font-bebas text-white text-xs px-3 py-1.5 rounded tracking-[2px] active:scale-95 transition-transform"
            >
              + Event
            </button>
          )}
          <button
            onClick={() => navigate(`/event-pool/${roomId}`)}
            className="bg-secondary font-bebas text-black text-xs px-3 py-1.5 rounded tracking-[2px] active:scale-95 transition-transform whitespace-nowrap"
          >
            + Pool
          </button>
        </div>
      </div>

      <div className="p-4 flex flex-col gap-5">
        {/* Members + invite */}
        <div className="card rounded-lg p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            {members.map(m => (
              <div key={m.user_id} title={m.display_name}>
                <Avatar name={m.display_name} avatarIndex={m.avatar_index} size={32} />
              </div>
            ))}
            {members.length > 0 && (
              <span className="font-inter text-app-muted text-xs ml-1">
                {members.map(m => m.display_name).join(', ')}
              </span>
            )}
          </div>
          <button
            onClick={copyInviteLink}
            className={`font-bebas text-xs px-3 py-1.5 rounded tracking-[1px] flex-shrink-0 transition-colors active:scale-95 ${
              copied ? 'bg-secondary text-black' : 'bg-white/10 text-app-text'
            }`}
          >
            {copied ? '✓ Kopiert!' : '🔗 Einladen'}
          </button>
        </div>

        {/* Events */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {error && (
          <div className="card rounded-lg p-4 border-red-800/50">
            <p className="font-inter text-red-400 text-sm">{error}</p>
            <button onClick={load} className="font-inter text-red-300 text-xs underline mt-1">Erneut versuchen</button>
          </div>
        )}
        {!loading && !error && events.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
            <div className="text-5xl">🎤</div>
            <p className="font-bebas text-lg text-app-text tracking-wider">Noch keine Events</p>
            <p className="font-inter text-app-muted text-[10px] uppercase tracking-[0.1em]">
              {isSuperAdmin ? 'Tippe „+ Event" um loszulegen' : 'Noch keine Events in dieser Gruppe'}
            </p>
          </div>
        )}

        <div className="flex flex-col gap-3">
          {events.map(event => (
            <div key={event.id} className="card rounded-lg overflow-hidden">
              <button
                onClick={() => openEvent(event.id, event.status)}
                className="w-full p-4 text-left active:bg-white/5 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h2 className="font-bebas text-lg text-app-text truncate tracking-wider leading-tight">{event.name}</h2>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      {event.date && <span className="font-inter text-app-muted text-xs">{event.date}</span>}
                      {event.date && event.location && <span className="text-app-muted">·</span>}
                      {event.location && <span className="font-inter text-app-muted text-xs">{event.location}</span>}
                    </div>
                    <p className="font-inter text-[10px] uppercase tracking-[0.1em] text-app-muted/60 mt-1">
                      {event.battleCount} {event.battleCount === 1 ? 'Battle' : 'Battles'}
                    </p>
                  </div>
                  <div className="flex-shrink-0 mt-0.5">{statusBadge(event.status)}</div>
                </div>
              </button>
              {canManageEvents && (
                <div className="border-t border-white/5 px-4 py-2 flex justify-end">
                  <button
                    onClick={() => removeFromRoom(event.id, event.name)}
                    disabled={removingEventId === event.id}
                    className="font-inter text-[10px] text-red-400/70 hover:text-red-400 uppercase tracking-[0.1em] disabled:opacity-40 transition-colors active:scale-95"
                  >
                    {removingEventId === event.id ? '…' : '✕ Entfernen'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
