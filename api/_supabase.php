<?php
// Gemeinsame Supabase-Grundlage für die PHP-Varianten (Hoster ohne Node, z.B. ALL-INKL).
// Diese Datei gibt selbst nichts aus und wird von config.php und calendar.ics.php eingebunden.
//
// Der Anon-Key ist bewusst öffentlich: Er wird ohnehin an jeden Besucher ausgeliefert,
// der Zugriff wird über Row Level Security in Supabase geregelt.
// Der Service-Role-Key gehört NIEMALS hierhin.

const SUPABASE_URL      = 'https://akaheobpxywjuuucewkw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFrYWhlb2JweHl3anV1dWNld2t3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyNjUxMzAsImV4cCI6MjA5NDg0MTEzMH0.Qn6DIAaQQ8JRaB3CuFpJ5IpyAJzGvPtWtUtEiszHb-Y';

/** Liest eine öffentliche View/Tabelle über die Supabase-REST-API. */
function supabase_get(string $path, string $query = ''): array
{
    $url = rtrim(SUPABASE_URL, '/') . '/rest/v1/' . ltrim($path, '/');
    if ($query !== '') $url .= '?' . ltrim($query, '?');

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 15,
        CURLOPT_HTTPHEADER     => [
            'apikey: ' . SUPABASE_ANON_KEY,
            'Authorization: Bearer ' . SUPABASE_ANON_KEY,
            'Accept: application/json',
        ],
    ]);
    $body   = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err    = curl_error($ch);
    curl_close($ch);

    if ($body === false) throw new RuntimeException('Supabase nicht erreichbar: ' . $err);
    if ($status >= 400)  throw new RuntimeException('Supabase HTTP ' . $status);

    $data = json_decode($body, true);
    return is_array($data) ? $data : [];
}
