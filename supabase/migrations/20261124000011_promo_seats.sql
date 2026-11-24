-- Promo codes can now grant either the Wedding Pass (kind = 'pass') or extra people (kind = 'seats').
--   insert into promo_codes (code, description, kind, seats) values ('GOBLUEPLUS5', '5 extra people', 'seats', 5);

alter table public.promo_codes add column kind text not null default 'pass' check (kind in ('pass','seats'));
alter table public.promo_codes add column seats int;
alter table public.promo_codes add constraint promo_codes_seats_match check (
  (kind = 'pass' and seats is null) or (kind = 'seats' and coalesce(seats, 0) between 1 and 500)
);

-- Return type changes from date to jsonb, so the old function has to be dropped first.
drop function if exists public.redeem_promo_code(uuid, text);

create function public.redeem_promo_code(p_wedding uuid, p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c     public.promo_codes;
  until date;
  extra int;
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
    -- Extra people only make sense on an active pass; checked before the code is used up.
    if not public.has_pass(p_wedding) then raise exception 'PROMO_NEEDS_PASS'; end if;
    update public.entitlements set extra_seats = extra_seats + c.seats
    where wedding_id = p_wedding returning extra_seats into extra;
  end if;

  insert into public.promo_redemptions (code, wedding_id, redeemed_by) values (c.code, p_wedding, auth.uid());
  update public.promo_codes set redemptions = redemptions + 1 where code = c.code;

  return case when c.kind = 'pass'
    then jsonb_build_object('kind', 'pass', 'valid_until', until)
    else jsonb_build_object('kind', 'seats', 'seats_added', c.seats, 'seat_limit', public.seat_limit(p_wedding))
  end;
end $$;
revoke execute on function public.redeem_promo_code(uuid, text) from anon;
