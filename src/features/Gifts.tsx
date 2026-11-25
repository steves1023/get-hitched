import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAccess } from '../lib/access';
import { useRows, useTableMutations } from '../hooks/data';
import { supabase } from '../lib/supabase';
import { friendly, functionError } from '../lib/errors';
import { longDate, money } from '../lib/format';
import { GIFT_KINDS, OCCASIONS, type Gift, type GiftGiver, type Guest } from '../lib/types';
import { Badge, Drawer, Empty, ErrorNote, Filters, Loading, PageHeader, Stat, useToast } from '../components/ui';

type Filter = 'all' | 'todo' | 'sent';
const STATUS = { none: { label: 'Thank-you to write', tone: 'br' }, drafted: { label: 'Drafted', tone: 'bg' }, sent: { label: 'Thanked', tone: 'bs' } } as const;
const MONEY_KINDS = ['cash', 'check', 'gift_card'];

export default function Gifts() {
  const { wedding, levels } = useAccess();
  const qc = useQueryClient();
  const canEdit = levels.gifts === 'edit';
  const gifts = useRows<Gift>('gifts', wedding.id, 'created_at', false);
  const givers = useRows<GiftGiver>('gift_givers', wedding.id, 'gift_id');
  const guests = useRows<Guest>('guests', wedding.id, 'name', true, levels.guests !== 'none');
  const m = useTableMutations<Gift>('gifts', wedding.id);
  const [filter, setFilter] = useState<Filter>('all');
  const [editing, setEditing] = useState<Partial<Gift> | null>(null);
  const [thanking, setThanking] = useState<Gift | null>(null);

  const guestById = useMemo(() => Object.fromEntries((guests.data ?? []).map((g) => [g.id, g])), [guests.data]);
  const giverIds = (giftId: string) => (givers.data ?? []).filter((x) => x.gift_id === giftId).map((x) => x.guest_id);
  const fromLabel = (g: Gift) => {
    const names = giverIds(g.id).map((id) => guestById[id]?.name).filter(Boolean) as string[];
    if (g.from_other) names.push(g.from_other);
    return names.length ? names.join(', ') : 'Giver not set';
  };
  const all = gifts.data ?? [];
  const list = all.filter((g) => filter === 'all' || (filter === 'sent' ? g.thank_you_status === 'sent' : g.thank_you_status !== 'sent'));
  const refreshGivers = () => qc.invalidateQueries({ queryKey: ['gift_givers', wedding.id] });

  return (
    <>
      <PageHeader title="Gifts" sub="Who gave what, and who you’ve thanked"
        action={canEdit && <button className="btn" onClick={() => setEditing({ kind: 'registry', occasion: 'wedding' })}>+ Log gift</button>} />
      <div className="g3" style={{ marginBottom: 14 }}>
        <Stat value={all.length} label="Gifts received" />
        <Stat value={all.filter((g) => g.thank_you_status !== 'sent').length} label="Thank-yous to send" color="var(--blush-d)" />
        <Stat value={all.filter((g) => g.thank_you_status === 'sent').length} label="Thanked" color="var(--sage-d)" />
      </div>
      <Filters<Filter> value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'todo', label: 'Needs a thank-you' }, { value: 'sent', label: 'Thanked' }]} />
      {gifts.isLoading ? <Loading /> : gifts.error ? <ErrorNote error={gifts.error} /> : list.length === 0 ? (
        <Empty action={canEdit && all.length === 0 && <button className="btn" onClick={() => setEditing({ kind: 'registry', occasion: 'wedding' })}>Log your first gift</button>}>
          {all.length ? 'Nothing here for this filter.' : 'Log gifts as they arrive, link them to the guests who gave them, and draft thank-you notes in one click.'}
        </Empty>
      ) : list.map((g) => (
        <div className="row" key={g.id} style={{ alignItems: 'center' }}>
          <div style={{ flex: 1, cursor: canEdit ? 'pointer' : 'default' }} onClick={() => canEdit && setEditing(g)}>
            <div className="nm">{g.description}</div>
            <div className="small" style={{ color: 'var(--warm)' }}>From {fromLabel(g)}</div>
            <div className="chips">
              <Badge>{GIFT_KINDS[g.kind]}</Badge>
              <Badge tone="bw">{OCCASIONS[g.occasion]}</Badge>
              {g.amount != null && <Badge tone="bg">{money(g.amount)}</Badge>}
              {g.received_on && <span className="small muted">{longDate(g.received_on)}</span>}
              <Badge tone={STATUS[g.thank_you_status].tone}>{STATUS[g.thank_you_status].label}{g.thank_you_status === 'sent' && g.thank_you_sent_on ? ` ${longDate(g.thank_you_sent_on)}` : ''}</Badge>
            </div>
          </div>
          {canEdit && <button className="btn g sm" onClick={() => setThanking(g)}>{g.thank_you_text ? 'Thank-you note' : '✨ Write thank-you'}</button>}
        </div>
      ))}

      <GiftDrawer gift={editing} guests={(guests.data ?? []).filter((g) => !g.couple_role)} initialGivers={editing?.id ? giverIds(editing.id) : []}
        onClose={() => setEditing(null)}
        onSave={async (row, giverList) => {
          const saved = editing?.id ? await m.update.mutateAsync({ id: editing.id, ...row }) : await m.insert.mutateAsync(row);
          const { error: delErr } = await supabase.from('gift_givers').delete().eq('gift_id', saved.id);
          if (delErr) throw delErr;
          if (giverList.length) {
            const { error } = await supabase.from('gift_givers').insert(giverList.map((guest_id) => ({ gift_id: saved.id, guest_id, wedding_id: wedding.id })));
            if (error) throw error;
          }
          refreshGivers();
        }}
        onDelete={editing?.id ? async () => { await m.remove.mutateAsync(editing.id!); refreshGivers(); } : undefined} />

      <ThankYouDrawer gift={thanking} weddingId={wedding.id}
        givers={thanking ? giverIds(thanking.id).map((id) => guestById[id]).filter(Boolean) as Guest[] : []}
        onClose={() => setThanking(null)}
        onSave={async (patch) => { await m.update.mutateAsync({ id: thanking!.id, ...patch }); }} />
    </>
  );
}

