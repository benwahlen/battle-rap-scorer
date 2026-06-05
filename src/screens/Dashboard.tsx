import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Room } from '../types'
import Avatar from '../components/Avatar'

interface RoomWithMeta extends Room {
  memberCount: number
  openEventCount: number
}

interface GlobalEvent {
  id: string
  name: string
  date: string | null
  battleCount: number
}

type Tab = 'groups' | 'events'

export default function Dashboard() {
  const { profile, user } = useAuth()
  const canCreateRoom = profile?.role === 'super_admin' || profile?.role === 'group_admin'
  const navigate = useNavigate()

  const [activeTab, setActiveTab] = useState<Tab>('groups')

  // ── Gruppen ──────────────────────────────────────────────────────────────────
  const [rooms, setRooms] = useState<RoomWithMeta[]>([])
  const [roomsLoading, setRoomsLoading] = useState(true)
  const [roomsError, setRoomsError] = useState<string | null>(null)

  // ── Events ───────────────────────────────────────────────────────────────────
  const [globalEvents, setGlobalEvents] = useState<GlobalEvent[]>([])
  const [eventsLoading, setEventsLoading] = useState(false)
  const [eventsLoaded, setEventsLoaded] = useState(false)

  useEffect(() => {
    if (user) loadRooms()
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeTab === 'events' && !eventsLoaded) loadGlobalEvents()
  }, [activeTab, eventsLoaded]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadRooms = useCallback(async () => {
    if (!user) return
    setRoomsLoading(true)
    setRoomsError(null)
    try {
      const { data: memberships, error: mErr } = await supabase
        .from('room_members').select('room_id').eq('user_id', user.id)
      if (mErr) throw mErr

      const roomIds = (memberships ?? []).map((m: { room_id: string }) => m.room_id)
      if (roomIds.length === 0) { setRooms([]); setRoomsLoading(false); return }

      const [
        { data: roomsData },
        { data: allMembers },
        { data: allEvents },
      ] = await Promise.all([
        supabase.from('rooms').select('*').in('id', roomIds),
        supabase.from('room_members').select('room_id').in('room_id', roomIds),
        supabase.from('events').select('id, room_id').in('room_id', roomIds),
      ])

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
          for (const b of (battles ?? [])) {
            if (myBattleIds.has(b.id)) verdictedEventIds.push(b.event_id)
          }
        }
      }

      setRooms(
        (roomsData ?? []).map((room: Room) => ({
          ...room,
          memberCount: (allMembers ?? []).filter((m: { room_id: string }) => m.room_id === room.id).length,
          openEventCount: (allEvents ?? [])
            .filter((e: { room_id: string }) => e.room_id === room.id)
            .filter((e: { id: string }) => !verdictedEventIds.includes(e.id)).length,
        }))
      )
    } catch (e) {
      console.error('[Dashboard] loadRooms caught:', e)
      setRoomsError('Fehler beim Laden. Bitte Internetverbindung prüfen.')
    } finally {
      setRoomsLoading(false)
    }
  }, [user, profile?.display_name])

  async function loadGlobalEvents() {
    setEventsLoading(true)
    try {
      const { data: adminProfiles } = await supabase
        .from('profiles').select('id').eq('role', 'super_admin')
      const adminIds = (adminProfiles ?? []).map((p: { id: string }) => p.id)

      const { data: evData } = adminIds.length > 0
        ? await supabase.from('events').select('id, name, date')
            .in('created_by', adminIds).order('created_at', { ascending: false })
        : { data: [] }
      const ids = (evData ?? []).map((e: { id: string }) => e.id)
      const { data: battleData } = ids.length > 0
        ? await supabase.from('battles').select('event_id').in('event_id', ids)
        : { data: [] }
      const counts = (battleData ?? []).reduce((acc: Record<string, number>, b: { event_id: string }) => {
        acc[b.event_id] = (acc[b.event_id] ?? 0) + 1; return acc
      }, {})
      setGlobalEvents((evData ?? []).map((e: { id: string; name: string; date: string | null }) =>
        ({ ...e, battleCount: counts[e.id] ?? 0 })
      ))
      setEventsLoaded(true)
    } finally {
      setEventsLoading(false)
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
        <button onClick={() => navigate('/profile')} className="rounded-full active:scale-95 transition-transform">
          <Avatar name={profile?.display_name ?? ''} avatarIndex={profile?.avatar_index} size={36} />
        </button>
      </div>

      {/* NewsBox */}
      <div className="px-4 pt-4">
        <div className="card rounded-lg p-4 flex items-start gap-3 border-white/10">
          <span className="text-xl flex-shrink-0 mt-0.5">📢</span>
          <div className="flex-1 min-w-0">
            <p className="font-bebas text-base text-app-text tracking-wider leading-tight">Battle Rap Scorer</p>
            <p className="font-inter text-app-muted text-xs mt-1 leading-relaxed">
              Bewertet Battles unabhängig — erst wenn beide fertig sind gibt es den Reveal.
            </p>
          </div>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex border-b border-white/5 mt-4 px-4">
        {([['groups', 'Meine Gruppen'], ['events', 'Events']] as [Tab, string][]).map(([key, label]) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={`flex-1 py-2.5 font-bebas text-sm tracking-[1px] transition-colors ${activeTab === key ? 'text-primary border-b-2 border-primary' : 'text-app-muted'}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="p-4 flex flex-col gap-6">

        {/* ── Tab: Gruppen ──────────────────────────────────────────────────── */}
        {activeTab === 'groups' && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="font-bebas text-lg text-app-text tracking-wider">Meine Gruppen</h2>
              {canCreateRoom && (
                <button onClick={() => navigate('/room/new')}
                  className="bg-primary font-bebas text-white text-xs px-3 py-1.5 rounded tracking-[2px] active:scale-95 transition-transform">
                  + Gruppe
                </button>
              )}
            </div>

            {roomsLoading && (
              <div className="flex items-center justify-center py-12">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {roomsError && (
              <div className="card rounded-lg p-4 border-red-800/50">
                <p className="font-inter text-red-400 text-sm">{roomsError}</p>
                <button onClick={loadRooms} className="font-inter text-red-300 text-xs underline mt-1">Erneut versuchen</button>
              </div>
            )}

            {!roomsLoading && !roomsError && rooms.length === 0 && (
              <div className="card rounded-lg p-8 flex flex-col items-center gap-4 text-center border-dashed border-primary/20">
                <div className="text-5xl">🎤</div>
                <div>
                  <p className="font-bebas text-lg text-app-text tracking-wider">Noch keine Gruppe</p>
                  <p className="font-inter text-app-muted text-xs mt-1">
                    {canCreateRoom ? 'Erstelle eine Gruppe oder tritt einer per Einladungslink bei.' : 'Tritt einer Gruppe per Einladungslink bei.'}
                  </p>
                </div>
                {canCreateRoom && (
                  <button onClick={() => navigate('/room/new')}
                    className="bg-primary font-bebas text-white px-6 py-3 rounded-lg tracking-[2px] text-sm active:scale-95 transition-transform shadow-md shadow-primary/30">
                    Gruppe erstellen
                  </button>
                )}
              </div>
            )}

            <div className="flex flex-col gap-3">
              {rooms.map(room => (
                <button key={room.id} onClick={() => navigate(`/room/${room.id}`)}
                  className="card rounded-lg p-4 text-left active:scale-95 transition-transform w-full">
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
        )}

        {/* ── Tab: Events ───────────────────────────────────────────────────── */}
        {activeTab === 'events' && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="font-bebas text-lg text-app-text tracking-wider">Alle Events</h2>
              <button onClick={() => navigate('/event-pool')}
                className="bg-secondary font-bebas text-black text-xs px-3 py-1.5 rounded tracking-[2px] active:scale-95 transition-transform">
                + Zu Gruppe
              </button>
            </div>

            {eventsLoading && (
              <div className="flex items-center justify-center py-12">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {!eventsLoading && globalEvents.length === 0 && eventsLoaded && (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                <div className="text-5xl">🎤</div>
                <p className="font-bebas text-lg text-app-text tracking-wider">Keine Events vorhanden</p>
              </div>
            )}

            {globalEvents.map(event => (
              <div key={event.id} className="card rounded-lg p-4">
                <h3 className="font-bebas text-lg text-app-text tracking-wider truncate leading-tight">{event.name}</h3>
                <div className="flex items-center gap-2 mt-0.5">
                  {event.date && <span className="font-inter text-app-muted text-xs">{event.date}</span>}
                  {event.date && <span className="text-app-muted">·</span>}
                  <span className="font-inter text-[10px] text-app-muted/60 uppercase tracking-[0.1em]">
                    {event.battleCount} {event.battleCount === 1 ? 'Battle' : 'Battles'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  )
}
