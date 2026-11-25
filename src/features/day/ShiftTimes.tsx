import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Modal } from '../../components/ui';
import { time12 } from '../../lib/format';
import type { DayItem } from '../../lib/types';

const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

/** Move the whole day at once: pick the real ceremony time and everything keeps its spacing. */
export default function ShiftTimes({ open, weddingId, items, onClose, onDone }: {
  open: boolean; weddingId: string; items: DayItem[]; onClose: () => void; onDone: () => void;
}) {
  const ceremony = items.find((i) => /^ceremony$/i.test(i.title.trim())) ?? items.find((i) => i.phase === 'ceremony' && /ceremony/i.test(i.title));
  const [target, setTarget] = useState(ceremony ? ceremony.start_time.slice(0, 5) : '16:00');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const delta = ceremony ? toMin(target) - toMin(ceremony.start_time) : 0;
  const first = items.length ? Math.min(...items.map((i) => toMin(i.start_time))) : 0;
  const last = items.length ? Math.max(...items.map((i) => toMin(i.start_time))) : 0;
  const fits = first + delta >= 0 && last + delta < 1440;
  const fmt = (m: number) => time12(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  const span = (d: number) => [Math.floor(Math.abs(d) / 60) ? `${Math.floor(Math.abs(d) / 60)} hr` : '', Math.abs(d) % 60 ? `${Math.abs(d) % 60} min` : ''].filter(Boolean).join(' ');

  const apply = async () => {
    if (!delta) return onClose();
    setBusy(true); setError('');
    const { error } = await supabase.rpc('shift_day_items', { w: weddingId, p_minutes: delta });
    setBusy(false);
    if (error) return setError(/MIDNIGHT/.test(error.message) ? 'That would push some items past midnight. Pick an earlier time.' : error.message);
    onDone(); onClose();
  };

  return (
    <Modal open={open} title="Shift the whole day" onClose={onClose}>
      {!ceremony ? (
        <p>Add an item called “Ceremony” first. Everything moves relative to it.</p>
      ) : (
        <>
          <p style={{ marginBottom: 12 }}>Set your real ceremony time. Every item moves with it and keeps the same spacing.</p>
          <label className="field"><span>Ceremony starts at</span>
            <input type="time" step={300} value={target} onChange={(e) => setTarget(e.target.value)} />
          </label>
          {delta !== 0 && fits && (
            <p className="small" style={{ marginBottom: 10 }}>
              Moves all {items.length} items {span(delta)} {delta > 0 ? 'later' : 'earlier'}. The day would run {fmt(first + delta)} to {fmt(last + delta)}.
            </p>
          )}
          {!fits && <p className="err">That would push some items past midnight. Pick an earlier time.</p>}
          {error && <p className="err">{error}</p>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn g" onClick={onClose}>Cancel</button>
            <button className="btn" disabled={busy || !delta || !fits} onClick={apply}>{busy ? 'Moving…' : 'Shift times'}</button>
          </div>
        </>
      )}
    </Modal>
  );
}
