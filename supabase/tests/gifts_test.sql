-- Run with: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to public, extensions;
select plan(9);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000d7', 'couple@test.dev'), ('00000000-0000-0000-0000-0000000000d8', 'bea@test.dev'),
  ('00000000-0000-0000-0000-0000000000d9', 'other@test.dev');
insert into public.weddings (id, partner1, partner2) values
  ('10000000-0000-0000-0000-0000000000d7', 'Emma', 'James'), ('10000000-0000-0000-0000-0000000000d9', 'Ana', 'Leo');
insert into public.entitlements (wedding_id, plan, valid_until) values
  ('10000000-0000-0000-0000-0000000000d7', 'pass', current_date + 100), ('10000000-0000-0000-0000-0000000000d9', 'pass', current_date + 100);
insert into public.wedding_members (id, wedding_id, user_id, role, display_name) values
  ('20000000-0000-0000-0000-0000000000d7', '10000000-0000-0000-0000-0000000000d7', '00000000-0000-0000-0000-0000000000d7', 'owner', 'Emma'),
  ('20000000-0000-0000-0000-0000000000d8', '10000000-0000-0000-0000-0000000000d7', '00000000-0000-0000-0000-0000000000d8', 'wedding_party', 'Bea'),
  ('20000000-0000-0000-0000-0000000000d9', '10000000-0000-0000-0000-0000000000d9', '00000000-0000-0000-0000-0000000000d9', 'owner', 'Ana');
insert into public.member_module_access (member_id, wedding_id, module, level) values
  ('20000000-0000-0000-0000-0000000000d8', '10000000-0000-0000-0000-0000000000d7', 'day', 'assigned');
insert into public.guests (id, wedding_id, name, notes) values
  ('70000000-0000-0000-0000-0000000000d1', '10000000-0000-0000-0000-0000000000d7', 'Sarah Miller', 'Emma''s college roommate'),
  ('70000000-0000-0000-0000-0000000000d2', '10000000-0000-0000-0000-0000000000d7', 'Tom Miller', 'Sarah''s husband'),
  ('70000000-0000-0000-0000-0000000000d9', '10000000-0000-0000-0000-0000000000d9', 'Someone Else', null);

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000d7","email":"couple@test.dev"}';
insert into gifts (id, wedding_id, description, kind) values ('80000000-0000-0000-0000-0000000000d1', '10000000-0000-0000-0000-0000000000d7', 'KitchenAid mixer', 'registry');
select lives_ok($$insert into gift_givers (gift_id, guest_id, wedding_id) values
  ('80000000-0000-0000-0000-0000000000d1', '70000000-0000-0000-0000-0000000000d1', '10000000-0000-0000-0000-0000000000d7'),
  ('80000000-0000-0000-0000-0000000000d1', '70000000-0000-0000-0000-0000000000d2', '10000000-0000-0000-0000-0000000000d7')$$,
  'a gift can come from a married couple (two guests)');
select is((select count(*)::int from gift_givers where gift_id = '80000000-0000-0000-0000-0000000000d1'), 2, 'both givers recorded');
select throws_ok($$insert into gift_givers (gift_id, guest_id, wedding_id) values
  ('80000000-0000-0000-0000-0000000000d1', '70000000-0000-0000-0000-0000000000d9', '10000000-0000-0000-0000-0000000000d7')$$,
  'P0001', 'GIFT_GIVER_MISMATCH', 'a guest from another wedding cannot be a giver');
select lives_ok($$update guests set notes = 'Flew in from Denver' where id = '70000000-0000-0000-0000-0000000000d2'$$, 'couple can write guest notes');
select lives_ok($$update weddings set print_theme = '{"palette":"rustic","fonts":"classic"}' where id = '10000000-0000-0000-0000-0000000000d7'$$, 'couple saves a print theme');
select throws_ok($$insert into member_module_access (member_id, wedding_id, module, level) values ('20000000-0000-0000-0000-0000000000d8', '10000000-0000-0000-0000-0000000000d7', 'gifts', 'read')$$,
  'P0001', 'PARTY_DAY_ONLY', 'wedding party cannot be given the gifts tab');

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000d8","email":"bea@test.dev"}';
select is((select count(*)::int from gifts), 0, 'wedding party sees no gifts');
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000d9","email":"other@test.dev"}';
select is((select count(*)::int from gifts), 0, 'another wedding sees no gifts');
select is((select count(*)::int from gift_givers), 0, 'or who gave them');

select * from finish();
rollback;
