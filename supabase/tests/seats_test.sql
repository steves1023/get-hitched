-- Run with: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to public, extensions;
select plan(11);

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000e1', 'couple@test.dev');
insert into public.weddings (id, partner1, partner2) values
  ('10000000-0000-0000-0000-0000000000e1', 'Emma', 'James'),
  ('10000000-0000-0000-0000-0000000000e2', 'Ana', 'Leo');
insert into public.entitlements (wedding_id, plan, valid_until) values
  ('10000000-0000-0000-0000-0000000000e1', 'free', null),
  ('10000000-0000-0000-0000-0000000000e2', 'pass', current_date + 365);
insert into public.wedding_members (wedding_id, user_id, role, display_name) values
  ('10000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e1', 'owner', 'Emma'),
  ('10000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000e1', 'owner', 'Ana');

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000e1","email":"couple@test.dev"}';

-- Free wedding: 2 people besides the couple
select lives_ok($$insert into invites (wedding_id, email, display_name, role) values
  ('10000000-0000-0000-0000-0000000000e1','a@x.dev','A','family'),
  ('10000000-0000-0000-0000-0000000000e1','b@x.dev','B','wedding_party')$$, 'free: first 2 people allowed');
select throws_ok($$insert into invites (wedding_id, email, display_name, role) values ('10000000-0000-0000-0000-0000000000e1','c@x.dev','C','family')$$,
  'P0001', 'SEAT_LIMIT', 'free: 3rd person blocked');
select lives_ok($$insert into invites (wedding_id, email, display_name, role) values ('10000000-0000-0000-0000-0000000000e1','p@x.dev','P','partner')$$,
  'partner never counts against seats');
select throws_ok($$insert into invites (wedding_id, email, display_name, role) values ('10000000-0000-0000-0000-0000000000e1','p2@x.dev','P2','partner')$$,
  'P0001', 'PARTNER_EXISTS', 'only one partner');
select is(public.seat_limit('10000000-0000-0000-0000-0000000000e1'), 2, 'free limit is 2');

-- Pass wedding: 5 included
select lives_ok($$insert into invites (wedding_id, email, display_name, role)
  select '10000000-0000-0000-0000-0000000000e2', 'g' || i || '@x.dev', 'G' || i, 'wedding_party' from generate_series(1,5) i$$,
  'pass: 5 people included');
select throws_ok($$insert into invites (wedding_id, email, display_name, role) values ('10000000-0000-0000-0000-0000000000e2','g6@x.dev','G6','family')$$,
  'P0001', 'SEAT_LIMIT', 'pass: 6th person blocked until seats are bought');
select throws_ok($$select public.add_extra_seats('10000000-0000-0000-0000-0000000000e2', 3)$$,
  '42501', null, 'couples cannot grant themselves seats');

-- Webhook (service role) adds 3 seats
reset role;
select is(public.add_extra_seats('10000000-0000-0000-0000-0000000000e2', 3), 3, 'webhook adds purchased seats');
select is(public.seat_limit('10000000-0000-0000-0000-0000000000e2'), 8, 'pass limit becomes 5 + 3');
select is(public.record_stripe_event('evt_1') and not public.record_stripe_event('evt_1'), true, 'duplicate Stripe events are ignored');

select * from finish();
rollback;
