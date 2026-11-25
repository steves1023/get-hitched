-- Public wedding website: drafted privately by the couple, published when they're ready.
-- Guests never read tables directly; three security-definer functions expose exactly what the site needs.

create table public.wedding_sites (
  wedding_id    uuid primary key references public.weddings(id) on delete cascade,
  slug          text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$'),
  published     boolean not null default false,
  published_at  timestamptz,
  hero_path     text,
  story         text check (story is null or length(story) <= 6000),
  travel        text check (travel is null or length(travel) <= 6000),
  registry      jsonb not null default '[]'::jsonb,   -- [{ name, url }]
  faq           jsonb not null default '[]'::jsonb,   -- [{ q, a }]
  party         jsonb not null default '[]'::jsonb,   -- [{ name, role, blurb, photo }]
  photos        jsonb not null default '[]'::jsonb,   -- [storage path, ...]
  sections      jsonb not null default '{"schedule":true,"story":true,"party":true,"photos":true,"travel":true,"registry":true,"faq":true,"rsvp":true}'::jsonb,
  rsvp_deadline date,
  rsvp_note     text check (rsvp_note is null or length(rsvp_note) <= 600),
  updated_at    timestamptz not null default now()
);
create trigger wedding_sites_updated before update on public.wedding_sites for each row execute function public.set_updated_at();
alter table public.wedding_sites enable row level security;
create policy wedding_sites_couple on public.wedding_sites for all
  using (public.is_couple(wedding_id)) with check (public.is_couple(wedding_id));

-- Online RSVPs land on the guest list.
alter table public.guests
  add column rsvp_message text check (rsvp_message is null or length(rsvp_message) <= 1000),
  add column rsvp_at timestamptz;

-- Public images (cover, gallery, wedding party). Anyone with the link can view; only the couple can upload.
insert into storage.buckets (id, name, public, file_size_limit) values ('site', 'site', true, 10485760)
on conflict (id) do nothing;
create policy "site_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'site' and public.is_couple(public.path_wedding(name)));
create policy "site_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'site' and public.is_couple(public.path_wedding(name)));

create or replace function public.norm_name(t text) returns text
language sql immutable as $$ select lower(regexp_replace(trim(coalesce(t, '')), '\s+', ' ', 'g')) $$;

-- Everything the public site shows. Drafts are visible only to the couple, in preview.
create or replace function public.get_public_site(p_slug text, p_preview boolean default false) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s public.wedding_sites; w public.weddings;
begin
  select * into s from public.wedding_sites where slug = lower(trim(p_slug));
  if not found then return jsonb_build_object('status', 'missing'); end if;
  select * into w from public.weddings where id = s.wedding_id;
  if not ((s.published and public.has_pass(w.id)) or (p_preview and public.is_couple(w.id))) then
    return jsonb_build_object('status', case when s.published then 'closed' else 'draft' end);
  end if;
  return jsonb_build_object(
    'status', 'ok',
    'preview', not s.published,
    'wedding', jsonb_build_object('partner1', w.partner1, 'partner2', w.partner2, 'last_names', w.last_names,
                                  'wedding_date', w.wedding_date, 'venue', w.venue, 'theme', w.print_theme),
    'site', jsonb_build_object('hero_path', s.hero_path, 'story', s.story, 'travel', s.travel, 'registry', s.registry,
                               'faq', s.faq, 'party', s.party, 'photos', s.photos, 'sections', s.sections,
                               'rsvp_deadline', s.rsvp_deadline, 'rsvp_note', s.rsvp_note,
                               'rsvp_open', coalesce((s.sections->>'rsvp')::boolean, false) and (s.rsvp_deadline is null or s.rsvp_deadline >= current_date)),
    'schedule', coalesce((select jsonb_agg(jsonb_build_object('start_time', d.start_time, 'title', d.title, 'location', d.location,
                                                              'duration_min', d.duration_min, 'phase', d.phase) order by d.start_time)
                          from public.day_items d where d.wedding_id = w.id and d.audience = 'everyone'), '[]'::jsonb)
  );
