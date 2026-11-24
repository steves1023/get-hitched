import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAccess } from '../lib/access';
import { supabase } from '../lib/supabase';
import { ErrorNote, PageHeader, useToast } from '../components/ui';

const FIELDS = [
  { key: 'partner1', label: 'Partner 1', required: true },
  { key: 'partner2', label: 'Partner 2', required: true },
  { key: 'last_names', label: 'Last name(s)' },
  { key: 'wedding_date', label: 'Wedding date', type: 'date' },
  { key: 'venue', label: 'Venue' },
  { key: 'theme', label: 'Theme or style' },
  { key: 'total_budget', label: 'Total budget (USD)', type: 'number' },
] as const;

export default function Settings() {
  const { wedding, isCouple, me } = useAccess();
  const qc = useQueryClient();
  const toast = useToast();
  const [v, setV] = useState<Record<string, string>>(() =>
    Object.fromEntries(FIELDS.map((f) => [f.key, String((wedding as unknown as Record<string, unknown>)[f.key] ?? '')])));
  const [error, setError] = useState<unknown>(null);
  if (!isCouple) return <Navigate to={`/w/${wedding.id}`} replace />;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const patch: Record<string, unknown> = {};
    for (const f of FIELDS) patch[f.key] = v[f.key] === '' ? (f.key === 'total_budget' ? 0 : null) : f.key === 'total_budget' ? Number(v[f.key]) : v[f.key];
    const { error } = await supabase.from('weddings').update(patch).eq('id', wedding.id);
    if (error) return setError(error);
    await qc.invalidateQueries({ queryKey: ['access'] });
    toast.show('Settings saved');
  };

  const deleteWedding = async () => {
    if (me.role !== 'owner') return;
    const typed = prompt('This deletes the wedding, everyone’s access and all its data. Type DELETE to confirm.');
    if (typed !== 'DELETE') return;
    // Remove stored files first; the database cascade removes the rows.
    for (const bucket of ['vision', 'files']) {
      const { data } = await supabase.storage.from(bucket).list(wedding.id, { limit: 1000 });
      if (data?.length) await supabase.storage.from(bucket).remove(data.map((o) => `${wedding.id}/${o.name}`));
    }
    const { error } = await supabase.from('weddings').delete().eq('id', wedding.id);
    if (error) return setError(error);
    window.location.href = '/';
  };

  return (
    <>
      <PageHeader title="Settings" sub="Wedding details" />
      <form className="card" onSubmit={save} style={{ maxWidth: 560 }}>
        {FIELDS.map((f) => (
          <label className="field" key={f.key}><span>{f.label}</span>
            <input type={'type' in f ? f.type : 'text'} required={'required' in f} value={v[f.key]} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} />
          </label>
        ))}
        <ErrorNote error={error} />
        <button className="btn">Save changes</button>
      </form>
      {me.role === 'owner' && (
        <div className="card" style={{ maxWidth: 560 }}>
          <h2 className="ct">Delete wedding</h2>
          <p className="muted small" style={{ marginBottom: 12 }}>Removes all data, files and everyone’s access. This can’t be undone.</p>
          <button className="btn danger" onClick={deleteWedding}>Delete this wedding</button>
        </div>
      )}
      {toast.node}
    </>
  );
}
