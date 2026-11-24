-- Run with: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to public, extensions;
select plan(8);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000d1', 'couple@test.dev'),
  ('00000000-0000-0000-0000-0000000000d2', 'guest@test.dev');
insert into public.weddings (id, partner1, partner2, wedding_date) values
  ('10000000-0000-0000-0000-0000000000d1', 'Emma', 'James', '2027-06-20'),
  ('10000000-0000-0000-0000-0000000000d2', 'Ana', 'Leo', null);
insert into public.entitlements (wedding_id, plan) values
  ('10000000-0000-0000-0000-0000000000d1', 'free'), ('10000000-0000-0000-0000-0000000000d2', 'free');
insert into public.wedding_members (wedding_id, user_id, role, display_name) values
  ('10000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d1', 'owner', 'Emma'),
  ('10000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000d1', 'owner', 'Emma'),
  ('10000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d2', 'wedding_party', 'Bea');
insert into public.promo_codes (code, max_redemptions) values ('FRIENDS-7K2M9Q', 1);
insert into public.promo_codes (code, expires_at) values ('OLD-CODE', now() - interval '1 day');

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000d2","email":"guest@test.dev"}';
select throws_ok($$select public.redeem_promo_code('10000000-0000-0000-0000-0000000000d1', 'FRIENDS-7K2M9Q')$$,
  'P0001', 'NOT_ALLOWED', 'a bridesmaid cannot redeem codes');
select is((select count(*)::int from public.promo_codes), 0, 'nobody can list promo codes');

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000d1","email":"couple@test.dev"}';
select throws_ok($$select public.redeem_promo_code('10000000-0000-0000-0000-0000000000d1', 'NOPE')$$,
  'P0001', 'PROMO_INVALID', 'unknown code is rejected');
select throws_ok($$select public.redeem_promo_code('10000000-0000-0000-0000-0000000000d1', 'old-code')$$,
  'P0001', 'PROMO_INVALID', 'expired code is rejected');
select is((public.redeem_promo_code('10000000-0000-0000-0000-0000000000d1', ' friends-7k2m9q ')->>'valid_until')::date, '2027-09-18'::date,
  'valid code grants the pass through wedding date + 90 days (case and spaces ignored)');
select ok(public.has_pass('10000000-0000-0000-0000-0000000000d1'), 'wedding now has the pass');
select throws_ok($$select public.redeem_promo_code('10000000-0000-0000-0000-0000000000d2', 'FRIENDS-7K2M9Q')$$,
  'P0001', 'PROMO_INVALID', 'a single-use code cannot be used twice');
select throws_ok($$select public.redeem_promo_code('10000000-0000-0000-0000-0000000000d1', 'FRIENDS-7K2M9Q')$$,
  'P0001', 'PROMO_ALREADY_USED', 'the same wedding cannot redeem a code twice');

select * from finish();
rollback;
