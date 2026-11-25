// Loaded on demand from the Print tab so react-pdf only downloads when it's needed.
import { pdf } from '@react-pdf/renderer';
import { registerFonts } from './fonts';
import { BROWSER_FONTS } from './fonts-browser';
import { buildDoc, type DocKind, type DocOptions, type PrintData } from './docs';
import type { PrintTheme } from './theme';

export async function renderPdf(kind: DocKind, data: PrintData, theme: PrintTheme, opts: DocOptions): Promise<Blob> {
  registerFonts(BROWSER_FONTS);
  return pdf(buildDoc(kind, data, theme, opts)).toBlob();
}
