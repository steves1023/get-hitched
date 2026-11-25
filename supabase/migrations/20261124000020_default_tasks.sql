-- A standard planning checklist for every wedding, with due dates counted back from the wedding date.
-- Changing the date moves the default tasks, except ones that are done or whose due date was set by hand.

create table public.task_templates (
  key         text primary key,
  title       text not null,
  category    text not null,
  days_before int  not null,          -- negative = after the wedding
  notes       text,
  match       text,                   -- regex: an existing task matching this counts as the same task
  sort        int  not null
);
alter table public.task_templates enable row level security;   -- read only through the functions below

insert into public.task_templates (key, title, category, days_before, notes, match, sort) values
  ('budget',          'Set your overall budget',                          'Other',       365, 'Agree on a total and who is contributing. Track it on the Budget tab.', 'budget', 10),
  ('guest_draft',     'Draft your guest list',                            'Other',       355, 'A rough headcount drives venue size and budget.', 'guest list', 20),
  ('venue',           'Choose and book your venue',                       'Venue',       330, 'Popular venues book 12+ months out.', 'venue', 30),
  ('planner',         'Hire a wedding planner (if using one)',            'Other',       330, null, 'planner', 40),
  ('party',           'Ask your wedding party',                           'Other',       300, 'Invite them on the Share button so they see the Wedding Day plan.', 'wedding party|bridesmaid|groomsm', 50),
  ('photographer',    'Book your photographer',                           'Photography', 300, 'Experts suggest 10 to 12 months out.', 'photograph', 60),
  ('caterer',         'Book your caterer',                                'Catering',    300, null, 'cater', 70),
  ('videographer',    'Book your videographer',                           'Photography', 285, null, 'videograph', 80),
  ('officiant',       'Book your officiant',                              'Other',       270, null, 'officiant', 90),
  ('music',           'Book your DJ or band',                             'Music',       270, null, '\mdj\M|band|music', 100),
  ('attire_shop',     'Start shopping for wedding attire',                'Attire',      270, 'Dresses can take 4 to 6 months to arrive, plus alterations.', 'dress|gown', 110),
  ('website',         'Set up your wedding website',                      'Other',       260, 'Use the Website tab. Publish it when you send save-the-dates.', 'website', 120),
  ('florist',         'Book your florist',                                'Flowers',     240, null, 'florist|flower', 130),
  ('hotels',          'Reserve hotel room blocks for guests',             'Other',       240, null, 'hotel|room block', 140),
  ('registry',        'Start your registry',                              'Other',       240, null, 'registry', 150),
  ('save_dates',      'Send save-the-dates',                              'Invitations', 225, 'Six to eight months out; earlier for destination weddings.', 'save.the.date', 160),
  ('hair_makeup',     'Book hair and makeup',                             'Attire',      180, null, 'hair|makeup', 170),
  ('party_attire',    'Choose wedding party attire',                      'Attire',      180, null, 'party attire|bridesmaid dress|groomsmen', 180),
  ('cake',            'Order your wedding cake',                          'Catering',    180, null, 'cake', 190),
  ('honeymoon',       'Plan your honeymoon',                              'Other',       180, 'Check passport expiry dates now.', 'honeymoon', 200),
  ('transport',       'Book transportation',                              'Transport',   150, null, 'transport|shuttle|limo', 210),
  ('rentals',         'Arrange rentals (tables, chairs, linens)',         'Venue',       150, null, 'rental', 220),
  ('order_invites',   'Order invitations',                                'Invitations', 120, 'The Print tab can make matching table cards and place cards later.', 'order.*invitation', 230),
  ('tasting',         'Do a menu tasting',                                'Catering',    120, null, 'tasting', 240),
  ('rings',           'Buy wedding rings',                                'Attire',      120, null, '\mring', 250),
  ('suits',           'Choose suits or tuxedos',                          'Attire',      120, null, 'suit|tux', 260),
  ('ceremony',        'Plan the ceremony with your officiant',            'Other',        90, null, 'ceremony', 270),
  ('send_invites',    'Mail invitations',                                 'Invitations',  56, 'About 8 weeks before the wedding.', '(send|mail).*invitation', 280),
  ('fittings',        'Schedule attire fittings',                         'Attire',       60, null, 'fitting', 290),
  ('day_schedule',    'Draft the wedding day schedule',                   'Other',        60, 'Build it on the Wedding Day tab and share parts with your wedding party.', 'schedule|timeline', 300),
  ('license',         'Get your marriage license',                        'Other',        45, 'Rules and waiting periods vary by place. Check with your county or city clerk.', 'license', 310),
  ('vows',            'Write your vows',                                  'Other',        45, null, 'vow', 320),
  ('rsvp_chase',      'Follow up on missing RSVPs',                       'Invitations',  30, 'Filter the Guests tab by Pending.', 'rsvp', 330),
  ('seating',         'Make the seating chart',                           'Venue',        21, 'Use the Seating tab, then print place cards from Print.', 'seating', 340),
  ('headcount',       'Give the final headcount to caterer and venue',    'Catering',     14, null, 'headcount|final count', 350),
  ('confirm_vendors', 'Confirm arrival times with every vendor',          'Other',        14, null, 'confirm.*vendor', 360),
  ('final_payments',  'Make final vendor payments',                       'Other',         7, null, 'final payment', 370),
  ('attire_pickup',   'Pick up attire and do a final fitting',            'Attire',        7, null, 'pick up', 380),
  ('tips',            'Prepare vendor tips and envelopes',                'Other',         3, null, '\mtip', 390),
  ('rehearsal',       'Rehearsal and rehearsal dinner',                   'Other',         1, null, 'rehearsal', 400),
  ('return_rentals',  'Return rentals and borrowed items',                'Venue',        -3, null, 'return', 410),
  ('thank_yous',      'Send thank-you notes',                             'Other',       -60, 'Draft them on the Gifts tab.', 'thank', 420),
  ('name_change',     'Update your name (if you are changing it)',        'Other',       -30, null, 'name change|change your name|update your name', 430);

