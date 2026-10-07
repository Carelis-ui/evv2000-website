<?php
// VORLAGE — als notify-secret.php (ohne .example) per FTP nach php/ hochladen
// und den Platzhalter durch das eigene Geheimnis ersetzen.
//
// Derselbe Wert muss in supabase-migration-v11-benachrichtigungen-allinkl.sql stehen,
// bevor diese im Supabase-SQL-Editor ausgeführt wird.
//
// Niemals ins Repository übernehmen: GitHub ist öffentlich.
// notify-secret.php steht deshalb in .gitignore und wird vom Deploy nicht angefasst.

return 'HIER-DAS-GEHEIMNIS-EINSETZEN';
