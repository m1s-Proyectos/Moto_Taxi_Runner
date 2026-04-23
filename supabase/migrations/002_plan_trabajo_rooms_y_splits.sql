-- Alineado con `Plan_Trabajo_Mototaxi_Runner.pdf` (Fase 3: salas; splits para desempate)
-- Ejecuta después de `001_race_runs.sql` en el SQL Editor de Supabase

-- Salas: código, estado, seed de pista opcional (mismo layout para ambos clientes)
create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  status text not null check (status in ('waiting', 'racing', 'finished')) default 'waiting',
  created_at timestamptz not null default now(),
  seed int null
);

comment on table public.rooms is 'Multijugador v1: sala por código; Fase 3 del plan.';

create index if not exists rooms_code_idx on public.rooms (code);
create index if not exists rooms_status_idx on public.rooms (status);

alter table public.rooms enable row level security;

create policy "rooms_select_anon"
  on public.rooms
  for select
  to anon
  using (true);

create policy "rooms_insert_anon"
  on public.rooms
  for insert
  to anon
  with check (true);

create policy "rooms_update_anon"
  on public.rooms
  for update
  to anon
  using (true)
  with check (true);

-- Splits: tiempo acumulado al completar Pupy y Papá (crono solo en fase «racing»; sirve para desempate)
alter table public.race_runs
  add column if not exists room_id uuid references public.rooms (id) on delete set null,
  add column if not exists split_pupy_ms integer,
  add column if not exists split_papa_ms integer;

comment on column public.race_runs.split_pupy_ms is 'Ms acumulados al completar parada 1 (Pupy)';
comment on column public.race_runs.split_papa_ms is 'Ms acumulados al completar parada 2 (Papá); tramo a mamá = time_ms - split_papa';

alter table public.race_runs
  add constraint race_runs_splits_order
  check (
    (split_pupy_ms is null and split_papa_ms is null)
    or (
      split_pupy_ms is not null
      and split_papa_ms is not null
      and split_pupy_ms >= 0
      and split_papa_ms >= split_pupy_ms
      and time_ms >= split_papa_ms
    )
  );

create index if not exists race_runs_room_id_idx on public.race_runs (room_id);