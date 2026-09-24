-- =============================================================================
-- EVV 2000 — Migration V10: Benachrichtigungen pro Kategorie
-- Jedes Admin-Konto abonniert einzelne Kategorien (Betreff des Kontaktformulars,
-- Mitgliedsanträge, Turnieranmeldungen, Beach-Buchungen). Gepflegt wird das im
-- Admin-Panel unter Verwaltung → Konto bearbeiten → E-Mail-Benachrichtigungen.
--
-- Mögliche Werte:
--   kontakt_probetraining, kontakt_mitgliedschaft, kontakt_mannschaften,
--   kontakt_beachanlage, kontakt_sponsoring, kontakt_turniere, kontakt_sonstiges,
--   antrag_mitglied, anmeldung_turnier, buchung_beach
--
-- NULL  = noch nie gepflegt → es greift die alte Logik (Berechtigung/Superadmin)
-- '{}'  = bewusst nichts abonniert → keine Mails
-- =============================================================================

ALTER TABLE public.admins ADD COLUMN IF NOT EXISTS notify_topics text[];

COMMENT ON COLUMN public.admins.notify_topics IS
    'Abonnierte Benachrichtigungs-Kategorien. NULL = Fallback auf permissions, leeres Array = keine Mails.';
