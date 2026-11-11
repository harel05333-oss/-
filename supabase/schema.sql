-- TEAM HAREL virtual races: database schema and security rules for Supabase.
-- Paste the whole file into Supabase > SQL Editor and run it once.
--
-- Security model
--   * Every table has Row Level Security on. Visitors can never read or write
--     the registrations/results tables directly.
--   * Visitors act only through the functions at the bottom, which validate
--     every input and expose only safe columns (never tokens or IPs).
--   * Only users listed in `admins` can create races or approve results.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------- admins
create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);
alter table public.admins enable row level security;
-- No policies on purpose: the list of admins is not readable through the API.

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- ----------------------------------------------------------------- races
do $$ begin
  create type public.race_status as enum ('draft', 'open', 'closed');
exception when duplicate_object then null; end $$;

create table if not exists public.races (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (char_length(title) between 2 and 80),
  race_date    date not null,
  window_start time not null,
  window_end   time not null,
  distance_km  numeric(5,2) not null check (distance_km > 0 and distance_km <= 100),
  status       public.race_status not null default 'draft',
  max_runners  integer not null default 500 check (max_runners between 1 and 5000),
  created_at   timestamptz not null default now(),
  check (window_end > window_start)
);
alter table public.races enable row level security;

drop policy if exists races_read on public.races;
create policy races_read on public.races
  for select using (status <> 'draft' or public.is_admin());

drop policy if exists races_admin_insert on public.races;
create policy races_admin_insert on public.races
  for insert with check (public.is_admin());

drop policy if exists races_admin_update on public.races;
create policy races_admin_update on public.races
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists races_admin_delete on public.races;
create policy races_admin_delete on public.races
  for delete using (public.is_admin());

-- The start window is entered as Israel wall-clock time; these turn it into
-- real instants. Exposed by the API as computed columns starts_at / ends_at.
create or replace function public.starts_at(r public.races)
returns timestamptz language sql stable
as $$ select (r.race_date + r.window_start) at time zone 'Asia/Jerusalem'; $$;

create or replace function public.ends_at(r public.races)
returns timestamptz language sql stable
as $$ select (r.race_date + r.window_end) at time zone 'Asia/Jerusalem'; $$;

-- --------------------------------------------------------- registrations
create table if not exists public.registrations (
  id         uuid primary key default gen_random_uuid(),
  race_id    uuid not null references public.races (id) on delete cascade,
  name       text not null check (char_length(name) between 2 and 40),
  city       text not null check (char_length(city) between 2 and 40),
  token_hash text not null,
  ip         inet,
  created_at timestamptz not null default now()
);
create unique index if not exists registrations_unique_runner
  on public.registrations (race_id, lower(name), lower(city));
create index if not exists registrations_race_ip on public.registrations (race_id, ip);
alter table public.registrations enable row level security;

drop policy if exists registrations_admin_read on public.registrations;
create policy registrations_admin_read on public.registrations
  for select using (public.is_admin());

drop policy if exists registrations_admin_delete on public.registrations;
create policy registrations_admin_delete on public.registrations
  for delete using (public.is_admin());

-- --------------------------------------------------------------- results
create table if not exists public.results (
  registration_id uuid primary key references public.registrations (id) on delete cascade,
  race_id         uuid not null references public.races (id) on delete cascade,
  strava_url      text not null check (char_length(strava_url) <= 200),
  claimed_seconds integer not null check (claimed_seconds between 60 and 86400),
  final_seconds   integer check (final_seconds between 60 and 86400),
  status          text not null default 'pending'
                  check (status in ('pending', 'approved', 'rejected')),
  admin_note      text check (char_length(admin_note) <= 200),
  submitted_at    timestamptz not null default now(),
  reviewed_at     timestamptz,
  check (status <> 'approved' or final_seconds is not null)
);
create index if not exists results_race on public.results (race_id, status, final_seconds);
alter table public.results enable row level security;

drop policy if exists results_admin_read on public.results;
create policy results_admin_read on public.results
  for select using (public.is_admin());

drop policy if exists results_admin_update on public.results;
create policy results_admin_update on public.results
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists results_admin_delete on public.results;
create policy results_admin_delete on public.results
  for delete using (public.is_admin());

-- --------------------------------------------------------------- helpers
create or replace function public.clean_text(p text)
returns text language sql immutable
as $$ select btrim(regexp_replace(coalesce(p, ''), '\s+', ' ', 'g')); $$;

-- Names and cities: letters, digits, spaces and a few punctuation marks only.
create or replace function public.valid_label(p text)
returns boolean language sql immutable
as $$
  select char_length(p) between 2 and 40
     and p !~ '[<>{}\[\]\\/@#$%^*=+|~`;:_]'
     and p !~* '(https?|www\.)';
$$;

create or replace function public.client_ip()
returns inet language plpgsql stable
as $$
declare h text;
begin
  h := current_setting('request.headers', true);
  if h is null or h = '' then return null; end if;
  return nullif(btrim(split_part(h::json ->> 'x-forwarded-for', ',', 1)), '')::inet;
exception when others then
  return null;
end $$;

-- ---------------------------------------------------- public: register
create or replace function public.register_runner(p_race uuid, p_name text, p_city text)
returns json
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  r        public.races;
  v_name   text := public.clean_text(p_name);
  v_city   text := public.clean_text(p_city);
  v_ip     inet := public.client_ip();
  v_token  text := encode(gen_random_bytes(24), 'hex');
  v_id     uuid;
