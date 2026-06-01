import { useState } from 'react'
import type { UserName } from './types'
import UserSelect from './screens/UserSelect'
import EventList from './screens/EventList'
import NewEvent from './screens/NewEvent'
import ScoreScreen from './screens/ScoreScreen'
import WaitScreen from './screens/WaitScreen'
import Reveal from './screens/Reveal'

type Screen =
  | { name: 'user-select' }
  | { name: 'event-list' }
  | { name: 'new-event' }
  | { name: 'score'; eventId: string }
  | { name: 'wait'; eventId: string }
  | { name: 'reveal'; eventId: string }

type EventStatus = 'unrated' | 'waiting' | 'reveal'

function App() {
  const [user, setUser] = useState<UserName | null>(() =>
    localStorage.getItem('user') as UserName | null
  )
  const [screen, setScreen] = useState<Screen>(
    localStorage.getItem('user') ? { name: 'event-list' } : { name: 'user-select' }
  )

  const handleUserSelect = (name: UserName) => {
    localStorage.setItem('user', name)
    setUser(name)
    setScreen({ name: 'event-list' })
  }

  const handleLogout = () => {
    localStorage.removeItem('user')
    setUser(null)
    setScreen({ name: 'user-select' })
  }

  const handleOpenEvent = (eventId: string, status: EventStatus) => {
    if (status === 'reveal') setScreen({ name: 'reveal', eventId })
    else if (status === 'waiting') setScreen({ name: 'wait', eventId })
    else setScreen({ name: 'score', eventId })
  }

  if (screen.name === 'user-select') {
    return <UserSelect onSelect={handleUserSelect} />
  }

  if (!user) return null

  if (screen.name === 'event-list') {
    return (
      <EventList
        user={user}
        onNewEvent={() => setScreen({ name: 'new-event' })}
        onOpenEvent={handleOpenEvent}
        onLogout={handleLogout}
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

  if (screen.name === 'score') {
    return (
      <ScoreScreen
        user={user}
        eventId={screen.eventId}
        onBack={() => setScreen({ name: 'event-list' })}
        onSubmitted={(otherDone) =>
          setScreen(otherDone ? { name: 'reveal', eventId: screen.eventId } : { name: 'wait', eventId: screen.eventId })
        }
      />
    )
  }

  if (screen.name === 'wait') {
    return (
      <WaitScreen
        user={user}
        eventId={screen.eventId}
        onBothDone={() => setScreen({ name: 'reveal', eventId: screen.eventId })}
        onBack={() => setScreen({ name: 'event-list' })}
      />
    )
  }

  if (screen.name === 'reveal') {
    return (
      <Reveal
        user={user}
        eventId={screen.eventId}
        onBack={() => setScreen({ name: 'event-list' })}
      />
    )
  }

  return null
}

export default App
