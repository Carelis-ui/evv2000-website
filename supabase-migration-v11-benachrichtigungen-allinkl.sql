-- =============================================================================
-- EVV 2000 — Migration V11: E-Mail-Benachrichtigungen über ALL-INKL
--
-- Ersetzt den nie eingesetzten Entwurf V9 (der ging über Vercel + Resend).
-- Die Website läuft inzwischen auf ALL-INKL, dort verschickt php/notify.php die
-- Mails direkt per PHP — ein Resend-Konto wird nicht gebraucht.
--
-- Diese Funktion bestimmt die Empfänger selbst aus admins.notify_topics
-- (Admin-Panel → Verwaltung → E-Mail-Benachrichtigungen) und schickt sie mit.
-- Dadurch braucht der Server keinen Datenbank-Schlüssel.
--
-- VORHER:
--   1. php/notify-secret.php per FTP nach php/ hochladen (Vorlage: notify-secret.example.php)
--   2. Unten <NOTIFY_SECRET> durch genau denselben Wert ersetzen
--   3. Extension pg_net aktivieren: Dashboard → Database → Extensions → pg_net
--   4. Voraussetzung: Migration V10 (Spalte admins.notify_topics) ist gelaufen
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.notify_admins()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_topic      TEXT;
    v_perm       TEXT;
    v_recipients TEXT[];
BEGIN
    -- Welches Thema und (für Konten ohne gepflegte Häkchen) welche Berechtigung?
    IF TG_TABLE_NAME = 'contact_messages' THEN
        v_topic := 'kontakt_' || COALESCE(LOWER(NEW.subject), 'sonstiges');
        IF v_topic NOT IN ('kontakt_probetraining', 'kontakt_mitgliedschaft', 'kontakt_mannschaften',
                           'kontakt_beachanlage', 'kontakt_sponsoring', 'kontakt_turniere', 'kontakt_sonstiges') THEN
            v_topic := 'kontakt_sonstiges';
        END IF;
        v_perm := 'anfragen';
    ELSIF TG_TABLE_NAME = 'membership_applications' THEN
        v_topic := 'antrag_mitglied';   v_perm := 'anfragen';
    ELSIF TG_TABLE_NAME = 'tournament_registrations' THEN
        v_topic := 'anmeldung_turnier'; v_perm := 'registrations';
    ELSIF TG_TABLE_NAME = 'beach_bookings' THEN
        v_topic := 'buchung_beach';     v_perm := 'beach';
    ELSE
        RETURN NEW;
    END IF;

    -- Empfänger: angehakte Kategorie; Konten ohne gepflegte Häkchen nach alter Regel
    SELECT ARRAY_AGG(DISTINCT a.email) INTO v_recipients
    FROM public.admins a
    WHERE COALESCE(a.is_active, TRUE)
      AND a.email IS NOT NULL
      AND (
            (a.notify_topics IS NOT NULL AND v_topic = ANY (a.notify_topics))
         OR (a.notify_topics IS NULL AND (a.role = 'superadmin'
                                          OR COALESCE(a.permissions, '[]'::jsonb) ? v_perm))
          );

    IF v_recipients IS NULL OR ARRAY_LENGTH(v_recipients, 1) IS NULL THEN
        RETURN NEW;
    END IF;

    PERFORM net.http_post(
        url     := 'https://www.evv2000.de/api/notify',
        headers := jsonb_build_object(
                       'Content-Type', 'application/json',
                       'x-notify-secret', '<NOTIFY_SECRET>'
                   ),
        body    := jsonb_build_object(
                       'topic', v_topic,
                       'table', TG_TABLE_NAME,
                       'recipients', to_jsonb(v_recipients),
                       'record', to_jsonb(NEW)
                   ),
        timeout_milliseconds := 5000
    );

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Eine fehlgeschlagene Benachrichtigung darf das Speichern nie verhindern
    RETURN NEW;
END;
$$;

-- Trigger (idempotent). Nur für Tabellen, die es wirklich gibt — "DROP TRIGGER
-- IF EXISTS ... ON tabelle" bricht nämlich ab, wenn die TABELLE fehlt, und riss
-- am 07.10.2026 das ganze Skript mit (beach_bookings gibt es hier nicht, die
-- Beach-Buchungen liegen in "bookings").
DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['contact_messages', 'membership_applications', 'tournament_registrations'] LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables
                   WHERE table_schema = 'public' AND table_name = t) THEN
            EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'trg_notify_' || t, t);
            EXECUTE format('CREATE TRIGGER %I AFTER INSERT ON public.%I
                            FOR EACH ROW EXECUTE FUNCTION public.notify_admins()', 'trg_notify_' || t, t);
        END IF;
    END LOOP;
END;
$$;

-- Kontrolle: sollte drei Zeilen zeigen
SELECT tgname AS trigger, tgrelid::regclass::text AS tabelle
FROM pg_trigger WHERE tgname LIKE 'trg_notify%' ORDER BY 2;
