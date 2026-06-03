# Battle Rap Scorer — Phase 2: Auth System

## Ziel dieser Phase
Supabase Auth in die App einbauen. User können sich registrieren und einloggen.
Der bisherige "Wer bist du?"-Screen (Ben / Löwe als hardcoded Buttons) wird ersetzt
durch echte Registrierung und Login mit Email + Passwort + Anzeigename.

Kein Room-System in dieser Phase. Events bleiben global sichtbar für alle eingeloggten User.
Der user_name in scores/battle_verdicts wird aus dem Auth-Profil gezogen statt hardcoded zu sein.

---

## Voraussetzungen (bereits erledigt vor diesem Plan)
- Supabase Auth ist aktiviert (Email Provider an)
- Tabelle `profiles` existiert (siehe SQL unten)
- RLS Policies sind angepasst (siehe SQL unten)

## SQL — VOR dem Coding in Supabase SQL Editor ausführen

```sql
-- Profiles Tabelle (linked to auth.users)
create table profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  display_name text not null,
  created_at timestamptz default now()
);

alter table profiles enable row level security;
create policy "Users can read all profiles" on profiles for select using (true);
create policy "Users can insert own profile" on profiles for insert with check (auth.uid() = id);
create policy "Users can update own profile" on profiles for update using (auth.uid() = id);

-- RLS auf bestehenden Tabellen: nur eingeloggte User dürfen lesen/schreiben
-- Events
drop policy if exists "Public read" on events;
drop policy if exists "Public insert" on events;
create policy "Auth read" on events for select using (auth.role() = 'authenticated');
create policy "Auth insert" on events for insert with check (auth.role() = 'authenticated');

-- Battles
drop policy if exists "Public read" on battles;
drop policy if exists "Public insert" on battles;
create policy "Auth read" on battles for select using (auth.role() = 'authenticated');
create policy "Auth insert" on battles for insert with check (auth.role() = 'authenticated');

-- Scores
drop policy if exists "Public read" on scores;
drop policy if exists "Public insert" on scores;
drop policy if exists "Public upsert" on scores;
drop policy if exists "Public update" on scores;
create policy "Auth read" on scores for select using (auth.role() = 'authenticated');
create policy "Auth insert" on scores for insert with check (auth.role() = 'authenticated');
create policy "Auth update" on scores for update using (auth.role() = 'authenticated');

-- Battle Verdicts
drop policy if exists "Public read" on battle_verdicts;
drop policy if exists "Public insert" on battle_verdicts;
drop policy if exists "Public upsert" on battle_verdicts;
drop policy if exists "Public update" on battle_verdicts;
create policy "Auth read" on battle_verdicts for select using (auth.role() = 'authenticated');
create policy "Auth insert" on battle_verdicts for insert with check (auth.role() = 'authenticated');
create policy "Auth update" on battle_verdicts for update using (auth.role() = 'authenticated');

-- Anon Grants entfernen (war vorher für Public Access nötig)
revoke all on events from anon;
revoke all on battles from anon;
revoke all on scores from anon;
revoke all on battle_verdicts from anon;
grant usage on schema public to anon;
grant select, insert, update on all tables in schema public to authenticated;
```

---

## Was zu bauen ist

### 1. AuthContext (src/context/AuthContext.tsx)
React Context der global den eingeloggten User bereitstellt.

```typescript
// Exports:
// - useAuth() hook → { user, profile, loading, signIn, signUp, signOut }
// - AuthProvider wrapper component

// user = supabase User object (null wenn nicht eingeloggt)
// profile = { id, display_name } aus profiles Tabelle
// loading = boolean (während Session geprüft wird)
```

Implementierung:
- `supabase.auth.getSession()` beim Start
- `supabase.auth.onAuthStateChange()` listener
- Nach Login: profile aus profiles Tabelle laden
- Nach Registrierung: profile automatisch anlegen

### 2. AuthScreen (src/screens/AuthScreen.tsx)
Ersetzt den bisherigen UserSelect Screen komplett.

**Login Tab:**
- Email Input
- Passwort Input
- "Einloggen" Button
- Link zu "Registrieren"

**Registrieren Tab:**
- Anzeigename Input (wird als display_name gespeichert)
- Email Input
- Passwort Input (min 6 Zeichen)
- "Registrieren" Button → sendet Bestätigungsmail
- Nach Registrierung: Hinweis "Bitte bestätige deine Email"

**Design:** Gleiches Design wie der Rest der App (Bebas Neue Headlines,
dunkler Hintergrund, Lila/Cyan Akzente). Kein gesondertes Styling nötig.

**Error Handling:**
- "Email bereits vergeben" → auf Deutsch anzeigen
- "Falsches Passwort" → auf Deutsch
- "Email nicht bestätigt" → auf Deutsch

### 3. App.tsx anpassen
- AuthProvider um alles wrappen
- Wenn `loading`: Ladescreen zeigen (kurz)
- Wenn `!user`: AuthScreen zeigen
- Wenn `user`: App wie bisher (EventList etc.)
- UserSelect Screen komplett entfernen
- `localStorage.getItem('user')` Logik komplett entfernen

### 4. user_name überall durch Auth-User ersetzen
Überall wo bisher `user` (als 'ben' | 'löwe' UserName) verwendet wird,
stattdessen `profile.display_name` nutzen.

Betroffene Dateien:
- ScoreScreen.tsx → user_name beim Speichern = profile.display_name
- WaitScreen.tsx → anderer User = alle außer profile.display_name
- Reveal.tsx → Ben/Löwe Labels durch tatsächliche display_names ersetzen
- BattleOverview.tsx → user_name = profile.display_name
- EventList.tsx → Status-Logik: "mein Score" = score mit user_name = profile.display_name

### 5. Logout Button
In der EventList Header: kleines User-Icon oben rechts.
Tap → zeigt display_name + "Ausloggen" Button.
Nach Logout → zurück zu AuthScreen.

### 6. types.ts anpassen
- `UserName = 'ben' | 'löwe'` Type entfernen
- Stattdessen `string` für user_name überall

---

## Wichtige Hinweise

**Bestehende Daten:** Die alten scores/battle_verdicts haben user_name = 'ben' oder 'löwe'.
Diese bleiben in der DB — sie werden nur nicht mehr dem Auth-User zugeordnet.
Neue Scores werden mit dem tatsächlichen display_name gespeichert.
Ben soll sich mit display_name "Ben" registrieren, Löwe mit "Löwe" — dann matchen
neue Scores automatisch.

**Blind Scoring Logik:** Bisher war "anderer User" = der jeweils andere hardcoded Name.
Neu: "anderer User" = jeder User dessen display_name != mein display_name UND der
für dieses Battle bereits einen Score hat.
Der Reveal zeigt alle Scores für dieses Battle — also auch wenn mal 3+ User bewertet haben.

**TypeScript:** Strict mode bleibt. Nach jeder Datei TypeScript-Check.
Kein `any` verwenden außer für Supabase Auth types wo nötig.

**Reihenfolge:**
1. AuthContext bauen + testen (supabase.auth calls funktionieren)
2. AuthScreen bauen
3. App.tsx anpassen
4. user_name Migration in allen Screens
5. TypeScript-Check + Build
6. git push

---

## Definition of Done
- [ ] Login mit Email/Passwort funktioniert
- [ ] Registrierung mit Bestätigungsmail funktioniert
- [ ] Nach Login sieht man die EventList
- [ ] Scores werden mit display_name gespeichert
- [ ] Logout funktioniert
- [ ] TypeScript 0 Fehler
- [ ] Build erfolgreich
- [ ] Gepusht und auf Vercel deployed
