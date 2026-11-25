// The couple's print design. Saved on weddings.print_theme and shared by every PDF.

export type FontPairId = 'classic' | 'romantic' | 'garden' | 'rustic' | 'modern' | 'whimsical';
export type PaletteId = 'blush' | 'rustic' | 'gold' | 'garden' | 'coastal' | 'mono';
export type Ornament = 'none' | 'rule' | 'double' | 'sparkle' | 'sprig';
export type Frame = 'none' | 'thin' | 'double';
export type Paper = 'letter' | 'a4';

export interface PrintTheme {
  fonts: FontPairId; palette: PaletteId; accent: string | null;
  ornament: Ornament; frame: Frame; monogram: boolean; paper: Paper;
}

export const DEFAULT_THEME: PrintTheme = {
  fonts: 'classic', palette: 'blush', accent: null, ornament: 'sparkle', frame: 'thin', monogram: true, paper: 'letter',
};

export interface FontPair { label: string; heading: string; headingWeight: 400 | 700; body: string; caps?: boolean; script?: boolean }
export const FONT_PAIRS: Record<FontPairId, FontPair> = {
  classic:   { label: 'Classic',   heading: 'Playfair Display',  headingWeight: 700, body: 'Lato' },
  romantic:  { label: 'Romantic',  heading: 'Great Vibes',       headingWeight: 400, body: 'Cormorant Garamond', script: true },
  garden:    { label: 'Garden',    heading: 'Cormorant Garamond', headingWeight: 700, body: 'Montserrat' },
  rustic:    { label: 'Rustic',    heading: 'Libre Baskerville', headingWeight: 700, body: 'Josefin Sans' },
  modern:    { label: 'Modern',    heading: 'Montserrat',        headingWeight: 700, body: 'Lato', caps: true },
  whimsical: { label: 'Whimsical', heading: 'Dancing Script',    headingWeight: 700, body: 'EB Garamond', script: true },
};

export interface Palette { label: string; bg: string; ink: string; accent: string; soft: string; muted: string }
export const PALETTES: Record<PaletteId, Palette> = {
  blush:   { label: 'Blush & sage',  bg: '#FDFAF5', ink: '#1E1A14', accent: '#9E5E54', soft: '#8FAF8E', muted: '#8B7B66' },
  rustic:  { label: 'Rustic kraft',  bg: '#F3E9DA', ink: '#3B2A1A', accent: '#8A5A2B', soft: '#B8956A', muted: '#7A6650' },
  gold:    { label: 'Black & gold',  bg: '#FFFFFF', ink: '#111111', accent: '#B08D3C', soft: '#D9C38A', muted: '#6E6A60' },
  garden:  { label: 'Garden green',  bg: '#F7F9F4', ink: '#1F2A1F', accent: '#4D7050', soft: '#A7C4A0', muted: '#667766' },
  coastal: { label: 'Coastal blue',  bg: '#F7FAFC', ink: '#14263A', accent: '#2F6E8F', soft: '#9CC3D5', muted: '#5E7385' },
  mono:    { label: 'Modern mono',   bg: '#FFFFFF', ink: '#222222', accent: '#555555', soft: '#BBBBBB', muted: '#777777' },
};

export function colors(t: PrintTheme): Palette {
  const p = PALETTES[t.palette] ?? PALETTES.blush;
  return t.accent && /^#[0-9a-f]{6}$/i.test(t.accent) ? { ...p, accent: t.accent } : p;
}

export function normalizeTheme(raw: unknown): PrintTheme {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<PrintTheme>;
  return {
    fonts: r.fonts && r.fonts in FONT_PAIRS ? r.fonts : DEFAULT_THEME.fonts,
    palette: r.palette && r.palette in PALETTES ? r.palette : DEFAULT_THEME.palette,
    accent: typeof r.accent === 'string' && /^#[0-9a-f]{6}$/i.test(r.accent) ? r.accent : null,
    ornament: ['none', 'rule', 'double', 'sparkle', 'sprig'].includes(r.ornament as string) ? r.ornament! : DEFAULT_THEME.ornament,
    frame: ['none', 'thin', 'double'].includes(r.frame as string) ? r.frame! : DEFAULT_THEME.frame,
    monogram: typeof r.monogram === 'boolean' ? r.monogram : DEFAULT_THEME.monogram,
    paper: r.paper === 'a4' ? 'a4' : 'letter',
  };
}

export const ORNAMENTS: Record<Ornament, string> = { none: 'None', rule: 'Thin line', double: 'Double line', sparkle: 'Star ✦', sprig: 'Leaf sprig' };
export const FRAMES: Record<Frame, string> = { none: 'No border', thin: 'Thin border', double: 'Double border' };
