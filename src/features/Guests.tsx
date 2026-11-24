import { useMemo, useRef, useState } from 'react';
import Papa from 'papaparse';
import { useAccess } from '../lib/access';
import { useRealtime, useRows, useTableMutations } from '../hooks/data';
import { supabase } from '../lib/supabase';
import { friendly } from '../lib/errors';
import { initials } from '../lib/format';
import type { Guest, SeatingTable } from '../lib/types';
import { Badge, Empty, ErrorNote, Filters, FormDrawer, Loading, PageHeader, Stat, type FieldDef } from '../components/ui';

type Filter = 'all' | 'yes' | 'no' | 'pending';
const RSVP = { yes: { label: 'Yes ✓', tone: 'bs' }, no: { label: 'No', tone: 'br' }, pending: { label: 'Pending', tone: 'bw' } } as const;

export default function Guests() {
  const { wedding, levels } = useAccess();
  const canEdit = levels.guests === 'edit';
  const guests = useRows<Guest>('guests', wedding.id, 'name');
  const tables = useRows<SeatingTable>('seating_tables', wedding.id, 'label', true, levels.seating !== 'none');
  const m = useTableMutations<Guest>('guests', wedding.id);
  useRealtime('guests', wedding.id);
  const [filter, setFilter] = useState<Filter>('all');
  const [editing, setEditing] = useState<Partial<Guest> | null>(null);
  const [importMsg, setImportMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const sideLabel = (s: Guest['side']) => (s === 'partner1' ? `${wedding.partner1} side` : s === 'partner2' ? `${wedding.partner2} side` : 'Both');
  const tableLabel = (id: string | null) => tables.data?.find((t) => t.id === id)?.label;
  const all = guests.data ?? [];
  const list = useMemo(() => all.filter((g) => filter === 'all' || g.rsvp === filter), [all, filter]);
  const count = (f: (g: Guest) => boolean) => all.filter(f).reduce((n, g) => n + g.party_size, 0);

  const fields: FieldDef[] = [
    { key: 'name', label: 'Name', required: true },
    { key: 'side', label: 'Side', type: 'select', options: [
      { value: 'partner1', label: `${wedding.partner1}’s side` }, { value: 'partner2', label: `${wedding.partner2}’s side` }, { value: 'both', label: 'Both' }] },
    { key: 'rsvp', label: 'RSVP', type: 'select', options: [{ value: 'pending', label: 'Pending' }, { value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] },
    { key: 'party_size', label: 'Party size', type: 'number', min: 1 },
    { key: 'dietary', label: 'Dietary needs' },
    { key: 'email', label: 'Email', type: 'email' },
  ];

  const importCsv = (file: File) => {
    setImportMsg('Importing…');
    Papa.parse<Record<string, string>>(file, {
      header: true, skipEmptyLines: true, transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, '_'),
      complete: async (res) => {
        const sideOf = (s = '') => {
          const v = s.trim().toLowerCase();
          if (v === wedding.partner1.toLowerCase() || v === 'partner1' || v === '1') return 'partner1';
          if (v === wedding.partner2.toLowerCase() || v === 'partner2' || v === '2') return 'partner2';
          return 'both';
        };
        const rows = res.data.filter((r) => r.name?.trim()).map((r) => ({
          wedding_id: wedding.id, name: r.name.trim(), side: sideOf(r.side),
          rsvp: (['yes', 'no'].includes(r.rsvp?.trim().toLowerCase()) ? r.rsvp.trim().toLowerCase() : 'pending'),
          party_size: Math.max(1, Math.min(20, parseInt(r.party_size || '1', 10) || 1)),
          dietary: r.dietary?.trim() || null, email: r.email?.trim() || null,
        }));
        if (!rows.length) return setImportMsg('No rows found. The CSV needs a "name" column.');
        // Insert in chunks so one bad row doesn't hide how far it got.
        let added = 0;
        for (let i = 0; i < rows.length; i += 100) {
          const { error } = await supabase.from('guests').insert(rows.slice(i, i + 100));
          if (error) { m.refresh(); return setImportMsg(`Added ${added} of ${rows.length}. ${friendly(error)}`); }
          added += Math.min(100, rows.length - i);
        }
        m.refresh();
        setImportMsg(`Added ${added} guests.`);
      },
      error: (err) => setImportMsg(err.message),
    });
  };

  return (
    <>
      <PageHeader title="Guest list" sub="RSVPs & details" action={canEdit && (
        <span style={{ display: 'flex', gap: 6 }}>
          <button className="btn g" onClick={() => fileRef.current?.click()}>Import CSV</button>
          <button className="btn" onClick={() => setEditing({ side: 'both', rsvp: 'pending', party_size: 1 })}>+ Add guest</button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importCsv(f); e.target.value = ''; }} />
        </span>
      )} />
      {importMsg && <p className="small" style={{ marginBottom: 10 }}>{importMsg}</p>}
      <div className="g3" style={{ marginBottom: 14 }}>
        <Stat value={count(() => true)} label="Total guests" />
        <Stat value={count((g) => g.rsvp === 'yes')} label="Confirmed" />
        <Stat value={count((g) => g.rsvp === 'pending')} label="Awaiting RSVP" />
      </div>
      <Filters<Filter> value={filter} onChange={setFilter} options={[
        { value: 'all', label: 'All' }, { value: 'yes', label: 'RSVP yes' }, { value: 'no', label: 'RSVP no' }, { value: 'pending', label: 'RSVP pending' }]} />
      {guests.isLoading ? <Loading /> : guests.error ? <ErrorNote error={guests.error} /> : list.length === 0 ? (
        <Empty>{all.length ? 'No guests match this filter.' : 'Add guests one at a time, or import a CSV with columns name, side, rsvp, party_size, dietary, email.'}</Empty>
      ) : list.map((g) => (
        <div className={`row${canEdit ? ' click' : ''}`} key={g.id} style={{ alignItems: 'center' }} onClick={() => canEdit && setEditing(g)}>
          <div className="av" aria-hidden>{initials(g.name)}</div>
          <div style={{ flex: 1 }}>
            <div className="nm">{g.name}</div>
            <div className="chips">
              <Badge>{sideLabel(g.side)}</Badge>
              <Badge tone={RSVP[g.rsvp].tone}>{RSVP[g.rsvp].label}</Badge>
              {g.party_size > 1 && <Badge tone="bg">Party of {g.party_size}</Badge>}
              {tableLabel(g.table_id) && <Badge tone="bs">🪑 {tableLabel(g.table_id)}</Badge>}
              {g.dietary && <span className="small muted">{g.dietary}</span>}
            </div>
          </div>
        </div>
      ))}
      <FormDrawer open={!!editing} title={editing?.id ? 'Edit guest' : 'Add guest'} fields={fields}
        initial={(editing ?? {}) as Record<string, unknown>} onClose={() => setEditing(null)}
        onSubmit={async (v) => {
          const row = { name: v.name, side: v.side, rsvp: v.rsvp, party_size: v.party_size ?? 1, dietary: v.dietary, email: v.email } as Partial<Guest>;
          if (editing?.id) await m.update.mutateAsync({ id: editing.id, ...row }); else await m.insert.mutateAsync(row);
        }}
        onDelete={editing?.id ? () => m.remove.mutateAsync(editing.id!) : undefined} />
    </>
  );
}
