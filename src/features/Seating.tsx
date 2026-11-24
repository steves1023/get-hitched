import { useRef, useState } from 'react';
import { useAccess } from '../lib/access';
import { useRealtime, useRows, useTableMutations } from '../hooks/data';
import { supabase } from '../lib/supabase';
import { friendly } from '../lib/errors';
import type { Guest, SeatingTable } from '../lib/types';
import { Drawer, Empty, FormDrawer, Locked, PageHeader, type FieldDef } from '../components/ui';

// Positions are stored in viewBox units so they survive any screen size.
const W = 1000, H = 380;
const COLORS = {
  full: { fill: '#EAF0EA', stroke: '#7A9E7E', text: '#4D7050' },
  partial: { fill: '#F8F2E4', stroke: '#C9A84C', text: '#8B6F2E' },
  empty: { fill: '#FBEAE8', stroke: '#C8736A', text: '#8B4F48' },
};
const size = (t: SeatingTable) => (t.shape === 'round' ? { w: 92, h: 92 } : t.capacity > 8 ? { w: 260, h: 62 } : { w: 90, h: 90 });

export default function Seating() {
  const { wedding, levels, hasPass, isCouple } = useAccess();
  const canEdit = levels.seating === 'edit';
  const tables = useRows<SeatingTable>('seating_tables', wedding.id, 'created_at');
  const guests = useRows<Guest>('guests', wedding.id, 'name', true, levels.guests !== 'none');
  const tm = useTableMutations<SeatingTable>('seating_tables', wedding.id);
  const gm = useTableMutations<Guest>('guests', wedding.id);
  useRealtime('seating_tables', wedding.id);
  useRealtime('guests', wedding.id);

  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number; moved: boolean } | null>(null);
  const [local, setLocal] = useState<Record<string, { x: number; y: number }>>({});
  const [picked, setPicked] = useState<Guest | null>(null);
  const [openTable, setOpenTable] = useState<SeatingTable | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');

  if (!hasPass && isCouple && (tables.data ?? []).length === 0) return (
    <><PageHeader title="Seating chart" sub="Drag tables to arrange · tap a guest, then a table, to seat them" /><Locked feature="The seating chart" weddingId={wedding.id} /></>
  );

  const all = guests.data ?? [];
  const seated = (tid: string) => all.filter((g) => g.table_id === tid).reduce((n, g) => n + g.party_size, 0);
  const unassigned = all.filter((g) => !g.table_id && g.rsvp !== 'no');
  const pos = (t: SeatingTable) => local[t.id] ?? { x: Number(t.x), y: Number(t.y) };

  const toSvg = (e: React.PointerEvent) => {
    const svg = svgRef.current!; const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: p.x, y: p.y };
  };

  const seat = async (g: Guest, t: SeatingTable) => {
    setError('');
    if (seated(t.id) + g.party_size > t.capacity) return setError(`${t.label} doesn’t have room for ${g.name}${g.party_size > 1 ? ` (party of ${g.party_size})` : ''}.`);
    try { await gm.update.mutateAsync({ id: g.id, table_id: t.id }); setPicked(null); } catch (e) { setError(friendly(e)); }
  };

  const onDown = (e: React.PointerEvent, t: SeatingTable) => {
    if (!canEdit || picked) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    const p = toSvg(e); const c = pos(t);
    setDrag({ id: t.id, dx: p.x - c.x, dy: p.y - c.y, moved: false });
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const p = toSvg(e);
    const x = Math.max(50, Math.min(W - 50, p.x - drag.dx)), y = Math.max(80, Math.min(H - 35, p.y - drag.dy));
    setLocal((l) => ({ ...l, [drag.id]: { x, y } }));
    if (!drag.moved) setDrag({ ...drag, moved: true });
  };
  const onUp = async (t: SeatingTable) => {
    if (picked && levels.guests === 'edit') return seat(picked, t);
    if (!drag) return setOpenTable(t);
    const d = drag; setDrag(null);
    if (!d.moved) return setOpenTable(t);
    const p = local[t.id];
    try { await tm.update.mutateAsync({ id: t.id, x: Math.round(p.x), y: Math.round(p.y) }); }
    catch (e) { setError(friendly(e)); }
    finally { setLocal((l) => { const n = { ...l }; delete n[t.id]; return n; }); }
  };

  const reset = async () => {
    if (!confirm('Line all tables up in rows? Guests stay seated.')) return;
    const list = tables.data ?? []; const perRow = 4;
    await Promise.all(list.map((t, i) => supabase.from('seating_tables').update({
      x: 140 + (i % perRow) * 240, y: 140 + Math.floor(i / perRow) * 130 }).eq('id', t.id)));
    tm.refresh();
  };

  const addFields: FieldDef[] = [
    { key: 'label', label: 'Table name', required: true, placeholder: 'Table 5' },
    { key: 'shape', label: 'Shape', type: 'select', options: [{ value: 'round', label: 'Round' }, { value: 'rect', label: 'Rectangle / banquet' }] },
    { key: 'capacity', label: 'Seats', type: 'number', min: 1, required: true },
  ];

  const list = tables.data ?? [];
  return (
    <>
      <PageHeader title="Seating chart" sub="Drag tables to arrange · tap a guest, then a table, to seat them" action={canEdit && (
        <span style={{ display: 'flex', gap: 6 }}>
          {list.length > 0 && <button className="btn g" onClick={reset}>↺ Line up</button>}
          <button className="btn" onClick={() => setAdding(true)}>+ Add table</button>
        </span>
      )} />
      {error && <p className="err">{error}</p>}
      {list.length === 0 ? (
        <Empty action={canEdit && <button className="btn" onClick={() => setAdding(true)}>Add your first table</button>}>No tables yet.</Empty>
      ) : (
        <div className="floor">
          <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Seating floor plan" onPointerMove={onMove}>
            <rect x="380" y="14" width="240" height="38" rx="8" fill="#FBF0EE" stroke="#9E5E54" strokeWidth="2" />
            <text x="500" y="38" textAnchor="middle" fontFamily="Playfair Display,serif" fontSize="14" fill="#9E5E54" fontWeight="700">Sweetheart Table</text>
            {list.map((t) => {
              const { x, y } = pos(t); const { w, h } = size(t); const n = seated(t.id);
              const c = n >= t.capacity ? COLORS.full : n > 0 ? COLORS.partial : COLORS.empty;
              return (
                <g key={t.id} className={`tbl${picked ? ' picking' : ''}`} tabIndex={0} role="button" aria-label={`${t.label}, ${n} of ${t.capacity} seats`}
                  onPointerDown={(e) => onDown(e, t)} onPointerUp={() => onUp(t)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { if (picked) seat(picked, t); else setOpenTable(t); } }}>
                  {t.shape === 'round'
                    ? <circle cx={x} cy={y} r={w / 2} fill={c.fill} stroke={c.stroke} strokeWidth="3" />
                    : <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx="8" fill={c.fill} stroke={c.stroke} strokeWidth="3" />}
                  <text x={x} y={y} textAnchor="middle" fontFamily="Playfair Display,serif" fontSize="14" fontWeight="700" fill={c.text} pointerEvents="none">{t.label}</text>
                  <text x={x} y={y + 18} textAnchor="middle" fontFamily="Inter" fontSize="11" fill={c.stroke} pointerEvents="none">{n}/{t.capacity}</text>
                </g>
              );
            })}
          </svg>
        </div>
      )}
      {levels.guests !== 'none' && (
        <div className="card" style={{ marginTop: 14 }}>
          <h2 className="ct">Unassigned guests <span className="badge bb">{unassigned.length}</span></h2>
          {picked && <p className="small" style={{ marginBottom: 8 }}>Now tap a table to seat <b>{picked.name}</b>. <button className="btn g sm" onClick={() => setPicked(null)}>Cancel</button></p>}
          {unassigned.length === 0 ? <p className="muted small">Everyone attending has a seat.</p> : unassigned.map((g) => (
            <button key={g.id} type="button" className={`chip${picked?.id === g.id ? ' sel' : ''}`} disabled={levels.guests !== 'edit'}
              onClick={() => setPicked(picked?.id === g.id ? null : g)}>{g.name}{g.party_size > 1 ? ` +${g.party_size - 1}` : ''}</button>
          ))}
        </div>
      )}

      <Drawer open={!!openTable} title={openTable?.label ?? ''} onClose={() => setOpenTable(null)} footer={canEdit && openTable && (
        <>
          <button className="btn danger" onClick={async () => { if (confirm('Delete this table? Its guests become unassigned.')) { await tm.remove.mutateAsync(openTable.id); gm.refresh(); setOpenTable(null); } }}>Delete table</button>
          <span />
        </>
      )}>
        {openTable && (
          <>
            <p className="muted small" style={{ marginBottom: 10 }}>{seated(openTable.id)} of {openTable.capacity} seats filled</p>
            {all.filter((g) => g.table_id === openTable.id).map((g) => (
              <div className="row" key={g.id} style={{ alignItems: 'center' }}>
                <div style={{ flex: 1 }} className="nm">{g.name}{g.party_size > 1 ? ` (party of ${g.party_size})` : ''}</div>
                {levels.guests === 'edit' && <button className="btn g sm" onClick={() => gm.update.mutate({ id: g.id, table_id: null })}>Unseat</button>}
              </div>
            ))}
            {levels.guests === 'edit' && unassigned.length > 0 && (
              <label className="field" style={{ marginTop: 12 }}><span>Seat a guest here</span>
                <select value="" onChange={(e) => { const g = all.find((x) => x.id === e.target.value); if (g) seat(g, openTable); }}>
                  <option value="">Choose a guest…</option>
                  {unassigned.map((g) => <option key={g.id} value={g.id}>{g.name}{g.party_size > 1 ? ` (${g.party_size})` : ''}</option>)}
                </select>
              </label>
            )}
            {error && <p className="err">{error}</p>}
          </>
        )}
      </Drawer>

      <FormDrawer open={adding} title="Add table" fields={addFields} initial={{ shape: 'round', capacity: 8, label: `Table ${list.length + 1}` }}
        onClose={() => setAdding(false)}
        onSubmit={async (v) => {
          const i = list.length;
          await tm.insert.mutateAsync({ label: v.label as string, shape: v.shape as SeatingTable['shape'], capacity: (v.capacity as number) ?? 8,
            x: 140 + (i % 4) * 240, y: 140 + (Math.floor(i / 4) % 2) * 130 });
        }} />
    </>
  );
}
