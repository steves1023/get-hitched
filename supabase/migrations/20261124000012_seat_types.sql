-- Two kinds of paid spots beyond the couple:
--   full  = Parents and Planners ($3.99): planner, family. Everything by default; couple can hide tabs.
--   party = Wedding Party ($1.99): wedding_party, vendor. Wedding Day only: party items + items assigned to them.
-- Bride and Groom ($29.99) covers the couple only; no spots are included.

alter table public.entitlements rename column extra_seats to full_seats;
alter table public.entitlements add column party_seats int not null default 0 check (party_seats >= 0);

create or replace function public.seat_type(r public.member_role) returns text
language sql immutable as $$
  select case when r in ('planner','family') then 'full'
              when r in ('wedding_party','vendor') then 'party' end
$$;

-- Replace the single-pool helpers with per-type versions.
drop trigger if exists invites_capacity on public.invites;
drop function if exists public.check_invite_capacity();
drop function if exists public.add_extra_seats(uuid, int);
drop function if exists public.seat_limit(uuid);
drop function if exists public.seats_used(uuid, boolean);

create function public.seat_limit(w uuid, t text) returns int
language sql stable security definer set search_path = public as $$
  select case
    when not public.has_pass(w) then 0
    when t = 'full'  then coalesce((select full_seats  from public.entitlements where wedding_id = w), 0)
    when t = 'party' then coalesce((select party_seats from public.entitlements where wedding_id = w), 0)
    else 0 end
$$;

create function public.seats_used(w uuid, t text, include_pending boolean) returns int
language sql stable security definer set search_path = public as $$
  select (select count(*) from public.wedding_members
          where wedding_id = w and public.seat_type(role) = t)::int
       + case when include_pending then
           (select count(*) from public.invites
            where wedding_id = w and public.seat_type(role) = t and accepted_at is null and expires_at > now())::int
         else 0 end
$$;

create function public.check_invite_capacity() returns trigger
language plpgsql security definer set search_path = public as $$
declare t text := public.seat_type(new.role);
begin
  if new.role = 'partner' then
    if exists (select 1 from public.wedding_members where wedding_id = new.wedding_id and role = 'partner')
       or exists (select 1 from public.invites where wedding_id = new.wedding_id and role = 'partner'
                  and accepted_at is null and expires_at > now()) then
      raise exception 'PARTNER_EXISTS';
    end if;
    return new;
  end if;
  if public.seats_used(new.wedding_id, t, true) >= public.seat_limit(new.wedding_id, t) then
    raise exception '%', case t when 'full' then 'NO_FULL_SPOTS' else 'NO_PARTY_SPOTS' end;
  end if;
  if t = 'party' then
    new.access := '{"day":"assigned"}'::jsonb;  -- a Wedding Party spot is the Wedding Day tab only
  end if;
  return new;
end $$;
create trigger invites_capacity before insert on public.invites
  for each row execute function public.check_invite_capacity();

-- Wedding Party members can never be given more than their part of the Wedding Day tab.
create or replace function public.enforce_party_access() returns trigger
language plpgsql security definer set search_path = public as $$
declare r public.member_role;
begin
  select role into r from public.wedding_members where id = new.member_id;
  if public.seat_type(r) = 'party'
     and new.level <> 'none'
     and not (new.module = 'day' and new.level = 'assigned') then
    raise exception 'PARTY_DAY_ONLY';
  end if;
  return new;
end $$;
create trigger member_module_access_party before insert or update on public.member_module_access
  for each row execute function public.enforce_party_access();

-- Roles can't be edited in place (that would move someone between paid spot types).
-- To change someone's type: remove them and invite them again.
drop policy if exists members_update on public.wedding_members;

-- Wedding Day for 'assigned' access: party items (if in the party) and items naming the person.
drop policy if exists day_items_select on public.day_items;
create policy day_items_select on public.day_items for select using (
  public.my_access(wedding_id, 'day') in ('read','edit')
  or (public.my_access(wedding_id, 'day') = 'assigned' and (
        (audience = 'wedding_party' and public.my_role(wedding_id) = 'wedding_party')
     or exists (select 1 from public.day_item_assignees x
                where x.day_item_id = day_items.id
                  and x.member_id = public.my_member_id(day_items.wedding_id))))
);

