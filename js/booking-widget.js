/* ==============================================
   Erka Beach - Booking Widget (EVV2000 Edition)
   - 4 Plaetze, 45-Min-Slots, 30 EUR flat
   - Matrix with clickable slots
   - Slot click opens modal with booking + payment
   - No Quick Cards, no print, no bookings modal
   - Uses ERKA_API_BASE for remote API calls
============================================== */

// ---------- Toast (inline implementation) ----------
function showToast(msg, type) {
    var t = document.getElementById('evvToast');
    if (!t) return;
    t.textContent = msg;
    t.className = 'evv-toast show ' + (type || '');
    setTimeout(function () { t.classList.remove('show'); }, 3000);
}
window.showToast = showToast;

// ---------- Constants ----------
const STORAGE_KEY = 'erka_bookings_v2';
const SLOT_DURATION = 45;      // Minuten
const SLOT_PRICE = 30;         // Euro Standard-Slot (13:00–17:45)
const SLOT_PRICE_EVENING = 40; // Euro Abend-Slot (18:00–22:00)
const EVENING_START_MIN = 18 * 60; // Ab 18:00 gilt Abendpreis
const BALL_PRICE = 5;          // Euro fuer Ballverleih
const OPEN_START_MIN = 9 * 60;  // 09:00
const OPEN_END_MIN = 22 * 60;  // 22:00

function getSlotPrice(startMin) {
    return startMin >= EVENING_START_MIN ? SLOT_PRICE_EVENING : SLOT_PRICE;
}

// Remote-Slots-Cache (kommen von Supabase via /api/slots)
const remoteSlots = new Map(); // key: date -> Array<{field, start_min, slot_count}>
// Gesperrte Slots (Training etc., von Admins/Trainern geblockt)
const remoteBlocks = new Map(); // key: date -> Array<{field, start_min, slot_count, reason}>

const FIELDS = {
    1: 'Platz 1',
    2: 'Platz 2',
    3: 'Platz 3',
    4: 'Platz 4'
};

const state = {
    viewDate: new Date(),
    selectedSlot: null, // { date, field, startMin }
    bookings: loadBookings()
};

function loadBookings() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}
function saveBookings() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.bookings)); }

// ---------- Hilfsfunktionen ----------
function dateStr(d) {
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
}
function minToTime(min) {
    var h = Math.floor(min / 60);
    var m = min % 60;
    return h + ':' + String(m).padStart(2, '0');
}
function slotEndMin(startMin, count) { return startMin + SLOT_DURATION * (count || 1); }
function slotLabel(startMin, count) {
    return minToTime(startMin) + ' – ' + minToTime(slotEndMin(startMin, count || 1));
}
function generateSlots() {
    // Slot-Starts alle 45 Min, solange Ende <= 22:30
    var slots = [];
    for (var t = OPEN_START_MIN; t + SLOT_DURATION <= OPEN_END_MIN; t += SLOT_DURATION) {
        slots.push(t);
    }
    return slots;
}
function isBooked(date, field, startMin) {
    // Lokale Buchungen
    var localHit = state.bookings.some(function (b) {
        if (b.date !== date || b.field !== field) return false;
        var bStart = b.startMin;
        var bEnd = bStart + SLOT_DURATION * (b.slotCount || 1);
        return startMin >= bStart && startMin < bEnd;
    });
    if (localHit) return true;

    // Remote-Supabase Buchungen
    var remote = remoteSlots.get(date) || [];
    return remote.some(function (b) {
        if (b.field !== field) return false;
        var bEnd = b.start_min + SLOT_DURATION * (b.slot_count || 1);
        return startMin >= b.start_min && startMin < bEnd;
    });
}

/** Vom Verein gesperrt (Training etc.)? Liefert den Block oder null. */
function getBlock(date, field, startMin) {
    var blocks = remoteBlocks.get(date) || [];
    for (var i = 0; i < blocks.length; i++) {
        var b = blocks[i];
        if (b.field !== field) continue;
        var bEnd = b.start_min + SLOT_DURATION * (b.slot_count || 1);
        if (startMin >= b.start_min && startMin < bEnd) return b;
    }
    return null;
}

