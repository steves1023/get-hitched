-- People limits: the couple (owner + one partner) never counts.
-- Free: 2 other people. Wedding Pass: 5 other people + any extra seats bought at $1.99 each.

alter table public.entitlements add column extra_seats int not null default 0 check (extra_seats >= 0);

-- Stripe can deliver the same webhook more than once; this table makes processing idempotent.
create table public.processed_stripe_events (
  id           text primary key,
  processed_at timestamptz not null default now()
);
alter table public.processed_stripe_events enable row level security;  -- no policies: service role only

create or replace function public.seat_limit(w uuid) returns int
language sql stable security definer set search_path = public as $$
  select case when public.has_pass(w)
              then 5 + coalesce((select extra_seats from public.entitlements where wedding_id = w), 0)
              else 2 end
$$;

-- People besides the couple: current members, plus (optionally) open invites that would take a seat.
create or replace function public.seats_used(w uuid, include_pending boolean) returns int
language sql stable security definer set search_path = public as $$
  select (select count(*) from public.wedding_members
          where wedding_id = w and role not in ('owner','partner'))::int
       + case when include_pending then
           (select count(*) from public.invites
            where wedding_id = w and role <> 'partner' and accepted_at is null and expires_at > now())::int
         else 0 end
$$;

-- Block invites that couldn't be accepted, so couples find out before sending.
create or replace function public.check_invite_capacity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role = 'partner' then
    if exists (select 1 from public.wedding_members where wedding_id = new.wedding_id and role = 'partner')
       or exists (select 1 from public.invites where wedding_id = new.wedding_id and role = 'partner'
                  and accepted_at is null and expires_at > now()) then
      raise exception 'PARTNER_EXISTS';
    end if;
  elsif public.seats_used(new.wedding_id, true) >= public.seat_limit(new.wedding_id) then
    raise exception 'SEAT_LIMIT';
  end if;
  return new;
end $$;
create trigger invites_capacity before insert on public.invites
  for each row execute function public.check_invite_capacity();

-- accept_invite: same as before, with the seat rules replacing the old 4-person cap.
create or replace function public.accept_invite(p_token text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  inv public.invites;
  mid uuid;
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
    if inv.role = 'partner' then
      if exists (select 1 from public.wedding_members where wedding_id = inv.wedding_id and role = 'partner') then
        raise exception 'PARTNER_EXISTS';
      end if;
    elsif public.seats_used(inv.wedding_id, false) >= public.seat_limit(inv.wedding_id) then
      raise exception 'SEAT_LIMIT';
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

-- Called only by the Stripe webhook (service role).
create or replace function public.record_stripe_event(p_id text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  insert into public.processed_stripe_events (id) values (p_id);
  return true;
exception when unique_violation then
  return false;
end $$;

create or replace function public.add_extra_seats(p_wedding uuid, p_qty int) returns int
language plpgsql security definer set search_path = public as $$
declare total int;
begin
  if p_qty is null or p_qty < 1 then raise exception 'BAD_QUANTITY'; end if;
  insert into public.entitlements (wedding_id, plan, extra_seats) values (p_wedding, 'free', p_qty)
  on conflict (wedding_id) do update set extra_seats = public.entitlements.extra_seats + p_qty
  returning extra_seats into total;
  return total;
end $$;

revoke execute on function public.record_stripe_event(text)     from public, anon, authenticated;
revoke execute on function public.add_extra_seats(uuid, int)    from public, anon, authenticated;
grant  execute on function public.record_stripe_event(text)     to service_role;
grant  execute on function public.add_extra_seats(uuid, int)    to service_role;
