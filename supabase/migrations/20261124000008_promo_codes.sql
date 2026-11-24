-- Promo codes that grant the Wedding Pass without a Stripe payment.
-- Codes are created by you in the SQL editor; clients can never list them.

create table public.promo_codes (
  code            text primary key check (code = upper(code) and length(code) between 4 and 40),
  description     text,
  max_redemptions int check (max_redemptions is null or max_redemptions > 0),  -- null = unlimited
  redemptions     int not null default 0,
  expires_at      timestamptz,                                                -- null = never
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);
alter table public.promo_codes enable row level security;
-- No policies on purpose: only the redeem function (security definer) and you (SQL editor) can read it.

create table public.promo_redemptions (
  code        text not null references public.promo_codes(code) on delete cascade,
  wedding_id  uuid not null references public.weddings(id) on delete cascade,
  redeemed_by uuid references auth.users(id) on delete set null,
  redeemed_at timestamptz not null default now(),
  primary key (code, wedding_id)
);
alter table public.promo_redemptions enable row level security;
create policy promo_redemptions_select on public.promo_redemptions for select using (public.is_couple(wedding_id));

-- Redeems a code for a wedding. Returns the date the pass is valid until.
create or replace function public.redeem_promo_code(p_wedding uuid, p_code text) returns date
language plpgsql security definer set search_path = public as $$
declare
  c     public.promo_codes;
  until date;
begin
  if auth.uid() is null then raise exception 'NOT_SIGNED_IN'; end if;
  if not public.is_couple(p_wedding) then raise exception 'NOT_ALLOWED'; end if;

  select * into c from public.promo_codes where code = upper(trim(p_code)) for update;
  if not found then raise exception 'PROMO_INVALID'; end if;
  if exists (select 1 from public.promo_redemptions where code = c.code and wedding_id = p_wedding) then
    raise exception 'PROMO_ALREADY_USED';
  end if;
  if not c.active
     or (c.expires_at is not null and c.expires_at < now())
     or (c.max_redemptions is not null and c.redemptions >= c.max_redemptions) then
    raise exception 'PROMO_INVALID';
  end if;
  if public.has_pass(p_wedding) then
    raise exception 'ALREADY_HAS_PASS';  -- don't burn a code on a wedding that already has access
  end if;

  -- Same validity as a purchased pass: wedding date + 90 days (or a year + 90 days if no date yet)
  select coalesce(wedding_date, current_date + 365) + 90 into until from public.weddings where id = p_wedding;

  insert into public.entitlements (wedding_id, plan, valid_until)
  values (p_wedding, 'pass', until)
  on conflict (wedding_id) do update set plan = 'pass', valid_until = excluded.valid_until;

  insert into public.promo_redemptions (code, wedding_id, redeemed_by) values (c.code, p_wedding, auth.uid());
  update public.promo_codes set redemptions = redemptions + 1 where code = c.code;
  return until;
end $$;
revoke execute on function public.redeem_promo_code(uuid, text) from anon;
