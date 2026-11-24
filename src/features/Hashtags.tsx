import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAccess } from '../lib/access';
import { useRows, useTableMutations } from '../hooks/data';
import { supabase } from '../lib/supabase';
import { friendly, functionError } from '../lib/errors';
import type { Hashtag } from '../lib/types';
import { Empty, Modal, PageHeader, useToast } from '../components/ui';

const VIBES = [
  { id: 'sappy', icon: '💕', name: 'Sappy', desc: 'Romantic & heartfelt' },
  { id: 'funny', icon: '😂', name: 'Funny', desc: 'Punny & witty' },
  { id: 'classy', icon: '🥂', name: 'Classy', desc: 'Elegant & refined' },
  { id: 'playful', icon: '🎉', name: 'Playful', desc: 'Fun & celebratory' },
  { id: 'spicy', icon: '🔥', name: 'Spicy 🌶️', desc: 'Cheeky & risqué — adults only' },
];

export default function Hashtags() {
  const { wedding, levels, isCouple } = useAccess();
  const qc = useQueryClient();
  const canEdit = levels.hashtags === 'edit';
  const tags = useRows<Hashtag>('hashtags', wedding.id, 'created_at', false);
  const m = useTableMutations<Hashtag>('hashtags', wedding.id);
  const toast = useToast();
  const [vibe, setVibe] = useState('sappy');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmSpicy, setConfirmSpicy] = useState(false);

  const pickVibe = (id: string) => {
    if (id === 'spicy' && !wedding.spicy_confirmed_at) {
      if (isCouple) setConfirmSpicy(true); else setError('Ask the couple to turn on the Spicy vibe.');
      return;
    }
    setVibe(id);
  };

  const confirmAdults = async () => {
    const { error } = await supabase.from('weddings').update({ spicy_confirmed_at: new Date().toISOString() }).eq('id', wedding.id);
    if (error) return setError(friendly(error));
    await qc.invalidateQueries({ queryKey: ['access'] });
    setConfirmSpicy(false); setVibe('spicy');
  };

  const generate = async () => {
    setBusy(true); setError('');
    const { data, error } = await supabase.functions.invoke('generate-hashtags', { body: { wedding_id: wedding.id, vibe } });
    setBusy(false);
    if (error) return setError(await functionError(error));
    m.refresh();
    if (!data?.hashtags?.length) setError('No new hashtags this time. Try a different vibe.');
  };

  const copy = async (t: string) => { await navigator.clipboard.writeText(t); toast.show(`Copied ${t}`); };
  const sorted = [...(tags.data ?? [])].sort((a, b) => Number(b.starred) - Number(a.starred));

  return (
    <>
      <PageHeader title="Hashtag generator" sub="AI-powered wedding hashtags · from sappy to spicy"
        action={canEdit && <button className="btn" onClick={generate} disabled={busy}>{busy ? 'Generating…' : '✨ Generate'}</button>} />
      {canEdit && (
        <div className="g2" style={{ marginBottom: 14 }}>
          <div className="card">
            <h2 className="ct">About your wedding</h2>
            <Info label="Partner 1" value={wedding.partner1} />
            <Info label="Partner 2" value={wedding.partner2} />
            <Info label="Last name(s)" value={wedding.last_names} />
            <Info label="Theme" value={wedding.theme} />
            {isCouple && <p className="small muted">Change these in Settings.</p>}
          </div>
          <div className="card">
            <h2 className="ct">Pick your vibe</h2>
            <div className="g2">
              {VIBES.map((v) => (
                <button key={v.id} type="button" className={`vibe${vibe === v.id ? ' on' : ''}`} aria-pressed={vibe === v.id}
                  style={v.id === 'spicy' ? { gridColumn: 'span 2' } : undefined} onClick={() => pickVibe(v.id)}>
                  <span aria-hidden>{v.icon}</span><b>{v.name}</b><small>{v.desc}</small>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {error && <p className="err">{error}</p>}
      <div className="card">
        <h2 className="ct">Your hashtags</h2>
        {sorted.length === 0 ? <Empty>{canEdit ? 'Pick a vibe and press Generate.' : 'No hashtags yet.'}</Empty> : sorted.map((t) => (
          <span key={t.id} className={`chip${t.starred ? ' s' : ''}`}>
            <button type="button" onClick={() => copy(t.tag)} aria-label={`Copy ${t.tag}`} style={{ fontWeight: 600 }}>{t.tag}</button>
            {canEdit && <button type="button" aria-label={t.starred ? 'Unstar' : 'Star'} onClick={() => m.update.mutate({ id: t.id, starred: !t.starred })}>{t.starred ? '★' : '☆'}</button>}
            {canEdit && <button type="button" aria-label={`Delete ${t.tag}`} onClick={() => m.remove.mutate(t.id)}>×</button>}
          </span>
        ))}
        {sorted.length > 0 && <p className="small muted">Tap a hashtag to copy it. Star your favorites.</p>}
      </div>
      <Modal open={confirmSpicy} title="Adults only" onClose={() => setConfirmSpicy(false)}>
        <p style={{ marginBottom: 16 }}>Spicy hashtags are cheeky and suggestive. Confirm you’re both 18 or older to turn them on for this wedding.</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={confirmAdults}>We’re both 18+</button>
          <button className="btn g" onClick={() => setConfirmSpicy(false)}>Not now</button>
        </div>
      </Modal>
      {toast.node}
    </>
  );
}

const Info = ({ label, value }: { label: string; value: string | null }) => (
  <div className="field"><span>{label}</span><div className="input">{value || <span className="muted">Not set</span>}</div></div>
);
