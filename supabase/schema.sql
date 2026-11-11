-- TEAM HAREL virtual races: database schema and security rules for Supabase.
-- Paste the whole file into Supabase > SQL Editor and run it once.
--
-- Security model
--   * Every table has Row Level Security on. Visitors can never read or write
--     the runners/registrations/results tables directly.
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
-- Optional money: an entry fee, a link where runners pay it, and a prize note.
alter table public.races add column if not exists fee_ils integer not null default 0
  check (fee_ils between 0 and 10000);
alter table public.races add column if not exists pay_url text
  check (pay_url is null or (char_length(pay_url) <= 300 and pay_url ~ '^https://[A-Za-z0-9.-]+/'));
alter table public.races add column if not exists prize text
  check (prize is null or char_length(prize) <= 200);
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

-- --------------------------------------------------------------- runners
-- A runner creates a user once (name and city) and gets a secret token that
-- stays on their phone. Only the hash of the token is stored.
create table if not exists public.runners (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 2 and 40),
  city       text not null check (char_length(city) between 2 and 40),
  token_hash text not null,
  ip         inet,
  created_at timestamptz not null default now()
);
create unique index if not exists runners_unique_person
  on public.runners (lower(name), lower(city));
create index if not exists runners_ip_time on public.runners (ip, created_at);
alter table public.runners enable row level security;

drop policy if exists runners_admin_read on public.runners;
create policy runners_admin_read on public.runners
  for select using (public.is_admin());

drop policy if exists runners_admin_delete on public.runners;
create policy runners_admin_delete on public.runners
  for delete using (public.is_admin());

