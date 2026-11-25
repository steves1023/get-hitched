import { Fragment, useMemo, useRef, useState } from 'react';
import Papa from 'papaparse';
import { useQueryClient } from '@tanstack/react-query';
import { useAccess } from '../lib/access';
import { useRealtime, useRows, useTableMutations } from '../hooks/data';
import { supabase } from '../lib/supabase';
import { friendly } from '../lib/errors';
import { initials } from '../lib/format';
import type { Guest, SeatingTable } from '../lib/types';
import { Badge, Empty, ErrorNote, Filters, Loading, Modal, PageHeader, Stat } from '../components/ui';
import GuestEditor from './guests/GuestEditor';

type Rsvp = 'all' | Guest['rsvp'];
type SortKey = 'name' | 'side' | 'rsvp' | 'party' | 'table' | 'location';
const RSVP = { yes: { label: 'Yes', tone: 'bs' }, no: { label: 'No', tone: 'br' }, pending: { label: 'Pending', tone: 'bw' } } as const;
const VIEW_KEY = 'gh.guests.view';
const loadView = (): 'table' | 'cards' => { try { return localStorage.getItem(VIEW_KEY) === 'cards' ? 'cards' : 'table'; } catch { return 'table'; } };

interface Group { head: Guest; members: Guest[] }

