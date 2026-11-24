import { useMemo, useState } from 'react';
import { useAccess } from '../lib/access';
import { useMembers, useRealtime, useRows, useTableMutations } from '../hooks/data';
import { supabase } from '../lib/supabase';
import { dueBadge } from '../lib/format';
import { friendly } from '../lib/errors';
import { TASK_CATEGORIES, type Task } from '../lib/types';
import { Badge, Empty, ErrorNote, Filters, FormDrawer, Loading, PageHeader, type FieldDef } from '../components/ui';

export default function Tasks() {
  const { wedding, levels } = useAccess();
  const canEdit = levels.tasks === 'edit';
  const tasks = useRows<Task>('tasks', wedding.id, 'due_date');
  const members = useMembers(wedding.id);
  const m = useTableMutations<Task>('tasks', wedding.id);
  useRealtime('tasks', wedding.id);
  const [cat, setCat] = useState('All');
  const [editing, setEditing] = useState<Partial<Task> | null>(null);
  const [error, setError] = useState('');

  const memberName = (id: string | null) => members.data?.find((x) => x.id === id)?.display_name;
  const list = useMemo(() => {
    const rows = (tasks.data ?? []).filter((t) => cat === 'All' || t.category === cat);
    return [...rows.filter((t) => t.status !== 'done'), ...rows.filter((t) => t.status === 'done')];
  }, [tasks.data, cat]);

  const toggle = async (t: Task) => {
    setError('');
    const { error } = await supabase.rpc('complete_task', { p_task: t.id, p_done: t.status !== 'done' });
    if (error) setError(friendly(error));
    m.refresh();
  };

  const fields: FieldDef[] = [
    { key: 'title', label: 'Task', required: true },
    { key: 'category', label: 'Category', type: 'select', options: TASK_CATEGORIES.map((c) => ({ value: c, label: c })) },
    { key: 'due_date', label: 'Due date', type: 'date' },
    { key: 'assignee_member_id', label: 'Assigned to', type: 'select',
      options: [{ value: '', label: 'Nobody yet' }, ...(members.data ?? []).map((x) => ({ value: x.id, label: x.display_name }))] },
    { key: 'notes', label: 'Notes', type: 'textarea' },
  ];

  const mine = levels.tasks === 'assigned';
  return (
    <>
      <PageHeader title={mine ? 'My tasks' : 'Task timeline'} sub={mine ? 'Tasks the couple assigned to you' : 'Milestones & to-dos'}
        action={canEdit && <button className="btn" onClick={() => setEditing({ category: 'Other' })}>+ Add task</button>} />
      {!mine && <Filters options={['All', ...TASK_CATEGORIES].map((c) => ({ value: c, label: c }))} value={cat} onChange={setCat} />}
      {error && <p className="err">{error}</p>}
      {tasks.isLoading ? <Loading /> : tasks.error ? <ErrorNote error={tasks.error} /> : list.length === 0 ? (
        <Empty action={canEdit && <button className="btn" onClick={() => setEditing({ category: 'Other' })}>Add your first task</button>}>
          {mine ? 'Nothing assigned to you yet.' : 'No tasks here yet.'}
        </Empty>
      ) : list.map((t) => {
        const done = t.status === 'done';
        const due = dueBadge(t.due_date, done);
        const who = memberName(t.assignee_member_id);
        return (
          <div key={t.id} className={`row${done ? ' done' : ''}`}>
            <button className={`chk${done ? ' on' : ''}`} aria-label={done ? `Mark "${t.title}" not done` : `Mark "${t.title}" done`}
              aria-pressed={done} onClick={() => toggle(t)}>{done ? '✓' : ''}</button>
            <div style={{ flex: 1, cursor: canEdit ? 'pointer' : 'default' }} onClick={() => canEdit && setEditing(t)}>
              <div className="nm">{t.title}</div>
              <div className="chips">
                <Badge>{t.category}</Badge>
                {who && <Badge tone="bs">{who}</Badge>}
                {due && <Badge tone={due.tone}>{due.text}</Badge>}
              </div>
              {t.notes && <div className="small muted" style={{ marginTop: 4 }}>{t.notes}</div>}
            </div>
          </div>
        );
      })}
      <FormDrawer open={!!editing} title={editing?.id ? 'Edit task' : 'Add task'} fields={fields}
        initial={(editing ?? {}) as Record<string, unknown>} onClose={() => setEditing(null)}
        onSubmit={async (v) => {
          const row = { title: v.title, category: v.category ?? 'Other', due_date: v.due_date, assignee_member_id: v.assignee_member_id || null, notes: v.notes } as Partial<Task>;
          if (editing?.id) await m.update.mutateAsync({ id: editing.id, ...row });
          else await m.insert.mutateAsync(row);
        }}
        onDelete={editing?.id ? () => m.remove.mutateAsync(editing.id!) : undefined} />
    </>
  );
}
