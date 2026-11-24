-- Invites, RPCs and the summary view.

create table public.invites (
  id           uuid primary key default gen_random_uuid(),
  wedding_id   uuid not null references public.weddings(id) on delete cascade,
  email        text not null,
  display_name text not null,
  role         public.member_role not null check (role <> 'owner'),
  access       jsonb not null default '{}'::jsonb,
  token        text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  expires_at   timestamptz not null default now() + interval '14 days',
  accepted_at  timestamptz,
  created_by   uuid default auth.uid() references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index invites_wedding_idx on public.invites(wedding_id);
alter table public.invites enable row level security;
create policy invites_select on public.invites for select using (public.is_couple(wedding_id));
create policy invites_insert on public.invites for insert with check (public.is_couple(wedding_id));
create policy invites_delete on public.invites for delete using (public.is_couple(wedding_id));

-- Creates a wedding plus the caller's owner membership and a free entitlement, atomically.
create or replace function public.create_wedding(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare w uuid;
begin
  if auth.uid() is null then raise exception 'NOT_SIGNED_IN'; end if;
  insert into public.weddings (partner1, partner2, last_names, wedding_date, venue, theme, total_budget, created_by)
  values (
    coalesce(nullif(trim(p->>'partner1'), ''), 'Partner 1'),
    coalesce(nullif(trim(p->>'partner2'), ''), 'Partner 2'),
    nullif(trim(p->>'last_names'), ''),
    nullif(p->>'wedding_date', '')::date,
    nullif(trim(p->>'venue'), ''),
    nullif(trim(p->>'theme'), ''),
    coalesce(nullif(p->>'total_budget', '')::numeric, 0),
    auth.uid())
  returning id into w;

  insert into public.wedding_members (wedding_id, user_id, role, display_name)
  values (w, auth.uid(), 'owner',
          coalesce(nullif(trim(p->>'display_name'), ''), coalesce(nullif(trim(p->>'partner1'), ''), 'Owner')));

  insert into public.entitlements (wedding_id, plan) values (w, 'free');
  return w;
end $$;

-- Accepts an invite for the signed-in user. The invite email must match the account email.
create or replace function public.accept_invite(p_token text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  inv public.invites;
  mid uuid;
  n   int;
begin
  if auth.uid() is null then raise exception 'NOT_SIGNED_IN'; end if;

  select * into inv from public.invites where token = p_token for update;
  if not found then raise exception 'INVITE_NOT_FOUND'; end if;

  if inv.accepted_at is not null then
    if exists (select 1 from public.wedding_members where wedding_id = inv.wedding_id and user_id = auth.uid()) then
      return inv.wedding_id;
    end if;
    raise exception 'INVITE_USED';
  end if;
  if inv.expires_at < now() then raise exception 'INVITE_EXPIRED'; end if;
  if lower(coalesce(auth.jwt()->>'email', '')) <> lower(inv.email) then
    raise exception 'INVITE_EMAIL_MISMATCH';
  end if;

  select id into mid from public.wedding_members where wedding_id = inv.wedding_id and user_id = auth.uid();
  if mid is null then
    select count(*) into n from public.wedding_members where wedding_id = inv.wedding_id;
    if not public.has_pass(inv.wedding_id) and n >= 4 then
      raise exception 'FREE_LIMIT_COLLABORATORS';
    end if;
    insert into public.wedding_members (wedding_id, user_id, role, display_name)
    values (inv.wedding_id, auth.uid(), inv.role, inv.display_name)
    returning id into mid;
  else
    update public.wedding_members set role = inv.role where id = mid and role <> 'owner';
    delete from public.member_module_access where member_id = mid;
  end if;

  insert into public.member_module_access (member_id, wedding_id, module, level)
  select mid, inv.wedding_id, key, value
  from jsonb_each_text(inv.access)
  where key in ('tasks','vendors','budget','guests','seating','day','vision','files','hashtags');

  update public.invites set accepted_at = now() where id = inv.id;
  return inv.wedding_id;
end $$;

-- Lets an assignee tick their own task without general update rights.
create or replace function public.complete_task(p_task uuid, p_done boolean) returns void
language plpgsql security definer set search_path = public as $$
declare t public.tasks;
begin
  select * into t from public.tasks where id = p_task;
  if not found then raise exception 'NOT_FOUND'; end if;
  if public.my_access(t.wedding_id, 'tasks') <> 'edit'
     and t.assignee_member_id is distinct from public.my_member_id(t.wedding_id) then
    raise exception 'NOT_ALLOWED';
  end if;
  update public.tasks set status = case when p_done then 'done' else 'todo' end where id = p_task;
end $$;

-- Same idea for wedding-day items assigned to a specific person.
create or replace function public.set_day_item_done(p_item uuid, p_done boolean) returns void
language plpgsql security definer set search_path = public as $$
declare d public.day_items;
begin
  select * into d from public.day_items where id = p_item;
  if not found then raise exception 'NOT_FOUND'; end if;
  if public.my_access(d.wedding_id, 'day') <> 'edit'
     and not exists (select 1 from public.day_item_assignees
                     where day_item_id = p_item and member_id = public.my_member_id(d.wedding_id)) then
    raise exception 'NOT_ALLOWED';
  end if;
  update public.day_items set done = p_done where id = p_item;
end $$;

revoke execute on function public.create_wedding(jsonb)            from anon;
revoke execute on function public.accept_invite(text)              from anon;
revoke execute on function public.complete_task(uuid, boolean)     from anon;
revoke execute on function public.set_day_item_done(uuid, boolean) from anon;

-- Overview and Budget numbers. security_invoker: the view obeys the caller's RLS,
-- so someone without budget access gets 0 for spent rather than the real figure.
create view public.wedding_summary with (security_invoker = true) as
select
  w.id as wedding_id,
  w.total_budget,
  (select count(*) from public.tasks t where t.wedding_id = w.id)                                     as tasks_total,
  (select count(*) from public.tasks t where t.wedding_id = w.id and t.status = 'done')               as tasks_done,
  (select coalesce(sum(g.party_size), 0) from public.guests g where g.wedding_id = w.id)              as guests_total,
  (select coalesce(sum(g.party_size), 0) from public.guests g where g.wedding_id = w.id and g.rsvp = 'yes')     as rsvp_yes,
  (select coalesce(sum(g.party_size), 0) from public.guests g where g.wedding_id = w.id and g.rsvp = 'pending') as rsvp_pending,
  (select coalesce(sum(e.amount), 0) from public.expenses e
     where e.wedding_id = w.id and e.status in ('paid','invoiced'))                                   as spent
from public.weddings w;
