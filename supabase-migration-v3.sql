-- =============================================================================
-- EVV 2000 — Supabase Migration V3
-- Kontaktanfragen + Mitgliedsanträge im Admin-Panel
--
-- Voraussetzung: supabase-migration-v2.sql wurde bereits ausgeführt
-- (liefert die Funktionen is_admin() / has_perm()).
-- Idempotent — kann gefahrlos mehrfach ausgeführt werden.
-- =============================================================================

-- ── Kontaktanfragen (Formular auf kontakt.html) ──
CREATE TABLE IF NOT EXISTS contact_messages (
    id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    name       TEXT        NOT NULL,
    email      TEXT        NOT NULL,
    subject    TEXT,                          -- 'probetraining','mitgliedschaft',...
    message    TEXT        NOT NULL,
    status     TEXT        DEFAULT 'neu',     -- 'neu','gelesen','erledigt'
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contact_messages_created ON contact_messages(created_at DESC);

-- ── Mitgliedsanträge (Formular auf mitgliedschaft.html) ──
CREATE TABLE IF NOT EXISTS membership_applications (
    id             UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    anrede         TEXT,
    vorname        TEXT        NOT NULL,
    nachname       TEXT        NOT NULL,
    geburtsdatum   DATE,
    email          TEXT        NOT NULL,
    telefon        TEXT,
    strasse        TEXT,
    plz            TEXT,
    ort            TEXT,
    mitgliedschaft TEXT,                      -- Art der Mitgliedschaft
    mannschaft     TEXT,                      -- Wunsch-Mannschaft (Anzeigename)
    erziehungsberechtigter         TEXT,
    kontakt_erziehungsberechtigter TEXT,
    kontoinhaber   TEXT,
    iban           TEXT,
    consent_satzung     BOOLEAN DEFAULT false,
    consent_datenschutz BOOLEAN DEFAULT false,
    consent_sepa        BOOLEAN DEFAULT false,
    status         TEXT        DEFAULT 'neu', -- 'neu','gelesen','erledigt'
    created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_membership_applications_created ON membership_applications(created_at DESC);

-- ── Row Level Security ──
ALTER TABLE contact_messages        ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_applications ENABLE ROW LEVEL SECURITY;

-- Vorhandene Policies entfernen (deterministischer Zustand)
DO $$
DECLARE p RECORD;
BEGIN
    FOR p IN
        SELECT tablename, policyname FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename IN ('contact_messages', 'membership_applications')
    LOOP
        EXECUTE format('DROP POLICY %I ON %I', p.policyname, p.tablename);
    END LOOP;
END $$;

-- Jeder darf einreichen; lesen/ändern/löschen nur mit Permission 'anfragen'
CREATE POLICY "contact: anyone can submit" ON contact_messages
    FOR INSERT WITH CHECK (true);
CREATE POLICY "contact: admins can read" ON contact_messages
    FOR SELECT USING (has_perm('anfragen'));
CREATE POLICY "contact: admins can update" ON contact_messages
    FOR UPDATE USING (has_perm('anfragen')) WITH CHECK (has_perm('anfragen'));
CREATE POLICY "contact: admins can delete" ON contact_messages
    FOR DELETE USING (has_perm('anfragen'));

CREATE POLICY "membership: anyone can submit" ON membership_applications
    FOR INSERT WITH CHECK (true);
CREATE POLICY "membership: admins can read" ON membership_applications
    FOR SELECT USING (has_perm('anfragen'));
CREATE POLICY "membership: admins can update" ON membership_applications
    FOR UPDATE USING (has_perm('anfragen')) WITH CHECK (has_perm('anfragen'));
CREATE POLICY "membership: admins can delete" ON membership_applications
    FOR DELETE USING (has_perm('anfragen'));

-- ── Bestehenden Admins mit Rolle 'admin' die neue Permission mitgeben ──
UPDATE admins
SET permissions = permissions || '["anfragen"]'::jsonb
WHERE role IN ('admin')
  AND NOT (COALESCE(permissions, '[]'::jsonb) ? 'anfragen');

-- =============================================================================
-- FERTIG. Die Anfragen erscheinen im Admin-Panel unter "Anfragen".
-- (Superadmins haben automatisch Zugriff; anderen Konten kann die Berechtigung
--  "Anfragen & Anträge" in der Verwaltung gegeben werden.)
-- =============================================================================
