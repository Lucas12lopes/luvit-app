-- Luvit Professional UI — migration incremental e não destrutiva.
-- Execute após supabase/schema.sql no SQL Editor do Supabase.

alter table public.routes add column if not exists name text;
alter table public.routes add column if not exists paused_at timestamptz;
alter table public.routes add column if not exists actual_duration_seconds integer;
alter table public.deliveries add column if not exists complement text;
alter table public.deliveries add column if not exists postcode text;
alter table public.deliveries add column if not exists failure_reason text;
alter table public.deliveries add column if not exists started_at timestamptz;
alter table public.route_stops add column if not exists estimated_arrival timestamptz;
alter table public.route_stops add column if not exists notes text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'routes_name_length') then
    alter table public.routes add constraint routes_name_length check (name is null or char_length(name) between 1 and 160);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'routes_actual_duration_nonnegative') then
    alter table public.routes add constraint routes_actual_duration_nonnegative check (actual_duration_seconds is null or actual_duration_seconds >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'deliveries_complement_length') then
    alter table public.deliveries add constraint deliveries_complement_length check (complement is null or char_length(complement) <= 200);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'deliveries_postcode_length') then
    alter table public.deliveries add constraint deliveries_postcode_length check (postcode is null or char_length(postcode) <= 20);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'deliveries_failure_reason_length') then
    alter table public.deliveries add constraint deliveries_failure_reason_length check (failure_reason is null or char_length(failure_reason) <= 500);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'route_stops_notes_length') then
    alter table public.route_stops add constraint route_stops_notes_length check (notes is null or char_length(notes) <= 1000);
  end if;
end $$;

create index if not exists routes_user_status_idx on public.routes(user_id, status, created_at desc);
create index if not exists deliveries_user_status_idx on public.deliveries(user_id, status, position);

comment on column public.routes.name is 'Nome visível da rota, como Rota de hoje.';
comment on column public.routes.actual_duration_seconds is 'Duração real entre início e conclusão.';
comment on column public.deliveries.failure_reason is 'Motivo operacional informado quando a entrega apresenta problema.';
