-- ==================================================
-- Erka Beach / EVV 2000 - Events + Sponsoren
-- Ausführen NACHDEM schema-v2-reset.sql durch ist.
-- Idempotent - kann mehrfach laufen.
-- ==================================================

-- ============ EVENTS ============
create table if not exists public.events (
    id uuid primary key default gen_random_uuid(),
    title text not null,
    description text,
    category text default 'Turnier',      -- 'Turnier', 'Training', 'Feier', 'Sonstiges'
    location text,                         -- 'Karl-Fischer Halle', 'Erka Beach', 'Extern'
    starts_at timestamptz not null,
    ends_at timestamptz,
    price_cents integer default 0,         -- 0 = kostenlos
    max_participants integer,
    signup_url text,                       -- Link zur Anmeldung
    signup_email text default 'kontakt@evv2000.de',
    image_url text,
    is_published boolean default true,
    is_highlighted boolean default false,  -- als "wichtig" markieren
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);
alter table public.events enable row level security;
drop policy if exists "events_public_read" on public.events;
create policy "events_public_read" on public.events for select using (is_published = true);
create index if not exists events_starts_idx on public.events(starts_at) where is_published = true;

-- ============ SPONSOREN ============
create table if not exists public.sponsors (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    tier text default 'Partner',           -- 'Haupt', 'Gold', 'Silber', 'Bronze', 'Partner'
    logo_url text,
    website_url text,
    description text,
    sort_order integer default 100,
    is_visible boolean default true,
    valid_until date,                      -- Vertragslaufzeit (optional)
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);
alter table public.sponsors enable row level security;
drop policy if exists "sponsors_public_read" on public.sponsors;
create policy "sponsors_public_read" on public.sponsors for select using (is_visible = true);
create index if not exists sponsors_sort_idx on public.sponsors(sort_order, name);

-- ============ REALTIME ============
do $$
begin
    if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
        create publication supabase_realtime;
    end if;
end $$;
alter publication supabase_realtime add table public.events;
alter publication supabase_realtime add table public.sponsors;

-- ============ SEED (Beispieldaten) ============
insert into public.events (title, description, category, location, starts_at, ends_at, price_cents, is_highlighted)
values
    ('Midsommar-Cup 2026', '4vs4 Mixed Beachvolleyball-Turnier zur Sommersonnenwende. Alle Level willkommen!', 'Turnier', 'Erka Beach', '2026-06-20 11:00'::timestamptz, '2026-06-21 00:00'::timestamptz, 4000, true),
    ('SNBFM-Turnier', 'Stadtmeisterschaft der Erkelenzer Nacht-Beachvolleyball-Freaks. Hobbyturnier mit Flair.', 'Turnier', 'Erka Beach', '2026-08-29 10:00'::timestamptz, '2026-08-29 22:00'::timestamptz, 3000, false),
    ('ERKA-Turnier', 'Hallen-Klassiker des EVV 2000 in der Erka-Halle. Traditionelles Saisonhighlight.', 'Turnier', 'Erka-Halle', '2026-10-15 09:00'::timestamptz, '2026-10-15 18:00'::timestamptz, 3500, false)
on conflict do nothing;

insert into public.sponsors (name, tier, website_url, sort_order)
values
    ('Sparkasse Erkelenz', 'Haupt',   'https://www.sparkasse.de', 10),
    ('Volksbank RheinAhr', 'Gold',    null,                        20),
    ('EWV Energie',        'Silber',  null,                        30),
    ('Bäckerei Müller',    'Bronze',  null,                        40),
    ('Erka-Halle',         'Partner', null,                        50)
on conflict do nothing;
