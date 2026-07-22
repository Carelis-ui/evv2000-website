-- =============================================================================
-- EVV 2000 Erkelenz — Supabase Migration V2
-- Rollen & Permissions, Teams, Kalender, Beach-Blocks, Audit-Log, Bild-Storage
--
-- Diese Datei im Supabase SQL Editor ausführen. Sie ist idempotent:
-- Mehrfaches Ausführen erzeugt keine Duplikate und zerstört keine Daten.
-- Sie funktioniert sowohl auf einer frischen Datenbank als auch auf einer,
-- auf der bereits supabase-migration.sql (V1) lief.
-- =============================================================================


-- =============================================================================
-- 1. BASIS-TABELLEN (aus V1, falls noch nicht vorhanden)
-- =============================================================================

CREATE TABLE IF NOT EXISTS news (
    id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    title         TEXT        NOT NULL,
    content       TEXT        NOT NULL,
    tag           TEXT        DEFAULT 'info',
    tag_label     TEXT        DEFAULT 'Neuigkeit',
    published_at  DATE        DEFAULT CURRENT_DATE,
    is_published  BOOLEAN     DEFAULT true,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tournaments (
    id                    UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    name                  TEXT        NOT NULL,
    description           TEXT,
    type                  TEXT        NOT NULL DEFAULT 'indoor',
    date_start            DATE        NOT NULL,
    date_end              DATE,
    time_start            TEXT,
    time_end              TEXT,
    location              TEXT,
    max_teams             INTEGER,
    has_trophy            BOOLEAN     DEFAULT false,
    is_wvv                BOOLEAN     DEFAULT false,
    wvv_link              TEXT,
    entry_fee_cents       INTEGER     DEFAULT 0,
    registration_open     BOOLEAN     DEFAULT false,
    registration_deadline DATE,
    image_url             TEXT,
    is_published          BOOLEAN     DEFAULT true,
    created_at            TIMESTAMPTZ DEFAULT NOW(),
    updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tournament_registrations (
    id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    tournament_id     UUID        NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    team_name         TEXT        NOT NULL,
    contact_name      TEXT        NOT NULL,
    contact_email     TEXT        NOT NULL,
    contact_phone     TEXT,
    player_count      INTEGER     DEFAULT 4,
    players_info      TEXT,
    notes             TEXT,
    pay_status        TEXT        DEFAULT 'pending',
    pay_method        TEXT,
    total_cents       INTEGER     DEFAULT 0,
    stripe_session_id TEXT,
    created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admins (
    id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id    UUID        REFERENCES auth.users(id),
    email      TEXT        UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);


-- =============================================================================
-- 2. NEUE SPALTEN + SCHEMA-ANGLEICHUNG
-- (Falls Tabellen bereits mit abweichenden Spalten existieren — z.B. aus einem
--  früheren Versuch — werden alle benötigten Spalten hier nachgezogen.)
-- =============================================================================

-- ── news: alle benötigten Spalten sicherstellen ──
ALTER TABLE news ADD COLUMN IF NOT EXISTS title        TEXT;
ALTER TABLE news ADD COLUMN IF NOT EXISTS content      TEXT;
ALTER TABLE news ADD COLUMN IF NOT EXISTS tag          TEXT        DEFAULT 'info';
ALTER TABLE news ADD COLUMN IF NOT EXISTS tag_label    TEXT        DEFAULT 'Neuigkeit';
ALTER TABLE news ADD COLUMN IF NOT EXISTS published_at DATE        DEFAULT CURRENT_DATE;
ALTER TABLE news ADD COLUMN IF NOT EXISTS is_published BOOLEAN     DEFAULT true;
ALTER TABLE news ADD COLUMN IF NOT EXISTS created_at   TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE news ADD COLUMN IF NOT EXISTS updated_at   TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE news ADD COLUMN IF NOT EXISTS image_url    TEXT;

-- NOT-NULL-Zwänge fremder Alt-Spalten in news lockern, damit das Admin-Panel
-- Beiträge anlegen kann (betrifft nur Spalten außerhalb unseres Schemas)
DO $$
DECLARE col RECORD;
BEGIN
    FOR col IN
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'news'
          AND is_nullable = 'NO' AND column_default IS NULL
          AND column_name NOT IN ('id', 'title', 'content')
    LOOP
        EXECUTE format('ALTER TABLE news ALTER COLUMN %I DROP NOT NULL', col.column_name);
        RAISE NOTICE 'news.% ist jetzt NULL-erlaubt (Alt-Spalte).', col.column_name;
    END LOOP;
END $$;

-- ── tournaments: alle benötigten Spalten sicherstellen ──
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS description           TEXT;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS type                  TEXT    DEFAULT 'indoor';
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS date_end              DATE;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS time_start            TEXT;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS time_end              TEXT;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS location              TEXT;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS max_teams             INTEGER;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS has_trophy            BOOLEAN DEFAULT false;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS is_wvv                BOOLEAN DEFAULT false;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS wvv_link              TEXT;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS entry_fee_cents       INTEGER DEFAULT 0;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS registration_open     BOOLEAN DEFAULT false;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS registration_deadline DATE;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS image_url             TEXT;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS is_published          BOOLEAN DEFAULT true;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS created_at            TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS updated_at            TIMESTAMPTZ DEFAULT NOW();

-- ── tournament_registrations: alle benötigten Spalten sicherstellen ──
ALTER TABLE tournament_registrations ADD COLUMN IF NOT EXISTS contact_phone     TEXT;
ALTER TABLE tournament_registrations ADD COLUMN IF NOT EXISTS player_count      INTEGER DEFAULT 4;
ALTER TABLE tournament_registrations ADD COLUMN IF NOT EXISTS players_info      TEXT;
ALTER TABLE tournament_registrations ADD COLUMN IF NOT EXISTS notes             TEXT;
ALTER TABLE tournament_registrations ADD COLUMN IF NOT EXISTS pay_status        TEXT    DEFAULT 'pending';
ALTER TABLE tournament_registrations ADD COLUMN IF NOT EXISTS pay_method        TEXT;
ALTER TABLE tournament_registrations ADD COLUMN IF NOT EXISTS total_cents       INTEGER DEFAULT 0;
ALTER TABLE tournament_registrations ADD COLUMN IF NOT EXISTS stripe_session_id TEXT;
ALTER TABLE tournament_registrations ADD COLUMN IF NOT EXISTS created_at        TIMESTAMPTZ DEFAULT NOW();

-- ── admins: Basis-Spalten sicherstellen ──
ALTER TABLE admins ADD COLUMN IF NOT EXISTS user_id    UUID;
ALTER TABLE admins ADD COLUMN IF NOT EXISTS email      TEXT;
ALTER TABLE admins ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- Eindeutigkeit der E-Mail sicherstellen (für ON CONFLICT beim Superadmin-Insert)
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public' AND tablename = 'admins'
          AND indexdef ILIKE '%UNIQUE%' AND indexdef ILIKE '%(email)%'
    ) THEN
        CREATE UNIQUE INDEX admins_email_unique ON admins(email);
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Unique-Index auf admins.email nicht anlegbar: %', SQLERRM;
END $$;

-- ── teams: alle benötigten Spalten sicherstellen (Tabelle existiert evtl.
--    bereits aus einem früheren Versuch mit anderem Schema) ──
ALTER TABLE teams ADD COLUMN IF NOT EXISTS slug         TEXT;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS name         TEXT;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS category     TEXT        DEFAULT 'herren';
ALTER TABLE teams ADD COLUMN IF NOT EXISTS league       TEXT;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS trainer      TEXT;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS training     TEXT;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS halle        TEXT        DEFAULT 'Sporthalle Erkelenz';
ALTER TABLE teams ADD COLUMN IF NOT EXISTS badge_text   TEXT;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS badge_type   TEXT;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS image_url    TEXT;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS description  TEXT;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS mv_name      TEXT;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS mv_phone     TEXT;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS mv_email     TEXT;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS players      JSONB       DEFAULT '[]';
ALTER TABLE teams ADD COLUMN IF NOT EXISTS sort_order   INTEGER     DEFAULT 0;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS is_published BOOLEAN     DEFAULT true;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS created_at   TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE teams ADD COLUMN IF NOT EXISTS updated_at   TIMESTAMPTZ DEFAULT NOW();

-- NOT-NULL-Zwänge fremder Alt-Spalten in teams lockern
DO $$
DECLARE col RECORD;
BEGIN
    FOR col IN
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'teams'
          AND is_nullable = 'NO' AND column_default IS NULL
          AND column_name NOT IN ('id', 'name')
    LOOP
        EXECUTE format('ALTER TABLE teams ALTER COLUMN %I DROP NOT NULL', col.column_name);
        RAISE NOTICE 'teams.% ist jetzt NULL-erlaubt (Alt-Spalte).', col.column_name;
    END LOOP;
END $$;

-- Daten aus Alt-Spalten eines früheren Versuchs in unsere Spalten überführen
-- (nur falls die Alt-Spalten existieren)
DO $$
DECLARE pairs TEXT[][] := ARRAY[
    ['training_time',  'training'],
    ['is_visible',     'is_published'],
    ['contact_name',   'mv_name'],
    ['contact_email',  'mv_email'],
    ['contact_phone',  'mv_phone']
];
    p TEXT[];
BEGIN
    FOREACH p SLICE 1 IN ARRAY pairs LOOP
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'teams' AND column_name = p[1]) THEN
            EXECUTE format('UPDATE teams SET %I = COALESCE(%I, %I::%s)',
                p[2], p[2], p[1],
                CASE WHEN p[2] = 'is_published' THEN 'boolean' ELSE 'text' END);
            RAISE NOTICE 'teams.% -> teams.% übernommen.', p[1], p[2];
        END IF;
    END LOOP;
END $$;

-- Kategorien auf unsere Filter-Schlüssel normalisieren (herren/damen/jugend/hobby)
UPDATE teams SET category = CASE
    WHEN name ~* '(frauen|damen|^w)'                       THEN 'damen'
    WHEN lower(category) IN ('damen', 'frauen')            THEN 'damen'
    WHEN lower(category) IN ('jugend', 'junioren', 'u12', 'u14', 'u16', 'u18', 'u20') OR name ~* '^(m|w)?u[0-9]+' THEN 'jugend'
    WHEN lower(category) IN ('hobby', 'freizeit', 'mixed') THEN 'hobby'
    WHEN lower(category) IN ('herren', 'männer', 'maenner', 'senioren') THEN 'herren'
    ELSE lower(coalesce(category, 'herren'))
END
WHERE category IS NULL OR lower(category) NOT IN ('herren', 'damen', 'jugend', 'hobby');

-- Gleiches für news: Alt-Spalten übernehmen (falls vorhanden)
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'news' AND column_name = 'body') THEN
        EXECUTE 'UPDATE news SET content = COALESCE(content, body)';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'news' AND column_name = 'is_visible') THEN
        EXECUTE 'UPDATE news SET is_published = COALESCE(is_published, is_visible::boolean)';
    END IF;
