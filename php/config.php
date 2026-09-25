<?php
// Gegenstück zu api/config.js für Hoster ohne Node (ALL-INKL).
// Liefert dem Browser die öffentliche Supabase-Konfiguration.
// Die Werte stehen in _supabase.php.

require __DIR__ . '/_supabase.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: public, max-age=300');

echo json_encode([
    'supabaseUrl'     => SUPABASE_URL,
    'supabaseAnonKey' => SUPABASE_ANON_KEY,
]);
