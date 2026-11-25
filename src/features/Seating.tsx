import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAccess } from '../lib/access';
import { useRealtime, useRows, useTableMutations } from '../hooks/data';
import { supabase } from '../lib/supabase';
import { friendly, functionError } from '../lib/errors';
import type { Guest, RoomItem, RoomWall, SeatingLayout, SeatingTable } from '../lib/types';
import { Drawer, Empty, Locked, PageHeader } from '../components/ui';
import {
  CHAIR_R, ITEM_KINDS, TABLE_KINDS, WALL_KINDS, canSit, feetInches, footprint, initials, occupancy, roomFromArea, seatOffsets, snapWallPoint,
  type ItemKind, type Pt, type Seat, type SeatGuest, type TableKind, type WallKind,
} from './seating/geometry';

const PAD = 3;                     // feet of margin around the room for dimension labels
const SIDE_FILL = { partner1: '#F5D5CF', partner2: '#CFE0CE', both: '#F1E2BD' } as const;
const SIDE_TEXT = { partner1: '#7B3A30', partner2: '#2F4F33', both: '#5E4618' } as const;
const FULLNESS = { full: '#7A9E7E', partial: '#C9A84C', empty: '#C8736A' } as const;

type Drag = { kind: 'table' | 'item'; id: string; dx: number; dy: number; moved: boolean };
type Pick = { tableId: string; seat: number; px: number; py: number };

