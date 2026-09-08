// E-Mail-Benachrichtigungen für das Admin-Panel.
// Supabase ruft diese Funktion per Database-Webhook auf (INSERT in contact_messages,
// membership_applications, tournament_registrations, beach_bookings). Benachrichtigt werden
// nur aktive Admins, die die passende Berechtigung haben (oder Superadmins).
//
// Benötigte Environment-Variablen im Vercel-Projekt:
//   NOTIFY_SECRET              – frei gewähltes Geheimnis, muss im Webhook-Header x-notify-secret stehen
//   SUPABASE_URL               – https://<projekt>.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY  – Service-Role-Key (nur serverseitig!)
//   RESEND_API_KEY             – API-Key von resend.com
//   MAIL_FROM                  – Absender, z.B. "EVV 2000 Admin <admin@evv2000.de>" (Domain bei Resend verifizieren)
//   SITE_URL (optional)        – Basis-URL der Website, Standard https://evv2000-website.vercel.app

const SITE = process.env.SITE_URL || 'https://evv2000-website.vercel.app';

const PERM_LABEL = {
    anfragen: 'Anfragen & Anträge',
    registrations: 'Anmeldungen',
    beach: 'Beachanlage',
    members: 'Mitglieder'
};

function esc(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function line(label, value) {
    if (value === null || value === undefined || value === '') return '';
    return '<tr><td style="padding:4px 12px 4px 0;color:#64748b;white-space:nowrap;vertical-align:top">' + esc(label) + '</td><td style="padding:4px 0;color:#0f172a">' + esc(value).replace(/\n/g, '<br>') + '</td></tr>';
}
function fmtDate(d) {
    if (!d) return '';
    var x = new Date(d);
    return isNaN(x) ? String(d) : x.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/* Welche Tabelle → welche Berechtigung, welcher Betreff, welche Details */
function describe(table, r) {
    r = r || {};
    switch (table) {
        case 'contact_messages': {
            var probe = r.subject === 'probetraining';
            return {
                perm: 'anfragen',
                subject: probe ? 'Neue Probetraining-Anfrage: ' + r.name : 'Neue Kontaktanfrage (' + (r.subject || 'Allgemein') + '): ' + r.name,
                intro: probe ? 'Jemand möchte zum Probetraining kommen.' : 'Über das Kontaktformular ist eine neue Nachricht eingegangen.',
                rows: [['Name', r.name], ['E-Mail', r.email], ['Betreff', r.subject], ['Nachricht', r.message]],
                link: SITE + '/admin/anfragen'
            };
        }
        case 'membership_applications':
            return {
                perm: 'anfragen',
                subject: 'Neuer Mitgliedsantrag: ' + [r.vorname, r.nachname].filter(Boolean).join(' '),
                intro: 'Ein neuer Mitgliedsantrag wurde über die Website gestellt.',
                rows: [['Name', [r.vorname, r.nachname].filter(Boolean).join(' ')], ['Geburtsdatum', fmtDate(r.geburtsdatum)], ['E-Mail', r.email],
                       ['Telefon', r.telefon || r.mobil], ['Beitragsgruppe', r.mitgliedschaft], ['Mannschaft', r.mannschaft], ['Eintritt', fmtDate(r.eintritt)]],
                link: SITE + '/admin/anfragen#antraege'
            };
        case 'tournament_registrations':
            return {
                perm: 'registrations',
                subject: 'Neue Turnieranmeldung: ' + r.team_name,
                intro: 'Ein Team hat sich für ein Turnier angemeldet.',
                rows: [['Team', r.team_name], ['Kontakt', r.contact_name], ['E-Mail', r.contact_email], ['Telefon', r.contact_phone], ['Spieler', r.player_count], ['Anmerkungen', r.notes]],
                link: SITE + '/admin/registrations'
            };
        case 'beach_bookings':
            return {
                perm: 'beach',
                subject: 'Neue Beach-Anfrage: ' + (r.name || r.contact_name || ''),
                intro: 'Es gibt eine neue Anfrage für die Beachanlage.',
                rows: [['Name', r.name || r.contact_name], ['E-Mail', r.email || r.contact_email], ['Datum', fmtDate(r.date)], ['Zeit', r.time_start ? r.time_start + (r.time_end ? '–' + r.time_end : '') : ''], ['Nachricht', r.message || r.notes]],
                link: SITE + '/admin/beach'
            };
        default:
            return null;
    }
}

async function readJson(req) {
    if (req.body && typeof req.body === 'object') return req.body;
    var raw = '';
    for await (const chunk of req) raw += chunk;
    return raw ? JSON.parse(raw) : {};
}

module.exports = async function (req, res) {
    if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }
    var secret = process.env.NOTIFY_SECRET;
    if (!secret || req.headers['x-notify-secret'] !== secret) { res.status(401).json({ error: 'unauthorized' }); return; }

    var missing = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'RESEND_API_KEY', 'MAIL_FROM'].filter(function (k) { return !process.env[k]; });
    if (missing.length) { res.status(500).json({ error: 'Konfiguration fehlt: ' + missing.join(', ') }); return; }

    var body;
    try { body = await readJson(req); } catch (e) { res.status(400).json({ error: 'invalid json' }); return; }
    if ((body.type || 'INSERT') !== 'INSERT') { res.status(200).json({ skipped: 'nur INSERT' }); return; }

    var info = describe(body.table, body.record);
    if (!info) { res.status(200).json({ skipped: 'Tabelle nicht abonniert: ' + body.table }); return; }

    // Empfänger: aktive Admins mit passender Berechtigung (Superadmins immer)
    var url = process.env.SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/admins?select=email,name,role,permissions,is_active';
    var aRes = await fetch(url, { headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE_KEY } });
    if (!aRes.ok) { res.status(502).json({ error: 'Admins konnten nicht geladen werden (' + aRes.status + ')' }); return; }
    var admins = await aRes.json();
    var recipients = admins.filter(function (a) {
        if (a.is_active === false || !a.email) return false;
        if (a.role === 'superadmin') return true;
        return Array.isArray(a.permissions) && a.permissions.indexOf(info.perm) !== -1;
    }).map(function (a) { return a.email; });
    recipients = recipients.filter(function (e, i) { return recipients.indexOf(e) === i; });
    if (!recipients.length) { res.status(200).json({ sent: 0, reason: 'keine Empfänger mit Berechtigung ' + info.perm }); return; }

    var html =
        '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#0f172a;max-width:560px">' +
        '<p style="margin:0 0 6px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#3b82f6">EVV 2000 · Admin-Benachrichtigung · ' + esc(PERM_LABEL[info.perm] || info.perm) + '</p>' +
        '<h2 style="margin:0 0 12px;font-size:20px">' + esc(info.subject) + '</h2>' +
        '<p style="margin:0 0 14px;color:#334155">' + esc(info.intro) + '</p>' +
        '<table style="border-collapse:collapse;font-size:14px">' + info.rows.map(function (r) { return line(r[0], r[1]); }).join('') + '</table>' +
        '<p style="margin:18px 0 0"><a href="' + info.link + '" style="display:inline-block;padding:10px 16px;background:#101e38;color:#fff;text-decoration:none;border-radius:8px">Im Admin-Panel öffnen</a></p>' +
        '<p style="margin:18px 0 0;font-size:12px;color:#94a3b8">Du bekommst diese Mail, weil dein Admin-Konto die Berechtigung „' + esc(PERM_LABEL[info.perm] || info.perm) + '“ hat.</p>' +
        '</div>';
    var text = info.subject + '\n\n' + info.intro + '\n\n' + info.rows.filter(function (r) { return r[1]; }).map(function (r) { return r[0] + ': ' + r[1]; }).join('\n') + '\n\n' + info.link;

    var mRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: process.env.MAIL_FROM, to: recipients, subject: '[EVV Admin] ' + info.subject, html: html, text: text })
    });
    var mBody = await mRes.text();
    if (!mRes.ok) { res.status(502).json({ error: 'Mailversand fehlgeschlagen', detail: mBody.slice(0, 300) }); return; }
    res.status(200).json({ sent: recipients.length, perm: info.perm });
};
