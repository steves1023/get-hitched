import { useState } from 'react';
import { useAccess } from '../lib/access';
import { useRows, useTableMutations } from '../hooks/data';
import { supabase } from '../lib/supabase';
import { money } from '../lib/format';
import { TASK_CATEGORIES, VENDOR_STATUS, type Vendor, type VendorPayment, FileRow } from '../lib/types';
import { Badge, Empty, ErrorNote, FormDrawer, Loading, PageHeader, type FieldDef } from '../components/ui';
import VendorFiles from './files/VendorFiles';

export default function Vendors() {
  const { wedding, levels } = useAccess();
  const canEdit = levels.vendors === 'edit';
  const seeMoney = levels.budget === 'read' || levels.budget === 'edit';
  const editMoney = levels.budget === 'edit';
  const vendors = useRows<Vendor>('vendors', wedding.id, 'name');
  const payments = useRows<VendorPayment>('vendor_payments', wedding.id, 'created_at', true, seeMoney);
  // Attachments need the Files tab: visible with read access, editable with edit access.
  const seeFiles = levels.files === 'read' || levels.files === 'edit';
  const files = useRows<FileRow>('files', wedding.id, 'created_at', false, seeFiles);
  const fileCount = (id: string) => (files.data ?? []).filter((f) => f.vendor_id === id).length;
  const m = useTableMutations<Vendor>('vendors', wedding.id);
  const pm = useTableMutations<VendorPayment>('vendor_payments', wedding.id);
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);

  const payFor = (id: string) => payments.data?.find((p) => p.vendor_id === id);

  const fields: FieldDef[] = [
    { key: 'name', label: 'Vendor name', required: true },
    { key: 'category', label: 'Category', type: 'select', options: TASK_CATEGORIES.map((c) => ({ value: c, label: c })) },
    { key: 'status', label: 'Status', type: 'select', options: Object.entries(VENDOR_STATUS).map(([value, s]) => ({ value, label: s.label })) },
    { key: 'contact_name', label: 'Contact person' },
    { key: 'phone', label: 'Phone', type: 'tel' },
    { key: 'email', label: 'Email', type: 'email' },
    { key: 'url', label: 'Website', type: 'url', placeholder: 'https://' },
    { key: 'notes', label: 'Notes', type: 'textarea' },
    ...(editMoney ? [
      { key: 'total', label: 'Contract total (USD)', type: 'number', min: 0 } as FieldDef,
      { key: 'paid', label: 'Paid so far (USD)', type: 'number', min: 0 } as FieldDef,
      { key: 'pay_due', label: 'Next payment due', type: 'date' } as FieldDef,
    ] : []),
  ];

  const open = (v?: Vendor) => {
    if (!v) return setEditing({ category: 'Other', status: 'researching' });
    const p = payFor(v.id);
    setEditing({ ...v, total: p?.total ?? '', paid: p?.paid ?? '', pay_due: p?.due_date ?? '' });
  };

  return (
    <>
      <PageHeader title="Vendors" sub="Contacts, contracts & status"
        action={canEdit && <button className="btn" onClick={() => open()}>+ Add vendor</button>} />
      {vendors.isLoading ? <Loading /> : vendors.error ? <ErrorNote error={vendors.error} /> : (vendors.data ?? []).length === 0 ? (
        <Empty action={canEdit && <button className="btn" onClick={() => open()}>Add a vendor</button>}>Keep every vendor’s contact and contract details in one place.</Empty>
      ) : (
        <div className="g2">
          {(vendors.data ?? []).map((v) => {
            const s = VENDOR_STATUS[v.status]; const p = payFor(v.id);
            return (
              <button type="button" className="vc" key={v.id} onClick={() => canEdit && open(v)} disabled={!canEdit} style={{ font: 'inherit', color: 'inherit' }}>
                <Badge tone={s.tone}>{s.label}</Badge> <Badge tone="bw">{v.category}</Badge>
                <div className="vn">{v.name}</div>
                {(v.contact_name || v.phone || v.email) && (
                  <div className="vd">{[v.contact_name && `👤 ${v.contact_name}`, v.phone && `📞 ${v.phone}`, v.email && `✉ ${v.email}`].filter(Boolean).join(' · ')}</div>
                )}
                {v.url && <div className="vd">🔗 {v.url.replace(/^https?:\/\//, '')}</div>}
                {seeMoney && p && <div className="vd">💰 {money(p.total)} total · {money(p.paid)} paid</div>}
                {v.notes && <div className="vd" style={{ color: 'var(--muted)' }}>{v.notes}</div>}
                {seeFiles && fileCount(v.id) > 0 && <div className="vd">📎 {fileCount(v.id)} file{fileCount(v.id) === 1 ? '' : 's'}</div>}
              </button>
            );
          })}
        </div>
      )}
      <FormDrawer open={!!editing} title={editing?.id ? 'Edit vendor' : 'Add vendor'} fields={fields} initial={editing ?? {}}
        onClose={() => setEditing(null)}
        extra={() => seeFiles && <VendorFiles weddingId={wedding.id} vendorId={(editing?.id as string) ?? null} files={files.data ?? []} canEdit={levels.files === 'edit'} />}
        onSubmit={async (v) => {
          const row = { name: v.name, category: v.category, status: v.status, contact_name: v.contact_name, phone: v.phone, email: v.email, url: v.url, notes: v.notes } as Partial<Vendor>;
          const saved = editing?.id ? await m.update.mutateAsync({ id: editing.id as string, ...row }) : await m.insert.mutateAsync(row);
          if (editMoney && (v.total != null || v.paid != null || v.pay_due)) {
            const { error } = await supabase.from('vendor_payments').upsert(
              { wedding_id: wedding.id, vendor_id: saved.id, total: v.total ?? 0, paid: v.paid ?? 0, due_date: v.pay_due || null },
              { onConflict: 'vendor_id' });
            if (error) throw error;
            pm.refresh();
          }
        }}
        onDelete={editing?.id ? () => m.remove.mutateAsync(editing.id as string) : undefined} />
    </>
  );
}
