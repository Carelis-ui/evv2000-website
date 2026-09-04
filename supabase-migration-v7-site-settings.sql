-- =============================================================================
-- EVV 2000 — Migration V7: Website-Einstellungen (site_settings)
-- Schlüssel/Wert-Tabelle für Dinge, die Admins ohne Code-Änderung pflegen sollen:
--   home_teams  → Mannschafts-Header auf der Startseite (3 Kacheln: Mannschaft, Bild, Texte)
--   meinverein  → Link zum digitalen Mitgliedsantrag (WISO MeinVerein)
-- Öffentlich lesbar (die Website liest die Werte), schreiben dürfen aktive Admins.
-- Im Supabase SQL-Editor ausführen. Ohne diese Migration zeigt die Website die
-- eingebauten Standardwerte – nichts geht kaputt.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.site_settings (
    key        TEXT PRIMARY KEY,
    value      JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- updated_at automatisch pflegen (Funktion update_updated_at() kommt aus V2)
DROP TRIGGER IF EXISTS site_settings_updated_at ON public.site_settings;
CREATE TRIGGER site_settings_updated_at BEFORE UPDATE ON public.site_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "site_settings: anyone can read"   ON public.site_settings;
DROP POLICY IF EXISTS "site_settings: admins can insert" ON public.site_settings;
DROP POLICY IF EXISTS "site_settings: admins can update" ON public.site_settings;
DROP POLICY IF EXISTS "site_settings: admins can delete" ON public.site_settings;

CREATE POLICY "site_settings: anyone can read"   ON public.site_settings FOR SELECT USING (true);
CREATE POLICY "site_settings: admins can insert" ON public.site_settings FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "site_settings: admins can update" ON public.site_settings FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "site_settings: admins can delete" ON public.site_settings FOR DELETE USING (is_admin());

GRANT SELECT ON public.site_settings TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.site_settings TO authenticated;

-- Startwerte = aktueller Stand der Website (kann im Admin unter „Startseite" geändert werden)
INSERT INTO public.site_settings (key, value) VALUES
('home_teams', '{
  "slots": [
    { "team_slug": "maenner-1", "image": "img/team-herren-1.jpg", "title": "Herren 1", "badge": "Verbandsliga", "sub": "Erkelenzer Haie · Aufstieg 2026 · Karl-Fischer-Halle" },
    { "team_slug": "frauen-1",  "image": "img/damen.jpg",         "title": "Damen 1",  "badge": "Bezirksliga",  "sub": "Aufstieg 2026" },
    { "team_slug": "",          "image": "img/jugend.jpg",        "title": "Jugend",   "badge": "7 Jugendteams", "sub": "U12 bis U20 · 3. Platz Bezirksfinale U14", "href": "mannschaften.html" }
  ]
}'::jsonb),
('meinverein', '{ "antrag_url": "" }'::jsonb)
ON CONFLICT (key) DO NOTHING;
