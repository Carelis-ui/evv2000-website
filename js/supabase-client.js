/* ==============================================
   Erka Beach - Supabase Client (Browser)
   EVV2000 Edition - uses ERKA_API_BASE for remote API
   - Loads Config via (ERKA_API_BASE)/api/config
   - Exports window.supabase + Helper
============================================== */

(function () {
    window.ErkaSupabase = {
        client: null,
        ready: false,
        readyPromise: null,

        async init() {
            if (this.readyPromise) return this.readyPromise;

            this.readyPromise = (async () => {
                try {
                    // Lokales file://-Oeffnen -> Demo-Modus, keine API
                    if (location.protocol === 'file:') {
                        console.info('Erka Beach laeuft im Demo-Modus (file://). Fuer echte Auth/DB: lokalen Webserver oder Vercel-Deploy nutzen.');
                        window.ErkaConfig = { demoMode: true };
                        this.ready = false;
                        return;
                    }

                    // Config vom Server holen (via ERKA_API_BASE)
                    const res = await fetch((window.ERKA_API_BASE || '') + '/api/config');
                    const cfg = res.ok ? await res.json() : {};
                    window.ErkaConfig = cfg;

                    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
                        console.info('Supabase nicht konfiguriert – Demo-Modus (localStorage)');
                        this.ready = false;
                        return;
                    }

                    // Supabase-Lib muss vorher per <script> geladen sein
                    if (!window.supabase) {
                        console.warn('Supabase JS SDK fehlt');
                        return;
                    }

                    this.client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
                        auth: {
                            persistSession: true,
                            autoRefreshToken: true,
                            detectSessionInUrl: true
                        }
                    });
                    this.ready = true;

                    // Auth-Events
                    this.client.auth.onAuthStateChange((event, session) => {
                        window.dispatchEvent(new CustomEvent('erka:auth', { detail: { event, session } }));
                    });
                } catch (err) {
                    console.error('Supabase init error:', err);
                }
            })();

            return this.readyPromise;
        },

        /** Aktuellen User laden */
        async getUser() {
            await this.init();
            if (!this.ready) return null;
            const { data } = await this.client.auth.getUser();
            return data.user;
        },

        /** Profil (name, phone etc.) */
        async getProfile() {
            const user = await this.getUser();
            if (!user) return null;
            const { data } = await this.client
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .single();
            return data;
        },

        /** Registrierung */
        async signUp(email, password, name, phone) {
            await this.init();
            if (!this.ready) throw new Error('Demo-Modus');
            const { data, error } = await this.client.auth.signUp({
                email,
                password,
                options: { data: { name } }
            });
            if (error) throw error;
            // Profil-Update (phone)
            if (data.user && phone) {
                await this.client.from('profiles').update({ phone }).eq('id', data.user.id);
            }
            return data;
        },

        /** Login */
        async signIn(email, password) {
            await this.init();
            if (!this.ready) throw new Error('Demo-Modus');
            const { data, error } = await this.client.auth.signInWithPassword({ email, password });
            if (error) throw error;
            return data;
        },

        /** Logout */
        async signOut() {
            if (!this.ready) return;
            await this.client.auth.signOut();
        },

        /** Buchungen des eingeloggten Users holen */
        async getMyBookings() {
            const user = await this.getUser();
            if (!user) return [];
            const { data, error } = await this.client
                .from('bookings')
                .select('*')
                .eq('user_id', user.id)
                .order('date', { ascending: true });
            if (error) { console.error(error); return []; }
            return data || [];
        },

        /** Buchung stornieren */
        async cancelBooking(id) {
            if (!this.ready) return;
            const { error } = await this.client
                .from('bookings')
                .update({ cancelled_at: new Date().toISOString(), pay_status: 'cancelled' })
                .eq('id', id);
            if (error) throw error;
        },

        /** Belegte Slots fuer ein Datum (oeffentlich via View) */
        async getPublicSlots(date) {
            await this.init();
            if (!this.ready) {
                // Fallback auf LocalStorage
                try {
                    const local = JSON.parse(localStorage.getItem('erka_bookings_v2') || '[]');
                    return local
                        .filter(b => b.date === date && !b.cancelled_at)
                        .map(b => ({ date: b.date, field: b.field, start_min: b.startMin, slot_count: b.slotCount || 1 }));
                } catch { return []; }
            }
            const { data } = await this.client
                .from('public_slots')
                .select('date, field, start_min, slot_count')
                .eq('date', date);
            return data || [];
        },

        /** Realtime: auf Buchungsaenderungen horchen */
        subscribeBookings(callback) {
            if (!this.ready) return null;
            return this.client
                .channel('bookings_realtime')
                .on('postgres_changes',
                    { event: '*', schema: 'public', table: 'bookings' },
                    callback
                )
                .subscribe();
        },

        /** Gesperrte Slots (Training etc.) fuer ein Datum — oeffentlich lesbar */
        async getPublicBlocks(date) {
            await this.init();
            if (!this.ready) return [];
            try {
                const { data, error } = await this.client
                    .from('beach_blocks')
                    .select('date, field, start_min, slot_count, reason, block_type')
                    .eq('date', date);
                if (error) return [];
                return data || [];
            } catch { return []; }
        },

        /** Realtime: auf Aenderungen der Beach-Sperren horchen */
        subscribeBlocks(callback) {
            if (!this.ready) return null;
            return this.client
                .channel('beach_blocks_realtime')
                .on('postgres_changes',
                    { event: '*', schema: 'public', table: 'beach_blocks' },
                    callback
                )
                .subscribe();
        }
    };

    // Auto-Init bei DOM-Ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => window.ErkaSupabase.init());
    } else {
        window.ErkaSupabase.init();
    }
})();
