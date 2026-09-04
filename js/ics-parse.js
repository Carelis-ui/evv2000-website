/* =============================================================================
   EVV 2000 — ICS-Parser für den Termin-Import (Admin › Kalender)
   Liest iCalendar-Dateien (RFC 5545) aus Kalender-Apps, SAMS/Verbandsportalen
   oder Google/Apple/Outlook und liefert Termine im gleichen Zeilenformat wie
   der CSV-Import (alle Werte als Strings): { date, date_end, title, type, team,
   time_start, time_end, location, opponent, is_home, description, hint }.

   - Zeilenfaltung, Escapes, VALUE=DATE (ganztägig), TZID, UTC (Z) → Europe/Berlin
   - DTEND/DURATION, mehrtägige Termine
   - RRULE: DAILY/WEEKLY (INTERVAL, BYDAY, COUNT, UNTIL, EXDATE) werden aufgelöst,
     MONTHLY/YEARLY nur erster Termin mit Hinweis
   - Erkennung: Typ (Spiel/Turnier/Training/Event), Gegner + Heim/Auswärts aus
     „A - B"/„A vs B", Mannschaft anhand der Namen aus opts.teams

   Nutzung: IcsParse.parse(text, { teams: [{ name }], clubPattern: /evv|erkelenz/i })
   ============================================================================= */
