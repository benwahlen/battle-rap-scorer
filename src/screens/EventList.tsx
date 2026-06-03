import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { Event } from '../types'

type EventStatus = 'unrated' | 'waiting' | 'reveal'

interface EventWithStatus extends Event {
  battleCount: number
  status: EventStatus
}

interface Props {
  displayName: string
  onNewEvent: () => void
  onOpenEvent: (eventId: string, status: EventStatus) => void
  onLogout: () => void
}

export default function EventList({ displayName, onNewEvent, onOpenEvent, onLogout }: Props) {
  const [events, setEvents] = useState<EventWithStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadEvents = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: eventsData, error: eventsError } = await supabase
        .from('events').select('*').order('created_at', { ascending: false })
      if (eventsError) throw eventsError

      const withStatus: EventWithStatus[] = await Promise.all(
        (eventsData ?? []).map(async (event) => {
          const { data: battles } = await supabase
            .from('battles').select('id').eq('event_id', event.id)
          const battleIds = (battles ?? []).map((b: { id: string }) => b.id)
          const battleCount = battleIds.length
          if (battleCount === 0) return { ...event, battleCount: 0, status: 'unrated' as EventStatus }

          const { data: verdicts } = await supabase
            .from('battle_verdicts').select('battle_id, user_name').in('battle_id', battleIds)

          const allVerdicts = verdicts ?? []
          const myDone = allVerdicts.filter((v: { user_name: string }) => v.user_name === displayName).length === battleCount

          // Check if any other user has completed all battles
          const otherUserNames = [...new Set(
            allVerdicts
              .filter((v: { user_name: string }) => v.user_name !== displayName)
              .map((v: { user_name: string }) => v.user_name)
          )]
          const otherDone = otherUserNames.some(name =>
            allVerdicts.filter((v: { user_name: string }) => v.user_name === name).length === battleCount
          )

          const status: EventStatus = myDone && otherDone ? 'reveal' : myDone ? 'waiting' : 'unrated'
          return { ...event, battleCount, status }
        })
      )
      setEvents(withStatus)
    } catch {
      setError('Verbindung fehlgeschlagen. Bitte Internetverbindung prüfen.')
    } finally {
      setLoading(false)
    }
  }, [displayName])

  useEffect(() => { loadEvents() }, [loadEvents])

  const statusBadge = (status: EventStatus) => {
    if (status === 'reveal')
      return <span className="font-inter text-[10px] bg-accent/20 text-accent px-2.5 py-1 rounded uppercase tracking-[0.1em]">🔓 Reveal</span>
    if (status === 'waiting')
      return <span className="font-inter text-[10px] bg-secondary/20 text-secondary px-2.5 py-1 rounded uppercase tracking-[0.1em]">⏳ Wartet</span>
    return <span className="font-inter text-[10px] bg-primary/20 text-primary px-2.5 py-1 rounded uppercase tracking-[0.1em]">Ausstehend</span>
  }

  return (
    <div className="min-h-screen">
      <div className="sticky top-0 bg-app-bg/90 backdrop-blur border-b border-white/5 px-4 py-4 flex items-center justify-between z-10 noise-header">
        <div>
          <p className="font-inter text-app-muted text-[10px] uppercase tracking-[0.15em]">{displayName}</p>
          <h1 className="font-bebas text-2xl text-app-text tracking-wider leading-none">Battle Rap Scorer</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onNewEvent}
            className="bg-primary font-bebas text-app-text text-sm px-4 py-2 rounded tracking-[2px] active:scale-95 transition-transform shadow-md shadow-primary/30"
          >
            + Event
          </button>
          <button onClick={onLogout} className="text-app-muted text-sm px-2 py-2">↩</button>
        </div>
      </div>

      <div className="p-4">
        {loading && (
          <div className="flex items-center justify-center py-20">
            <p className="font-inter text-app-muted text-[10px] uppercase tracking-[0.15em]">Lade Events…</p>
          </div>
        )}
        {error && (
          <div className="card rounded-lg p-4 border-red-800/50 text-red-400 text-sm mb-4">
            {error}
            <button onClick={loadEvents} className="block mt-2 text-red-300 underline text-xs">Erneut versuchen</button>
          </div>
        )}
        {!loading && !error && events.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="text-5xl mb-4">🎤</div>
            <p className="font-bebas text-xl text-app-text tracking-wider">Noch keine Events</p>
            <p className="font-inter text-app-muted text-[10px] uppercase tracking-[0.1em] mt-2">Tippe „+ Event" um loszulegen</p>
          </div>
        )}
        <div className="flex flex-col gap-3">
          {events.map(event => (
            <button
              key={event.id}
              onClick={() => onOpenEvent(event.id, event.status)}
              className="card rounded-lg p-4 text-left active:scale-95 transition-transform w-full"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h2 className="font-bebas text-lg text-app-text truncate tracking-wider leading-tight">{event.name}</h2>
                  <div className="flex items-center gap-1.5 mt-0.5 text-app-muted flex-wrap">
                    {event.date && <span className="font-inter text-xs">{event.date}</span>}
                    {event.date && event.location && <span className="text-app-muted">·</span>}
                    {event.location && <span className="font-inter text-xs">{event.location}</span>}
                  </div>
                  <p className="font-inter text-[10px] uppercase tracking-[0.1em] text-app-muted/60 mt-1">
                    {event.battleCount} {event.battleCount === 1 ? 'Battle' : 'Battles'}
                  </p>
                </div>
                <div className="flex-shrink-0 mt-0.5">{statusBadge(event.status)}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
