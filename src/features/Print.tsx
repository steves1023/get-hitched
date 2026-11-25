import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import '@fontsource/playfair-display/700.css';
import '@fontsource/lato/400.css';
import '@fontsource/great-vibes/400.css';
import '@fontsource/cormorant-garamond/700.css';
import '@fontsource/libre-baskerville/700.css';
import '@fontsource/montserrat/700.css';
import '@fontsource/dancing-script/700.css';
import { useAccess } from '../lib/access';
import { useRows } from '../hooks/data';
import { supabase } from '../lib/supabase';
import { friendly } from '../lib/errors';
import type { DayItem, Gift, GiftGiver, Guest, SeatingTable } from '../lib/types';
import { Filters, PageHeader } from '../components/ui';
import { FONT_PAIRS, FRAMES, ORNAMENTS, PALETTES, colors, normalizeTheme, type FontPairId, type PaletteId, type PrintTheme } from './print/theme';
import type { DocKind, DocOptions, PrintData } from './print/docs';

const DOCS: { kind: DocKind; label: string; hint: string }[] = [
  { kind: 'agenda', label: 'Wedding day schedule', hint: 'From the Wedding Day tab' },
  { kind: 'tables', label: 'Table number cards', hint: '5 × 7 in, one per table' },
  { kind: 'place', label: 'Place cards', hint: '3.5 × 2 in, 10 per sheet, with cut lines' },
  { kind: 'thanks', label: 'Thank-you notes', hint: 'From notes written on the Gifts tab' },
];

