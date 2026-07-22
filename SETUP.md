# EVV 2000 — Setup nach dem Umbau (Admin-Panel V2)

Die Website wurde um ein vollständiges Admin-System erweitert:
Rollen & Berechtigungen, Mannschafts-Verwaltung, Kalender (öffentlich + Admin),
Beachplatz-Sperren für Training, Bild-Uploads und ein Aktivitätslog.
Außerdem wurde die komplette Farbwelt auf **Royal `#1e3a8a` / Deep Navy `#0b1f3a` /
Weiß** mit **Electric Blue `#3b82f6` / Cyan `#22d3ee`** als Akzent umgestellt.

**Damit alles funktioniert, sind einmalig 2 Schritte in Supabase nötig (ca. 3 Minuten).**

---

## Schritt 1 — Datenbank-Migration ausführen

1. Öffne dein Supabase-Projekt (dasselbe, das `erka-beach.vercel.app` nutzt) → **SQL Editor**.
2. Öffne die Datei **`supabase-migration-v2.sql`** aus diesem Projekt, kopiere den
   gesamten Inhalt in den SQL Editor und führe ihn aus (**Run**).

Die Migration ist **idempotent** — sie kann gefahrlos mehrfach ausgeführt werden und
löscht keine Daten. Sie legt an bzw. erweitert:

| Was | Zweck |
|---|---|
| `teams` | Mannschaften (inkl. Kader, Trainingszeiten, Bild) — mit allen 13 aktuellen Teams vorbefüllt |
| `calendar_events` | Spiele / Events / Termine für den Kalender |
| `beach_blocks` | Gesperrte Beach-Slots (Training) — öffentlich ausgegraut |
| `admin_audit_log` | Wer hat was erstellt / bearbeitet / gelöscht |
| `admins` + Rollen | `role` (superadmin/admin/trainer/…) + `permissions` pro Konto |
| `news.image_url` | Bilder für Aktuelles |
| Storage-Bucket `images` | Bild-Uploads (öffentlich lesbar, nur Admins schreiben) |
| Views `public_teams`, `public_calendar`, `public_news` (neu mit Bild) | Öffentliche Lese-Sichten |
| RLS-Policies | Schreiben nur mit passender Berechtigung |

> Falls beim Storage-Teil eine Meldung erscheint (fehlende Rechte auf `storage.objects`),
> lege die Policies alternativ im Dashboard an: **Storage → images → Policies**:
> öffentliches SELECT, INSERT/UPDATE/DELETE nur für authentifizierte Admins.

## Schritt 1b — Migration V3 ausführen (Anfragen & Anträge)

Danach genauso **`supabase-migration-v3.sql`** im SQL Editor ausführen. Sie legt an:

| Was | Zweck |
|---|---|
| `contact_messages` | Kontaktformular-Anfragen von der Website |
| `membership_applications` | Mitgliedsanträge (inkl. SEPA-Daten) |
| Permission `anfragen` | Steuert den Zugriff auf den neuen Admin-Bereich „Anfragen" |

Beide Formulare speichern dann direkt in die Datenbank und erscheinen im
Admin-Panel unter **Anfragen** (mit Status neu → gelesen → erledigt, Antwort-Button
und Detail-Ansicht; die IBAN wird maskiert angezeigt). Ohne Datenbankverbindung
fallen die Formulare automatisch auf das bisherige E-Mail-Verhalten zurück.

## Schritt 2 — Ersten Superadmin anlegen

Falls du schon einen Admin-Account hattest (Tabelle `admins`), wurde er automatisch
zum **Superadmin** hochgestuft — dann bist du fertig.

Sonst:

