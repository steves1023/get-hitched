import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAccess } from '../lib/access';
import { useMembers, useRealtime, useRows, useTableMutations } from '../hooks/data';
import { supabase } from '../lib/supabase';
import { friendly } from '../lib/errors';
import { pct, time12 } from '../lib/format';
import { PHASES, type DayItem, type DayItemAssignee } from '../lib/types';
import { Badge, Bar, Empty, ErrorNote, Filters, FormDrawer, Loading, Locked, PageHeader, type FieldDef } from '../components/ui';

const AUDIENCE = { everyone: 'Everyone', wedding_party: 'Wedding party', couple_only: 'Couple only' } as const;

export default function WeddingDay() {
  const { wedding, levels, hasPass, isCouple, me } = useAccess();
  const qc = useQueryClient();
  const canEdit = levels.day === 'edit';
  const items = useRows<DayItem>('day_items', wedding.id, 'start_time');
  const assignees = useRows<DayItemAssignee>('day_item_assignees', wedding.id, 'day_item_id');
  const members = useMembers(wedding.id);
  const m = useTableMutations<DayItem>('day_items', wedding.id);
  useRealtime('day_items', wedding.id);
  const [phase, setPhase] = useState<'all' | DayItem['phase']>('all');
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState('');

  const all = items.data ?? [];
  const list = useMemo(() => all.filter((i) => phase === 'all' || i.phase === phase), [all, phase]);
  const assigned = (id: string) => (assignees.data ?? []).filter((a) => a.day_item_id === id).map((a) => a.member_id);
  const mine = (id: string) => assigned(id).includes(me.id);
  const names = (id: string) => assigned(id).map((mid) => members.data?.find((x) => x.id === mid)?.display_name).filter(Boolean).join(', ');
  const doneCount = all.filter((i) => i.done).length;

  if (!hasPass && isCouple && all.length === 0) return (
    <><PageHeader title="Wedding day" sub="Hour-by-hour timeline for the big day" /><Locked feature="The wedding day timeline" weddingId={wedding.id} /></>
  );

  const toggle = async (i: DayItem) => {
    setError('');
    const { error } = await supabase.rpc('set_day_item_done', { p_item: i.id, p_done: !i.done });
    if (error) setError(friendly(error));
    m.refresh();
  };

  const fields: FieldDef[] = [
    { key: 'start_time', label: 'Start time', type: 'time', required: true },
    { key: 'title', label: 'What happens', required: true },
    { key: 'who', label: 'Who', placeholder: 'Hair stylist, both partners…' },
    { key: 'location', label: 'Where' },
    { key: 'duration_min', label: 'Minutes', type: 'number', min: 1 },
    { key: 'phase', label: 'Part of the day', type: 'select', options: Object.entries(PHASES).map(([value, label]) => ({ value, label })) },
    { key: 'audience', label: 'Who can see it', type: 'select', options: Object.entries(AUDIENCE).map(([value, label]) => ({ value, label })) },
  ];

  return (
    <>
      <PageHeader title={levels.day === 'assigned' ? 'Day of' : 'Wedding day'} sub="Hour-by-hour timeline for the big day"
        action={canEdit && <button className="btn" onClick={() => setEditing({ phase: 'ceremony', audience: 'everyone', assignees: [] })}>+ Add item</button>} />
      {all.length > 0 && (
        <div className="card" style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.85rem' }}>
            <b>Day progress</b><span style={{ color: 'var(--warm)' }}>{doneCount} of {all.length} items complete</span>
          </div>
          <Bar pct={pct(doneCount, all.length)} />
        </div>
      )}
      <Filters value={phase} onChange={setPhase} options={[{ value: 'all', label: 'All' }, ...Object.entries(PHASES).map(([value, label]) => ({ value: value as DayItem['phase'], label }))]} />
      {error && <p className="err">{error}</p>}
      {items.isLoading ? <Loading /> : items.error ? <ErrorNote error={items.error} /> : list.length === 0 ? (
        <Empty action={canEdit && <button className="btn" onClick={() => setEditing({ phase: 'ceremony', audience: 'everyone', assignees: [] })}>Add the first item</button>}>
          {canEdit ? 'Build the day hour by hour, then choose who sees each item.' : 'Nothing on the timeline for you yet.'}
        </Empty>
      ) : (
        <div className="card">
          {list.map((i) => {
            const canTick = canEdit || mine(i.id);
            return (
              <div className={`tl${i.done ? ' done' : ''}`} key={i.id}>
                <span className="tm">{time12(i.start_time)}</span>
                <div style={{ flex: 1, cursor: canEdit ? 'pointer' : 'default' }}
                  onClick={() => canEdit && setEditing({ ...i, start_time: i.start_time.slice(0, 5), assignees: assigned(i.id) })}>
                  <b>{i.title}</b>
                  <div className="small" style={{ color: 'var(--warm)' }}>
                    {[i.who && `Who: ${i.who}`, i.location && `Where: ${i.location}`, i.duration_min && `${i.duration_min} min`].filter(Boolean).join(' · ')}
                  </div>
                  <div className="chips">
                    {canEdit && i.audience !== 'everyone' && <Badge tone="bw">{AUDIENCE[i.audience]}</Badge>}
                    {names(i.id) && <Badge tone="bs">{names(i.id)}</Badge>}
                  </div>
                </div>
                {canTick && <button className={`chk${i.done ? ' on' : ''}`} aria-label={i.done ? 'Mark not done' : 'Mark done'} onClick={() => toggle(i)}>{i.done ? '✓' : ''}</button>}
              </div>
            );
          })}
        </div>
      )}
      <FormDrawer open={!!editing} title={editing?.id ? 'Edit item' : 'Add item'} fields={fields} initial={editing ?? {}} onClose={() => setEditing(null)}
        extra={(v, set) => (
          <div className="field"><span>Also show it to specific people</span>
            <div className="checks">
              {(members.data ?? []).filter((x) => x.role !== 'owner' && x.role !== 'partner').map((x) => {
                const sel = (v.assignees as string[] | undefined) ?? [];
                return (
                  <label key={x.id}><input type="checkbox" checked={sel.includes(x.id)}
                    onChange={(e) => set('assignees', e.target.checked ? [...sel, x.id] : sel.filter((s) => s !== x.id))} />{x.display_name}</label>
                );
              })}
              {(members.data ?? []).every((x) => x.role === 'owner' || x.role === 'partner') && <span className="small muted">Invite people with Share to assign items to them.</span>}
            </div>
          </div>
        )}
        onSubmit={async (v) => {
          const row = { start_time: v.start_time, title: v.title, who: v.who, location: v.location, duration_min: v.duration_min, phase: v.phase, audience: v.audience } as Partial<DayItem>;
          const saved = editing?.id ? await m.update.mutateAsync({ id: editing.id as string, ...row }) : await m.insert.mutateAsync(row);
          const want = (v.assignees as string[] | undefined) ?? [];
          const { error: delErr } = await supabase.from('day_item_assignees').delete().eq('day_item_id', saved.id);
          if (delErr) throw delErr;
          if (want.length) {
            const { error } = await supabase.from('day_item_assignees').insert(want.map((member_id) => ({ day_item_id: saved.id, member_id, wedding_id: wedding.id })));
            if (error) throw error;
          }
          qc.invalidateQueries({ queryKey: ['day_item_assignees', wedding.id] });
        }}
        onDelete={editing?.id ? () => m.remove.mutateAsync(editing.id as string) : undefined} />
    </>
  );
}
