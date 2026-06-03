import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Event } from '../types'

interface EventPoolItem extends Event {
  battleCount: number
  alreadyAdded: boolean
  adding: boolean
}

export default function EventPool() {
  const { roomId } = useParams<{ roomId: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [events, setEvents] = useState<EventPoolItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!roomId) return
    setLoading(true)
    setError(null)
    try {
      const [{ data: allEvents, error: evErr }, { data: roomEventsRows }] = await Promise.all([
        supabase.from('events').select('*').order('created_at', { ascending: false }),
        supabase.from('room_events').select('event_id').eq('room_id', roomId),
      ])
      if (evErr) throw evErr

      const addedIds = new Set((roomEventsRows ?? []).map((re: { event_id: string }) => re.event_id))

      const withMeta: EventPoolItem[] = await Promise.all(
        (allEvents ?? []).map(async (event: Event) => {
          const { data: battles } = await supabase
            .from('battles').select('id').eq('event_id', event.id)
          return {
            ...event,
            battleCount: (battles ?? []).length,
            alreadyAdded: addedIds.has(event.id),
            adding: false,
          }
        })
      )
      setEvents(withMeta)
    } catch {
      setError('Fehler beim Laden der Events.')
    } finally {
      setLoading(false)
    }
  }, [roomId])

  useEffect(() => { load() }, [load])

  const addToRoom = async (eventId: string) => {
    if (!roomId) return
    setEvents(prev => prev.map(e => e.id === eventId ? { ...e, adding: true } : e))
    const { error: insErr } = await supabase.from('room_events').upsert(
      { room_id: roomId, event_id: eventId, added_by: user?.id ?? null },
      { onConflict: 'room_id,event_id' }
    )
    if (insErr) {
      setError('Fehler beim Hinzufügen. Bitte erneut versuchen.')
      setEvents(prev => prev.map(e => e.id === eventId ? { ...e, adding: false } : e))
    } else {
      setEvents(prev => prev.map(e => e.id === eventId ? { ...e, alreadyAdded: true, adding: false } : e))
    }
  }

  return (
    <div className="min-h-screen">
      <div className="sticky top-0 bg-app-bg/90 backdrop-blur border-b border-white/5 px-4 py-4 flex items-center gap-3 z-10 noise-header">
        <button onClick={() => navigate(roomId ? `/room/${roomId}` : '/')} className="text-app-muted text-xl w-8">←</button>
        <div className="flex-1 min-w-0">
          <p className="font-inter text-app-muted text-[10px] uppercase tracking-[0.15em]">Event-Pool</p>
          <h1 className="font-bebas text-xl text-app-text tracking-wider leading-none">Events hinzufügen</h1>
        </div>
      </div>

      <div className="p-4 flex flex-col gap-3">
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
            <p className="font-bebas text-lg text-app-text tracking-wider">Keine Events verfügbar</p>
            <p className="font-inter text-app-muted text-[10px] uppercase tracking-[0.1em]">Super-Admin muss zuerst Events anlegen</p>
          </div>
        )}

        {events.map(event => (
          <div key={event.id} className="card rounded-lg p-4 flex items-center gap-3">
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
            {event.alreadyAdded ? (
              <span className="font-inter text-[10px] text-app-muted/60 uppercase tracking-[0.1em] flex-shrink-0">
                ✓ Hinzugefügt
              </span>
            ) : (
              <button
                onClick={() => addToRoom(event.id)}
                disabled={event.adding}
                className="bg-primary font-bebas text-white text-xs px-3 py-1.5 rounded tracking-[1px] flex-shrink-0 active:scale-95 transition-transform disabled:opacity-50"
              >
                {event.adding ? '…' : '+ Hinzufügen'}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
