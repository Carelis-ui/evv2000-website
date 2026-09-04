/* EVV 2000 — gemeinsames Seiten-Chrome (Matchday Editorial)
   Navigation (Scroll-Zustand, Burger, aktiver Eintrag, Halle/Beach), dezente Reveals, Footer-Jahr. */
(function () {
    'use strict';

    var nav = document.getElementById('siteNav');
    if (nav) {
        var onScroll = function () { nav.classList.toggle('scrolled', window.scrollY > 24); };
        window.addEventListener('scroll', onScroll, { passive: true });
        onScroll();
    }

    var burger = document.getElementById('navBurger');
    if (burger) {
        burger.addEventListener('click', function () {
            var open = document.body.classList.toggle('nav-open');
            burger.setAttribute('aria-expanded', open ? 'true' : 'false');
        });
        document.querySelectorAll('#navLinks a').forEach(function (a) {
            a.addEventListener('click', function () { document.body.classList.remove('nav-open'); });
        });
    }

    // Aktive Seite / aktiver Bereich (Halle | Beach) über <body data-page="…" data-mode="…">
    var page = document.body.getAttribute('data-page') || '';
    var mode = document.body.getAttribute('data-mode') || 'halle';
    document.querySelectorAll('.nav-links a[data-nav]').forEach(function (a) {
        if (a.getAttribute('data-nav') === page) { a.classList.add('is-active'); a.setAttribute('aria-current', 'page'); }
    });
    document.querySelectorAll('.mode-btn[data-mode]').forEach(function (a) {
        if (a.getAttribute('data-mode') === mode) { a.classList.add('is-active'); a.setAttribute('aria-current', 'true'); }
    });

    // Reveal
    var reveals = document.querySelectorAll('[data-reveal]');
    if ('IntersectionObserver' in window) {
        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
        }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
        reveals.forEach(function (el) { io.observe(el); });
    } else {
        reveals.forEach(function (el) { el.classList.add('in'); });
    }
    // Above-the-fold nie auf den Observer warten lassen
    setTimeout(function () {
        document.querySelectorAll('.hero [data-reveal], .page-hero [data-reveal]').forEach(function (el) { el.classList.add('in'); });
    }, 60);

    document.querySelectorAll('[data-year]').forEach(function (el) { el.textContent = String(new Date().getFullYear()); });
})();

/* =============================================================================
   Custom Dropdown — ersetzt native <select> auf allen Geräten (Browser-Listen
   sehen je nach System altbacken aus). Das Original-<select> bleibt im DOM
   (Formular-Submit, change-Events, Validierung), wird nur unsichtbar.
   Tastatur: Pfeile, Enter, Escape · Mobil: Bottom-Sheet mit Abdunklung.
   ============================================================================= */
(function () {
    var CHEV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';

    function enhance(sel) {
        if (sel.dataset.ddReady || sel.multiple || sel.closest('.no-dd')) return;
        sel.dataset.ddReady = '1';

        var dd = document.createElement('div');
        dd.className = 'dd' + (sel.classList.contains('cal-select') ? ' dd--inline' : '');
        var btn = document.createElement('button');
        btn.type = 'button'; btn.className = 'dd-btn';
        btn.setAttribute('aria-haspopup', 'listbox'); btn.setAttribute('aria-expanded', 'false');
        if (sel.getAttribute('aria-label')) btn.setAttribute('aria-label', sel.getAttribute('aria-label'));
        var label = document.createElement('span'); label.className = 'dd-label';
        btn.appendChild(label); btn.insertAdjacentHTML('beforeend', CHEV);
        var backdrop = document.createElement('div'); backdrop.className = 'dd-backdrop';
        var menu = document.createElement('div'); menu.className = 'dd-menu'; menu.setAttribute('role', 'listbox');

        sel.parentNode.insertBefore(dd, sel);
        dd.appendChild(sel); dd.appendChild(btn); dd.appendChild(backdrop); dd.appendChild(menu);
        sel.tabIndex = -1; sel.setAttribute('aria-hidden', 'true');
        if (sel.id) {
            var lab = document.querySelector('label[for="' + sel.id + '"]');
            if (lab) lab.addEventListener('click', function (e) { e.preventDefault(); btn.focus(); });
        }

        var opts = [], focusIdx = -1;

        function addOpt(o) {
            var el = document.createElement('div');
            el.className = 'dd-opt' + (o.disabled ? ' is-disabled' : '');
            el.setAttribute('role', 'option'); el.textContent = o.textContent;
            el.addEventListener('click', function () { if (!o.disabled) choose(o.value); });
            menu.appendChild(el); opts.push({ el: el, opt: o });
        }
        function build() {
            menu.innerHTML = ''; opts = [];
            Array.prototype.forEach.call(sel.children, function (node) {
                if (node.tagName === 'OPTGROUP') {
                    var g = document.createElement('div'); g.className = 'dd-group'; g.textContent = node.label; menu.appendChild(g);
                    Array.prototype.forEach.call(node.children, addOpt);
                } else if (node.tagName === 'OPTION') addOpt(node);
            });
            sync();
        }
        function sync() {
            var cur = sel.options[sel.selectedIndex];
            label.textContent = cur ? cur.textContent : '';
            dd.classList.toggle('is-placeholder', !!cur && cur.value === '');
            dd.classList.remove('is-invalid');
            opts.forEach(function (x) { x.el.setAttribute('aria-selected', x.opt.selected ? 'true' : 'false'); });
        }
        function mark() {
            opts.forEach(function (x, i) { x.el.classList.toggle('focus', i === focusIdx); });
            if (opts[focusIdx]) opts[focusIdx].el.scrollIntoView({ block: 'nearest' });
        }
        function open() {
            document.querySelectorAll('.dd.open').forEach(function (d) { if (d !== dd) d.classList.remove('open'); });
            dd.classList.add('open'); btn.setAttribute('aria-expanded', 'true');
            focusIdx = opts.findIndex(function (x) { return x.opt.selected; });
            mark();
        }
        function close() { dd.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); }
        function choose(v) {
            if (sel.value !== v) { sel.value = v; sel.dispatchEvent(new Event('change', { bubbles: true })); }
            sync(); close(); btn.focus();
        }

        btn.addEventListener('click', function () { dd.classList.contains('open') ? close() : open(); });
        backdrop.addEventListener('click', close);
        btn.addEventListener('keydown', function (e) {
            var isOpen = dd.classList.contains('open');
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                if (!isOpen) open();
                var step = e.key === 'ArrowDown' ? 1 : -1, i = focusIdx;
                do { i += step; } while (opts[i] && opts[i].opt.disabled);
                if (opts[i]) { focusIdx = i; mark(); }
            } else if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (isOpen && opts[focusIdx]) choose(opts[focusIdx].opt.value); else open();
            } else if (e.key === 'Escape' || e.key === 'Tab') {
                close();
            }
        });
        document.addEventListener('click', function (e) { if (!dd.contains(e.target)) close(); });
        sel.addEventListener('change', sync);
        sel.addEventListener('invalid', function (e) { e.preventDefault(); dd.classList.add('is-invalid'); btn.focus(); });
        if (sel.form) sel.form.addEventListener('reset', function () { setTimeout(sync, 0); });
        new MutationObserver(build).observe(sel, { childList: true, subtree: true, attributes: true, attributeFilter: ['selected'] });
        build();
    }

    document.querySelectorAll('select').forEach(enhance);
    window.MatchdayDropdown = { enhance: enhance };
})();
