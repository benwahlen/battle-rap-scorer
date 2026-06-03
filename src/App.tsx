import { useState } from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import AuthScreen from './screens/AuthScreen'
import EventList from './screens/EventList'
import NewEvent from './screens/NewEvent'
import BattleOverview from './screens/BattleOverview'
import WaitScreen from './screens/WaitScreen'
import Reveal from './screens/Reveal'

type Screen =
  | { name: 'event-list' }
  | { name: 'new-event' }
  | { name: 'battle-overview'; eventId: string }
  | { name: 'wait'; eventId: string }
  | { name: 'reveal'; eventId: string }

type EventStatus = 'unrated' | 'waiting' | 'reveal'

function AppInner() {
  const { user, profile, loading, signOut } = useAuth()
  const [screen, setScreen] = useState<Screen>({ name: 'event-list' })

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!user || !profile) return <AuthScreen />

  const handleOpenEvent = (eventId: string, status: EventStatus) => {
    if (status === 'reveal') setScreen({ name: 'reveal', eventId })
    else if (status === 'waiting') setScreen({ name: 'wait', eventId })
    else setScreen({ name: 'battle-overview', eventId })
  }

  if (screen.name === 'event-list') {
    return (
      <EventList
        displayName={profile.display_name}
        onNewEvent={() => setScreen({ name: 'new-event' })}
        onOpenEvent={handleOpenEvent}
        onLogout={signOut}
      />
    )
  }

  if (screen.name === 'new-event') {
    return (
      <NewEvent
        onBack={() => setScreen({ name: 'event-list' })}
        onCreated={() => setScreen({ name: 'event-list' })}
      />
    )
  }

  if (screen.name === 'battle-overview') {
    return (
      <BattleOverview
        displayName={profile.display_name}
        eventId={screen.eventId}
        onBack={() => setScreen({ name: 'event-list' })}
        onSubmitted={otherDone =>
          setScreen(otherDone
            ? { name: 'reveal', eventId: screen.eventId }
            : { name: 'wait', eventId: screen.eventId }
          )
        }
      />
    )
  }

  if (screen.name === 'wait') {
    return (
      <WaitScreen
        displayName={profile.display_name}
        eventId={screen.eventId}
        onBothDone={() => setScreen({ name: 'reveal', eventId: screen.eventId })}
        onBack={() => setScreen({ name: 'event-list' })}
        onEdit={() => setScreen({ name: 'battle-overview', eventId: screen.eventId })}
      />
    )
  }

  if (screen.name === 'reveal') {
    return (
      <Reveal
        displayName={profile.display_name}
        eventId={screen.eventId}
        onBack={() => setScreen({ name: 'event-list' })}
      />
    )
  }

  return null
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  )
}
