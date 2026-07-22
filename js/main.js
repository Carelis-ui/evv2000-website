document.addEventListener('DOMContentLoaded', () => {
    // === INTRO ANIMATION ===
    // Only show on fresh load or reload — skip when navigating from another page on the site
    const intro = document.getElementById('intro');
    if (intro) {
        var navEntry = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
        var navType = navEntry ? navEntry.type : 'navigate';
        var isReload = navType === 'reload';
        var isSameOrigin = false;
        try { isSameOrigin = document.referrer && new URL(document.referrer).origin === window.location.origin; } catch(e) {}
        var showIntro = isReload || !isSameOrigin;

        if (showIntro) {
            document.body.classList.add('intro-active');

            // Add shaking at impact moment — shake the INTRO, not body
            setTimeout(() => {
                intro.classList.add('shaking');
            }, 2000);

            // Remove shaking class
            setTimeout(() => {
                intro.classList.remove('shaking');
            }, 2500);

            // Fade out intro and reveal site
            setTimeout(() => {
                intro.classList.add('done');
                document.body.classList.remove('intro-active');
            }, 3500);

            // Remove intro from DOM
            setTimeout(() => {
                intro.remove();
            }, 4500);
        } else {
            // Skip animation — remove intro immediately
            intro.remove();
        }
    }

    // === NAVBAR ===
    const navbar = document.getElementById('navbar');
    const handleScroll = () => {
        navbar.classList.toggle('scrolled', window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });

    // === MOBILE MENU ===
    const navToggle = document.getElementById('navToggle');
    const navMenu = document.getElementById('navMenu');

    navToggle.addEventListener('click', () => {
        navToggle.classList.toggle('active');
        navMenu.classList.toggle('active');
    });

    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', () => {
            navToggle.classList.remove('active');
            navMenu.classList.remove('active');
        });
    });

    // === TEAM FILTER ===
    // Live-Query, damit auch dynamisch (aus Supabase) gerenderte Karten gefiltert werden
    const filterBtns = document.querySelectorAll('.filter-btn');

    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const filter = btn.dataset.filter;
            document.querySelectorAll('.team-card').forEach(card => {
                if (filter === 'all' || card.dataset.category === filter) {
                    card.classList.remove('hidden');
                    card.style.animation = 'fadeInUp 0.4s ease forwards';
                } else {
                    card.classList.add('hidden');
                }
            });
        });
    });

    // === ANIMATED COUNTERS ===
    const counters = document.querySelectorAll('.stat-number[data-target]');
    const animateCounter = (el) => {
        const target = parseInt(el.dataset.target);
        const duration = 2000;
        const start = performance.now();

        const tick = (now) => {
            const elapsed = now - start;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            el.textContent = Math.round(target * eased);
            if (progress < 1) requestAnimationFrame(tick);
        };

        requestAnimationFrame(tick);
    };

    const counterObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                animateCounter(entry.target);
                counterObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.5 });

    counters.forEach(counter => counterObserver.observe(counter));

    // === SCROLL FADE-IN ===
    const fadeEls = document.querySelectorAll(
        '.about-card, .team-card, .event-card, .news-card, .beach-feature, .pricing-card, .join-stat-card, .sponsor-slot, .contact-card, .angebot-card'
    );

    fadeEls.forEach(el => el.classList.add('fade-in'));

    const fadeObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry, i) => {
            if (entry.isIntersecting) {
                setTimeout(() => entry.target.classList.add('visible'), i * 80);
                fadeObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1 });

    fadeEls.forEach(el => fadeObserver.observe(el));

    // === SMOOTH SCROLL ===
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', (e) => {
            const target = document.querySelector(anchor.getAttribute('href'));
            if (target) {
                e.preventDefault();
                target.scrollIntoView({ behavior: 'smooth' });
            }
        });
    });

    // === CONTACT FORM ===
    // Wird direkt in kontakt.html behandelt (Speicherung in Supabase,
    // Mailto nur noch als Fallback).

    // === ACTIVE NAV LINK ===
    const currentPage = window.location.pathname.split('/').pop().replace('.html', '') || 'index';
    document.querySelectorAll('.nav-link').forEach(link => {
        const href = link.getAttribute('href') || '';
        const linkPage = href.split('/').pop().replace('.html', '') || 'index';
        if (linkPage === currentPage || (currentPage === 'mannschaft' && linkPage === 'mannschaften')) {
            link.classList.add('active-page');
        }
    });

    // === SCROLL TO TOP ===
    const scrollTopBtn = document.getElementById('scrollTop');
    if (scrollTopBtn) {
        window.addEventListener('scroll', () => {
            scrollTopBtn.classList.toggle('visible', window.scrollY > 400);
        }, { passive: true });
        scrollTopBtn.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    // === INJECT KEYFRAME ===
    const style = document.createElement('style');
    style.textContent = `
        @keyframes fadeInUp {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }
    `;
    document.head.appendChild(style);
});
