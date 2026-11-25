-- A standard wedding day schedule for every wedding, built around a 4:00 PM ceremony.
-- "everyone" items show on the public website and printed guest schedule, so only guest-facing moments use it.

create table public.day_templates (
  key          text primary key,
  start_time   time not null,
  title        text not null,
  who          text,
  location     text,
  duration_min int,
  phase        text not null,
  audience     text not null,
  match        text,          -- regex: an existing item matching this counts as the same item
  sort         int not null
);
alter table public.day_templates enable row level security;   -- read only through the functions below

insert into public.day_templates (key, start_time, title, who, location, duration_min, phase, audience, match, sort) values
  ('breakfast',      '08:00', 'Breakfast together',                              'Couple and wedding party',        null,                  45,  'morning_prep',  'wedding_party', 'breakfast', 10),
  ('hair_makeup',    '08:45', 'Hair and makeup begins',                          'Hair and makeup team',            'Getting-ready suite', 240, 'morning_prep',  'wedding_party', 'hair|makeup', 20),
  ('flowers',        '10:00', 'Florist delivers bouquets and boutonnieres',      'Florist',                         'Getting-ready suite', 15,  'morning_prep',  'couple_only',   'florist|bouquet', 30),
  ('lunch',          '12:00', 'Lunch and snacks for everyone getting ready',     'Wedding party',                   'Getting-ready suite', 30,  'getting_ready', 'wedding_party', 'lunch|snack', 40),
  ('details',        '12:30', 'Photographer arrives: detail shots',              'Photographer',                    'Getting-ready suite', 45,  'getting_ready', 'couple_only',   'detail', 50),
  ('dressed',        '13:15', 'Get dressed',                                     'Couple and wedding party',        null,                  30,  'getting_ready', 'wedding_party', 'dress', 60),
  ('first_look',     '13:45', 'First look (optional)',                           'Couple and photographer',         null,                  20,  'getting_ready', 'couple_only',   'first look', 70),
  ('party_photos',   '14:05', 'Wedding party photos',                            'Wedding party and photographer',  null,                  40,  'getting_ready', 'wedding_party', 'party photo', 80),
  ('family_photos',  '14:45', 'Family photos',                                   'Immediate family and photographer', null,                30,  'getting_ready', 'wedding_party', 'family photo', 90),
  ('tuck_away',      '15:15', 'Couple tucked away before guests arrive',         'Couple',                          null,                  30,  'getting_ready', 'couple_only',   'tuck', 100),
  ('guests_arrive',  '15:30', 'Guests arrive and find their seats',              null,                              'Ceremony site',       30,  'ceremony',      'everyone',      'guests arrive|arrive', 110),
  ('line_up',        '15:50', 'Wedding party lines up',                          'Wedding party',                   'Ceremony site',       10,  'ceremony',      'wedding_party', 'line.?up|processional', 120),
  ('ceremony',       '16:00', 'Ceremony',                                        'Everyone',                        'Ceremony site',       30,  'ceremony',      'everyone',      '^ceremony$|ceremony (begins|starts)', 130),
  ('portraits',      '16:30', 'Couple portraits',                                'Couple and photographer',         null,                  30,  'ceremony',      'couple_only',   'portrait', 140),
  ('cocktails',      '16:30', 'Cocktail hour',                                   null,                              null,                  60,  'reception',     'everyone',      'cocktail', 150),
  ('entrance',       '17:30', 'Grand entrance',                                  'Couple and wedding party',        null,                  10,  'reception',     'everyone',      'entrance|introduc', 160),
  ('dinner',         '17:40', 'Dinner is served',                                null,                              null,                  60,  'reception',     'everyone',      'dinner', 170),
  ('toasts',         '18:40', 'Toasts',                                          'Best man and maid of honor',      null,                  20,  'reception',     'everyone',      'toast|speech', 180),
  ('first_dance',    '19:00', 'First dance',                                     'Couple',                          'Dance floor',         5,   'reception',     'everyone',      'first dance', 190),
  ('parent_dances',  '19:05', 'Parent dances',                                   null,                              'Dance floor',         10,  'reception',     'everyone',      'parent|father|mother', 200),
  ('dancing',        '19:15', 'Dance floor opens',                               'DJ or band',                      'Dance floor',         150, 'reception',     'everyone',      'dancing|dance floor', 210),
  ('cake',           '19:45', 'Cake cutting',                                    'Couple',                          null,                  10,  'reception',     'everyone',      'cake', 220),
  ('vendor_tips',    '21:00', 'Final payments and tips handed to vendors',       'Point person',                    null,                  15,  'reception',     'couple_only',   '\mtip|payment', 230),
  ('last_dance',     '21:45', 'Last dance',                                      'Couple',                          'Dance floor',         5,   'reception',     'everyone',      'last dance', 240),
  ('send_off',       '22:00', 'Send-off',                                        'Everyone',                        null,                  15,  'reception',     'everyone',      'send.?off|exit', 250),
  ('collect',        '22:15', 'Collect gifts, cards and personal items',         'Assigned wedding party member',   null,                  30,  'reception',     'wedding_party', 'collect|gifts', 260);

-- Unpaid weddings can't add day items, but the app's own setup must, so it raises a flag for this transaction.
create or replace function public.require_pass() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('gethitched.seeding', true), '') = 'on' then return new; end if;
  if not public.has_pass(new.wedding_id) then
    raise exception 'PASS_REQUIRED';
  end if;
  return new;
end $$;

-- Add the default schedule to one wedding, skipping anything it already has.
create or replace function public.seed_default_day(w uuid) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform set_config('gethitched.seeding', 'on', true);
  insert into public.day_items (wedding_id, start_time, title, who, location, duration_min, phase, audience)
  select w, t.start_time, t.title, t.who, t.location, t.duration_min, t.phase, t.audience
  from public.day_templates t
  where not exists (select 1 from public.day_items x where x.wedding_id = w
                    and x.title ~* coalesce(t.match, '^' || t.title || '$'))
  order by t.sort;
  get diagnostics n = row_count;
  perform set_config('gethitched.seeding', 'off', true);
  return n;
end $$;
revoke execute on function public.seed_default_day(uuid) from public, anon, authenticated;

create or replace function public.wedding_default_day() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.seed_default_day(new.id);
  return null;
end $$;
create trigger weddings_default_day after insert on public.weddings
  for each row execute function public.wedding_default_day();

-- Move every item on the day by the same number of minutes (e.g. a 5:30 ceremony instead of 4:00).
-- Runs as the caller, so it only works for people who can edit the Wedding Day tab.
create or replace function public.shift_day_items(w uuid, p_minutes int) returns int
language plpgsql security invoker set search_path = public as $$
declare n int;
begin
  if public.my_access(w, 'day') <> 'edit' then raise exception 'NOT_ALLOWED'; end if;
  if p_minutes is null or abs(p_minutes) > 720 then raise exception 'SHIFT_TOO_FAR'; end if;
  if exists (select 1 from public.day_items where wedding_id = w
             and (extract(epoch from start_time) / 60 + p_minutes < 0
                  or extract(epoch from start_time) / 60 + p_minutes >= 1440)) then
    raise exception 'SHIFT_PAST_MIDNIGHT';
  end if;
  update public.day_items set start_time = start_time + make_interval(mins => p_minutes) where wedding_id = w;
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function public.shift_day_items(uuid, int) to authenticated;

-- Existing weddings get the schedule now, without duplicating items they already have.
select public.seed_default_day(id) from public.weddings;