1. Supabase → **Authentication → Users → Add user** (E-Mail + Passwort, „Auto Confirm" anhaken).
2. SQL Editor (E-Mail anpassen):

```sql
INSERT INTO admins (user_id, email, name, role, permissions)
SELECT id, email, 'Vereins-Admin', 'superadmin', '[]'::jsonb
FROM auth.users WHERE email = 'admin@evv2000.de'
ON CONFLICT (email) DO UPDATE SET role = 'superadmin', is_active = true;
```

3. Anmelden unter **`/admin/login.html`** — fertig.

Alle weiteren Konten legst du danach bequem im Admin-Panel unter **Verwaltung** an.

---

## Was ist neu im Admin-Panel?

| Seite | Funktion |
|---|---|
| **Dashboard** | Statistiken, nächste Termine, letzte News & Aktivitäten (je nach Berechtigung) |
| **Aktuelles** | News mit **Bild-Upload**, Entwurf/Öffentlich |
| **Turniere & Events** | Turniere mit **Bild-Upload**, Anmeldung, WVV, Startgebühr |
| **Mannschaften** *(neu)* | Teams inkl. Liga, Trainer, Trainingszeiten, Kader, **Teambild** — erscheint sofort auf der Website und im Kalender-Filter |
| **Kalender** *(neu)* | Umschaltbar: **Termine** (Monatsansicht, Spiele/Events direkt eintragen) ↔ **Beachplätze** (Tagesbelegung, Slots für Training sperren — mit Wochen-Wiederholung) |
| **Beach-Buchungen** | Buchungsliste (stornieren, als bezahlt markieren) + Übersicht aller Sperren |
| **Anmeldungen** | Turnier-Anmeldungen mit Status & CSV-Export |
| **Verwaltung** *(neu, nur Superadmin)* | Admin-Konten anlegen mit Rollen: Superadmin, Admin, **Trainer** (nur Kalender + Beach), Redakteur (nur Aktuelles), Event-Manager — oder individuelle Häkchen |
| **Aktivitätslog** *(neu)* | Wer hat wann was erstellt / bearbeitet / gelöscht (filterbar) |

### Rollen-Beispiele
- **Trainer**: kann Termine eintragen und Beachplätze kostenlos für Training sperren — mehr nicht.
- **Redakteur**: kann nur „Aktuelles" pflegen.
- **Event-Manager**: Turniere/Events + Anmeldungen + Kalender.
- Berechtigungen werden **auch in der Datenbank** erzwungen (Row Level Security), nicht nur im Interface.

## Was ist neu auf der Website?

- **`/kalender`** — öffentlicher Kalender mit Monatsansicht + Liste, filterbar nach
  Terminart (Spiele/Turniere/Events) und **Mannschaft** (Dropdown füllt sich automatisch
  aus der Teams-Tabelle). Turniere aus „Turniere & Events" erscheinen automatisch.
- **Mannschaften & Team-Detailseiten** laden jetzt aus der Datenbank (Admin-Panel-Änderungen
  sind sofort sichtbar). Solange die Migration nicht ausgeführt ist, zeigen sie die bisherigen
  statischen Inhalte als Fallback.
- Team-Detailseiten zeigen die **nächsten Termine** der Mannschaft.
- **Beach-Kalender**: von Admins/Trainern gesperrte Slots erscheinen **ausgegraut als
  „Training"** und sind nicht buchbar (aktualisiert sich live).
- News- und Event-Karten zeigen hochgeladene **Bilder**.
- Neue Farbwelt auf allen Seiten.

---

## Technische Hinweise

- Die Supabase-Zugangsdaten kommen weiterhin zur Laufzeit von
  `https://erka-beach.vercel.app/api/config` — es sind **keine** Vercel-Env-Variablen
  in diesem Projekt nötig.
- Admin-Konten werden im Browser über einen zweiten, sitzungslosen Supabase-Client
  per `signUp` angelegt (kein Service-Key im Frontend). Ist in Supabase
  **„Confirm email"** aktiv, muss das neue Konto zuerst den Bestätigungslink klicken.
  (Ausschalten unter Authentication → Providers → Email, falls unerwünscht.)
- Passwort-Reset: Button in der Verwaltung schickt eine Reset-Mail; der Link führt zur
  Login-Seite, die das Setzen des neuen Passworts direkt unterstützt.
- Gelöschte Admin-Konten verlieren sofort jeden Zugriff; das Auth-Konto selbst kann nur
  im Supabase-Dashboard (Authentication → Users) endgültig gelöscht werden.
- Das Aktivitätslog ist unlöschbar (keine Delete-Policy) — Einträge bleiben dauerhaft.

## Lokal testen

```bash
npx serve -l 3456
```

Dann `http://localhost:3456` öffnen. (Direktes Öffnen der HTML-Dateien per Doppelklick
läuft im Demo-Modus ohne Datenbank.)
