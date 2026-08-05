-- ============================================================
-- V5 — Formulare & Downloads (PDFs)
--
-- Neue Tabelle "documents": vom Admin-Panel verwaltete Dateien
-- (Antragsformular, Satzung, Beitragsordnung ...), die Besucher auf
-- der öffentlichen Seite /formulare herunterladen können.
--
-- Dateien liegen im bestehenden Storage-Bucket "images" (Ordner
-- "dokumente/") — der ist öffentlich lesbar, Schreiben nur für Admins.
-- Zugriff auf den Admin-Bereich über die neue Permission "dokumente".
--
-- Idempotent. Im Supabase SQL-Editor ausführen (nach V2–V4).
-- ============================================================

CREATE TABLE IF NOT EXISTS documents (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title        TEXT NOT NULL,
    description  TEXT,
    category     TEXT,
    file_url     TEXT NOT NULL,
    file_name    TEXT,
    file_size    BIGINT,
    sort_order   INT DEFAULT 0,
    is_published BOOLEAN DEFAULT true,
    created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_documents_sort ON documents(sort_order ASC, title ASC);

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "documents: anyone can read published" ON documents;
DROP POLICY IF EXISTS "documents: admins can insert" ON documents;
DROP POLICY IF EXISTS "documents: admins can update" ON documents;
DROP POLICY IF EXISTS "documents: admins can delete" ON documents;

-- Öffentlich lesbar (die öffentliche View filtert zusätzlich auf published)
CREATE POLICY "documents: anyone can read published" ON documents
    FOR SELECT USING (true);
CREATE POLICY "documents: admins can insert" ON documents
    FOR INSERT WITH CHECK (has_perm('dokumente'));
CREATE POLICY "documents: admins can update" ON documents
    FOR UPDATE USING (has_perm('dokumente')) WITH CHECK (has_perm('dokumente'));
CREATE POLICY "documents: admins can delete" ON documents
    FOR DELETE USING (has_perm('dokumente'));

-- Öffentliche Lese-View (nur veröffentlichte)
DROP VIEW IF EXISTS public_documents;
CREATE VIEW public_documents AS
SELECT id, title, description, category, file_url, file_name, file_size, sort_order
FROM documents
WHERE is_published = true
ORDER BY sort_order ASC, title ASC;

GRANT SELECT ON public_documents TO anon, authenticated;

-- Hinweis: Die Permission "dokumente" steht Superadmins automatisch zur
-- Verfügung. Weiteren Admins kannst du sie im Admin-Panel unter
-- "Verwaltung" per Häkchen geben.
