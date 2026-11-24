import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { ErrorNote } from '../components/ui';

const FIELDS: { key: string; label: string; type?: string; required?: boolean; placeholder?: string }[] = [
  { key: 'partner1', label: 'Your first name', required: true },
  { key: 'partner2', label: 'Your partner’s first name', required: true },
  { key: 'last_names', label: 'Last name(s)', placeholder: 'Carter-Reed' },
  { key: 'wedding_date', label: 'Wedding date', type: 'date' },
  { key: 'venue', label: 'Venue', placeholder: 'You can add this later' },
  { key: 'theme', label: 'Theme or style', placeholder: 'Rustic garden' },
  { key: 'total_budget', label: 'Total budget (USD)', type: 'number' },
];

export default function Onboarding() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [v, setV] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    const { data, error } = await supabase.rpc('create_wedding', { p: { ...v, display_name: v.partner1 } });
    setBusy(false);
    if (error) return setError(error);
    await qc.invalidateQueries({ queryKey: ['my-weddings'] });
    nav(`/w/${data}`, { replace: true });
  };

  return (
    <main className="auth">
      <h1>Let’s set up your wedding</h1>
      <p className="muted" style={{ marginBottom: 20 }}>You can change any of this later in Settings.</p>
      <form className="card" onSubmit={submit}>
        {FIELDS.map((f) => (
          <label className="field" key={f.key}><span>{f.label}{f.required ? ' *' : ''}</span>
            <input type={f.type ?? 'text'} required={f.required} placeholder={f.placeholder} min={f.type === 'number' ? 0 : undefined}
              value={v[f.key] ?? ''} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} />
          </label>
        ))}
        <ErrorNote error={error} />
        <button className="btn" disabled={busy}>{busy ? 'Creating…' : 'Create our wedding'}</button>
      </form>
    </main>
  );
}
