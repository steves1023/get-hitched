// POST { wedding_id, action: 'suggest', input, session }  -> { suggestions: [{ id, main, secondary }] }
// POST { wedding_id, action: 'details', place_id, session } -> { address: { address1, address2, city, state, postal_code, country } }
// Google Places API (New). The key stays on the server; the browser only sees suggestions.
import { corsHeaders, json, withErrors } from '../_shared/cors.ts';
import { requireUser } from '../_shared/clients.ts';

Deno.serve(withErrors(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const auth = await requireUser(req);
  if (!auth) return json({ error: 'NOT_SIGNED_IN' }, 401);

  const key = Deno.env.get('GOOGLE_PLACES_API_KEY');
  if (!key) return json({ error: 'ADDRESS_LOOKUP_OFF' }, 501);

  const { wedding_id, action, input, place_id, session } = await req.json().catch(() => ({}));
  if (!wedding_id) return json({ error: 'BAD_REQUEST' }, 400);
  const { data: level } = await auth.supa.rpc('my_access', { w: wedding_id, m: 'guests' });
  if (level !== 'edit') return json({ error: 'NOT_ALLOWED' }, 403);
  const sessionToken = typeof session === 'string' && /^[\w-]{8,64}$/.test(session) ? session : undefined;

  if (action === 'suggest') {
    const text = typeof input === 'string' ? input.trim().slice(0, 200) : '';
    if (text.length < 3) return json({ suggestions: [] });
    const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key },
      body: JSON.stringify({ input: text, sessionToken, includedPrimaryTypes: ['street_address', 'premise', 'subpremise'] }),
    });
    if (!res.ok) {
      const detail = await res.text();
      console.error('Places autocomplete', res.status, detail);
      const status = (() => { try { return JSON.parse(detail).error?.status as string | undefined; } catch { return undefined; } })();
      return json({ error: status ? `GOOGLE_${status}` : 'ADDRESS_LOOKUP_FAILED' }, 502);
    }
    const data = await res.json();
    const suggestions = (data.suggestions ?? [])
      .map((s: { placePrediction?: { placeId: string; text?: { text: string }; structuredFormat?: { mainText?: { text: string }; secondaryText?: { text: string } } } }) => s.placePrediction)
      .filter(Boolean)
      .slice(0, 5)
      .map((p: { placeId: string; text?: { text: string }; structuredFormat?: { mainText?: { text: string }; secondaryText?: { text: string } } }) => ({
        id: p.placeId,
        main: p.structuredFormat?.mainText?.text ?? p.text?.text ?? '',
        secondary: p.structuredFormat?.secondaryText?.text ?? '',
      }));
    return json({ suggestions });
  }

  if (action === 'details') {
    if (typeof place_id !== 'string' || !/^[\w-]{10,300}$/.test(place_id)) return json({ error: 'BAD_REQUEST' }, 400);
    const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(place_id)}${sessionToken ? `?sessionToken=${sessionToken}` : ''}`;
    const res = await fetch(url, { headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'addressComponents,formattedAddress' } });
    if (!res.ok) { console.error('Places details', res.status, await res.text()); return json({ error: 'ADDRESS_LOOKUP_FAILED' }, 502); }
    const place = await res.json();
    return json({ address: toAddress(place.addressComponents ?? []) });
  }

  return json({ error: 'BAD_REQUEST' }, 400);
}));

type Part = { longText?: string; shortText?: string; types?: string[] };
function toAddress(parts: Part[]) {
  const get = (type: string, short = false) => {
    const p = parts.find((x) => x.types?.includes(type));
    return (short ? p?.shortText : p?.longText) ?? '';
  };
  const street = [get('street_number'), get('route')].filter(Boolean).join(' ');
  return {
    address1: street || get('premise'),
    address2: get('subpremise') ? `Unit ${get('subpremise')}` : '',
    city: get('locality') || get('postal_town') || get('sublocality_level_1') || get('administrative_area_level_2'),
    state: get('administrative_area_level_1', true),
    postal_code: [get('postal_code'), get('postal_code_suffix')].filter(Boolean).join('-'),
    country: get('country', true),
  };
}
