-- =============================================================================
-- EVV 2000 Erkelenz — Supabase Migration
-- Run this file in the Supabase SQL Editor to set up all tables, RLS policies,
-- triggers, views, and seed data for the club admin system.
-- =============================================================================


-- =============================================================================
-- 1. TABLES
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1a. news — Aktuelles / Neuigkeiten
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS news (
    id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    title         TEXT        NOT NULL,
    content       TEXT        NOT NULL,
    tag           TEXT        DEFAULT 'info',        -- 'success', 'info', 'warning'
    tag_label     TEXT        DEFAULT 'Neuigkeit',   -- e.g. 'Aufstieg', 'Spielbericht'
    published_at  DATE        DEFAULT CURRENT_DATE,
    is_published  BOOLEAN     DEFAULT true,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 1b. tournaments — Events / Turniere
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tournaments (
    id                    UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    name                  TEXT        NOT NULL,
    description           TEXT,
    type                  TEXT        NOT NULL DEFAULT 'indoor',  -- 'indoor', 'beach'
    date_start            DATE        NOT NULL,
    date_end              DATE,
    time_start            TEXT,                                   -- e.g. '09:00'
    time_end              TEXT,                                   -- e.g. '18:00'
    location              TEXT,
    max_teams             INTEGER,
    has_trophy            BOOLEAN     DEFAULT false,
    is_wvv                BOOLEAN     DEFAULT false,              -- official WVV tournament
    wvv_link              TEXT,                                   -- link to WVV page
    entry_fee_cents       INTEGER     DEFAULT 0,                  -- 0 = free
    registration_open     BOOLEAN     DEFAULT false,
    registration_deadline DATE,
    image_url             TEXT,
    is_published          BOOLEAN     DEFAULT true,
    created_at            TIMESTAMPTZ DEFAULT NOW(),
    updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 1c. tournament_registrations — Turnier-Anmeldungen
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tournament_registrations (
    id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    tournament_id     UUID        NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    team_name         TEXT        NOT NULL,
    contact_name      TEXT        NOT NULL,
    contact_email     TEXT        NOT NULL,
    contact_phone     TEXT,
    player_count      INTEGER     DEFAULT 4,
    players_info      TEXT,                       -- JSON or comma-separated player names
    notes             TEXT,
    pay_status        TEXT        DEFAULT 'pending',  -- 'pending','paid','cancelled','refunded'
    pay_method        TEXT,                            -- 'stripe','onsite','free'
    total_cents       INTEGER     DEFAULT 0,
    stripe_session_id TEXT,
    created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 1d. admins — simple admin whitelist
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admins (
    id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id    UUID        REFERENCES auth.users(id),
    email      TEXT        UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);


-- =============================================================================
-- 2. HELPER FUNCTION — is_admin()
-- =============================================================================
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM admins WHERE user_id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- =============================================================================
-- 3. ROW LEVEL SECURITY (RLS)
-- =============================================================================

-- Enable RLS on every table
ALTER TABLE news                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournaments              ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE admins                   ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 3a. news — public read, admin write
-- -----------------------------------------------------------------------------
CREATE POLICY "news: anyone can read published"
    ON news FOR SELECT
    USING (true);

CREATE POLICY "news: admins can insert"
    ON news FOR INSERT
    WITH CHECK (is_admin());

CREATE POLICY "news: admins can update"
    ON news FOR UPDATE
    USING (is_admin())
    WITH CHECK (is_admin());

CREATE POLICY "news: admins can delete"
    ON news FOR DELETE
    USING (is_admin());

-- -----------------------------------------------------------------------------
-- 3b. tournaments — public read, admin write
-- -----------------------------------------------------------------------------
CREATE POLICY "tournaments: anyone can read"
    ON tournaments FOR SELECT
    USING (true);

CREATE POLICY "tournaments: admins can insert"
    ON tournaments FOR INSERT
    WITH CHECK (is_admin());

CREATE POLICY "tournaments: admins can update"
    ON tournaments FOR UPDATE
    USING (is_admin())
    WITH CHECK (is_admin());

CREATE POLICY "tournaments: admins can delete"
    ON tournaments FOR DELETE
    USING (is_admin());

-- -----------------------------------------------------------------------------
-- 3c. tournament_registrations — admin read, public insert (registration form)
-- -----------------------------------------------------------------------------
CREATE POLICY "registrations: admins can read all"
    ON tournament_registrations FOR SELECT
    USING (is_admin());

CREATE POLICY "registrations: anyone can register"
    ON tournament_registrations FOR INSERT
    WITH CHECK (true);

CREATE POLICY "registrations: admins can update"
    ON tournament_registrations FOR UPDATE
    USING (is_admin())
    WITH CHECK (is_admin());

CREATE POLICY "registrations: admins can delete"
    ON tournament_registrations FOR DELETE
    USING (is_admin());

-- -----------------------------------------------------------------------------
-- 3d. admins — authenticated users can read (to check their own status)
-- -----------------------------------------------------------------------------
CREATE POLICY "admins: authenticated can read"
    ON admins FOR SELECT
    USING (auth.role() = 'authenticated');


-- -----------------------------------------------------------------------------
-- 3e. Public function to get registration count (bypasses RLS)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_registration_count(tid UUID)
RETURNS INTEGER AS $$
BEGIN
    RETURN (SELECT COUNT(*)::INTEGER FROM tournament_registrations
            WHERE tournament_id = tid AND pay_status != 'cancelled');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- =============================================================================
-- 4. UPDATED_AT TRIGGER
-- =============================================================================

-- Generic trigger function — reusable for any table with updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach to news
CREATE TRIGGER trg_news_updated_at
    BEFORE UPDATE ON news
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- Attach to tournaments
CREATE TRIGGER trg_tournaments_updated_at
    BEFORE UPDATE ON tournaments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();


-- =============================================================================
-- 5. PUBLIC VIEWS
-- =============================================================================

-- Published news, newest first
CREATE OR REPLACE VIEW public_news AS
SELECT id, title, content, tag, tag_label, published_at
FROM news
WHERE is_published = true
ORDER BY published_at DESC;

-- Published tournaments, soonest first
CREATE OR REPLACE VIEW public_tournaments AS
SELECT id, name, description, type, date_start, date_end,
       time_start, time_end, location, max_teams, has_trophy,
       is_wvv, wvv_link, entry_fee_cents,
       registration_open, registration_deadline, image_url
FROM tournaments
WHERE is_published = true
ORDER BY date_start ASC;

-- Grant anonymous + authenticated access to the views
GRANT SELECT ON public_news TO anon, authenticated;
GRANT SELECT ON public_tournaments TO anon, authenticated;


-- =============================================================================
-- 6. SEED DATA
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 6a. News articles
-- -----------------------------------------------------------------------------
INSERT INTO news (title, content, tag, tag_label, published_at) VALUES
(
    'Männer 1 steigen auf!',
    'Mit einem hart erkämpften 3:2-Sieg gegen FCJ Köln-4 sichern sich unsere Männer 1 den Aufstieg in die nächsthöhere Spielklasse. In einem packenden Match mit fünf Sätzen bewies das Team Nervenstärke und Kampfgeist. Herzlichen Glückwunsch an die gesamte Mannschaft und das Trainerteam!',
    'success',
    'Aufstieg',
    '2026-03-22'
),
(
    'Frauen 1 steigen auf!',
    'Unsere Frauen 1 haben es geschafft! Mit einem souveränen 3:0-Sieg gegen TuS Schmidt-2 steht der Aufstieg fest. Die Mannschaft zeigte eine dominante Leistung und ließ dem Gegner keine Chance. Ein großartiger Erfolg für die gesamte Abteilung — wir sind stolz auf euch!',
    'success',
    'Aufstieg',
    '2026-03-22'
),
(
    'Männer 2 halten die Klasse',
    'In einem spannenden Saisonfinale unterlagen unsere Männer 2 zwar knapp mit 2:3 gegen Würselener SV-2, sicherten sich aber dank des besseren Satzverhältnisses den Klassenerhalt. Eine starke kämpferische Leistung zum Saisonende!',
    'info',
    'Spielbericht',
    '2026-03-22'
),
(
    'Hobbyts 2 überzeugen',
    'Die Hobbyts 2 zeigten sich in Topform und feierten einen überzeugenden 3:0-Sieg gegen AVE/AVF-27/BSV. Die Mannschaft harmonierte hervorragend und dominierte das Spiel von Anfang bis Ende. Weiter so!',
    'info',
    'Spielbericht',
    '2026-03-22'
);

-- -----------------------------------------------------------------------------
-- 6b. Tournaments
-- -----------------------------------------------------------------------------
INSERT INTO tournaments (name, description, type, date_start, date_end, time_start, time_end, location, max_teams, has_trophy, registration_open) VALUES
(
    'ERKA-Turnier',
    'Das traditionelle ERKA-Turnier des EVV 2000 Erkelenz — ein fester Bestandteil im Hallenvolleyball-Kalender der Region. Teams aus der ganzen Umgebung treten in spannenden Spielen gegeneinander an. Für Verpflegung und gute Stimmung ist wie immer gesorgt!',
    'indoor',
    '2026-09-19',
    '2026-09-20',
    '09:00',
    '18:00',
    'Erkelenz',
    NULL,
    true,
    false
),
(
    'Midsommar-Cup',
    'Das Beach-Highlight des Sommers! Der Midsommar-Cup auf unserer Beachanlage bringt Teams aus nah und fern zusammen. Sonne, Sand und Volleyball — das perfekte Sommerturnier mit bis zu 24 teilnehmenden Teams.',
    'beach',
    '2026-06-20',
    '2026-06-21',
    '09:00',
    '18:00',
    'Erkelenz',
    24,
    true,
    false
),
(
    'SNBFM-Turnier',
    'Das SNBFM-Beachturnier — ein beliebter Wettbewerb auf unserer Beachvolleyball-Anlage. Spannende Spiele und tolle Atmosphäre erwarten alle Teilnehmerinnen und Teilnehmer.',
    'beach',
    '2026-08-15',
    '2026-08-16',
    '09:00',
    '18:00',
    'Erkelenz',
    NULL,
    false,
    false
);