function isBlocked(date, field, startMin) {
    return !!getBlock(date, field, startMin);
}

async function fetchRemoteSlots(date) {
    // Demo-Modus / lokales file:// -> keine API-Calls
    if (location.protocol === 'file:') {
        remoteSlots.set(date, []);
        remoteBlocks.set(date, []);
        return;
    }
    try {
        // Gesperrte Slots (Training) parallel laden
        var blocksPromise = window.ErkaSupabase
            ? window.ErkaSupabase.getPublicBlocks(date)
            : Promise.resolve([]);

        if (window.ErkaSupabase?.ready) {
            var slots = await window.ErkaSupabase.getPublicSlots(date);
            remoteSlots.set(date, slots || []);
            remoteBlocks.set(date, (await blocksPromise) || []);
            return;
        }
        // Fallback via API (using ERKA_API_BASE)
        var res = await fetch((window.ERKA_API_BASE || '') + '/api/slots?date=' + date);
        if (res.ok) {
            var data = await res.json();
            remoteSlots.set(date, data.slots || []);
        } else {
            remoteSlots.set(date, []);
        }
        remoteBlocks.set(date, (await blocksPromise) || []);
    } catch (e) {
        remoteSlots.set(date, []);
        if (!remoteBlocks.has(date)) remoteBlocks.set(date, []);
    }
}
function areConsecutiveFree(date, field, startMin, count) {
    for (var i = 0; i < count; i++) {
        var t = startMin + i * SLOT_DURATION;
        if (t + SLOT_DURATION > OPEN_END_MIN) return false;
        if (isBooked(date, field, t)) return false;
        if (isBlocked(date, field, t)) return false;
        if (isPast(date, t)) return false;
    }
    return true;
}

/** Öffentliche Beschriftung für gesperrte Slots */
function blockLabel(block) {
    if (!block) return 'Gesperrt';
    if (block.block_type === 'training') return 'Training';
    if (block.block_type === 'event') return 'Event';
    return 'Gesperrt';
}
function isPast(date, startMin) {
    var now = new Date();
    var dt = new Date(date + 'T00:00:00');
    dt.setMinutes(startMin);
    return dt < now;
}

// ---------- Matrix rendern ----------
async function renderMatrix() {
    var body = document.getElementById('bmBody');
    if (!body) return;
    var ds = dateStr(state.viewDate);

    // Remote-Slots holen (falls noch nicht)
    if (!remoteSlots.has(ds)) await fetchRemoteSlots(ds);

    var slots = generateSlots();

    body.innerHTML = slots.map(function (startMin) {
        var timeStr = minToTime(startMin);
        var endStr = minToTime(startMin + SLOT_DURATION);
        var row = '<div class="bm-row">' +
            '<div class="bm-time">' + timeStr + '<small>–' + endStr + '</small></div>';
        for (var field = 1; field <= 4; field++) {
            var booked = isBooked(ds, field, startMin);
            var block = getBlock(ds, field, startMin);
            var past = isPast(ds, startMin);
            var price = getSlotPrice(startMin);
            var cls = 'free', content = '<span class="slot-label">Frei</span><span class="slot-price">' + price + ' €</span>';
            if (past) { cls = 'past'; content = 'vorbei'; }
            else if (block) { cls = 'blocked'; content = '<i class="fas fa-lock"></i><span class="slot-label">' + blockLabel(block) + '</span>'; }
            else if (booked) { cls = 'busy'; content = 'belegt'; }
            var data = !past && !booked && !block
                ? 'data-field="' + field + '" data-start="' + startMin + '" data-date="' + ds + '"'
                : '';
            row += '<div class="bm-slot ' + cls + '" ' + data + '>' + content + '</div>';
        }
        row += '</div>';
        return row;
    }).join('');

    // Click-Handler fuer freie Slots
    body.querySelectorAll('.bm-slot.free').forEach(function (el) {
        el.addEventListener('click', function () {
            openSlotModal({
                date: el.dataset.date,
                field: +el.dataset.field,
                startMin: +el.dataset.start
            });
        });
    });

    // Date-Label aktualisieren
    var label = state.viewDate.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
    var today = new Date();
    var isToday = dateStr(state.viewDate) === dateStr(today);
    var todayEl = document.getElementById('bmToday');
    if (todayEl) todayEl.style.opacity = isToday ? '0.5' : '1';
    var dateEl = document.getElementById('bmDate');
    if (dateEl) dateEl.textContent = (isToday ? 'Heute · ' : '') + label;
}

