-- Row-level security. The database, not the UI, decides who sees what.

alter table public.weddings             enable row level security;
alter table public.wedding_members      enable row level security;
alter table public.member_module_access enable row level security;
alter table public.tasks                enable row level security;
alter table public.day_items            enable row level security;
alter table public.day_item_assignees   enable row level security;

-- weddings: members read; couple edits; created only through create_wedding(); owner deletes
create policy weddings_select on public.weddings for select using (public.is_member(id));
create policy weddings_update on public.weddings for update using (public.is_couple(id)) with check (public.is_couple(id));
create policy weddings_delete on public.weddings for delete using (public.my_role(id) = 'owner');

-- wedding_members: members see who else is on the wedding; couple manages; rows created by RPCs
create policy members_select on public.wedding_members for select using (public.is_member(wedding_id));
create policy members_update on public.wedding_members for update
  using (public.is_couple(wedding_id) and role <> 'owner') with check (public.is_couple(wedding_id) and role <> 'owner');
create policy members_delete on public.wedding_members for delete
  using (public.is_couple(wedding_id) and role <> 'owner');

-- member_module_access: you can read your own levels; the couple reads and writes everyone's
create policy mma_select on public.member_module_access for select
  using (public.is_couple(wedding_id) or member_id = public.my_member_id(wedding_id));
create policy mma_write on public.member_module_access for all
  using (public.is_couple(wedding_id)) with check (public.is_couple(wedding_id));

-- Standard tabs: read/edit levels only ('assigned' means nothing for these)
do $$
declare r record;
begin
  for r in select * from (values
      ('vendors','vendors'), ('vendor_payments','budget'), ('expenses','budget'),
      ('guests','guests'), ('seating_tables','seating'), ('vision_items','vision'),
      ('files','files'), ('hashtags','hashtags')) as t(tbl, module)
  loop
    execute format('alter table public.%I enable row level security', r.tbl);
    execute format($p$create policy %I on public.%I for select using (public.my_access(wedding_id, %L) in ('read','edit'))$p$,
                   r.tbl || '_select', r.tbl, r.module);
    execute format($p$create policy %I on public.%I for insert with check (public.my_access(wedding_id, %L) = 'edit')$p$,
                   r.tbl || '_insert', r.tbl, r.module);
    execute format($p$create policy %I on public.%I for update using (public.my_access(wedding_id, %L) = 'edit') with check (public.my_access(wedding_id, %L) = 'edit')$p$,
                   r.tbl || '_update', r.tbl, r.module, r.module);
    execute format($p$create policy %I on public.%I for delete using (public.my_access(wedding_id, %L) = 'edit')$p$,
                   r.tbl || '_delete', r.tbl, r.module);
  end loop;
end $$;

-- tasks: read/edit see all; 'assigned' sees only their own
create policy tasks_select on public.tasks for select using (
  public.my_access(wedding_id, 'tasks') in ('read','edit')
  or (public.my_access(wedding_id, 'tasks') = 'assigned'
      and assignee_member_id = public.my_member_id(wedding_id))
);
create policy tasks_insert on public.tasks for insert with check (public.my_access(wedding_id, 'tasks') = 'edit');
create policy tasks_update on public.tasks for update
  using (public.my_access(wedding_id, 'tasks') = 'edit') with check (public.my_access(wedding_id, 'tasks') = 'edit');
create policy tasks_delete on public.tasks for delete using (public.my_access(wedding_id, 'tasks') = 'edit');
-- Assignees tick their own tasks through complete_task(), not a direct update.

-- day_items: 'assigned' sees everyone-items, party items (if in the party), and items naming them
create policy day_items_select on public.day_items for select using (
  public.my_access(wedding_id, 'day') in ('read','edit')
  or (public.my_access(wedding_id, 'day') = 'assigned' and (
        audience = 'everyone'
     or (audience = 'wedding_party' and public.my_role(wedding_id) = 'wedding_party')
     or exists (select 1 from public.day_item_assignees x
                where x.day_item_id = day_items.id
                  and x.member_id = public.my_member_id(day_items.wedding_id))))
);
create policy day_items_insert on public.day_items for insert with check (public.my_access(wedding_id, 'day') = 'edit');
create policy day_items_update on public.day_items for update
  using (public.my_access(wedding_id, 'day') = 'edit') with check (public.my_access(wedding_id, 'day') = 'edit');
create policy day_items_delete on public.day_items for delete using (public.my_access(wedding_id, 'day') = 'edit');

create policy dia_select on public.day_item_assignees for select using (
  public.my_access(wedding_id, 'day') in ('read','edit') or member_id = public.my_member_id(wedding_id)
);
create policy dia_write on public.day_item_assignees for all
  using (public.my_access(wedding_id, 'day') = 'edit') with check (public.my_access(wedding_id, 'day') = 'edit');