END $$;

-- Eindeutigkeit des Slugs sicherstellen (für ON CONFLICT beim Seed)
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public' AND tablename = 'teams'
          AND indexdef ILIKE '%UNIQUE%' AND indexdef ILIKE '%(slug)%'
    ) THEN
        CREATE UNIQUE INDEX teams_slug_unique ON teams(slug);
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Unique-Index auf teams.slug nicht anlegbar: %', SQLERRM;
END $$;

-- Admins: Rollen & Permissions
ALTER TABLE admins ADD COLUMN IF NOT EXISTS role        TEXT;
ALTER TABLE admins ADD COLUMN IF NOT EXISTS permissions JSONB;
ALTER TABLE admins ADD COLUMN IF NOT EXISTS name        TEXT;
ALTER TABLE admins ADD COLUMN IF NOT EXISTS is_active   BOOLEAN DEFAULT true;

-- Bestehende Admins (aus V1) waren Voll-Admins -> werden Superadmins.
-- Läuft nur beim ersten Mal (role IS NULL), danach nie wieder.
UPDATE admins SET role = 'superadmin', permissions = '[]'::jsonb WHERE role IS NULL;

ALTER TABLE admins ALTER COLUMN role        SET DEFAULT 'admin';
ALTER TABLE admins ALTER COLUMN permissions SET DEFAULT '[]'::jsonb;
UPDATE admins SET permissions = '[]'::jsonb WHERE permissions IS NULL;
UPDATE admins SET is_active = true WHERE is_active IS NULL;


