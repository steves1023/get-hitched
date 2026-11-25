-- Run with: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to public, extensions;
select plan(8);

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000e7', 'couple@test.dev');
insert into public.weddings (id, partner1, partner2) values
  ('10000000-0000-0000-0000-0000000000e7', 'Emma', 'James'), ('10000000-0000-0000-0000-0000000000e8', 'Other', 'Wedding');
insert into public.entitlements (wedding_id, plan, valid_until) values ('10000000-0000-0000-0000-0000000000e7', 'pass', current_date + 100);
insert into public.wedding_members (wedding_id, user_id, role, display_name) values
  ('10000000-0000-0000-0000-0000000000e7', '00000000-0000-0000-0000-0000000000e7', 'owner', 'Emma');
insert into public.guests (id, wedding_id, name) values ('70000000-0000-0000-0000-0000000000e8', '10000000-0000-0000-0000-0000000000e8', 'Elsewhere');

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000e7","email":"couple@test.dev"}';
insert into guests (id, wedding_id, name, address1, city, state, postal_code, country)
values ('70000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-0000000000e7', 'Sarah Miller', '12 Elm St', 'Ann Arbor', 'MI', '48104', 'US');
select lives_ok($$insert into guests (id, wedding_id, name, primary_guest_id) values
  ('70000000-0000-0000-0000-0000000000e2', '10000000-0000-0000-0000-0000000000e7', 'Tom Miller', '70000000-0000-0000-0000-0000000000e1'),
  ('70000000-0000-0000-0000-0000000000e3', '10000000-0000-0000-0000-0000000000e7', 'Lily Miller', '70000000-0000-0000-0000-0000000000e1')$$,
  'family members join a main guest');
select is((select count(*)::int from guests where primary_guest_id = '70000000-0000-0000-0000-0000000000e1'), 2, 'two members under Sarah');
select throws_ok($$insert into guests (wedding_id, name, primary_guest_id) values ('10000000-0000-0000-0000-0000000000e7', 'Grandkid', '70000000-0000-0000-0000-0000000000e2')$$,
  'P0001', 'HOUSEHOLD_INVALID', 'a member cannot have members of their own');
select throws_ok($$update guests set primary_guest_id = '70000000-0000-0000-0000-0000000000e2' where id = '70000000-0000-0000-0000-0000000000e1'$$,
  'P0001', 'HOUSEHOLD_INVALID', 'a main guest cannot be moved under their own member');
select throws_ok($$update guests set primary_guest_id = '70000000-0000-0000-0000-0000000000e1' where id = '70000000-0000-0000-0000-0000000000e1'$$,
  'P0001', 'HOUSEHOLD_SELF', 'a guest cannot be their own family');
select throws_ok($$insert into guests (wedding_id, name, primary_guest_id) values ('10000000-0000-0000-0000-0000000000e7', 'Stranger', '70000000-0000-0000-0000-0000000000e8')$$,
  'P0001', 'HOUSEHOLD_INVALID', 'cannot join a family on another wedding');
delete from guests where id = '70000000-0000-0000-0000-0000000000e1';
select is((select count(*)::int from guests where name in ('Tom Miller','Lily Miller')), 2, 'members stay when the main guest is deleted');
select is((select count(*)::int from guests where name in ('Tom Miller','Lily Miller') and primary_guest_id is null), 2, '...and become their own main guests');

select * from finish();
rollback;
