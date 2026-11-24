-- One table per tab. Every row carries wedding_id so RLS can key on it.

create table public.tasks (
  id                 uuid primary key default gen_random_uuid(),
  wedding_id         uuid not null references public.weddings(id) on delete cascade,
  title              text not null,
  category           text not null default 'Other',
  due_date           date,
  status             text not null default 'todo' check (status in ('todo','done')),
  assignee_member_id uuid references public.wedding_members(id) on delete set null,
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table public.vendors (
  id           uuid primary key default gen_random_uuid(),
  wedding_id   uuid not null references public.weddings(id) on delete cascade,
  name         text not null,
  category     text not null default 'Other',
  status       text not null default 'researching'
               check (status in ('researching','booked','deposit_paid','paid_in_full')),
  contact_name text,
  phone        text,
  email        text,
  url          text,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Money lives apart from vendor contacts so a planner can see one without the other.
create table public.vendor_payments (
  id         uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  vendor_id  uuid not null unique references public.vendors(id) on delete cascade,
  total      numeric(12,2) not null default 0,
  paid       numeric(12,2) not null default 0,
  due_date   date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.expenses (
  id         uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  label      text not null,
  category   text not null default 'Other',
  vendor_id  uuid references public.vendors(id) on delete set null,
  amount     numeric(12,2) not null default 0,
  status     text not null default 'planned' check (status in ('planned','invoiced','paid')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.seating_tables (
  id         uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  label      text not null,
  shape      text not null default 'round' check (shape in ('round','rect')),
  capacity   int  not null default 8 check (capacity between 1 and 40),
  x          numeric not null default 500,   -- SVG viewBox units (1000 x 380)
  y          numeric not null default 190,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.guests (
  id         uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  name       text not null,
  side       text not null default 'both' check (side in ('partner1','partner2','both')),
  rsvp       text not null default 'pending' check (rsvp in ('pending','yes','no')),
  party_size int  not null default 1 check (party_size between 1 and 20),
  dietary    text,
  email      text,
  table_id   uuid references public.seating_tables(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.day_items (
  id           uuid primary key default gen_random_uuid(),
  wedding_id   uuid not null references public.weddings(id) on delete cascade,
  start_time   time not null,
  title        text not null,
  who          text,
  location     text,
  duration_min int check (duration_min is null or duration_min between 1 and 1440),
  phase        text not null default 'ceremony'
               check (phase in ('morning_prep','getting_ready','ceremony','reception')),
  audience     text not null default 'everyone'
               check (audience in ('everyone','wedding_party','couple_only')),
  done         boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.day_item_assignees (
  day_item_id uuid not null references public.day_items(id) on delete cascade,
  member_id   uuid not null references public.wedding_members(id) on delete cascade,
  wedding_id  uuid not null references public.weddings(id) on delete cascade,
  primary key (day_item_id, member_id)
);

create table public.vision_items (
  id           uuid primary key default gen_random_uuid(),
  wedding_id   uuid not null references public.weddings(id) on delete cascade,
  storage_path text not null,
  caption      text,
  category     text not null default 'venue'
               check (category in ('flowers','venue','attire','food','palette')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.files (
  id           uuid primary key default gen_random_uuid(),
  wedding_id   uuid not null references public.weddings(id) on delete cascade,
  storage_path text not null,
  name         text not null,
  size_bytes   bigint not null check (size_bytes between 0 and 10485760),
  mime_type    text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.hashtags (
  id         uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  tag        text not null,
  vibe       text,
  starred    boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (wedding_id, tag)
);

-- updated_at triggers and wedding_id indexes for every module table
do $$
declare t text;
begin
  foreach t in array array['tasks','vendors','vendor_payments','expenses','seating_tables',
                           'guests','day_items','vision_items','files','hashtags'] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_updated', t);
    execute format('create index %I on public.%I (wedding_id)', t || '_wedding_idx', t);
  end loop;
end $$;
create index day_item_assignees_member_idx on public.day_item_assignees(member_id);
create index tasks_assignee_idx on public.tasks(assignee_member_id);
