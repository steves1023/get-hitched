-- Room design: walls, half walls and dividers drawn as line segments (feet), plus areas and columns.

create table public.room_walls (
  id         uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  kind       text not null default 'wall' check (kind in ('wall','half_wall','divider')),
  x1 numeric not null, y1 numeric not null,
  x2 numeric not null, y2 numeric not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (x1 <> x2 or y1 <> y2)
);
create index room_walls_wedding_idx on public.room_walls (wedding_id);
create trigger room_walls_updated before update on public.room_walls
  for each row execute function public.set_updated_at();
alter table public.room_walls enable row level security;
create policy room_walls_select on public.room_walls for select using (public.my_access(wedding_id, 'seating') in ('read','edit'));
create policy room_walls_insert on public.room_walls for insert with check (public.my_access(wedding_id, 'seating') = 'edit');
create policy room_walls_update on public.room_walls for update
  using (public.my_access(wedding_id, 'seating') = 'edit') with check (public.my_access(wedding_id, 'seating') = 'edit');
create policy room_walls_delete on public.room_walls for delete using (public.my_access(wedding_id, 'seating') = 'edit');

alter table public.room_items drop constraint if exists room_items_kind_check;
alter table public.room_items add constraint room_items_kind_check
  check (kind in ('dance_floor','dj','bar','stage','entrance','cake','buffet','area','column'));

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.room_walls;
  end if;
end $$;
