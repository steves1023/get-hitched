// PDF layouts. Pure functions of (data, theme, options) so the same code renders in the browser and in tests.
import { Document, Page, Path, Rect, Svg, Line, Text, View } from '@react-pdf/renderer';
import type { ReactElement } from 'react';
import { FONT_PAIRS, colors, type PrintTheme } from './theme';

export type DocKind = 'agenda' | 'tables' | 'place' | 'thanks';
export interface PrintData {
  wedding: { partner1: string; partner2: string; wedding_date: string | null; venue: string | null };
  dayItems: { start_time: string; title: string; who: string | null; location: string | null; duration_min: number | null; phase: string; audience: string }[];
  tables: { id: string; label: string; capacity: number }[];
  guests: { id: string; name: string; party_size: number; table_id: string | null }[];
  notes: { id: string; text: string; to: string }[];
}
export interface DocOptions {
  agendaAudience?: 'everyone' | 'party' | 'full';
  tableNames?: boolean;
  thanksLayout?: 'card' | 'sheet';
}

const IN = 72;
const PHASES: Record<string, string> = { morning_prep: 'Morning', getting_ready: 'Getting ready', ceremony: 'Ceremony', reception: 'Reception' };

function time12(t: string) {
  const [h, m] = t.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}
function longDate(d: string) {
  const [y, m, day] = d.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function useStyle(theme: PrintTheme) {
  const c = colors(theme); const f = FONT_PAIRS[theme.fonts];
  const heading = (size: number, color = c.ink) => ({
    fontFamily: f.heading, fontWeight: f.headingWeight, fontSize: f.script ? size * 1.3 : size, color,
    ...(f.caps ? { textTransform: 'uppercase' as const, letterSpacing: size * 0.12 } : {}),
  });
  const body = (size: number, color = c.ink, weight: 400 | 700 = 400) => ({ fontFamily: f.body, fontWeight: weight, fontSize: size, color });
  return { c, f, heading, body };
}

function Frame({ theme, inset = 18 }: { theme: PrintTheme; inset?: number }) {
  const { c } = useStyle(theme);
  if (theme.frame === 'none') return null;
  const box = (i: number, w: number) => <View fixed style={{ position: 'absolute', top: i, left: i, right: i, bottom: i, borderWidth: w, borderColor: c.accent }} />;
  return theme.frame === 'double' ? <>{box(inset, 1.2)}{box(inset + 4, 0.5)}</> : box(inset, 0.8);
}

/** Border drawn as vector rectangles: reliable on small cards. */
function CardFrame({ theme, w, h, inset }: { theme: PrintTheme; w: number; h: number; inset: number }) {
  const { c } = useStyle(theme);
  if (theme.frame === 'none') return null;
  return (
    <Svg width={w} height={h} style={{ position: 'absolute', top: 0, left: 0 }}>
      <Rect x={inset} y={inset} width={w - inset * 2} height={h - inset * 2} fill="none" stroke={c.accent} strokeWidth={theme.frame === 'double' ? 1 : 0.7} />
      {theme.frame === 'double' && <Rect x={inset + 3.5} y={inset + 3.5} width={w - inset * 2 - 7} height={h - inset * 2 - 7} fill="none" stroke={c.accent} strokeWidth={0.45} />}
    </Svg>
  );
}

export function Ornament({ theme, width = 120 }: { theme: PrintTheme; width?: number }) {
  const { c } = useStyle(theme);
  const h = 16, mid = h / 2, cx = width / 2;
  if (theme.ornament === 'none') return <View style={{ height: 8 }} />;
  return (
    <View style={{ alignItems: 'center', marginVertical: 6 }}>
      <Svg width={width} height={h} viewBox={`0 0 ${width} ${h}`}>
        {theme.ornament === 'rule' && <Line x1={cx - 40} y1={mid} x2={cx + 40} y2={mid} stroke={c.accent} strokeWidth={0.8} />}
        {theme.ornament === 'double' && <>
          <Line x1={cx - 40} y1={mid - 1.8} x2={cx + 40} y2={mid - 1.8} stroke={c.accent} strokeWidth={0.6} />
          <Line x1={cx - 40} y1={mid + 1.8} x2={cx + 40} y2={mid + 1.8} stroke={c.accent} strokeWidth={0.6} />
        </>}
        {theme.ornament === 'sparkle' && <>
          <Line x1={cx - 44} y1={mid} x2={cx - 12} y2={mid} stroke={c.accent} strokeWidth={0.6} />
          <Line x1={cx + 12} y1={mid} x2={cx + 44} y2={mid} stroke={c.accent} strokeWidth={0.6} />
          <Path fill={c.accent} d={`M${cx} ${mid - 7} C${cx + 1.2} ${mid - 1.2} ${cx + 1.2} ${mid - 1.2} ${cx + 7} ${mid} C${cx + 1.2} ${mid + 1.2} ${cx + 1.2} ${mid + 1.2} ${cx} ${mid + 7} C${cx - 1.2} ${mid + 1.2} ${cx - 1.2} ${mid + 1.2} ${cx - 7} ${mid} C${cx - 1.2} ${mid - 1.2} ${cx - 1.2} ${mid - 1.2} ${cx} ${mid - 7} Z`} />
        </>}
        {theme.ornament === 'sprig' && <>
          <Line x1={cx - 36} y1={mid} x2={cx + 36} y2={mid} stroke={c.soft} strokeWidth={0.8} />
          {[-28, -18, -8, 2, 12, 22].map((x, i) => (
            <Path key={i} fill={i % 2 ? c.soft : c.accent} fillOpacity={0.9}
              d={i % 2 ? `M${cx + x} ${mid} Q${cx + x + 4} ${mid + 7} ${cx + x + 9} ${mid + 1} Q${cx + x + 4} ${mid + 2} ${cx + x} ${mid} Z`
                        : `M${cx + x} ${mid} Q${cx + x + 4} ${mid - 7} ${cx + x + 9} ${mid - 1} Q${cx + x + 4} ${mid - 2} ${cx + x} ${mid} Z`} />
          ))}
        </>}
      </Svg>
    </View>
  );
}

function Monogram({ theme, data, size = 14 }: { theme: PrintTheme; data: PrintData; size?: number }) {
  const { heading, c } = useStyle(theme);
  if (!theme.monogram) return null;
  const i = (s: string) => (s.trim()[0] ?? '').toUpperCase();
  return <Text style={{ ...heading(size, c.accent), textAlign: 'center', marginBottom: 6 }}>{i(data.wedding.partner1)} &amp; {i(data.wedding.partner2)}</Text>;
}

const pageSize = (t: PrintTheme) => (t.paper === 'a4' ? 'A4' : 'LETTER');

// ---------- Wedding day agenda ----------
function Agenda({ data, theme, opts }: { data: PrintData; theme: PrintTheme; opts: DocOptions }) {
  const { c, heading, body } = useStyle(theme);
  const aud = opts.agendaAudience ?? 'everyone';
  const items = data.dayItems
    .filter((d) => aud === 'full' || d.audience === 'everyone' || (aud === 'party' && d.audience === 'wedding_party'))
    .sort((a, b) => a.start_time.localeCompare(b.start_time));
  const phases = Object.keys(PHASES).filter((p) => items.some((i) => i.phase === p));
  const w = data.wedding;
  return (
    <Page size={pageSize(theme)} style={{ backgroundColor: c.bg, paddingVertical: 64, paddingHorizontal: 72 }}>
      <Frame theme={theme} />
      <Monogram theme={theme} data={data} />
      <Text style={{ ...heading(30), textAlign: 'center' }}>{w.partner1} &amp; {w.partner2}</Text>
      <Text style={{ ...body(10, c.muted), textAlign: 'center', marginTop: 6, letterSpacing: 1.2 }}>
        {[w.wedding_date ? longDate(w.wedding_date) : null, w.venue].filter(Boolean).join('  ·  ')}
      </Text>
      <Ornament theme={theme} />
      <Text style={{ ...heading(15, c.accent), textAlign: 'center', marginBottom: 18 }}>
        {aud === 'party' ? 'Wedding party schedule' : aud === 'full' ? 'Full schedule' : 'Schedule of the day'}
      </Text>
      {items.length === 0 && <Text style={{ ...body(11, c.muted), textAlign: 'center' }}>No items yet. Add them on the Wedding Day tab.</Text>}
      {phases.map((p) => (
        <View key={p} style={{ marginBottom: 12 }}>
          <Text style={{ ...body(8.5, c.accent, 700), letterSpacing: 1.6, textTransform: 'uppercase', marginBottom: 6 }}>{PHASES[p]}</Text>
          {items.filter((i) => i.phase === p).map((i, k) => (
            <View key={k} wrap={false} style={{ flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: c.soft }}>
              <Text style={{ ...body(10.5, c.accent, 700), width: 72 }}>{time12(i.start_time)}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ ...body(11, c.ink, 700) }}>{i.title}</Text>
                {(i.location || i.who || i.duration_min) && (
                  <Text style={{ ...body(9, c.muted), marginTop: 2 }}>
                    {[i.location, i.who, i.duration_min ? `${i.duration_min} min` : null].filter(Boolean).join('  ·  ')}
                  </Text>
                )}
              </View>
            </View>
          ))}
        </View>
      ))}
      <Text fixed style={{ ...body(8, c.muted), position: 'absolute', bottom: 34, left: 0, right: 0, textAlign: 'center' }}
        render={({ pageNumber, totalPages }) => (totalPages > 1 ? `${pageNumber} of ${totalPages}` : '')} />
    </Page>
  );
}

