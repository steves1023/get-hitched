-- Run with: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to public, extensions;
select plan(9);
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000b9', 'couple@test.dev');
select count(*)::int as n_templates from task_templates \gset
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000b9","email":"couple@test.dev"}';
select public.create_wedding(jsonb_build_object('partner1','Emma','partner2','James','wedding_date', (current_date + 400)::text)) as w \gset
reset role;
update entitlements set plan = 'pass', valid_until = current_date + 500 where wedding_id = :'w';
set local role authenticated;

select is((select count(*)::int from tasks where wedding_id = :'w'), :n_templates, 'a new wedding gets the full checklist');
select is((select due_date from tasks where wedding_id = :'w' and template_key = 'send_invites'), current_date + 400 - 56, 'invitations are due 8 weeks before the wedding');
select is((select due_date from tasks where wedding_id = :'w' and template_key = 'thank_yous'), current_date + 460, 'thank-you notes come after the wedding');

update tasks set due_date = current_date + 5 where wedding_id = :'w' and template_key = 'cake';
update tasks set status = 'done' where wedding_id = :'w' and template_key = 'venue';
update weddings set wedding_date = current_date + 100 where id = :'w';
select is((select due_date from tasks where wedding_id = :'w' and template_key = 'send_invites'), current_date + 100 - 56, 'moving the wedding date moves the default tasks');
select is((select due_date from tasks where wedding_id = :'w' and template_key = 'photographer'), current_date, 'tasks that are already past their ideal time are due today, not in the past');
select is((select due_date from tasks where wedding_id = :'w' and template_key = 'cake'), current_date + 5, 'a due date set by hand stays put');
select is((select due_date from tasks where wedding_id = :'w' and template_key = 'venue'), (current_date + 400 - 330), 'a finished task keeps its date');

reset role;
insert into weddings (id, partner1, partner2) values ('10000000-0000-0000-0000-0000000000b8', 'Ana', 'Leo');
select is((select count(*)::int from tasks where wedding_id = '10000000-0000-0000-0000-0000000000b8' and due_date is not null), 0, 'no wedding date yet means no due dates');
delete from tasks where wedding_id = '10000000-0000-0000-0000-0000000000b8';
insert into tasks (wedding_id, title, category) values ('10000000-0000-0000-0000-0000000000b8', 'Book photographer', 'Photography');
select public.seed_default_tasks('10000000-0000-0000-0000-0000000000b8');
select is((select count(*)::int from tasks where wedding_id = '10000000-0000-0000-0000-0000000000b8' and title ~* 'photograph'), 1, 'an existing matching task is not duplicated');
select * from finish();
rollback;