// ---------- Navigation ----------
function setupNav() {
    document.getElementById('bmPrev')?.addEventListener('click', function () {
        var d = new Date(state.viewDate);
        d.setDate(d.getDate() - 1);
        state.viewDate = d;
        renderMatrix();
    });
    document.getElementById('bmNext')?.addEventListener('click', function () {
        var d = new Date(state.viewDate);
        d.setDate(d.getDate() + 1);
        state.viewDate = d;
        renderMatrix();
    });
    document.getElementById('bmToday')?.addEventListener('click', function () {
        state.viewDate = new Date();
        renderMatrix();
    });
}

// ---------- Slot-Modal ----------
function openSlotModal(sel) {
    state.selectedSlot = sel;
    var modal = document.getElementById('slotModal');
    if (!modal) return;

    // Datum-Input setzen
    var dateInput = document.getElementById('smDate');
    if (dateInput) {
        dateInput.value = sel.date;
        dateInput.min = dateStr(new Date());
    }
    // Feld-Select
    var fieldSel = document.getElementById('smField');
    if (fieldSel) fieldSel.value = sel.field;
    // Start-Select fuellen
    fillStartSelect(sel.date, sel.field, sel.startMin);

    updateSlotModalUI();
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    // Auto-Prefill Account-Daten falls eingeloggt
    if (window.currentUser) {
        var user = window.currentUser();
        if (user) {
            if (!document.getElementById('smName').value) document.getElementById('smName').value = user.name;
            if (!document.getElementById('smEmail').value) document.getElementById('smEmail').value = user.email;
            if (!document.getElementById('smPhone').value) document.getElementById('smPhone').value = user.phone || '';
        }
    }
}

