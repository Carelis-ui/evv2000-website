/* =============================================================================
   EVV 2000 — gemeinsame Helfer für Website und Admin
   - Mannschaftsnamen als Kurzform („Herren 1" → „1. Herren"), Hervorhebung 1. Herren
   - Termin-Titel mit Mannschaftspräfix
   - Adressen → Google-/Apple-Maps-Links (bekannte Hallen werden vervollständigt)
   ============================================================================= */
(function () {
    'use strict';

    /* Kurzform: „Herren 1"/„Männer 1" → „1. Herren", „Damen 2"/„Frauen 2" → „2. Damen" */
    function teamLabel(name) {
        if (!name) return '';
        var m = String(name).trim().match(/^(herren|männer|maenner|damen|frauen)\s*(\d)$/i);
        if (!m) return String(name).trim();
        var g = /herren|männer|maenner/i.test(m[1]) ? 'Herren' : 'Damen';
        return m[2] + '. ' + g;
    }

    /* 1. Herren (Erkelenzer Haie) wird farblich hervorgehoben */
    function isFirstMen(name) {
        return /^(herren|männer|maenner)\s*1$/i.test(String(name || '').trim());
    }

    /* „1. Herren: Heimspiel gegen X" — Präfix nur, wenn er nicht schon im Titel steht */
    function eventTitle(ev) {
        var title = (ev && ev.title) || '';
        var label = teamLabel(ev && ev.team_name);
        if (!label) return title;
        if (title.toLowerCase().indexOf(label.toLowerCase()) === 0) return title;
        return label + ': ' + title;
    }

    /* Bekannte Spielstätten → vollständige Adresse für Karten-Links */
    var PLACES = [
        { match: /erka[\s-]*halle|krefelder/i,                 address: 'Erka Halle, Krefelder Str. 8a, 41812 Erkelenz' },
        { match: /luise[\s-]*hensel|salierring/i,              address: 'Luise-Hensel-Grundschule, Salierring 255, 41812 Erkelenz' },
        { match: /karl[\s-]*fischer|schulring/i,               address: 'Karl-Fischer-Halle, Schulring 38, 41812 Erkelenz' },
        { match: /beach(anlage)?|erka beach/i,                 address: 'ERKA Beach, Schulring 38, 41812 Erkelenz' }
    ];
    function resolveAddress(location) {
        var loc = String(location || '').trim();
        if (!loc) return '';
        var hasStreet = /\d{5}\s+\S/.test(loc) || /(str\.|straße|strasse|weg|ring|platz|allee)\s*\d/i.test(loc);
        if (hasStreet) return loc;
        for (var i = 0; i < PLACES.length; i++) if (PLACES[i].match.test(loc)) return PLACES[i].address;
        return /erkelenz/i.test(loc) ? loc : loc + ', Erkelenz';
    }
    function mapsLinks(location) {
        var address = resolveAddress(location);
        if (!address) return null;
        var q = encodeURIComponent(address);
        return {
            address: address,
            google: 'https://www.google.com/maps/search/?api=1&query=' + q,
            apple: 'https://maps.apple.com/?q=' + q
        };
    }

    window.EVV = { teamLabel: teamLabel, isFirstMen: isFirstMen, eventTitle: eventTitle, mapsLinks: mapsLinks, resolveAddress: resolveAddress };
})();
