-- =============================================================================
-- EVV 2000 — Migration V13: Ergebnisbilder je Mannschaft
--
-- Jürgen pflegt für die Froggs den Ergebnisdienst und möchte dafür wie bisher
-- bis zu drei Bilder hochladen und bei neuen Ergebnissen austauschen.
-- Gepflegt wird das im Admin-Panel unter Mannschaften; angezeigt wird es auf
-- ergebnisse.html?team=<slug>, verlinkt vom Liga-Feld der Mannschaftsseite.
--
-- Die Ansicht public_teams hat feste Spalten und muss deshalb neu angelegt
-- werden, sonst käme die neue Spalte auf der Website nie an.
-- Gefahrlos mehrfach ausführbar.
-- =============================================================================

ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS results_images TEXT[];

COMMENT ON COLUMN public.teams.results_images IS
    'Bis zu drei Bilder für den Ergebnisdienst (Tabelle, Spielplan, Ergebnisse).';

DROP VIEW IF EXISTS public_teams;
CREATE VIEW public_teams AS
SELECT id, slug, name, category, league, trainer, training, halle,
       badge_text, badge_type, image_url, description,
       mv_name, mv_phone, mv_email, players, sort_order, results_url,
       results_images
FROM teams
WHERE is_published = true
ORDER BY sort_order ASC, name ASC;

GRANT SELECT ON public_teams TO anon, authenticated;

-- Kontrolle: muss die Spalte results_images enthalten
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'public_teams'
ORDER BY ordinal_position;
