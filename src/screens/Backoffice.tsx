import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth, useIsSuperAdmin } from '../context/AuthContext'
import type { UserRole, Battle } from '../types'

type Tab = 'users' | 'events' | 'rooms'

interface UserRow {
  id: string
  display_name: string
  role: UserRole
  created_at: string
}

interface EventRow {
  id: string
  name: string
  date: string | null
  location: string | null
  created_at: string
  roomCount: number
}

interface RoomRow {
  id: string
  name: string
  created_at: string
  memberCount: number
  eventCount: number
}

export default function Backoffice() {
  const navigate = useNavigate()
  const { loading: authLoading } = useAuth()
  const isSuperAdmin = useIsSuperAdmin()
  const [tab, setTab] = useState<Tab>('users')

  useEffect(() => {
    if (!authLoading && !isSuperAdmin) navigate('/', { replace: true })
  }, [authLoading, isSuperAdmin, navigate])

  if (!isSuperAdmin) return null

  return (
    <div className="min-h-screen">
      <div className="sticky top-0 bg-app-bg/90 backdrop-blur border-b border-white/5 px-4 py-4 flex items-center gap-3 z-10 noise-header">
        <button onClick={() => navigate('/profile')} className="text-app-muted text-xl w-8">←</button>
        <h1 className="font-bebas text-xl text-app-text tracking-wider">Backoffice</h1>
      </div>

      {/* Tab Bar */}
      <div className="flex border-b border-white/5">
        {([['users', 'User'], ['events', 'Events'], ['rooms', 'Gruppen']] as [Tab, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 py-3 font-bebas text-sm tracking-[1px] transition-colors ${
              tab === key ? 'text-primary border-b-2 border-primary' : 'text-app-muted'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="p-4">
        {tab === 'users' && <UsersTab />}
        {tab === 'events' && <EventsTab />}
        {tab === 'rooms' && <RoomsTab />}
      </div>
    </div>
  )
}

// ── Tab: Users ────────────────────────────────────────────────────────────────

function UsersTab() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('profiles')
      .select('id, display_name, role, created_at')
      .order('created_at', { ascending: false })
    if (err) { setError('Fehler beim Laden.'); setLoading(false); return }
    setUsers((data ?? []) as UserRow[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    setActionError(null)
    const { error: err } = await supabase
      .from('profiles')
      .update({ role: newRole })
      .eq('id', userId)
    if (err) {
      setActionError('Rolle konnte nicht geändert werden. Bitte RLS-Policy prüfen.')
    } else {
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u))
    }
  }

  const filtered = users.filter(u =>
    u.display_name.toLowerCase().includes(search.toLowerCase())
  )

  const roleLabel: Record<UserRole, string> = {
    member: 'Member',
    group_admin: 'Gruppen-Admin',
    super_admin: 'Super-Admin',
  }

  return (
    <div className="flex flex-col gap-4">
      <input
        type="text"
        placeholder="Suche nach Name…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full bg-white/5 border border-white/10 rounded px-4 py-3 text-app-text placeholder-app-muted/50 focus:outline-none focus:border-primary/50 font-inter text-sm"
      />

      {loading && <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>}
      {error && <p className="font-inter text-red-400 text-sm">{error}</p>}
      {actionError && <p className="font-inter text-red-400 text-sm">{actionError}</p>}

      {filtered.map(user => (
        <div key={user.id} className="card rounded-lg p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
            <span className="font-bebas text-primary text-sm">{user.display_name.charAt(0).toUpperCase()}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bebas text-base text-app-text tracking-wider truncate">{user.display_name}</p>
            <p className="font-inter text-app-muted text-[10px]">
              {new Date(user.created_at).toLocaleDateString('de-DE')}
            </p>
          </div>
          <select
            value={user.role}
            onChange={e => handleRoleChange(user.id, e.target.value as UserRole)}
            className="bg-white/5 border border-white/10 rounded px-2 py-1.5 text-app-text font-inter text-xs focus:outline-none focus:border-primary/50"
          >
            {(Object.entries(roleLabel) as [UserRole, string][]).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        </div>
      ))}

      {!loading && filtered.length === 0 && (
        <p className="font-inter text-app-muted text-sm text-center py-8">Keine User gefunden.</p>
      )}
    </div>
  )
}

// ── Tab: Events ───────────────────────────────────────────────────────────────

function EventsTab() {
  const navigate = useNavigate()
  const [events, setEvents] = useState<EventRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [battlesMap, setBattlesMap] = useState<Record<string, Battle[]>>({})

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const [{ data: evData, error: evErr }, { data: reData, error: reErr }] = await Promise.all([
      supabase.from('events').select('id, name, date, location, room_id, created_at').order('created_at', { ascending: false }),
      supabase.from('room_events').select('event_id, room_id'),
    ])
    if (evErr) { setError('Fehler beim Laden.'); setLoading(false); return }
    if (reErr) console.error('[Backoffice EventsTab] room_events query error:', reErr.code, reErr.message, reErr.hint)

    console.log('[Backoffice EventsTab] events:', evData?.length, 'room_events:', reData?.length, reData?.slice(0, 3))

    // Count rooms per event: from room_events (new) + legacy room_id (old), deduplicated
    type RERow = { event_id: string; room_id: string }
    const reByEvent: Record<string, string[]> = {}
    for (const re of (reData ?? []) as RERow[]) {
      if (!reByEvent[re.event_id]) reByEvent[re.event_id] = []
      reByEvent[re.event_id].push(re.room_id)
    }

    setEvents(
      (evData ?? []).map((e: { id: string; name: string; date: string | null; location: string | null; room_id: string | null; created_at: string }) => {
        const roomIds = new Set<string>(reByEvent[e.id] ?? [])
        if (e.room_id) roomIds.add(e.room_id)
        console.log(`[Backoffice] "${e.name}": room_events=${reByEvent[e.id]?.length ?? 0}, room_id=${e.room_id}, total=${roomIds.size}`)
        return { id: e.id, name: e.name, date: e.date, location: e.location, created_at: e.created_at, roomCount: roomIds.size }
      })
    )
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const toggleEvent = async (eventId: string) => {
    if (expandedId === eventId) { setExpandedId(null); return }
    setExpandedId(eventId)
    if (!battlesMap[eventId]) {
      const { data } = await supabase.from('battles').select('*').eq('event_id', eventId).order('position')
      setBattlesMap(prev => ({ ...prev, [eventId]: (data ?? []) as Battle[] }))
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <button
        onClick={() => navigate('/backoffice/new-event')}
        className="bg-primary font-bebas text-white py-3 rounded-lg tracking-[2px] text-sm active:scale-95 transition-transform"
      >
        + Neues Event
      </button>

      {loading && <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>}
      {error && <p className="font-inter text-red-400 text-sm">{error}</p>}

      {events.map(event => (
        <div key={event.id} className="card rounded-lg overflow-hidden">
          <button
            onClick={() => toggleEvent(event.id)}
            className="w-full p-4 flex items-start justify-between gap-3 text-left active:bg-white/5 transition-colors"
          >
            <div className="flex-1 min-w-0">
              <h2 className="font-bebas text-lg text-app-text truncate tracking-wider leading-tight">{event.name}</h2>
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                {event.date && <span className="font-inter text-app-muted text-xs">{event.date}</span>}
                {event.date && event.location && <span className="text-app-muted">·</span>}
                {event.location && <span className="font-inter text-app-muted text-xs">{event.location}</span>}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
              <span className="font-inter text-[10px] text-app-muted/60 uppercase tracking-[0.1em]">
                {event.roomCount} {event.roomCount === 1 ? 'Gruppe' : 'Gruppen'}
              </span>
              <span className="text-app-muted text-xs">{expandedId === event.id ? '▲' : '▾'}</span>
            </div>
          </button>

          {expandedId === event.id && (
            <div className="border-t border-white/5 px-4 py-3 flex flex-col gap-2">
              {!battlesMap[event.id] ? (
                <div className="flex justify-center py-3">
                  <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : battlesMap[event.id].length === 0 ? (
                <p className="font-inter text-app-muted text-xs text-center py-2">Keine Battles vorhanden.</p>
              ) : (
                battlesMap[event.id].map((battle, i) => (
                  <div key={battle.id} className="flex items-center gap-2">
                    <span className="font-inter text-[10px] text-app-muted/60 w-5 flex-shrink-0">{i + 1}.</span>
                    <span className="font-bebas text-sm text-app-text tracking-wider flex-1 truncate">{battle.mc1}</span>
                    <span className="font-inter text-app-muted/60 text-[10px] flex-shrink-0">vs</span>
                    <span className="font-bebas text-sm text-app-text tracking-wider flex-1 truncate text-right">{battle.mc2}</span>
                    <span className="font-inter text-[10px] text-app-muted/60 w-7 text-right flex-shrink-0">{battle.format}</span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      ))}

      {!loading && events.length === 0 && (
        <p className="font-inter text-app-muted text-sm text-center py-8">Noch keine Events vorhanden.</p>
      )}
    </div>
  )
}

// ── Tab: Rooms ────────────────────────────────────────────────────────────────

function RoomsTab() {
  const [rooms, setRooms] = useState<RoomRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const [{ data: roomsData, error: roomsErr }, { data: members }, { data: roomEvents }] = await Promise.all([
      supabase.from('rooms').select('id, name, created_at').order('created_at', { ascending: false }),
      supabase.from('room_members').select('room_id'),
      supabase.from('room_events').select('room_id'),
    ])
    if (roomsErr) { setError('Fehler beim Laden.'); setLoading(false); return }

    const memberCounts = (members ?? []).reduce((acc: Record<string, number>, m: { room_id: string }) => {
      acc[m.room_id] = (acc[m.room_id] ?? 0) + 1
      return acc
    }, {})
    const eventCounts = (roomEvents ?? []).reduce((acc: Record<string, number>, re: { room_id: string }) => {
      acc[re.room_id] = (acc[re.room_id] ?? 0) + 1
      return acc
    }, {})

    setRooms(
      (roomsData ?? []).map((r: Omit<RoomRow, 'memberCount' | 'eventCount'>) => ({
        ...r,
        memberCount: memberCounts[r.id] ?? 0,
        eventCount: eventCounts[r.id] ?? 0,
      }))
    )
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleDelete = async (roomId: string, roomName: string) => {
    if (!confirm(`Gruppe „${roomName}" wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.`)) return
    setDeleting(roomId)
    setActionError(null)
    const { error: err } = await supabase.from('rooms').delete().eq('id', roomId)
    if (err) {
      setActionError('Löschen fehlgeschlagen. Bitte DELETE-Policy auf rooms prüfen.')
    } else {
      setRooms(prev => prev.filter(r => r.id !== roomId))
    }
    setDeleting(null)
  }

  return (
    <div className="flex flex-col gap-4">
      {loading && <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>}
      {error && <p className="font-inter text-red-400 text-sm">{error}</p>}
      {actionError && <p className="font-inter text-red-400 text-sm">{actionError}</p>}

      {rooms.map(room => (
        <div key={room.id} className="card rounded-lg p-4 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <h2 className="font-bebas text-lg text-app-text truncate tracking-wider leading-tight">{room.name}</h2>
            <p className="font-inter text-app-muted text-xs mt-0.5">
              {room.memberCount} Mitglieder · {room.eventCount} Events
            </p>
          </div>
          <button
            onClick={() => handleDelete(room.id, room.name)}
            disabled={deleting === room.id}
            className="font-inter text-red-400 text-xs px-3 py-1.5 rounded border border-red-800/40 active:scale-95 transition-transform disabled:opacity-50"
          >
            {deleting === room.id ? '…' : 'Löschen'}
          </button>
        </div>
      ))}

      {!loading && rooms.length === 0 && (
        <p className="font-inter text-app-muted text-sm text-center py-8">Noch keine Gruppen vorhanden.</p>
      )}
    </div>
  )
}
