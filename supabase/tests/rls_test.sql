-- Run with: supabase test db
-- Proves the permission model: who can see and change what.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to public, extensions;
select plan(16);

-- Users
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@test.dev'),
  ('00000000-0000-0000-0000-0000000000a2', 'planner@test.dev'),
  ('00000000-0000-0000-0000-0000000000a3', 'bridesmaid@test.dev'),
  ('00000000-0000-0000-0000-0000000000b1', 'other-owner@test.dev');

-- Wedding A with an owner, a planner and a bridesmaid; wedding B with its own owner
insert into public.weddings (id, partner1, partner2) values
  ('10000000-0000-0000-0000-00000000000a', 'Emma', 'James'),
  ('10000000-0000-0000-0000-00000000000b', 'Ana', 'Leo');
insert into public.entitlements (wedding_id, plan, valid_until) values
  ('10000000-0000-0000-0000-00000000000a', 'pass', current_date + 365),
  ('10000000-0000-0000-0000-00000000000b', 'free', null);
insert into public.wedding_members (id, wedding_id, user_id, role, display_name) values
  ('20000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', 'owner', 'Emma'),
  ('20000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a2', 'planner', 'Pat'),
  ('20000000-0000-0000-0000-0000000000a3', '10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a3', 'wedding_party', 'Bea'),
  ('20000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000b1', 'owner', 'Ana');
insert into public.member_module_access (member_id, wedding_id, module, level) values
  ('20000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-00000000000a', 'vendors', 'edit'),
  ('20000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-00000000000a', 'budget',  'none'),
  ('20000000-0000-0000-0000-0000000000a3', '10000000-0000-0000-0000-00000000000a', 'tasks',   'assigned'),
  ('20000000-0000-0000-0000-0000000000a3', '10000000-0000-0000-0000-00000000000a', 'day',     'assigned');

-- Data in wedding A
insert into public.tasks (id, wedding_id, title, assignee_member_id) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a', 'Plan the shower', '20000000-0000-0000-0000-0000000000a3'),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-00000000000a', 'Book florist',    '20000000-0000-0000-0000-0000000000a1');
insert into public.vendors (id, wedding_id, name) values
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a', 'Lumen Photography');
insert into public.vendor_payments (wedding_id, vendor_id, total, paid) values
  ('10000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-000000000001', 3200, 1000);
insert into public.expenses (wedding_id, label, amount, status) values
  ('10000000-0000-0000-0000-00000000000a', 'Venue', 8500, 'paid');
insert into public.guests (wedding_id, name) values
  ('10000000-0000-0000-0000-00000000000a', 'Sarah Miller');
insert into public.day_items (id, wedding_id, start_time, title, audience) values
  ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a', '08:00', 'Hair',           'everyone'),
  ('50000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-00000000000a', '12:30', 'Party photos',   'wedding_party'),
  ('50000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-00000000000a', '13:30', 'First look',     'couple_only'),
  ('50000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-00000000000a', '14:00', 'Bea brings ring','couple_only');
insert into public.day_item_assignees (day_item_id, member_id, wedding_id) values
  ('50000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-0000000000a3', '10000000-0000-0000-0000-00000000000a');

-- ---------- Bridesmaid ----------
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000a3","email":"bridesmaid@test.dev","role":"authenticated"}';

select is((select count(*)::int from public.tasks), 1, 'bridesmaid sees only her own task');
select is((select count(*)::int from public.expenses), 0, 'bridesmaid sees no expenses');
select is((select count(*)::int from public.guests), 0, 'bridesmaid sees no guests');
select is((select count(*)::int from public.vendor_payments), 0, 'bridesmaid sees no vendor payments');
select is((select count(*)::int from public.day_items), 3, 'bridesmaid sees everyone + party + her assigned item, not couple-only');
select throws_ok(
  $$insert into public.guests (wedding_id, name) values ('10000000-0000-0000-0000-00000000000a', 'Sneaky')$$,
  '42501', null, 'bridesmaid cannot add guests');
select lives_ok(
  $$select public.complete_task('30000000-0000-0000-0000-000000000001', true)$$,
  'bridesmaid can tick her own task');
select throws_ok(
  $$select public.complete_task('30000000-0000-0000-0000-000000000002', true)$$,
  'P0001', 'NOT_ALLOWED', 'bridesmaid cannot tick someone else''s task');

-- ---------- Planner ----------
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000a2","email":"planner@test.dev","role":"authenticated"}';
select is((select count(*)::int from public.vendors), 1, 'planner sees vendors');
select is((select count(*)::int from public.vendor_payments), 0, 'planner without budget access sees no prices');
select is((select spent::numeric from public.wedding_summary where wedding_id = '10000000-0000-0000-0000-00000000000a'), 0::numeric,
          'summary view does not leak spend to the planner');

-- ---------- Owner of wedding B ----------
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000b1","email":"other-owner@test.dev","role":"authenticated"}';
select is((select count(*)::int from public.tasks), 0, 'another wedding''s owner sees none of wedding A''s tasks');
select is((select count(*)::int from public.weddings), 1, 'another wedding''s owner sees only their own wedding');
select throws_ok(
  $$insert into public.seating_tables (wedding_id, label) values ('10000000-0000-0000-0000-00000000000b', 'Table 1')$$,
  'P0001', 'PASS_REQUIRED', 'free wedding cannot add seating tables');

-- ---------- Owner of wedding A ----------
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000a1","email":"owner@test.dev","role":"authenticated"}';
select is((select count(*)::int from public.day_items), 4, 'owner sees every day item');
select is((select spent::numeric from public.wedding_summary where wedding_id = '10000000-0000-0000-0000-00000000000a'), 8500::numeric,
          'owner sees real spend');

select * from finish();
rollback;
