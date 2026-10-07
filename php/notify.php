<?php
// Benachrichtigt Admins per E-Mail, wenn ein Formular ausgefüllt wurde.
// Aufgerufen wird das von Supabase (Datenbank-Trigger, siehe
// supabase-migration-v11-benachrichtigungen-allinkl.sql).
//
// Die Empfängerliste bestimmt die Datenbank selbst — abhängig von den Häkchen
// unter Verwaltung → E-Mail-Benachrichtigungen. Diese Datei verschickt nur.
//
// Das gemeinsame Geheimnis steht in notify-secret.php. Die Datei liegt NICHT im
// Repository (öffentlich auf GitHub) und muss einmalig per FTP hochgeladen werden,
// Vorlage: notify-secret.example.php.

const MAIL_FROM   = 'no-reply@evv2000.de';
const SITE_URL    = 'https://www.evv2000.de';
const MAX_EMPFAENGER = 25;

function fail(int $code, string $text): void
{
    http_response_code($code);
    header('Content-Type: text/plain; charset=utf-8');
    echo $text;
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') fail(405, 'Nur POST');

$secretFile = __DIR__ . '/notify-secret.php';
if (!is_file($secretFile)) fail(500, 'notify-secret.php fehlt auf dem Server');
$secret = (string) (include $secretFile);
if ($secret === '') fail(500, 'Geheimnis ist leer');

$gesendetesGeheimnis = $_SERVER['HTTP_X_NOTIFY_SECRET'] ?? '';
if (!hash_equals($secret, (string) $gesendetesGeheimnis)) fail(401, 'Nicht autorisiert');

$body = json_decode(file_get_contents('php://input') ?: '', true);
if (!is_array($body)) fail(400, 'Ungültiges JSON');

$topic  = (string) ($body['topic'] ?? '');
$table  = (string) ($body['table'] ?? '');
$record = is_array($body['record'] ?? null) ? $body['record'] : [];

// Empfänger prüfen: nur saubere Adressen, Anzahl begrenzt
$empfaenger = [];
foreach ((array) ($body['recipients'] ?? []) as $mail) {
    $mail = trim((string) $mail);
    if ($mail !== '' && filter_var($mail, FILTER_VALIDATE_EMAIL) && !preg_match('/[\r\n]/', $mail)) {
        $empfaenger[$mail] = true;
    }
}
$empfaenger = array_slice(array_keys($empfaenger), 0, MAX_EMPFAENGER);
if (!$empfaenger) fail(400, 'Keine gültigen Empfänger');

$TOPIC_LABEL = [
    'kontakt_probetraining'  => 'Probetraining',
    'kontakt_mitgliedschaft' => 'Frage Mitgliedschaft',
    'kontakt_mannschaften'   => 'Frage Mannschaften',
    'kontakt_beachanlage'    => 'Frage Beachanlage',
    'kontakt_sponsoring'     => 'Sponsoring',
    'kontakt_turniere'       => 'Frage Turniere/Events',
    'kontakt_sonstiges'      => 'Sonstige Anfragen',
    'antrag_mitglied'        => 'Mitgliedsanträge',
    'anmeldung_turnier'      => 'Turnieranmeldungen',
    'buchung_beach'          => 'Beach-Buchungen',
];

function wert($r, string $key): string
{
    $v = $r[$key] ?? '';
    return is_scalar($v) ? trim((string) $v) : '';
}

function datumDE(string $iso): string
{
    if ($iso === '') return '';
    $t = strtotime($iso);
    return $t ? date('d.m.Y', $t) : $iso;
}

// Betreff, Einleitung, Felder und Ziel-Seite je Formular
switch ($table) {
    case 'contact_messages':
        $istProbe = wert($record, 'subject') === 'probetraining';
        $betreff  = $istProbe
            ? 'Neue Probetraining-Anfrage: ' . wert($record, 'name')
            : 'Neue Kontaktanfrage (' . (wert($record, 'subject') ?: 'Allgemein') . '): ' . wert($record, 'name');
        $intro  = 'Über das Kontaktformular ist eine neue Nachricht eingegangen.';
        $felder = [
            ['Name', wert($record, 'name')],
            ['E-Mail', wert($record, 'email')],
            ['Betreff', wert($record, 'subject')],
            ['Nachricht', wert($record, 'message')],
        ];
        $link = SITE_URL . '/admin/anfragen.html';
        break;

    case 'membership_applications':
        // Bewusst ohne Bankdaten — die gehören nicht in eine E-Mail.
        $name    = trim(wert($record, 'vorname') . ' ' . wert($record, 'nachname'));
        $betreff = 'Neuer Mitgliedsantrag: ' . $name;
        $intro   = 'Ein neuer Mitgliedsantrag wurde über die Website gestellt. Die vollständigen Angaben stehen im Admin-Panel.';
        $felder  = [
            ['Name', $name],
            ['Geburtsdatum', datumDE(wert($record, 'geburtsdatum'))],
            ['E-Mail', wert($record, 'email')],
            ['Telefon', wert($record, 'telefon') ?: wert($record, 'mobil')],
            ['Beitragsgruppe', wert($record, 'mitgliedschaft')],
            ['Mannschaft', wert($record, 'mannschaft')],
            ['Zahlungsart', !empty($record['consent_sepa']) ? 'SEPA-Lastschrift' : 'Rechnung'],
        ];
        $link = SITE_URL . '/admin/anfragen.html#antraege';
        break;

    case 'tournament_registrations':
        $betreff = 'Neue Turnieranmeldung: ' . wert($record, 'team_name');
        $intro   = 'Ein Team hat sich für ein Turnier angemeldet.';
        $felder  = [
            ['Team', wert($record, 'team_name')],
            ['Kontakt', wert($record, 'contact_name')],
            ['E-Mail', wert($record, 'contact_email')],
            ['Telefon', wert($record, 'contact_phone')],
            ['Spieler', wert($record, 'player_count')],
            ['Anmerkungen', wert($record, 'notes')],
        ];
        $link = SITE_URL . '/admin/registrations.html';
        break;

    case 'beach_bookings':
        $betreff = 'Neue Beach-Anfrage: ' . (wert($record, 'name') ?: wert($record, 'contact_name'));
        $intro   = 'Es gibt eine neue Anfrage für die Beachanlage.';
        $felder  = [
            ['Name', wert($record, 'name') ?: wert($record, 'contact_name')],
            ['E-Mail', wert($record, 'email') ?: wert($record, 'contact_email')],
            ['Datum', datumDE(wert($record, 'date'))],
            ['Zeit', wert($record, 'time_start')],
            ['Nachricht', wert($record, 'message') ?: wert($record, 'notes')],
        ];
        $link = SITE_URL . '/admin/beach.html';
        break;

    default:
        fail(200, 'Tabelle nicht abonniert: ' . $table);
}

$zeilen = [$intro, ''];
foreach ($felder as [$label, $v]) {
    if ($v !== '') $zeilen[] = $label . ': ' . $v;
}
$zeilen[] = '';
$zeilen[] = 'Im Admin-Panel öffnen: ' . $link;
$zeilen[] = '';
$zeilen[] = 'Diese Mail geht an dich, weil für dein Admin-Konto die Kategorie "'
    . ($TOPIC_LABEL[$topic] ?? $topic) . '" aktiviert ist (Admin-Panel → Verwaltung).';
$text = implode("\n", $zeilen);

// Zeilenumbrüche aus dem Betreff entfernen (sonst ließen sich Header einschleusen)
$betreff = trim(preg_replace('/[\r\n]+/', ' ', '[EVV] ' . $betreff));
$betreffKodiert = '=?UTF-8?B?' . base64_encode($betreff) . '?=';

$headers = implode("\r\n", [
    'From: EVV 2000 <' . MAIL_FROM . '>',
    'Reply-To: ' . MAIL_FROM,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    'X-Mailer: PHP/' . phpversion(),
]);

$ok = 0;
foreach ($empfaenger as $mail) {
    if (mail($mail, $betreffKodiert, $text, $headers)) $ok++;
}

header('Content-Type: application/json; charset=utf-8');
echo json_encode(['sent' => $ok, 'of' => count($empfaenger), 'topic' => $topic]);