export default function Print() {
  const { wedding, isCouple } = useAccess();
  const qc = useQueryClient();
  const day = useRows<DayItem>('day_items', wedding.id, 'start_time');
  const tables = useRows<SeatingTable>('seating_tables', wedding.id, 'created_at');
  const guests = useRows<Guest>('guests', wedding.id, 'name');
  const gifts = useRows<Gift>('gifts', wedding.id, 'created_at');
  const givers = useRows<GiftGiver>('gift_givers', wedding.id, 'gift_id');

  const [kind, setKind] = useState<DocKind>('agenda');
  const [theme, setTheme] = useState<PrintTheme>(() => normalizeTheme(wedding.print_theme));
  const [opts, setOpts] = useState<DocOptions>({ agendaAudience: 'everyone', tableNames: false, thanksLayout: 'card' });
  const [notesWhich, setNotesWhich] = useState<'unsent' | 'all'>('unsent');
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const first = useRef(true);

  // Save the theme a second after changes, so every PDF uses it next time.
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = setTimeout(async () => {
      const { error } = await supabase.from('weddings').update({ print_theme: theme }).eq('id', wedding.id);
      setSaved(error ? 'Couldn’t save the design' : 'Design saved');
      if (!error) qc.invalidateQueries({ queryKey: ['access'] });
    }, 1000);
    return () => clearTimeout(t);
  }, [theme, wedding.id, qc]);

  const data: PrintData = useMemo(() => {
    const byGuest = Object.fromEntries((guests.data ?? []).map((g) => [g.id, g.name]));
    const notes = (gifts.data ?? [])
      .filter((g) => g.thank_you_text && (notesWhich === 'all' || g.thank_you_status !== 'sent'))
      .map((g) => ({
        id: g.id, text: g.thank_you_text!,
        to: [...(givers.data ?? []).filter((x) => x.gift_id === g.id).map((x) => byGuest[x.guest_id]), g.from_other].filter(Boolean).join(', '),
      }));
    return {
      wedding: { partner1: wedding.partner1, partner2: wedding.partner2, wedding_date: wedding.wedding_date, venue: wedding.venue },
      dayItems: (day.data ?? []).map((d) => ({ start_time: d.start_time, title: d.title, who: d.who, location: d.location, duration_min: d.duration_min, phase: d.phase, audience: d.audience })),
      tables: (tables.data ?? []).map((t) => ({ id: t.id, label: t.label, capacity: t.capacity })),
      guests: (guests.data ?? []).filter((g) => g.rsvp !== 'no').map((g) => ({ id: g.id, name: g.name, party_size: g.party_size, table_id: g.table_id })),
      notes,
    };
  }, [wedding, day.data, tables.data, guests.data, gifts.data, givers.data, notesWhich]);

  // Re-render the preview shortly after anything changes.
  useEffect(() => {
    let cancelled = false; let made: string | null = null;
    setBusy(true); setError('');
    const t = setTimeout(async () => {
      try {
        const { renderPdf } = await import('./print/render');
        const blob = await renderPdf(kind, data, theme, opts);
        if (cancelled) return;
        made = URL.createObjectURL(blob);
        setUrl((old) => { if (old) URL.revokeObjectURL(old); return made; });
      } catch (e) { if (!cancelled) setError(friendly(e)); }
      finally { if (!cancelled) setBusy(false); }
    }, 500);
    return () => { cancelled = true; clearTimeout(t); };
  }, [kind, data, theme, opts]);

  if (!isCouple) return <Navigate to={`/w/${wedding.id}`} replace />;
  const set = (p: Partial<PrintTheme>) => setTheme((t) => ({ ...t, ...p }));
  const c = colors(theme);
  const fileName = `${DOCS.find((d) => d.kind === kind)!.label.toLowerCase().replace(/\s+/g, '-')}-${wedding.partner1}-${wedding.partner2}.pdf`.toLowerCase();

  return (
    <>
      <PageHeader title="Print" sub="Design your printables once, then download any of them as a PDF" action={
        url && <a className="btn" href={url} download={fileName}>Download PDF</a>
      } />
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 360px) 1fr', gap: 16, alignItems: 'start' }} className="print-grid">
        <div>
          <div className="card">
            <h2 className="ct">What to print</h2>
            {DOCS.map((d) => (
              <button key={d.kind} type="button" className={`row click${kind === d.kind ? ' sel-row' : ''}`} onClick={() => setKind(d.kind)}
                style={{ width: '100%', font: 'inherit', textAlign: 'left', borderColor: kind === d.kind ? 'var(--blush-d)' : undefined }}>
                <span><span className="nm">{d.label}</span><span className="small muted" style={{ display: 'block' }}>{d.hint}</span></span>
              </button>
            ))}
            {kind === 'agenda' && (
              <div style={{ marginTop: 10 }}>
                <Filters value={opts.agendaAudience ?? 'everyone'} onChange={(v) => setOpts({ ...opts, agendaAudience: v })}
                  options={[{ value: 'everyone', label: 'For guests' }, { value: 'party', label: 'Wedding party' }, { value: 'full', label: 'Full (with couple-only)' }]} />
              </div>
            )}
            {kind === 'tables' && (
              <label className="small" style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <input type="checkbox" checked={!!opts.tableNames} onChange={(e) => setOpts({ ...opts, tableNames: e.target.checked })} /> List who sits at each table
              </label>
            )}
            {kind === 'thanks' && (
              <div style={{ marginTop: 10 }}>
                <Filters value={opts.thanksLayout ?? 'card'} onChange={(v) => setOpts({ ...opts, thanksLayout: v })}
                  options={[{ value: 'card', label: 'Card size (A2)' }, { value: 'sheet', label: '2 per sheet' }]} />
                <Filters value={notesWhich} onChange={setNotesWhich} options={[{ value: 'unsent', label: 'Not yet sent' }, { value: 'all', label: 'All with a note' }]} />
                <p className="small muted">{data.notes.length} note{data.notes.length === 1 ? '' : 's'} included.</p>
              </div>
            )}
          </div>

          <div className="card">
            <h2 className="ct">Design <span className="small muted" style={{ fontFamily: 'var(--sans)', fontWeight: 400 }}>{saved}</span></h2>
            <div className="field"><span>Fonts</span>
              <div className="g2" style={{ gap: 6 }}>
                {(Object.keys(FONT_PAIRS) as FontPairId[]).map((id) => {
                  const f = FONT_PAIRS[id];
                  return (
                    <button key={id} type="button" className={`vibe${theme.fonts === id ? ' on' : ''}`} onClick={() => set({ fonts: id })} style={{ padding: '10px 6px' }}>
                      <span style={{ display: 'block', fontFamily: `'${f.heading}', serif`, fontWeight: f.headingWeight,
                        fontSize: f.script ? '1.35rem' : f.caps ? '.82rem' : '1.05rem',
                        textTransform: f.caps ? 'uppercase' : undefined, letterSpacing: f.caps ? '.08em' : undefined, color: 'var(--ink)' }}>
                        {wedding.partner1} &amp; {wedding.partner2}
                      </span>
                      <small>{f.label}</small>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="field"><span>Colors</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {(Object.keys(PALETTES) as PaletteId[]).map((id) => {
                  const p = PALETTES[id];
                  return (
                    <button key={id} type="button" title={p.label} aria-label={p.label} aria-pressed={theme.palette === id}
                      onClick={() => set({ palette: id, accent: null })}
                      style={{ width: 46, height: 46, borderRadius: 12, border: theme.palette === id ? '2px solid var(--ink)' : '1px solid var(--border2)', background: p.bg, padding: 0, position: 'relative', overflow: 'hidden' }}>
                      <i style={{ position: 'absolute', left: 8, top: 10, width: 14, height: 14, borderRadius: '50%', background: p.accent }} />
                      <i style={{ position: 'absolute', left: 24, top: 22, width: 12, height: 12, borderRadius: '50%', background: p.soft }} />
                    </button>
                  );
                })}
              </div>
              <label className="small" style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
                Accent color <input type="color" value={c.accent} onChange={(e) => set({ accent: e.target.value })} style={{ width: 40, height: 28, border: 'none', background: 'none' }} />
                {theme.accent && <button className="btn g sm" onClick={() => set({ accent: null })}>Reset</button>}
              </label>
            </div>
            <div className="g2">
              <label className="field"><span>Ornament</span>
                <select value={theme.ornament} onChange={(e) => set({ ornament: e.target.value as PrintTheme['ornament'] })}>
                  {Object.entries(ORNAMENTS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
              <label className="field"><span>Border</span>
                <select value={theme.frame} onChange={(e) => set({ frame: e.target.value as PrintTheme['frame'] })}>
                  {Object.entries(FRAMES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
              <label className="field"><span>Paper</span>
                <select value={theme.paper} onChange={(e) => set({ paper: e.target.value as PrintTheme['paper'] })}>
                  <option value="letter">US Letter</option><option value="a4">A4</option>
                </select>
              </label>
              <label className="field" style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                <input type="checkbox" checked={theme.monogram} onChange={(e) => set({ monogram: e.target.checked })} />
                <span style={{ margin: 0 }}>Monogram ({wedding.partner1[0]} &amp; {wedding.partner2[0]})</span>
              </label>
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: 12, position: 'sticky', top: 130 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <b className="small">Preview</b>
            <span className="small muted">{busy ? 'Updating…' : 'Up to date'}</span>
          </div>
          {error && <p className="err">{error}</p>}
          {url ? <iframe title="PDF preview" src={`${url}#toolbar=0&view=FitH`} style={{ width: '100%', height: '78vh', border: '1px solid var(--border)', borderRadius: 12, background: '#fff' }} />
            : <p className="muted">Preparing preview…</p>}
          <p className="small muted" style={{ marginTop: 8 }}>Print at 100% (actual size) so cards come out the right size.</p>
        </div>
      </div>
    </>
  );
}
