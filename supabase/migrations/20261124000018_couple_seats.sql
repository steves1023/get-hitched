-- The couple can be seated like anyone else, without adding themselves as guests.
-- Each wedding gets two hidden guest rows (couple_role partner1/partner2) that only the Seating tab shows.

alter table public.guests add column couple_role text check (couple_role in ('partner1','partner2'));
create unique index guests_couple_role_uniq on public.guests (wedding_id, couple_role) where couple_role is not null;

create or replace function public.ensure_couple_guests(w uuid) returns void
language sql security definer set search_path = public as $$
  insert into public.guests (wedding_id, name, side, rsvp, party_size, couple_role)
  select wd.id, x.name, x.role, 'yes', 1, x.role
  from public.weddings wd
  cross join lateral (values (wd.partner1, 'partner1'), (wd.partner2, 'partner2')) as x(name, role)
  where wd.id = w
    and not exists (select 1 from public.guests g where g.wedding_id = wd.id and g.couple_role = x.role)
$$;

create or replace function public.couple_guests_on_wedding() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.ensure_couple_guests(new.id);
  elsif new.partner1 is distinct from old.partner1 or new.partner2 is distinct from old.partner2 then
    update public.guests set name = new.partner1 where wedding_id = new.id and couple_role = 'partner1';
    update public.guests set name = new.partner2 where wedding_id = new.id and couple_role = 'partner2';
  end if;
  return null;
end $$;
create trigger weddings_couple_guests after insert or update of partner1, partner2 on public.weddings
  for each row execute function public.couple_guests_on_wedding();

-- Existing weddings get their couple rows now.
select public.ensure_couple_guests(id) from public.weddings;

-- Headcounts on the Overview leave the couple out, like the Guests tab.
create or replace view public.wedding_summary with (security_invoker = true) as
select
  w.id as wedding_id,
  w.total_budget,
  (select count(*) from public.tasks t where t.wedding_id = w.id)                                     as tasks_total,
  (select count(*) from public.tasks t where t.wedding_id = w.id and t.status = 'done')               as tasks_done,
  (select coalesce(sum(g.party_size), 0) from public.guests g where g.wedding_id = w.id and g.couple_role is null)                     as guests_total,
  (select coalesce(sum(g.party_size), 0) from public.guests g where g.wedding_id = w.id and g.couple_role is null and g.rsvp = 'yes')     as rsvp_yes,
  (select coalesce(sum(g.party_size), 0) from public.guests g where g.wedding_id = w.id and g.couple_role is null and g.rsvp = 'pending') as rsvp_pending,
  (select coalesce(sum(e.amount), 0) from public.expenses e
     where e.wedding_id = w.id and e.status in ('paid','invoiced'))                                   as spent
from public.weddings w;
