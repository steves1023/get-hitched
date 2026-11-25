// Registers the PDF fonts with react-pdf. Font files come from the open-source Fontsource packages (SIL OFL).
import { Font } from '@react-pdf/renderer';

export type FontFiles = Record<string, { 400: string; 700?: string }>;
let done = false;

export function registerFonts(files: FontFiles) {
  if (done) return;
  for (const [family, f] of Object.entries(files)) {
    Font.register({ family, fonts: [{ src: f[400], fontWeight: 400 }, ...(f[700] ? [{ src: f[700], fontWeight: 700 as const }] : [])] });
  }
  Font.registerHyphenationCallback((word) => [word]);   // never hyphenate names or venues
  done = true;
}
