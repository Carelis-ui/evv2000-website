// RFC-5545 iCalendar Feed für den EVV-2000 Vereinskalender.
// Wird von Google Calendar / Apple Calendar / Outlook / Thunderbird per URL abonniert.
// Datenquelle: Supabase-View public_calendar. Zugang: Anon-Key (bereits öffentlich per RLS).

const CONFIG_URL = 'https://erka-beach.vercel.app/api/config';
const CAL_NAME = 'EVV 2000 - Vereinskalender';
const CAL_DOMAIN = 'evv2000.de';

const TYPE_LABEL = {
    spiel: 'Spiel',
    turnier: 'Turnier',
    event: 'Event',
    training: 'Training'
};

function esc(v) {
    if (v == null) return '';
    return String(v)
        .replace(/\\/g, '\\\\')
        .replace(/;/g, '\\;')
        .replace(/,/g, '\\,')
        .replace(/\r?\n/g, '\\n');
}

// RFC-5545: Zeilen dürfen max 75 Oktette lang sein — Rest wird mit CRLF + Leerzeichen umgebrochen
function fold(line) {
    if (line.length <= 75) return line;
    var out = line.slice(0, 75);
    var rest = line.slice(75);
    while (rest.length > 74) { out += '\r\n ' + rest.slice(0, 74); rest = rest.slice(74); }
    if (rest.length) out += '\r\n ' + rest;
    return out;
}

function pad(n) { return String(n).padStart(2, '0'); }

function stampUtc(d) {
    return d.getUTCFullYear() +
        pad(d.getUTCMonth() + 1) +
        pad(d.getUTCDate()) + 'T' +
        pad(d.getUTCHours()) +
        pad(d.getUTCMinutes()) +
        pad(d.getUTCSeconds()) + 'Z';
}

function dateOnly(iso) { return iso.replace(/-/g, ''); }
function dateAdd(iso, days) {
    var d = new Date(iso + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + days);
    return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate());
}

function dateTimeLocal(iso, hhmm) {
    var parts = hhmm.split(':');
    return dateOnly(iso) + 'T' + pad(parts[0] || '00') + pad(parts[1] || '00') + '00';
}

function buildEvent(ev, nowStamp) {
    var lines = ['BEGIN:VEVENT'];
    var uid = (ev.id || Math.random().toString(36).slice(2)) + '@' + CAL_DOMAIN;
    lines.push('UID:' + uid);
    lines.push('DTSTAMP:' + nowStamp);

    if (ev.time_start) {
        lines.push('DTSTART;TZID=Europe/Berlin:' + dateTimeLocal(ev.date, ev.time_start));
        var endDate = ev.date_end || ev.date;
        var endTime = ev.time_end || ev.time_start;
        var endMin = parseInt((ev.time_end || ev.time_start || '00:00').split(':')[1] || '0', 10);
        // Ohne Endzeit: 2h-Default, damit der Termin nicht 0 Minuten lang ist
        if (!ev.time_end) {
            var parts = ev.time_start.split(':');
            var hh = parseInt(parts[0] || '0', 10) + 2;
            endTime = pad(hh) + ':' + pad(endMin);
        }
        lines.push('DTEND;TZID=Europe/Berlin:' + dateTimeLocal(endDate, endTime));
    } else {
        // Ganztägiger Termin (DTEND ist exklusiv → +1 Tag)
        lines.push('DTSTART;VALUE=DATE:' + dateOnly(ev.date));
        var endIso = ev.date_end || ev.date;
        lines.push('DTEND;VALUE=DATE:' + dateAdd(endIso, 1));
    }

    var title = ev.title || 'Termin';
    if (ev.team_name) title = '[' + ev.team_name + '] ' + title;
    lines.push(fold('SUMMARY:' + esc(title)));

    var descParts = [];
    if (ev.event_type) descParts.push(TYPE_LABEL[ev.event_type] || ev.event_type);
    if (ev.opponent) descParts.push((ev.is_home ? 'Heim gegen ' : 'Auswärts gegen ') + ev.opponent);
    if (ev.description) descParts.push(ev.description);
    descParts.push('— EVV 2000 · https://evv2000-website.vercel.app/kalender');
    lines.push(fold('DESCRIPTION:' + esc(descParts.join('\n\n'))));

    if (ev.location) lines.push(fold('LOCATION:' + esc(ev.location)));
    if (ev.event_type) lines.push('CATEGORIES:' + esc(TYPE_LABEL[ev.event_type] || ev.event_type));

    lines.push('END:VEVENT');
    return lines.join('\r\n');
}

// Minimal-VTIMEZONE für Europe/Berlin — genügt gängigen Kalender-Clients
function berlinTz() {
    return [
        'BEGIN:VTIMEZONE',
        'TZID:Europe/Berlin',
        'X-LIC-LOCATION:Europe/Berlin',
        'BEGIN:DAYLIGHT',
        'TZOFFSETFROM:+0100',
        'TZOFFSETTO:+0200',
        'TZNAME:CEST',
        'DTSTART:19700329T020000',
        'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
        'END:DAYLIGHT',
        'BEGIN:STANDARD',
        'TZOFFSETFROM:+0200',
        'TZOFFSETTO:+0100',
        'TZNAME:CET',
        'DTSTART:19701025T030000',
        'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
        'END:STANDARD',
        'END:VTIMEZONE'
    ].join('\r\n');
}

module.exports = async function handler(req, res) {
    try {
        var cfgRes = await fetch(CONFIG_URL);
        if (!cfgRes.ok) throw new Error('Config-Endpoint HTTP ' + cfgRes.status);
        var cfg = await cfgRes.json();
        if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) throw new Error('Supabase nicht konfiguriert');

        var evRes = await fetch(cfg.supabaseUrl + '/rest/v1/public_calendar?select=*&order=date.asc', {
            headers: {
                apikey: cfg.supabaseAnonKey,
                Authorization: 'Bearer ' + cfg.supabaseAnonKey,
                Accept: 'application/json'
            }
        });
        if (!evRes.ok) throw new Error('Supabase HTTP ' + evRes.status);
        var events = await evRes.json();
        if (!Array.isArray(events)) events = [];

        var now = new Date();
        var nowStamp = stampUtc(now);

        var head = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//EVV 2000//Vereinskalender//DE',
            'CALSCALE:GREGORIAN',
            'METHOD:PUBLISH',
            fold('X-WR-CALNAME:' + CAL_NAME),
            fold('NAME:' + CAL_NAME),
            'X-WR-TIMEZONE:Europe/Berlin',
            'X-PUBLISHED-TTL:PT30M',
            'REFRESH-INTERVAL;VALUE=DURATION:PT30M'
        ].join('\r\n');

        var bodyLines = events.map(function (ev) { return buildEvent(ev, nowStamp); });
        var ical = head + '\r\n' + berlinTz() + '\r\n' + bodyLines.join('\r\n') + '\r\nEND:VCALENDAR\r\n';

        res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
        res.setHeader('Content-Disposition', 'inline; filename="evv2000.ics"');
        res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.status(200).send(ical);
    } catch (e) {
        res.status(500).send('iCal-Feed konnte nicht erstellt werden: ' + (e.message || e));
    }
};
