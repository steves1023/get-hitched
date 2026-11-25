-- Gifts (with one or more givers), guest notes, thank-you drafts, and the couple's print theme.

-- New tab: gifts
alter table public.member_module_access drop constraint if exists member_module_access_module_check;
alter table public.member_module_access add constraint member_module_access_module_check
  check (module in ('tasks','vendors','budget','guests','seating','day','vision','files','hashtags','gifts'));

-- Notes on each guest ("James's college roommate"); used to personalise thank-you notes.
alter table public.guests add column notes text check (notes is null or length(notes) <= 1000);

create table public.gifts (
  id                uuid primary key default gen_random_uuid(),
  wedding_id        uuid not null references public.weddings(id) on delete cascade,
  description       text not null check (length(description) between 1 and 300),
  kind              text not null default 'item' check (kind in ('registry','cash','check','gift_card','item','experience','other')),
  amount            numeric(12,2) check (amount is null or amount >= 0),
  received_on       date,
  occasion          text not null default 'wedding' check (occasion in ('engagement','shower','wedding','other')),
  from_other        text check (from_other is null or length(from_other) <= 200),   -- givers who aren't on the guest list
  notes             text check (notes is null or length(notes) <= 1000),
  thank_you_status  text not null default 'none' check (thank_you_status in ('none','drafted','sent')),
  thank_you_text    text check (thank_you_text is null or length(thank_you_text) <= 3000),
  thank_you_sent_on date,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index gifts_wedding_idx on public.gifts (wedding_id);
create trigger gifts_updated before update on public.gifts for each row execute function public.set_updated_at();

create table public.gift_givers (
  gift_id    uuid not null references public.gifts(id) on delete cascade,
  guest_id   uuid not null references public.guests(id) on delete cascade,
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  primary key (gift_id, guest_id)
);
create index gift_givers_guest_idx on public.gift_givers (guest_id);

-- A giver must belong to the same wedding as the gift.
create or replace function public.check_gift_giver() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.gifts where id = new.gift_id and wedding_id = new.wedding_id)
     or not exists (select 1 from public.guests where id = new.guest_id and wedding_id = new.wedding_id) then
    raise exception 'GIFT_GIVER_MISMATCH';
  end if;
  return new;
end $$;
create trigger gift_givers_check before insert or update on public.gift_givers
  for each row execute function public.check_gift_giver();

do $$
declare t text;
begin
  foreach t in array array['gifts','gift_givers'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format($p$create policy %I on public.%I for select using (public.my_access(wedding_id, 'gifts') in ('read','edit'))$p$, t || '_select', t);
    execute format($p$create policy %I on public.%I for insert with check (public.my_access(wedding_id, 'gifts') = 'edit')$p$, t || '_insert', t);
    execute format($p$create policy %I on public.%I for update using (public.my_access(wedding_id, 'gifts') = 'edit') with check (public.my_access(wedding_id, 'gifts') = 'edit')$p$, t || '_update', t);
    execute format($p$create policy %I on public.%I for delete using (public.my_access(wedding_id, 'gifts') = 'edit')$p$, t || '_delete', t);
  end loop;
end $$;

-- The couple's PDF design, shared by all their printables.
alter table public.weddings add column print_theme jsonb not null default '{}'::jsonb;

-- accept_invite must carry 'gifts' access over from the invite.
create or replace function public.accept_invite(p_token text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  inv public.invites;
  mid uuid;
  t   text;
begin
  if auth.uid() is null then raise exception 'NOT_SIGNED_IN'; end if;
  select * into inv from public.invites where token = p_token for update;
  if not found then raise exception 'INVITE_NOT_FOUND'; end if;
  if inv.accepted_at is not null then
    if exists (select 1 from public.wedding_members where wedding_id = inv.wedding_id and user_id = auth.uid()) then
      return inv.wedding_id;
    end if;
    raise exception 'INVITE_USED';
  end if;
  if inv.expires_at < now() then raise exception 'INVITE_EXPIRED'; end if;
  if lower(coalesce(auth.jwt()->>'email', '')) <> lower(inv.email) then
    raise exception 'INVITE_EMAIL_MISMATCH';
  end if;
  if exists (select 1 from public.wedding_members where wedding_id = inv.wedding_id and user_id = auth.uid()) then
    update public.invites set accepted_at = now() where id = inv.id;
    return inv.wedding_id;
  end if;
  if inv.role = 'partner' then
    if exists (select 1 from public.wedding_members where wedding_id = inv.wedding_id and role = 'partner') then
      raise exception 'PARTNER_EXISTS';
    end if;
  else
    t := public.seat_type(inv.role);
    if public.seats_used(inv.wedding_id, t, false) >= public.seat_limit(inv.wedding_id, t) then
      raise exception '%', case t when 'full' then 'NO_FULL_SPOTS' else 'NO_PARTY_SPOTS' end;
    end if;
  end if;
  insert into public.wedding_members (wedding_id, user_id, role, display_name)
  values (inv.wedding_id, auth.uid(), inv.role, inv.display_name)
  returning id into mid;
  insert into public.member_module_access (member_id, wedding_id, module, level)
  select mid, inv.wedding_id, key, value
  from jsonb_each_text(case when t = 'party' then '{"day":"assigned"}'::jsonb else inv.access end)
  where key in ('tasks','vendors','budget','guests','seating','day','vision','files','hashtags','gifts');
  update public.invites set accepted_at = now() where id = inv.id;
  return inv.wedding_id;
end $$;
