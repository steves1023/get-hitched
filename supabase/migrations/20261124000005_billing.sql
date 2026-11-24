-- Plans, usage tracking, and free-tier limits enforced in the database.

create table public.entitlements (
  wedding_id             uuid primary key references public.weddings(id) on delete cascade,
  plan                   text not null default 'free' check (plan in ('free','pass','monthly')),
  valid_until            date,
  stripe_customer_id     text,
  stripe_subscription_id text,
  updated_at             timestamptz not null default now()
);
create trigger entitlements_updated before update on public.entitlements
  for each row execute function public.set_updated_at();
alter table public.entitlements enable row level security;
create policy entitlements_select on public.entitlements for select using (public.is_member(wedding_id));
-- No client writes: only the Stripe webhook (service role) changes plans.

create table public.usage_events (
  id         bigint generated always as identity primary key,
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  kind       text not null,
  created_at timestamptz not null default now()
);
create index usage_events_lookup_idx on public.usage_events(wedding_id, kind, created_at);
alter table public.usage_events enable row level security;
create policy usage_events_select on public.usage_events for select using (public.is_couple(wedding_id));

create or replace function public.has_pass(w uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.entitlements
    where wedding_id = w and plan <> 'free'
      and (valid_until is null or valid_until >= current_date)
  )
$$;

-- Limit triggers. Error messages are codes the frontend maps to friendly text.
create or replace function public.enforce_guest_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_pass(new.wedding_id)
     and (select count(*) from public.guests where wedding_id = new.wedding_id) >= 50 then
    raise exception 'FREE_LIMIT_GUESTS';
  end if;
  return new;
end $$;
create trigger guests_limit before insert on public.guests
  for each row execute function public.enforce_guest_limit();

create or replace function public.enforce_vision_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_pass(new.wedding_id)
     and (select count(*) from public.vision_items where wedding_id = new.wedding_id) >= 20 then
    raise exception 'FREE_LIMIT_VISION';
  end if;
  return new;
end $$;
create trigger vision_limit before insert on public.vision_items
  for each row execute function public.enforce_vision_limit();

create or replace function public.enforce_files_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare cap bigint := case when public.has_pass(new.wedding_id) then 2147483648 else 52428800 end; -- 2 GB / 50 MB
begin
  if (select coalesce(sum(size_bytes), 0) from public.files where wedding_id = new.wedding_id) + new.size_bytes > cap then
    raise exception 'FILES_STORAGE_FULL';
  end if;
  return new;
end $$;
create trigger files_limit before insert on public.files
  for each row execute function public.enforce_files_limit();

create or replace function public.require_pass() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_pass(new.wedding_id) then
    raise exception 'PASS_REQUIRED';
  end if;
  return new;
end $$;
create trigger seating_requires_pass before insert on public.seating_tables
  for each row execute function public.require_pass();
create trigger day_items_require_pass before insert on public.day_items
  for each row execute function public.require_pass();
