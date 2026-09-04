/* =============================================================================
   EVV 2000 Admin — Kader-Editor (visuell)
   Ersetzt das alte Textfeld "Name | Position | Nummer | Foto | Foto-Hover".
   Jede Person ist eine Zeile mit zwei Foto-Kacheln (Foto + Hover-Foto), Name,
   Position, Nummer. Fotos: Klick/Tippen (Handy: Kamera oder Galerie) oder
   Datei auf die Kachel ziehen — Upload läuft sofort, Bild wird vorher verkleinert.

   Nutzung:  var roster = AdminCore.rosterEditor(mountEl, { folder: function(){ return 'spieler/herren-1'; } });
             roster.set(players); … roster.get()  →  [{ name, role, number, image, image2 }]
   Braucht: admin-core.js (uploadImage, esc, toast), optional SortableJS (Reihenfolge per Drag).
   ============================================================================= */
(function () {
    'use strict';

    var ROLES = ['Zuspiel', 'Außenangriff', 'Mittelblock', 'Diagonal', 'Libero', 'Universal', 'Trainer', 'Co-Trainer', 'Betreuer', 'Physio'];
    var STAFF = /trainer|coach|betreu|physio|manager/i;

    function isStaff(role) { return STAFF.test(String(role || '')); }

    function resolveImg(url) {
        if (!url) return '';
        // Absolute URLs (https:, blob:, data: …) unverändert, relative Pfade aus /admin/ heraus auflösen
        return /^([a-z][a-z0-9+.-]*:|\/\/)/i.test(url) ? url : '../' + url.replace(/^\//, '');
    }

    /* Freitext-Liste → Personen. Akzeptiert "Name | Position | Nummer", "Name - Position", "7 Name Position" */
    function parseList(text) {
        return String(text || '').split('\n').map(function (l) { return l.trim(); }).filter(Boolean).map(function (line) {
            var parts = line.split(/\s*\|\s*|\s+[-–]\s+|\t+/).map(function (s) { return s.trim(); }).filter(Boolean);
            var p = { name: '', role: '', number: null };
            var rest = [];
            parts.forEach(function (tok) {
                if (/^\d{1,2}$/.test(tok) && p.number == null) p.number = parseInt(tok, 10);
                else rest.push(tok);
            });
            p.name = rest[0] || '';
            p.role = rest[1] || '';
            // "7 Chris Mitte" / "Chris Mitte 7": Nummer am Anfang oder Ende des Namens abtrennen
            if (p.number == null) {
                var nm = p.name.match(/^(\d{1,2})\s+(.+)$/) || p.name.match(/^(.+?)\s+(\d{1,2})$/);
                if (nm) { p.number = parseInt(/^\d/.test(nm[1]) ? nm[1] : nm[2], 10); p.name = /^\d/.test(nm[1]) ? nm[2] : nm[1]; }
            }
            // "Theo Diagonal" ohne Trenner: letztes Wort als Position erkennen
            if (!p.role) {
                var m = p.name.match(/^(.+?)\s+(zuspiel\w*|au(?:ß|ss)en\w*|mitte\w*|diagonal\w*|dia|libero|universal\w*|co-?trainer\w*|trainer\w*|betreuer\w*|physio\w*)$/i);
                if (m) { p.name = m[1]; p.role = m[2]; }
            }
            if (rest[2] && !p.image) p.image = rest[2];
            if (rest[3]) p.image2 = rest[3];
            return p;
        }).filter(function (p) { return p.name; });
    }

    function rosterEditor(mountEl, opts) {
        opts = opts || {};
        var core = window.AdminCore;
        var esc = core.esc;
        var state = [];
        var sortable = null;
        var pending = null; // { idx, field } für den Datei-Dialog

        mountEl.classList.add('roster-editor');
        mountEl.innerHTML =
            '<div class="rp-list"></div>' +
            '<div class="rp-empty"><i class="fas fa-user-plus"></i> Noch niemand im Kader. Füge Spieler hinzu oder füge eine Liste ein.</div>' +
            '<div class="rp-bar">' +
                '<button type="button" class="btn btn-primary btn-sm rp-add"><i class="fas fa-plus"></i> Spieler</button>' +
                '<button type="button" class="btn btn-ghost btn-sm rp-add-staff"><i class="fas fa-plus"></i> Trainer / Betreuer</button>' +
                '<button type="button" class="btn btn-ghost btn-sm rp-paste-toggle"><i class="fas fa-paste"></i> Liste einfügen</button>' +
                '<span class="rp-count"></span>' +
            '</div>' +
            '<div class="rp-paste" style="display:none">' +
                '<textarea class="form-textarea" rows="5" placeholder="Eine Person pro Zeile, z. B.:&#10;Finn - Zuspiel - 3&#10;Jona | Mittelblock | 11&#10;Olli - Libero"></textarea>' +
                '<div class="rp-paste-actions"><button type="button" class="btn btn-primary btn-sm rp-paste-ok"><i class="fas fa-check"></i> Übernehmen</button>' +
                '<button type="button" class="btn btn-ghost btn-sm rp-paste-cancel">Abbrechen</button></div>' +
            '</div>' +
            '<div class="form-hint rp-hint"><i class="fas fa-camera"></i> Auf eine Foto-Kachel tippen — am Handy geht direkt die Kamera oder Galerie auf. ' +
            'Fotos werden automatisch verkleinert. Hochformat, gleicher Bildausschnitt bei allen Spielern sieht am besten aus. ' +
            'Das zweite Foto (Hover) erscheint auf der Website beim Überfahren mit der Maus — optional.</div>' +
            '<input type="file" accept="image/*" class="rp-file" style="display:none">';

        var list = mountEl.querySelector('.rp-list');
        var emptyEl = mountEl.querySelector('.rp-empty');
        var countEl = mountEl.querySelector('.rp-count');
        var pasteBox = mountEl.querySelector('.rp-paste');
        var pasteTa = pasteBox.querySelector('textarea');
        var fileInput = mountEl.querySelector('.rp-file');

        function folder() {
            var f = typeof opts.folder === 'function' ? opts.folder() : opts.folder;
            return f || 'spieler';
        }

        function roleOptions(current) {
            var opts_ = ROLES.slice();
            if (current && opts_.indexOf(current) === -1) opts_.unshift(current);
            return '<option value="">Position…</option>' + opts_.map(function (r) {
                return '<option value="' + esc(r) + '"' + (r === current ? ' selected' : '') + '>' + esc(r) + '</option>';
            }).join('') + '<option value="__other"' + '>Andere…</option>';
        }

        function tile(p, idx, field) {
            var url = p[field];
            var alt = field === 'image2';
            return '<div class="rp-tile' + (alt ? ' rp-tile--alt' : '') + (url ? ' has-img' : '') + '" data-idx="' + idx + '" data-field="' + field + '" title="' + (alt ? 'Hover-Foto (optional)' : 'Foto') + ' ändern">' +
                (url ? '<img src="' + esc(resolveImg(url)) + '" alt="">' : '') +
                '<div class="rp-tile-ph"><i class="fas ' + (alt ? 'fa-images' : 'fa-camera') + '"></i><span>' + (alt ? 'Hover' : 'Foto') + '</span></div>' +
                '<div class="rp-tile-busy"><div class="spinner sm"></div></div>' +
                (url ? '<button type="button" class="rp-tile-x" title="Foto entfernen"><i class="fas fa-times"></i></button>' : '') +
                '</div>';
        }

        function row(p, idx) {
            var staff = isStaff(p.role);
            return '<div class="rp-row' + (staff ? ' is-staff' : '') + '" data-idx="' + idx + '">' +
                '<div class="rp-handle" title="Ziehen zum Sortieren"><i class="fas fa-grip-vertical"></i></div>' +
                '<div class="rp-photos">' + tile(p, idx, 'image') + tile(p, idx, 'image2') + '</div>' +
                '<div class="rp-fields">' +
                    '<input type="text" class="form-input rp-name" placeholder="Name" value="' + esc(p.name || '') + '">' +
                    '<div class="rp-role-wrap">' +
                        '<select class="form-select rp-role">' + roleOptions(p.role || '') + '</select>' +
                        '<input type="text" class="form-input rp-role-other" placeholder="Position eintragen" style="display:none">' +
                    '</div>' +
                    '<input type="number" class="form-input rp-num" placeholder="Nr." min="0" max="99" value="' + (p.number == null ? '' : esc(p.number)) + '"' + (staff ? ' disabled' : '') + '>' +
                '</div>' +
                '<button type="button" class="rp-del" title="Entfernen"><i class="fas fa-trash"></i></button>' +
                '</div>';
        }

        function render() {
            list.innerHTML = state.map(row).join('');
            emptyEl.style.display = state.length ? 'none' : '';
            var players = state.filter(function (p) { return !isStaff(p.role); }).length;
            countEl.textContent = state.length ? (players + ' Spieler' + (state.length - players ? ' · ' + (state.length - players) + ' Staff' : '')) : '';
            if (sortable) { sortable.destroy(); sortable = null; }
            if (window.Sortable && state.length > 1) {
                sortable = window.Sortable.create(list, {
                    handle: '.rp-handle', animation: 150, ghostClass: 'sort-ghost',
                    onEnd: function (ev) {
                        if (ev.oldIndex === ev.newIndex) return;
                        var moved = state.splice(ev.oldIndex, 1)[0];
                        state.splice(ev.newIndex, 0, moved);
                        render();
                    }
                });
            }
            if (opts.onChange) opts.onChange(get());
        }

        function rowIdx(el) {
            var r = el.closest('.rp-row');
            return r ? parseInt(r.dataset.idx, 10) : -1;
        }

        /* Eingaben direkt in den State schreiben (ohne Neu-Rendern → Fokus bleibt) */
        list.addEventListener('input', function (e) {
            var idx = rowIdx(e.target); if (idx < 0) return;
            var p = state[idx];
            if (e.target.classList.contains('rp-name')) p.name = e.target.value;
            else if (e.target.classList.contains('rp-num')) { var n = parseInt(e.target.value, 10); p.number = isNaN(n) ? null : n; }
            else if (e.target.classList.contains('rp-role-other')) p.role = e.target.value.trim();
        });

        list.addEventListener('change', function (e) {
            if (!e.target.classList.contains('rp-role')) return;
            var idx = rowIdx(e.target); if (idx < 0) return;
            var wrap = e.target.closest('.rp-role-wrap');
            var other = wrap.querySelector('.rp-role-other');
            if (e.target.value === '__other') {
                other.style.display = '';
                other.value = '';
                other.focus();
                state[idx].role = '';
            } else {
                other.style.display = 'none';
                state[idx].role = e.target.value;
            }
            var rowEl = e.target.closest('.rp-row');
            var staff = isStaff(state[idx].role);
            rowEl.classList.toggle('is-staff', staff);
            var num = rowEl.querySelector('.rp-num');
            num.disabled = staff;
            if (staff) { num.value = ''; state[idx].number = null; }
        });

        list.addEventListener('click', function (e) {
            var del = e.target.closest('.rp-del');
            if (del) {
                var idx = rowIdx(del);
                var p = state[idx];
                if (p && (p.name || p.image) && !confirm((p.name || 'Diese Person') + ' aus dem Kader entfernen?')) return;
                state.splice(idx, 1);
                render();
                return;
            }
            var x = e.target.closest('.rp-tile-x');
            if (x) {
                e.stopPropagation();
                var t = x.closest('.rp-tile');
                var i2 = parseInt(t.dataset.idx, 10);
                delete state[i2][t.dataset.field];
                render();
                return;
            }
            var tileEl = e.target.closest('.rp-tile');
            if (tileEl) {
                pending = { idx: parseInt(tileEl.dataset.idx, 10), field: tileEl.dataset.field };
                fileInput.value = '';
                fileInput.click();
            }
        });

        fileInput.addEventListener('change', function () {
            if (!pending || !fileInput.files[0]) return;
            upload(pending.idx, pending.field, fileInput.files[0]);
            pending = null;
        });

        /* Drag & Drop auf eine Kachel */
        list.addEventListener('dragover', function (e) {
            var t = e.target.closest('.rp-tile'); if (!t) return;
            e.preventDefault(); t.classList.add('dragover');
        });
        list.addEventListener('dragleave', function (e) {
            var t = e.target.closest('.rp-tile'); if (t) t.classList.remove('dragover');
        });
        list.addEventListener('drop', function (e) {
            var t = e.target.closest('.rp-tile'); if (!t) return;
            e.preventDefault(); t.classList.remove('dragover');
            var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
            if (f) upload(parseInt(t.dataset.idx, 10), t.dataset.field, f);
        });

        async function upload(idx, field, file) {
            var tileEl = list.querySelector('.rp-tile[data-idx="' + idx + '"][data-field="' + field + '"]');
            if (tileEl) tileEl.classList.add('is-uploading');
            try {
                var url = await core.uploadImage(file, folder(), { maxW: 1000, maxH: 1250, quality: 0.85 });
                state[idx][field] = url;
                render();
                core.toast('Foto hochgeladen.', 'success');
            } catch (e) {
                console.error(e);
                core.toast(e.message || 'Upload fehlgeschlagen', 'error');
                if (tileEl) tileEl.classList.remove('is-uploading');
            }
        }

        function add(p) {
            state.push(p);
            render();
            var rows = list.querySelectorAll('.rp-row');
            var last = rows[rows.length - 1];
            if (last) { last.querySelector('.rp-name').focus(); last.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
        }

        mountEl.querySelector('.rp-add').addEventListener('click', function () { add({ name: '', role: '', number: null }); });
        mountEl.querySelector('.rp-add-staff').addEventListener('click', function () { add({ name: '', role: 'Trainer', number: null }); });
        mountEl.querySelector('.rp-paste-toggle').addEventListener('click', function () {
            pasteBox.style.display = pasteBox.style.display === 'none' ? '' : 'none';
            if (pasteBox.style.display !== 'none') pasteTa.focus();
        });
        pasteBox.querySelector('.rp-paste-cancel').addEventListener('click', function () { pasteBox.style.display = 'none'; pasteTa.value = ''; });
        pasteBox.querySelector('.rp-paste-ok').addEventListener('click', function () {
            var people = parseList(pasteTa.value);
            if (!people.length) { core.toast('Keine Namen erkannt.', 'error'); return; }
            state = state.concat(people);
            pasteTa.value = '';
            pasteBox.style.display = 'none';
            render();
            core.toast(people.length + ' Personen übernommen.', 'success');
        });

        function get() {
            return state.map(function (p) {
                var o = { name: String(p.name || '').trim(), role: String(p.role || '').trim(), number: p.number == null || p.number === '' ? null : p.number };
                if (p.image) o.image = p.image;
                if (p.image2) o.image2 = p.image2;
                return o;
            }).filter(function (p) { return p.name; });
        }

        function set(players) {
            state = (players || []).map(function (p) {
                return { name: p.name || '', role: p.role || '', number: p.number == null ? null : p.number, image: p.image || undefined, image2: p.image2 || undefined };
            });
            pasteBox.style.display = 'none';
            render();
        }

        render();
        return { get: get, set: set, parseList: parseList };
    }

    window.AdminCore = window.AdminCore || {};
    window.AdminCore.rosterEditor = rosterEditor;
    window.AdminCore.ROSTER_ROLES = ROLES;
})();
