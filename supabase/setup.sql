-- Schéma du suivi nominatif du portfolio.
-- À exécuter une seule fois dans l'éditeur SQL du projet Supabase.

create table if not exists public.visitor_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  company text,
  consent_version text,
  consented_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.visitor_consents (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  consent_version text not null,
  action text not null check (action in ('granted', 'withdrawn')),
  occurred_at timestamptz not null default now()
);

create table if not exists public.visitor_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_name text not null,
  page_path text not null,
  page_title text,
  referrer text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists visitor_events_user_time_idx
  on public.visitor_events (user_id, occurred_at desc);

create index if not exists visitor_events_name_time_idx
  on public.visitor_events (event_name, occurred_at desc);

alter table public.visitor_profiles enable row level security;
alter table public.visitor_consents enable row level security;
alter table public.visitor_events enable row level security;

create or replace function public.create_visitor_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.visitor_profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_create_visitor_profile on auth.users;
create trigger on_auth_user_created_create_visitor_profile
  after insert on auth.users
  for each row execute procedure public.create_visitor_profile();

drop policy if exists "Visitors can read their own profile" on public.visitor_profiles;
create policy "Visitors can read their own profile"
  on public.visitor_profiles for select
  to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "Visitors can complete their own profile" on public.visitor_profiles;
create policy "Visitors can complete their own profile"
  on public.visitor_profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists "Visitors can record their own consent" on public.visitor_consents;
create policy "Visitors can record their own consent"
  on public.visitor_consents for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Visitors can record their own events" on public.visitor_events;
create policy "Visitors can record their own events"
  on public.visitor_events for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

revoke all on public.visitor_profiles from anon;
revoke all on public.visitor_consents from anon;
revoke all on public.visitor_events from anon;

grant select on public.visitor_profiles to authenticated;
grant update (full_name, company, consent_version, consented_at, updated_at)
  on public.visitor_profiles to authenticated;
grant insert on public.visitor_consents to authenticated;
grant insert on public.visitor_events to authenticated;