function closeSlotModal() {
    var modal = document.getElementById('slotModal');
    if (!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
}

function fillStartSelect(date, field, currentStart) {
    var sel = document.getElementById('smStart');
    if (!sel) return;
    var slots = generateSlots();
    sel.innerHTML = slots.map(function (startMin) {
        var past = isPast(date, startMin);
        var booked = isBooked(date, field, startMin);
        var blocked = isBlocked(date, field, startMin);
        var disabled = past || booked || blocked;
        var suffix = past ? ' (vorbei)' : blocked ? ' (gesperrt)' : booked ? ' (belegt)' : '';
        return '<option value="' + startMin + '" ' + (disabled ? 'disabled' : '') + ' ' + (startMin === currentStart ? 'selected' : '') + '>' + slotLabel(startMin) + suffix + '</option>';
    }).join('');
}

function updateSlotModalUI() {
    var s = state.selectedSlot;
    if (!s) return;
    var slotCount = +document.querySelector('input[name="smSlots"]:checked')?.value || 1;
    var dateLabel = new Date(s.date).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
    var title = document.getElementById('smTitle');
    var sub = document.getElementById('smSub');
    var totalSlot = document.getElementById('smTotalSlot');
    var totalPrice = document.getElementById('smTotalPrice');
    var confirmText = document.getElementById('smConfirmText');
    var ball = document.getElementById('smBall')?.checked;
    var method = document.querySelector('input[name="smPayMethod"]:checked')?.value || 'stripe';

    // Preis berechnen: jeder Folge-Slot hat seinen eigenen Preis
    var total = 0;
    for (var i = 0; i < slotCount; i++) {
        total += getSlotPrice(s.startMin + i * SLOT_DURATION);
    }
    total += (ball ? BALL_PRICE : 0);
    var totalMin = slotCount * SLOT_DURATION;
    var durLabel = totalMin >= 60
        ? Math.floor(totalMin / 60) + (totalMin % 60 ? ':' + (totalMin % 60) : '') + ' Std.'
        : totalMin + ' Min';
    var endMin = s.startMin + totalMin;
    var rangeLabel = minToTime(s.startMin) + ' – ' + minToTime(endMin);

    // Disable Dauer-Optionen wenn zusammenhaengende Slots belegt
    document.querySelectorAll('input[name="smSlots"]').forEach(function (r) {
        var c = +r.value;
        var canBook = areConsecutiveFree(s.date, s.field, s.startMin, c);
        // Aktuellen Slot immer erlauben, nur fortlaufende pruefen
        r.disabled = c > 1 && !canBook;
    });

    if (title) title.textContent = FIELDS[s.field] + ' · ' + minToTime(s.startMin) + ' Uhr';
    if (sub) sub.textContent = dateLabel + ' · ' + durLabel + ' · ' + rangeLabel;
    if (totalSlot) totalSlot.textContent = FIELDS[s.field] + ', ' + rangeLabel;
    if (totalPrice) totalPrice.textContent = total.toFixed(2).replace('.', ',') + ' €';
    if (confirmText) {
        confirmText.textContent = method === 'stripe'
            ? 'Jetzt bezahlen · ' + total.toFixed(2).replace('.', ',') + ' €'
            : 'Reservieren · ' + total.toFixed(2).replace('.', ',') + ' € vor Ort';
    }
}

// ---------- Slot-Aenderung im Modal ----------
function wireSlotChange() {
    var dateI = document.getElementById('smDate');
    var fieldI = document.getElementById('smField');
    var startI = document.getElementById('smStart');

    function applyChange() {
        var d = dateI?.value || state.selectedSlot.date;
        var f = +fieldI?.value || state.selectedSlot.field;
        // falls Start-Select noch nicht gefuellt, fuer neue Date/Field neu fuellen
        fillStartSelect(d, f, +startI.value || state.selectedSlot.startMin);
        var s = +startI.value || state.selectedSlot.startMin;
        state.selectedSlot = { date: d, field: f, startMin: s };
        updateSlotModalUI();
    }
    dateI?.addEventListener('change', function () { fillStartSelect(dateI.value, +fieldI.value, +startI.value); applyChange(); });
    fieldI?.addEventListener('change', function () { fillStartSelect(dateI.value, +fieldI.value, +startI.value); applyChange(); });
    startI?.addEventListener('change', applyChange);
    document.getElementById('smBall')?.addEventListener('change', updateSlotModalUI);
    document.querySelectorAll('input[name="smPayMethod"]').forEach(function (r) {
        r.addEventListener('change', updateSlotModalUI);
    });
    document.querySelectorAll('input[name="smSlots"]').forEach(function (r) {
        r.addEventListener('change', updateSlotModalUI);
    });
}

// ---------- Buchung bestaetigen ----------
function confirmBooking() {
    var s = state.selectedSlot;
    if (!s) return;

    var name = document.getElementById('smName').value.trim();
    var email = document.getElementById('smEmail').value.trim();
    var phone = document.getElementById('smPhone').value.trim();
    var players = +document.getElementById('smPlayers').value;
    var ball = document.getElementById('smBall').checked;
    var method = document.querySelector('input[name="smPayMethod"]:checked')?.value || 'stripe';

    if (!name || !email) {
        showToast('Bitte Name und E-Mail angeben.', 'error');
        return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showToast('E-Mail-Adresse ungueltig.', 'error');
        return;
    }
    var slotCount = +document.querySelector('input[name="smSlots"]:checked')?.value || 1;
    if (!areConsecutiveFree(s.date, s.field, s.startMin, slotCount)) {
        showToast('Einer der Slots wurde gerade belegt. Kuerzer buchen.', 'error');
        updateSlotModalUI();
        return;
    }

    var total = 0;
    for (var i = 0; i < slotCount; i++) {
        total += getSlotPrice(s.startMin + i * SLOT_DURATION);
    }
    total += (ball ? BALL_PRICE : 0);
    var totalMin = slotCount * SLOT_DURATION;
    var booking = {
        id: 'EB' + Date.now().toString(36).toUpperCase(),
        date: s.date,
        field: s.field,
        startMin: s.startMin,
        slotCount: slotCount,
        durationMin: totalMin,
        // Kompatibilitaet mit altem Modell:
        hour: Math.floor(s.startMin / 60),
        duration: slotCount,
        name: name, email: email, phone: phone, players: players, ball: ball,
        total: total,
        payMethod: method,
        createdAt: new Date().toISOString()
    };

    if (method === 'stripe' && window.ErkaPay) {
        window.ErkaPay.startCheckout(booking);
        closeSlotModal();
    } else {
        state.bookings.push(booking);
        saveBookings();
        if (window.ErkaPay) {
            window.ErkaPay.completeBooking(booking, { method: 'onsite', status: 'reserved' });
        } else {
            showConfirmation(booking, { sent: false, reason: 'fallback' });
        }
        closeSlotModal();
        renderMatrix();
    }
}

// Fuer Stripe-Flow: Buchung wird aus ErkaPay.completeBooking heraus persistiert
window.erkaBookingSave = function (booking) {
    var idx = state.bookings.findIndex(function (b) { return b.id === booking.id; });
    if (idx >= 0) state.bookings[idx] = booking;
    else state.bookings.push(booking);
    saveBookings();
    renderMatrix();
};

// ---------- Confirmation-Modal ----------
window.showBookingConfirmation = function (b, mailStatus) {
    showConfirmation(b, mailStatus);
};

function showConfirmation(b, mailStatus) {
    mailStatus = mailStatus || {};
    var dateLabel = new Date(b.date).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
    var time = slotLabel(b.startMin, b.slotCount || 1);
    var paid = b.payment?.method === 'stripe' && b.payment?.status === 'paid';
    var headline = paid ? 'Bezahlt & gebucht!' : 'Reserviert!';
    var subline = paid
        ? 'Transaktion ' + (b.payment.transactionId || '').substring(0, 14) + '…'
        : 'Zahlung vor Ort bei Anreise';

    var mailInfo = '';
    if (mailStatus.sent) mailInfo = '<div class="mail-status ok">Bestaetigung an <strong>' + b.email + '</strong> gesendet</div>';
    else if (mailStatus.reason === 'demo') mailInfo = '<div class="mail-status demo">Demo-Modus: Keine echte Mail. Bitte manuell senden.</div>';
    else if (mailStatus.reason === 'error') mailInfo = '<div class="mail-status err">Mailversand fehlgeschlagen. Bitte manuell.</div>';

    var mailto = 'mailto:beach@evv2000.de?cc=' + encodeURIComponent(b.email) + '&subject=' + encodeURIComponent('Buchung ' + b.id + ' – ' + b.name) + '&body=' + encodeURIComponent(
        'Hallo Beachwart,\n\nhiermit bestaetige ich meine Buchung auf der Erka Beach (EVV 2000):\n\nCode: ' + b.id +
        '\nPlatz: ' + FIELDS[b.field] +
        '\nDatum: ' + dateLabel +
        '\nZeit: ' + time +
        '\nSpieler: ' + b.players +
        '\nBall leihen: ' + (b.ball ? 'Ja (+5 €)' : 'Nein') +
        '\nGesamt: ' + b.total.toFixed(2).replace('.', ',') + ' €' +
        '\nZahlung: ' + (paid ? 'Online bezahlt (Stripe)' : 'Vor Ort bar') +
        '\n\nName: ' + b.name +
        '\nE-Mail: ' + b.email +
        '\nTelefon: ' + (b.phone || '—') +
        '\n\nViele Gruesse\n' + b.name
    );

    var totalLine = paid
        ? '<div class="cd-row cd-total"><span>Bezahlt</span><strong style="color:#1e40af;">' + b.total.toFixed(2).replace('.', ',') + ' €</strong></div>'
        : '<div class="cd-row cd-total"><span>Vor Ort</span><strong>' + b.total.toFixed(2).replace('.', ',') + ' €</strong></div>';

    var modal = document.createElement('div');
    modal.className = 'modal open';
    modal.id = 'confirmModal';
    modal.innerHTML =
        '<div class="modal-box confirmation-box">' +
            '<div class="confirm-head ' + (paid ? 'paid' : '') + '">' +
                '<div class="confirm-check">' + (paid ? '💳' : '✓') + '</div>' +
                '<h3>' + headline + '</h3>' +
                '<p>' + subline + '</p>' +
            '</div>' +
            '<div class="confirm-body">' +
                '<div class="confirm-code">' +
                    '<span>Buchungscode</span>' +
                    '<strong>' + b.id + '</strong>' +
                '</div>' +
                mailInfo +
                '<div class="confirm-details">' +
                    '<div class="cd-row"><span>Platz</span><strong>' + FIELDS[b.field] + '</strong></div>' +
                    '<div class="cd-row"><span>Datum</span><strong>' + dateLabel + '</strong></div>' +
                    '<div class="cd-row"><span>Zeit</span><strong>' + time + '</strong></div>' +
                    '<div class="cd-row"><span>Spieler</span><strong>' + b.players + '</strong></div>' +
                    (b.ball ? '<div class="cd-row"><span>Ball leihen</span><strong>✓ +5 €</strong></div>' : '') +
                    totalLine +
                '</div>' +
                '<div class="confirm-actions">' +
                    (!mailStatus.sent ? '<a href="' + mailto + '" class="btn-neon btn-neon-lg">Per Mail bestätigen</a>' : '') +
                    '<button class="btn btn-ghost btn-full" onclick="closeConfirmation()">Schließen</button>' +
                '</div>' +
                '<p class="confirm-note">Bitte Code <strong>' + b.id + '</strong> beim Check-in nennen. Storno bis 24h vorher kostenfrei.</p>' +
            '</div>' +
        '</div>';
    document.body.appendChild(modal);
}
window.closeConfirmation = function () {
    document.getElementById('confirmModal')?.remove();
};

// ---------- Init ----------
document.addEventListener('DOMContentLoaded', function () {
    setupNav();
    renderMatrix();
    wireSlotChange();
    document.getElementById('slotClose')?.addEventListener('click', closeSlotModal);
    document.getElementById('slotModal')?.addEventListener('click', function (e) {
        if (e.target.id === 'slotModal') closeSlotModal();
    });
    document.getElementById('smConfirm')?.addEventListener('click', confirmBooking);
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closeSlotModal();
    });
    // Alle 60s neu rendern (Past-Marker aktualisieren)
    setInterval(renderMatrix, 60000);
    window.addEventListener('storage', function () {
        state.bookings = loadBookings();
        renderMatrix();
    });
});