-- --------------------------------------------------------- registrations
create table if not exists public.registrations (
  id         uuid primary key default gen_random_uuid(),
  race_id    uuid not null references public.races (id) on delete cascade,
  runner_id  uuid not null references public.runners (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (race_id, runner_id)
);
create index if not exists registrations_runner on public.registrations (runner_id);
-- The admin ticks this when a runner has paid the entry fee.
alter table public.registrations add column if not exists paid boolean not null default false;
alter table public.registrations enable row level security;

drop policy if exists registrations_admin_read on public.registrations;
create policy registrations_admin_read on public.registrations
  for select using (public.is_admin());

drop policy if exists registrations_admin_update on public.registrations;
create policy registrations_admin_update on public.registrations
  for update using (public.is_admin()) with check (public.is_admin());

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
-- What the automatic checks noticed when the result was submitted.
alter table public.results add column if not exists flags text[] not null default '{}';
-- One activity link can be used once per race (ignoring anything after ? or #).
create unique index if not exists results_unique_link
  on public.results (race_id, lower(regexp_replace(strava_url, '[?#].*$', '')));
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

-- Activity links are accepted only from the sites runners actually record on.
create or replace function public.valid_activity_url(p text)
returns boolean language sql immutable
as $$
  select char_length(p) <= 200
     and p ~ ('^https://(www\.strava\.com|strava\.com|strava\.app\.link|connect\.garmin\.com'
           || '|flow\.polar\.com|(www\.|maps\.)?suunto\.com|([a-z0-9-]+\.)?coros\.com)'
           || '/[A-Za-z0-9_=&%.?/#~+-]{1,170}$');
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

-- Returns the runner when the id and secret token match, otherwise null.
create or replace function public.runner_by_token(p_runner uuid, p_token text)
returns public.runners
language sql stable security definer
set search_path = public, extensions
as $$
  select r from public.runners r
  where r.id = p_runner and p_token is not null
    and r.token_hash = encode(digest(p_token, 'sha256'), 'hex');
$$;
revoke all on function public.runner_by_token(uuid, text) from public, anon, authenticated;

-- ------------------------------------------------ public: create a user
create or replace function public.create_runner(p_name text, p_city text)
returns json
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_name  text := public.clean_text(p_name);
  v_city  text := public.clean_text(p_city);
  v_ip    inet := public.client_ip();
  v_token text := encode(gen_random_bytes(24), 'hex');
  v_id    uuid;
begin
  if not public.valid_label(v_name) or not public.valid_label(v_city) then
    raise exception 'BAD_INPUT';
  end if;
  -- At most 20 new users an hour from one network address. Mobile carriers
  -- put many phones behind one address, so the limit is not tighter.
  if v_ip is not null and
     (select count(*) from public.runners
      where ip = v_ip and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'TOO_MANY';
  end if;
  if (select count(*) from public.runners) >= 20000 then
    raise exception 'SITE_FULL';
  end if;
  begin
    insert into public.runners (name, city, token_hash, ip)
    values (v_name, v_city, encode(digest(v_token, 'sha256'), 'hex'), v_ip)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'DUPLICATE';
  end;
  return json_build_object('runner_id', v_id, 'token', v_token, 'name', v_name, 'city', v_city);
end $$;

-- ------------------------------------------- public: is my user valid
create or replace function public.runner_me(p_runner uuid, p_token text)
returns json
language plpgsql stable security definer
set search_path = public, extensions
as $$
declare me public.runners := public.runner_by_token(p_runner, p_token);
begin
  if me.id is null then return json_build_object('ok', false); end if;
  return json_build_object('ok', true, 'name', me.name, 'city', me.city);
end $$;

-- ------------------------------------------------- public: join a race
create or replace function public.join_race(p_race uuid, p_runner uuid, p_token text)
returns json
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  me public.runners := public.runner_by_token(p_runner, p_token);
  r  public.races;
  v_id uuid;
begin
  if me.id is null then raise exception 'NO_USER'; end if;
  select * into r from public.races where id = p_race;
  if not found or r.status <> 'open' or now() >= public.ends_at(r) then
    raise exception 'RACE_CLOSED';
  end if;
  select id into v_id from public.registrations where race_id = p_race and runner_id = me.id;
  if found then return json_build_object('registration_id', v_id); end if;
  if (select count(*) from public.registrations where race_id = p_race) >= r.max_runners then
    raise exception 'RACE_FULL';
  end if;
  insert into public.registrations (race_id, runner_id) values (p_race, me.id)
  returning id into v_id;
  return json_build_object('registration_id', v_id);
end $$;

-- ----------------------------------------------- public: submit a result
create or replace function public.submit_result(
  p_race uuid, p_runner uuid, p_token text, p_strava_url text, p_seconds integer)
returns json
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  me    public.runners := public.runner_by_token(p_runner, p_token);
  reg   public.registrations;
  r     public.races;
  v_url text := btrim(coalesce(p_strava_url, ''));
  cur   public.results;
  v_flags text[] := '{}';
begin
  if me.id is null then raise exception 'NO_USER'; end if;
  select * into reg from public.registrations where race_id = p_race and runner_id = me.id;
  if not found then raise exception 'NOT_REGISTERED'; end if;
  select * into r from public.races where id = reg.race_id;
  if r.status = 'draft' or now() < public.starts_at(r) then
    raise exception 'NOT_STARTED';
  end if;
  -- Results are accepted until 12 hours after the start window closes.
  if now() > public.ends_at(r) + interval '12 hours' then
    raise exception 'TOO_LATE';
  end if;
  if not public.valid_activity_url(v_url) then
    raise exception 'BAD_LINK';
  end if;
  -- Faster than 2:30 per km is not a real result; slower than 20:00 per km is not a run.
  if p_seconds is null or p_seconds < r.distance_km * 150 or p_seconds > r.distance_km * 1200 then
    raise exception 'BAD_TIME';
  end if;
  -- Nobody can have finished before the window opened plus their own running time.
  if now() < public.starts_at(r) + make_interval(secs => p_seconds) - interval '1 minute' then
    raise exception 'TOO_EARLY';
  end if;
  -- Faster than 3:00 per km is possible but rare: accept it and mark it for a closer look.
  if p_seconds < r.distance_km * 180 then v_flags := array_append(v_flags, 'FAST_PACE'); end if;
  select * into cur from public.results where registration_id = reg.id;
  if found and cur.status = 'approved' then
    raise exception 'ALREADY_APPROVED';
  end if;
  begin
    insert into public.results (registration_id, race_id, strava_url, claimed_seconds, flags)
    values (reg.id, reg.race_id, v_url, p_seconds, v_flags)
    on conflict (registration_id) do update
      set strava_url = excluded.strava_url,
          claimed_seconds = excluded.claimed_seconds,
          flags = excluded.flags,
          status = 'pending', final_seconds = null, admin_note = null,
          submitted_at = now(), reviewed_at = null;
  exception when unique_violation then
    raise exception 'DUP_LINK';   -- another runner already sent this activity
  end;
  return json_build_object('status', 'pending');
end $$;

-- --------------------------- public: my registration and result in a race
create or replace function public.my_result(p_race uuid, p_runner uuid, p_token text)
returns json
language plpgsql stable security definer
set search_path = public, extensions
as $$
declare
  me  public.runners := public.runner_by_token(p_runner, p_token);
  reg public.registrations;
  res public.results;
begin
  if me.id is null then return json_build_object('user', false); end if;
  select * into reg from public.registrations where race_id = p_race and runner_id = me.id;
  if not found then return json_build_object('user', true, 'registered', false); end if;
  select * into res from public.results where registration_id = reg.id;
  if not found then
    return json_build_object('user', true, 'registered', true, 'status', 'none');
  end if;
  return json_build_object('user', true, 'registered', true, 'status', res.status,
    'claimed_seconds', res.claimed_seconds, 'final_seconds', res.final_seconds,
    'admin_note', res.admin_note);
end $$;

-- ------------------------------------------- public: who is registered
create or replace function public.race_runners(p_race uuid)
returns table (name text, city text)
language sql stable security definer
set search_path = public
as $$
  select u.name, u.city
  from public.registrations g
  join public.runners u on u.id = g.runner_id
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
  select u.name, u.city, s.final_seconds
  from public.results s
  join public.registrations g on g.id = s.registration_id
  join public.runners u on u.id = g.runner_id
  join public.races r on r.id = s.race_id
  where s.race_id = p_race and s.status = 'approved' and r.status <> 'draft'
  order by s.final_seconds, s.submitted_at;
$$;

-- ------------------------------------- public: how many users signed up
create or replace function public.runner_count()
returns integer
language sql stable security definer
set search_path = public
as $$ select count(*)::integer from public.runners; $$;

-- ----------------------------------------------------------- privileges
revoke all on function public.create_runner(text, text) from public;
revoke all on function public.runner_me(uuid, text) from public;
revoke all on function public.join_race(uuid, uuid, text) from public;
revoke all on function public.submit_result(uuid, uuid, text, text, integer) from public;
revoke all on function public.my_result(uuid, uuid, text) from public;
revoke all on function public.race_runners(uuid) from public;
revoke all on function public.leaderboard(uuid) from public;
revoke all on function public.runner_count() from public;
grant execute on function public.create_runner(text, text) to anon, authenticated;
grant execute on function public.runner_me(uuid, text) to anon, authenticated;
grant execute on function public.join_race(uuid, uuid, text) to anon, authenticated;
grant execute on function public.submit_result(uuid, uuid, text, text, integer) to anon, authenticated;
grant execute on function public.my_result(uuid, uuid, text) to anon, authenticated;
grant execute on function public.race_runners(uuid) to anon, authenticated;
grant execute on function public.leaderboard(uuid) to anon, authenticated;
grant execute on function public.runner_count() to anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;

-- ---------------------------------------------------------------------
-- After running this file: create your user under Authentication > Users,
-- then make it the admin (replace the email):
--
--   insert into public.admins (user_id)
--   select id from auth.users where email = 'you@example.com';
