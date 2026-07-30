-- Execute este arquivo no SQL Editor de um projeto Supabase novo.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '' check (char_length(name) <= 120),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.routes (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'planned' check (status in ('planned','active','completed','cancelled')),
  started_at timestamptz, completed_at timestamptz, total_distance_meters integer check (total_distance_meters is null or total_distance_meters >= 0),
  estimated_duration_seconds integer check (estimated_duration_seconds is null or estimated_duration_seconds >= 0),
  start_latitude double precision check (start_latitude is null or start_latitude between -90 and 90),
  start_longitude double precision check (start_longitude is null or start_longitude between -180 and 180), created_at timestamptz not null default now()
);
create table if not exists public.deliveries (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  address text not null check (char_length(address) between 1 and 500), normalized_address text not null check (char_length(normalized_address) between 1 and 500),
  latitude double precision check (latitude is null or latitude between -90 and 90), longitude double precision check (longitude is null or longitude between -180 and 180),
  neighborhood text, city text, state text, notes text check (notes is null or char_length(notes) <= 2000),
  status text not null default 'pending' check (status in ('pending','active','completed','skipped','cancelled')), position integer not null default 0 check (position >= 0),
  route_id uuid references public.routes(id) on delete set null, created_at timestamptz not null default now(), completed_at timestamptz,
  unique(user_id, id)
);
create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  address text not null check (char_length(address) between 1 and 500), normalized_address text not null check (char_length(normalized_address) between 1 and 500),
  latitude double precision check (latitude is null or latitude between -90 and 90), longitude double precision check (longitude is null or longitude between -180 and 180), created_at timestamptz not null default now(),
  unique(user_id, normalized_address), unique(user_id, id)
);
create table if not exists public.route_stops (
  id uuid primary key default gen_random_uuid(), route_id uuid not null references public.routes(id) on delete cascade,
  delivery_id uuid not null references public.deliveries(id) on delete cascade, position integer not null check (position >= 0),
  status text not null default 'pending' check (status in ('pending','active','completed','skipped','cancelled')), completed_at timestamptz, created_at timestamptz not null default now(), unique(route_id, delivery_id), unique(route_id, position)
);
create index if not exists deliveries_user_position_idx on public.deliveries(user_id, position);
create index if not exists deliveries_user_route_idx on public.deliveries(user_id, route_id);
create index if not exists deliveries_normalized_idx on public.deliveries(user_id, normalized_address);
create index if not exists favorites_user_idx on public.favorites(user_id);
create index if not exists routes_user_created_idx on public.routes(user_id, created_at desc);
create index if not exists route_stops_route_position_idx on public.route_stops(route_id, position);

create or replace function public.set_updated_at() returns trigger language plpgsql set search_path = '' as $$ begin new.updated_at = now(); return new; end; $$;
drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin insert into public.profiles(id, name) values(new.id, coalesce(new.raw_user_meta_data ->> 'name', '')) on conflict(id) do nothing; return new; end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

alter table public.profiles enable row level security; alter table public.deliveries enable row level security;
alter table public.favorites enable row level security; alter table public.routes enable row level security; alter table public.route_stops enable row level security;
create policy "profiles_select_own" on public.profiles for select using ((select auth.uid()) = id);
create policy "profiles_insert_own" on public.profiles for insert with check ((select auth.uid()) = id);
create policy "profiles_update_own" on public.profiles for update using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "profiles_delete_own" on public.profiles for delete using ((select auth.uid()) = id);
create policy "deliveries_select_own" on public.deliveries for select using ((select auth.uid()) = user_id);
create policy "deliveries_insert_own" on public.deliveries for insert with check ((select auth.uid()) = user_id);
create policy "deliveries_update_own" on public.deliveries for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "deliveries_delete_own" on public.deliveries for delete using ((select auth.uid()) = user_id);
create policy "favorites_select_own" on public.favorites for select using ((select auth.uid()) = user_id);
create policy "favorites_insert_own" on public.favorites for insert with check ((select auth.uid()) = user_id);
create policy "favorites_update_own" on public.favorites for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "favorites_delete_own" on public.favorites for delete using ((select auth.uid()) = user_id);
create policy "routes_select_own" on public.routes for select using ((select auth.uid()) = user_id);
create policy "routes_insert_own" on public.routes for insert with check ((select auth.uid()) = user_id);
create policy "routes_update_own" on public.routes for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "routes_delete_own" on public.routes for delete using ((select auth.uid()) = user_id);
create policy "route_stops_select_own" on public.route_stops for select using (exists(select 1 from public.routes r where r.id = route_id and r.user_id = (select auth.uid())));
create policy "route_stops_insert_own" on public.route_stops for insert with check (exists(select 1 from public.routes r where r.id = route_id and r.user_id = (select auth.uid())) and exists(select 1 from public.deliveries d where d.id = delivery_id and d.user_id = (select auth.uid())));
create policy "route_stops_update_own" on public.route_stops for update using (exists(select 1 from public.routes r where r.id = route_id and r.user_id = (select auth.uid()))) with check (exists(select 1 from public.routes r where r.id = route_id and r.user_id = (select auth.uid())));
create policy "route_stops_delete_own" on public.route_stops for delete using (exists(select 1 from public.routes r where r.id = route_id and r.user_id = (select auth.uid())));
grant usage on schema public to authenticated; grant select, insert, update, delete on public.profiles, public.deliveries, public.favorites, public.routes, public.route_stops to authenticated;