export default function Guests() {
  const { wedding, levels } = useAccess();
  const qc = useQueryClient();
  const canEdit = levels.guests === 'edit';
  const guests = useRows<Guest>('guests', wedding.id, 'name');
  const tables = useRows<SeatingTable>('seating_tables', wedding.id, 'label', true, levels.seating !== 'none');
  const m = useTableMutations<Guest>('guests', wedding.id);
  useRealtime('guests', wedding.id);

  const [view, setView] = useState<'table' | 'cards'>(loadView);
  const [q, setQ] = useState('');
  const [rsvp, setRsvp] = useState<Rsvp>('all');
  const [side, setSide] = useState<'all' | Guest['side']>('all');
  const [seat, setSeat] = useState<'all' | 'seated' | 'unseated'>('all');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'name', dir: 1 });
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<{ guest: Partial<Guest>; isNew: boolean; head: Guest | null; mode?: 'single' | 'family' } | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [importMsg, setImportMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const all = useMemo(() => (guests.data ?? []).filter((g) => !g.couple_role), [guests.data]);
  const tableLabel = (id: string | null) => tables.data?.find((t) => t.id === id)?.label ?? '';
  const sideLabel = (s: Guest['side']) => (s === 'partner1' ? wedding.partner1 : s === 'partner2' ? wedding.partner2 : 'Both');
  const place = (g: Guest) => [g.city, g.state].filter(Boolean).join(', ');
  const switchView = (v: 'table' | 'cards') => { setView(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* private mode */ } };

  // Families: main guests with their members underneath.
  const groups: Group[] = useMemo(() => {
    const ids = new Set(all.map((g) => g.id));
    const heads = all.filter((g) => !g.primary_guest_id || !ids.has(g.primary_guest_id));
    return heads.map((h) => ({ head: h, members: all.filter((g) => g.primary_guest_id === h.id).sort((a, b) => a.name.localeCompare(b.name)) }));
  }, [all]);

  const term = q.trim().toLowerCase();
  const matches = (g: Guest, h: Guest) => {
    if (rsvp !== 'all' && g.rsvp !== rsvp) return false;
    if (side !== 'all' && h.side !== side) return false;
    if (seat === 'seated' && !g.table_id) return false;
    if (seat === 'unseated' && g.table_id) return false;
    if (!term) return true;
    return [g.name, g.email, g.notes, g.dietary, h.city, h.state, h.postal_code, h.address1].some((x) => x?.toLowerCase().includes(term));
  };
  const filtering = !!term || rsvp !== 'all' || side !== 'all' || seat !== 'all';

  const shown = useMemo(() => {
    const val = (g: Guest): string | number => {
      switch (sort.key) {
        case 'side': return sideLabel(g.side); case 'rsvp': return g.rsvp; case 'party': return g.party_size;
        case 'table': return tableLabel(g.table_id) || '~'; case 'location': return place(g) || '~'; default: return g.name.toLowerCase();
      }
    };
    return groups
      .map((gr) => ({ ...gr, headHit: matches(gr.head, gr.head), hits: new Set(gr.members.filter((x) => matches(x, gr.head)).map((x) => x.id)) }))
      .filter((gr) => gr.headHit || gr.hits.size > 0)
      .sort((a, b) => { const x = val(a.head), y = val(b.head); return (x < y ? -1 : x > y ? 1 : 0) * sort.dir; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, term, rsvp, side, seat, sort, tables.data]);

  const people = (f: (g: Guest) => boolean) => all.filter(f).reduce((n, g) => n + g.party_size, 0);
  const shownPeople = shown.reduce((n, gr) => n + (gr.headHit ? gr.head.party_size : 0) + gr.members.filter((x) => gr.hits.has(x.id)).reduce((k, x) => k + x.party_size, 0), 0);
  const isOpen = (gr: (typeof shown)[number]) => open.has(gr.head.id) || (filtering && !gr.headHit && gr.hits.size > 0);
  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const sortBy = (key: SortKey) => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }));
  const arrow = (key: SortKey) => (sort.key === key ? (sort.dir === 1 ? '▲' : '▼') : '');
  const setRsvpFor = (g: Guest, value: Guest['rsvp']) => m.update.mutate({ id: g.id, rsvp: value });
  const openEditor = (g: Guest) => setEditing({ guest: g, isNew: false, head: g.primary_guest_id ? all.find((h) => h.id === g.primary_guest_id) ?? null : null });

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
        const clean = (r: Record<string, string>) => ({
          wedding_id: wedding.id, name: r.name.trim(), side: sideOf(r.side),
          rsvp: ['yes', 'no'].includes(r.rsvp?.trim().toLowerCase()) ? r.rsvp.trim().toLowerCase() : 'pending',
          party_size: Math.max(1, Math.min(20, parseInt(r.party_size || '1', 10) || 1)),
          dietary: r.dietary?.trim() || null, email: r.email?.trim() || null, notes: r.notes?.trim() || null,
          address1: r.address1?.trim() || r.address?.trim() || null, address2: r.address2?.trim() || null, city: r.city?.trim() || null,
          state: r.state?.trim() || null, postal_code: (r.postal_code || r.zip || '').trim() || null, country: r.country?.trim() || null,
        });
        const rows = res.data.filter((r) => r.name?.trim());
        if (!rows.length) return setImportMsg('No rows found. The CSV needs a "name" column.');
        // Rows sharing a "household" value become one family: the first row is the main guest.
        const firstOf = new Map<string, number>();
        rows.forEach((r, i) => { const h = r.household?.trim(); if (h && !firstOf.has(h)) firstOf.set(h, i); });
        const heads = rows.map((r, i) => ({ r, i })).filter(({ r, i }) => !r.household?.trim() || firstOf.get(r.household.trim()) === i);
        const members = rows.filter((r, i) => r.household?.trim() && firstOf.get(r.household.trim()) !== i);
        const headId = new Map<string, string>();
        let added = 0;
        for (let k = 0; k < heads.length; k += 100) {
          const chunk = heads.slice(k, k + 100);
          const { data, error } = await supabase.from('guests').insert(chunk.map(({ r }) => clean(r))).select('id');
          if (error) { m.refresh(); return setImportMsg(`Added ${added} of ${rows.length}. ${friendly(error)}`); }
          chunk.forEach(({ r }, j) => { const h = r.household?.trim(); if (h) headId.set(h, data![j].id); });
          added += chunk.length;
        }
        if (members.length) {
          const { error } = await supabase.from('guests').insert(members.map((r) => {
            const { address1: _a, address2: _b, city: _c, state: _d, postal_code: _e, country: _f, ...rest } = clean(r);
            return { ...rest, primary_guest_id: headId.get(r.household.trim()) ?? null };
          }));
          if (error) { m.refresh(); return setImportMsg(`Added ${added} of ${rows.length}. ${friendly(error)}`); }
          added += members.length;
        }
        m.refresh();
        setImportMsg(`Added ${added} guests${members.length ? `, including ${members.length} family members` : ''}.`);
      },
      error: (err) => setImportMsg(err.message),
    });
  };

  const RsvpCell = ({ g }: { g: Guest }) => canEdit ? (
    <select aria-label={`RSVP for ${g.name}`} value={g.rsvp} onClick={(e) => e.stopPropagation()} onChange={(e) => setRsvpFor(g, e.target.value as Guest['rsvp'])}>
      <option value="pending">Pending</option><option value="yes">Yes</option><option value="no">No</option>
    </select>
  ) : <Badge tone={RSVP[g.rsvp].tone}>{RSVP[g.rsvp].label}</Badge>;

  return (
    <>
      <PageHeader title="Guest list" sub="RSVPs, families & addresses" action={canEdit && (
        <span style={{ display: 'flex', gap: 6 }}>
          <button className="btn g" onClick={() => fileRef.current?.click()}>Import CSV</button>
          <button className="btn" onClick={() => setChoosing(true)}>+ Add guest</button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importCsv(f); e.target.value = ''; }} />
        </span>
      )} />
      {importMsg && <p className="small" style={{ marginBottom: 10 }}>{importMsg}</p>}
      <div className="g3" style={{ marginBottom: 14 }}>
        <Stat value={people(() => true)} label="Total guests" />
        <Stat value={people((g) => g.rsvp === 'yes')} label="Confirmed" />
        <Stat value={people((g) => g.rsvp === 'pending')} label="Awaiting RSVP" />
      </div>

      <div className="toolbar">
        <input className="input" type="search" placeholder="Search name, email, city, notes" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search guests" />
        <select aria-label="Side" value={side} onChange={(e) => setSide(e.target.value as typeof side)}>
          <option value="all">Both sides</option><option value="partner1">{wedding.partner1}’s side</option>
          <option value="partner2">{wedding.partner2}’s side</option><option value="both">Shared</option>
        </select>
        {levels.seating !== 'none' && (
          <select aria-label="Seating" value={seat} onChange={(e) => setSeat(e.target.value as typeof seat)}>
            <option value="all">Seated or not</option><option value="seated">Seated</option><option value="unseated">Not seated</option>
          </select>
        )}
        <div className="seg" role="group" aria-label="View">
          <button className={view === 'table' ? 'on' : ''} onClick={() => switchView('table')}>Table</button>
          <button className={view === 'cards' ? 'on' : ''} onClick={() => switchView('cards')}>Cards</button>
        </div>
      </div>
      <Filters<Rsvp> value={rsvp} onChange={setRsvp} options={[{ value: 'all', label: 'All' }, { value: 'yes', label: 'RSVP yes' }, { value: 'no', label: 'RSVP no' }, { value: 'pending', label: 'Pending' }]} />
      {filtering && <p className="small muted" style={{ marginTop: -6, marginBottom: 8 }}>Showing {shownPeople} of {people(() => true)} people. <button className="btn g sm" onClick={() => { setQ(''); setRsvp('all'); setSide('all'); setSeat('all'); }}>Clear</button></p>}

      {guests.isLoading ? <Loading /> : guests.error ? <ErrorNote error={guests.error} /> : shown.length === 0 ? (
        <Empty>{all.length ? 'No guests match.' : 'Add guests one at a time, or import a CSV with columns name, side, rsvp, party_size, dietary, email, address1, city, state, zip, household.'}</Empty>
      ) : view === 'table' ? (
        <div className="scroll-x">
          <table className="gtable">
            <thead><tr>
              <th><button onClick={() => sortBy('name')}>Name {arrow('name')}</button></th>
              <th><button onClick={() => sortBy('side')}>Side {arrow('side')}</button></th>
              <th><button onClick={() => sortBy('rsvp')}>RSVP {arrow('rsvp')}</button></th>
              <th><button onClick={() => sortBy('party')}>Party {arrow('party')}</button></th>
              {levels.seating !== 'none' && <th><button onClick={() => sortBy('table')}>Table {arrow('table')}</button></th>}
              <th><button onClick={() => sortBy('location')}>City {arrow('location')}</button></th>
              <th>Dietary</th><th>Email</th>
            </tr></thead>
            <tbody>
              {shown.map((gr) => {
                const fam = gr.members.length; const expanded = isOpen(gr);
                return (
                  <Fragment key={gr.head.id}>
                    <tr className={`head-row${filtering && !gr.headHit ? ' dim' : ''}${filtering && term && gr.headHit ? ' hit' : ''}`} onClick={() => canEdit && openEditor(gr.head)}>
                      <td className="name-cell">
                        <div style={{ display: 'flex', alignItems: 'flex-start', minWidth: 200 }}>
                          {fam ? <button className="fam-toggle" aria-expanded={expanded} aria-label={`${expanded ? 'Hide' : 'Show'} ${gr.head.name}’s family`}
                            onClick={(e) => { e.stopPropagation(); toggle(gr.head.id); }}>
                            <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>
                              <path d="M7 4l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </button> : <span className="fam-spacer" />}
                          <div>
                            <b>{gr.head.name}</b>
                            {fam > 0 && <span className="fam-badge">Family · {fam + 1}</span>}
                            {fam > 0 && !expanded && <span className="fam-names">with {gr.members.map((x) => x.name.split(' ')[0]).join(', ')}</span>}
                          </div>
                        </div>
                      </td>
                      <td>{sideLabel(gr.head.side)}</td>
                      <td><RsvpCell g={gr.head} /></td>
                      <td>{gr.head.party_size > 1 ? `+${gr.head.party_size - 1}` : ''}</td>
                      {levels.seating !== 'none' && <td>{tableLabel(gr.head.table_id)}</td>}
                      <td>{place(gr.head)}</td>
                      <td>{gr.head.dietary}</td>
                      <td style={{ overflowWrap: 'anywhere' }}>{gr.head.email}</td>
                    </tr>
                    {expanded && gr.members.map((x) => (
                      <tr key={x.id} className={`member-row${filtering && !gr.hits.has(x.id) ? ' dim' : ''}${filtering && term && gr.hits.has(x.id) ? ' hit' : ''}`} onClick={() => canEdit && openEditor(x)}>
                        <td className="name-cell">{x.name}</td>
                        <td className="muted small">same family</td>
                        <td><RsvpCell g={x} /></td>
                        <td>{x.party_size > 1 ? `+${x.party_size - 1}` : ''}</td>
                        {levels.seating !== 'none' && <td>{tableLabel(x.table_id)}</td>}
                        <td className="muted small">same address</td>
                        <td>{x.dietary}</td>
                        <td style={{ overflowWrap: 'anywhere' }}>{x.email}</td>
                      </tr>
                    ))}
                    {expanded && canEdit && (
                      <tr className="member-row"><td className="name-cell" colSpan={levels.seating !== 'none' ? 8 : 7}>
                        <button className="btn g sm" onClick={(e) => { e.stopPropagation(); setEditing({ guest: { side: gr.head.side, rsvp: gr.head.rsvp, party_size: 1 }, isNew: true, head: gr.head }); }}>
                          + Add to {gr.head.name.split(' ')[0]}’s family
                        </button>
                      </td></tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : shown.map((gr) => (
        <div className={`row${canEdit ? ' click' : ''}`} key={gr.head.id} style={{ alignItems: 'flex-start' }} onClick={() => canEdit && openEditor(gr.head)}>
          <div className="av" aria-hidden>{initials(gr.head.name)}</div>
          <div style={{ flex: 1 }}>
            <div className="nm">{gr.head.name}{gr.members.length > 0 && <span className="fam-badge">Family · {gr.members.length + 1}</span>}</div>
            <div className="chips">
              <Badge>{sideLabel(gr.head.side)}{gr.head.side !== 'both' ? ' side' : ''}</Badge>
              <Badge tone={RSVP[gr.head.rsvp].tone}>{RSVP[gr.head.rsvp].label}</Badge>
              {gr.head.party_size > 1 && <Badge tone="bg">+{gr.head.party_size - 1}</Badge>}
              {tableLabel(gr.head.table_id) && <Badge tone="bs">🪑 {tableLabel(gr.head.table_id)}</Badge>}
              {place(gr.head) && <span className="small muted">{place(gr.head)}</span>}
              {gr.head.dietary && <span className="small muted">{gr.head.dietary}</span>}
            </div>
            {gr.members.length > 0 && (
              <div className="chips" style={{ marginTop: 6 }}>
                {gr.members.map((x) => (
                  <button key={x.id} type="button" className="chip" style={{ margin: 0, padding: '4px 10px', fontSize: '.74rem', opacity: filtering && !gr.hits.has(x.id) ? 0.5 : 1 }}
                    onClick={(e) => { e.stopPropagation(); if (canEdit) openEditor(x); }}>
                    {x.name} · {RSVP[x.rsvp].label}
                  </button>
                ))}
              </div>
            )}
            {gr.head.notes && <div className="small muted" style={{ marginTop: 4 }}>{gr.head.notes}</div>}
          </div>
        </div>
      ))}

      <Modal open={choosing} title="Who are you adding?" onClose={() => setChoosing(false)}>
        <div className="g2">
          {([['single', 'One guest', 'A single person. You can add a +1.'], ['family', 'A family or household', 'Several people at one address, like a couple or parents with kids.']] as const).map(([mode, title, hint]) => (
            <button key={mode} type="button" className="vibe" style={{ padding: '22px 16px', textAlign: 'left' }} autoFocus={mode === 'single'}
              onClick={() => { setChoosing(false); setEditing({ guest: { side: 'both', rsvp: 'pending', party_size: 1 }, isNew: true, head: null, mode }); }}>
              <b style={{ fontSize: '1.1rem', marginBottom: 4 }}>{title}</b><small>{hint}</small>
            </button>
          ))}
        </div>
      </Modal>

      {editing && (
        <GuestEditor guest={editing.guest} isNew={editing.isNew} mode={editing.mode} head={editing.head} wedding={wedding}
          members={editing.isNew || editing.head ? [] : all.filter((g) => g.primary_guest_id === editing.guest.id)}
          standalone={editing.head ? [] : all.filter((g) => g.id !== editing.guest.id && !g.primary_guest_id && !all.some((x) => x.primary_guest_id === g.id))}
          onClose={() => setEditing(null)} onSaved={() => { m.refresh(); qc.invalidateQueries({ queryKey: ['summary', wedding.id] }); }} />
      )}
    </>
  );
}
