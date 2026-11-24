-- Paywall: nothing works until the wedding has the Wedding Pass (purchase or promo code).
--   Never paid      -> every tab is 'none' (the couple only sees the Billing page)
--   Pass active     -> normal levels
--   Pass expired    -> read-only: 'edit' becomes 'read', so couples keep their data
-- Because every RLS policy, storage policy and Edge Function check goes through my_access(),
-- changing it here applies the paywall everywhere at once.

create or replace function public.my_access(w uuid, m text) returns text
language sql stable security definer set search_path = public as $$
  select case
    when b.base = 'none' then 'none'
    when public.has_pass(w) then b.base
    when exists (select 1 from public.entitlements e where e.wedding_id = w and e.plan <> 'free')
      then case when b.base = 'edit' then 'read' else b.base end
    else 'none'
  end
  from (
    select coalesce((
      select case when wm.role in ('owner','partner') then 'edit'
                  else coalesce(a.level, 'none') end
      from public.wedding_members wm
      left join public.member_module_access a on a.member_id = wm.id and a.module = m
      where wm.wedding_id = w and wm.user_id = auth.uid()
    ), 'none') as base
  ) b
$$;

-- Before the pass, only the couple's partner can join (no spots for anyone else).
create or replace function public.seat_limit(w uuid) returns int
language sql stable security definer set search_path = public as $$
  select case when public.has_pass(w)
              then 5 + coalesce((select extra_seats from public.entitlements where wedding_id = w), 0)
              else 0 end
$$;

-- Assignees tick their own items only while the pass is active.
create or replace function public.complete_task(p_task uuid, p_done boolean) returns void
language plpgsql security definer set search_path = public as $$
declare t public.tasks;
begin
  select * into t from public.tasks where id = p_task;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not public.has_pass(t.wedding_id) then raise exception 'PASS_REQUIRED'; end if;
  if public.my_access(t.wedding_id, 'tasks') <> 'edit'
     and t.assignee_member_id is distinct from public.my_member_id(t.wedding_id) then
    raise exception 'NOT_ALLOWED';
  end if;
  update public.tasks set status = case when p_done then 'done' else 'todo' end where id = p_task;
end $$;

create or replace function public.set_day_item_done(p_item uuid, p_done boolean) returns void
language plpgsql security definer set search_path = public as $$
declare d public.day_items;
begin
  select * into d from public.day_items where id = p_item;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not public.has_pass(d.wedding_id) then raise exception 'PASS_REQUIRED'; end if;
  if public.my_access(d.wedding_id, 'day') <> 'edit'
     and not exists (select 1 from public.day_item_assignees
                     where day_item_id = p_item and member_id = public.my_member_id(d.wedding_id)) then
    raise exception 'NOT_ALLOWED';
  end if;
  update public.day_items set done = p_done where id = p_item;
end $$;

-- Codes can't be spent on a wedding whose pass has already ended.
create or replace function public.redeem_promo_code(p_wedding uuid, p_code text) returns date
language plpgsql security definer set search_path = public as $$
declare
  c     public.promo_codes;
  until date;
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
  if public.has_pass(p_wedding) then
    raise exception 'ALREADY_HAS_PASS';  -- don't burn a code on a wedding that already has access
  end if;
  if exists (select 1 from public.entitlements where wedding_id = p_wedding and plan <> 'free') then
    raise exception 'PASS_ENDED';        -- a code would grant a pass that is already over
  end if;

  -- Same validity as a purchased pass: wedding date + 90 days (or a year + 90 days if no date yet)
  select coalesce(wedding_date, current_date + 365) + 90 into until from public.weddings where id = p_wedding;

  insert into public.entitlements (wedding_id, plan, valid_until)
  values (p_wedding, 'pass', until)
  on conflict (wedding_id) do update set plan = 'pass', valid_until = excluded.valid_until;

  insert into public.promo_redemptions (code, wedding_id, redeemed_by) values (c.code, p_wedding, auth.uid());
  update public.promo_codes set redemptions = redemptions + 1 where code = c.code;
  return until;
end $$;
