<?php
// Gegenstück zu api/calendar.ics.js für Hoster ohne Node (ALL-INKL).
// iCalendar-Feed (RFC 5545) des Vereinskalenders, abonnierbar in Google/Apple/Outlook.
// Datenquelle: Supabase-View public_calendar über den öffentlichen Anon-Key.

require __DIR__ . '/_supabase.php';

const CAL_NAME   = 'EVV 2000 - Vereinskalender';
const CAL_DOMAIN = 'evv2000.de';

$TYPE_LABEL = [
    'spiel'    => 'Spiel',
    'turnier'  => 'Turnier',
    'event'    => 'Event',
    'training' => 'Training',
];

function ics_esc($v): string
{
    if ($v === null) return '';
    $v = str_replace('\\', '\\\\', (string) $v);
    $v = str_replace(';', '\\;', $v);
    $v = str_replace(',', '\\,', $v);
    return preg_replace('/\r?\n/', '\\n', $v);
}

// RFC 5545: Zeilen umbrechen. Es wird zeichenweise getrennt, damit UTF-8 heil bleibt.
function ics_fold(string $line): string
{
    if (mb_strlen($line) <= 75) return $line;
    $out  = mb_substr($line, 0, 75);
    $rest = mb_substr($line, 75);
    while (mb_strlen($rest) > 74) {
        $out .= "\r\n " . mb_substr($rest, 0, 74);
        $rest = mb_substr($rest, 74);
    }
    if (mb_strlen($rest)) $out .= "\r\n " . $rest;
    return $out;
}

function ics_date_only(string $iso): string
{
    return str_replace('-', '', $iso);
}

function ics_date_add(string $iso, int $days): string
{
    $d = new DateTime($iso . ' 00:00:00', new DateTimeZone('UTC'));
    $d->modify(($days >= 0 ? '+' : '') . $days . ' days');
    return $d->format('Ymd');
}

function ics_date_time_local(string $iso, string $hhmm): string
{
    $parts = explode(':', $hhmm);
    return ics_date_only($iso) . 'T'
        . str_pad($parts[0] ?? '00', 2, '0', STR_PAD_LEFT)
        . str_pad($parts[1] ?? '00', 2, '0', STR_PAD_LEFT)
        . '00';
}

function ics_event(array $ev, string $nowStamp, array $typeLabel): string
{
    $lines = ['BEGIN:VEVENT'];
    $lines[] = 'UID:' . (($ev['id'] ?? bin2hex(random_bytes(8))) . '@' . CAL_DOMAIN);
    $lines[] = 'DTSTAMP:' . $nowStamp;

    $date = $ev['date'] ?? null;
    if (!$date) return '';

    if (!empty($ev['time_start'])) {
        $lines[] = 'DTSTART;TZID=Europe/Berlin:' . ics_date_time_local($date, $ev['time_start']);
        $endDate = ($ev['date_end'] ?? null) ?: $date;
        $endTime = ($ev['time_end'] ?? null) ?: $ev['time_start'];
        if (empty($ev['time_end'])) {
            // Ohne Endzeit: 2h-Default, damit der Termin nicht 0 Minuten lang ist
            $parts   = explode(':', $ev['time_start']);
            $hh      = ((int) ($parts[0] ?? 0)) + 2;
            $mm      = (int) ($parts[1] ?? 0);
            $endTime = str_pad((string) $hh, 2, '0', STR_PAD_LEFT) . ':' . str_pad((string) $mm, 2, '0', STR_PAD_LEFT);
        }
        $lines[] = 'DTEND;TZID=Europe/Berlin:' . ics_date_time_local($endDate, $endTime);
    } else {
        // Ganztägiger Termin (DTEND ist exklusiv → +1 Tag)
        $lines[] = 'DTSTART;VALUE=DATE:' . ics_date_only($date);
        $lines[] = 'DTEND;VALUE=DATE:' . ics_date_add(($ev['date_end'] ?? null) ?: $date, 1);
    }

    $title = ($ev['title'] ?? null) ?: 'Termin';
    if (!empty($ev['team_name'])) $title = '[' . $ev['team_name'] . '] ' . $title;
    $lines[] = ics_fold('SUMMARY:' . ics_esc($title));

    $desc = [];
    if (!empty($ev['event_type'])) $desc[] = $typeLabel[$ev['event_type']] ?? $ev['event_type'];
    if (!empty($ev['opponent']))   $desc[] = (!empty($ev['is_home']) ? 'Heimspiel gegen ' : 'Auswärtsspiel bei ') . $ev['opponent'];
    if (!empty($ev['description'])) $desc[] = $ev['description'];
    $desc[] = '— EVV 2000 · https://evv2000.de/kalender.html';
    $lines[] = ics_fold('DESCRIPTION:' . ics_esc(implode("\n\n", $desc)));

    if (!empty($ev['location']))   $lines[] = ics_fold('LOCATION:' . ics_esc($ev['location']));
    if (!empty($ev['event_type'])) $lines[] = 'CATEGORIES:' . ics_esc($typeLabel[$ev['event_type']] ?? $ev['event_type']);

    $lines[] = 'END:VEVENT';
    return implode("\r\n", $lines);
}

// Minimal-VTIMEZONE für Europe/Berlin — genügt gängigen Kalender-Clients
function ics_berlin_tz(): string
{
    return implode("\r\n", [
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
        'END:VTIMEZONE',
    ]);
}

try {
    $events = supabase_get('public_calendar', 'select=*&order=date.asc');

    $nowStamp = (new DateTime('now', new DateTimeZone('UTC')))->format('Ymd\THis\Z');

    $head = implode("\r\n", [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//EVV 2000//Vereinskalender//DE',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        ics_fold('X-WR-CALNAME:' . CAL_NAME),
        ics_fold('NAME:' . CAL_NAME),
        'X-WR-TIMEZONE:Europe/Berlin',
        'X-PUBLISHED-TTL:PT30M',
        'REFRESH-INTERVAL;VALUE=DURATION:PT30M',
    ]);

    $body = [];
    foreach ($events as $ev) {
        $line = ics_event($ev, $nowStamp, $TYPE_LABEL);
        if ($line !== '') $body[] = $line;
    }

    $ical = $head . "\r\n" . ics_berlin_tz() . "\r\n" . implode("\r\n", $body) . "\r\nEND:VCALENDAR\r\n";

    header('Content-Type: text/calendar; charset=utf-8');
    header('Content-Disposition: inline; filename="evv2000.ics"');
    header('Cache-Control: public, max-age=300');
    header('Access-Control-Allow-Origin: *');
    echo $ical;
} catch (Throwable $e) {
    http_response_code(500);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'iCal-Feed konnte nicht erstellt werden: ' . $e->getMessage();
}
