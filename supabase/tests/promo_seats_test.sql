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
insert into public.promo_codes (code, kind, seats) values ('FAMILY2', 'full_seats', 2), ('PARTY6', 'party_seats', 6);

select throws_ok($$insert into public.promo_codes (code, kind) values ('BROKEN', 'party_seats')$$,
  '23514', null, 'a people code must say how many people');

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000a9","email":"couple@test.dev"}';

select throws_ok($$select public.redeem_promo_code('10000000-0000-0000-0000-0000000000a9', 'party6')$$,
  'P0001', 'PROMO_NEEDS_PASS', 'people code on an unpaid wedding asks for the pass first');
reset role;
select is((select redemptions from public.promo_codes where code = 'PARTY6'), 0, '...and the code is not used up');
set local role authenticated;

select is(public.redeem_promo_code('10000000-0000-0000-0000-0000000000b9', 'family2'),
  '{"kind":"full_seats","seats_added":2,"seat_limit":2}'::jsonb, 'family code adds 2 Parents and Planners spots');
select is(public.redeem_promo_code('10000000-0000-0000-0000-0000000000b9', 'PARTY6'),
  '{"kind":"party_seats","seats_added":6,"seat_limit":100}'::jsonb, 'old party codes still redeem harmlessly (party spots are free)');
select is(public.seat_limit('10000000-0000-0000-0000-0000000000b9', 'full'), 2, 'full spots unchanged by the party code');
select lives_ok($$insert into public.invites (wedding_id, email, display_name, role)
  select '10000000-0000-0000-0000-0000000000b9', 'g' || i || '@x.dev', 'G' || i, 'wedding_party' from generate_series(1,6) i$$,
  'six bridesmaids can now be invited');
select throws_ok($$select public.redeem_promo_code('10000000-0000-0000-0000-0000000000b9', 'PARTY6')$$,
  'P0001', 'PROMO_ALREADY_USED', 'a wedding cannot stack the same code');

select * from finish();
rollback;
