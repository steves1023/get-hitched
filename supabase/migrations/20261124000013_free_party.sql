-- Wedding Party spots are free once the wedding is activated (capped at 100 to limit invite-email abuse).
-- Parents and Planners spots are still bought ($0.99 each) or granted by promo code.
create or replace function public.seat_limit(w uuid, t text) returns int
language sql stable security definer set search_path = public as $$
  select case
    when not public.has_pass(w) then 0
    when t = 'full'  then coalesce((select full_seats from public.entitlements where wedding_id = w), 0)
    when t = 'party' then 100
    else 0 end
$$;
