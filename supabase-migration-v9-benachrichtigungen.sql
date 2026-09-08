-- =============================================================================
-- EVV 2000 — Migration V9: E-Mail-Benachrichtigungen für Admins
-- Bei neuen Kontaktanfragen/Probetraining, Mitgliedsanträgen, Turnieranmeldungen
-- und Beach-Anfragen ruft die Datenbank die Vercel-Funktion /api/notify auf.
-- Die Funktion benachrichtigt nur Admins mit der passenden Berechtigung.
--
-- VORHER im Vercel-Projekt (Settings → Environment Variables) setzen:
--   NOTIFY_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, MAIL_FROM
-- DANN unten den Platzhalter <NOTIFY_SECRET> durch denselben Wert ersetzen und ausführen.
-- Voraussetzung: Extension pg_net (Dashboard → Database → Extensions → pg_net aktivieren).
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_net;

-- Trigger-Funktion: schickt die neue Zeile als JSON an /api/notify (asynchron, blockiert nichts)
CREATE OR REPLACE FUNCTION public.notify_admins()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    payload JSONB;
BEGIN
    payload := jsonb_build_object(
        'type', TG_OP,
        'table', TG_TABLE_NAME,
        'record', to_jsonb(NEW)
    );
    PERFORM net.http_post(
        url     := 'https://evv2000-website.vercel.app/api/notify',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', '<NOTIFY_SECRET>'),
        body    := payload,
        timeout_milliseconds := 5000
    );
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Benachrichtigung darf das Speichern nie verhindern
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_contact_messages ON public.contact_messages;
CREATE TRIGGER notify_contact_messages AFTER INSERT ON public.contact_messages
    FOR EACH ROW EXECUTE FUNCTION public.notify_admins();

DROP TRIGGER IF EXISTS notify_membership_applications ON public.membership_applications;
CREATE TRIGGER notify_membership_applications AFTER INSERT ON public.membership_applications
    FOR EACH ROW EXECUTE FUNCTION public.notify_admins();

DROP TRIGGER IF EXISTS notify_tournament_registrations ON public.tournament_registrations;
CREATE TRIGGER notify_tournament_registrations AFTER INSERT ON public.tournament_registrations
    FOR EACH ROW EXECUTE FUNCTION public.notify_admins();

-- Beach-Anfragen nur, wenn die Tabelle existiert
DO $$
BEGIN
    IF to_regclass('public.beach_bookings') IS NOT NULL THEN
        EXECUTE 'DROP TRIGGER IF EXISTS notify_beach_bookings ON public.beach_bookings';
        EXECUTE 'CREATE TRIGGER notify_beach_bookings AFTER INSERT ON public.beach_bookings FOR EACH ROW EXECUTE FUNCTION public.notify_admins()';
    END IF;
END $$;
