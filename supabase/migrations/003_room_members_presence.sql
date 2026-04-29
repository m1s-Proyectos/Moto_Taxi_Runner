-- Presencia por sala (Fase 3): una fila por jugador en una sala identificada por código de 4 caracteres.
-- La tabla `public.rooms` en `002_plan_trabajo_rooms_y_splits.sql` es la cabecera de lobby (código único global).
-- Este modelo complementario permite listar corredores en tiempo real sin tocar esa definición.

create table if not exists public.room_members (
  id uuid primary key default gen_random_uuid(),
  room_code text not null check (char_length(room_code) = 4),
  player_id text not null,
  display_name text,
  joined_at timestamptz not null default now(),
  unique (room_code, player_id)
);

comment on table public.room_members is 'Jugadores unidos a una sala (código 4 caracteres); Supabase Realtime para lista Corredores.';

create index if not exists room_members_room_code_idx on public.room_members (room_code);

alter table public.room_members replica identity full;

alter table public.room_members enable row level security;

create policy "room_members_select_anon"
  on public.room_members
  for select
  to anon
  using (true);

create policy "room_members_insert_anon"
  on public.room_members
  for insert
  to anon
  with check (true);

create policy "room_members_delete_anon"
  on public.room_members
  for delete
  to anon
  using (true);

-- Realtime (ejecutar en SQL Editor si la línea falla por duplicado: ignorar)
alter publication supabase_realtime add table public.room_members;
