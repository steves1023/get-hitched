-- Run with: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to public, extensions;
select plan(8);

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a9', 'couple@test.dev');
insert into public.weddings (id, partner1, partner2) values
  ('10000000-0000-0000-0000-0000000000a9', 'Unpaid', 'Couple'),
  ('10000000-0000-0000-0000-0000000000b9', 'Paid', 'Couple');
insert into public.entitlements (wedding_id, plan, valid_until) values
  ('10000000-0000-0000-0000-0000000000a9', 'free', null),
  ('10000000-0000-0000-0000-0000000000b9', 'pass', current_date + 100);
insert into public.wedding_members (wedding_id, user_id, role, display_name)
select w, '00000000-0000-0000-0000-0000000000a9', 'owner', 'Owner'
from unnest(array['10000000-0000-0000-0000-0000000000a9','10000000-0000-0000-0000-0000000000b9']::uuid[]) w;
insert into public.promo_codes (code, kind, seats) values ('PLUS5', 'seats', 5);

select throws_ok($$insert into public.promo_codes (code, kind) values ('BROKEN', 'seats')$$,
  '23514', null, 'a people code must say how many people');
select throws_ok($$insert into public.promo_codes (code, seats) values ('BROKEN2', 3)$$,
  '23514', null, 'a pass code cannot carry a people count');

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000a9","email":"couple@test.dev"}';

select throws_ok($$select public.redeem_promo_code('10000000-0000-0000-0000-0000000000a9', 'plus5')$$,
  'P0001', 'PROMO_NEEDS_PASS', 'people code on an unpaid wedding asks for the pass first');
reset role;
select is((select redemptions from public.promo_codes where code = 'PLUS5'), 0, '...and the code is not used up');
set local role authenticated;

select is(public.redeem_promo_code('10000000-0000-0000-0000-0000000000b9', 'plus5'),
  '{"kind":"seats","seats_added":5,"seat_limit":10}'::jsonb, 'people code adds 5 to a paid wedding (5 included + 5)');
select is(public.seat_limit('10000000-0000-0000-0000-0000000000b9'), 10, 'limit is now 10');
select lives_ok($$insert into public.invites (wedding_id, email, display_name, role)
  select '10000000-0000-0000-0000-0000000000b9', 'g' || i || '@x.dev', 'G' || i, 'family' from generate_series(1,10) i$$,
  'ten people can now be invited');
select throws_ok($$select public.redeem_promo_code('10000000-0000-0000-0000-0000000000b9', 'PLUS5')$$,
  'P0001', 'PROMO_ALREADY_USED', 'a wedding cannot stack the same people code');

select * from finish();
rollback;