// ---------- Realtime Subscription ----------
document.addEventListener('DOMContentLoaded', function () {
    // Subscribe to realtime booking changes if Supabase is ready
    if (window.ErkaSupabase) {
        window.ErkaSupabase.init().then(function () {
            if (window.ErkaSupabase.ready) {
                window.ErkaSupabase.subscribeBookings(function (payload) {
                    // Clear remote cache for affected date and re-render
                    var date = payload.new?.date || payload.old?.date;
                    if (date) {
                        remoteSlots.delete(date);
                        remoteBlocks.delete(date);
                        if (dateStr(state.viewDate) === date) {
                            renderMatrix();
                        }
                    }
                });
                // Auch auf Sperren (Training) live reagieren
                window.ErkaSupabase.subscribeBlocks(function (payload) {
                    var date = payload.new?.date || payload.old?.date;
                    if (date) {
                        remoteSlots.delete(date);
                        remoteBlocks.delete(date);
                        if (dateStr(state.viewDate) === date) {
                            renderMatrix();
                        }
                    }
                });
            }
        });
    }
});

// Exposed fuer andere Module
window.ErkaBooking = { FIELDS: FIELDS, SLOT_PRICE: SLOT_PRICE, SLOT_PRICE_EVENING: SLOT_PRICE_EVENING, SLOT_DURATION: SLOT_DURATION, getSlotPrice: getSlotPrice, slotLabel: slotLabel, renderMatrix: renderMatrix };