(function () {
    'use strict';

    var TZ = 'Europe/Berlin';
    var pad = function (n) { return String(n).padStart(2, '0'); };

    /* ── Zeitzonen-Helfer (ohne Bibliothek) ─────────────────────────────── */
    function partsIn(tz, utcMs) {
        var f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
        var o = {};
        f.formatToParts(new Date(utcMs)).forEach(function (p) { o[p.type] = p.value; });
        return { y: +o.year, m: +o.month, d: +o.day, h: +o.hour % 24, mi: +o.minute, s: +o.second };
    }
    function offsetOf(tz, utcMs) {
        var p = partsIn(tz, utcMs);
        return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - utcMs;
    }
    /* lokale Uhrzeit in Zone tz → UTC-Millisekunden */
    function zonedToUtc(p, tz) {
        var guess = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s);
        var off = offsetOf(tz, guess);
        var utc = guess - off;
        var off2 = offsetOf(tz, utc);
        return off2 === off ? utc : guess - off2;
    }
    function isValidTz(tz) {
        try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch (e) { return false; }
    }

    /* ── Property-Parsing ───────────────────────────────────────────────── */
    function unescapeText(v) {
        return String(v || '').replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\').trim();
    }

    /* Rückgabe: { allDay, utc (ms) | null, local: {y,m,d,h,mi} } */
    function parseDateProp(prop) {
        if (!prop) return null;
        var v = prop.value.trim();
        var tzid = prop.params.TZID || '';
        var m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
        if (!m) return null;
        var p = { y: +m[1], m: +m[2], d: +m[3], h: +(m[4] || 0), mi: +(m[5] || 0), s: +(m[6] || 0) };
        var allDay = (prop.params.VALUE || '').toUpperCase() === 'DATE' || !m[4];
        if (allDay) return { allDay: true, local: p, utc: Date.UTC(p.y, p.m - 1, p.d) };
        var utc;
        if (m[7] === 'Z' || /^(UTC|GMT|Etc\/UTC|Z)$/i.test(tzid)) utc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s);
        else if (tzid && isValidTz(tzid)) utc = zonedToUtc(p, tzid);
        else utc = zonedToUtc(p, TZ);                 // floating oder unbekannte Zone → als Ortszeit
        return { allDay: false, local: partsIn(TZ, utc), utc: utc };
    }

    function parseDuration(v) {
        var m = String(v || '').match(/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
        if (!m) return null;
        var ms = ((+m[2] || 0) * 7 * 86400 + (+m[3] || 0) * 86400 + (+m[4] || 0) * 3600 + (+m[5] || 0) * 60 + (+m[6] || 0)) * 1000;
        return m[1] === '-' ? -ms : ms;
    }

    function isoDate(p) { return p.y + '-' + pad(p.m) + '-' + pad(p.d); }
    function hhmm(p) { return pad(p.h) + ':' + pad(p.mi); }

    /* ── Wiederholungen (RRULE) auflösen ────────────────────────────────── */
    var DAYS = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
    function expandRule(startUtc, rruleStr, exdates, allDay, opts) {
        var rule = {};
        String(rruleStr || '').split(';').forEach(function (kv) { var i = kv.indexOf('='); if (i > 0) rule[kv.slice(0, i).toUpperCase()] = kv.slice(i + 1); });
        var freq = (rule.FREQ || '').toUpperCase();
        var result = { dates: [startUtc], hint: null };
        if (!freq) return result;
        if (freq !== 'DAILY' && freq !== 'WEEKLY') {
            result.hint = 'Wiederholung (' + freq.toLowerCase() + ') nicht aufgelöst – nur erster Termin';
            return result;
        }
        var interval = Math.max(1, parseInt(rule.INTERVAL || '1', 10));
        var count = rule.COUNT ? parseInt(rule.COUNT, 10) : null;
        var until = null;
        if (rule.UNTIL) {
            var u = parseDateProp({ value: rule.UNTIL, params: {} });
            if (u) until = u.allDay ? u.utc + 86400000 - 1 : u.utc;
        }
        var horizon = opts.horizonMs || 400 * 86400000;
        var maxOcc = opts.maxOccurrences || 120;
        var limitUtc = Math.min(until || Infinity, startUtc + horizon);

        var byday = null;
        if (freq === 'WEEKLY' && rule.BYDAY) {
            byday = rule.BYDAY.split(',').map(function (d) { return DAYS[d.replace(/^[+-]?\d+/, '').toUpperCase()]; }).filter(function (x) { return x !== undefined; });
        }
        var startLocal = partsIn(TZ, startUtc);
        var dates = [];
        var generated = 0;   // COUNT zählt laut RFC 5545 auch per EXDATE entfernte Termine
        var stepMs = 86400000;
        // Kandidaten-Tage durchlaufen (max. 2 Jahre)
        var dayCursor = Date.UTC(startLocal.y, startLocal.m - 1, startLocal.d);
        var startDay = dayCursor;
        for (var i = 0; i < 800 && dates.length < maxOcc; i++) {
            var dayUtc = dayCursor + i * stepMs;
            var dp = partsIn('UTC', dayUtc);
            var include = false;
            if (freq === 'DAILY') {
                include = (i % interval) === 0;
            } else {
                var weekIndex = Math.floor((dayUtc - startDay + ((new Date(startDay).getUTCDay() + 6) % 7) * stepMs) / (7 * stepMs));
                var dow = new Date(dayUtc).getUTCDay();
                var inWeekPattern = (weekIndex % interval) === 0;
                include = inWeekPattern && (byday ? byday.indexOf(dow) !== -1 : dow === new Date(startDay).getUTCDay());
            }
            if (!include) continue;
            var occUtc = allDay ? dayUtc : zonedToUtc({ y: dp.y, m: dp.m, d: dp.d, h: startLocal.h, mi: startLocal.mi, s: startLocal.s }, TZ);
            if (occUtc < startUtc) continue;
            if (occUtc > limitUtc) break;
            generated++;
            var key = isoDate(allDay ? dp : partsIn(TZ, occUtc));
            if (!exdates[key]) dates.push(occUtc);
            if (count && generated >= count) break;
        }
        result.dates = dates.length ? dates : [startUtc];
        result.hint = dates.length > 1 ? 'Serie: ' + dates.length + ' Termine' : null;
        return result;
    }

    /* ── Inhaltliche Erkennung ──────────────────────────────────────────── */
    function guessType(text) {
        var t = (text || '').toLowerCase();
        if (/turnier|cup|pokal|tournament/.test(t)) return 'Turnier';
        if (/training|probetraining|übung/.test(t)) return 'Training';
        if (/\bvs\.?\b| - |–|:| gegen |spieltag|punktspiel|liga|heimspiel|auswärts/.test(t)) return 'Spiel';
        return '';
    }
    function norm(s) { return String(s || '').toLowerCase().replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss').replace(/[^a-z0-9]/g, ''); }
    function teamVariants(name) {
        var n = norm(name);
        var v = [n];
        if (n.indexOf('manner') !== -1) v.push(n.replace('manner', 'herren'));
        if (n.indexOf('herren') !== -1) v.push(n.replace('herren', 'manner'));
        if (n.indexOf('frauen') !== -1) v.push(n.replace('frauen', 'damen'));
        if (n.indexOf('damen') !== -1) v.push(n.replace('damen', 'frauen'));
        return v;
    }
    function guessTeam(text, teams) {
        if (!teams || !teams.length) return '';
        var hay = norm(text);
        var best = '';
        teams.forEach(function (t) {
            teamVariants(t.name).forEach(function (v) {
                if (v.length >= 3 && hay.indexOf(v) !== -1 && v.length > norm(best).length) best = t.name;
            });
        });
        return best;
    }
    /* SAMS-Titel „Heim vs. Gast, 9/26/26, BeL1M" → { text, league, leagueLabel } */
    var LEAGUES = { RL: 'Regionalliga', OL: 'Oberliga', VL: 'Verbandsliga', LL: 'Landesliga', BeL: 'Bezirksliga', BL: 'Bezirksliga', BK: 'Bezirksklasse', KL: 'Kreisliga', KK: 'Kreisklasse' };
    function cleanSummary(summary) {
        var s = String(summary || '').trim();
        var league = '';
        var m = s.match(/^(.*?)(?:,\s*\d{1,2}\/\d{1,2}\/\d{2,4})(?:,\s*([A-Za-z0-9 ]{2,14}))?\s*$/);
        if (m) { s = m[1].trim(); league = (m[2] || '').replace(/\s+/g, ''); }
        var label = '';
        if (league) {
            var lm = league.match(/^([A-Za-z]+?)(\d+)?([MFWmfw])?$/);
            if (lm && LEAGUES[lm[1]]) {
                label = LEAGUES[lm[1]] + (lm[2] ? ' ' + lm[2] : '') + (lm[3] ? (/m/i.test(lm[3]) ? ' Männer' : ' Frauen') : '');
            }
        }
        return { text: s, league: league, leagueLabel: label };
    }

    /* „A - B" / „A vs B" / „A : B" → Gegner + Heim, wenn eine Seite der eigene Verein ist */
    function guessMatch(summary, clubPattern) {
        var m = String(summary || '').match(/^(.+?)\s+(?:-|–|vs\.?|:)\s+(.+)$/i);
        if (!m) return null;
        var a = m[1].trim(), b = m[2].trim();
        var aOwn = clubPattern.test(a), bOwn = clubPattern.test(b);
        if (aOwn && !bOwn) return { opponent: b, is_home: 'ja', own: a };
        if (bOwn && !aOwn) return { opponent: a, is_home: 'nein', own: b };
        return null;
    }

    /* Eigene Mannschaft aus „Erkelenzer VV II" + Ligakürzel (…M = Männer, …F/W = Frauen) → Team aus der Liste */
    var ROMAN = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6 };
    function resolveOwnTeam(ownStr, league, teams) {
        if (!ownStr || !teams || !teams.length) return '';
        var s = String(ownStr).trim();
        var num = null, rm = s.match(/\b(I{1,3}|IV|VI?)\s*$/);
        if (rm) num = ROMAN[rm[1]]; else { var am = s.match(/\b(\d)\s*$/); if (am) num = +am[1]; }
        var age = null, ag = s.match(/U\s?(\d{2})/i); if (ag) age = ag[1];
        var gender = '';
        var lg = (league || '').match(/([MFWmfw])$/);
        if (lg) gender = /m/i.test(lg[1]) ? 'm' : 'w';
        else if (/\b(w|weiblich|damen|frauen)\b/i.test(s)) gender = 'w';
        else if (/\b(m|männlich|herren|männer)\b/i.test(s)) gender = 'm';
        if (num === null && !age) num = 1;          // SAMS: erste Mannschaft ohne Zusatz („Erkelenzer VV")
        var best = '', bestScore = 0, secondScore = 0;
        teams.forEach(function (t) {
            var n = norm(t.name), score = 0;
            if (age) {
                if (n.indexOf('u' + age) !== -1) score += 3;
                if (gender && n.charAt(0) === gender) score += 1;
                if (num !== null && n.indexOf('u' + age + num) !== -1) score += 1;
            } else {
                var isM = /manner|herren/.test(n), isW = /frauen|damen/.test(n);
                if (gender === 'm' && isM) score += 2;
                if (gender === 'w' && isW) score += 2;
                if (!gender && (isM || isW)) score += 1;
                if (num !== null && new RegExp('(manner|herren|frauen|damen)' + num + '($|[^0-9])').test(n)) score += 2;
                else if (num === 1 && /^(manner|herren|frauen|damen)$/.test(n)) score += 1;
            }
            if (score > bestScore) { secondScore = bestScore; bestScore = score; best = t.name; }
            else if (score > secondScore) secondScore = score;
        });
        // Gleichstand (z.B. Herren 3 / Damen 3 ohne Geschlecht im Ligakürzel) → lieber offen lassen
        return bestScore >= 3 && bestScore > secondScore ? best : '';
    }

    /* ── Haupt-Parser ───────────────────────────────────────────────────── */
    function parse(text, opts) {
        opts = opts || {};
        var clubPattern = opts.clubPattern || /evv|erkelenz/i;
        text = String(text || '').replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        text = text.replace(/\n[ \t]/g, '');                       // Zeilenfaltung auflösen
        var lines = text.split('\n');
        var events = [], cur = null, calName = '';
        lines.forEach(function (line) {
            if (line === 'BEGIN:VEVENT') { cur = { props: {}, exdates: {} }; return; }
            if (line === 'END:VEVENT') { if (cur) events.push(cur); cur = null; return; }
            var idx = line.indexOf(':');
            if (idx < 0) return;
            var left = line.slice(0, idx), value = line.slice(idx + 1);
            var parts = left.split(';');
            var name = parts[0].toUpperCase();
            var params = {};
            parts.slice(1).forEach(function (p) { var kv = p.split('='); params[kv[0].toUpperCase()] = (kv[1] || '').replace(/^"|"$/g, ''); });
            if (!cur) { if (name === 'X-WR-CALNAME') calName = unescapeText(value); return; }
            if (name === 'EXDATE') {
                value.split(',').forEach(function (v) {
                    var d = parseDateProp({ value: v, params: params });
                    if (d) cur.exdates[isoDate(d.allDay ? d.local : partsIn(TZ, d.utc))] = true;
                });
                return;
            }
            cur.props[name] = { value: value, params: params };
        });

        var recs = [];
        events.forEach(function (ev) {
            var P = ev.props;
            var start = parseDateProp(P.DTSTART);
            if (!start) return;
            var rawTitle = unescapeText(P.SUMMARY ? P.SUMMARY.value : '') || 'Termin';
            var cs = cleanSummary(rawTitle);
            var title = cs.text || rawTitle;
            var location = unescapeText(P.LOCATION ? P.LOCATION.value : '');
            var description = unescapeText(P.DESCRIPTION ? P.DESCRIPTION.value : '');
            var categories = unescapeText(P.CATEGORIES ? P.CATEGORIES.value : '');
            if (/cancelled/i.test(P.STATUS ? P.STATUS.value : '')) return;

            // Dauer bestimmen
            var durMs = null;
            var end = parseDateProp(P.DTEND);
            if (end) durMs = end.utc - start.utc;
            else if (P.DURATION) durMs = parseDuration(P.DURATION.value);
            if (durMs === null) durMs = start.allDay ? 86400000 : 0;

            var typ = guessType(title + ' ' + categories);
            var match = guessMatch(title, clubPattern);
            if (match && !typ) typ = 'Spiel';
            // Mannschaft: eigene Seite des Spiels („Erkelenzer VV II" + Ligakürzel), sonst Titel → Beschreibung → Kalendername
            var team = (match ? resolveOwnTeam(match.own, cs.league, opts.teams) : '') ||
                guessTeam(title, opts.teams) || guessTeam(description, opts.teams) || guessTeam(calName, opts.teams);
            // Spiele bekommen einen lesbaren Titel; Original + Liga wandern in die Beschreibung
            if (match) {
                var extra = [rawTitle !== title ? rawTitle : title, cs.leagueLabel ? cs.leagueLabel + (cs.league ? ' (' + cs.league + ')' : '') : (cs.league ? 'Liga: ' + cs.league : '')].filter(Boolean).join(' · ');
                description = [extra, description].filter(Boolean).join('\n');
                title = (match.is_home === 'ja' ? 'Heimspiel gegen ' : 'Auswärtsspiel bei ') + match.opponent;
            } else if (cs.leagueLabel) {
                description = [cs.leagueLabel + ' (' + cs.league + ')', description].filter(Boolean).join('\n');
            }
            if (description.length > 1000) description = description.slice(0, 997) + '…';

            var series = expandRule(start.utc, P.RRULE ? P.RRULE.value : '', ev.exdates, start.allDay, opts);
            series.dates.forEach(function (occUtc, idx) {
                var rec = { title: title, type: typ, team: team, location: location, description: description,
                    opponent: match ? match.opponent : '', is_home: match ? match.is_home : '', hint: idx === 0 && series.hint ? series.hint : '' };
                if (start.allDay) {
                    var sp = partsIn('UTC', occUtc);
                    rec.date = isoDate(sp);
                    var days = Math.round(durMs / 86400000);
                    if (days > 1) rec.date_end = isoDate(partsIn('UTC', occUtc + (days - 1) * 86400000));
                    else rec.date_end = '';
                    rec.time_start = ''; rec.time_end = '';
                } else {
                    var lp = partsIn(TZ, occUtc);
                    rec.date = isoDate(lp);
                    rec.time_start = hhmm(lp);
                    if (durMs > 0) {
                        var ep = partsIn(TZ, occUtc + durMs);
                        rec.time_end = hhmm(ep);
                        var endDate = isoDate(ep);
                        rec.date_end = endDate !== rec.date && !(ep.h === 0 && ep.mi === 0) ? endDate : (endDate > rec.date && durMs > 86400000 ? endDate : '');
                    } else { rec.time_end = ''; rec.date_end = ''; }
                }
                recs.push(rec);
            });
        });
        return { events: recs, calendarName: calName, count: events.length };
    }

    var api = { parse: parse, _internal: { parseDateProp: parseDateProp, expandRule: expandRule, guessMatch: guessMatch, guessTeam: guessTeam, cleanSummary: cleanSummary, resolveOwnTeam: resolveOwnTeam } };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (typeof window !== 'undefined') window.IcsParse = api;
})();
