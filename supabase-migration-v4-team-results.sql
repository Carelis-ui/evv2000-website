-- ============================================================
-- V4 — Team: Link zu Spielergebnissen / Tabelle
--
-- Fügt der teams-Tabelle ein Feld für einen externen Link zu
-- Spielergebnissen/Tabelle hinzu (z. B. Verbands-/Ligaseite) und
-- nimmt es in die öffentliche View public_teams auf.
--
-- Idempotent — kann gefahrlos mehrfach ausgeführt werden.
-- Im Supabase SQL-Editor ausführen (nach V2 & V3).
-- ============================================================

ALTER TABLE teams ADD COLUMN IF NOT EXISTS results_url TEXT;

-- Öffentliche View neu aufbauen (inkl. results_url)
DROP VIEW IF EXISTS public_teams;
CREATE VIEW public_teams AS
SELECT id, slug, name, category, league, trainer, training, halle,
       badge_text, badge_type, image_url, description,
       mv_name, mv_phone, mv_email, players, sort_order, results_url
FROM teams
WHERE is_published = true
ORDER BY sort_order ASC, name ASC;

GRANT SELECT ON public_teams TO anon, authenticated;
