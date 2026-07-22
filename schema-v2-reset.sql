-- ==================================================
-- Erka Beach - RESET & Setup v2
-- Löscht alte news/teams/team_members und legt sie sauber neu an.
-- (Buchungen, Profile, Nachrichten bleiben unangetastet!)
-- ==================================================

-- Alte Reste weg (nur die 3 neuen Tabellen)
drop table if exists public.team_members cascade;
drop table if exists public.teams cascade;
drop table if exists public.news cascade;

-- ============ NEWS ============
create table public.news (
    id uuid primary key default gen_random_uuid(),
    title text not null,
    excerpt text,
    content text,
    image_url text,
    published_at timestamptz default now(),
    is_published boolean default true,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);
alter table public.news enable row level security;
create policy "news_public_read" on public.news for select using (is_published = true);
create index news_published_idx on public.news(published_at desc) where is_published = true;

-- ============ TEAMS ============
create table public.teams (
    id uuid primary key default gen_random_uuid(),
    slug text unique,
    name text not null,
    category text,
    league text,
    description text,
    image_url text,
    contact_name text,
    contact_email text,
    contact_phone text,
    trainer text,
    training_time text,
    sort_order integer default 100,
    is_visible boolean default true,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);
alter table public.teams enable row level security;
create policy "teams_public_read" on public.teams for select using (is_visible = true);
create index teams_sort_idx on public.teams(sort_order, name);

-- ============ TEAM MEMBERS ============
create table public.team_members (
    id uuid primary key default gen_random_uuid(),
    team_id uuid references public.teams(id) on delete cascade,
    name text not null,
    role text,
    jersey_number integer,
    is_captain boolean default false,
    sort_order integer default 100,
    created_at timestamptz default now()
);
alter table public.team_members enable row level security;
create policy "team_members_public_read" on public.team_members for select using (true);
create index team_members_team_idx on public.team_members(team_id, sort_order);

-- ============ REALTIME ============
do $$
begin
    if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
        create publication supabase_realtime;
    end if;
end $$;

alter publication supabase_realtime add table public.news;
alter publication supabase_realtime add table public.teams;
alter publication supabase_realtime add table public.team_members;

-- ============ SEED DATA ============
insert into public.news (title, excerpt, content, is_published, published_at)
values
    ('Saisonstart 2026', 'Ab dem 1. Mai geht''s wieder los!', 'Nach der langen Winterpause öffnen wir am 1. Mai unsere Beachanlage. Neue Plätze, frischer Sand, alte Bekannte. Wir freuen uns auf euch!', true, now() - interval '2 days'),
    ('Midsommar-Cup Anmeldung offen', '4vs4 Mixed am 20. Juni', 'Unser traditioneller Midsommar-Cup findet dieses Jahr am 20. Juni statt. Alle Level willkommen. Anmeldung per Mail an beach@evv2000.de.', true, now() - interval '5 days');

insert into public.teams (name, category, league, description, contact_name, contact_email, sort_order)
values
    ('Männer 1',  'Senioren', 'Landesliga 1',    'Unsere erste Herrenmannschaft spielt in der Landesliga.',  'Beachwart', 'kontakt@evv2000.de', 10),
    ('Frauen 1',  'Senioren', 'Bezirksklasse 1', 'Erste Damenmannschaft mit langer Tradition.',              'Beachwart', 'kontakt@evv2000.de', 20),
    ('Hobbyts 1', 'Hobby',    'HS-Hobbyliga',    'Für Spaß am Sport ohne Ligadruck.',                        'Beachwart', 'kontakt@evv2000.de', 30),
    ('Jugend U16','Jugend',   'Bezirksliga',     'Nachwuchsförderung für 14- bis 16-Jährige.',              'Beachwart', 'kontakt@evv2000.de', 40);

-- ==================================================
-- FERTIG. Prüfen mit:
--   select * from public.news;
--   select * from public.teams;
-- ==================================================
