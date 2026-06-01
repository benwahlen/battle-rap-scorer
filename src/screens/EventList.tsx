import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { Event, UserName } from '../types'

type EventStatus = 'unrated' | 'waiting' | 'reveal'

interface EventWithStatus extends Event {
  battleCount: number
  status: EventStatus
}

interface Props {
  user: UserName
  onNewEvent: () => void
  onOpenEvent: (eventId: string, status: EventStatus) => void
  onLogout: () => void
}

export default function EventList({ user, onNewEvent, onOpenEvent, onLogout }: Props) {
  const [events, setEvents] = useState<EventWithStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const otherUser: UserName = user === 'Ben' ? 'Löwe' : 'Ben'

  const loadEvents = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: eventsData, error: eventsError } = await supabase
        .from('events')
        .select('*')
        .order('created_at', { ascending: false })
      if (eventsError) throw eventsError

      const withStatus: EventWithStatus[] = await Promise.all(
        (eventsData ?? []).map(async (event) => {
          const { data: battles } = await supabase
            .from('battles')
            .select('id')
            .eq('event_id', event.id)

          const battleIds = (battles ?? []).map((b) => b.id)
          const battleCount = battleIds.length

          if (battleCount === 0) {
            return { ...event, battleCount: 0, status: 'unrated' as EventStatus }
          }

          const { data: verdicts } = await supabase
            .from('battle_verdicts')
            .select('battle_id, user_name')
            .in('battle_id', battleIds)

          const myDone = (verdicts ?? []).filter((v) => v.user_name === user).length === battleCount
          const otherDone = (verdicts ?? []).filter((v) => v.user_name === otherUser).length === battleCount

          const status: EventStatus = myDone && otherDone ? 'reveal' : myDone ? 'waiting' : 'unrated'
          return { ...event, battleCount, status }
        })
      )

      setEvents(withStatus)
    } catch {
      setError('Verbindung zu Supabase fehlgeschlagen. Bitte prüfe deine Internetverbindung.')
    } finally {
      setLoading(false)
    }
  }, [user, otherUser])

  useEffect(() => {
    loadEvents()
  }, [loadEvents])

  const statusBadge = (status: EventStatus) => {
    if (status === 'reveal')
      return <span className="text-xs bg-purple-500/20 text-purple-400 px-2.5 py-1 rounded-full font-medium">🔓 Reveal</span>
    if (status === 'waiting')
      return <span className="text-xs bg-blue-500/20 text-blue-400 px-2.5 py-1 rounded-full font-medium">Wartet auf {otherUser}</span>
    return <span className="text-xs bg-orange-500/20 text-orange-400 px-2.5 py-1 rounded-full font-medium">Nicht bewertet</span>
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="sticky top-0 bg-black/95 backdrop-blur border-b border-zinc-900 px-4 py-4 flex items-center justify-between z-10">
        <div>
          <h1 className="text-xl font-black">Battle Rap Scorer</h1>
          <p className="text-zinc-500 text-sm">{user}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onNewEvent}
            className="bg-yellow-400 text-black font-bold text-sm px-4 py-2 rounded-xl active:scale-95 transition-transform"
          >
            + Event
          </button>
          <button onClick={onLogout} className="text-zinc-600 text-sm px-2 py-2">
            ↩
          </button>
        </div>
      </div>

      <div className="p-4">
        {loading && (
          <div className="flex items-center justify-center py-20">
            <p className="text-zinc-600">Lade Events…</p>
          </div>
        )}

        {error && (
          <div className="bg-red-900/30 border border-red-800 rounded-xl p-4 text-red-400 text-sm mb-4">
            {error}
            <button onClick={loadEvents} className="block mt-2 text-red-300 underline text-xs">
              Erneut versuchen
            </button>
          </div>
        )}

        {!loading && !error && events.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="text-5xl mb-4">🎤</div>
            <p className="text-zinc-400 font-medium">Noch keine Events.</p>
            <p className="text-zinc-600 text-sm mt-1">Tippe „+ Event" um loszulegen.</p>
          </div>
        )}

        <div className="flex flex-col gap-3">
          {events.map((event) => (
            <button
              key={event.id}
              onClick={() => onOpenEvent(event.id, event.status)}
              className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 text-left active:scale-95 transition-transform w-full"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h2 className="font-bold text-white truncate text-base">{event.name}</h2>
                  <div className="flex items-center gap-1.5 mt-0.5 text-zinc-500 text-sm flex-wrap">
                    {event.date && <span>{event.date}</span>}
                    {event.date && event.location && <span>·</span>}
                    {event.location && <span>{event.location}</span>}
                  </div>
                  <p className="text-zinc-700 text-xs mt-1">
                    {event.battleCount} {event.battleCount === 1 ? 'Battle' : 'Battles'}
                  </p>
                </div>
                <div className="flex-shrink-0">{statusBadge(event.status)}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
