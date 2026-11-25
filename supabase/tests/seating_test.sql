-- Run with: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to public, extensions;
select plan(8);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'couple@test.dev'), ('00000000-0000-0000-0000-0000000000c2', 'mom@test.dev');
insert into public.weddings (id, partner1, partner2) values ('10000000-0000-0000-0000-0000000000c1', 'Emma', 'James');
insert into public.entitlements (wedding_id, plan, valid_until) values ('10000000-0000-0000-0000-0000000000c1', 'pass', current_date + 100);
insert into public.wedding_members (id, wedding_id, user_id, role, display_name) values
  ('20000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c1', 'owner', 'Emma'),
  ('20000000-0000-0000-0000-0000000000c2', '10000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c2', 'family', 'Mom');
insert into public.member_module_access (member_id, wedding_id, module, level) values
  ('20000000-0000-0000-0000-0000000000c2', '10000000-0000-0000-0000-0000000000c1', 'seating', 'read');

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000c1","email":"couple@test.dev"}';
select lives_ok($$insert into seating_layouts (wedding_id, room_name, width_ft, length_ft) values ('10000000-0000-0000-0000-0000000000c1', 'Grand Hall', 80, 50)$$, 'couple sets the room size');
select throws_ok($$update seating_layouts set width_ft = 5000 where wedding_id = '10000000-0000-0000-0000-0000000000c1'$$, '23514', null, 'absurd room sizes are rejected');
insert into seating_tables (id, wedding_id, label, kind, capacity, x, y) values ('60000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-0000000000c1', 'Table 1', 'round60', 8, 20, 20);
select lives_ok($$insert into room_items (wedding_id, kind, x, y, w, h) values ('10000000-0000-0000-0000-0000000000c1', 'dance_floor', 40, 25, 20, 20)$$, 'couple adds a dance floor');
insert into guests (id, wedding_id, name, table_id, seat_index) values ('70000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-0000000000c1', 'Sarah', '60000000-0000-0000-0000-0000000000c1', 3);
select is((select seat_index from guests where id = '70000000-0000-0000-0000-0000000000c1'), 3, 'guest sits in chair 4');
update guests set table_id = null where id = '70000000-0000-0000-0000-0000000000c1';
select is((select seat_index from guests where id = '70000000-0000-0000-0000-0000000000c1'), null, 'unseating clears the chair');

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000c2","email":"mom@test.dev"}';
select is((select width_ft::int from seating_layouts), 80, 'view-only family can see the room');
select is((select count(*)::int from room_items), 1, 'and its features');
select throws_ok($$insert into room_items (wedding_id, kind, x, y, w, h) values ('10000000-0000-0000-0000-0000000000c1', 'bar', 5, 5, 8, 3)$$, '42501', null, 'but cannot change them');

select * from finish();
rollback;
