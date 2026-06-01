# Battle Rap Scorer — Projektplan für Claude Code

## Kontext
Ben Wahlen und sein Freund Daniel ("Löwe") besuchen DLTLLY Battle-Rap-Events
und wollen diese gemeinsam bewerten — asynchron, von verschiedenen Geräten und
Standorten aus (Ben: Haag/iPhone, Löwe: oft unterwegs, z.B. Nicaragua/Laptop).

## Was gebaut wird
Eine Progressive Web App (PWA) — installierbar auf iPhone und Laptop wie eine
native App, keine App Store nötig. React + Vite + Supabase (Datenbank) + Vercel
(Hosting).

---

## Technischer Stack
- **Frontend:** React + Vite + TypeScript
- **Styling:** Tailwind CSS
- **Datenbank:** Supabase (Postgres, bereits angelegt)
- **Hosting:** Vercel (via GitHub, noch einzurichten)
- **PWA:** vite-plugin-pwa (Manifest + Service Worker)

---

## Supabase Credentials (bereits angelegt)
```
VITE_SUPABASE_URL=https://hoqtwkbzgwvjhsspqezl.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_2xlobtjy0So3ll0HBHRhhw_zl67SDjw
```
Diese in `.env.local` speichern (nicht in Git committen).

---

## Datenbankschema (in Supabase anlegen)

### Tabelle: `events`
```sql
create table events (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  date text,
  location text,
  created_at timestamptz default now()
);
```

### Tabelle: `battles`
```sql
create table battles (
  id uuid default gen_random_uuid() primary key,
  event_id uuid references events(id) on delete cascade,
  mc1 text not null,
  mc2 text not null,
  format text default '1v1',
  position integer default 0,
  created_at timestamptz default now()
);
```

### Tabelle: `scores`
```sql
create table scores (
  id uuid default gen_random_uuid() primary key,
  battle_id uuid references battles(id) on delete cascade,
  user_name text not null,
  round_number integer not null,
  bars_mc1 integer default 5,
  bars_mc2 integer default 5,
  personalisierung_mc1 integer default 5,
  personalisierung_mc2 integer default 5,
  delivery_mc1 integer default 5,
  delivery_mc2 integer default 5,
  struktur_mc1 integer default 5,
  struktur_mc2 integer default 5,
  crowd_mc1 integer default 5,
  crowd_mc2 integer default 5,
  round_winner text,
  submitted_at timestamptz default now(),
  unique(battle_id, user_name, round_number)
);
```

### Tabelle: `battle_verdicts`
```sql
create table battle_verdicts (
  id uuid default gen_random_uuid() primary key,
  battle_id uuid references battles(id) on delete cascade,
  user_name text not null,
  overall_winner text not null,
  submitted_at timestamptz default now(),
  unique(battle_id, user_name)
);
```

### RLS Policies (Row Level Security — alle Tabellen öffentlich les- und schreibbar für angemeldete Anon-User)
```sql
-- Für alle 4 Tabellen jeweils:
alter table events enable row level security;
alter table battles enable row level security;
alter table scores enable row level security;
alter table battle_verdicts enable row level security;

create policy "Public read" on events for select using (true);
create policy "Public insert" on events for insert with check (true);

create policy "Public read" on battles for select using (true);
create policy "Public insert" on battles for insert with check (true);

create policy "Public read" on scores for select using (true);
create policy "Public insert" on scores for insert with check (true);
create policy "Public upsert" on scores for update using (true);

create policy "Public read" on battle_verdicts for select using (true);
create policy "Public insert" on battle_verdicts for insert with check (true);
create policy "Public upsert" on battle_verdicts for update using (true);
```

---

## App-Struktur (Screens & Logik)

### Screen 1: User-Auswahl
- Zwei große Karten: "Ben" und "Löwe"
- Kein Passwort, kein Login — einfach Namen antippen
- User wird in localStorage gespeichert (bleibt beim nächsten Öffnen)
- Wenn User bereits gespeichert → direkt zu Screen 2

### Screen 2: Event-Liste
- Liste aller Events aus Supabase, neueste zuerst
- Pro Event: Name, Datum, Anzahl Battles
- Badge-Status pro Event für aktuellen User:
  - "Noch nicht bewertet" (orange) — kein Score von diesem User
  - "Wartet auf Löwe/Ben" (blau) — dieser User fertig, anderer nicht
  - "🔓 Reveal verfügbar" (lila) — beide fertig
- Button "Neues Event" oben rechts
- Tap auf Event → öffnet Score-Screen oder Reveal je nach Status

### Screen 3: Neues Event erstellen
- Felder: Event-Name (required), Datum, Ort (optional)
- Battles hinzufügen: MC1 vs MC2, Format (1v1 / 2v2)
- Beliebig viele Battles per "+" Button
- Speichern → Event + Battles in Supabase → zurück zur Liste

### Screen 4: Score-Screen (Bewerten)
Für jedes Battle:
- Header: "MC1 vs MC2 (1v1)"
- 3 Runden, pro Runde:
  - 5 Kategorien: Bars/Text, Personalisierung, Delivery, Struktur, Crowd Reaction
  - Pro Kategorie: Score für MC1 (1-10) und Score für MC2 (1-10)
  - Stepper: − / Zahl / + Buttons (kein freies Tippen)
  - Rundensieger wählen: [MC1] [Draw] [MC2] Toggle-Buttons
