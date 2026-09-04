-- ============================================================
-- Daten: Kader Herren 1 mit Spielerfotos (Saison 2026/27)
--
-- Setzt die Spielerliste der Herren 1 neu — Namen, Positionen und
-- Trikotnummern bleiben wie bisher, neu sind die Foto-Pfade
-- (image = Portrait, image2 = Foto mit Ball, erscheint beim Hover).
-- Die Bilder liegen im Repo unter img/spieler/herren-1/.
--
-- Ohne Foto (noch nachzureichen): Chris, Phil, Florian.
-- Trainer Arash wird als letzte Karte ohne Nummer angezeigt.
--
-- Im Supabase SQL-Editor ausführen. Kann gefahrlos wiederholt werden.
-- ============================================================

UPDATE teams
SET players = '[
  {"name": "Leon",      "role": "Libero",       "number": 1,  "image": "img/spieler/herren-1/leon.jpg",      "image2": "img/spieler/herren-1/leon-2.jpg"},
  {"name": "Theo",      "role": "Diagonal",     "number": 2,  "image": "img/spieler/herren-1/theo.jpg",      "image2": "img/spieler/herren-1/theo-2.jpg"},
  {"name": "Finn",      "role": "Zuspiel",      "number": 3,  "image": "img/spieler/herren-1/finn.jpg",      "image2": "img/spieler/herren-1/finn-2.jpg"},
  {"name": "Chris",     "role": "Mittelblock",  "number": 4},
  {"name": "Daniel",    "role": "Zuspiel",      "number": 5,  "image": "img/spieler/herren-1/daniel.jpg",    "image2": "img/spieler/herren-1/daniel-2.jpg"},
  {"name": "Lennart",   "role": "Außenangriff", "number": 6,  "image": "img/spieler/herren-1/lennart.jpg",   "image2": "img/spieler/herren-1/lennart-2.jpg"},
  {"name": "Timo",      "role": "Mittelblock",  "number": 7,  "image": "img/spieler/herren-1/timo.jpg",      "image2": "img/spieler/herren-1/timo-2.jpg"},
  {"name": "Jona",      "role": "Mittelblock",  "number": 8,  "image": "img/spieler/herren-1/jona.jpg",      "image2": "img/spieler/herren-1/jona-2.jpg"},
  {"name": "Sebastian", "role": "Außenangriff", "number": 9,  "image": "img/spieler/herren-1/sebastian.jpg", "image2": "img/spieler/herren-1/sebastian-2.jpg"},
  {"name": "Peter",     "role": "Diagonal",     "number": 10, "image": "img/spieler/herren-1/peter.jpg",     "image2": "img/spieler/herren-1/peter-2.jpg"},
  {"name": "Oleksandr", "role": "Mittelblock",  "number": 11, "image": "img/spieler/herren-1/oleksandr.jpg", "image2": "img/spieler/herren-1/oleksandr-2.jpg"},
  {"name": "Simon",     "role": "Außenangriff", "number": 12, "image": "img/spieler/herren-1/simon.jpg",     "image2": "img/spieler/herren-1/simon-2.jpg"},
  {"name": "Oliver",    "role": "Libero",       "number": 13, "image": "img/spieler/herren-1/oliver.jpg",    "image2": "img/spieler/herren-1/oliver-2.jpg"},
  {"name": "Phil",      "role": "Außenangriff", "number": 15},
  {"name": "Florian",   "role": "Außenangriff", "number": 20},
  {"name": "Arash Zamani Dehkordi", "role": "Trainer", "number": null, "image": "img/spieler/herren-1/arash.jpg", "image2": "img/spieler/herren-1/arash-2.jpg"}
]'::jsonb
WHERE slug = 'maenner-1';

-- Kontrolle: sollte 16 Einträge (15 Spieler + Trainer) zeigen
SELECT name, jsonb_array_length(players) AS kader_groesse FROM teams WHERE slug = 'maenner-1';


-- ------------------------------------------------------------
-- Teambild Herren 1: echtes Teamfoto „Erkelenzer Haie 26/27"
-- ersetzt das bisherige KI-Poster (Datei liegt im Repo unter img/).
-- ------------------------------------------------------------
UPDATE teams SET image_url = 'img/team-haie-26-27.jpg' WHERE slug = 'maenner-1';