end $$;

-- Shared checks for the two RSVP functions: site live, RSVP on, not past the deadline, not hammered.
create or replace function public.rsvp_site(p_slug text) returns public.wedding_sites
language plpgsql security definer set search_path = public as $$
declare s public.wedding_sites;
begin
  select * into s from public.wedding_sites where slug = lower(trim(p_slug));
  if not found or not s.published or not public.has_pass(s.wedding_id)
     or not coalesce((s.sections->>'rsvp')::boolean, false)
     or (s.rsvp_deadline is not null and s.rsvp_deadline < current_date) then
    raise exception 'RSVP_CLOSED';
  end if;
  if (select count(*) from public.usage_events where wedding_id = s.wedding_id and kind = 'rsvp'
      and created_at > now() - interval '1 minute') >= 60 then
    raise exception 'RSVP_BUSY';
  end if;
  insert into public.usage_events (wedding_id, kind) values (s.wedding_id, 'rsvp');
  return s;
end $$;

-- Find a household by one person's full name. Exact match only, so the guest list can't be browsed.
create or replace function public.rsvp_find(p_slug text, p_name text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.wedding_sites; n text := public.norm_name(p_name);
begin
  s := public.rsvp_site(p_slug);
  if length(n) < 3 or position(' ' in n) = 0 then raise exception 'RSVP_FULL_NAME'; end if;
  return jsonb_build_object('households', coalesce((
    select jsonb_agg(jsonb_build_object(
      'head_id', h.id, 'city', h.city,
      'people', (select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'rsvp', p.rsvp, 'dietary', p.dietary,
                                                     'plus_one', p.party_size > 1, 'is_head', p.id = h.id)
                                  order by (p.id = h.id) desc, p.name)
                 from public.guests p where p.wedding_id = s.wedding_id and (p.id = h.id or p.primary_guest_id = h.id))))
    from (select distinct hg.* from public.guests g
          join public.guests hg on hg.id = coalesce(g.primary_guest_id, g.id)
          where g.wedding_id = s.wedding_id and g.couple_role is null and public.norm_name(g.name) = n
          limit 5) h), '[]'::jsonb));
end $$;

-- Save answers for one household. The name typed must belong to that household.
create or replace function public.rsvp_submit(p_slug text, p_head uuid, p_name text, p_answers jsonb, p_message text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.wedding_sites; a jsonb; members uuid[];
begin
  s := public.rsvp_site(p_slug);
  select array_agg(id) into members from public.guests
  where wedding_id = s.wedding_id and couple_role is null and (id = p_head or primary_guest_id = p_head);
  if members is null or not exists (select 1 from public.guests where id = any(members) and public.norm_name(name) = public.norm_name(p_name)) then
    raise exception 'RSVP_NOT_ALLOWED';
  end if;
  for a in select * from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) loop
    if not ((a->>'id')::uuid = any(members)) or (a->>'rsvp') not in ('yes', 'no') then raise exception 'RSVP_NOT_ALLOWED'; end if;
    update public.guests set rsvp = a->>'rsvp',
      dietary = nullif(left(trim(coalesce(a->>'dietary', '')), 200), '')
    where id = (a->>'id')::uuid;
  end loop;
  update public.guests set rsvp_at = now(), rsvp_message = nullif(left(trim(coalesce(p_message, '')), 1000), '')
  where id = p_head;
  return jsonb_build_object('ok', true);
end $$;

revoke execute on function public.rsvp_site(text) from public, anon, authenticated;
grant execute on function public.get_public_site(text, boolean) to anon, authenticated;
grant execute on function public.rsvp_find(text, text) to anon, authenticated;
grant execute on function public.rsvp_submit(text, uuid, text, jsonb, text) to anon, authenticated;