- Gesamtsieger Battle: [MC1] [MC2]
- "Bewertung einreichen" Button am Ende
  - Validierung: alle Rundensieger + Gesamtsieger müssen gewählt sein
  - Nach Submit: Wartescreen "Warte auf [anderer User]..."
  - Wenn anderer User bereits fertig: direkt zu Reveal

### Screen 5: Wartescreen
- Zeigt an wer noch bewertet
- Polling alle 10 Sekunden auf Supabase (prüft ob anderer User submitted hat)
- Wenn beide fertig → automatisch zu Reveal

### Screen 6: Reveal
Erst sichtbar wenn BEIDE User alle Battles submitted haben.

Pro Battle:
- Header mit Battle-Name
- Pro Runde:
  - Beide Scores nebeneinander (Ben links, Löwe rechts)
  - Pro Kategorie: Ben's Score vs Löwe's Score
  - Rundensieger beider User + Einig/Unterschiedlich Indikator
- Gesamtsieger: Ben's Pick vs Löwe's Pick + Einig/Unterschiedlich
- Highlight wenn beide gleicher Meinung ("Einig! ✓") vs. abweichend ("Diskussion!")

---

## Bewertungskategorien (Erklärung für Tooltips)
1. **Bars / Text** — Qualität der Punchlines, Wordplay, Reimkomplexität
2. **Personalisierung** — Hat der MC seinen Gegner wirklich "gegheckt"? Spezifische Angriffe vs. generische Bars
3. **Delivery** — Timing, Stimmführung, Betonung, Pausen
4. **Struktur** — Roter Faden, starker Opener/Closer, Aufbau der Runde
5. **Crowd Reaction** — Objektiv messbare Reaktion im Kreis

---

## PWA-Konfiguration
- `manifest.json`: Name "Battle Rap Scorer", Icons in zwei Größen (192x192, 512x512), theme_color schwarz, background_color schwarz, display: standalone
- Icons: Einfaches Mic-Icon in schwarz/weiß, selbst generieren
- Service Worker: Offline-Caching der App-Shell (nicht der Daten)
- iOS: `apple-mobile-web-app-capable` Meta-Tags damit Installation auf iPhone Homescreen funktioniert

---

## Phasen-Plan

### Phase 1: Projekt-Setup (Terminal)
```bash
cd ~/AI-Projects
npm create vite@latest battle-rap-scorer -- --template react-ts
cd battle-rap-scorer
npm install
npm install @supabase/supabase-js
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
npm install -D vite-plugin-pwa
```

### Phase 2: Supabase-Setup
- `.env.local` mit Credentials anlegen
- `src/lib/supabase.ts` Client anlegen
- Alle 4 Tabellen + RLS Policies in Supabase SQL Editor ausführen
- Verbindung testen

### Phase 3: Core Components bauen
Reihenfolge: UserSelect → EventList → NewEvent → ScoreScreen → WaitScreen → Reveal

### Phase 4: PWA + Styling
- Manifest + Service Worker konfigurieren
- Design: Dunkel, minimalistisch, mobile-first
- Schwarz/weiß mit einem Akzentfarbe (z.B. einem kräftigen Gelb oder Rot für DLTLLY-Feeling)

### Phase 5: GitHub + Vercel Deployment
```bash
git init
git add .
git commit -m "Initial commit: Battle Rap Scorer PWA"
# GitHub Repo anlegen auf github.com → dann:
git remote add origin https://github.com/benwahlen/battle-rap-scorer.git
git push -u origin main
```
Dann auf vercel.com: "Import Git Repository" → GitHub verbinden → Repo wählen → Environment Variables eintragen (VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY) → Deploy

---

## Regeln für Claude Code
- Mobile-first: alles muss auf iPhone 14 (390px) perfekt aussehen
- Kein Login, kein Passwort — User-Name wird in localStorage gespeichert
- Blind Scoring ist heilig: NIEMALS Scores des anderen Users anzeigen bevor beide submitted haben
- Polling-Intervall für Wartescreen: 10 Sekunden (nicht kürzer — Supabase Free Tier hat Rate Limits)
- Deutsche UI-Texte durchgehend
- Alle Scores als Integer 1-10 speichern, keine Dezimalstellen
- Fehlerbehandlung: Wenn Supabase nicht erreichbar → freundliche Fehlermeldung auf Deutsch
- TypeScript strict mode

---

## Definition of Done
- [ ] App läuft auf Vercel unter einer öffentlichen URL
- [ ] Ben öffnet App auf iPhone, wählt "Ben", sieht Events
- [ ] Löwe öffnet dieselbe URL auf Laptop in Nicaragua, wählt "Löwe"
- [ ] Beide können unabhängig bewerten
- [ ] Reveal erscheint erst wenn beide submitted haben
- [ ] App ist als PWA auf iPhone installierbar (Homescreen-Icon)
- [ ] Scores werden in Supabase persistiert und überleben App-Neustarts
