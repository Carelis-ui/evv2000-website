-- =============================================================================
-- EVV 2000 — Migration V8: Vorstand & Trainer, Bild-Darstellung + Rückblicke bei
-- Aktuelles, erweiterter Mitgliedsantrag (Felder des Aufnahmeantrags 2021)
-- Im Supabase SQL-Editor ausführen (idempotent, kann mehrfach laufen).
-- =============================================================================

-- ── 1. Vorstand & Trainer (Admin › „Vorstand & Trainer", Website /vorstand) ──
CREATE TABLE IF NOT EXISTS public.staff (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name         TEXT NOT NULL,
    role         TEXT NOT NULL,                       -- z.B. „1. Vorsitzender", „Trainer Herren 1"
    "group"      TEXT NOT NULL DEFAULT 'vorstand',    -- 'vorstand' | 'trainer' | 'sonstige'
    teams        TEXT,                                -- Freitext, z.B. „Herren 1, mU18"
    email        TEXT,
    phone        TEXT,
    image_url    TEXT,
    description  TEXT,                                -- kurzer Text (optional)
    sort_order   INTEGER DEFAULT 0,
    is_published BOOLEAN DEFAULT true,
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_at   TIMESTAMPTZ DEFAULT NOW()
);
DROP TRIGGER IF EXISTS staff_updated_at ON public.staff;
CREATE TRIGGER staff_updated_at BEFORE UPDATE ON public.staff FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff: anyone can read published" ON public.staff;
DROP POLICY IF EXISTS "staff: admins can read"           ON public.staff;
DROP POLICY IF EXISTS "staff: admins can insert"         ON public.staff;
DROP POLICY IF EXISTS "staff: admins can update"         ON public.staff;
DROP POLICY IF EXISTS "staff: admins can delete"         ON public.staff;
CREATE POLICY "staff: anyone can read published" ON public.staff FOR SELECT USING (is_published = true);
CREATE POLICY "staff: admins can read"           ON public.staff FOR SELECT USING (has_perm('teams'));
CREATE POLICY "staff: admins can insert"         ON public.staff FOR INSERT WITH CHECK (has_perm('teams'));
CREATE POLICY "staff: admins can update"         ON public.staff FOR UPDATE USING (has_perm('teams')) WITH CHECK (has_perm('teams'));
CREATE POLICY "staff: admins can delete"         ON public.staff FOR DELETE USING (has_perm('teams'));
GRANT SELECT ON public.staff TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.staff TO authenticated;

DROP VIEW IF EXISTS public_staff;
CREATE VIEW public_staff AS
SELECT id, name, role, "group", teams, email, phone, image_url, description, sort_order
FROM public.staff
WHERE is_published = true
ORDER BY sort_order ASC, name ASC;
GRANT SELECT ON public_staff TO anon, authenticated;

-- ── 2. Aktuelles: Bild-Darstellung + Rückblick zu einem Turnier/Event ──
ALTER TABLE public.news ADD COLUMN IF NOT EXISTS image_fit      TEXT DEFAULT 'cover';    -- 'cover' (füllend) | 'contain' (komplett)
ALTER TABLE public.news ADD COLUMN IF NOT EXISTS image_position TEXT DEFAULT 'center';   -- 'top' | 'center' | 'bottom'
ALTER TABLE public.news ADD COLUMN IF NOT EXISTS tournament_id  UUID REFERENCES public.tournaments(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_news_tournament ON public.news(tournament_id);

DROP VIEW IF EXISTS public_news;
CREATE VIEW public_news AS
SELECT id, title, content, tag, tag_label, published_at, image_url, image_fit, image_position, tournament_id
FROM public.news
WHERE is_published = true
ORDER BY published_at DESC;
GRANT SELECT ON public_news TO anon, authenticated;

-- ── 3. Mitgliedsantrag: Felder des Aufnahmeantrags (Version 01012021) ──
ALTER TABLE public.membership_applications ADD COLUMN IF NOT EXISTS geschlecht      TEXT;      -- weiblich | männlich | divers
ALTER TABLE public.membership_applications ADD COLUMN IF NOT EXISTS geburtsort      TEXT;
ALTER TABLE public.membership_applications ADD COLUMN IF NOT EXISTS nationalitaet   TEXT;
ALTER TABLE public.membership_applications ADD COLUMN IF NOT EXISTS mobil           TEXT;
ALTER TABLE public.membership_applications ADD COLUMN IF NOT EXISTS eintritt        DATE;      -- gewünschter Eintritt
ALTER TABLE public.membership_applications ADD COLUMN IF NOT EXISTS beitragsart     TEXT;      -- einzel | familie | passiv
ALTER TABLE public.membership_applications ADD COLUMN IF NOT EXISTS kreditinstitut  TEXT;
ALTER TABLE public.membership_applications ADD COLUMN IF NOT EXISTS bic             TEXT;
ALTER TABLE public.membership_applications ADD COLUMN IF NOT EXISTS consent_fotos   BOOLEAN DEFAULT false;  -- Einverständniserklärung Bilder/Videos
