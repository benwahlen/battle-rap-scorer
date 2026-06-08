import { useEffect } from 'react'
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import AuthScreen from './screens/AuthScreen'
import Dashboard from './screens/Dashboard'
import RoomDetail from './screens/RoomDetail'
import CreateRoom from './screens/CreateRoom'
import JoinRoom from './screens/JoinRoom'
import ProfileScreen from './screens/ProfileScreen'
import NewEvent from './screens/NewEvent'
import BattleOverview from './screens/BattleOverview'
import WaitScreen from './screens/WaitScreen'
import Reveal from './screens/Reveal'
import EventPool from './screens/EventPool'
import Backoffice from './screens/Backoffice'

function AppRoutes() {
  const { user, profile, loading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  // After login, check for pending invite redirect
  useEffect(() => {
    if (user) {
      const pending = sessionStorage.getItem('pendingInvite')
      if (pending) {
        sessionStorage.removeItem('pendingInvite')
        navigate(`/join/${pending}`, { replace: true })
      }
    }
  }, [user, navigate])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // Allow /join/* without auth — JoinRoom handles the "please login" state
  if (!user) {
    if (location.pathname.startsWith('/join/')) {
      return (
        <Routes>
          <Route path="/join/:inviteCode" element={<JoinRoom />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      )
    }
    return <AuthScreen />
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/room/new" element={<CreateRoom />} />
      <Route path="/room/:roomId" element={<RoomDetail />} />
      <Route path="/room/:roomId/new-event" element={<NewEvent />} />
      <Route path="/room/:roomId/score/:eventId" element={<BattleOverview />} />
      <Route path="/room/:roomId/wait/:eventId" element={<WaitScreen />} />
      <Route path="/room/:roomId/reveal/:eventId" element={<Reveal />} />
      <Route path="/room/:roomId/reveal/:eventId/:battleId" element={<Reveal />} />
      <Route path="/join/:inviteCode" element={<JoinRoom />} />
      <Route path="/profile" element={<ProfileScreen />} />
      <Route path="/event-pool/:roomId" element={<EventPool />} />
      <Route path="/backoffice" element={<Backoffice />} />
      <Route path="/backoffice/new-event" element={<NewEvent />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}