create or replace function public.accept_invite(p_token text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  inv public.invites;
  mid uuid;
  t   text;
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

  -- Already on this wedding: nothing to change (to change type, remove and re-invite).
  if exists (select 1 from public.wedding_members where wedding_id = inv.wedding_id and user_id = auth.uid()) then
    update public.invites set accepted_at = now() where id = inv.id;
    return inv.wedding_id;
  end if;

  if inv.role = 'partner' then
    if exists (select 1 from public.wedding_members where wedding_id = inv.wedding_id and role = 'partner') then
      raise exception 'PARTNER_EXISTS';
    end if;
  else
    t := public.seat_type(inv.role);
    if public.seats_used(inv.wedding_id, t, false) >= public.seat_limit(inv.wedding_id, t) then
      raise exception '%', case t when 'full' then 'NO_FULL_SPOTS' else 'NO_PARTY_SPOTS' end;
    end if;
  end if;

  insert into public.wedding_members (wedding_id, user_id, role, display_name)
  values (inv.wedding_id, auth.uid(), inv.role, inv.display_name)
  returning id into mid;

  insert into public.member_module_access (member_id, wedding_id, module, level)
  select mid, inv.wedding_id, key, value
  from jsonb_each_text(case when t = 'party' then '{"day":"assigned"}'::jsonb else inv.access end)
  where key in ('tasks','vendors','budget','guests','seating','day','vision','files','hashtags');

  update public.invites set accepted_at = now() where id = inv.id;
  return inv.wedding_id;
end $$;

-- Stripe webhook (service role only): add purchased spots of one type.
create function public.add_seats(p_wedding uuid, p_type text, p_qty int) returns int
language plpgsql security definer set search_path = public as $$
declare total int;
begin
  if p_qty is null or p_qty < 1 then raise exception 'BAD_QUANTITY'; end if;
  if p_type not in ('full','party') then raise exception 'BAD_TYPE'; end if;
  insert into public.entitlements (wedding_id, plan, full_seats, party_seats)
  values (p_wedding, 'free', case when p_type = 'full' then p_qty else 0 end, case when p_type = 'party' then p_qty else 0 end)
  on conflict (wedding_id) do update set
    full_seats  = public.entitlements.full_seats  + excluded.full_seats,
    party_seats = public.entitlements.party_seats + excluded.party_seats
  returning case when p_type = 'full' then full_seats else party_seats end into total;
  return total;
end $$;
revoke execute on function public.add_seats(uuid, text, int) from public, anon, authenticated;
grant  execute on function public.add_seats(uuid, text, int) to service_role;

-- Promo codes: pass, full_seats (Parents and Planners) or party_seats (Wedding Party).
alter table public.promo_codes drop constraint if exists promo_codes_seats_match;
alter table public.promo_codes drop constraint if exists promo_codes_kind_check;
update public.promo_codes set kind = 'full_seats' where kind = 'seats';
alter table public.promo_codes add constraint promo_codes_kind_check check (kind in ('pass','full_seats','party_seats'));
alter table public.promo_codes add constraint promo_codes_seats_match check (
  (kind = 'pass' and seats is null) or (kind <> 'pass' and coalesce(seats, 0) between 1 and 500)
);

create or replace function public.redeem_promo_code(p_wedding uuid, p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c     public.promo_codes;
  until date;
  t     text;
begin
  if auth.uid() is null then raise exception 'NOT_SIGNED_IN'; end if;
  if not public.is_couple(p_wedding) then raise exception 'NOT_ALLOWED'; end if;

  select * into c from public.promo_codes where code = upper(trim(p_code)) for update;
  if not found then raise exception 'PROMO_INVALID'; end if;
  if exists (select 1 from public.promo_redemptions where code = c.code and wedding_id = p_wedding) then
    raise exception 'PROMO_ALREADY_USED';
  end if;
  if not c.active
     or (c.expires_at is not null and c.expires_at < now())
     or (c.max_redemptions is not null and c.redemptions >= c.max_redemptions) then
    raise exception 'PROMO_INVALID';
  end if;

  if c.kind = 'pass' then
    if public.has_pass(p_wedding) then raise exception 'ALREADY_HAS_PASS'; end if;
    if exists (select 1 from public.entitlements where wedding_id = p_wedding and plan <> 'free') then
      raise exception 'PASS_ENDED';
    end if;
    select coalesce(wedding_date, current_date + 365) + 90 into until from public.weddings where id = p_wedding;
    insert into public.entitlements (wedding_id, plan, valid_until)
    values (p_wedding, 'pass', until)
    on conflict (wedding_id) do update set plan = 'pass', valid_until = excluded.valid_until;
  else
    if not public.has_pass(p_wedding) then raise exception 'PROMO_NEEDS_PASS'; end if;
    t := case c.kind when 'full_seats' then 'full' else 'party' end;
    update public.entitlements set
      full_seats  = full_seats  + case when t = 'full'  then c.seats else 0 end,
      party_seats = party_seats + case when t = 'party' then c.seats else 0 end
    where wedding_id = p_wedding;
  end if;

  insert into public.promo_redemptions (code, wedding_id, redeemed_by) values (c.code, p_wedding, auth.uid());
  update public.promo_codes set redemptions = redemptions + 1 where code = c.code;

  return case when c.kind = 'pass'
    then jsonb_build_object('kind', 'pass', 'valid_until', until)
    else jsonb_build_object('kind', c.kind, 'seats_added', c.seats, 'seat_limit', public.seat_limit(p_wedding, t))
  end;
end $$;
revoke execute on function public.redeem_promo_code(uuid, text) from anon;
