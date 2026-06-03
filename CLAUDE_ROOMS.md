# Battle Rap Scorer — Phase 3: Rooms / Groups

## Ziel dieser Phase
User können Gruppen erstellen, andere per Link einladen, und Events gehören
zu einer Gruppe. Das Dashboard zeigt deine Gruppen und offene Bewertungen.
Basis für spätere Monetarisierung und Community-Features.

---

## SQL — VOR dem Coding in Supabase SQL Editor ausführen

```sql
-- display_name unique machen
alter table profiles add constraint profiles_display_name_unique unique (display_name);

-- Rooms Tabelle
create table rooms (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  invite_code text unique default substr(md5(random()::text), 1, 8),
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

-- Room Members
create table room_members (
  id uuid default gen_random_uuid() primary key,
  room_id uuid references rooms(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  joined_at timestamptz default now(),
  unique(room_id, user_id)
);

-- Events: room_id Spalte hinzufügen
alter table events add column room_id uuid references rooms(id) on delete cascade;

-- RLS für rooms
alter table rooms enable row level security;
create policy "Members can read room" on rooms
  for select using (
    exists (
      select 1 from room_members
      where room_members.room_id = rooms.id
      and room_members.user_id = auth.uid()
    )
  );
create policy "Auth users can create rooms" on rooms
  for insert with check (auth.role() = 'authenticated');

-- RLS für room_members
alter table room_members enable row level security;
create policy "Members can read members" on room_members
  for select using (
    exists (
      select 1 from room_members rm2
      where rm2.room_id = room_members.room_id
      and rm2.user_id = auth.uid()
    )
  );
create policy "Auth users can join rooms" on room_members
  for insert with check (auth.role() = 'authenticated');

-- Events RLS: nur Mitglieder des Rooms sehen Events
drop policy if exists "Auth read" on events;
drop policy if exists "Auth insert" on events;
create policy "Room members can read events" on events
  for select using (
    room_id is null or
    exists (
      select 1 from room_members
      where room_members.room_id = events.room_id
      and room_members.user_id = auth.uid()
    )
  );
create policy "Room members can insert events" on events
  for insert with check (
    exists (
      select 1 from room_members
      where room_members.room_id = events.room_id
      and room_members.user_id = auth.uid()
    )
  );

-- Bestehende Events ohne room_id: migration wird später manuell gemacht
```

---

## Screens & Navigation (neue Struktur)

### Bisherige Struktur (Phase 2):
Login → EventList → NewEvent / ScoreScreen / Reveal

### Neue Struktur (Phase 3):
Login → **Dashboard** → RoomDetail (EventList) → NewEvent / ScoreScreen / Reveal

---

## Was zu bauen ist

### 1. Dashboard Screen (src/screens/Dashboard.tsx)
Hauptscreen nach dem Login. Ersetzt EventList als Einstiegspunkt.

**Inhalt:**
- Header: "Hey [display_name] 👋" + Logout-Icon rechts
- Abschnitt "Meine Gruppen": Liste aller Rooms in denen der User ist
  - Pro Room: Room-Name, Anzahl Mitglieder, Anzahl offener Bewertungen
  - Tap auf Room → RoomDetail Screen
- Button "+ Neue Gruppe erstellen"
- Wenn keine Gruppen: Onboarding-State "Erstelle deine erste Gruppe oder tritt einer bei"
- Abschnitt "Offene Bewertungen" (optional, nice to have): alle Battles across alle Rooms die noch nicht bewertet wurden

**Offene Bewertungen Badge:** Pro Room-Card ein Badge wenn es offene Bewertungen gibt.

### 2. RoomDetail Screen (src/screens/RoomDetail.tsx)
Zeigt Events innerhalb eines Rooms. Entspricht der bisherigen EventList.

**Inhalt:**
- Header: Room-Name + zurück zum Dashboard
- Einladungslink Button: "Link kopieren" → kopiert `https://battle-rap-scorer.vercel.app/join/[invite_code]` in Clipboard
- Mitglieder-Anzeige: kleine Avatar-Kreise mit Initialen aller Mitglieder
- Event-Liste (wie bisherige EventList, nur für diesen Room)
- "+ Neues Event" Button

### 3. CreateRoom Screen (src/screens/CreateRoom.tsx)
Einfacher Screen zum Erstellen einer neuen Gruppe.