-- =============================================================================
-- 3. NEUE TABELLEN
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 3a. teams — Mannschaften
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS teams (
    id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    slug         TEXT        UNIQUE NOT NULL,
    name         TEXT        NOT NULL,
    category     TEXT        NOT NULL DEFAULT 'herren',   -- 'herren','damen','jugend','hobby'
    league       TEXT,
    trainer      TEXT,
    training     TEXT,                                    -- z.B. 'Mo & Di, 20:00–22:00'
    halle        TEXT        DEFAULT 'Sporthalle Erkelenz',
    badge_text   TEXT,                                    -- z.B. 'Aufstieg 2026!'
    badge_type   TEXT,                                    -- 'success','info','warning'
    image_url    TEXT,
    description  TEXT,
    mv_name      TEXT,
    mv_phone     TEXT,
    mv_email     TEXT,
    players      JSONB       DEFAULT '[]',                -- [{name, role, number}]
    sort_order   INTEGER     DEFAULT 0,
    is_published BOOLEAN     DEFAULT true,
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 3b. calendar_events — Spiele / Termine / Events für den Kalender
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS calendar_events (
    id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    title        TEXT        NOT NULL,
    event_type   TEXT        NOT NULL DEFAULT 'spiel',    -- 'spiel','turnier','event','training'
    team_id      UUID        REFERENCES teams(id) ON DELETE SET NULL,
    date         DATE        NOT NULL,
    date_end     DATE,
    time_start   TEXT,
    time_end     TEXT,
    location     TEXT,
    opponent     TEXT,                                    -- Gegner (bei Spielen)
    is_home      BOOLEAN,                                 -- Heimspiel?
    description  TEXT,
    is_published BOOLEAN     DEFAULT true,
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_calendar_events_date ON calendar_events(date);
CREATE INDEX IF NOT EXISTS idx_calendar_events_team ON calendar_events(team_id);

-- -----------------------------------------------------------------------------
-- 3c. beach_blocks — gesperrte Slots auf der Beachanlage (Training etc.)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS beach_blocks (
    id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    date         DATE        NOT NULL,
    field        INTEGER     NOT NULL,                    -- 1..4
    start_min    INTEGER     NOT NULL,                    -- Minuten seit 0:00 (z.B. 1080 = 18:00)
    slot_count   INTEGER     NOT NULL DEFAULT 1,          -- Anzahl 45-Min-Slots
    reason       TEXT        DEFAULT 'Training',          -- Anzeige-Text
    block_type   TEXT        DEFAULT 'training',          -- 'training','event','wartung'
    team_id      UUID        REFERENCES teams(id) ON DELETE SET NULL,
    created_by   UUID,
    created_by_email TEXT,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_beach_blocks_date ON beach_blocks(date);

-- -----------------------------------------------------------------------------
-- 3d. admin_audit_log — wer hat was wann geändert
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_audit_log (
    id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id      UUID,
    user_email   TEXT,
    user_name    TEXT,
    action       TEXT        NOT NULL,                    -- 'create','update','delete','login',...
    entity       TEXT        NOT NULL,                    -- 'news','tournament','team','event','beach_block','admin',...
    entity_id    TEXT,
    entity_label TEXT,                                    -- z.B. Titel des Beitrags
    details      JSONB,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_created ON admin_audit_log(created_at DESC);


-- =============================================================================
-- 4. HELPER-FUNKTIONEN
-- =============================================================================

-- Aktiver Admin (beliebige Rolle)?
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM admins
        WHERE user_id = auth.uid() AND COALESCE(is_active, true)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Superadmin?
CREATE OR REPLACE FUNCTION is_superadmin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM admins
        WHERE user_id = auth.uid() AND COALESCE(is_active, true) AND role = 'superadmin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Hat der eingeloggte Admin eine bestimmte Permission?
-- Permission-Keys: 'news','events','teams','kalender','beach','registrations','verwaltung','log'
CREATE OR REPLACE FUNCTION has_perm(p TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM admins a
        WHERE a.user_id = auth.uid()
          AND COALESCE(a.is_active, true)
          AND (a.role = 'superadmin' OR COALESCE(a.permissions, '[]'::jsonb) ? p)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Registrierungs-Zähler (öffentlich, aus V1)
CREATE OR REPLACE FUNCTION get_registration_count(tid UUID)
RETURNS INTEGER AS $$
BEGIN
    RETURN (SELECT COUNT(*)::INTEGER FROM tournament_registrations
            WHERE tournament_id = tid AND pay_status != 'cancelled');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- updated_at-Trigger-Funktion
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger anlegen (idempotent)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_news_updated_at') THEN
        CREATE TRIGGER trg_news_updated_at BEFORE UPDATE ON news
        FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_tournaments_updated_at') THEN
        CREATE TRIGGER trg_tournaments_updated_at BEFORE UPDATE ON tournaments
        FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_teams_updated_at') THEN
        CREATE TRIGGER trg_teams_updated_at BEFORE UPDATE ON teams
        FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_calendar_events_updated_at') THEN
        CREATE TRIGGER trg_calendar_events_updated_at BEFORE UPDATE ON calendar_events
        FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    END IF;
END $$;


-- =============================================================================
-- 5. ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE news                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournaments              ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE admins                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_events          ENABLE ROW LEVEL SECURITY;
ALTER TABLE beach_blocks             ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_audit_log          ENABLE ROW LEVEL SECURITY;

-- Alle Alt-Policies auf UNSEREN Tabellen entfernen (deterministischer Zustand;
-- die bookings-Tabelle des Beach-Systems bleibt unangetastet)
DO $$
DECLARE p RECORD;
BEGIN
    FOR p IN
        SELECT tablename, policyname FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename IN ('news', 'tournaments', 'tournament_registrations',
                            'admins', 'teams', 'calendar_events', 'beach_blocks',
                            'admin_audit_log')
    LOOP
        EXECUTE format('DROP POLICY %I ON %I', p.policyname, p.tablename);
    END LOOP;
END $$;

-- ── news: öffentlich lesen, Schreiben mit Permission 'news' ──
DROP POLICY IF EXISTS "news: anyone can read published" ON news;
DROP POLICY IF EXISTS "news: admins can insert" ON news;
DROP POLICY IF EXISTS "news: admins can update" ON news;
DROP POLICY IF EXISTS "news: admins can delete" ON news;
CREATE POLICY "news: anyone can read published" ON news FOR SELECT USING (true);
CREATE POLICY "news: admins can insert" ON news FOR INSERT WITH CHECK (has_perm('news'));
CREATE POLICY "news: admins can update" ON news FOR UPDATE USING (has_perm('news')) WITH CHECK (has_perm('news'));
CREATE POLICY "news: admins can delete" ON news FOR DELETE USING (has_perm('news'));

-- ── tournaments: öffentlich lesen, Schreiben mit Permission 'events' ──
DROP POLICY IF EXISTS "tournaments: anyone can read" ON tournaments;
DROP POLICY IF EXISTS "tournaments: admins can insert" ON tournaments;
DROP POLICY IF EXISTS "tournaments: admins can update" ON tournaments;
DROP POLICY IF EXISTS "tournaments: admins can delete" ON tournaments;
CREATE POLICY "tournaments: anyone can read" ON tournaments FOR SELECT USING (true);
CREATE POLICY "tournaments: admins can insert" ON tournaments FOR INSERT WITH CHECK (has_perm('events'));
CREATE POLICY "tournaments: admins can update" ON tournaments FOR UPDATE USING (has_perm('events')) WITH CHECK (has_perm('events'));
CREATE POLICY "tournaments: admins can delete" ON tournaments FOR DELETE USING (has_perm('events'));

-- ── tournament_registrations: Lesen/Ändern mit 'registrations' oder 'events' ──
DROP POLICY IF EXISTS "registrations: admins can read all" ON tournament_registrations;
DROP POLICY IF EXISTS "registrations: anyone can register" ON tournament_registrations;
DROP POLICY IF EXISTS "registrations: admins can update" ON tournament_registrations;
DROP POLICY IF EXISTS "registrations: admins can delete" ON tournament_registrations;
CREATE POLICY "registrations: admins can read all" ON tournament_registrations
    FOR SELECT USING (has_perm('registrations') OR has_perm('events'));
CREATE POLICY "registrations: anyone can register" ON tournament_registrations
    FOR INSERT WITH CHECK (true);
CREATE POLICY "registrations: admins can update" ON tournament_registrations
    FOR UPDATE USING (has_perm('registrations') OR has_perm('events'))
    WITH CHECK (has_perm('registrations') OR has_perm('events'));
CREATE POLICY "registrations: admins can delete" ON tournament_registrations
    FOR DELETE USING (has_perm('registrations') OR has_perm('events'));

-- ── admins: eigene Zeile lesen alle Angemeldeten; verwalten nur Superadmin ──
DROP POLICY IF EXISTS "admins: authenticated can read" ON admins;
DROP POLICY IF EXISTS "admins: superadmins can insert" ON admins;
DROP POLICY IF EXISTS "admins: superadmins can update" ON admins;
DROP POLICY IF EXISTS "admins: superadmins can delete" ON admins;
CREATE POLICY "admins: authenticated can read" ON admins
    FOR SELECT USING (user_id = auth.uid() OR is_superadmin());
CREATE POLICY "admins: superadmins can insert" ON admins
    FOR INSERT WITH CHECK (is_superadmin());
CREATE POLICY "admins: superadmins can update" ON admins
    FOR UPDATE USING (is_superadmin()) WITH CHECK (is_superadmin());
CREATE POLICY "admins: superadmins can delete" ON admins
    FOR DELETE USING (is_superadmin());

-- ── teams: öffentlich lesen, Schreiben mit Permission 'teams' ──
DROP POLICY IF EXISTS "teams: anyone can read" ON teams;
DROP POLICY IF EXISTS "teams: admins can insert" ON teams;
DROP POLICY IF EXISTS "teams: admins can update" ON teams;
DROP POLICY IF EXISTS "teams: admins can delete" ON teams;
CREATE POLICY "teams: anyone can read" ON teams FOR SELECT USING (true);
CREATE POLICY "teams: admins can insert" ON teams FOR INSERT WITH CHECK (has_perm('teams'));
CREATE POLICY "teams: admins can update" ON teams FOR UPDATE USING (has_perm('teams')) WITH CHECK (has_perm('teams'));
CREATE POLICY "teams: admins can delete" ON teams FOR DELETE USING (has_perm('teams'));

-- ── calendar_events: öffentlich lesen, Schreiben mit Permission 'kalender' ──
DROP POLICY IF EXISTS "calendar: anyone can read" ON calendar_events;
DROP POLICY IF EXISTS "calendar: admins can insert" ON calendar_events;
DROP POLICY IF EXISTS "calendar: admins can update" ON calendar_events;
DROP POLICY IF EXISTS "calendar: admins can delete" ON calendar_events;
CREATE POLICY "calendar: anyone can read" ON calendar_events FOR SELECT USING (true);
CREATE POLICY "calendar: admins can insert" ON calendar_events FOR INSERT WITH CHECK (has_perm('kalender'));
CREATE POLICY "calendar: admins can update" ON calendar_events FOR UPDATE USING (has_perm('kalender')) WITH CHECK (has_perm('kalender'));
CREATE POLICY "calendar: admins can delete" ON calendar_events FOR DELETE USING (has_perm('kalender'));

-- ── beach_blocks: öffentlich lesen (fürs Ausgrauen), Schreiben mit 'beach' ──
DROP POLICY IF EXISTS "blocks: anyone can read" ON beach_blocks;
DROP POLICY IF EXISTS "blocks: admins can insert" ON beach_blocks;
DROP POLICY IF EXISTS "blocks: admins can update" ON beach_blocks;
DROP POLICY IF EXISTS "blocks: admins can delete" ON beach_blocks;
CREATE POLICY "blocks: anyone can read" ON beach_blocks FOR SELECT USING (true);
CREATE POLICY "blocks: admins can insert" ON beach_blocks FOR INSERT WITH CHECK (has_perm('beach'));
CREATE POLICY "blocks: admins can update" ON beach_blocks FOR UPDATE USING (has_perm('beach')) WITH CHECK (has_perm('beach'));
CREATE POLICY "blocks: admins can delete" ON beach_blocks FOR DELETE USING (has_perm('beach'));

-- ── admin_audit_log: jeder aktive Admin schreibt, lesen mit 'log'; kein Löschen ──
DROP POLICY IF EXISTS "audit: admins can insert" ON admin_audit_log;
DROP POLICY IF EXISTS "audit: admins can read" ON admin_audit_log;
CREATE POLICY "audit: admins can insert" ON admin_audit_log FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "audit: admins can read" ON admin_audit_log FOR SELECT USING (has_perm('log'));

-- ── bookings (Tabelle aus dem Beach-Projekt): Admins mit 'beach' dürfen lesen,
--    stornieren und Zahlungsstatus ändern. Defensiv in DO-Block, falls die
--    Tabelle (noch) nicht existiert. ──
DO $$ BEGIN
    EXECUTE 'DROP POLICY IF EXISTS "bookings: beach admins can read" ON bookings';
    EXECUTE 'CREATE POLICY "bookings: beach admins can read" ON bookings FOR SELECT USING (has_perm(''beach''))';
    EXECUTE 'DROP POLICY IF EXISTS "bookings: beach admins can update" ON bookings';
    EXECUTE 'CREATE POLICY "bookings: beach admins can update" ON bookings FOR UPDATE USING (has_perm(''beach'')) WITH CHECK (has_perm(''beach''))';
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'bookings-Tabelle nicht gefunden oder Policies nicht anwendbar – übersprungen.';
END $$;


-- =============================================================================
-- 6. PUBLIC VIEWS
-- =============================================================================

DROP VIEW IF EXISTS public_news;
CREATE VIEW public_news AS
SELECT id, title, content, tag, tag_label, published_at, image_url
FROM news
WHERE is_published = true
ORDER BY published_at DESC;

DROP VIEW IF EXISTS public_tournaments;
CREATE VIEW public_tournaments AS
SELECT id, name, description, type, date_start, date_end,
       time_start, time_end, location, max_teams, has_trophy,
       is_wvv, wvv_link, entry_fee_cents,
       registration_open, registration_deadline, image_url
FROM tournaments
WHERE is_published = true
ORDER BY date_start ASC;

DROP VIEW IF EXISTS public_teams;
CREATE VIEW public_teams AS
SELECT id, slug, name, category, league, trainer, training, halle,
       badge_text, badge_type, image_url, description,
       mv_name, mv_phone, mv_email, players, sort_order
FROM teams
WHERE is_published = true
ORDER BY sort_order ASC, name ASC;

-- Kalender: eigene Termine + Turniere in einer View vereint
DROP VIEW IF EXISTS public_calendar;
CREATE VIEW public_calendar AS
SELECT
    ce.id,
    ce.title,
    ce.event_type,
    ce.date,
    ce.date_end,
    ce.time_start,
    ce.time_end,
    ce.location,
    ce.opponent,
    ce.is_home,
    ce.description,
    ce.team_id,
    t.name     AS team_name,
    t.category AS team_category,
    NULL::uuid AS tournament_id
FROM calendar_events ce
LEFT JOIN teams t ON t.id = ce.team_id
WHERE ce.is_published = true
UNION ALL
SELECT
    tr.id,
    tr.name,
    'turnier',
    tr.date_start,
    tr.date_end,
    tr.time_start,
    tr.time_end,
    tr.location,
    NULL,
    NULL,
    tr.description,
    NULL,
    NULL,
    NULL,
    tr.id
FROM tournaments tr
WHERE tr.is_published = true;

GRANT SELECT ON public_news        TO anon, authenticated;
GRANT SELECT ON public_tournaments TO anon, authenticated;
GRANT SELECT ON public_teams       TO anon, authenticated;
GRANT SELECT ON public_calendar    TO anon, authenticated;


-- =============================================================================
-- 7. STORAGE — Bucket "images" für Bild-Uploads (News, Teams, Events)
-- =============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('images', 'images', true)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
    EXECUTE 'DROP POLICY IF EXISTS "images: public read" ON storage.objects';
    EXECUTE 'CREATE POLICY "images: public read" ON storage.objects FOR SELECT USING (bucket_id = ''images'')';
    EXECUTE 'DROP POLICY IF EXISTS "images: admins can upload" ON storage.objects';
    EXECUTE 'CREATE POLICY "images: admins can upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = ''images'' AND is_admin())';
    EXECUTE 'DROP POLICY IF EXISTS "images: admins can update" ON storage.objects';
    EXECUTE 'CREATE POLICY "images: admins can update" ON storage.objects FOR UPDATE USING (bucket_id = ''images'' AND is_admin())';
    EXECUTE 'DROP POLICY IF EXISTS "images: admins can delete" ON storage.objects';
    EXECUTE 'CREATE POLICY "images: admins can delete" ON storage.objects FOR DELETE USING (bucket_id = ''images'' AND is_admin())';
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Storage-Policies konnten nicht gesetzt werden: %', SQLERRM;
END $$;


-- =============================================================================
-- 8. REALTIME für beach_blocks (Live-Update im öffentlichen Kalender)
-- =============================================================================

DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE beach_blocks;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'beach_blocks ist bereits in der Realtime-Publication oder Publication fehlt.';
END $$;


-- =============================================================================
-- 9. SEED-DATEN
-- =============================================================================

-- ── 9a. Teams (aus der bisherigen statischen Website übernommen) ──
-- Die Website-Inhalte sind die Quelle der Wahrheit: Existiert ein Team mit
-- gleichem Namen bereits (früherer Versuch), wird es mit den Website-Daten
-- vervollständigt (hochgeladene Bilder bleiben erhalten). Sonst wird es neu
-- angelegt. Zusätzliche, selbst angelegte Teams bleiben unangetastet.
DO $seed_teams$
DECLARE r RECORD;
BEGIN
FOR r IN
SELECT * FROM (VALUES
('maenner-1', 'Männer 1', 'herren', 'Verbandsliga', 'Arash', 'Mo & Di, 20:00–22:00', 'Sporthalle Erkelenz', 'Aufstieg 2026!', 'success', 'img/herren.jpg',
 'Unsere erste Herrenmannschaft spielt in der Verbandsliga und hat sich in der Saison 2025/26 den Aufstieg gesichert. Mit einer starken Mischung aus erfahrenen Spielern und jungen Talenten zeigt das Team Woche für Woche eine beeindruckende Leistung auf dem Feld.',
 'Arash', '0151 12345678', 'maenner1@evv2000.de',
 '[{"name":"Arash","role":"Trainer / Zuspieler","number":1},{"name":"Finn","role":"Libero","number":7},{"name":"Lukas","role":"Außenangreifer","number":3},{"name":"Max","role":"Mittelblocker","number":5},{"name":"Tim","role":"Diagonalangreifer","number":9},{"name":"Jonas","role":"Außenangreifer","number":4},{"name":"Paul","role":"Mittelblocker","number":8},{"name":"Leon","role":"Zuspieler","number":2},{"name":"David","role":"Außenangreifer","number":6},{"name":"Niklas","role":"Libero","number":10}]'::jsonb, 10),
('maenner-2', 'Männer 2', 'herren', 'Bezirksliga', 'Alexander Frizler', 'Mo & Di, 20:00–22:00', 'Sporthalle Erkelenz', 'Klassenerhalt', 'info', 'img/herren.jpg',
 'Die zweite Herrenmannschaft kämpft in der Bezirksliga und hat sich in der Saison 2025/26 den Klassenerhalt gesichert. Das Team zeichnet sich durch großen Zusammenhalt und eine stetige Entwicklung der Spieler aus.',
 'Alexander Frizler', '0151 23456789', 'maenner2@evv2000.de',
 '[{"name":"Alexander Frizler","role":"Trainer / Zuspieler","number":1},{"name":"Kevin","role":"Außenangreifer","number":3},{"name":"Marcel","role":"Mittelblocker","number":5},{"name":"Dennis","role":"Diagonalangreifer","number":9},{"name":"Christian","role":"Außenangreifer","number":4},{"name":"Thomas","role":"Libero","number":7},{"name":"Stefan","role":"Mittelblocker","number":8},{"name":"Patrick","role":"Zuspieler","number":2}]'::jsonb, 20),
('frauen-1', 'Frauen 1', 'damen', 'Bezirksliga', 'Rudi Ritz', 'Mo & Mi, 20:00–22:00 / Di 18:30–20:00', 'Sporthalle Erkelenz', 'Aufstieg 2026!', 'success', 'img/damen.jpg',
 'Unsere erste Damenmannschaft hat in einer herausragenden Saison den Aufstieg geschafft! Mit einem souveränen 3:0-Sieg im letzten Spiel steht der verdiente Lohn für eine Saison voller Einsatz und Teamgeist.',
 'Rudi Ritz', '0151 34567890', 'frauen1@evv2000.de',
 '[{"name":"Rudi Ritz","role":"Trainer","number":null},{"name":"Lisa","role":"Zuspielerin","number":1},{"name":"Anna","role":"Außenangreiferin","number":3},{"name":"Sarah","role":"Mittelblockerin","number":5},{"name":"Julia","role":"Diagonalangreiferin","number":9},{"name":"Laura","role":"Außenangreiferin","number":4},{"name":"Marie","role":"Libera","number":7},{"name":"Sophie","role":"Mittelblockerin","number":8},{"name":"Lena","role":"Zuspielerin","number":2},{"name":"Nina","role":"Außenangreiferin","number":6}]'::jsonb, 30),
('frauen-2', 'Frauen 2', 'damen', 'Bezirksklasse', 'Felix Cohnen', 'Mo & Mi, 17:00–18:30', 'Sporthalle Erkelenz', NULL, NULL, 'img/damen.jpg',
 'Die zweite Damenmannschaft bietet sowohl erfahrenen Spielerinnen als auch Neueinsteigern die Möglichkeit, auf gutem Niveau Volleyball zu spielen. In der Bezirksklasse zeigt das Team jede Woche vollen Einsatz.',
 'Felix Cohnen', '0151 45678901', 'frauen2@evv2000.de',
 '[{"name":"Felix Cohnen","role":"Trainer","number":null},{"name":"Mia","role":"Zuspielerin","number":1},{"name":"Ella","role":"Außenangreiferin","number":3},{"name":"Clara","role":"Mittelblockerin","number":5},{"name":"Luisa","role":"Außenangreiferin","number":4},{"name":"Hannah","role":"Libera","number":7},{"name":"Emilia","role":"Mittelblockerin","number":8}]'::jsonb, 40),
('wu20-1', 'wU20 – 1', 'jugend', 'Oberliga', 'Christian Dicke', 'Di & Mi, 18:30–20:00', 'Sporthalle Erkelenz', NULL, NULL, 'img/jugend.jpg',
 'Unsere erste weibliche U20 spielt in der Oberliga und gehört damit zu den stärksten Jugendmannschaften der Region. Unter der Leitung von Christian Dicke entwickeln sich die Spielerinnen stetig weiter.',
 'Christian Dicke', '0151 56789012', 'wu20@evv2000.de', '[]'::jsonb, 50),
('wu20-2', 'wU20 – 2', 'jugend', 'Bezirksliga', 'Rudi Ritz', 'Di & Mi, 18:30–20:00', 'Sporthalle Erkelenz', NULL, NULL, 'img/jugend.jpg',
 'Die zweite wU20 spielt in der Bezirksliga und bietet jungen Spielerinnen die Möglichkeit, Wettkampferfahrung zu sammeln und sich spielerisch weiterzuentwickeln.',
 'Rudi Ritz', '0151 34567890', 'wu20-2@evv2000.de', '[]'::jsonb, 60),
('wu18-1', 'wU18 – 1', 'jugend', 'Oberliga', 'Rudi Ritz', 'Di & Mi, 18:30–20:00', 'Sporthalle Erkelenz', NULL, NULL, 'img/jugend.jpg',
 'Die wU18-1 spielt in der Oberliga und zählt zu den Aushängeschildern unserer Jugendarbeit. Die Spielerinnen werden intensiv auf den Übergang in den Erwachsenenbereich vorbereitet.',
 'Rudi Ritz', '0151 34567890', 'wu18@evv2000.de', '[]'::jsonb, 70),
('wu18-2-3', 'wU18 – 2/3', 'jugend', 'Bezirksliga', 'Denis Grauer / Felix Cohnen', 'Di & Mi, 18:30–20:00', 'Sporthalle Erkelenz', NULL, NULL, 'img/jugend.jpg',
 'Unsere wU18-2/3 bietet weiteren jungen Talenten die Chance, in der Bezirksliga Spielpraxis zu sammeln. Unter erfahrener Anleitung werden die Grundlagen für eine erfolgreiche Volleyballkarriere gelegt.',
 'Denis Grauer', '0151 67890123', 'wu18-23@evv2000.de', '[]'::jsonb, 80),
('mu20', 'mU20', 'jugend', 'Bezirksliga', 'Phil Joosten', 'Di & Mi, 18:30–20:00', 'Sporthalle Erkelenz', NULL, NULL, 'img/jugend.jpg',
 'Die männliche U20 spielt in der Bezirksliga und entwickelt junge Spieler für den Herrenbereich weiter. Das Team zeigt enormes Potenzial und wächst Saison für Saison zusammen.',
 'Phil Joosten', '0151 78901234', 'mu20@evv2000.de', '[]'::jsonb, 90),
('mu16', 'mU16', 'jugend', 'Bezirksliga', 'Arash', 'Mi 17:00–18:30 / Do 18:30–20:00', 'Sporthalle Erkelenz', NULL, NULL, 'img/jugend.jpg',
 'Unsere männliche U16 lernt die Grundlagen des Wettkampfvolleyballs. In der Bezirksliga sammeln die jungen Spieler wertvolle Erfahrung und werden individuell gefördert.',
 'Arash', '0151 12345678', 'mu16@evv2000.de', '[]'::jsonb, 100),
('u14-mixed', 'U14 Mixed', 'jugend', 'Bezirksliga', 'Arash', 'Mo & Mi, 17:00–18:30', 'Sporthalle Erkelenz', '3. Platz Bezirksfinale', 'info', 'img/jugend.jpg',
 'Die U14 Mixed ist der perfekte Einstieg in den Vereinsvolleyball. Jungen und Mädchen trainieren gemeinsam und lernen spielerisch die Grundlagen. Das Team erreichte einen starken 3. Platz beim Bezirksfinale!',
 'Arash', '0151 12345678', 'u14@evv2000.de', '[]'::jsonb, 110),
('hobbyts', 'Hobbyts 1 & 2', 'hobby', 'VK A-D-H', 'Michael Schaefer / Felix Cohnen', 'Mo & Di, 20:00–22:00', 'Sporthalle Erkelenz', NULL, NULL, 'img/herren.jpg',
 'Die Hobbyts sind unsere Hobbymannschaften für alle, die Spaß am Volleyball haben, ohne den Druck des Leistungssports. In entspannter Atmosphäre wird trotzdem ambitioniert gespielt – und der Erfolg gibt ihnen recht!',
 'Michael Schaefer', '0151 89012345', 'hobbyts@evv2000.de', '[]'::jsonb, 120),
('froggs', 'Froggs', 'hobby', 'Heinsberg-Staffel', 'Jürgen Hennig', 'Mo, 20:00–22:00', 'Sporthalle Erkelenz', NULL, NULL, 'img/herren.jpg',
 'Die Froggs sind eine besondere Truppe im Verein – mit viel Spaß und Leidenschaft wird in der Heinsberg-Staffel gespielt. Hier steht der Teamgeist an erster Stelle.',
 'Jürgen Hennig', '0151 90123456', 'froggs@evv2000.de', '[]'::jsonb, 130)
) AS v(slug, name, category, league, trainer, training, halle, badge_text, badge_type, image_url, description, mv_name, mv_phone, mv_email, players, sort_order)
LOOP
    IF EXISTS (SELECT 1 FROM teams t WHERE t.slug = r.slug OR lower(t.name) = lower(r.name)) THEN
        UPDATE teams SET
            slug         = COALESCE(NULLIF(teams.slug, ''), r.slug),
            category     = r.category,
            league       = r.league,
            trainer      = r.trainer,
            training     = r.training,
            halle        = r.halle,
            badge_text   = r.badge_text,
            badge_type   = r.badge_type,
            image_url    = COALESCE(NULLIF(teams.image_url, ''), r.image_url),
            description  = r.description,
            mv_name      = r.mv_name,
            mv_phone     = r.mv_phone,
            mv_email     = r.mv_email,
            players      = CASE WHEN teams.players IS NULL OR teams.players = '[]'::jsonb
                                THEN r.players ELSE teams.players END,
            sort_order   = r.sort_order,
            is_published = true
        WHERE teams.slug = r.slug OR lower(teams.name) = lower(r.name);
    ELSE
        INSERT INTO teams (slug, name, category, league, trainer, training, halle, badge_text, badge_type, image_url, description, mv_name, mv_phone, mv_email, players, sort_order)
        VALUES (r.slug, r.name, r.category, r.league, r.trainer, r.training, r.halle, r.badge_text, r.badge_type, r.image_url, r.description, r.mv_name, r.mv_phone, r.mv_email, r.players, r.sort_order);
    END IF;
END LOOP;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Team-Seed übersprungen: %', SQLERRM;
END $seed_teams$;

-- Slugs für übrige Team-Zeilen ohne Slug erzeugen (für die Links auf der Website)
UPDATE teams
SET slug = regexp_replace(
        lower(translate(coalesce(name, 'team'), 'äöüß ', 'aous-')),
        '[^a-z0-9-]+', '-', 'g'
    ) || '-' || substr(md5(id::text), 1, 4)
WHERE slug IS NULL OR slug = '';

-- ── 9b. News (nur einfügen, wenn noch keine News existieren) ──
DO $seed_news$ BEGIN
INSERT INTO news (title, content, tag, tag_label, published_at)
SELECT * FROM (VALUES
    ('Männer 1 steigen auf!',
     'Mit einem hart erkämpften 3:2-Sieg gegen FCJ Köln-4 sichern sich unsere Männer 1 den Aufstieg in die nächsthöhere Spielklasse. In einem packenden Match mit fünf Sätzen bewies das Team Nervenstärke und Kampfgeist. Herzlichen Glückwunsch an die gesamte Mannschaft und das Trainerteam!',
     'success', 'Aufstieg', DATE '2026-03-22'),
    ('Frauen 1 steigen auf!',
     'Unsere Frauen 1 haben es geschafft! Mit einem souveränen 3:0-Sieg gegen TuS Schmidt-2 steht der Aufstieg fest. Die Mannschaft zeigte eine dominante Leistung und ließ dem Gegner keine Chance. Ein großartiger Erfolg für die gesamte Abteilung — wir sind stolz auf euch!',
     'success', 'Aufstieg', DATE '2026-03-22'),
    ('Männer 2 halten die Klasse',
     'In einem spannenden Saisonfinale unterlagen unsere Männer 2 zwar knapp mit 2:3 gegen Würselener SV-2, sicherten sich aber dank des besseren Satzverhältnisses den Klassenerhalt. Eine starke kämpferische Leistung zum Saisonende!',
     'info', 'Spielbericht', DATE '2026-03-22'),
    ('Hobbyts 2 überzeugen',
     'Die Hobbyts 2 zeigten sich in Topform und feierten einen überzeugenden 3:0-Sieg gegen AVE/AVF-27/BSV. Die Mannschaft harmonierte hervorragend und dominierte das Spiel von Anfang bis Ende. Weiter so!',
     'info', 'Spielbericht', DATE '2026-03-22')
) AS v(title, content, tag, tag_label, published_at)
WHERE NOT EXISTS (SELECT 1 FROM news);
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'News-Beispieldaten übersprungen: %', SQLERRM;
END $seed_news$;

-- ── 9c. Turniere (nur einfügen, wenn noch keine existieren) ──
DO $seed_tour$ BEGIN
INSERT INTO tournaments (name, description, type, date_start, date_end, time_start, time_end, location, max_teams, has_trophy, registration_open)
SELECT * FROM (VALUES
    ('ERKA-Turnier',
     'Das traditionelle ERKA-Turnier des EVV 2000 Erkelenz — ein fester Bestandteil im Hallenvolleyball-Kalender der Region. Teams aus der ganzen Umgebung treten in spannenden Spielen gegeneinander an. Für Verpflegung und gute Stimmung ist wie immer gesorgt!',
     'indoor', DATE '2026-09-19', DATE '2026-09-20', '09:00', '18:00', 'Erkelenz', NULL::integer, true, false),
    ('Midsommar-Cup',
     'Das Beach-Highlight des Sommers! Der Midsommar-Cup auf unserer Beachanlage bringt Teams aus nah und fern zusammen. Sonne, Sand und Volleyball — das perfekte Sommerturnier mit bis zu 24 teilnehmenden Teams.',
     'beach', DATE '2026-06-20', DATE '2026-06-21', '09:00', '18:00', 'Erkelenz', 24, true, false),
    ('SNBFM-Turnier',
     'Das SNBFM-Beachturnier — ein beliebter Wettbewerb auf unserer Beachvolleyball-Anlage. Spannende Spiele und tolle Atmosphäre erwarten alle Teilnehmerinnen und Teilnehmer.',
     'beach', DATE '2026-08-15', DATE '2026-08-16', '09:00', '18:00', 'Erkelenz', NULL::integer, false, false)
) AS v(name, description, type, date_start, date_end, time_start, time_end, location, max_teams, has_trophy, registration_open)
WHERE NOT EXISTS (SELECT 1 FROM tournaments);
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Turnier-Beispieldaten übersprungen: %', SQLERRM;
END $seed_tour$;


-- =============================================================================
-- FERTIG.
--
-- WICHTIG — ERSTEN SUPERADMIN ANLEGEN (einmalig):
-- 1. In Supabase: Authentication → Users → "Add user" (E-Mail + Passwort).
-- 2. Danach hier im SQL Editor ausführen (E-Mail anpassen):
--
--    INSERT INTO admins (user_id, email, name, role, permissions)
--    SELECT id, email, 'Vereins-Admin', 'superadmin', '[]'::jsonb
--    FROM auth.users WHERE email = 'admin@evv2000.de'
--    ON CONFLICT (email) DO UPDATE SET role = 'superadmin', is_active = true;
--
-- Alle weiteren Admin-Konten lassen sich danach bequem im Admin-Panel unter
-- "Verwaltung" anlegen.
-- =============================================================================