alter table public.tasks
  add column template_key text,
  add column due_auto     boolean not null default false;   -- true while the due date follows the wedding date

-- Due date for a template: counted from the wedding date, never earlier than today.
create or replace function public.template_due(p_date date, p_days int) returns date
language sql stable as $$
  select case when p_date is null then null else greatest(p_date - p_days, current_date) end
$$;

-- Add the checklist to one wedding, skipping anything it already has.
create or replace function public.seed_default_tasks(w uuid) returns int
language plpgsql security definer set search_path = public as $$
declare d date; n int;
begin
  select wedding_date into d from public.weddings where id = w;
  insert into public.tasks (wedding_id, title, category, due_date, notes, template_key, due_auto)
  select w, t.title, t.category, public.template_due(d, t.days_before), t.notes, t.key, true
  from public.task_templates t
  where not exists (select 1 from public.tasks x where x.wedding_id = w
                    and (x.template_key = t.key or x.title ~* coalesce(t.match, '^' || t.title || '$')))
  order by t.sort;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.seed_default_tasks(uuid) from public, anon, authenticated;

-- Editing a default task's due date by hand stops it following the wedding date.
create or replace function public.tasks_due_manual() returns trigger
language plpgsql as $$
begin
  if new.due_date is distinct from old.due_date and coalesce(current_setting('gethitched.reflow', true), '') <> 'on' then
    new.due_auto := false;
  end if;
  return new;
end $$;
create trigger tasks_due_manual before update of due_date on public.tasks
  for each row execute function public.tasks_due_manual();

-- New weddings get the checklist; a new wedding date moves the open default tasks.
create or replace function public.wedding_default_tasks() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.seed_default_tasks(new.id);
  elsif new.wedding_date is distinct from old.wedding_date then
    perform set_config('gethitched.reflow', 'on', true);
    update public.tasks k set due_date = public.template_due(new.wedding_date, t.days_before)
    from public.task_templates t
    where k.wedding_id = new.id and k.template_key = t.key and k.due_auto and k.status = 'todo';
    perform set_config('gethitched.reflow', 'off', true);
  end if;
  return null;
end $$;
create trigger weddings_default_tasks after insert or update of wedding_date on public.weddings
  for each row execute function public.wedding_default_tasks();

-- Existing weddings get the checklist now, without duplicating tasks they already have.
select public.seed_default_tasks(id) from public.weddings;