function GiftDrawer({ gift, guests, initialGivers, onClose, onSave, onDelete }: {
  gift: Partial<Gift> | null; guests: Guest[]; initialGivers: string[]; onClose: () => void;
  onSave: (row: Partial<Gift>, givers: string[]) => Promise<void>; onDelete?: () => Promise<void>;
}) {
  const [v, setV] = useState<Partial<Gift>>({}); const [picked, setPicked] = useState<string[]>([]);
  const [search, setSearch] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [key, setKey] = useState<string | null>(null);
  const k = gift ? gift.id ?? 'new' : null;
  if (k !== key) { setKey(k); if (gift) { setV(gift); setPicked(initialGivers); setSearch(''); setError(''); } }
  if (!gift) return null;
  const set = (patch: Partial<Gift>) => setV((x) => ({ ...x, ...patch }));
  const shown = guests.filter((g) => picked.includes(g.id) || g.name.toLowerCase().includes(search.trim().toLowerCase()));

  const save = async () => {
    if (!v.description?.trim()) return setError('Describe the gift.');
    if (!picked.length && !v.from_other?.trim()) return setError('Choose who gave it, or fill in “Also from.”');
    setBusy(true); setError('');
    try {
      await onSave({
        description: v.description.trim(), kind: v.kind ?? 'item', occasion: v.occasion ?? 'wedding',
        amount: v.amount === null || v.amount === undefined || (v.amount as unknown) === '' ? null : Number(v.amount),
        received_on: v.received_on || null, from_other: v.from_other?.trim() || null, notes: v.notes?.trim() || null,
      }, picked);
      onClose();
    } catch (e) { setError(friendly(e)); } finally { setBusy(false); }
  };

  return (
    <Drawer open title={gift.id ? 'Edit gift' : 'Log a gift'} onClose={onClose} footer={
      <>
        {onDelete ? <button className="btn danger" disabled={busy} onClick={() => { if (confirm('Delete this gift?')) onDelete().then(onClose).catch((e) => setError(friendly(e))); }}>Delete</button> : <span />}
        <button className="btn" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
      </>
    }>
      <label className="field"><span>What was it? *</span><input value={v.description ?? ''} onChange={(e) => set({ description: e.target.value })} placeholder="KitchenAid mixer" /></label>
      <div className="g2">
        <label className="field"><span>Type</span>
          <select value={v.kind ?? 'item'} onChange={(e) => set({ kind: e.target.value as Gift['kind'] })}>
            {Object.entries(GIFT_KINDS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="field"><span>Occasion</span>
          <select value={v.occasion ?? 'wedding'} onChange={(e) => set({ occasion: e.target.value as Gift['occasion'] })}>
            {Object.entries(OCCASIONS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="field"><span>Amount or value (optional)</span><input type="number" min={0} step="0.01" value={v.amount ?? ''} onChange={(e) => set({ amount: e.target.value === '' ? null : Number(e.target.value) })} /></label>
        <label className="field"><span>Received</span><input type="date" value={v.received_on ?? ''} onChange={(e) => set({ received_on: e.target.value })} /></label>
      </div>

      <div className="field"><span>From (choose everyone it came from)</span>
        <input className="input" placeholder="Search guests" value={search} onChange={(e) => setSearch(e.target.value)} style={{ marginBottom: 6 }} />
        <div className="checks" style={{ maxHeight: 220 }}>
          {shown.map((g) => (
            <label key={g.id} style={{ alignItems: 'flex-start' }}>
              <input type="checkbox" checked={picked.includes(g.id)} style={{ marginTop: 3 }}
                onChange={(e) => setPicked((p) => (e.target.checked ? [...p, g.id] : p.filter((x) => x !== g.id)))} />
              <span>{g.name}{g.notes && <span className="small muted" style={{ display: 'block' }}>{g.notes}</span>}</span>
            </label>
          ))}
          {guests.length === 0 && <span className="small muted">Add guests on the Guests tab first, or use “Also from.”</span>}
        </div>
        {picked.length > 1 && <p className="small" style={{ marginTop: 4 }}>{picked.length} people chosen. One note will thank them together.</p>}
      </div>
      <label className="field"><span>Also from (people not on your guest list)</span><input value={v.from_other ?? ''} onChange={(e) => set({ from_other: e.target.value })} placeholder="Megan’s coworkers at Penrod" /></label>
      <label className="field"><span>Notes</span><textarea value={v.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} placeholder="Engraved, from our registry, arrived early…" /></label>
      {error && <p className="err">{error}</p>}
    </Drawer>
  );
}

function ThankYouDrawer({ gift, weddingId, givers, onClose, onSave }: {
  gift: Gift | null; weddingId: string; givers: Guest[]; onClose: () => void; onSave: (p: Partial<Gift>) => Promise<void>;
}) {
  const toast = useToast();
  const [text, setText] = useState(''); const [tone, setTone] = useState('warm'); const [length, setLength] = useState('medium');
  const [mention, setMention] = useState(false); const [extra, setExtra] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [forId, setForId] = useState<string | null>(null);
  if (gift && forId !== gift.id) { setForId(gift.id); setText(gift.thank_you_text ?? ''); setError(''); setExtra(''); setMention(false); }
  if (!gift && forId) setForId(null);
  if (!gift) return null;
  const isMoney = MONEY_KINDS.includes(gift.kind);

  const generate = async () => {
    setBusy(true); setError('');
    const { data, error } = await supabase.functions.invoke('thank-you-note', {
      body: { wedding_id: weddingId, gift_id: gift.id, tone, length, mention_amount: mention, extra },
    });
    setBusy(false);
    if (error) return setError(await functionError(error));
    setText(data.note);
  };
  const save = async (status: Gift['thank_you_status']) => {
    setBusy(true); setError('');
    try {
      await onSave({ thank_you_text: text.trim() || null, thank_you_status: status,
        thank_you_sent_on: status === 'sent' ? new Date().toISOString().slice(0, 10) : null });
      toast.show(status === 'sent' ? 'Marked as thanked' : 'Draft saved');
      if (status === 'sent') onClose();
    } catch (e) { setError(friendly(e)); } finally { setBusy(false); }
  };

  return (
    <Drawer open title="Thank-you note" onClose={onClose} footer={
      <>
        <button className="btn g" disabled={busy || !text.trim()} onClick={() => save('drafted')}>Save draft</button>
        <button className="btn" disabled={busy || !text.trim()} onClick={() => save('sent')}>Mark as sent</button>
      </>
    }>
      <p style={{ marginBottom: 4 }}><b>{gift.description}</b></p>
      <p className="small muted" style={{ marginBottom: 12 }}>
        From {[...givers.map((g) => g.name), gift.from_other].filter(Boolean).join(', ') || 'no one yet'}
      </p>
      {givers.some((g) => g.notes) && (
        <div className="card" style={{ padding: 12, background: 'var(--ivory)' }}>
          {givers.filter((g) => g.notes).map((g) => <p key={g.id} className="small"><b>{g.name}:</b> {g.notes}</p>)}
          <p className="small muted" style={{ marginTop: 4 }}>The note uses these. Edit them on the Guests tab.</p>
        </div>
      )}
      <div className="g2">
        <label className="field"><span>Tone</span>
          <select value={tone} onChange={(e) => setTone(e.target.value)}><option value="warm">Warm</option><option value="formal">Formal</option><option value="playful">Playful</option></select>
        </label>
        <label className="field"><span>Length</span>
          <select value={length} onChange={(e) => setLength(e.target.value)}><option value="short">Short</option><option value="medium">Medium</option><option value="long">Long</option></select>
        </label>
      </div>
      {isMoney && gift.amount != null && (
        <label className="small" style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
          <input type="checkbox" checked={mention} onChange={(e) => setMention(e.target.checked)} /> Mention the amount ({money(gift.amount)})
        </label>
      )}
      <label className="field"><span>Anything to include? (optional)</span>
        <input value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="It’s already on our counter; we used it for Sunday pancakes" />
      </label>
      <button className="btn g" disabled={busy} onClick={generate} style={{ marginBottom: 12 }}>{busy ? 'Writing…' : text ? '✨ Write another version' : '✨ Write it for me'}</button>
      <label className="field"><span>Note</span>
        <textarea value={text} onChange={(e) => setText(e.target.value)} style={{ minHeight: 220 }} placeholder="Write your own, or let the generator draft one to edit." />
      </label>
      {text && <button className="btn g sm" onClick={() => { navigator.clipboard.writeText(text); toast.show('Copied'); }}>Copy</button>}
      {gift.thank_you_status === 'sent' && <p className="small muted" style={{ marginTop: 8 }}>Marked as sent{gift.thank_you_sent_on ? ` on ${longDate(gift.thank_you_sent_on)}` : ''}.</p>}
      {error && <p className="err">{error}</p>}
      {toast.node}
    </Drawer>
  );
}