// ---------- Table number cards (5 x 7 in) ----------
function TableCards({ data, theme, opts }: { data: PrintData; theme: PrintTheme; opts: DocOptions }) {
  const { c, heading, body } = useStyle(theme);
  const tables = data.tables;
  if (!tables.length) return <Page size={[5 * IN, 7 * IN]} style={{ backgroundColor: c.bg, padding: 48 }}><Text style={body(12, c.muted)}>Add tables on the Seating tab first.</Text></Page>;
  return (
    <>
      {tables.map((t) => {
        const m = t.label.match(/^table\s+(.+)$/i);
        const seated = data.guests.filter((g) => g.table_id === t.id);
        return (
          <Page key={t.id} size={[5 * IN, 7 * IN]} style={{ backgroundColor: c.bg, padding: 44, justifyContent: 'center', alignItems: 'center' }}>
            <Frame theme={theme} inset={14} />
            <Monogram theme={theme} data={data} size={12} />
            {m ? <>
              <Text style={{ ...body(11, c.muted), letterSpacing: 3, textTransform: 'uppercase' }}>Table</Text>
              <Text style={{ ...heading(m[1].length > 3 ? 48 : 96, c.accent), textAlign: 'center' }}>{m[1]}</Text>
            </> : <Text style={{ ...heading(36, c.accent), textAlign: 'center' }}>{t.label}</Text>}
            <Ornament theme={theme} width={110} />
            {opts.tableNames && seated.length > 0 && (
              <View style={{ marginTop: 6, alignItems: 'center' }}>
                {seated.map((g) => (
                  <Text key={g.id} style={{ ...body(seated.length > 10 ? 9 : 10.5, c.ink), marginBottom: 2 }}>
                    {g.name}{g.party_size === 2 ? ' & Guest' : g.party_size > 2 ? ` + ${g.party_size - 1}` : ''}
                  </Text>
                ))}
              </View>
            )}
          </Page>
        );
      })}
    </>
  );
}

