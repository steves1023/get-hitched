import { useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useAccess } from '../lib/access';
import { supabase } from '../lib/supabase';
import { functionError } from '../lib/errors';
import { fullDate } from '../lib/format';
import { PageHeader } from '../components/ui';

const PASS_FEATURES = ['Unlimited guests', 'Seating chart', 'Wedding day timeline', 'Unlimited vision board images',
  '2 GB of files', 'About 25 hashtag generations a day', 'Unlimited collaborators'];

export default function Billing() {
  const { wedding, isCouple, entitlement, hasPass } = useAccess();
  const [params] = useSearchParams();
  const qc = useQueryClient();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // After checkout, the webhook may take a few seconds; poll the plan briefly.
  useEffect(() => {
    if (params.get('status') !== 'success' || hasPass) return;
    const id = setInterval(() => qc.invalidateQueries({ queryKey: ['access'] }), 2000);
    const stop = setTimeout(() => clearInterval(id), 20000);
    return () => { clearInterval(id); clearTimeout(stop); };
  }, [params, hasPass, qc]);

  if (!isCouple) return <Navigate to={`/w/${wedding.id}`} replace />;

  const go = async (body: Record<string, string>) => {
    setBusy(true); setError('');
    const { data, error } = await supabase.functions.invoke('billing', { body: { ...body, wedding_id: wedding.id } });
    setBusy(false);
    if (error) return setError(await functionError(error));
    window.location.href = data.url;
  };

  return (
    <>
      <PageHeader title="Billing" sub="Your plan" />
      {params.get('status') === 'success' && !hasPass && <p className="ok">Payment received. Unlocking your Wedding Pass…</p>}
      {params.get('status') === 'cancelled' && <p className="muted small">Checkout was cancelled. Nothing was charged.</p>}
      <div className="g2">
        <div className="card">
          <h2 className="ct">Current plan</h2>
          <p className="sn" style={{ fontSize: '1.6rem' }}>{hasPass ? (entitlement?.plan === 'monthly' ? 'Monthly' : 'Wedding Pass') : 'Free'}</p>
          {hasPass && entitlement?.valid_until && <p className="muted">Active through {fullDate(entitlement.valid_until)}</p>}
          {entitlement?.stripe_customer_id && (
            <button className="btn g" style={{ marginTop: 14 }} disabled={busy} onClick={() => go({ action: 'portal' })}>Receipts and billing details</button>
          )}
        </div>
        {!hasPass && (
          <div className="card">
            <h2 className="ct">Wedding Pass</h2>
            <p style={{ marginBottom: 10 }}>One payment, valid through your wedding date plus 90 days.</p>
            <ul style={{ paddingLeft: 18, marginBottom: 16 }}>{PASS_FEATURES.map((f) => <li key={f}>{f}</li>)}</ul>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn" disabled={busy} onClick={() => go({ action: 'checkout', plan: 'pass' })}>Get the Wedding Pass</button>
              <button className="btn g" disabled={busy} onClick={() => go({ action: 'checkout', plan: 'monthly' })}>Pay monthly instead</button>
            </div>
          </div>
        )}
      </div>
      {error && <p className="err">{error}</p>}
    </>
  );
}
