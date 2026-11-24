-- Private buckets. Objects live at {wedding_id}/{uuid}-{filename}.

create or replace function public.path_wedding(p text) returns uuid
language plpgsql immutable as $$
begin
  return split_part(p, '/', 1)::uuid;
exception when others then
  return null;
end $$;

insert into storage.buckets (id, name, public, file_size_limit)
values ('vision', 'vision', false, 10485760),
       ('files',  'files',  false, 10485760)
on conflict (id) do nothing;

create policy "vision_read" on storage.objects for select to authenticated
  using (bucket_id = 'vision' and public.my_access(public.path_wedding(name), 'vision') in ('read','edit'));
create policy "vision_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'vision' and public.my_access(public.path_wedding(name), 'vision') = 'edit');
create policy "vision_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'vision' and public.my_access(public.path_wedding(name), 'vision') = 'edit');

create policy "files_read" on storage.objects for select to authenticated
  using (bucket_id = 'files' and public.my_access(public.path_wedding(name), 'files') in ('read','edit'));
create policy "files_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'files' and public.my_access(public.path_wedding(name), 'files') = 'edit');
create policy "files_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'files' and public.my_access(public.path_wedding(name), 'files') = 'edit');

-- Realtime: broadcast changes for the tabs people co-edit. Realtime applies RLS per subscriber.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.seating_tables, public.guests, public.tasks, public.day_items;
  end if;
end $$;
