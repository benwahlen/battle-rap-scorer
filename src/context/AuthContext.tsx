import { createContext, useContext, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { UserRole } from '../types'

// ── Types ────────────────────────────────────────────────────────────────────

export interface Profile {
  id: string
  display_name: string
  role: UserRole
  avatar_index: number
}

interface AuthContextValue {
  user: User | null
  profile: Profile | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signUp: (email: string, password: string, displayName: string) => Promise<{ error: string | null; emailSent: boolean }>
  signOut: () => Promise<void>
}

// ── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

// ── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Load initial session
    supabase.auth.getSession().then(({ data }: { data: { session: { user: User } | null } }) => {
      const sessionUser = data.session?.user ?? null
      setUser(sessionUser)
      if (sessionUser) {
        loadOrCreateProfile(sessionUser).finally(() => setLoading(false))
      } else {
        setLoading(false)
      }
    })

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event: string, session: { user: User } | null) => {
        const sessionUser = session?.user ?? null
        setUser(sessionUser)
        if (sessionUser) {
          loadOrCreateProfile(sessionUser)
        } else {
          setProfile(null)
          setLoading(false)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadOrCreateProfile(authUser: User) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, display_name, role, avatar_index')
        .eq('id', authUser.id)
        .single()

      if (data && !error) {
        setProfile(data as Profile)
        return
      }

      // No profile yet — create from user_metadata (set during signUp)
      const meta = authUser.user_metadata as Record<string, unknown>
      const displayName =
        (typeof meta?.display_name === 'string' ? meta.display_name : null) ??
        authUser.email?.split('@')[0] ??
        'User'

      const { data: created } = await supabase
        .from('profiles')
        .insert({ id: authUser.id, display_name: displayName })
        .select('id, display_name, role, avatar_index')
        .single()

      if (created) setProfile(created as Profile)
    } catch {
      // Silently ignore — profile loads on next state change
    } finally {
      setLoading(false)
    }
  }

  const signIn = async (email: string, password: string): Promise<{ error: string | null }> => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error ? translateError(error.message) : null }
  }

  const signUp = async (
    email: string,
    password: string,
    displayName: string
  ): Promise<{ error: string | null; emailSent: boolean }> => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } },
    })
    if (error) return { error: translateError(error.message), emailSent: false }
    // If user has a session immediately → email confirmation disabled
    const emailSent = !data.session
    return { error: null, emailSent }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setProfile(null)
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

// ── Role hooks ───────────────────────────────────────────────────────────────

export function useIsSuperAdmin() {
  const { profile } = useAuth()
  return profile?.role === 'super_admin'
}

export function useIsGroupAdmin(roomId: string | undefined) {
  const { user } = useAuth()
  const userId = user?.id
  const [isRoomAdmin, setIsRoomAdmin] = useState(false)

  useEffect(() => {
    if (!roomId || !userId) { setIsRoomAdmin(false); return }
    let cancelled = false
    supabase
      .from('room_members')
      .select('role')
      .eq('room_id', roomId)
      .eq('user_id', userId)
      .single()
      .then(({ data }) => { if (!cancelled) setIsRoomAdmin(data?.role === 'admin') })
    return () => { cancelled = true }
  }, [roomId, userId])

  return isRoomAdmin
}

// ── Error translation ─────────────────────────────────────────────────────────

function translateError(msg: string): string {
  if (msg.includes('Invalid login credentials')) return 'Falsche Email oder falsches Passwort.'
  if (msg.includes('Email not confirmed')) return 'Bitte bestätige zuerst deine Email.'
  if (msg.includes('User already registered') || msg.includes('already been registered'))
    return 'Diese Email ist bereits registriert.'
  if (msg.includes('Password should be at least')) return 'Passwort muss mindestens 6 Zeichen haben.'
  if (msg.includes('Unable to validate email')) return 'Ungültige Email-Adresse.'
  if (msg.includes('rate limit')) return 'Zu viele Versuche. Bitte kurz warten.'
  return msg
}
