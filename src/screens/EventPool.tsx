import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

interface EventItem {
  id: string
  name: string
  date: string | null
  location: string | null
  battleCount: number
}

export default function EventPool() {
  const { roomId: preselectedRoomId } = useParams<{ roomId?: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [events, setEvents] = useState<EventItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())
  const [userRooms, setUserRooms] = useState<{ id: string; name: string }[]>([])
  const [roomEventsMap, setRoomEventsMap] = useState<Record<string, Set<string>>>({})

  // activeRoomId: pre-selected from URL or chosen in modal
  const [activeRoomId, setActiveRoomId] = useState(preselectedRoomId ?? '')
  const [showRoomPicker, setShowRoomPicker] = useState(false)
  const [adding, setAdding] = useState(false)
  const [addSuccess, setAddSuccess] = useState(false)

  const activeRoom = userRooms.find(r => r.id === activeRoomId)

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setError(null)
    try {
      const [{ data: evData, error: evErr }, { data: memberData }] = await Promise.all([
        supabase.from('events').select('id, name, date, location').order('created_at', { ascending: false }),
        supabase.from('room_members').select('room_id').eq('user_id', user.id),
      ])
      console.error('[EventPool] evData:', evData, 'evErr:', evErr)
      if (evErr) throw evErr

      const roomIds = (memberData ?? []).map((m: { room_id: string }) => m.room_id)
      const ids = (evData ?? []).map((e: { id: string }) => e.id)

      const [{ data: roomsData }, { data: allRoomEvents }, { data: battleData }] = await Promise.all([
        roomIds.length > 0
          ? supabase.from('rooms').select('id, name').in('id', roomIds)
          : Promise.resolve({ data: [], error: null }),
        roomIds.length > 0
          ? supabase.from('room_events').select('room_id, event_id').in('room_id', roomIds)
          : Promise.resolve({ data: [], error: null }),
        ids.length > 0
          ? supabase.from('battles').select('event_id').in('event_id', ids)
          : Promise.resolve({ data: [], error: null }),
      ])

      setUserRooms((roomsData ?? []) as { id: string; name: string }[])

      const rem: Record<string, Set<string>> = {}
      for (const re of (allRoomEvents ?? []) as { room_id: string; event_id: string }[]) {
        if (!rem[re.room_id]) rem[re.room_id] = new Set()
        rem[re.room_id].add(re.event_id)
      }
      setRoomEventsMap(rem)

      const bCount: Record<string, number> = {}
      for (const b of (battleData ?? []) as { event_id: string }[]) {
        bCount[b.event_id] = (bCount[b.event_id] ?? 0) + 1
      }

      setEvents((evData ?? []).map((e: { id: string; name: string; date: string | null; location: string | null }) => ({
        ...e, battleCount: bCount[e.id] ?? 0,
      })))
    } catch {
      setError('Fehler beim Laden der Events.')
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => { load() }, [load])

  const toggleCheck = (eventId: string) => {
    if (activeRoomId && roomEventsMap[activeRoomId]?.has(eventId)) return
    setCheckedIds(prev => {
      const next = new Set(prev)
      next.has(eventId) ? next.delete(eventId) : next.add(eventId)
      return next
    })
  }

  const addToRoom = async (targetRoomId: string) => {
    const toAdd = [...checkedIds].filter(id => !roomEventsMap[targetRoomId]?.has(id))
    if (toAdd.length === 0) return
    setAdding(true)
    const { error: err } = await supabase.from('room_events').upsert(
      toAdd.map(eventId => ({ room_id: targetRoomId, event_id: eventId, added_by: user?.id ?? null })),
      { onConflict: 'room_id,event_id' }
    )
    if (!err) {
      setRoomEventsMap(prev => {
        const s = new Set(prev[targetRoomId] ?? [])
        toAdd.forEach(id => s.add(id))
        return { ...prev, [targetRoomId]: s }
      })
      setCheckedIds(new Set())
      setAddSuccess(true)
      setTimeout(() => setAddSuccess(false), 2500)
    } else {
      setError('Fehler beim Hinzufügen. Bitte erneut versuchen.')
    }
    setAdding(false)
  }

  const handleBottomButton = () => {
    if (activeRoomId) {
      addToRoom(activeRoomId)
    } else {
      setShowRoomPicker(true)
    }
  }

  const handleRoomPick = (roomId: string) => {
    setActiveRoomId(roomId)
    setShowRoomPicker(false)
    // Remove already-added events from selection
    setCheckedIds(prev => {
      const next = new Set(prev)
      for (const id of roomEventsMap[roomId] ?? []) next.delete(id)
      return next
    })
    // Immediately add if there's a selection
    if (checkedIds.size > 0) {
      const toAdd = [...checkedIds].filter(id => !roomEventsMap[roomId]?.has(id))
      if (toAdd.length > 0) addToRoom(roomId)
    }
  }

  const isAlreadyAdded = (eventId: string) =>
    activeRoomId ? (roomEventsMap[activeRoomId]?.has(eventId) ?? false) : false

  const checkedAndNew = activeRoomId
    ? [...checkedIds].filter(id => !roomEventsMap[activeRoomId]?.has(id)).length
    : checkedIds.size

  return (
    <div className="min-h-screen">
      <div className="sticky top-0 bg-app-bg/90 backdrop-blur border-b border-white/5 px-4 py-4 flex items-center gap-3 z-10 noise-header">
        <button onClick={() => navigate(preselectedRoomId ? `/room/${preselectedRoomId}` : '/')}
          className="text-app-muted text-xl w-8">←</button>
        <div className="flex-1 min-w-0">
          <p className="font-inter text-app-muted text-[10px] uppercase tracking-[0.15em]">Event-Pool</p>
          <h1 className="font-bebas text-xl text-app-text tracking-wider leading-none">Events hinzufügen</h1>
        </div>
        {/* Aktive Gruppe anzeigen / wählen */}
        <button onClick={() => setShowRoomPicker(true)}
          className="font-inter text-[10px] px-2.5 py-1.5 rounded bg-white/5 text-app-muted flex-shrink-0 max-w-[120px] truncate active:bg-white/10 transition-colors">
          {activeRoom ? activeRoom.name : 'Gruppe wählen'}
        </button>
      </div>

      <div className="p-4 pb-32 flex flex-col gap-2">
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

        {addSuccess && (
          <div className="card border-secondary/30 rounded-lg px-4 py-3 flex items-center gap-2">
            <span className="text-secondary text-sm">✓</span>
            <span className="font-inter text-secondary text-sm">Events zur Gruppe hinzugefügt</span>
          </div>
        )}

        {!loading && !error && events.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <div className="text-5xl">🎤</div>
            <p className="font-bebas text-lg text-app-text tracking-wider">Keine Events verfügbar</p>
            <p className="font-inter text-app-muted text-[10px] uppercase tracking-[0.1em]">Super-Admin muss zuerst Events anlegen</p>
          </div>
        )}

        {events.map(event => {
          const added = isAlreadyAdded(event.id)
          const checked = checkedIds.has(event.id)
          return (
            <button key={event.id} onClick={() => toggleCheck(event.id)}
              disabled={added}
              className={`card rounded-lg p-4 flex items-center gap-3 text-left w-full transition-colors ${added ? 'opacity-50' : 'active:bg-white/5'}`}>
              {/* Checkbox */}
              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                added ? 'border-white/20 bg-white/5' :
                checked ? 'bg-primary border-primary' : 'border-white/30'
              }`}>
                {(checked || added) && (
                  <span className="text-white font-inter text-[10px] leading-none">{added ? '–' : '✓'}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-bebas text-base text-app-text truncate tracking-wider leading-tight">{event.name}</h2>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  {event.date && <span className="font-inter text-app-muted text-xs">{event.date}</span>}
                  {event.date && event.location && <span className="text-app-muted">·</span>}
                  {event.location && <span className="font-inter text-app-muted text-xs">{event.location}</span>}
                </div>
                <p className="font-inter text-[10px] text-app-muted/60 uppercase tracking-[0.1em] mt-0.5">
                  {event.battleCount} {event.battleCount === 1 ? 'Battle' : 'Battles'}
                  {added && <span className="ml-2 text-app-muted/40">· Bereits hinzugefügt</span>}
                </p>
              </div>
            </button>
          )
        })}
      </div>

      {/* Fixierter Bottom Button */}
      {checkedIds.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-app-bg/95 backdrop-blur border-t border-white/5">
          <button onClick={handleBottomButton} disabled={adding}
            className="w-full font-bebas text-white py-4 rounded-lg tracking-[2px] text-base disabled:opacity-50 active:scale-95 transition-transform shadow-lg"
            style={{ background: 'linear-gradient(135deg, #7C3AED, #0EA5E9)' }}>
            {adding ? 'Wird hinzugefügt…' :
              activeRoom
                ? `Zu „${activeRoom.name}" hinzufügen (${checkedAndNew})`
                : `Gruppe wählen & hinzufügen (${checkedIds.size})`
            }
          </button>
        </div>
      )}

      {/* Gruppen-Picker Modal */}
      {showRoomPicker && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/50" onClick={() => setShowRoomPicker(false)}>
          <div className="w-full bg-app-bg border-t border-white/10 rounded-t-2xl p-4 pb-8"
            onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-4" />
            <p className="font-bebas text-lg text-app-text tracking-wider text-center mb-4">In welche Gruppe?</p>
            {userRooms.length === 0 ? (
              <p className="font-inter text-app-muted text-sm text-center py-4">Keine Gruppen gefunden.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {userRooms.map(room => {
                  const alreadyAddedCount = (roomEventsMap[room.id] ?? new Set())
                    ? [...checkedIds].filter(id => roomEventsMap[room.id]?.has(id)).length
                    : 0
                  const newCount = checkedIds.size - alreadyAddedCount
                  return (
                    <button key={room.id} onClick={() => handleRoomPick(room.id)}
                      className={`card rounded-lg px-4 py-3.5 flex items-center justify-between gap-3 text-left active:scale-95 transition-transform w-full ${activeRoomId === room.id ? 'border-primary/40' : ''}`}>
                      <span className="font-bebas text-base text-app-text tracking-wider">{room.name}</span>
                      <span className="font-inter text-[10px] text-app-muted/60 flex-shrink-0">
                        {newCount > 0 ? `${newCount} neu` : 'alle bereits drin'}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
