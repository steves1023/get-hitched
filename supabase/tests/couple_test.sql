-- Run with: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to public, extensions;
select plan(5);
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000c9', 'couple@test.dev');
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000c9","email":"couple@test.dev"}';
select public.create_wedding('{"partner1":"Steve","partner2":"Megan"}') as w \gset
reset role;
update entitlements set plan = 'pass', valid_until = current_date + 30 where wedding_id = :'w';
set local role authenticated;
select is((select count(*)::int from guests where wedding_id = :'w' and couple_role is not null), 2, 'a new wedding gets the couple as seatable people');
select is((select string_agg(name, ',' order by couple_role) from guests where wedding_id = :'w' and couple_role is not null), 'Steve,Megan', 'with their names');
update weddings set partner2 = 'Meg' where id = :'w';
select is((select name from guests where wedding_id = :'w' and couple_role = 'partner2'), 'Meg', 'renaming in Settings follows through');
select throws_ok(format($$insert into guests (wedding_id, name, couple_role) values (%L, 'Dup', 'partner1')$$, :'w'), '23505', null, 'only one row per partner');
insert into guests (wedding_id, name, rsvp) values (:'w', 'Sarah', 'yes');
select is((select guests_total::int from wedding_summary where wedding_id = :'w'), 1, 'the couple is not counted as guests');
select * from finish();
rollback;
