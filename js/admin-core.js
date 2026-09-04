/* =============================================================================
   EVV 2000 — Admin Core
   Gemeinsame Logik für alle Admin-Seiten:
   - Auth-Guard + Rollen/Permissions
   - Sidebar-Rendering (nach Permissions gefiltert)
   - Audit-Log-Helper
   - Bild-Upload (Supabase Storage, Bucket "images")
   - Toast, Modal-Helfer, Formatierung
   Voraussetzung: supabase-js + js/supabase-client.js sind geladen.
   ============================================================================= */

(function () {
    'use strict';

    var PERMISSIONS = [
        { key: 'news',          label: 'Aktuelles',          icon: 'fa-newspaper' },
        { key: 'events',        label: 'Turniere & Events',  icon: 'fa-trophy' },
        { key: 'teams',         label: 'Mannschaften',       icon: 'fa-users' },
        { key: 'kalender',      label: 'Kalender / Termine', icon: 'fa-calendar-alt' },
        { key: 'beach',         label: 'Beachanlage',        icon: 'fa-umbrella-beach' },
        { key: 'sponsors',      label: 'Sponsoren',          icon: 'fa-handshake' },
        { key: 'members',       label: 'Mitglieder',         icon: 'fa-id-card' },
        { key: 'registrations', label: 'Anmeldungen',        icon: 'fa-clipboard-list' },
        { key: 'anfragen',      label: 'Anfragen & Anträge', icon: 'fa-inbox' },
        { key: 'dokumente',     label: 'Formulare/Downloads', icon: 'fa-file-arrow-down' },
        { key: 'log',           label: 'Aktivitätslog',      icon: 'fa-history' }
    ];

    // Rollen-Vorlagen: befüllen die Permission-Checkboxen in der Verwaltung
    var ROLES = {
        superadmin:   { label: 'Superadmin',    perms: PERMISSIONS.map(function (p) { return p.key; }) },
        admin:        { label: 'Admin',         perms: ['news', 'events', 'teams', 'kalender', 'beach', 'sponsors', 'members', 'registrations', 'anfragen', 'dokumente', 'log'] },
        trainer:      { label: 'Trainer',       perms: ['kalender', 'beach'] },
        redakteur:    { label: 'Redakteur',     perms: ['news'] },
        eventmanager: { label: 'Event-Manager', perms: ['events', 'registrations', 'kalender'] },
        custom:       { label: 'Individuell',   perms: [] }
    };

    var NAV_ITEMS = [
        { href: 'dashboard.html',     icon: 'fa-th-large',       label: 'Dashboard',         perm: null },
        { href: 'news.html',          icon: 'fa-newspaper',      label: 'Aktuelles',         perm: 'news' },
        { href: 'events.html',        icon: 'fa-trophy',         label: 'Turniere & Events', perm: 'events' },
        { href: 'teams.html',         icon: 'fa-users',          label: 'Mannschaften',      perm: 'teams' },
        { href: 'sponsoren.html',     icon: 'fa-handshake',      label: 'Sponsoren',         perm: 'sponsors' },
        { href: 'kalender.html',      icon: 'fa-calendar-alt',   label: 'Kalender',          perm: ['kalender', 'beach'] },
        { href: 'beach.html',         icon: 'fa-umbrella-beach', label: 'Beach-Buchungen',   perm: 'beach' },
        { divider: true },
        { href: 'mitglieder.html',    icon: 'fa-id-card',        label: 'Mitglieder',        perm: 'members' },
        { href: 'registrations.html', icon: 'fa-clipboard-list', label: 'Anmeldungen',       perm: ['registrations', 'events'] },
        { href: 'anfragen.html',      icon: 'fa-inbox',          label: 'Anfragen',          perm: 'anfragen' },
        { href: 'dokumente.html',     icon: 'fa-file-arrow-down', label: 'Formulare',        perm: 'dokumente' },
        { href: 'https://web.meinverein.de/', icon: 'fa-arrow-up-right-from-square', label: 'WISO MeinVerein', perm: ['members', 'anfragen'], external: true },
        { divider: true },
        { href: 'verwaltung.html',    icon: 'fa-user-shield',    label: 'Verwaltung',        superadmin: true },
        { href: 'log.html',           icon: 'fa-history',        label: 'Aktivitätslog',     perm: 'log' },
        { divider: true },
        { href: '../index.html',      icon: 'fa-external-link-alt', label: 'Zur Website', external: true }
    ];

    var AdminCore = {
        PERMISSIONS: PERMISSIONS,
        ROLES: ROLES,
        user: null,   // Supabase auth user
        admin: null,  // Zeile aus "admins" (role, permissions, name, ...)

        /* ── Auth + Seite initialisieren ────────────────────────────────────
           opts: { page: 'dashboard.html', title: 'Dashboard', perm: 'news' | ['a','b'] | null, superadmin: bool } */
        init: async function (opts) {
            opts = opts || {};
            try {
                await ErkaSupabase.init();
                if (!ErkaSupabase.ready) {
                    alert('Supabase ist nicht konfiguriert. Admin-Panel benötigt eine Serververbindung.');
                    window.location.href = 'login.html';
                    return null;
                }

                var userRes = await ErkaSupabase.client.auth.getUser();
                this.user = userRes.data ? userRes.data.user : null;
                if (!this.user) {
                    window.location.href = 'login.html';
                    return null;
                }

                var res = await ErkaSupabase.client
                    .from('admins')
                    .select('*')
                    .eq('user_id', this.user.id)
                    .maybeSingle();

                this.admin = res.data || null;

                if (!this.admin || this.admin.is_active === false) {
                    alert('Zugriff verweigert. Dieses Konto ist kein (aktives) Admin-Konto.');
                    await ErkaSupabase.signOut();
                    window.location.href = 'login.html';
                    return null;
                }

                this.renderSidebar(opts.page || '');
                this.wireChrome();

                // Berechtigungs-Check für die Seite
                var allowed = true;
                if (opts.superadmin) allowed = this.isSuperadmin();
                else if (opts.perm) allowed = this.can(opts.perm);

                if (!allowed) {
                    var content = document.querySelector('.content');
                    if (content) {
                        content.innerHTML =
                            '<div class="no-access">' +
                            '<i class="fas fa-lock"></i>' +
                            '<h2>Kein Zugriff</h2>' +
                            '<p>Dir fehlt die Berechtigung für diesen Bereich.<br>Wende dich an einen Superadmin.</p>' +
                            '</div>';
                    }
                }

                var overlay = document.getElementById('loadingOverlay');
                if (overlay) overlay.style.display = 'none';

                return allowed ? this.admin : null;
            } catch (e) {
                console.error('AdminCore.init failed:', e);
                window.location.href = 'login.html';
                return null;
            }
        },

        isSuperadmin: function () {
            return !!(this.admin && this.admin.role === 'superadmin');
        },

        /* can('news') oder can(['a','b']) → true wenn mind. eine Permission da */
        can: function (perm) {
            if (!this.admin) return false;
            if (this.admin.role === 'superadmin') return true;
            var perms = this.admin.permissions || [];
            if (Array.isArray(perm)) {
                return perm.some(function (p) { return perms.indexOf(p) !== -1; });
            }
            return perms.indexOf(perm) !== -1;
        },

        roleLabel: function (role) {
            return (ROLES[role] && ROLES[role].label) || role || 'Admin';
        },

        displayName: function () {
            return (this.admin && this.admin.name) || (this.user && this.user.email) || 'Admin';
        },

        /* ── Sidebar ────────────────────────────────────────────────────── */
        renderSidebar: function (activePage) {
            var el = document.getElementById('sidebar');
            if (!el) return;
            var self = this;

            var items = NAV_ITEMS.filter(function (it) {
                if (it.divider || it.external) return true;
                if (it.superadmin) return self.isSuperadmin();
                if (!it.perm) return true;
                return self.can(it.perm);
            });

            // Doppelte/nutzlose Divider entfernen
            var cleaned = [];
            items.forEach(function (it) {
                if (it.divider && (cleaned.length === 0 || cleaned[cleaned.length - 1].divider)) return;
                cleaned.push(it);
            });
            if (cleaned.length && cleaned[cleaned.length - 1].divider) cleaned.pop();

            var nav = cleaned.map(function (it) {
                if (it.divider) return '<div class="nav-divider"></div>';
                var active = it.href === activePage ? ' active' : '';
                var target = it.external ? ' target="_blank"' : '';
                return '<a href="' + it.href + '" class="nav-item' + active + '"' + target + '>' +
                    '<i class="fas ' + it.icon + '"></i> ' + it.label + '</a>';
            }).join('');

            var name = this.displayName();
            var initials = name.split(/\s+/).map(function (w) { return w.charAt(0); }).join('').substring(0, 2).toUpperCase();

            el.innerHTML =
                '<div class="sidebar-header">' +
                    '<div class="sidebar-logo"><img src="../img/logo-evv.png" alt="EVV 2000"></div>' +
                    '<div class="sidebar-brand">EVV 2000<span>Admin-Panel</span></div>' +
                '</div>' +
                '<nav class="sidebar-nav">' + nav + '</nav>' +
                '<div class="sidebar-footer">' +
                    '<div class="sidebar-user">' +
                        '<div class="sidebar-user-avatar">' + this.esc(initials) + '</div>' +
                        '<div class="sidebar-user-info">' +
                            '<div class="sidebar-user-name">' + this.esc(name) + '</div>' +
                            '<div class="sidebar-user-role">' + this.esc(this.roleLabel(this.admin.role)) + '</div>' +
                        '</div>' +
                    '</div>' +
                    '<button class="logout-btn" id="logoutBtn"><i class="fas fa-sign-out-alt"></i> Abmelden</button>' +
                '</div>';
        },

        wireChrome: function () {
            var self = this;
            var logout = document.getElementById('logoutBtn');
            if (logout) {
                logout.addEventListener('click', async function () {
                    try { await self.audit('logout', 'session', null, null, null); } catch (e) {}
                    await ErkaSupabase.signOut();
                    window.location.href = 'login.html';
                });
            }
            var toggle = document.getElementById('sidebarToggle');
            var sidebar = document.getElementById('sidebar');
            var overlay = document.getElementById('sidebarOverlay');
            if (toggle && sidebar && overlay) {
                toggle.addEventListener('click', function () {
                    sidebar.classList.toggle('open');
                    overlay.classList.toggle('active');
                });
                overlay.addEventListener('click', function () {
                    sidebar.classList.remove('open');
                    overlay.classList.remove('active');
                });
            }
        },

        /* ── Audit-Log ──────────────────────────────────────────────────────
           action: 'create'|'update'|'delete'|'login'|'logout'
           entity: 'news'|'tournament'|'team'|'termin'|'beach_block'|'admin'|'registration'|... */
        audit: async function (action, entity, entityId, entityLabel, details) {
            try {
                await ErkaSupabase.client.from('admin_audit_log').insert({
                    user_id: this.user ? this.user.id : null,
                    user_email: this.user ? this.user.email : null,
                    user_name: this.admin ? (this.admin.name || null) : null,
                    action: action,
                    entity: entity,
                    entity_id: entityId != null ? String(entityId) : null,
                    entity_label: entityLabel || null,
                    details: details || null
                });
            } catch (e) {
                console.warn('Audit-Log fehlgeschlagen:', e);
            }
        },

        /* ── Bild verkleinern (Browser, Canvas) ─────────────────────────────
           Handy-Fotos sind 3–8 MB — vor dem Upload auf Web-Größe bringen.
           opts: { maxW, maxH, quality, type } · Rückgabe: File (JPEG) oder Original (SVG/GIF/klein) */
        resizeImage: function (file, opts) {
            opts = opts || {};
            var maxW = opts.maxW || 1600, maxH = opts.maxH || 1600, quality = opts.quality || 0.85;
            var keep = ['image/svg+xml', 'image/gif'];
            if (keep.indexOf(file.type) !== -1) return Promise.resolve(file);
            return new Promise(function (resolve) {
                var url = URL.createObjectURL(file);
                var img = new Image();
                img.onload = function () {
                    var w = img.naturalWidth, h = img.naturalHeight;
                    var scale = Math.min(1, maxW / w, maxH / h);
                    if (scale === 1 && file.size < 600 * 1024 && file.type === 'image/jpeg') { URL.revokeObjectURL(url); resolve(file); return; }
                    var cw = Math.round(w * scale), ch = Math.round(h * scale);
                    var canvas = document.createElement('canvas');
                    canvas.width = cw; canvas.height = ch;
                    var ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, cw, ch);
                    URL.revokeObjectURL(url);
                    canvas.toBlob(function (blob) {
                        if (!blob) { resolve(file); return; }
                        var name = (file.name || 'bild').replace(/\.[^.]+$/, '') + '.jpg';
                        resolve(new File([blob], name, { type: 'image/jpeg' }));
                    }, 'image/jpeg', quality);
                };
                img.onerror = function () { URL.revokeObjectURL(url); resolve(file); };
                img.src = url;
            });
        },

        /* ── Bild-Upload ────────────────────────────────────────────────── */
        uploadImage: async function (file, folder, opts) {
            if (!file) throw new Error('Keine Datei gewählt.');
            var okTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml', 'image/heic', 'image/heif'];
            if (okTypes.indexOf(file.type) === -1 && !/\.(jpe?g|png|webp|gif|svg|heic|heif)$/i.test(file.name || '')) {
                throw new Error('Nur Bilder (JPG, PNG, WebP, GIF, SVG) erlaubt.');
            }
            if (file.size > 25 * 1024 * 1024) throw new Error('Bild ist zu groß (max. 25 MB).');

            // Automatisch verkleinern (Standard: max. 1600 px, JPEG 85 %)
            var prepared = await AdminCore.resizeImage(file, opts);
            if (prepared.size > 8 * 1024 * 1024) throw new Error('Bild ist auch nach dem Verkleinern zu groß.');

            var ext = (prepared.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
            var path = (folder || 'misc') + '/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext;

            var up = await ErkaSupabase.client.storage.from('images').upload(path, prepared, {
                cacheControl: '3600',
                upsert: false,
                contentType: prepared.type || undefined
            });
            if (up.error) throw up.error;

            var pub = ErkaSupabase.client.storage.from('images').getPublicUrl(path);
            return pub.data.publicUrl;
        },

        /* ── Datei-Upload (PDF & Dokumente) ─────────────────────────────────
           Nutzt denselben Bucket "images" (öffentlich lesbar, Admin-Write),
           legt Dateien aber im Ordner "dokumente/" ab.
           Rückgabe: { url, name, size } */
        uploadDocument: async function (file, folder) {
            if (!file) throw new Error('Keine Datei gewählt.');
            if (file.size > 25 * 1024 * 1024) throw new Error('Datei ist zu groß (max. 25 MB).');
            var okTypes = [
                'application/pdf',
                'application/msword',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            ];
            var name = file.name || 'dokument';
            var ext = (name.split('.').pop() || 'pdf').toLowerCase().replace(/[^a-z0-9]/g, '');
            var okExt = ['pdf', 'doc', 'docx'];
            if (okTypes.indexOf(file.type) === -1 && okExt.indexOf(ext) === -1) {
                throw new Error('Nur PDF- oder Word-Dateien erlaubt.');
            }
            var path = (folder || 'dokumente') + '/' + Date.now() + '-' +
                Math.random().toString(36).slice(2, 8) + '.' + ext;
            var up = await ErkaSupabase.client.storage.from('images').upload(path, file, {
                cacheControl: '3600',
                upsert: false,
                contentType: file.type || 'application/pdf'
            });
            if (up.error) throw up.error;
            var pub = ErkaSupabase.client.storage.from('images').getPublicUrl(path);
            return { url: pub.data.publicUrl, name: name, size: file.size };
        },

        /* Bild-Picker-UI in ein Element mounten.
           Rückgabe: { getUrl(), setUrl(url) } */
        imagePicker: function (mountEl, folder, initialUrl) {
            var self = this;
            var url = initialUrl || '';

            mountEl.classList.add('img-picker');
            mountEl.innerHTML =
                '<div class="img-picker-empty"><i class="fas fa-cloud-upload-alt"></i>' +
                '<span><strong>Bild hochladen</strong><br>Klicken oder Datei hierher ziehen</span></div>' +
                '<div class="img-picker-preview"><img alt="Vorschau">' +
                '<div class="img-picker-actions">' +
                '<button type="button" class="ip-remove" title="Bild entfernen"><i class="fas fa-trash"></i></button>' +
                '</div></div>' +
                '<div class="img-picker-progress"><div class="spinner sm"></div><span>Wird hochgeladen…</span></div>' +
                '<input type="file" accept="image/*" style="display:none">';

            var empty = mountEl.querySelector('.img-picker-empty');
            var preview = mountEl.querySelector('.img-picker-preview');
            var img = preview.querySelector('img');
            var progress = mountEl.querySelector('.img-picker-progress');
            var input = mountEl.querySelector('input[type=file]');

            function render() {
                empty.style.display = url ? 'none' : 'flex';
                preview.style.display = url ? 'block' : 'none';
                if (url) img.src = url;
            }

            async function handleFile(file) {
                if (!file) return;
                progress.style.display = 'flex';
                try {
                    url = await self.uploadImage(file, folder);
                    render();
                } catch (e) {
                    console.error(e);
                    self.toast(e.message || 'Upload fehlgeschlagen', 'error');
                } finally {
                    progress.style.display = 'none';
                }
            }

            empty.addEventListener('click', function () { input.click(); });
            input.addEventListener('change', function () { handleFile(input.files[0]); input.value = ''; });
            preview.querySelector('.ip-remove').addEventListener('click', function () { url = ''; render(); });

            ['dragover', 'dragenter'].forEach(function (ev) {
                mountEl.addEventListener(ev, function (e) { e.preventDefault(); mountEl.classList.add('dragover'); });
            });
            ['dragleave', 'drop'].forEach(function (ev) {
                mountEl.addEventListener(ev, function (e) { e.preventDefault(); mountEl.classList.remove('dragover'); });
            });
            mountEl.addEventListener('drop', function (e) {
                if (e.dataTransfer.files && e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
            });

            render();
            return {
                getUrl: function () { return url; },
                setUrl: function (u) { url = u || ''; render(); }
            };
        },

        /* ── UI-Helfer ──────────────────────────────────────────────────── */
        toast: function (msg, type) {
            var t = document.getElementById('adminToast');
            if (!t) {
                t = document.createElement('div');
                t.id = 'adminToast';
                t.className = 'admin-toast';
                document.body.appendChild(t);
            }
            t.textContent = msg;
            t.className = 'admin-toast show ' + (type || '');
            clearTimeout(t._timer);
            t._timer = setTimeout(function () { t.classList.remove('show'); }, 3200);
        },

        openModal: function (id) {
            var m = document.getElementById(id);
            if (m) { m.classList.add('open'); document.body.style.overflow = 'hidden'; }
        },

        closeModal: function (id) {
            var m = document.getElementById(id);
            if (m) { m.classList.remove('open'); document.body.style.overflow = ''; }
        },

        esc: function (str) {
            if (str === null || str === undefined) return '';
            return String(str)
                .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        },

        fmtDate: function (d) {
            if (!d) return '—';
            var dt = new Date(d);
            if (isNaN(dt)) return '—';
            return dt.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
        },

        fmtDateTime: function (d) {
            if (!d) return '—';
            var dt = new Date(d);
            if (isNaN(dt)) return '—';
            return dt.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
                ', ' + dt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + ' Uhr';
        },

        /* ── CSV-Export (Excel-/MeinVerein-tauglich: Semikolon, BOM, dd.mm.yyyy) ── */
        fmtDateDE: function (d) {
            if (!d) return '';
            var dt = new Date(d);
            if (isNaN(dt)) return String(d);
            return String(dt.getDate()).padStart(2, '0') + '.' + String(dt.getMonth() + 1).padStart(2, '0') + '.' + dt.getFullYear();
        },

        /* rows: Array von Arrays (erste Zeile = Überschriften) */
        downloadCsv: function (filename, rows) {
            var csv = rows.map(function (r) {
                return r.map(function (v) {
                    if (v === null || v === undefined) return '';
                    v = String(v);
                    return /[";\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
                }).join(';');
            }).join('\r\n');
            var blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
            var a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
        },

        dateStr: function (d) {
            var y = d.getFullYear();
            var m = String(d.getMonth() + 1).padStart(2, '0');
            var day = String(d.getDate()).padStart(2, '0');
            return y + '-' + m + '-' + day;
        },

        minToTime: function (min) {
            var h = Math.floor(min / 60);
            var m = min % 60;
            return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
        },

        euro: function (cents) {
            return ((cents || 0) / 100).toFixed(2).replace('.', ',') + ' €';
        }
    };

    window.AdminCore = AdminCore;
})();