// ---------- Escort / place cards: 3.5 x 2 in, 10 per sheet with cut lines ----------
function PlaceCards({ data, theme }: { data: PrintData; theme: PrintTheme }) {
  const { c, heading, body } = useStyle(theme);
  const label = (id: string | null) => data.tables.find((t) => t.id === id)?.label ?? '';
  const seated = data.guests.filter((g) => g.table_id).sort((a, b) => a.name.localeCompare(b.name));
  const [pw, ph] = theme.paper === 'a4' ? [595, 842] : [612, 792];
  const cw = 3.5 * IN, ch = 2 * IN, cols = 2, rows = 5;
  const mx = (pw - cw * cols) / 2, my = (ph - ch * rows) / 2;
  const pages: (typeof seated)[] = [];
  for (let i = 0; i < seated.length; i += cols * rows) pages.push(seated.slice(i, i + cols * rows));
  if (!pages.length) return <Page size={pageSize(theme)} style={{ backgroundColor: c.bg, padding: 72 }}><Text style={body(12, c.muted)}>Seat guests on the Seating tab first.</Text></Page>;
  return (
    <>
      {pages.map((page, pi) => (
        <Page key={pi} size={pageSize(theme)} style={{ backgroundColor: '#FFFFFF' }}>
          {page.map((g, i) => (
            <View key={g.id} style={{ position: 'absolute', left: mx + (i % cols) * cw, top: my + Math.floor(i / cols) * ch, width: cw, height: ch,
              backgroundColor: c.bg, justifyContent: 'center', alignItems: 'center', padding: 10 }}>
              <Text style={{ ...heading(g.name.length > 22 ? 14 : 18), textAlign: 'center' }}>
                {g.name}{g.party_size === 2 ? ' & Guest' : ''}
              </Text>
              <Text style={{ ...body(9, c.accent, 700), letterSpacing: 2, textTransform: 'uppercase', marginTop: 6 }}>{label(g.table_id)}</Text>
            </View>
          ))}
          <Svg width={pw} height={ph} style={{ position: 'absolute', top: 0, left: 0 }}>
            {Array.from({ length: cols + 1 }, (_, i) => <Line key={`v${i}`} x1={mx + i * cw} y1={my - 14} x2={mx + i * cw} y2={my + rows * ch + 14} stroke="#BBBBBB" strokeWidth={0.4} strokeDasharray="3 3" />)}
            {Array.from({ length: rows + 1 }, (_, i) => <Line key={`h${i}`} x1={mx - 14} y1={my + i * ch} x2={mx + cols * cw + 14} y2={my + i * ch} stroke="#BBBBBB" strokeWidth={0.4} strokeDasharray="3 3" />)}
            {theme.frame !== 'none' && page.map((_, i) => (
              <Rect key={`f${i}`} x={mx + (i % cols) * cw + 7} y={my + Math.floor(i / cols) * ch + 7} width={cw - 14} height={ch - 14}
                fill="none" stroke={c.accent} strokeWidth={theme.frame === 'double' ? 0.9 : 0.6} />
            ))}
          </Svg>
        </Page>
      ))}
    </>
  );
}

