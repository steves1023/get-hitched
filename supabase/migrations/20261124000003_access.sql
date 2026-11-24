-- Per-person, per-tab access levels and the helper functions every policy uses.

create table public.member_module_access (
  member_id  uuid not null references public.wedding_members(id) on delete cascade,
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  module     text not null check (module in ('tasks','vendors','budget','guests','seating','day','vision','files','hashtags')),
  level      text not null check (level in ('none','assigned','read','edit')),
  primary key (member_id, module)
);
create index member_module_access_wedding_idx on public.member_module_access(wedding_id);

-- security definer: these read wedding_members without triggering its own RLS (no recursion).
create or replace function public.my_member_id(w uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.wedding_members where wedding_id = w and user_id = auth.uid()
$$;

create or replace function public.my_role(w uuid) returns public.member_role
language sql stable security definer set search_path = public as $$
  select role from public.wedding_members where wedding_id = w and user_id = auth.uid()
$$;

create or replace function public.is_member(w uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.wedding_members where wedding_id = w and user_id = auth.uid())
$$;

create or replace function public.is_couple(w uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.wedding_members
                 where wedding_id = w and user_id = auth.uid() and role in ('owner','partner'))
$$;

-- Returns 'none' | 'assigned' | 'read' | 'edit'. Owners and partners always get 'edit'.
create or replace function public.my_access(w uuid, m text) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((
    select case when wm.role in ('owner','partner') then 'edit'
                else coalesce(a.level, 'none') end
    from public.wedding_members wm
    left join public.member_module_access a on a.member_id = wm.id and a.module = m
    where wm.wedding_id = w and wm.user_id = auth.uid()
  ), 'none')
$$;
