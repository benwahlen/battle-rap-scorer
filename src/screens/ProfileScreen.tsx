import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth, useIsSuperAdmin } from '../context/AuthContext'

const EMOJIS = ['🎤','🎵','🎧','🔥','⚡','💜','🦁','👑','🐉','💀','🌟','🎯','🏆','💎','🗡️','🎭','🌊','🌙','☀️','🦅','🐺','🦊','🐯','🦋','🌺','🍀','⭐','🎪','🎨','🎲']

export default function ProfileScreen() {
  const { user, profile, signOut } = useAuth()
  const navigate = useNavigate()
  const isSuperAdmin = useIsSuperAdmin()

  const [editingName, setEditingName] = useState(false)
  const [newName, setNewName] = useState(profile?.display_name ?? '')
  const [saving, setSaving] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)
  const [nameSuccess, setNameSuccess] = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  const [avatarEmoji, setAvatarEmoji] = useState(profile?.avatar_emoji ?? '🎤')

  const handleSaveName = async () => {
    if (!newName.trim() || newName.trim() === profile?.display_name) {
      setEditingName(false)
      return
    }
    setSaving(true)
    setNameError(null)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ display_name: newName.trim() })
        .eq('id', user!.id)
      if (error) {
        if (error.code === '23505') {
          setNameError('Dieser Anzeigename ist bereits vergeben.')
        } else {
          setNameError('Fehler beim Speichern.')
        }
        return
      }
      setNameSuccess(true)
      setEditingName(false)
      setTimeout(() => setNameSuccess(false), 2000)
      // Note: profile in context won't update until page refresh — acceptable for now
    } catch {
      setNameError('Fehler beim Speichern.')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveEmoji = async (emoji: string) => {
    setAvatarEmoji(emoji)
    setShowPicker(false)
    await supabase.from('profiles').update({ avatar_emoji: emoji }).eq('id', user!.id)
  }

  const handleLogout = async () => {
    await signOut()
    navigate('/', { replace: true })
  }

  const joinedDate = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' })
    : '–'

  return (
    <div className="min-h-screen">
      <div className="sticky top-0 bg-app-bg/90 backdrop-blur border-b border-white/5 px-4 py-4 flex items-center gap-3 z-10 noise-header">
        <button onClick={() => navigate('/')} className="text-app-muted text-xl w-8">←</button>
        <h1 className="font-bebas text-xl text-app-text tracking-wider">Profil</h1>
      </div>

      <div className="p-4 flex flex-col gap-6 max-w-sm">
        {/* Avatar */}
        <div className="flex flex-col items-center gap-3 pt-4">
          <div className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center cursor-pointer active:scale-95 transition-transform"
            onClick={() => setShowPicker(true)}>
            <span className="text-4xl">{avatarEmoji}</span>
          </div>
          <button onClick={() => setShowPicker(true)}
            className="font-inter text-primary text-xs underline">
            Avatar ändern
          </button>
          <p className="font-bebas text-2xl text-app-text tracking-wider">{profile?.display_name}</p>
          <p className="font-inter text-app-muted text-xs">Mitglied seit {joinedDate}</p>
        </div>

        {/* Display name edit */}
        <div className="card rounded-lg p-4 flex flex-col gap-3">
          <label className="font-inter text-[10px] uppercase tracking-[0.1em] text-app-muted">Anzeigename</label>
          {editingName ? (
            <div className="flex gap-2">
              <input
                type="text"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                autoFocus
                className="flex-1 bg-white/5 border border-white/10 rounded px-3 py-2.5 text-app-text focus:outline-none focus:border-primary/50 font-inter text-sm"
              />
              <button
                onClick={handleSaveName}
                disabled={saving}
                className="bg-primary font-bebas text-white px-4 py-2.5 rounded tracking-[1px] text-sm disabled:opacity-50"
              >
                {saving ? '…' : 'OK'}
              </button>
              <button
                onClick={() => { setEditingName(false); setNewName(profile?.display_name ?? '') }}
                className="font-inter text-app-muted px-3 py-2.5 text-sm"
              >
                ✕
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <span className="font-inter text-app-text text-sm">{profile?.display_name}</span>
              <button
                onClick={() => setEditingName(true)}
                className="font-inter text-primary text-xs underline"
              >
                Ändern
              </button>
            </div>
          )}
          {nameError && <p className="font-inter text-red-400 text-xs">{nameError}</p>}
          {nameSuccess && <p className="font-inter text-secondary text-xs">✓ Gespeichert</p>}
        </div>

        {/* Email */}
        <div className="card rounded-lg p-4 flex flex-col gap-1">
          <label className="font-inter text-[10px] uppercase tracking-[0.1em] text-app-muted">Email</label>
          <p className="font-inter text-app-text text-sm">{user?.email}</p>
        </div>

        {/* Backoffice (only super_admin) */}
        {isSuperAdmin && (
          <button
            onClick={() => navigate('/backoffice')}
            className="w-full card rounded-lg py-4 font-bebas text-primary tracking-[2px] text-sm border-primary/20 active:scale-95 transition-transform"
          >
            ⚙ Backoffice
          </button>
        )}

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="w-full card rounded-lg py-4 font-bebas text-accent tracking-[2px] text-sm border-accent/20 active:scale-95 transition-transform mt-2"
        >
          Ausloggen
        </button>
      </div>

      {/* Emoji Picker Modal (Bottom Sheet) */}
      {showPicker && (
        <div className="fixed inset-0 z-50 flex items-end" onClick={() => setShowPicker(false)}>
          <div className="w-full bg-app-bg border-t border-white/10 p-4 pb-8 rounded-t-2xl" onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-4" />
            <p className="font-bebas text-lg text-app-text tracking-wider text-center mb-4">Avatar wählen</p>
            <div className="grid grid-cols-6 gap-3">
              {EMOJIS.map(e => (
                <button key={e} onClick={() => handleSaveEmoji(e)}
                  className={`text-3xl py-2 rounded-lg transition-colors active:scale-90 ${avatarEmoji === e ? 'bg-primary/20 ring-1 ring-primary' : 'bg-white/5'}`}>
                  {e}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
