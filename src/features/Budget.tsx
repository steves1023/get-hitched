import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAccess } from '../lib/access';
import { useRows, useSummary, useTableMutations } from '../hooks/data';
import { supabase } from '../lib/supabase';
import { money, pct } from '../lib/format';
import { TASK_CATEGORIES, type Expense, type Vendor } from '../lib/types';
import { Badge, Bar, Empty, ErrorNote, FormDrawer, Loading, PageHeader, Stat, type FieldDef } from '../components/ui';

const STATUS = { planned: { label: 'Planned', tone: 'bw' }, invoiced: { label: 'Invoiced', tone: 'bg' }, paid: { label: 'Paid', tone: 'bs' } } as const;

export default function Budget() {
  const { wedding, levels, isCouple } = useAccess();
  const qc = useQueryClient();
  const canEdit = levels.budget === 'edit';
  const summary = useSummary(wedding.id);
  const expenses = useRows<Expense>('expenses', wedding.id, 'created_at', false);
  const vendors = useRows<Vendor>('vendors', wedding.id, 'name', true, levels.vendors !== 'none');
  const m = useTableMutations<Expense>('expenses', wedding.id);
  const [editing, setEditing] = useState<Partial<Expense> | null>(null);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const s = summary.data;
  const vendorName = (id: string | null) => vendors.data?.find((v) => v.id === id)?.name;

  const fields: FieldDef[] = [
    { key: 'label', label: 'What it’s for', required: true },
    { key: 'category', label: 'Category', type: 'select', options: TASK_CATEGORIES.map((c) => ({ value: c, label: c })) },
    { key: 'amount', label: 'Amount (USD)', type: 'number', required: true, min: 0, step: 0.01 },
    { key: 'status', label: 'Status', type: 'select', options: Object.entries(STATUS).map(([value, x]) => ({ value, label: x.label })) },
    ...(vendors.data?.length ? [{ key: 'vendor_id', label: 'Vendor', type: 'select',
      options: [{ value: '', label: 'None' }, ...vendors.data.map((v) => ({ value: v.id, label: v.name }))] } as FieldDef] : []),
  ];

  return (
    <>
      <PageHeader title="Budget" sub="Track every dollar" action={canEdit && (
        <span style={{ display: 'flex', gap: 6 }}>
          {isCouple && <button className="btn g" onClick={() => setBudgetOpen(true)}>Set total</button>}
          <button className="btn" onClick={() => setEditing({ category: 'Other', status: 'planned' })}>+ Add expense</button>
        </span>
      )} />
      {s && (
        <>
          <div className="g3" style={{ marginBottom: 14 }}>
            <Stat value={money(s.total_budget)} label="Total budget" />
            <Stat value={money(s.spent)} label="Spent" />
            <Stat value={money(s.total_budget - s.spent)} label="Remaining" color={s.spent > s.total_budget ? 'var(--danger)' : 'var(--sage-d)'} />
          </div>
          <Bar pct={pct(s.spent, s.total_budget)} />
          <p className="small muted" style={{ marginBottom: 14 }}>Spent counts invoiced and paid expenses.</p>
        </>
      )}
      <div className="card">
        <h2 className="ct">All expenses</h2>
        {expenses.isLoading ? <Loading /> : expenses.error ? <ErrorNote error={expenses.error} /> : (expenses.data ?? []).length === 0 ? (
          <Empty>Add deposits, invoices and planned costs to see where the money goes.</Empty>
        ) : (expenses.data ?? []).map((e) => (
          <div className="exp" key={e.id} onClick={() => canEdit && setEditing(e)} role={canEdit ? 'button' : undefined} tabIndex={canEdit ? 0 : undefined}
            onKeyDown={(k) => k.key === 'Enter' && canEdit && setEditing(e)}>
            <div><b>{e.label}</b><div className="small muted">{[e.category, vendorName(e.vendor_id)].filter(Boolean).join(' · ')}</div></div>
            <div style={{ whiteSpace: 'nowrap' }}><Badge tone={STATUS[e.status].tone}>{STATUS[e.status].label}</Badge> <b>{money(e.amount)}</b></div>
          </div>
        ))}
      </div>
      <FormDrawer open={!!editing} title={editing?.id ? 'Edit expense' : 'Add expense'} fields={fields}
        initial={(editing ?? {}) as Record<string, unknown>} onClose={() => setEditing(null)}
        onSubmit={async (v) => {
          const row = { label: v.label, category: v.category, amount: v.amount, status: v.status, vendor_id: v.vendor_id || null } as Partial<Expense>;
          if (editing?.id) await m.update.mutateAsync({ id: editing.id, ...row }); else await m.insert.mutateAsync(row);
        }}
        onDelete={editing?.id ? () => m.remove.mutateAsync(editing.id!) : undefined} />
      <FormDrawer open={budgetOpen} title="Total budget" fields={[{ key: 'total_budget', label: 'Total budget (USD)', type: 'number', min: 0, required: true }]}
        initial={{ total_budget: wedding.total_budget }} onClose={() => setBudgetOpen(false)}
        onSubmit={async (v) => {
          const { error } = await supabase.from('weddings').update({ total_budget: v.total_budget ?? 0 }).eq('id', wedding.id);
          if (error) throw error;
          qc.invalidateQueries({ queryKey: ['summary', wedding.id] });
          qc.invalidateQueries({ queryKey: ['access'] });
        }} />
    </>
  );
}
