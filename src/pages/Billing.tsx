import { useEffect, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAccess } from '../lib/access';
import { supabase } from '../lib/supabase';
import { friendly, functionError } from '../lib/errors';
import { fullDate, moneyCents } from '../lib/format';
import { PRICING, seatLimit, type Invite } from '../lib/types';
import { useMembers, useRows } from '../hooks/data';
import { Bar, PageHeader } from '../components/ui';

const PASS_FEATURES = ['Tasks, vendors, budget and guest list', `Share with ${PRICING.includedWithPass} people besides the two of you, more for ${PRICING.seat} each`,
  'Unlimited guests', 'Seating chart', 'Wedding day timeline', 'Unlimited vision board images', '2 GB of files',
  'About 25 hashtag generations a day'];

export default function Billing() {
  const { wedding, isCouple, entitlement, hasPass, everPaid } = useAccess();
  const [params] = useSearchParams();
  const qc = useQueryClient();
  const members = useMembers(wedding.id);
  const invites = useRows<Invite>('invites', wedding.id, 'created_at', false, isCouple);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');
  const [codeMsg, setCodeMsg] = useState('');
  const [qty, setQty] = useState(5);

  const extra = entitlement?.extra_seats ?? 0;
  const limit = seatLimit(hasPass, extra);
  const used = (members.data ?? []).filter((m) => m.role !== 'owner' && m.role !== 'partner').length
    + (invites.data ?? []).filter((i) => !i.accepted_at && i.role !== 'partner' && i.expires_at > new Date().toISOString()).length;
  const status = params.get('status');

  // After checkout the webhook takes a few seconds; refresh the plan until it lands.
  const waiting = (status === 'success' && !hasPass) || (status === 'seats');
  useEffect(() => {
    if (!waiting) return;
    const id = setInterval(() => qc.invalidateQueries({ queryKey: ['access'] }), 2000);
    const stop = setTimeout(() => clearInterval(id), 20000);
    return () => { clearInterval(id); clearTimeout(stop); };
  }, [waiting, qc]);

  if (!isCouple) return <Navigate to={`/w/${wedding.id}`} replace />;

  const go = async (body: Record<string, unknown>) => {
    setBusy(true); setError('');
    const { data, error } = await supabase.functions.invoke('billing', { body: { ...body, wedding_id: wedding.id } });
    setBusy(false);
    if (error) return setError(await functionError(error));
    window.location.href = data.url;
  };

  const redeem = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(''); setCodeMsg('');
    const { data, error } = await supabase.rpc('redeem_promo_code', { p_wedding: wedding.id, p_code: code });
    setBusy(false);
    if (error) return setError(friendly(error));
    setCode('');
    const r = data as { kind: 'pass'; valid_until: string } | { kind: 'seats'; seats_added: number; seat_limit: number };
    setCodeMsg(r.kind === 'pass'
      ? `Code applied. Your Wedding Pass is active through ${fullDate(r.valid_until)}.`
      : `Code applied. ${r.seats_added} more ${r.seats_added === 1 ? 'person' : 'people'} added, so you can now have ${r.seat_limit} besides the two of you.`);
    qc.invalidateQueries({ queryKey: ['access'] });
  };

  return (
    <>
      {everPaid ? <PageHeader title="Billing" sub="Your plan" /> : (
        <>
          <h1 className="pt">Welcome, {wedding.partner1} &amp; {wedding.partner2}</h1>
          <div className="ps">Activate your wedding to start planning</div>
        </>
      )}
      {status === 'success' && !hasPass && <p className="ok">Payment received. Unlocking your Wedding Pass…</p>}
      {status === 'seats' && <p className="ok">Payment received. New spots appear here within a few seconds.</p>}
      {status === 'cancelled' && <p className="muted small">Checkout was cancelled. Nothing was charged.</p>}

      <div className="g2">
        <div className="card">
          <h2 className="ct">Current plan</h2>
          <p className="sn" style={{ fontSize: '1.6rem' }}>{hasPass ? 'Wedding Pass' : everPaid ? 'Ended' : 'Not active yet'}</p>
          {hasPass && entitlement?.valid_until && <p className="muted">Active through {fullDate(entitlement.valid_until)}</p>}
          {!everPaid && <p className="muted">Get the Wedding Pass or enter a code to unlock every planning tool.</p>}
          {hasPass && <div style={{ marginTop: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>People besides the two of you</span><b>{used} of {limit}</b>
            </div>
            <Bar pct={limit ? Math.min(100, Math.round((used / limit) * 100)) : 100} />
            {extra > 0 && <p className="small muted">{PRICING.includedWithPass} included + {extra} added</p>}
          </div>}
          {entitlement?.stripe_customer_id && (
            <button className="btn g" style={{ marginTop: 14 }} disabled={busy} onClick={() => go({ action: 'portal' })}>Receipts and billing details</button>
          )}
        </div>

        {!everPaid ? (
          <div className="card">
            <h2 className="ct">Wedding Pass · {PRICING.pass}</h2>
            <p style={{ marginBottom: 10 }}>One payment, valid through your wedding date plus 90 days. After that, everything stays saved and view-only.</p>
            <ul style={{ paddingLeft: 18, marginBottom: 16 }}>{PASS_FEATURES.map((f) => <li key={f}>{f}</li>)}</ul>
            <button className="btn" disabled={busy} onClick={() => go({ action: 'pass' })}>Get the Wedding Pass</button>
          </div>
        ) : !hasPass ? (
          <div className="card">
            <h2 className="ct">Your wedding is wrapped up</h2>
            <p>Everything you planned stays here to look back on. Need more time? Reply to your receipt email and we’ll sort it out.</p>
          </div>
        ) : (
          <div className="card">
            <h2 className="ct">Add people</h2>
            <p style={{ marginBottom: 12 }}>Invite more helpers, family or vendors for {PRICING.seat} per person, one time. You can change the number at checkout.</p>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <label className="field" style={{ marginBottom: 0, width: 110 }}><span>People</span>
                <input type="number" min={1} max={100} value={qty} onChange={(e) => setQty(Math.max(1, Math.min(100, Number(e.target.value) || 1)))} />
              </label>
              <button className="btn" disabled={busy} onClick={() => go({ action: 'seats', qty })}>
                Add {qty} {qty === 1 ? 'person' : 'people'} · {moneyCents(qty * PRICING.seatCents)}
              </button>
            </div>
          </div>
        )}
      </div>

      {(!everPaid || hasPass) && (
        <form className="card" onSubmit={redeem} style={{ maxWidth: 520 }}>
          <h2 className="ct">Have a code?</h2>
          {hasPass && <p className="small muted" style={{ marginTop: -6, marginBottom: 10 }}>Codes for extra people are added to your total right away.</p>}
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="input" aria-label="Promo code" placeholder="Enter your code" value={code} required
              autoCapitalize="characters" autoComplete="off" onChange={(e) => setCode(e.target.value)} />
            <button className="btn" disabled={busy || !code.trim()}>Apply</button>
          </div>
        </form>
      )}
      {codeMsg && <p className="ok">{codeMsg}</p>}
      {error && <p className="err">{error}</p>}
    </>
  );
}
