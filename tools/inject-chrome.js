#!/usr/bin/env node
/* Fügt partials/header.html und partials/footer.html in alle Seiten im Projekt-Root ein.
   Die Seiten enthalten Marker:
     <!-- @chrome:header --> … <!-- @chrome:/header -->
     <!-- @chrome:footer --> … <!-- @chrome:/footer -->
   Alles zwischen den Markern wird durch den aktuellen Partial-Inhalt ersetzt (idempotent).
   Aufruf: node tools/inject-chrome.js            */
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const header = fs.readFileSync(path.join(root, 'partials', 'header.html'), 'utf8').trim();
const footer = fs.readFileSync(path.join(root, 'partials', 'footer.html'), 'utf8').trim();

const files = fs.readdirSync(root).filter(f => f.endsWith('.html'));
let changed = 0, withMarkers = 0;
for (const f of files) {
    const p = path.join(root, f);
    const before = fs.readFileSync(p, 'utf8');
    let after = before;
    if (/<!-- @chrome:header -->/.test(after)) {
        withMarkers++;
        after = after.replace(/<!-- @chrome:header -->[\s\S]*?<!-- @chrome:\/header -->/, header);
        after = after.replace(/<!-- @chrome:footer -->[\s\S]*?<!-- @chrome:\/footer -->/, footer);
    }
    if (after !== before) { fs.writeFileSync(p, after); changed++; console.log('aktualisiert: ' + f); }
}
console.log(withMarkers + ' Seiten mit Markern, ' + changed + ' geändert.');
