import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { friendly } from '../../lib/errors';
import type { Guest, Wedding } from '../../lib/types';
import { Drawer } from '../../components/ui';
import AddressInput, { type Address } from './AddressInput';

type Member = { id?: string; name: string; rsvp: Guest['rsvp']; dietary: string; remove?: boolean };
const EMPTY_ADDR: Address = { address1: '', address2: '', city: '', state: '', postal_code: '', country: '' };

export default function GuestEditor({ guest, isNew, head, members, standalone, wedding, onClose, onSaved }: {
  guest: Partial<Guest>; isNew: boolean;
  head: Guest | null;            // set when editing a family member
  members: Guest[];              // existing family members when editing a main guest
  standalone: Guest[];           // guests who could be moved into this family
  wedding: Wedding; onClose: () => void; onSaved: () => void;
}) {
  const isMember = !!head;
  const [v, setV] = useState({
    name: guest.name ?? '', side: guest.side ?? 'both', rsvp: guest.rsvp ?? 'pending', party_size: guest.party_size ?? 1,
    dietary: guest.dietary ?? '', email: guest.email ?? '', notes: guest.notes ?? '',
  });
  const [addr, setAddr] = useState<Address>({
    address1: guest.address1 ?? '', address2: guest.address2 ?? '', city: guest.city ?? '', state: guest.state ?? '',
    postal_code: guest.postal_code ?? '', country: guest.country ?? '',
  });
  const [fam, setFam] = useState<Member[]>(members.map((m) => ({ id: m.id, name: m.name, rsvp: m.rsvp, dietary: m.dietary ?? '' })));
  const [moveIn, setMoveIn] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const set = (p: Partial<typeof v>) => setV((x) => ({ ...x, ...p }));
  const setA = (p: Partial<Address>) => setAddr((x) => ({ ...x, ...p }));
  const nil = (s: string) => (s.trim() ? s.trim() : null);

  const save = async () => {
    if (!v.name.trim()) return setError('Add a name.');
    const removing = fam.filter((m) => m.remove && m.id);
    if (removing.length && !confirm(`Remove ${removing.map((m) => m.name).join(', ')} from the guest list?`)) return;
    setBusy(true); setError('');
    try {
      const row: Partial<Guest> = {
        name: v.name.trim(), side: v.side as Guest['side'], rsvp: v.rsvp as Guest['rsvp'], party_size: Math.max(1, Number(v.party_size) || 1),
        dietary: nil(v.dietary), email: nil(v.email), notes: nil(v.notes),
        ...(isMember ? {} : { address1: nil(addr.address1), address2: nil(addr.address2), city: nil(addr.city), state: nil(addr.state), postal_code: nil(addr.postal_code), country: nil(addr.country) }),
      };
      let id = guest.id;
      if (isNew) {
        const { data, error } = await supabase.from('guests').insert({ ...row, wedding_id: wedding.id, primary_guest_id: head?.id ?? null }).select().single();
        if (error) throw error; id = data.id;
      } else {
        const { error } = await supabase.from('guests').update(row).eq('id', id!); if (error) throw error;
      }
      if (!isMember) {
        for (const m of fam) {
          if (m.remove && m.id) { const { error } = await supabase.from('guests').delete().eq('id', m.id); if (error) throw error; continue; }
          if (m.remove || !m.name.trim()) continue;
          const mrow = { name: m.name.trim(), rsvp: m.rsvp, dietary: nil(m.dietary) };
          const { error } = m.id
            ? await supabase.from('guests').update(mrow).eq('id', m.id)
            : await supabase.from('guests').insert({ ...mrow, wedding_id: wedding.id, side: row.side, primary_guest_id: id, party_size: 1 });
          if (error) throw error;
        }
        if (moveIn) {
          const { error } = await supabase.from('guests').update({ primary_guest_id: id }).eq('id', moveIn); if (error) throw error;
        }
      }
      onSaved(); onClose();
    } catch (e) { setError(friendly(e)); } finally { setBusy(false); }
  };

  const del = async () => {
    const extra = !isMember && members.length ? ` Their ${members.length} family member${members.length > 1 ? 's' : ''} will stay on the list as separate guests.` : '';
    if (!confirm(`Delete ${guest.name}?${extra}`)) return;
    const { error } = await supabase.from('guests').delete().eq('id', guest.id!);
    if (error) return setError(friendly(error));
    onSaved(); onClose();
  };
  const separate = async () => {
    const { error } = await supabase.from('guests').update({ primary_guest_id: null }).eq('id', guest.id!);
    if (error) return setError(friendly(error));
    onSaved(); onClose();
  };

  const sideOpts = [['partner1', `${wedding.partner1}’s side`], ['partner2', `${wedding.partner2}’s side`], ['both', 'Both']];
  return (
    <Drawer open title={isNew ? (isMember ? `Add to ${head!.name}’s family` : 'Add guest') : `Edit ${guest.name}`} onClose={onClose} footer={
      <>
        {!isNew ? <button className="btn danger" disabled={busy} onClick={del}>Delete</button> : <span />}
        <button className="btn" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
      </>
    }>
      {isMember && (
        <div className="card" style={{ padding: 12, background: 'var(--sage-l)', borderColor: 'transparent' }}>
          <p className="small">Part of <b>{head!.name}</b>’s family and uses their address.</p>
          {!isNew && <button className="btn g sm" style={{ marginTop: 8 }} onClick={separate}>Make a separate guest</button>}
        </div>
      )}
      <label className="field"><span>Name *</span><input value={v.name} onChange={(e) => set({ name: e.target.value })} /></label>
      <div className="g2">
        {!isMember && <label className="field"><span>Side</span>
          <select value={v.side} onChange={(e) => set({ side: e.target.value as Guest['side'] })}>{sideOpts.map(([a, b]) => <option key={a} value={a}>{b}</option>)}</select>
        </label>}
        <label className="field"><span>RSVP</span>
          <select value={v.rsvp} onChange={(e) => set({ rsvp: e.target.value as Guest['rsvp'] })}>
            <option value="pending">Pending</option><option value="yes">Yes</option><option value="no">No</option>
          </select>
        </label>
        <label className="field"><span>Party size</span><input type="number" min={1} max={20} value={v.party_size} onChange={(e) => set({ party_size: Number(e.target.value) })} /></label>
        <label className="field"><span>Dietary needs</span><input value={v.dietary} onChange={(e) => set({ dietary: e.target.value })} /></label>
      </div>
      <p className="small muted" style={{ marginTop: -6, marginBottom: 10 }}>Party size counts unnamed plus-ones. Family members you name below are counted separately.</p>
      <label className="field"><span>Email</span><input type="email" value={v.email} onChange={(e) => set({ email: e.target.value })} /></label>

      {!isMember && (
        <fieldset style={{ border: 'none', marginBottom: 6 }}>
          <legend className="ct" style={{ fontSize: '1rem', marginBottom: 8 }}>Mailing address</legend>
          <label className="field"><span>Street</span>
            <AddressInput weddingId={wedding.id} value={addr.address1} onChange={(t) => setA({ address1: t })} onPick={(a) => setAddr({ ...EMPTY_ADDR, ...a })} />
          </label>
          <label className="field"><span>Apt, suite, unit</span><input value={addr.address2} onChange={(e) => setA({ address2: e.target.value })} /></label>
          <div className="g2">
            <label className="field"><span>City</span><input value={addr.city} onChange={(e) => setA({ city: e.target.value })} /></label>
            <label className="field"><span>State / region</span><input value={addr.state} onChange={(e) => setA({ state: e.target.value })} /></label>
            <label className="field"><span>ZIP / postal code</span><input value={addr.postal_code} onChange={(e) => setA({ postal_code: e.target.value })} /></label>
            <label className="field"><span>Country</span><input value={addr.country} onChange={(e) => setA({ country: e.target.value })} placeholder="US" /></label>
          </div>
        </fieldset>
      )}

      {!isMember && (
        <fieldset style={{ border: 'none', marginBottom: 6 }}>
          <legend className="ct" style={{ fontSize: '1rem', marginBottom: 4 }}>Family members</legend>
          <p className="small muted" style={{ marginBottom: 8 }}>People who live with {v.name || 'this guest'} share the address above.</p>
          {fam.map((m, i) => (
            <div key={m.id ?? `new${i}`} className="row" style={{ alignItems: 'center', gap: 6, padding: 8, opacity: m.remove ? 0.45 : 1 }}>
              <input className="input" style={{ flex: 2, padding: '6px 9px' }} placeholder="Name" value={m.name} disabled={m.remove}
                onChange={(e) => setFam((f) => f.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              <select value={m.rsvp} disabled={m.remove} style={{ padding: '6px', border: '1.5px solid var(--border)', borderRadius: 8, background: 'var(--ivory)', font: 'inherit', fontSize: '.8rem' }}
                onChange={(e) => setFam((f) => f.map((x, j) => (j === i ? { ...x, rsvp: e.target.value as Guest['rsvp'] } : x)))}>
                <option value="pending">Pending</option><option value="yes">Yes</option><option value="no">No</option>
              </select>
              <input className="input" style={{ flex: 1, padding: '6px 9px' }} placeholder="Dietary" value={m.dietary} disabled={m.remove}
                onChange={(e) => setFam((f) => f.map((x, j) => (j === i ? { ...x, dietary: e.target.value } : x)))} />
              <button type="button" className="x-btn" aria-label={m.remove ? `Keep ${m.name}` : `Remove ${m.name || 'member'}`}
                onClick={() => setFam((f) => (m.id ? f.map((x, j) => (j === i ? { ...x, remove: !x.remove } : x)) : f.filter((_, j) => j !== i)))}>
                {m.remove ? '↺' : '×'}
              </button>
            </div>
          ))}
          <button type="button" className="btn g sm" onClick={() => setFam((f) => [...f, { name: '', rsvp: v.rsvp as Guest['rsvp'], dietary: '' }])}>+ Add family member</button>
          {standalone.length > 0 && (
            <label className="field" style={{ marginTop: 10 }}><span>Or move someone already on the list into this family</span>
              <select value={moveIn} onChange={(e) => setMoveIn(e.target.value)}>
                <option value="">Choose a guest…</option>
                {standalone.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </label>
          )}
        </fieldset>
      )}

      <label className="field"><span>Notes</span><textarea value={v.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="How you know them, anything worth remembering" /></label>
      {error && <p className="err">{error}</p>}
    </Drawer>
  );
}
