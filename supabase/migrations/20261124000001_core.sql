-- Core: weddings and the people on each wedding
create extension if not exists pgcrypto;

create type public.member_role as enum ('owner','partner','planner','family','wedding_party','vendor');

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create table public.weddings (
  id                 uuid primary key default gen_random_uuid(),
  partner1           text not null,
  partner2           text not null,
  last_names         text,
  wedding_date       date,
  venue              text,
  theme              text,
  total_budget       numeric(12,2) not null default 0,
  notes              text not null default '',
  spicy_confirmed_at timestamptz,
  created_by         uuid references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create trigger weddings_updated before update on public.weddings
  for each row execute function public.set_updated_at();

-- No email column on purpose: every member can read this table,
-- so it holds only what other members should see.
create table public.wedding_members (
  id           uuid primary key default gen_random_uuid(),
  wedding_id   uuid not null references public.weddings(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         public.member_role not null,
  display_name text not null,
  created_at   timestamptz not null default now(),
  unique (wedding_id, user_id)
);
create index wedding_members_user_idx on public.wedding_members(user_id);
