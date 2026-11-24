-- Run with: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to public, extensions;
select plan(11);

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f1', 'couple@test.dev');
insert into public.weddings (id, partner1, partner2) values
  ('10000000-0000-0000-0000-0000000000f1', 'Unpaid', 'Couple'),
  ('10000000-0000-0000-0000-0000000000f2', 'Expired', 'Couple'),
  ('10000000-0000-0000-0000-0000000000f3', 'Paid', 'Couple');
insert into public.entitlements (wedding_id, plan, valid_until) values
  ('10000000-0000-0000-0000-0000000000f1', 'free', null),
  ('10000000-0000-0000-0000-0000000000f2', 'pass', current_date - 1),
  ('10000000-0000-0000-0000-0000000000f3', 'pass', current_date + 30);
insert into public.wedding_members (wedding_id, user_id, role, display_name)
select w, '00000000-0000-0000-0000-0000000000f1', 'owner', 'Owner'
from unnest(array['10000000-0000-0000-0000-0000000000f1','10000000-0000-0000-0000-0000000000f2','10000000-0000-0000-0000-0000000000f3']::uuid[]) w;
insert into public.tasks (id, wedding_id, title) values
  ('30000000-0000-0000-0000-0000000000f1', '10000000-0000-0000-0000-0000000000f1', 'Unpaid task'),
  ('30000000-0000-0000-0000-0000000000f2', '10000000-0000-0000-0000-0000000000f2', 'Expired task'),
  ('30000000-0000-0000-0000-0000000000f3', '10000000-0000-0000-0000-0000000000f3', 'Paid task');

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000f1","email":"couple@test.dev"}';

select is((select count(*)::int from public.weddings), 3, 'the couple can still see their weddings (to reach Billing)');
select is((select count(*)::int from public.tasks where wedding_id = '10000000-0000-0000-0000-0000000000f1'), 0, 'unpaid: no data visible');
select throws_ok($$insert into public.tasks (wedding_id, title) values ('10000000-0000-0000-0000-0000000000f1', 'x')$$,
  '42501', null, 'unpaid: cannot add anything');
select throws_ok($$insert into public.invites (wedding_id, email, display_name, role) values ('10000000-0000-0000-0000-0000000000f1','b@x.dev','B','wedding_party')$$,
  'P0001', 'NO_PARTY_SPOTS', 'unpaid: cannot invite helpers');
select lives_ok($$insert into public.invites (wedding_id, email, display_name, role) values ('10000000-0000-0000-0000-0000000000f1','p@x.dev','P','partner')$$,
  'unpaid: can still invite their partner');
select is(public.my_access('10000000-0000-0000-0000-0000000000f2', 'tasks'), 'read', 'expired: edit becomes read');
select is((select count(*)::int from public.tasks where wedding_id = '10000000-0000-0000-0000-0000000000f2'), 1, 'expired: data still readable');
select throws_ok($$insert into public.tasks (wedding_id, title) values ('10000000-0000-0000-0000-0000000000f2', 'x')$$,
  '42501', null, 'expired: cannot add');
select throws_ok($$select public.complete_task('30000000-0000-0000-0000-0000000000f2', true)$$,
  'P0001', 'PASS_REQUIRED', 'expired: cannot tick tasks');
select lives_ok($$insert into public.tasks (wedding_id, title) values ('10000000-0000-0000-0000-0000000000f3', 'x')$$,
  'paid: full access');
reset role;
insert into public.promo_codes (code) values ('TESTCODE-1');
set local role authenticated;
select throws_ok($$select public.redeem_promo_code('10000000-0000-0000-0000-0000000000f2', 'TESTCODE-1')$$,
  'P0001', 'PASS_ENDED', 'expired: a code cannot restart an ended pass');

select * from finish();
rollback;
