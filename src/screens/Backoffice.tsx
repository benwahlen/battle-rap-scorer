import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth, useIsSuperAdmin } from '../context/AuthContext'
import { isVotingLocked } from '../lib/eventUtils'
import type { UserRole, Battle } from '../types'
import Avatar from '../components/Avatar'

type Tab = 'users' | 'events' | 'rooms'

interface UserRow {
  id: string
  display_name: string
  role: UserRole
  created_at: string
}

interface EventRow {
  id: string
  name: string
  date: string | null
  location: string | null
  created_at: string
  roomCount: number
  roomNames: string[]
  voting_opens_at: string | null
  voting_released_at: string | null
}

interface RoomRow {
  id: string
  name: string
  created_at: string
  memberCount: number
  eventCount: number
}

export default function Backoffice() {
  const navigate = useNavigate()
  const { loading: authLoading } = useAuth()
  const isSuperAdmin = useIsSuperAdmin()
  const [tab, setTab] = useState<Tab>('users')

  useEffect(() => {
    if (!authLoading && !isSuperAdmin) navigate('/', { replace: true })
  }, [authLoading, isSuperAdmin, navigate])

  if (!isSuperAdmin) return null

  return (
    <div className="min-h-screen">
      <div className="sticky top-0 bg-app-bg/90 backdrop-blur border-b border-white/5 px-4 py-4 flex items-center gap-3 z-10 noise-header">
        <button onClick={() => navigate('/profile')} className="text-app-muted text-xl w-8">←</button>
        <h1 className="font-bebas text-xl text-app-text tracking-wider">Backoffice</h1>
      </div>

      {/* Tab Bar */}
      <div className="flex border-b border-white/5">
        {([['users', 'User'], ['events', 'Events'], ['rooms', 'Gruppen']] as [Tab, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 py-3 font-bebas text-sm tracking-[1px] transition-colors ${
              tab === key ? 'text-primary border-b-2 border-primary' : 'text-app-muted'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="p-4">
        {tab === 'users' && <UsersTab />}
        {tab === 'events' && <EventsTab />}
        {tab === 'rooms' && <RoomsTab />}
      </div>
    </div>
  )
}

// ── Tab: Users ────────────────────────────────────────────────────────────────

function UsersTab() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('profiles')
      .select('id, display_name, role, created_at')
      .order('created_at', { ascending: false })
    if (err) { setError('Fehler beim Laden.'); setLoading(false); return }
    setUsers((data ?? []) as UserRow[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    setActionError(null)
    const { error: err } = await supabase
      .from('profiles')
      .update({ role: newRole })
      .eq('id', userId)
    if (err) {
      setActionError('Rolle konnte nicht geändert werden. Bitte RLS-Policy prüfen.')
    } else {
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u))
    }
  }

  const filtered = users.filter(u =>
    u.display_name.toLowerCase().includes(search.toLowerCase())
  )

  const roleLabel: Record<UserRole, string> = {
    member: 'Member',
    group_admin: 'Gruppen-Admin',
    super_admin: 'Super-Admin',
  }

  return (
    <div className="flex flex-col gap-4">
      <input
        type="text"
        placeholder="Suche nach Name…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full bg-white/5 border border-white/10 rounded px-4 py-3 text-app-text placeholder-app-muted/50 focus:outline-none focus:border-primary/50 font-inter text-sm"
      />

      {loading && <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>}
      {error && <p className="font-inter text-red-400 text-sm">{error}</p>}
      {actionError && <p className="font-inter text-red-400 text-sm">{actionError}</p>}

      {filtered.map(user => (
        <div key={user.id} className="card rounded-lg p-4 flex items-center gap-3">
          <Avatar name={user.display_name} size={36} />
          <div className="flex-1 min-w-0">
            <p className="font-bebas text-base text-app-text tracking-wider truncate">{user.display_name}</p>
            <p className="font-inter text-app-muted text-[10px]">
              {new Date(user.created_at).toLocaleDateString('de-DE')}
            </p>
          </div>
          <select
            value={user.role}
            onChange={e => handleRoleChange(user.id, e.target.value as UserRole)}
            className="bg-white/5 border border-white/10 rounded px-2 py-1.5 text-app-text font-inter text-xs focus:outline-none focus:border-primary/50 flex-shrink-0 max-w-[130px]"
          >
            {(Object.entries(roleLabel) as [UserRole, string][]).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        </div>
      ))}

      {!loading && filtered.length === 0 && (
        <p className="font-inter text-app-muted text-sm text-center py-8">Keine User gefunden.</p>
      )}
    </div>
  )
}

// ── Tab: Events ───────────────────────────────────────────────────────────────

interface EditForm {
  name: string
  date: string
  location: string
  voting_opens_at: string
}

interface EditBattle {
  id: string | null      // null = neu, wird bei Speichern inserted
  mc1: string
  mc2: string
  format: string
  hasScores: boolean
  position: number
}

function EventsTab() {
  const navigate = useNavigate()
  const [events, setEvents] = useState<EventRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [battlesMap, setBattlesMap] = useState<Record<string, Battle[]>>({})

  const [editingEvent, setEditingEvent] = useState<EventRow | null>(null)
  const [editForm, setEditForm] = useState<EditForm>({ name: '', date: '', location: '', voting_opens_at: '' })
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [editBattles, setEditBattles] = useState<EditBattle[]>([])
  const [editBattlesLoading, setEditBattlesLoading] = useState(false)
  const [deletedBattleIds, setDeletedBattleIds] = useState<string[]>([])
  const [editError, setEditError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const [{ data: evData, error: evErr }, { data: reData, error: reErr }] = await Promise.all([
      supabase.from('events').select('id, name, date, location, room_id, created_at, voting_opens_at, voting_released_at').order('created_at', { ascending: false }),
      supabase.from('room_events').select('event_id, room_id, rooms(name)'),
    ])
    if (evErr) { setError('Fehler beim Laden.'); setLoading(false); return }
    if (reErr) console.error('[Backoffice EventsTab] room_events query error:', reErr.code, reErr.message, reErr.hint)

    type RERow = { event_id: string; room_id: string; rooms: { name: string } | { name: string }[] | null }
    const reByEvent: Record<string, { id: string; name: string }[]> = {}
    for (const re of (reData ?? []) as unknown as RERow[]) {
      if (!reByEvent[re.event_id]) reByEvent[re.event_id] = []
      const roomsRaw = re.rooms
      const roomName = roomsRaw
        ? Array.isArray(roomsRaw) ? (roomsRaw[0]?.name ?? '?') : roomsRaw.name
        : '?'
      reByEvent[re.event_id].push({ id: re.room_id, name: roomName })
    }

    setEvents(
      (evData ?? []).map((e: { id: string; name: string; date: string | null; location: string | null; room_id: string | null; created_at: string; voting_opens_at: string | null; voting_released_at: string | null }) => {
        const roomEntries = reByEvent[e.id] ?? []
        const roomIdSet = new Set(roomEntries.map(r => r.id))
        const roomNames = roomEntries.map(r => r.name)
        if (e.room_id && !roomIdSet.has(e.room_id)) { roomIdSet.add(e.room_id); roomNames.push('(Legacy)') }
        return { id: e.id, name: e.name, date: e.date, location: e.location, created_at: e.created_at, roomCount: roomIdSet.size, roomNames, voting_opens_at: e.voting_opens_at, voting_released_at: e.voting_released_at }
      })
    )
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const [releasedIds, setReleasedIds] = useState<Set<string>>(new Set())

  const toggleEvent = async (eventId: string) => {
    if (expandedId === eventId) { setExpandedId(null); return }
    setExpandedId(eventId)
    if (!battlesMap[eventId]) {
      const { data } = await supabase.from('battles').select('*').eq('event_id', eventId).order('position')
      setBattlesMap(prev => ({ ...prev, [eventId]: (data ?? []) as Battle[] }))
    }
  }

  const releaseVoting = async (eventId: string) => {
    const { error: err } = await supabase.from('events')
      .update({ voting_released_at: new Date().toISOString() })
      .eq('id', eventId)
    if (!err) setReleasedIds(prev => new Set([...prev, eventId]))
  }

  const closeModal = () => {
    setEditingEvent(null)
    setEditBattles([])
    setDeletedBattleIds([])
    setEditError(null)
  }

  const openEdit = async (event: EventRow) => {
    setEditForm({
      name: event.name,
      date: event.date ?? '',
      location: event.location ?? '',
      voting_opens_at: event.voting_opens_at
        ? new Date(event.voting_opens_at).toISOString().slice(0, 16)
        : '',
    })
    setEditBattles([])
    setDeletedBattleIds([])
    setEditError(null)
    setEditingEvent(event)
    setEditBattlesLoading(true)
    const { data: battlesData } = await supabase
      .from('battles').select('*').eq('event_id', event.id).order('position')
    const battles = (battlesData ?? []) as Battle[]
    if (battles.length > 0) {
      const { data: scoresData } = await supabase
        .from('scores').select('battle_id').in('battle_id', battles.map(b => b.id))
      const withScores = new Set((scoresData ?? []).map((s: { battle_id: string }) => s.battle_id))
      setEditBattles(battles.map(b => ({
        id: b.id, mc1: b.mc1, mc2: b.mc2, format: b.format,
        hasScores: withScores.has(b.id), position: b.position,
      })))
    }
    setEditBattlesLoading(false)
  }

  const addBattle = () => setEditBattles(prev => [
    ...prev,
    { id: null, mc1: '', mc2: '', format: '1v1', hasScores: false, position: prev.length },
  ])

  const deleteBattle = (battleId: string | null, idx: number, hasScores: boolean) => {
    if (battleId === null) {
      setEditBattles(prev => prev.filter((_, i) => i !== idx))
      return
    }
    const msg = hasScores
      ? '⚠️ Dieses Battle hat bereits Bewertungen. Löschen entfernt alle Scores unwiderruflich. Trotzdem löschen?'
      : 'Battle und alle zugehörigen Bewertungen löschen?'
    if (!confirm(msg)) return
    setEditBattles(prev => prev.filter((_, i) => i !== idx))
    setDeletedBattleIds(prev => [...prev, battleId])
  }

  const saveEdit = async () => {
    if (!editingEvent || !editForm.name.trim()) return
    setSaving(true)
    setEditError(null)
    try {
      // 1. Event-Felder updaten
      const { error: evErr } = await supabase.from('events').update({
        name: editForm.name.trim(),
        date: editForm.date.trim() || null,
        location: editForm.location.trim() || null,
        voting_opens_at: editForm.voting_opens_at
          ? new Date(editForm.voting_opens_at).toISOString()
          : null,
      }).eq('id', editingEvent.id)
      if (evErr) {
        console.error('[saveEdit] events UPDATE fehlgeschlagen:', evErr.code, evErr.message, evErr.details, evErr.hint)
        throw evErr
      }

      // 2. Entfernte Battles löschen — child-Rows zuerst (defensiv, falls CASCADE fehlt)
      for (const id of deletedBattleIds) {
        const { error: scErr } = await supabase.from('scores').delete().eq('battle_id', id)
        if (scErr) {
          console.error('[saveEdit] scores DELETE fehlgeschlagen:', scErr.code, scErr.message, scErr.details, scErr.hint)
          throw scErr
        }
        const { error: bvErr } = await supabase.from('battle_verdicts').delete().eq('battle_id', id)
        if (bvErr) {
          console.error('[saveEdit] battle_verdicts DELETE fehlgeschlagen:', bvErr.code, bvErr.message, bvErr.details, bvErr.hint)
          throw bvErr
        }
        const { error: delErr } = await supabase.from('battles').delete().eq('id', id)
        if (delErr) {
          console.error('[saveEdit] battles DELETE fehlgeschlagen:', delErr.code, delErr.message, delErr.details, delErr.hint)
          throw delErr
        }
      }

      // 3. Bestehende Battles updaten
      for (const eb of editBattles.filter(b => b.id !== null)) {
        const { error: updErr } = await supabase.from('battles').update({
          mc1: eb.mc1.trim() || eb.mc1,
          mc2: eb.mc2.trim() || eb.mc2,
          format: eb.format,
        }).eq('id', eb.id!)
        if (updErr) {
          console.error('[saveEdit] battles UPDATE fehlgeschlagen:', updErr.code, updErr.message, updErr.details, updErr.hint)
          throw updErr
        }
      }

      // 4. Neue Battles inserieren (nur wenn mc1 oder mc2 ausgefüllt)
      const newBattles = editBattles.filter(b => b.id === null && (b.mc1.trim() || b.mc2.trim()))
      if (newBattles.length > 0) {
        const existingCount = editBattles.filter(b => b.id !== null).length
        const { error: insErr } = await supabase.from('battles').insert(
          newBattles.map((eb, i) => ({
            event_id: editingEvent.id,
            mc1: eb.mc1.trim() || 'MC1',
            mc2: eb.mc2.trim() || 'MC2',
            format: eb.format,
            position: existingCount + i,
          }))
        )
        if (insErr) {
          console.error('[saveEdit] battles INSERT fehlgeschlagen:', insErr.code, insErr.message, insErr.details, insErr.hint)
          throw insErr
        }
      }

      setEvents(prev => prev.map(e => e.id === editingEvent.id ? {
        ...e,
        name: editForm.name.trim(),
        date: editForm.date.trim() || null,
        location: editForm.location.trim() || null,
        voting_opens_at: editForm.voting_opens_at
          ? new Date(editForm.voting_opens_at).toISOString()
          : null,
      } : e))
      // Battles-Cache für dieses Event leeren → nächstes Aufklappen lädt frisch
      setBattlesMap(prev => { const next = { ...prev }; delete next[editingEvent.id]; return next })
      closeModal()
    } catch (err) {
      const pgErr = err as { message?: string; code?: string; details?: string; hint?: string } | null
      const detail = [pgErr?.code, pgErr?.message, pgErr?.details, pgErr?.hint].filter(Boolean).join(' — ')
      console.error('[saveEdit] Fehler:', err)
      setEditError(`Fehler: ${detail || 'Unbekannt. Konsole prüfen.'}`)
    }
    setSaving(false)
  }

  const deleteEvent = async (eventId: string, eventName: string) => {
    if (!confirm(`Event „${eventName}" und alle Bewertungen unwiderruflich löschen?`)) return
    setDeletingId(eventId)
    const { error: err } = await supabase.from('events').delete().eq('id', eventId)
    if (!err) {
      setEvents(prev => prev.filter(e => e.id !== eventId))
      if (expandedId === eventId) setExpandedId(null)
    }
    setDeletingId(null)
  }

  return (
    <div className="flex flex-col gap-4">
      <button
        onClick={() => navigate('/backoffice/new-event')}
        className="bg-primary font-bebas text-white py-3 rounded-lg tracking-[2px] text-sm active:scale-95 transition-transform"
      >
        + Neues Event
      </button>

      {loading && <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>}
      {error && <p className="font-inter text-red-400 text-sm">{error}</p>}

      {events.map(event => (
        <div key={event.id} className="card rounded-lg overflow-hidden">
          <button
            onClick={() => toggleEvent(event.id)}
            className="w-full p-4 flex items-start justify-between gap-3 text-left active:bg-white/5 transition-colors"
          >
            <div className="flex-1 min-w-0">
              <h2 className="font-bebas text-lg text-app-text truncate tracking-wider leading-tight">{event.name}</h2>
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                {event.date && <span className="font-inter text-app-muted text-xs">{event.date}</span>}
                {event.date && event.location && <span className="text-app-muted">·</span>}
                {event.location && <span className="font-inter text-app-muted text-xs">{event.location}</span>}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
              <span className="font-inter text-[10px] text-app-muted/60 tracking-[0.05em] text-right">
                {event.roomCount} {event.roomCount === 1 ? 'Gruppe' : 'Gruppen'}
                {event.roomNames.length > 0 && (
                  <span className="block text-app-muted/40 normal-case tracking-normal">
                    {event.roomNames.join(', ')}
                  </span>
                )}
              </span>
              <span className="text-app-muted text-xs">{expandedId === event.id ? '▲' : '▾'}</span>
            </div>
          </button>

          {expandedId === event.id && (
            <div className="border-t border-white/5 px-4 py-3 flex flex-col gap-2">
              {/* Action buttons */}
              <div className="flex gap-2">
                <button onClick={() => openEdit(event)}
                  className="flex-1 card rounded-lg py-2 font-bebas text-app-text tracking-[1px] text-sm active:scale-95 transition-transform">
                  Bearbeiten
                </button>
                <button onClick={() => deleteEvent(event.id, event.name)}
                  disabled={deletingId === event.id}
                  className="flex-1 card border-red-800/40 rounded-lg py-2 font-bebas text-red-400 tracking-[1px] text-sm active:scale-95 transition-transform disabled:opacity-50">
                  {deletingId === event.id ? '…' : 'Event löschen'}
                </button>
              </div>

              {isVotingLocked(event) && !releasedIds.has(event.id) && (
                <button onClick={() => releaseVoting(event.id)}
                  className="w-full card border-secondary/20 rounded-lg py-2 font-bebas text-secondary tracking-[1px] text-sm active:scale-95 transition-transform">
                  🔓 Voting jetzt freigeben
                </button>
              )}
              {releasedIds.has(event.id) && (
                <p className="font-inter text-secondary text-xs text-center py-1">✓ Voting freigegeben</p>
              )}
              {!battlesMap[event.id] ? (
                <div className="flex justify-center py-3">
                  <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : battlesMap[event.id].length === 0 ? (
                <p className="font-inter text-app-muted text-xs text-center py-2">Keine Battles vorhanden.</p>
              ) : (
                battlesMap[event.id].map((battle, i) => (
                  <div key={battle.id} className="flex items-center gap-2">
                    <span className="font-inter text-[10px] text-app-muted/60 w-5 flex-shrink-0">{i + 1}.</span>
                    <span className="font-bebas text-sm text-app-text tracking-wider flex-1 truncate">{battle.mc1}</span>
                    <span className="font-inter text-app-muted/60 text-[10px] flex-shrink-0">vs</span>
                    <span className="font-bebas text-sm text-app-text tracking-wider flex-1 truncate text-right">{battle.mc2}</span>
                    <span className="font-inter text-[10px] text-app-muted/60 w-7 text-right flex-shrink-0">{battle.format}</span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      ))}

      {!loading && events.length === 0 && (
        <p className="font-inter text-app-muted text-sm text-center py-8">Noch keine Events vorhanden.</p>
      )}

      {/* Edit Modal */}
      {editingEvent && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/60" onClick={closeModal}>
          <div className="w-full max-h-[88vh] overflow-y-auto bg-app-bg border-t border-white/10 rounded-t-2xl p-4 pb-10 flex flex-col gap-3"
            onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-1 flex-shrink-0" />
            <p className="font-bebas text-lg text-app-text tracking-wider flex-shrink-0">Event bearbeiten</p>

            {/* Event-Felder */}
            <div className="flex flex-col gap-2">
              <label className="font-inter text-[10px] text-app-muted uppercase tracking-[0.1em]">Name *</label>
              <input
                value={editForm.name}
                onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded px-3 py-2.5 text-app-text font-inter text-sm focus:outline-none focus:border-primary/50"
              />
            </div>
            <div className="flex gap-2">
              <div className="flex flex-col gap-2 flex-1">
                <label className="font-inter text-[10px] text-app-muted uppercase tracking-[0.1em]">Datum</label>
                <input
                  value={editForm.date}
                  onChange={e => setEditForm(f => ({ ...f, date: e.target.value }))}
                  placeholder="z.B. 15.06.2025"
                  className="w-full bg-white/5 border border-white/10 rounded px-3 py-2.5 text-app-text font-inter text-sm focus:outline-none focus:border-primary/50"
                />
              </div>
              <div className="flex flex-col gap-2 flex-1">
                <label className="font-inter text-[10px] text-app-muted uppercase tracking-[0.1em]">Ort</label>
                <input
                  value={editForm.location}
                  onChange={e => setEditForm(f => ({ ...f, location: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded px-3 py-2.5 text-app-text font-inter text-sm focus:outline-none focus:border-primary/50"
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label className="font-inter text-[10px] text-app-muted uppercase tracking-[0.1em]">Voting freigeben ab (leer = sofort)</label>
              <input
                type="datetime-local"
                value={editForm.voting_opens_at}
                onChange={e => setEditForm(f => ({ ...f, voting_opens_at: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded px-3 py-2.5 text-app-text font-inter text-sm focus:outline-none focus:border-primary/50"
              />
            </div>

            {/* Battles-Abschnitt */}
            <div className="flex flex-col gap-2 border-t border-white/10 pt-3 mt-1">
              <p className="font-inter text-[10px] text-app-muted uppercase tracking-[0.1em]">Battles</p>

              {editBattlesLoading ? (
                <div className="flex justify-center py-3">
                  <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <>
                  {editBattles.length === 0 && (
                    <p className="font-inter text-app-muted/50 text-xs text-center py-1">Noch keine Battles</p>
                  )}
                  {editBattles.map((eb, idx) => (
                    <div key={eb.id ?? `new-${idx}`} className="card rounded-lg p-2.5 flex flex-col gap-1.5">
                      {eb.hasScores && (
                        <p className="font-inter text-[10px] text-yellow-400/80">
                          ⚠️ Hat bereits Bewertungen. Löschen entfernt alle Scores.
                        </p>
                      )}
                      <div className="flex gap-1.5 items-center">
                        <input
                          value={eb.mc1}
                          onChange={e => setEditBattles(prev => prev.map((b, i) => i === idx ? { ...b, mc1: e.target.value } : b))}
                          placeholder="MC1"
                          className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1.5 text-app-text font-inter text-sm focus:outline-none focus:border-primary/50 min-w-0"
                        />
                        <span className="font-inter text-app-muted/50 text-[10px] flex-shrink-0">vs</span>
                        <input
                          value={eb.mc2}
                          onChange={e => setEditBattles(prev => prev.map((b, i) => i === idx ? { ...b, mc2: e.target.value } : b))}
                          placeholder="MC2"
                          className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1.5 text-app-text font-inter text-sm focus:outline-none focus:border-primary/50 min-w-0"
                        />
                        <select
                          value={eb.format}
                          onChange={e => setEditBattles(prev => prev.map((b, i) => i === idx ? { ...b, format: e.target.value } : b))}
                          className="bg-white/5 border border-white/10 rounded px-1.5 py-1.5 text-app-text font-inter text-xs focus:outline-none focus:border-primary/50 flex-shrink-0"
                        >
                          <option value="1v1">1v1</option>
                          <option value="2v2">2v2</option>
                        </select>
                        <button
                          onClick={() => deleteBattle(eb.id, idx, eb.hasScores)}
                          className="text-red-400/60 hover:text-red-400 text-base px-1.5 py-1 flex-shrink-0 active:scale-95 transition-all leading-none"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                  <button
                    onClick={addBattle}
                    className="w-full card border-secondary/20 rounded-lg py-2 font-bebas text-secondary tracking-[1px] text-sm active:scale-95 transition-transform"
                  >
                    + Battle hinzufügen
                  </button>
                </>
              )}
            </div>

            {editError && (
              <p className="font-inter text-red-400 text-xs">{editError}</p>
            )}

            <div className="flex gap-2 mt-1">
              <button onClick={closeModal}
                className="flex-1 card rounded-lg py-3 font-bebas text-app-muted tracking-[1px] text-sm active:scale-95 transition-transform">
                Abbrechen
              </button>
              <button onClick={saveEdit} disabled={saving || !editForm.name.trim()}
                className="flex-1 bg-primary rounded-lg py-3 font-bebas text-white tracking-[1px] text-sm active:scale-95 transition-transform disabled:opacity-50">
                {saving ? 'Speichert…' : 'Speichern'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Tab: Rooms ────────────────────────────────────────────────────────────────

function RoomsTab() {
  const [rooms, setRooms] = useState<RoomRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const [{ data: roomsData, error: roomsErr }, { data: members }, { data: roomEvents }] = await Promise.all([
      supabase.from('rooms').select('id, name, created_at').order('created_at', { ascending: false }),
      supabase.from('room_members').select('room_id'),
      supabase.from('room_events').select('room_id'),
    ])
    if (roomsErr) { setError('Fehler beim Laden.'); setLoading(false); return }

    const memberCounts = (members ?? []).reduce((acc: Record<string, number>, m: { room_id: string }) => {
      acc[m.room_id] = (acc[m.room_id] ?? 0) + 1
      return acc
    }, {})
    const eventCounts = (roomEvents ?? []).reduce((acc: Record<string, number>, re: { room_id: string }) => {
      acc[re.room_id] = (acc[re.room_id] ?? 0) + 1
      return acc
    }, {})

    setRooms(
      (roomsData ?? []).map((r: Omit<RoomRow, 'memberCount' | 'eventCount'>) => ({
        ...r,
        memberCount: memberCounts[r.id] ?? 0,
        eventCount: eventCounts[r.id] ?? 0,
      }))
    )
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleDelete = async (roomId: string, roomName: string) => {
    if (!confirm(`Gruppe „${roomName}" wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.`)) return
    setDeleting(roomId)
    setActionError(null)
    const { error: err } = await supabase.from('rooms').delete().eq('id', roomId)
    if (err) {
      setActionError('Löschen fehlgeschlagen. Bitte DELETE-Policy auf rooms prüfen.')
    } else {
      setRooms(prev => prev.filter(r => r.id !== roomId))
    }
    setDeleting(null)
  }

  return (
    <div className="flex flex-col gap-4">
      {loading && <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>}
      {error && <p className="font-inter text-red-400 text-sm">{error}</p>}
      {actionError && <p className="font-inter text-red-400 text-sm">{actionError}</p>}

      {rooms.map(room => (
        <div key={room.id} className="card rounded-lg p-4 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <h2 className="font-bebas text-lg text-app-text truncate tracking-wider leading-tight">{room.name}</h2>
            <p className="font-inter text-app-muted text-xs mt-0.5">
              {room.memberCount} Mitglieder · {room.eventCount} Events
            </p>
          </div>
          <button
            onClick={() => handleDelete(room.id, room.name)}
            disabled={deleting === room.id}
            className="font-inter text-red-400 text-xs px-3 py-1.5 rounded border border-red-800/40 active:scale-95 transition-transform disabled:opacity-50"
          >
            {deleting === room.id ? '…' : 'Löschen'}
          </button>
        </div>
      ))}

      {!loading && rooms.length === 0 && (
        <p className="font-inter text-app-muted text-sm text-center py-8">Noch keine Gruppen vorhanden.</p>
      )}
    </div>
  )
}
