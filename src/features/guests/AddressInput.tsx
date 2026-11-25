import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';

export interface Address { address1: string; address2: string; city: string; state: string; postal_code: string; country: string }
type Suggestion = { id: string; main: string; secondary: string };

let lookupOff = false;   // set once the server says no Google key is configured

/** Street line that suggests full addresses from Google as you type. Picking one fills every field. */
export default function AddressInput({ weddingId, value, onChange, onPick }: {
  weddingId: string; value: string; onChange: (v: string) => void; onPick: (a: Address) => void;
}) {
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [note, setNote] = useState('');
  const session = useRef<string>(crypto.randomUUID());
  const typed = useRef(false);

  useEffect(() => {
    if (!typed.current || lookupOff || value.trim().length < 3) { setItems([]); return; }
    const t = setTimeout(async () => {
      const { data, error } = await supabase.functions.invoke('address-lookup', {
        body: { wedding_id: weddingId, action: 'suggest', input: value, session: session.current },
      });
      if (error) {
        const body = await (error as { context?: Response }).context?.json?.().catch(() => null);
        if (body?.error === 'ADDRESS_LOOKUP_OFF') { lookupOff = true; setNote('Address suggestions aren’t set up yet. Type the address in.'); }
        else setNote(`Address suggestions aren’t working right now${body?.error ? ` (${body.error})` : ''}. Type the address in, or try again.`);
        setItems([]); return;
      }
      setNote('');
      setItems(data.suggestions ?? []); setActive(-1); setOpen(true);
      if (!(data.suggestions ?? []).length && value.trim().length >= 6) setNote('No matches yet. Keep typing the street address.');
    }, 250);
    return () => clearTimeout(t);
  }, [value, weddingId]);

  const pick = async (s: Suggestion) => {
    setOpen(false); setItems([]); typed.current = false;
    const { data } = await supabase.functions.invoke('address-lookup', {
      body: { wedding_id: weddingId, action: 'details', place_id: s.id, session: session.current },
    });
    session.current = crypto.randomUUID();   // one Google session per chosen address
    if (data?.address) onPick(data.address as Address); else onChange(s.main);
  };

  return (
    <div style={{ position: 'relative' }}>
      <input value={value} autoComplete="off" placeholder="Start typing an address"
        role="combobox" aria-expanded={open && items.length > 0} aria-autocomplete="list"
        onChange={(e) => { typed.current = true; onChange(e.target.value); }}
        onFocus={() => items.length && setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!open || !items.length) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(items.length - 1, a + 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
          if (e.key === 'Enter' && active >= 0) { e.preventDefault(); pick(items[active]); }
          if (e.key === 'Escape') setOpen(false);
        }} />
      {open && items.length > 0 && (
        <ul role="listbox" className="addr-list">
          {items.map((s, i) => (
            <li key={s.id} role="option" aria-selected={i === active} className={i === active ? 'on' : ''}
              onMouseDown={(e) => { e.preventDefault(); pick(s); }}>
              <b>{s.main}</b> <span className="muted">{s.secondary}</span>
            </li>
          ))}
          <li className="addr-credit" aria-hidden>Suggestions by Google</li>
        </ul>
      )}
      {note && <span className="small muted" style={{ display: 'block', marginTop: 4, textTransform: 'none', letterSpacing: 0 }}>{note}</span>}
    </div>
  );
}