begin
  select * into r from public.races where id = p_race;
  if not found or r.status <> 'open' or now() >= public.ends_at(r) then
    raise exception 'RACE_CLOSED';
  end if;
  if not public.valid_label(v_name) or not public.valid_label(v_city) then
    raise exception 'BAD_INPUT';
  end if;
  if (select count(*) from public.registrations where race_id = p_race) >= r.max_runners then
    raise exception 'RACE_FULL';
  end if;
  -- At most 5 registrations per race from one network address.
  if v_ip is not null and
     (select count(*) from public.registrations where race_id = p_race and ip = v_ip) >= 5 then
    raise exception 'TOO_MANY';
  end if;
  begin
    insert into public.registrations (race_id, name, city, token_hash, ip)
    values (p_race, v_name, v_city, encode(digest(v_token, 'sha256'), 'hex'), v_ip)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'DUPLICATE';
  end;
  return json_build_object('registration_id', v_id, 'token', v_token);
end $$;

-- ----------------------------------------------- public: submit a result
create or replace function public.submit_result(
  p_registration uuid, p_token text, p_strava_url text, p_seconds integer)
returns json
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  reg   public.registrations;
  r     public.races;
  v_url text := btrim(coalesce(p_strava_url, ''));
  cur   public.results;
begin
  select * into reg from public.registrations where id = p_registration;
  if not found or p_token is null
     or reg.token_hash <> encode(digest(p_token, 'sha256'), 'hex') then
    raise exception 'NOT_REGISTERED';
  end if;
  select * into r from public.races where id = reg.race_id;
  if r.status = 'draft' or now() < public.starts_at(r) then
    raise exception 'NOT_STARTED';
  end if;
  -- Results are accepted until 12 hours after the start window closes.
  if now() > public.ends_at(r) + interval '12 hours' then
    raise exception 'TOO_LATE';
  end if;
  if char_length(v_url) > 200
     or (v_url !~ '^https://(www\.)?strava\.com/activities/[0-9]+([/?][A-Za-z0-9_=&%./-]*)?$'
         and v_url !~ '^https://strava\.app\.link/[A-Za-z0-9_-]+$') then
    raise exception 'BAD_LINK';
  end if;
  -- Faster than 2:30 per km is not a real result; slower than 20:00 per km is not a run.
  if p_seconds is null or p_seconds < r.distance_km * 150 or p_seconds > r.distance_km * 1200 then
    raise exception 'BAD_TIME';
  end if;
  select * into cur from public.results where registration_id = reg.id;
  if found and cur.status = 'approved' then
    raise exception 'ALREADY_APPROVED';
  end if;
  insert into public.results (registration_id, race_id, strava_url, claimed_seconds)
  values (reg.id, reg.race_id, v_url, p_seconds)
  on conflict (registration_id) do update
    set strava_url = excluded.strava_url,
        claimed_seconds = excluded.claimed_seconds,
        status = 'pending', final_seconds = null, admin_note = null,
        submitted_at = now(), reviewed_at = null;
  return json_build_object('status', 'pending');
end $$;

-- --------------------------------------- public: a runner's own result
create or replace function public.my_result(p_registration uuid, p_token text)
returns json
language plpgsql stable security definer
set search_path = public, extensions
as $$
declare reg public.registrations; res public.results;
begin
  select * into reg from public.registrations where id = p_registration;
  if not found or p_token is null
     or reg.token_hash <> encode(digest(p_token, 'sha256'), 'hex') then
    return json_build_object('registered', false);
  end if;
  select * into res from public.results where registration_id = reg.id;
  if not found then
    return json_build_object('registered', true, 'status', 'none');
  end if;
  return json_build_object('registered', true, 'status', res.status,
    'claimed_seconds', res.claimed_seconds, 'final_seconds', res.final_seconds,
    'admin_note', res.admin_note);
end $$;

-- ------------------------------------------- public: who is registered
create or replace function public.race_runners(p_race uuid)
returns table (name text, city text)
language sql stable security definer
set search_path = public
as $$
  select g.name, g.city
  from public.registrations g
  join public.races r on r.id = g.race_id
  where g.race_id = p_race and r.status <> 'draft'
  order by g.created_at;
$$;

-- ------------------------------------------------- public: leaderboard
create or replace function public.leaderboard(p_race uuid)
returns table (name text, city text, seconds integer)
language sql stable security definer
set search_path = public
as $$
  select g.name, g.city, s.final_seconds
  from public.results s
  join public.registrations g on g.id = s.registration_id
  join public.races r on r.id = s.race_id
  where s.race_id = p_race and s.status = 'approved' and r.status <> 'draft'
  order by s.final_seconds, s.submitted_at;
$$;

-- ----------------------------------------------------------- privileges
revoke all on function public.register_runner(uuid, text, text) from public;
revoke all on function public.submit_result(uuid, text, text, integer) from public;
revoke all on function public.my_result(uuid, text) from public;
revoke all on function public.race_runners(uuid) from public;
revoke all on function public.leaderboard(uuid) from public;
grant execute on function public.register_runner(uuid, text, text) to anon, authenticated;
grant execute on function public.submit_result(uuid, text, text, integer) to anon, authenticated;
grant execute on function public.my_result(uuid, text) to anon, authenticated;
grant execute on function public.race_runners(uuid) to anon, authenticated;
grant execute on function public.leaderboard(uuid) to anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;

-- ---------------------------------------------------------------------
-- After running this file: create your user under Authentication > Users,
-- then make it the admin (replace the email):
--
--   insert into public.admins (user_id)
--   select id from auth.users where email = 'you@example.com';
