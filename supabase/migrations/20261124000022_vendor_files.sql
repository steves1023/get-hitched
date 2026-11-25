-- Files can be attached to a vendor (contracts, quotes, invoices). They still live on the Files tab.
-- Deleting a vendor keeps its files; they just lose the link.

alter table public.files add column vendor_id uuid references public.vendors(id) on delete set null;
create index files_vendor_idx on public.files (vendor_id);

create or replace function public.check_file_vendor() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.vendor_id is not null and not exists (
    select 1 from public.vendors v where v.id = new.vendor_id and v.wedding_id = new.wedding_id) then
    raise exception 'FILE_VENDOR_MISMATCH';
  end if;
  return new;
end $$;
create trigger files_vendor_check before insert or update of vendor_id on public.files
  for each row execute function public.check_file_vendor();
