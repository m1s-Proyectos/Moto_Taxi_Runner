-- Tiempos de carrera (práctica local + base para futuras salas / ranking)
-- Plan: `Plan_Trabajo_Mototaxi_Runner.pdf` — después corre `002_plan_trabajo_rooms_y_splits.sql` (salas + splits).
-- Ejecuta en Supabase: SQL Editor > New query > Run

create table if not exists public.race_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  time_ms integer not null,
  bike_style text not null check (bike_style in ('classic', 'urban')),
  constraint race_runs_time_ms_sane check (time_ms >= 0 and time_ms < 86400000)
);

comment on table public.race_runs is 'Carreras completadas: tiempo final y estilo de moto (Mototaxi Runner)';

-- Índice para rankings por tiempo
create index if not exists race_runs_time_ms_idx on public.race_runs (time_ms asc);
create index if not exists race_runs_created_at_idx on public.race_runs (created_at desc);

alter table public.race_runs enable row level security;

-- Clave anónima del front: insertar y leer (para tablas de posiciones luego)
create policy "race_runs_insert_anon"
  on public.race_runs
  for insert
  to anon
  with check (true);

create policy "race_runs_select_anon"
  on public.race_runs
  for select
  to anon
  using (true);
