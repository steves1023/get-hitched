-- Run with: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to public, extensions;
select plan(14);

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a5', 'couple@test.dev');
insert into public.weddings (id, partner1, partner2, wedding_date) values ('10000000-0000-0000-0000-0000000000a5', 'Emma', 'James', '2027-06-20');
delete from public.day_items where wedding_id = '10000000-0000-0000-0000-0000000000a5';   -- start from an empty schedule
insert into public.entitlements (wedding_id, plan, valid_until) values ('10000000-0000-0000-0000-0000000000a5', 'pass', current_date + 100);
insert into public.wedding_members (wedding_id, user_id, role, display_name) values
  ('10000000-0000-0000-0000-0000000000a5', '00000000-0000-0000-0000-0000000000a5', 'owner', 'Emma');
insert into public.day_items (wedding_id, start_time, title, audience) values
  ('10000000-0000-0000-0000-0000000000a5', '15:45', 'Ceremony', 'everyone'),
  ('10000000-0000-0000-0000-0000000000a5', '13:30', 'First look', 'couple_only');
insert into public.guests (id, wedding_id, name, rsvp, city) values ('70000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000a5', 'Sarah Miller', 'pending', 'Ann Arbor');
insert into public.guests (id, wedding_id, name, rsvp, primary_guest_id) values
  ('70000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-0000000000a5', 'Tom Miller', 'pending', '70000000-0000-0000-0000-0000000000a1');
insert into public.guests (id, wedding_id, name) values ('70000000-0000-0000-0000-0000000000a3', '10000000-0000-0000-0000-0000000000a5', 'Rita Patel');

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000a5","email":"couple@test.dev"}';
select lives_ok($$insert into wedding_sites (wedding_id, slug, story) values ('10000000-0000-0000-0000-0000000000a5', 'emma-and-james', 'We met in college.')$$, 'couple creates the site');
select throws_ok($$insert into wedding_sites (wedding_id, slug) values ('10000000-0000-0000-0000-0000000000a5', 'Bad Slug!')$$, '23514', null, 'web address must be lowercase letters, numbers and dashes');
select is(public.get_public_site('emma-and-james', true)->>'status', 'ok', 'couple can preview the draft');

reset role;
set local role anon;
set local request.jwt.claims to '{}';
select is(public.get_public_site('emma-and-james')->>'status', 'draft', 'guests see nothing before publishing');
select is(public.get_public_site('emma-and-james', true)->>'status', 'draft', 'and cannot force a preview');
select throws_ok($$select public.rsvp_find('emma-and-james', 'Sarah Miller')$$, 'P0001', 'RSVP_CLOSED', 'no RSVP on a draft site');
select is((select count(*)::int from wedding_sites), 0, 'guests cannot read the site table directly');

reset role;
update wedding_sites set published = true where slug = 'emma-and-james';
set local role anon;
select is(public.get_public_site('emma-and-james')->'site'->>'story', 'We met in college.', 'published site shows the story');
select is(jsonb_array_length(public.get_public_site('emma-and-james')->'schedule'), 1, 'schedule shows only items for everyone');
select is(jsonb_array_length(public.rsvp_find('emma-and-james', '  tom   MILLER ')->'households'->0->'people'), 2, 'finding one person returns their family');
select throws_ok($$select public.rsvp_find('emma-and-james', 'Sarah')$$, 'P0001', 'RSVP_FULL_NAME', 'a first name alone is not enough');
select is(jsonb_array_length(public.rsvp_find('emma-and-james', 'Nobody Here')->'households'), 0, 'unknown names reveal nothing');
select throws_ok($$select public.rsvp_submit('emma-and-james', '70000000-0000-0000-0000-0000000000a1', 'Rita Patel', '[]', null)$$,
  'P0001', 'RSVP_NOT_ALLOWED', 'cannot answer for a family you are not in');
select public.rsvp_submit('emma-and-james', '70000000-0000-0000-0000-0000000000a1', 'Tom Miller',
  '[{"id":"70000000-0000-0000-0000-0000000000a1","rsvp":"yes","dietary":""},{"id":"70000000-0000-0000-0000-0000000000a2","rsvp":"no","dietary":"Vegetarian"}]',
  'So excited!');
reset role;
select is((select string_agg(name || ':' || rsvp, ',' order by name) || '|' || (select rsvp_message from guests where id = '70000000-0000-0000-0000-0000000000a1')
           from guests where primary_guest_id = '70000000-0000-0000-0000-0000000000a1' or id = '70000000-0000-0000-0000-0000000000a1'),
  'Sarah Miller:yes,Tom Miller:no|So excited!', 'answers and message land on the guest list');

select * from finish();
rollback;
