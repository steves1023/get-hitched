// Font file URLs for the browser build (Vite turns each import into a hashed asset URL).
import pf4 from '@fontsource/playfair-display/files/playfair-display-latin-400-normal.woff?url';
import pf7 from '@fontsource/playfair-display/files/playfair-display-latin-700-normal.woff?url';
import la4 from '@fontsource/lato/files/lato-latin-400-normal.woff?url';
import la7 from '@fontsource/lato/files/lato-latin-700-normal.woff?url';
import gv4 from '@fontsource/great-vibes/files/great-vibes-latin-400-normal.woff?url';
import cg4 from '@fontsource/cormorant-garamond/files/cormorant-garamond-latin-400-normal.woff?url';
import cg7 from '@fontsource/cormorant-garamond/files/cormorant-garamond-latin-700-normal.woff?url';
import lb4 from '@fontsource/libre-baskerville/files/libre-baskerville-latin-400-normal.woff?url';
import lb7 from '@fontsource/libre-baskerville/files/libre-baskerville-latin-700-normal.woff?url';
import js4 from '@fontsource/josefin-sans/files/josefin-sans-latin-400-normal.woff?url';
import js7 from '@fontsource/josefin-sans/files/josefin-sans-latin-700-normal.woff?url';
import mo4 from '@fontsource/montserrat/files/montserrat-latin-400-normal.woff?url';
import mo7 from '@fontsource/montserrat/files/montserrat-latin-700-normal.woff?url';
import ds4 from '@fontsource/dancing-script/files/dancing-script-latin-400-normal.woff?url';
import ds7 from '@fontsource/dancing-script/files/dancing-script-latin-700-normal.woff?url';
import eb4 from '@fontsource/eb-garamond/files/eb-garamond-latin-400-normal.woff?url';
import eb7 from '@fontsource/eb-garamond/files/eb-garamond-latin-700-normal.woff?url';
import type { FontFiles } from './fonts';

export const BROWSER_FONTS: FontFiles = {
  'Playfair Display': { 400: pf4, 700: pf7 }, Lato: { 400: la4, 700: la7 }, 'Great Vibes': { 400: gv4 },
  'Cormorant Garamond': { 400: cg4, 700: cg7 }, 'Libre Baskerville': { 400: lb4, 700: lb7 },
  'Josefin Sans': { 400: js4, 700: js7 }, Montserrat: { 400: mo4, 700: mo7 },
  'Dancing Script': { 400: ds4, 700: ds7 }, 'EB Garamond': { 400: eb4, 700: eb7 },
};
