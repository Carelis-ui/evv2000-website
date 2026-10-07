-- =============================================================================
-- EVV 2000 — Migration V12: fehlende Spalten nachziehen (WICHTIG)
--
-- Gefunden am 07.10.2026: Das Kontaktformular konnte nie speichern. Beim
-- Absenden kam von der Datenbank
--   "Could not find the 'subject' column of 'contact_messages'"
-- und die Seite ist auf den Notfallweg ausgewichen — sie hat das Mailprogramm
-- des Besuchers geöffnet, statt die Nachricht zu speichern.
--
-- Ursache: contact_messages existierte schon, bevor Migration V3 lief. V3 legt
-- die Tabelle mit CREATE TABLE IF NOT EXISTS an — bestehende Tabellen bleiben
-- dabei unverändert, fehlende Spalten werden also NICHT ergänzt.
--
-- Gefahrlos mehrfach ausführbar.
-- =============================================================================

-- Kontaktformular: Betreff (Probetraining, Sponsoring, …) und Bearbeitungsstand
ALTER TABLE public.contact_messages ADD COLUMN IF NOT EXISTS subject TEXT;
ALTER TABLE public.contact_messages ADD COLUMN IF NOT EXISTS status  TEXT DEFAULT 'neu';
UPDATE public.contact_messages SET status = 'neu' WHERE status IS NULL;

-- Turnieranmeldungen: Bearbeitungsstand (im Admin-Panel auf "erledigt" setzbar)
ALTER TABLE public.tournament_registrations ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'neu';
UPDATE public.tournament_registrations SET status = 'neu' WHERE status IS NULL;

-- Kontrolle: sollte je eine Zeile mit den neuen Spalten zeigen
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (   (table_name = 'contact_messages'         AND column_name IN ('subject', 'status'))
       OR (table_name = 'tournament_registrations' AND column_name = 'status'))
ORDER BY table_name, column_name;
