-- Run with: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to public, extensions;
select plan(4);
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a9', 'couple@test.dev');
insert into public.weddings (id, partner1, partner2) values
  ('10000000-0000-0000-0000-0000000000a9', 'Emma', 'James'), ('10000000-0000-0000-0000-0000000000a8', 'Ana', 'Leo');
insert into public.entitlements (wedding_id, plan, valid_until) values ('10000000-0000-0000-0000-0000000000a9', 'pass', current_date + 100);
insert into public.wedding_members (wedding_id, user_id, role, display_name) values
  ('10000000-0000-0000-0000-0000000000a9', '00000000-0000-0000-0000-0000000000a9', 'owner', 'Emma');
insert into public.vendors (id, wedding_id, name) values
  ('a0000000-0000-0000-0000-0000000000a9', '10000000-0000-0000-0000-0000000000a9', 'Willow Estate'),
  ('a0000000-0000-0000-0000-0000000000a8', '10000000-0000-0000-0000-0000000000a8', 'Other venue');

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000a9","email":"couple@test.dev"}';
select lives_ok($$insert into files (id, wedding_id, storage_path, name, size_bytes, vendor_id) values
  ('f0000000-0000-0000-0000-0000000000a9', '10000000-0000-0000-0000-0000000000a9', '10000000-0000-0000-0000-0000000000a9/c.pdf', 'contract.pdf', 1000, 'a0000000-0000-0000-0000-0000000000a9')$$,
  'a file can be attached to a vendor');
select throws_ok($$update files set vendor_id = 'a0000000-0000-0000-0000-0000000000a8' where id = 'f0000000-0000-0000-0000-0000000000a9'$$,
  'P0001', 'FILE_VENDOR_MISMATCH', 'cannot attach to another wedding''s vendor');
delete from vendors where id = 'a0000000-0000-0000-0000-0000000000a9';
select is((select count(*)::int from files where id = 'f0000000-0000-0000-0000-0000000000a9'), 1, 'deleting the vendor keeps the file');
select is((select vendor_id from files where id = 'f0000000-0000-0000-0000-0000000000a9'), null, '...without the link');
select * from finish();
rollback;
