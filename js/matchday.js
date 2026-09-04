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