**Felder:**
- Gruppenname (required, min 3 Zeichen)
- "Gruppe erstellen" Button

**Nach Erstellen:**
- User wird automatisch als erstes Mitglied hinzugefügt
- Weiterleitung zu RoomDetail
- Toast: "Gruppe erstellt! Teile den Einladungslink mit deinen Freunden."

### 4. Join Room Logic (src/screens/JoinRoom.tsx)
Wird aufgerufen wenn jemand einen Einladungslink öffnet.
URL: `/join/[invite_code]`

**Flow:**
- Wenn nicht eingeloggt: erst Login/Register, dann automatisch beitreten
- Wenn eingeloggt: direkt beitreten
- Wenn bereits Mitglied: direkt zu RoomDetail weiterleiten
- Nach Beitreten: Weiterleitung zu RoomDetail

### 5. URL Routing einrichten
Vite/React Router installieren und konfigurieren:

```bash
npm install react-router-dom
```

Routen:
- `/` → Dashboard (wenn eingeloggt) oder AuthScreen
- `/room/[roomId]` → RoomDetail
- `/join/[inviteCode]` → JoinRoom
- `/room/[roomId]/new-event` → NewEvent
- `/room/[roomId]/battle/[battleId]` → ScoreScreen

### 6. NewEvent anpassen
- Bekommt `roomId` als Parameter
- Event wird mit `room_id` gespeichert

### 7. Profile Screen (src/screens/ProfileScreen.tsx)
Einfacher Screen erreichbar vom Dashboard-Header.

**Inhalt:**
- Avatar-Kreis mit Initialen (groß)
- display_name (editierbar)
- Email (read-only)
- Mitglied seit [Datum]
- Liste der Gruppen
- "Ausloggen" Button

---

## Datenmigration bestehender Events

Nach dem Coding: SQL ausführen um bestehende Events einem Room zuzuordnen.

```sql
-- Erstelle einen Room für Ben & Löwe
-- (manuell ausführen nachdem beide sich registriert haben)

-- Schritt 1: Room erstellen
insert into rooms (name, created_by)
select 'Ben & Löwe', id from auth.users
where email = 'wahlen.ben@googlemail.com'
returning id;

-- Schritt 2: Beide als Mitglieder hinzufügen (IDs aus auth.users)
-- Die UUIDs siehst du in Supabase unter Authentication → Users
insert into room_members (room_id, user_id) values
('[ROOM_ID]', '[BEN_USER_ID]'),
('[ROOM_ID]', '[LOEWE_USER_ID]');

-- Schritt 3: Bestehende Events diesem Room zuordnen
update events set room_id = '[ROOM_ID]' where room_id is null;
```

---

## Technische Hinweise

**React Router:** `BrowserRouter` in main.tsx wrappen. Vercel braucht eine
`vercel.json` Anpassung für SPA-Routing:
```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```
(bereits vorhanden aus Phase 1 — prüfen ob rewrites stimmen)

**Invite Code:** 8-stelliger alphanumerischer Code, wird in Supabase generiert.
Kein separater Service nötig.

**Clipboard API:** `navigator.clipboard.writeText(url)` — funktioniert auf HTTPS.

**display_name unique:** Nach der SQL-Migration wird display_name unique.
Wenn zwei User denselben Namen haben (z.B. zwei "Ben"), muss der zweite
einen anderen Namen wählen. Error auf Deutsch anzeigen.

**Reihenfolge:**
1. SQL ausführen
2. React Router installieren + App.tsx anpassen
3. Dashboard Screen
4. RoomDetail Screen
5. CreateRoom Screen
6. JoinRoom Screen
7. Profile Screen
8. NewEvent anpassen (roomId Parameter)
9. Navigation überall anpassen
10. TypeScript-Check + Build
11. git push
12. Datenmigration SQL manuell ausführen

---

## Definition of Done
- [ ] Dashboard zeigt Gruppen nach Login
- [ ] Neue Gruppe erstellen funktioniert
- [ ] Einladungslink kopieren funktioniert
- [ ] Jemand anderes kann per Link beitreten
- [ ] Events gehören zu einem Room
- [ ] Profil-Screen erreichbar
- [ ] Bestehende Events von Ben & Löwe migriert
- [ ] TypeScript 0 Fehler
- [ ] Build erfolgreich
- [ ] Auf Vercel deployed
