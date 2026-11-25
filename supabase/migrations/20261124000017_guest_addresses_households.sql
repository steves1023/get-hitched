-- Guest mailing addresses, and families: members sit under one main guest and share their address.

alter table public.guests
  add column address1    text check (address1 is null or length(address1) <= 200),
  add column address2    text check (address2 is null or length(address2) <= 200),
  add column city        text check (city is null or length(city) <= 100),
  add column state       text check (state is null or length(state) <= 100),
  add column postal_code text check (postal_code is null or length(postal_code) <= 20),
  add column country     text check (country is null or length(country) <= 60),
  add column primary_guest_id uuid references public.guests(id) on delete set null;
create index guests_primary_idx on public.guests (primary_guest_id);

-- One level only: a family member can't have members of their own, and both must be on the same wedding.
create or replace function public.check_household() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.primary_guest_id is null then return new; end if;
  if new.primary_guest_id = new.id then raise exception 'HOUSEHOLD_SELF'; end if;
  if not exists (select 1 from public.guests g where g.id = new.primary_guest_id
                 and g.wedding_id = new.wedding_id and g.primary_guest_id is null) then
    raise exception 'HOUSEHOLD_INVALID';
  end if;
  if exists (select 1 from public.guests g where g.primary_guest_id = new.id) then
    raise exception 'HOUSEHOLD_HAS_MEMBERS';
  end if;
  return new;
end $$;
create trigger guests_household before insert or update of primary_guest_id on public.guests
  for each row execute function public.check_household();