export default function Seating() {
  const { wedding, levels, hasPass, isCouple } = useAccess();
  const qc = useQueryClient();
  const canEdit = levels.seating === 'edit';
  const canSeat = canEdit && levels.guests === 'edit';

  const tables = useRows<SeatingTable>('seating_tables', wedding.id, 'created_at');
  const items = useRows<RoomItem>('room_items', wedding.id, 'created_at');
  const walls = useRows<RoomWall>('room_walls', wedding.id, 'created_at');
  const guests = useRows<Guest>('guests', wedding.id, 'name', true, levels.guests !== 'none');
  const layoutQ = useQuery({
    queryKey: ['seating_layouts', wedding.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('seating_layouts').select('*').eq('wedding_id', wedding.id).maybeSingle();
      if (error) throw error;
      return data as SeatingLayout | null;
    },
  });
  const tm = useTableMutations<SeatingTable>('seating_tables', wedding.id);
  const im = useTableMutations<RoomItem>('room_items', wedding.id);
  const wm = useTableMutations<RoomWall>('room_walls', wedding.id);
  const gm = useTableMutations<Guest>('guests', wedding.id);
  useRealtime('seating_tables', wedding.id);
  useRealtime('room_items', wedding.id);
  useRealtime('room_walls', wedding.id);
  useRealtime('guests', wedding.id);
  useRealtime('seating_layouts', wedding.id);

  const svgRef = useRef<SVGSVGElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [local, setLocal] = useState<Record<string, { x: number; y: number }>>({});
  const [pick, setPick] = useState<Pick | null>(null);
  const [search, setSearch] = useState('');
  const [held, setHeld] = useState<Guest | null>(null);           // guest chip tapped, waiting for a chair
  const [openTable, setOpenTable] = useState<SeatingTable | null>(null);
  const [openItem, setOpenItem] = useState<RoomItem | null>(null);
  const [panel, setPanel] = useState<'room' | 'table' | 'feature' | null>(null);
  const [zoom, setZoom] = useState(1);
  const [draw, setDraw] = useState<{ kind: WallKind; start: Pt | null } | null>(null);
  const [cursor, setCursor] = useState<Pt | null>(null);
  const [openWall, setOpenWall] = useState<RoomWall | null>(null);

  useEffect(() => {
    if (!draw) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { if (draw.start) setDraw({ ...draw, start: null }); else setDraw(null); setCursor(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [draw]);
  const [error, setError] = useState('');

  const W = Number(layoutQ.data?.width_ft ?? 60);
  const L = Number(layoutQ.data?.length_ft ?? 40);
  const all = guests.data ?? [];
  const list = tables.data ?? [];
  const wallList = walls.data ?? [];
  const wallEnds: Pt[] = wallList.flatMap((w) => [{ x: Number(w.x1), y: Number(w.y1) }, { x: Number(w.x2), y: Number(w.y2) }]);

  const seatsByTable = useMemo(() => {
    const m: Record<string, Seat[]> = {};
    for (const t of list) {
      const at: SeatGuest[] = all.filter((g) => g.table_id === t.id)
        .map((g) => ({ id: g.id, name: g.name, party_size: g.party_size, seat_index: g.seat_index, side: g.side }));
      m[t.id] = occupancy(t.capacity, at);
    }
    return m;
  }, [list, all]);
  // The couple comes first so the sweetheart table is quick to fill.
  const unassigned = all.filter((g) => !g.table_id && g.rsvp !== 'no').sort((a, b) => Number(!!b.couple_role) - Number(!!a.couple_role));
  const filled = (t: SeatingTable) => (seatsByTable[t.id] ?? []).filter(Boolean).length;

  if (!hasPass && isCouple && list.length === 0) return (
    <><PageHeader title="Seating chart" sub="Your room, to scale" /><Locked feature="The seating chart" weddingId={wedding.id} /></>
  );

  // ---------- coordinates ----------
  const toFeet = (e: React.PointerEvent | React.MouseEvent) => {
    const svg = svgRef.current!; const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: p.x, y: p.y };
  };
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const posOf = (id: string, x: number, y: number) => local[id] ?? { x: Number(x), y: Number(y) };

  // ---------- dragging tables and features ----------
  const startDrag = (e: React.PointerEvent, kind: Drag['kind'], id: string, x: number, y: number) => {
    if (!canEdit || held) return;
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const p = toFeet(e);
    setDrag({ kind, id, dx: p.x - x, dy: p.y - y, moved: false });
    setPick(null);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const p = toFeet(e);
    const x = clamp(p.x - drag.dx, 0, W), y = clamp(p.y - drag.dy, 0, L);
    setLocal((l) => ({ ...l, [drag.id]: { x, y } }));
    if (!drag.moved) setDrag({ ...drag, moved: true });
  };
  const endDrag = async (open: () => void) => {
    const d = drag; setDrag(null);
    if (!d) return;
    if (!d.moved) return open();
    const p = local[d.id];
    try {
      const patch = { id: d.id, x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 };
      if (d.kind === 'table') await tm.update.mutateAsync(patch); else await im.update.mutateAsync(patch);
    } catch (err) { setError(friendly(err)); }
    finally { setLocal((l) => { const n = { ...l }; delete n[d.id]; return n; }); }
  };

  // ---------- drawing walls ----------
  const drawMove = (e: React.PointerEvent) => {
    if (!draw) return;
    setCursor(snapWallPoint(toFeet(e), draw.start, wallEnds, W, L));
  };
  const drawClick = async (e: React.PointerEvent) => {
    if (!draw) return;
    e.stopPropagation();
    const p = snapWallPoint(toFeet(e), draw.start, wallEnds, W, L);
    if (!draw.start) return setDraw({ ...draw, start: p });
    if (Math.hypot(p.x - draw.start.x, p.y - draw.start.y) < 0.5) return;   // too short: ignore
    try {
      await wm.insert.mutateAsync({ kind: draw.kind, x1: draw.start.x, y1: draw.start.y, x2: p.x, y2: p.y });
      setDraw({ ...draw, start: p });   // keep going from the end, like tracing a floor plan
    } catch (err) { setError(friendly(err)); }
  };

  // ---------- seating guests ----------
  const seatGuest = async (g: Guest, t: SeatingTable, seat: number) => {
    setError('');
    const seats = seatsByTable[t.id];
    if (!canSit(seats, seat, g)) {
      return setError(g.party_size > 1
        ? `${g.name} needs ${g.party_size} chairs next to each other starting there.`
        : 'That chair is taken.');
    }
    try { await gm.update.mutateAsync({ id: g.id, table_id: t.id, seat_index: seat }); setPick(null); setHeld(null); setSearch(''); }
    catch (err) { setError(friendly(err)); }
  };
  const unseat = async (guestId: string) => {
    try { await gm.update.mutateAsync({ id: guestId, table_id: null, seat_index: null }); setPick(null); }
    catch (err) { setError(friendly(err)); }
  };
  const clickChair = (e: React.MouseEvent, t: SeatingTable, seat: number) => {
    e.stopPropagation();
    if (!canSeat) return;
    if (held) { const s = seatsByTable[t.id][seat]; if (!s) seatGuest(held, t, seat); return; }
    const box = wrapRef.current!.getBoundingClientRect();
    setPick({ tableId: t.id, seat, px: e.clientX - box.left + wrapRef.current!.scrollLeft, py: e.clientY - box.top + wrapRef.current!.scrollTop });
    setSearch('');
  };

  // ---------- adding ----------
  const freeSpot = () => {
    const i = list.length; const cols = Math.max(1, Math.floor((W - 6) / 12));
    return { x: clamp(6 + (i % cols) * 12, 4, W - 4), y: clamp(8 + Math.floor(i / cols) * 12, 4, L - 4) };
  };
  const addTable = async (kind: TableKind) => {
    const spec = TABLE_KINDS[kind]; const spot = freeSpot();
    try {
      await tm.insert.mutateAsync({ label: kind === 'sweetheart' ? 'Sweetheart' : `Table ${list.filter((t) => t.kind !== 'sweetheart').length + 1}`,
        kind, shape: spec.round ? 'round' : 'rect', capacity: spec.seats, rotation: 0, ...spot });
      setPanel(null);
    } catch (err) { setError(friendly(err)); }
  };
  const addItem = async (kind: ItemKind) => {
    const spec = ITEM_KINDS[kind];
    try { await im.insert.mutateAsync({ kind, label: spec.label, w: spec.w, h: spec.h, x: W / 2, y: L / 2 }); setPanel(null); }
    catch (err) { setError(friendly(err)); }
  };

  // ---------- render helpers ----------
  const fullness = (t: SeatingTable) => { const n = filled(t); return n >= t.capacity ? FULLNESS.full : n > 0 ? FULLNESS.partial : FULLNESS.empty; };
  const pickTable = pick ? list.find((t) => t.id === pick.tableId) : null;
  const pickSeat = pick && pickTable ? seatsByTable[pickTable.id][pick.seat] : null;
  const matches = unassigned.filter((g) => g.name.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <>
      <PageHeader title="Seating chart" sub={`${layoutQ.data?.room_name || 'Your room'} · ${W} × ${L} ft · drawn to scale`} action={canEdit && (
        <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button className="btn g" onClick={() => setPanel('room')}>Room size</button>
          <button className="btn g" onClick={() => { setDraw({ kind: 'wall', start: null }); setPick(null); setHeld(null); }}>+ Wall</button>
          <button className="btn g" onClick={() => setPanel('feature')}>+ Feature</button>
          <button className="btn" onClick={() => setPanel('table')}>+ Table</button>
        </span>
      )} />
      {error && <p className="err" role="alert">{error}</p>}
      {draw && (
        <div className="card" style={{ padding: '10px 14px', marginBottom: 8, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <b className="small">Drawing</b>
          <div role="group" aria-label="Wall type" style={{ display: 'flex', gap: 4 }}>
            {(Object.keys(WALL_KINDS) as WallKind[]).map((k) => (
              <button key={k} className={`f${draw.kind === k ? ' on' : ''}`} title={WALL_KINDS[k].hint} onClick={() => setDraw({ ...draw, kind: k })}>{WALL_KINDS[k].label}</button>
            ))}
          </div>
          <span className="small muted" style={{ flex: 1, minWidth: 220 }}>
            {draw.start ? 'Click where this wall ends. It continues from there; press Esc to start a separate wall.' : 'Click where the wall starts.'}
          </span>
          <button className="btn sm" onClick={() => { setDraw(null); setCursor(null); }}>Done</button>
        </div>
      )}
      {held && (
        <p className="small" style={{ marginBottom: 8 }}>
          Tap an empty chair <b>+</b> to seat <b>{held.name}</b>{held.party_size > 1 ? ` (party of ${held.party_size})` : ''}.{' '}
          <button className="btn g sm" onClick={() => setHeld(null)}>Cancel</button>
        </p>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <div className="small muted" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Legend color={SIDE_FILL.partner1} label={`${wedding.partner1}’s side`} />
          <Legend color={SIDE_FILL.partner2} label={`${wedding.partner2}’s side`} />
          <Legend color={SIDE_FILL.both} label="Both" />
          {canSeat && <span>Tap <b>+</b> on any chair to seat someone</span>}
        </div>
        <div style={{ display: 'flex', gap: 4 }} role="group" aria-label="Zoom">
          {[1, 1.5, 2].map((z) => <button key={z} className={`f${zoom === z ? ' on' : ''}`} onClick={() => setZoom(z)}>{z * 100}%</button>)}
        </div>
      </div>

      {list.length === 0 && (items.data ?? []).length === 0 && canEdit && (
        <Empty action={<button className="btn" onClick={() => setPanel('room')}>Set your room size</button>}>
          Start with your room’s size, then add tables and the dance floor. Everything is drawn to scale.
        </Empty>
      )}

      <div ref={wrapRef} className="floor-wrap" style={{ position: 'relative', overflow: 'auto', borderRadius: 24, border: '1px solid var(--border)', background: '#F8F4EE', marginTop: 8 }}
        onClick={() => setPick(null)}>
        <svg ref={svgRef} viewBox={`${-PAD} ${-PAD} ${W + PAD * 2} ${L + PAD * 2}`} role="img" aria-label={`Seating plan, ${W} by ${L} feet`}
          style={{ display: 'block', width: `${zoom * 100}%`, height: 'auto', touchAction: drag ? 'none' : 'pan-x pan-y' }}
          onPointerMove={onMove}>
          <defs>
            <filter id="tbl-shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="0.15" stdDeviation="0.2" floodColor="#1E1A14" floodOpacity="0.18" /></filter>
            <pattern id="parquet" width="4" height="4" patternUnits="userSpaceOnUse">
              <rect width="4" height="4" fill="#EFE2C2" /><rect width="2" height="2" fill="#E6D3A6" /><rect x="2" y="2" width="2" height="2" fill="#E6D3A6" />
            </pattern>
          </defs>

          {/* Room */}
          <rect x={0} y={0} width={W} height={L} fill="#FDFAF5" stroke="#6B5E4E" strokeWidth={0.3} rx={0.3} />
          {Array.from({ length: Math.floor(W / 5) - (W % 5 === 0 ? 1 : 0) }, (_, i) => (i + 1) * 5).map((x) =>
            <line key={`gx${x}`} x1={x} x2={x} y1={0} y2={L} stroke="#EDE7DC" strokeWidth={0.06} />)}
          {Array.from({ length: Math.floor(L / 5) - (L % 5 === 0 ? 1 : 0) }, (_, i) => (i + 1) * 5).map((y) =>
            <line key={`gy${y}`} x1={0} x2={W} y1={y} y2={y} stroke="#EDE7DC" strokeWidth={0.06} />)}
          <text x={W / 2} y={-1.1} textAnchor="middle" fontSize={0.9} fill="#6B5E4E" fontFamily="Inter, sans-serif">{W} ft</text>
          <text x={-1.1} y={L / 2} textAnchor="middle" fontSize={0.9} fill="#6B5E4E" fontFamily="Inter, sans-serif" transform={`rotate(-90 ${-1.1} ${L / 2})`}>{L} ft</text>
          <g transform={`translate(0 ${L + 1.6})`}>
            <line x1={0} x2={10} y1={0} y2={0} stroke="#6B5E4E" strokeWidth={0.12} />
            <line x1={0} x2={0} y1={-0.35} y2={0.35} stroke="#6B5E4E" strokeWidth={0.12} />
            <line x1={10} x2={10} y1={-0.35} y2={0.35} stroke="#6B5E4E" strokeWidth={0.12} />
            <text x={11} y={0.3} fontSize={0.8} fill="#6B5E4E" fontFamily="Inter, sans-serif">10 ft</text>
          </g>

          {/* Areas sit under everything */}
          {(items.data ?? []).filter((it) => it.kind === 'area').map((it) => {
            const p = posOf(it.id, it.x, it.y); const w = Number(it.w), h = Number(it.h);
            return (
              <g key={it.id} style={{ cursor: canEdit ? 'grab' : 'default' }}
                onPointerDown={(e) => startDrag(e, 'item', it.id, p.x, p.y)} onPointerUp={() => endDrag(() => canEdit && setOpenItem(it))}>
                <rect x={p.x - w / 2} y={p.y - h / 2} width={w} height={h} rx={0.4} fill="#8FAF8E" fillOpacity={0.1} stroke="#8FAF8E" strokeWidth={0.1} strokeDasharray="0.8 0.4" />
                <text x={p.x - w / 2 + 0.6} y={p.y - h / 2 + 1.3} fontSize={0.9} fill="#4D7050" fontFamily="Inter, sans-serif" fontWeight={600} pointerEvents="none">{it.label || 'Area'}</text>
              </g>
            );
          })}

          {/* Walls */}
          {wallList.map((w) => {
            const st = WALL_KINDS[w.kind];
            const x1 = Number(w.x1), y1 = Number(w.y1), x2 = Number(w.x2), y2 = Number(w.y2);
            return (
              <g key={w.id} style={{ cursor: canEdit && !draw ? 'pointer' : 'default' }} onClick={(e) => { e.stopPropagation(); if (canEdit && !draw) setOpenWall(w); }}>
                <title>{`${st.label} · ${feetInches(Math.hypot(x2 - x1, y2 - y1))}`}</title>
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={1.4} />
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={openWall?.id === w.id ? '#9E5E54' : st.stroke} strokeWidth={st.width} strokeLinecap="square" strokeDasharray={st.dash} />
              </g>
            );
          })}

          {/* Room features */}
          {(items.data ?? []).filter((it) => it.kind !== 'area').map((it) => {
            const p = posOf(it.id, it.x, it.y); const w = Number(it.w), h = Number(it.h);
            const floor = it.kind === 'dance_floor';
            return (
              <g key={it.id} style={{ cursor: canEdit ? 'grab' : 'default' }}
                onPointerDown={(e) => startDrag(e, 'item', it.id, p.x, p.y)} onPointerUp={() => endDrag(() => canEdit && setOpenItem(it))}>
                <rect x={p.x - w / 2} y={p.y - h / 2} width={w} height={h} rx={0.3}
                  fill={floor ? 'url(#parquet)' : it.kind === 'column' ? '#D8CCBE' : '#F3EEE6'} stroke={floor ? '#C4A35A' : it.kind === 'column' ? '#6B5E4E' : '#A89880'}
                  strokeWidth={0.12} strokeDasharray={floor || it.kind === 'column' ? undefined : '0.5 0.3'} />
                {it.kind !== 'column' && (() => {
                  const tall = h > w * 1.4;                        // narrow pieces (a bar along a wall) get a sideways label
                  const fs = Math.min(1, (tall ? w : h) * 0.45);
                  return (
                    <text x={p.x} y={p.y + fs * 0.35} textAnchor="middle" fontSize={fs} fill="#6B5E4E" fontFamily="Inter, sans-serif" fontWeight={600}
                      pointerEvents="none" transform={tall ? `rotate(-90 ${p.x} ${p.y})` : undefined}>
                      {it.label || ITEM_KINDS[it.kind].label}
                    </text>
                  );
                })()}
              </g>
            );
          })}

          {/* Tables with chairs */}
          {list.map((t) => {
            const p = posOf(t.id, t.x, t.y);
            const spec = TABLE_KINDS[t.kind]; const fp = footprint(t.kind, t.rotation);
            const seats = seatsByTable[t.id] ?? [];
            const offs = seatOffsets(t.kind, t.capacity, t.rotation);
            const ring = fullness(t);
            return (
              <g key={t.id}>
                <g filter="url(#tbl-shadow)" style={{ cursor: canEdit ? 'grab' : 'pointer' }}
                  onPointerDown={(e) => startDrag(e, 'table', t.id, p.x, p.y)} onPointerUp={() => endDrag(() => setOpenTable(t))}>
                  {spec.round
                    ? <circle cx={p.x} cy={p.y} r={spec.w / 2} fill="#FFFDF8" stroke={ring} strokeWidth={0.14} />
                    : <rect x={p.x - fp.w / 2} y={p.y - fp.h / 2} width={fp.w} height={fp.h} rx={0.25} fill="#FFFDF8" stroke={ring} strokeWidth={0.14} />}
                  <text x={p.x} y={p.y + (spec.round ? 0 : 0.05)} textAnchor="middle" fontSize={spec.round ? 0.75 : 0.6} fontWeight={700}
                    fill="#3B3226" fontFamily="'Playfair Display', Georgia, serif" pointerEvents="none">{t.label}</text>
                  {spec.round && <text x={p.x} y={p.y + 0.85} textAnchor="middle" fontSize={0.55} fill="#8B7B66" fontFamily="Inter, sans-serif" pointerEvents="none">
                    {filled(t)}/{t.capacity}
                  </text>}
                </g>
                {offs.map((o, i) => {
                  const cx = p.x + o.x, cy = p.y + o.y; const s = seats[i];
                  const active = pick && pick.tableId === t.id && pick.seat === i;
                  return (
                    <g key={i} onClick={(e) => clickChair(e, t, i)} onPointerDown={(e) => e.stopPropagation()}
                      style={{ cursor: canSeat ? 'pointer' : 'default' }} role={canSeat ? 'button' : undefined}
                      aria-label={s ? `${s.guest.name}${s.plusOne ? ' (guest)' : ''}, ${t.label} chair ${i + 1}` : `Empty chair ${i + 1} at ${t.label}`}>
                      <title>{s ? `${s.guest.name}${s.plusOne ? ' · +1' : ''}` : `${t.label} · chair ${i + 1}${canSeat ? ' · tap to seat someone' : ''}`}</title>
                      {s ? (
                        <>
                          <circle cx={cx} cy={cy} r={CHAIR_R} fill={SIDE_FILL[s.guest.side]} stroke={active ? '#9E5E54' : '#FFFFFF'} strokeWidth={active ? 0.16 : 0.1} />
                          <text x={cx} y={cy + 0.2} textAnchor="middle" fontSize={s.plusOne ? 0.48 : 0.55} fontWeight={700} fill={SIDE_TEXT[s.guest.side]}
                            fontFamily="Inter, sans-serif" pointerEvents="none">{s.plusOne ? '+1' : initials(s.guest.name)}</text>
                        </>
                      ) : (
                        <>
                          <circle cx={cx} cy={cy} r={CHAIR_R} fill={active ? '#FBF0EE' : '#FFFFFF'} stroke={active ? '#9E5E54' : '#C9B89A'} strokeWidth={0.08} strokeDasharray={active ? undefined : '0.25 0.18'} />
                          {canSeat && (
                            <g stroke="#9E5E54" strokeWidth={0.12} strokeLinecap="round" pointerEvents="none">
                              <line x1={cx - 0.28} x2={cx + 0.28} y1={cy} y2={cy} /><line x1={cx} x2={cx} y1={cy - 0.28} y2={cy + 0.28} />
                            </g>
                          )}
                        </>
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })}
          {/* Drawing layer: on top of everything while drawing walls */}
          {draw && (
            <>
              {draw.start && cursor && (
                <g pointerEvents="none">
                  <line x1={draw.start.x} y1={draw.start.y} x2={cursor.x} y2={cursor.y} stroke={WALL_KINDS[draw.kind].stroke}
                    strokeWidth={WALL_KINDS[draw.kind].width} strokeOpacity={0.6} strokeDasharray={WALL_KINDS[draw.kind].dash} strokeLinecap="square" />
                  <rect x={(draw.start.x + cursor.x) / 2 - 1.6} y={(draw.start.y + cursor.y) / 2 - 1.55} width={3.2} height={1.1} rx={0.3} fill="#1E1A14" fillOpacity={0.8} />
                  <text x={(draw.start.x + cursor.x) / 2} y={(draw.start.y + cursor.y) / 2 - 0.75} textAnchor="middle" fontSize={0.7} fill="#fff" fontFamily="Inter, sans-serif">
                    {feetInches(Math.hypot(cursor.x - draw.start.x, cursor.y - draw.start.y))}
                  </text>
                </g>
              )}
              {draw.start && <circle cx={draw.start.x} cy={draw.start.y} r={0.35} fill="#9E5E54" pointerEvents="none" />}
              {cursor && <circle cx={cursor.x} cy={cursor.y} r={0.3} fill="none" stroke="#9E5E54" strokeWidth={0.1} pointerEvents="none" />}
              <rect x={-PAD} y={-PAD} width={W + PAD * 2} height={L + PAD * 2} fill="transparent" style={{ cursor: 'crosshair' }}
                onPointerMove={drawMove} onPointerDown={drawClick} onPointerLeave={() => setCursor(null)} />
            </>
          )}
        </svg>

        {/* Chair picker */}
        {pick && pickTable && (
          <div className="card" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Choose a guest for this chair"
            style={{ position: 'absolute', left: Math.min(pick.px, (wrapRef.current?.scrollWidth ?? 600) - 290), top: pick.py + 12, width: 280, zIndex: 5, padding: 14, margin: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <b className="small">{pickTable.label} · chair {pick.seat + 1}</b>
              <button className="x-btn" aria-label="Close" onClick={() => setPick(null)}>×</button>
            </div>
            {pickSeat ? (
              <>
                <p style={{ marginBottom: 10 }}>{pickSeat.guest.name}{pickSeat.plusOne ? '’s guest' : ''}{pickSeat.guest.party_size > 1 ? ` · party of ${pickSeat.guest.party_size}` : ''}</p>
                <button className="btn g sm" onClick={() => unseat(pickSeat.guest.id)}>Unseat {pickSeat.guest.party_size > 1 ? 'party' : pickSeat.guest.name.split(' ')[0]}</button>
              </>
            ) : unassigned.length === 0 ? (
              <p className="small muted">Everyone attending already has a seat.</p>
            ) : (
              <>
                <input className="input" autoFocus placeholder="Search guests" value={search} onChange={(e) => setSearch(e.target.value)} style={{ marginBottom: 8 }} />
                <div style={{ maxHeight: 220, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {matches.map((g) => {
                    const ok = canSit(seatsByTable[pickTable.id], pick.seat, g);
                    return (
                      <button key={g.id} type="button" className="row" disabled={!ok} onClick={() => seatGuest(g, pickTable, pick.seat)}
                        style={{ margin: 0, padding: '7px 10px', alignItems: 'center', cursor: ok ? 'pointer' : 'not-allowed', opacity: ok ? 1 : 0.5, textAlign: 'left', font: 'inherit' }}>
                        <span className="av" style={{ width: 26, height: 26, fontSize: '.68rem', background: SIDE_FILL[g.side], color: SIDE_TEXT[g.side] }}>{initials(g.name)}</span>
                        <span style={{ flex: 1 }}><span className="nm">{g.name}</span>{g.party_size > 1 && <span className="small muted"> · party of {g.party_size}</span>}
                          {!ok && <span className="small muted" style={{ display: 'block' }}>Needs {g.party_size} chairs side by side</span>}</span>
                      </button>
                    );
                  })}
                  {matches.length === 0 && <p className="small muted">No match.</p>}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {levels.guests !== 'none' && (
        <div className="card" style={{ marginTop: 14 }}>
          <h2 className="ct">Not seated yet <span className="badge bb">{unassigned.reduce((n, g) => n + g.party_size, 0)}</span></h2>
          {unassigned.length === 0 ? <p className="muted small">Everyone attending has a seat.</p> : unassigned.map((g) => (
            <button key={g.id} type="button" className={`chip${held?.id === g.id ? ' sel' : ''}`} disabled={!canSeat}
              style={{ background: SIDE_FILL[g.side], color: SIDE_TEXT[g.side] }}
              onClick={() => { setHeld(held?.id === g.id ? null : g); setPick(null); }}>
              {g.name}{g.couple_role ? ' · couple' : ''}{g.party_size > 1 ? ` +${g.party_size - 1}` : ''}
            </button>
          ))}
          {canSeat && unassigned.length > 0 && <p className="small muted">Tap a name, then tap an empty chair. Or tap any chair’s <b>+</b> and pick from the list.</p>}
        </div>
      )}

      <RoomDrawer open={panel === 'room'} onClose={() => setPanel(null)} weddingId={wedding.id} layout={layoutQ.data ?? null} venue={wedding.venue}
        onSaved={() => qc.invalidateQueries({ queryKey: ['seating_layouts', wedding.id] })} />

      <Drawer open={panel === 'table'} title="Add a table" onClose={() => setPanel(null)}>
        {(Object.keys(TABLE_KINDS) as TableKind[]).map((k) => (
          <button key={k} type="button" className="row click" style={{ width: '100%', alignItems: 'center', font: 'inherit', textAlign: 'left' }} onClick={() => addTable(k)}>
            <MiniTable kind={k} />
            <span><span className="nm">{TABLE_KINDS[k].label}</span><span className="small muted" style={{ display: 'block' }}>Seats {TABLE_KINDS[k].seats}{TABLE_KINDS[k].max > TABLE_KINDS[k].seats ? `, up to ${TABLE_KINDS[k].max}` : ''}</span></span>
          </button>
        ))}
      </Drawer>

      <Drawer open={panel === 'feature'} title="Add a room feature" onClose={() => setPanel(null)}>
        {(Object.keys(ITEM_KINDS) as ItemKind[]).map((k) => (
          <button key={k} type="button" className="row click" style={{ width: '100%', font: 'inherit', textAlign: 'left' }} onClick={() => addItem(k)}>
            <span><span className="nm">{ITEM_KINDS[k].label}</span><span className="small muted" style={{ display: 'block' }}>{ITEM_KINDS[k].w} × {ITEM_KINDS[k].h} ft · resize after adding</span></span>
          </button>
        ))}
      </Drawer>

      <TableDrawer table={openTable} seats={openTable ? seatsByTable[openTable.id] ?? [] : []} canEdit={canEdit} canSeat={canSeat}
        onClose={() => setOpenTable(null)} onUnseat={unseat}
        onSave={async (patch) => { await tm.update.mutateAsync({ id: openTable!.id, ...patch }); setOpenTable(null); }}
        onDelete={async () => { await tm.remove.mutateAsync(openTable!.id); gm.refresh(); setOpenTable(null); }} />

      <WallDrawer wall={openWall} onClose={() => setOpenWall(null)}
        onSave={async (kind) => { await wm.update.mutateAsync({ id: openWall!.id, kind }); setOpenWall(null); }}
        onDelete={async () => { await wm.remove.mutateAsync(openWall!.id); setOpenWall(null); }} />

      <ItemDrawer item={openItem} onClose={() => setOpenItem(null)}
        onSave={async (patch) => { await im.update.mutateAsync({ id: openItem!.id, ...patch }); setOpenItem(null); }}
        onDelete={async () => { await im.remove.mutateAsync(openItem!.id); setOpenItem(null); }} />
    </>
  );
}

const Legend = ({ color, label }: { color: string; label: string }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><i style={{ width: 11, height: 11, borderRadius: '50%', background: color, display: 'inline-block', border: '1px solid #E0D5C5' }} />{label}</span>
);

function MiniTable({ kind }: { kind: TableKind }) {
  const s = TABLE_KINDS[kind]; const offs = seatOffsets(kind, s.seats, 0);
  const span = Math.max(s.w, s.h) + 4;
  return (
    <svg viewBox={`${-span / 2} ${-span / 2} ${span} ${span}`} width={46} height={46} aria-hidden>
      {s.round ? <circle r={s.w / 2} fill="#FFFDF8" stroke="#C9A84C" strokeWidth={0.2} />
        : <rect x={-s.w / 2} y={-s.h / 2} width={s.w} height={s.h} rx={0.3} fill="#FFFDF8" stroke="#C9A84C" strokeWidth={0.2} />}
      {offs.map((o, i) => <circle key={i} cx={o.x} cy={o.y} r={CHAIR_R} fill="#fff" stroke="#C9B89A" strokeWidth={0.15} />)}
    </svg>
  );
}

function RoomDrawer({ open, onClose, weddingId, layout, venue, onSaved }: {
  open: boolean; onClose: () => void; weddingId: string; layout: SeatingLayout | null; venue: string | null; onSaved: () => void;
}) {
  const [name, setName] = useState(''); const [w, setW] = useState('60'); const [l, setL] = useState('40'); const [url, setUrl] = useState('');
  const [rooms, setRooms] = useState<{ name: string; width_ft: number | null; length_ft: number | null; area_sqft: number | null; seated_capacity: number | null; source: string }[] | null>(null);
  const [note, setNote] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [seeded, setSeeded] = useState(false);
  if (open && !seeded) {
    setSeeded(true);
    setName(layout?.room_name ?? venue ?? ''); setW(String(layout?.width_ft ?? 60)); setL(String(layout?.length_ft ?? 40)); setUrl(layout?.venue_url ?? '');
    setRooms(null); setNote(''); setError('');
  }
  if (!open && seeded) setSeeded(false);

  const lookup = async () => {
    setBusy(true); setError(''); setRooms(null); setNote('');
    const { data, error } = await supabase.functions.invoke('venue-room', { body: { wedding_id: weddingId, url } });
    setBusy(false);
    if (error) return setError(await functionError(error));
    setRooms(data.rooms ?? []);
  };
  const use = (r: NonNullable<typeof rooms>[number]) => {
    setName(r.name);
    if (r.width_ft && r.length_ft) { setW(String(r.width_ft)); setL(String(r.length_ft)); setNote(`From the venue page: “${r.source}”`); }
    else if (r.area_sqft) { const e = roomFromArea(r.area_sqft); setW(String(e.width_ft)); setL(String(e.length_ft)); setNote(`Estimated from ${r.area_sqft.toLocaleString()} sq ft. Adjust if you know the real shape.`); }
    else setNote('The page lists capacity but not size. Enter the size by hand.');
  };
  const save = async () => {
    setError('');
    const width = Number(w), length = Number(l);
    if (!(width >= 10 && width <= 400 && length >= 10 && length <= 400)) return setError('Width and length must be between 10 and 400 feet.');
    const { error } = await supabase.from('seating_layouts').upsert({ wedding_id: weddingId, room_name: name || null, width_ft: width, length_ft: length, venue_url: url || null });
    if (error) return setError(friendly(error));
    onSaved(); onClose();
  };

  return (
    <Drawer open={open} title="Room size" onClose={onClose} footer={<><span /><button className="btn" onClick={save}>Save room</button></>}>
      <label className="field"><span>Room name</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Grand Barn" /></label>
      <div className="g2">
        <label className="field"><span>Width (ft)</span><input type="number" min={10} max={400} value={w} onChange={(e) => setW(e.target.value)} /></label>
        <label className="field"><span>Length (ft)</span><input type="number" min={10} max={400} value={l} onChange={(e) => setL(e.target.value)} /></label>
      </div>
      {note && <p className="small" style={{ marginTop: -4, marginBottom: 12 }}>{note}</p>}
      <div className="card" style={{ padding: 14, background: 'var(--ivory)' }}>
        <b className="small">Find it on the venue’s website</b>
        <p className="small muted" style={{ margin: '4px 0 8px' }}>Paste the page that lists the room sizes. We’ll pull any measurements it states. Sizes in PDFs or floor-plan images can’t be read; enter those by hand.</p>
        <div style={{ display: 'flex', gap: 6 }}>
          <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://thevenue.com/weddings" />
          <button className="btn g" disabled={busy || !url.trim()} onClick={lookup}>{busy ? 'Reading…' : 'Find'}</button>
        </div>
        {rooms && rooms.length === 0 && <p className="small" style={{ marginTop: 8 }}>No room sizes found on that page.</p>}
        {rooms && rooms.map((r, i) => (
          <button key={i} type="button" className="row click" style={{ width: '100%', marginTop: 8, font: 'inherit', textAlign: 'left' }} onClick={() => use(r)}>
            <span><span className="nm">{r.name}</span>
              <span className="small muted" style={{ display: 'block' }}>
                {[r.width_ft && r.length_ft ? `${r.width_ft} × ${r.length_ft} ft` : null, r.area_sqft ? `${r.area_sqft.toLocaleString()} sq ft` : null,
                  r.seated_capacity ? `seats ${r.seated_capacity}` : null].filter(Boolean).join(' · ')}
              </span></span>
          </button>
        ))}
      </div>
      {error && <p className="err">{error}</p>}
    </Drawer>
  );
}

function TableDrawer({ table, seats, canEdit, canSeat, onClose, onSave, onDelete, onUnseat }: {
  table: SeatingTable | null; seats: Seat[]; canEdit: boolean; canSeat: boolean; onClose: () => void;
  onSave: (p: Partial<SeatingTable>) => Promise<void>; onDelete: () => Promise<void>; onUnseat: (guestId: string) => void;
}) {
  const [label, setLabel] = useState(''); const [kind, setKind] = useState<TableKind>('round60'); const [cap, setCap] = useState(8); const [rot, setRot] = useState<0 | 90>(0);
  const [forId, setForId] = useState<string | null>(null); const [error, setError] = useState('');
  if (table && forId !== table.id) { setForId(table.id); setLabel(table.label); setKind(table.kind); setCap(table.capacity); setRot(table.rotation); setError(''); }
  if (!table && forId) setForId(null);
  if (!table) return null;
  const spec = TABLE_KINDS[kind];
  const people = seats.map((s, i) => ({ s, i })).filter((x) => x.s && !x.s.plusOne);
  const seatedCount = seats.filter(Boolean).length;

  return (
    <Drawer open title={table.label} onClose={onClose} footer={canEdit ? (
      <>
        <button className="btn danger" onClick={() => { if (confirm('Delete this table? Its guests become unseated.')) onDelete().catch((e) => setError(friendly(e))); }}>Delete table</button>
        <button className="btn" onClick={() => {
          if (cap < seatedCount) return setError(`${seatedCount} people are seated here. Unseat some before reducing to ${cap} chairs.`);
          onSave({ label, kind, capacity: cap, rotation: spec.round ? 0 : rot, shape: spec.round ? 'round' : 'rect' }).catch((e) => setError(friendly(e)));
        }}>Save</button>
      </>
    ) : undefined}>
      {canEdit && (
        <>
          <label className="field"><span>Name</span><input value={label} onChange={(e) => setLabel(e.target.value)} /></label>
          <label className="field"><span>Table</span>
            <select value={kind} onChange={(e) => { const k = e.target.value as TableKind; setKind(k); setCap(Math.min(TABLE_KINDS[k].max, Math.max(1, cap))); }}>
              {(Object.keys(TABLE_KINDS) as TableKind[]).map((k) => <option key={k} value={k}>{TABLE_KINDS[k].label}</option>)}
            </select>
          </label>
          <div className="g2">
            <label className="field"><span>Chairs</span>
              <select value={cap} onChange={(e) => setCap(Number(e.target.value))}>
                {Array.from({ length: spec.max }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            {!spec.round && (
              <label className="field"><span>Direction</span>
                <select value={rot} onChange={(e) => setRot(Number(e.target.value) as 0 | 90)}>
                  <option value={0}>Long side across</option><option value={90}>Long side down</option>
                </select>
              </label>
            )}
          </div>
        </>
      )}
      <h3 className="ct" style={{ marginTop: 6 }}>Seated ({seatedCount} of {table.capacity})</h3>
      {people.length === 0 && <p className="small muted">No one yet. Close this and tap a chair’s <b>+</b> to seat someone.</p>}
      {people.map(({ s, i }) => (
        <div className="row" key={s!.guest.id} style={{ alignItems: 'center' }}>
          <span className="small muted" style={{ width: 52 }}>Chair {i + 1}</span>
          <span className="nm" style={{ flex: 1 }}>{s!.guest.name}{s!.guest.party_size > 1 ? ` +${s!.guest.party_size - 1}` : ''}</span>
          {canSeat && <button className="btn g sm" onClick={() => onUnseat(s!.guest.id)}>Unseat</button>}
        </div>
      ))}
      {error && <p className="err">{error}</p>}
    </Drawer>
  );
}

function ItemDrawer({ item, onClose, onSave, onDelete }: {
  item: RoomItem | null; onClose: () => void; onSave: (p: Partial<RoomItem>) => Promise<void>; onDelete: () => Promise<void>;
}) {
  const [label, setLabel] = useState(''); const [w, setW] = useState('0'); const [h, setH] = useState('0');
  const [forId, setForId] = useState<string | null>(null); const [error, setError] = useState('');
  if (item && forId !== item.id) { setForId(item.id); setLabel(item.label ?? ''); setW(String(item.w)); setH(String(item.h)); setError(''); }
  if (!item && forId) setForId(null);
  if (!item) return null;
  return (
    <Drawer open title={item.label || ITEM_KINDS[item.kind].label} onClose={onClose} footer={
      <>
        <button className="btn danger" onClick={() => onDelete().catch((e) => setError(friendly(e)))}>Remove</button>
        <button className="btn" onClick={() => {
          const wn = Number(w), hn = Number(h);
          if (!(wn >= 1 && wn <= 200 && hn >= 1 && hn <= 200)) return setError('Sizes must be between 1 and 200 feet.');
          onSave({ label, w: wn, h: hn }).catch((e) => setError(friendly(e)));
        }}>Save</button>
      </>
    }>
      <label className="field"><span>Label</span><input value={label} onChange={(e) => setLabel(e.target.value)} /></label>
      <div className="g2">
        <label className="field"><span>Width (ft)</span><input type="number" min={1} max={200} value={w} onChange={(e) => setW(e.target.value)} /></label>
        <label className="field"><span>Depth (ft)</span><input type="number" min={1} max={200} value={h} onChange={(e) => setH(e.target.value)} /></label>
      </div>
      <p className="small muted">Drag it on the plan to move it.</p>
      {error && <p className="err">{error}</p>}
    </Drawer>
  );
}

function WallDrawer({ wall, onClose, onSave, onDelete }: {
  wall: RoomWall | null; onClose: () => void; onSave: (kind: WallKind) => Promise<void>; onDelete: () => Promise<void>;
}) {
  const [kind, setKind] = useState<WallKind>('wall'); const [forId, setForId] = useState<string | null>(null); const [error, setError] = useState('');
  if (wall && forId !== wall.id) { setForId(wall.id); setKind(wall.kind); setError(''); }
  if (!wall && forId) setForId(null);
  if (!wall) return null;
  const len = Math.hypot(Number(wall.x2) - Number(wall.x1), Number(wall.y2) - Number(wall.y1));
  return (
    <Drawer open title={`${WALL_KINDS[wall.kind].label} · ${feetInches(len)}`} onClose={onClose} footer={
      <>
        <button className="btn danger" onClick={() => onDelete().catch((e) => setError(friendly(e)))}>Delete</button>
        <button className="btn" onClick={() => onSave(kind).catch((e) => setError(friendly(e)))}>Save</button>
      </>
    }>
      <div className="field"><span>Type</span>
        <div className="checks">
          {(Object.keys(WALL_KINDS) as WallKind[]).map((k) => (
            <label key={k}><input type="radio" name="wallkind" checked={kind === k} onChange={() => setKind(k)} />
              <span><b>{WALL_KINDS[k].label}</b> <span className="small muted">· {WALL_KINDS[k].hint}</span></span></label>
          ))}
        </div>
      </div>
      <p className="small muted">To move a wall, delete it and draw it again with <b>+ Wall</b>. Leave a gap between walls for a doorway.</p>
      {error && <p className="err">{error}</p>}
    </Drawer>
  );
}
