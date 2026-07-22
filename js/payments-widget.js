/* ==============================================
   Erka Beach - Stripe Payments (EVV2000 Edition)
   - Uses (ERKA_API_BASE)/api/create-checkout-session
   - Redirect to Stripe -> back with ?payment=success
   - All API URLs use ERKA_API_BASE prefix
============================================== */

const ErkaPay = {
    async startCheckout(booking) {
        const method = document.querySelector('input[name="smPayMethod"]:checked')?.value || 'stripe';

        if (method === 'stripe') {
            await this.payWithStripe(booking);
        } else {
            await this.reserveOnsite(booking);
        }
    },

    /**
     * Leitet zur Stripe-Hosted-Checkout weiter.
     * Unterstuetzt: Card, PayPal, Klarna, SEPA, Giropay.
     */
    async payWithStripe(booking) {
        // Demo-Modus / file:// -> kein Stripe-Call
        if (location.protocol === 'file:') return this.demoPayment(booking);

        if (window.showToast) window.showToast('Stripe wird geladen …', '');

        try {
            const res = await fetch((window.ERKA_API_BASE || '') + '/api/create-checkout-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    bookingId: booking.id,
                    date: booking.date,
                    field: booking.field,
                    startMin: booking.startMin,
                    slotCount: booking.slotCount || 1,
                    name: booking.name,
                    email: booking.email,
                    phone: booking.phone,
                    players: booking.players,
                    ball: booking.ball,
                    isMember: booking.isMember,
                    returnUrl: window.location.origin + window.location.pathname
                })
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                // Im Demo-Mode: Fallback auf LocalStorage ohne echte Zahlung
                if (res.status === 500 && err.error?.includes('not configured')) {
                    return this.demoPayment(booking);
                }
                throw new Error(err.error || 'Checkout konnte nicht erstellt werden');
            }

            const { url } = await res.json();
            if (!url) throw new Error('Keine Checkout-URL erhalten');

            // Weiterleitung zu Stripe
            window.location.href = url;
        } catch (err) {
            console.error('Stripe checkout error:', err);
            if (window.showToast) window.showToast('Zahlung fehlgeschlagen: ' + err.message, 'error');
            // Fallback: Demo-Modus
            this.demoPayment(booking);
        }
    },

    /**
     * Vor-Ort-Reservierung (keine Online-Zahlung).
     * Supabase falls konfiguriert, sonst LocalStorage.
     */
    async reserveOnsite(booking) {
        if (location.protocol === 'file:') return this.demoReserve(booking);

        try {
            const res = await fetch((window.ERKA_API_BASE || '') + '/api/book-onsite', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(booking)
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                if (res.status === 409) {
                    if (window.showToast) window.showToast('Slot wurde gerade belegt.', 'error');
                    return;
                }
                if (err.error?.includes('not configured')) {
                    return this.demoReserve(booking);
                }
                throw new Error(err.error || 'Reservierung fehlgeschlagen');
            }
            this.completeBooking(booking, { method: 'onsite', status: 'reserved' });
        } catch (err) {
            console.error('Onsite booking error:', err);
            // Fallback
            this.demoReserve(booking);
        }
    },

    /** Demo-Modus: PayPal/Stripe-Keys fehlen - LocalStorage */
    demoPayment(booking) {
        // Simuliere erfolgreiche Zahlung
        setTimeout(() => {
            this.completeBooking(booking, {
                method: 'stripe',
                status: 'paid',
                transactionId: 'demo_' + Date.now(),
                demo: true
            });
        }, 800);
    },

    demoReserve(booking) {
        this.completeBooking(booking, { method: 'onsite', status: 'reserved', demo: true });
    },

    /** Nach Zahlung/Reservierung: persistieren + Bestaetigung anzeigen */
    async completeBooking(booking, payment) {
        booking.payment = payment;

        if (window.erkaBookingSave) {
            window.erkaBookingSave(booking);
        }

        if (window.showBookingConfirmation) {
            window.showBookingConfirmation(booking, {
                sent: payment.method === 'stripe' && !payment.demo,
                reason: payment.demo ? 'demo' : undefined
            });
        }

        if (window.showToast) {
            const msg = payment.method === 'stripe'
                ? '✓ Bezahlt! Code: ' + booking.id
                : '✓ Reserviert! Code: ' + booking.id;
            window.showToast(msg, 'success');
        }
    }
};

window.ErkaPay = ErkaPay;

/**
 * Nach Rueckkehr von Stripe: Query-Params auswerten
 * ?payment=success&booking=ID -> Bestaetigung anzeigen
 */
(function checkReturnFromStripe() {
    const params = new URLSearchParams(window.location.search);
    const payment = params.get('payment');
    const bookingId = params.get('booking');
    if (!payment || !bookingId) return;

    // URL aufraeumen
    const clean = window.location.pathname + window.location.hash;
    window.history.replaceState({}, '', clean);

    if (payment === 'success') {
        // Buchung wurde via Webhook in Supabase bestaetigt - wir zeigen nur ein Thank-You
        setTimeout(() => {
            if (window.showToast) window.showToast('✓ Zahlung erfolgreich! Code: ' + bookingId, 'success');
            // Buchungen neu laden
            if (window.ErkaBooking?.renderMatrix) window.ErkaBooking.renderMatrix();
        }, 400);
    } else if (payment === 'cancelled') {
        if (window.showToast) window.showToast('Zahlung abgebrochen. Platz wurde freigegeben.', 'error');
    }
})();
