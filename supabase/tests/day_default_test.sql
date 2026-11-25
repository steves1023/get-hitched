-- Run with: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to public, extensions;
select plan(8);
select count(*)::int as n_templates from day_templates \gset
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000b7', 'couple@test.dev');
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000b7","email":"couple@test.dev"}';
select public.create_wedding('{"partner1":"Emma","partner2":"James"}') as w \gset
reset role;
select throws_ok(format($$insert into day_items (wedding_id, start_time, title) values (%L, '09:00', 'Sneaky')$$, :'w'), 'P0001', 'PASS_REQUIRED', 'an unpaid wedding still cannot add day items by hand');
set local role authenticated;
reset role;
update entitlements set plan = 'pass', valid_until = current_date + 500 where wedding_id = :'w';
set local role authenticated;

select is((select count(*)::int from day_items where wedding_id = :'w'), :n_templates, 'a new wedding gets the default day schedule');
select is((select start_time from day_items where wedding_id = :'w' and title = 'Ceremony'), '16:00'::time, 'built around a 4:00 PM ceremony');
select is((select count(*)::int from day_items where wedding_id = :'w' and audience = 'everyone' and title ~* 'hair|makeup|tip'), 0, 'private prep and vendor items are not shown to guests');
select is(public.shift_day_items(:'w', 90), :n_templates, 'shifting moves every item');
select is((select start_time from day_items where wedding_id = :'w' and title = 'Ceremony'), '17:30'::time, 'ceremony now at 5:30 PM');
select throws_ok(format($$select public.shift_day_items(%L, 180)$$, :'w'), 'P0001', 'SHIFT_PAST_MIDNIGHT', 'cannot push items past midnight');

reset role;
insert into weddings (id, partner1, partner2) values ('10000000-0000-0000-0000-0000000000b6', 'Ana', 'Leo');
insert into entitlements (wedding_id, plan, valid_until) values ('10000000-0000-0000-0000-0000000000b6', 'pass', current_date + 100)
  on conflict (wedding_id) do update set plan = 'pass', valid_until = excluded.valid_until;
delete from day_items where wedding_id = '10000000-0000-0000-0000-0000000000b6';
insert into day_items (wedding_id, start_time, title) values ('10000000-0000-0000-0000-0000000000b6', '17:00', 'Ceremony');
select public.seed_default_day('10000000-0000-0000-0000-0000000000b6');
select is((select count(*)::int from day_items where wedding_id = '10000000-0000-0000-0000-0000000000b6' and title ~* '^ceremony$'), 1, 'an existing ceremony is not duplicated');
select * from finish();
rollback;
