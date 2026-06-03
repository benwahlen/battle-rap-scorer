import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import type { UserName } from '../types'

interface Props {
  user: UserName
  eventId: string
  onBothDone: () => void
  onBack: () => void
  onEdit: () => void
}

export default function WaitScreen({ user, eventId, onBothDone, onBack, onEdit }: Props) {
  const otherUser: UserName = user === 'Ben' ? 'Löwe' : 'Ben'
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const doneRef = useRef(false)

  useEffect(() => {
    check()
    intervalRef.current = setInterval(check, 10000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId])

  async function check() {
    if (doneRef.current) return
    try {
      const { data: battles } = await supabase.from('battles').select('id').eq('event_id', eventId)
      const ids = (battles ?? []).map(b => b.id)
      if (ids.length === 0) return
      const { data: verdicts } = await supabase
        .from('battle_verdicts').select('user_name').in('battle_id', ids).eq('user_name', otherUser)
      if ((verdicts ?? []).length === ids.length) {
        doneRef.current = true
        if (intervalRef.current) clearInterval(intervalRef.current)
        onBothDone()
      }
    } catch { /* stille Fehlerbehandlung */ }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <div className="sticky top-0 bg-app-bg/90 backdrop-blur border-b border-white/5 px-4 py-4 flex items-center gap-3 noise-header">
        <button onClick={onBack} className="text-app-muted text-xl w-8">←</button>
        <h1 className="font-bebas text-xl text-app-text tracking-wider">Warten…</h1>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-6">
        <div className="text-7xl animate-pulse">⏳</div>
        <div>
          <h2 className="font-bebas text-3xl text-app-text tracking-wider mb-2">Bewertung eingereicht!</h2>
          <p className="font-inter text-app-muted text-base">
            Warte auf <span className="text-secondary font-bold">{otherUser}</span>…
          </p>
        </div>
        <p className="font-inter text-app-muted/50 text-[10px] uppercase tracking-[0.15em]">
          Aktualisiert sich automatisch alle 10 Sek.
        </p>
      </div>

      <div className="p-4 border-t border-white/5 flex flex-col gap-3">
        <button onClick={onEdit}
          className="w-full card font-bebas text-app-text py-3.5 rounded-lg tracking-[2px] text-sm active:scale-95 transition-transform border-primary/30">
          ✎ Bewertung bearbeiten
        </button>
        <p className="font-inter text-app-muted/50 text-[10px] text-center uppercase tracking-[0.1em]">
          Nur möglich solange {otherUser} noch nicht submitted hat
        </p>
      </div>
    </div>
  )
}
