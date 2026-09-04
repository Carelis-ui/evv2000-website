-- ============================================================
-- V6 — Mitgliederverwaltung
--
-- Neue Tabelle "members": vom Admin-Panel verwaltete Mitglieder
-- (Stammdaten, Adresse, Bankverbindung/SEPA, Beitrag, Status).
-- Zugriff nur für Admins mit der Permission "members"
-- (Superadmins haben sie automatisch).
--
-- Idempotent. Im Supabase SQL-Editor ausführen (nach V2–V5).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.members (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_no         TEXT UNIQUE,                       -- Mitglieds-Nr. (optional)
    salutation        TEXT,                              -- Frau / Herr / Divers
    first_name        TEXT NOT NULL,
    last_name         TEXT NOT NULL,
    email             TEXT,
    phone             TEXT,
    birthdate         DATE,
    street            TEXT,
    postal_code       TEXT,
    city              TEXT,
    country           TEXT DEFAULT 'DE',
    iban              TEXT,
    bic               TEXT,
    sepa_mandate_id   TEXT,                              -- SEPA-Mandatsreferenz
    sepa_signed_at    DATE,
    membership_type   TEXT DEFAULT 'aktiv',              -- aktiv / passiv / jugend / familie / ehrenmitglied
    fee_year          NUMERIC(8,2) DEFAULT 0,            -- Jahresbeitrag in €
    fee_status        TEXT DEFAULT 'offen',              -- offen / gezahlt / gemahnt / erlassen
    joined_on         DATE DEFAULT CURRENT_DATE,
    left_on           DATE,                              -- NULL solange Mitglied
    team_id           UUID REFERENCES public.teams(id) ON DELETE SET NULL,
    is_active         BOOLEAN DEFAULT true,
    notes             TEXT,
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS members_last_first_idx ON public.members(last_name, first_name);
CREATE INDEX IF NOT EXISTS members_email_idx      ON public.members(email);
CREATE INDEX IF NOT EXISTS members_type_idx       ON public.members(membership_type);
CREATE INDEX IF NOT EXISTS members_active_idx     ON public.members(is_active);
CREATE INDEX IF NOT EXISTS members_fee_idx        ON public.members(fee_status);

-- updated_at automatisch pflegen (Funktion update_updated_at() kommt aus V2)
DROP TRIGGER IF EXISTS members_updated_at ON public.members;
CREATE TRIGGER members_updated_at BEFORE UPDATE ON public.members
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members: admins can read"   ON public.members;
DROP POLICY IF EXISTS "members: admins can insert" ON public.members;
DROP POLICY IF EXISTS "members: admins can update" ON public.members;
DROP POLICY IF EXISTS "members: admins can delete" ON public.members;

-- Kein öffentlicher Lesezugriff — Mitgliederdaten sind ausschließlich für Admins sichtbar.
CREATE POLICY "members: admins can read"   ON public.members FOR SELECT USING (has_perm('members'));
CREATE POLICY "members: admins can insert" ON public.members FOR INSERT WITH CHECK (has_perm('members'));
CREATE POLICY "members: admins can update" ON public.members FOR UPDATE USING (has_perm('members')) WITH CHECK (has_perm('members'));
CREATE POLICY "members: admins can delete" ON public.members FOR DELETE USING (has_perm('members'));

-- Hinweis: Die Permission "members" steht Superadmins automatisch zur
-- Verfügung. Weiteren Admins kannst du sie im Admin-Panel unter
-- "Verwaltung" per Häkchen geben.
