-- Seating to scale: a room in feet, real table sizes, room features, and guests in specific seats.

-- One room per wedding. Lives in its own table so anyone with Seating edit access can change it.
create table public.seating_layouts (
  wedding_id uuid primary key references public.weddings(id) on delete cascade,
  room_name  text,
  width_ft   numeric not null default 60 check (width_ft between 10 and 400),
  length_ft  numeric not null default 40 check (length_ft between 10 and 400),
  venue_url  text,
  updated_at timestamptz not null default now()
);
create trigger seating_layouts_updated before update on public.seating_layouts
  for each row execute function public.set_updated_at();
alter table public.seating_layouts enable row level security;
create policy seating_layouts_select on public.seating_layouts for select using (public.my_access(wedding_id, 'seating') in ('read','edit'));
create policy seating_layouts_insert on public.seating_layouts for insert with check (public.my_access(wedding_id, 'seating') = 'edit');
create policy seating_layouts_update on public.seating_layouts for update
  using (public.my_access(wedding_id, 'seating') = 'edit') with check (public.my_access(wedding_id, 'seating') = 'edit');

-- Tables get a real-world kind and rotation. Positions become feet (table centre) inside the room.
alter table public.seating_tables add column kind text not null default 'round60'
  check (kind in ('round60','round72','rect6','rect8','sweetheart'));
alter table public.seating_tables add column rotation int not null default 0 check (rotation in (0, 90));
update public.seating_tables set
  kind = case when shape = 'rect' then 'rect8' when capacity > 8 then 'round72' else 'round60' end,
  x = round((x * 60 / 1000)::numeric, 1),     -- old layout was a 1000 x 380 drawing; map it onto a 60 x 40 ft room
  y = round((y * 40 / 380)::numeric, 1);

-- Fixed features of the room.
create table public.room_items (
  id         uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  kind       text not null check (kind in ('dance_floor','dj','bar','stage','entrance','cake','buffet')),
  label      text,
  x          numeric not null,   -- centre, feet
  y          numeric not null,
  w          numeric not null check (w between 1 and 200),
  h          numeric not null check (h between 1 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index room_items_wedding_idx on public.room_items (wedding_id);
create trigger room_items_updated before update on public.room_items
  for each row execute function public.set_updated_at();
alter table public.room_items enable row level security;
create policy room_items_select on public.room_items for select using (public.my_access(wedding_id, 'seating') in ('read','edit'));
create policy room_items_insert on public.room_items for insert with check (public.my_access(wedding_id, 'seating') = 'edit');
create policy room_items_update on public.room_items for update
  using (public.my_access(wedding_id, 'seating') = 'edit') with check (public.my_access(wedding_id, 'seating') = 'edit');
create policy room_items_delete on public.room_items for delete using (public.my_access(wedding_id, 'seating') = 'edit');

-- A guest can sit in a specific chair. A party of 2+ takes the following chairs too.
alter table public.guests add column seat_index int check (seat_index is null or seat_index between 0 and 39);
create or replace function public.clear_seat_on_unseat() returns trigger
language plpgsql as $$
begin
  if new.table_id is null then new.seat_index := null; end if;  -- unseated guests have no chair
  return new;
end $$;
create trigger guests_clear_seat before insert or update on public.guests
  for each row execute function public.clear_seat_on_unseat();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.room_items, public.seating_layouts;
  end if;
end $$;
