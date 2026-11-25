-- Run with: supabase test db
-- Two spot types: full (Parents and Planners) and party (Wedding Party). The couple never counts.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to public, extensions;
select plan(13);

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000e1', 'couple@test.dev');
insert into public.weddings (id, partner1, partner2) values
  ('10000000-0000-0000-0000-0000000000e1', 'Unpaid', 'Couple'),
  ('10000000-0000-0000-0000-0000000000e2', 'Ana', 'Leo');
insert into public.entitlements (wedding_id, plan, valid_until) values
  ('10000000-0000-0000-0000-0000000000e1', 'free', null),
  ('10000000-0000-0000-0000-0000000000e2', 'pass', current_date + 365);
insert into public.wedding_members (wedding_id, user_id, role, display_name) values
  ('10000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e1', 'owner', 'Owner'),
  ('10000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000e1', 'owner', 'Ana');

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000e1","email":"couple@test.dev"}';

select lives_ok($$insert into invites (wedding_id, email, display_name, role) values ('10000000-0000-0000-0000-0000000000e2','p@x.dev','P','partner')$$,
  'partner is free');
select throws_ok($$insert into invites (wedding_id, email, display_name, role) values ('10000000-0000-0000-0000-0000000000e2','p2@x.dev','P2','partner')$$,
  'P0001', 'PARTNER_EXISTS', 'only one partner');
select is(public.seat_limit('10000000-0000-0000-0000-0000000000e2', 'full'), 0, 'the pass includes no full spots');
select is(public.seat_limit('10000000-0000-0000-0000-0000000000e2', 'party'), 100, 'wedding party spots are free once activated (up to 100)');
select throws_ok($$insert into invites (wedding_id, email, display_name, role) values ('10000000-0000-0000-0000-0000000000e2','m@x.dev','Mom','family')$$,
  'P0001', 'NO_FULL_SPOTS', 'a parent needs a Parents and Planners spot');
select throws_ok($$insert into invites (wedding_id, email, display_name, role) values ('10000000-0000-0000-0000-0000000000e1','b@x.dev','Bea','wedding_party')$$,
  'P0001', 'NO_PARTY_SPOTS', 'no one joins an unactivated wedding, even free spots');
select throws_ok($$select public.add_seats('10000000-0000-0000-0000-0000000000e2', 'full', 3)$$,
  '42501', null, 'couples cannot grant themselves spots');

-- Webhook (service role) records purchases
reset role;
select is(public.add_seats('10000000-0000-0000-0000-0000000000e2', 'full', 2), 2, '2 Parents and Planners spots bought');
select is(public.add_seats('10000000-0000-0000-0000-0000000000e2', 'full', 0 + 1), 3, 'a third Parents and Planners spot bought');
set local role authenticated;

select lives_ok($$insert into invites (wedding_id, email, display_name, role) values
  ('10000000-0000-0000-0000-0000000000e2','m@x.dev','Mom','family'),
  ('10000000-0000-0000-0000-0000000000e2','pl@x.dev','Pat','planner'),
  ('10000000-0000-0000-0000-0000000000e2','gm@x.dev','Gran','family')$$, 'three full spots used');
select throws_ok($$insert into invites (wedding_id, email, display_name, role) values ('10000000-0000-0000-0000-0000000000e2','d@x.dev','Dad','family')$$,
  'P0001', 'NO_FULL_SPOTS', 'a fourth full person is blocked');
insert into invites (wedding_id, email, display_name, role, access)
values ('10000000-0000-0000-0000-0000000000e2','b@x.dev','Bea','wedding_party','{"budget":"edit","day":"edit"}');
select is((select access from invites where email = 'b@x.dev'), '{"day":"assigned"}'::jsonb,
  'a wedding party invite is always reduced to their part of the Wedding Day tab');
reset role;
select is(public.record_stripe_event('evt_1') and not public.record_stripe_event('evt_1'), true, 'duplicate Stripe events are ignored');

select * from finish();
rollback;