// ---------- Thank-you notes: A2 cards (5.5 x 4.25 in), or two per sheet ----------
function NoteCard({ note, data, theme }: { note: PrintData['notes'][number]; data: PrintData; theme: PrintTheme }) {
  const { c, body } = useStyle(theme);
  const size = note.text.length > 1000 ? 8 : note.text.length > 700 ? 9 : 10.5;
  return (
    <View style={{ width: 5.5 * IN, height: 4.25 * IN, backgroundColor: c.bg, paddingVertical: 26, paddingHorizontal: 34, position: 'relative', justifyContent: 'center' }}>
      <CardFrame theme={theme} w={5.5 * IN} h={4.25 * IN} inset={10} />
      <Monogram theme={theme} data={data} size={11} />
      {note.text.split(/\n+/).map((p, i) => <Text key={i} style={{ ...body(size, c.ink), lineHeight: 1.45, marginBottom: 5 }}>{p}</Text>)}
    </View>
  );
}

function ThankYous({ data, theme, opts }: { data: PrintData; theme: PrintTheme; opts: DocOptions }) {
  const { c, body } = useStyle(theme);
  if (!data.notes.length) return <Page size={[5.5 * IN, 4.25 * IN]} style={{ backgroundColor: c.bg, padding: 36 }}><Text style={body(11, c.muted)}>Write thank-you notes on the Gifts tab first.</Text></Page>;
  if (opts.thanksLayout === 'sheet') {
    const pairs: (typeof data.notes)[] = [];
    for (let i = 0; i < data.notes.length; i += 2) pairs.push(data.notes.slice(i, i + 2));
    return (
      <>
        {pairs.map((pair, i) => (
          <Page key={i} size={pageSize(theme)} style={{ backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
            <NoteCard note={pair[0]} data={data} theme={theme} />
            <Svg width={5.5 * IN + 40} height={14}><Line x1={0} y1={7} x2={5.5 * IN + 40} y2={7} stroke="#BBBBBB" strokeWidth={0.4} strokeDasharray="3 3" /></Svg>
            {pair[1] ? <NoteCard note={pair[1]} data={data} theme={theme} /> : <View style={{ width: 5.5 * IN, height: 4.25 * IN }} />}
          </Page>
        ))}
      </>
    );
  }
  return <>{data.notes.map((n) => (
    <Page key={n.id} size={[5.5 * IN, 4.25 * IN]} style={{ backgroundColor: c.bg }}><NoteCard note={n} data={data} theme={theme} /></Page>
  ))}</>;
}

export function buildDoc(kind: DocKind, data: PrintData, theme: PrintTheme, opts: DocOptions): ReactElement {
  const title = { agenda: 'Wedding day schedule', tables: 'Table cards', place: 'Place cards', thanks: 'Thank-you notes' }[kind];
  return (
    <Document title={`${title} · ${data.wedding.partner1} & ${data.wedding.partner2}`} author="Get Hitched" creator="Get Hitched">
      {kind === 'agenda' && <Agenda data={data} theme={theme} opts={opts} />}
      {kind === 'tables' && <TableCards data={data} theme={theme} opts={opts} />}
      {kind === 'place' && <PlaceCards data={data} theme={theme} />}
      {kind === 'thanks' && <ThankYous data={data} theme={theme} opts={opts} />}
    </Document>
  );
}
