import { useEffect, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAccess } from '../lib/access';
import { supabase } from '../lib/supabase';
import { friendly, functionError } from '../lib/errors';
import { fullDate, moneyCents } from '../lib/format';
import { PRICING, seatLimit, seatTypeOf, type Invite, type SeatType } from '../lib/types';
import { useMembers, useRows } from '../hooks/data';
import { Bar, PageHeader } from '../components/ui';

const PASS_FEATURES = ['Tasks, vendors, budget and guest list', 'Seating chart and wedding day timeline',
  'Vision board, files and hashtag ideas', 'Valid through your wedding date plus 90 days'];

const SPOTS: Record<SeatType, { name: string; price: string; blurb: string }> = {
  full: { name: PRICING.fullName, price: `${PRICING.full} per person`,
    blurb: 'Full access to planning, like you. You can hide any tab per person.' },
  party: { name: PRICING.partyName, price: `free, up to ${PRICING.partyCap}`,
    blurb: 'The Wedding Day tab only: party items and anything you assign to them.' },
};

export default function Billing() {
  const { wedding, isCouple, entitlement, hasPass, everPaid } = useAccess();
  const [params] = useSearchParams();
  const qc = useQueryClient();
  const members = useMembers(wedding.id);
  const invites = useRows<Invite>('invites', wedding.id, 'created_at', false, isCouple && hasPass);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');
  const [codeMsg, setCodeMsg] = useState('');
  const status = params.get('status');

  const now = new Date().toISOString();
  const used = (t: SeatType) =>
    (members.data ?? []).filter((m) => seatTypeOf(m.role) === t).length
    + (invites.data ?? []).filter((i) => !i.accepted_at && i.expires_at > now && seatTypeOf(i.role) === t).length;

  // After checkout the webhook takes a few seconds; refresh until it lands.
  const waiting = (status === 'success' && !hasPass) || status === 'seats';
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
    const r = data as { kind: 'pass'; valid_until: string } | { kind: 'full_seats' | 'party_seats'; seats_added: number; seat_limit: number };
    if (r.kind === 'pass') setCodeMsg(`Code applied. Your wedding is active through ${fullDate(r.valid_until)}.`);
    else setCodeMsg(`Code applied. ${r.seats_added} ${SPOTS[r.kind === 'full_seats' ? 'full' : 'party'].name} ${r.seats_added === 1 ? 'spot' : 'spots'} added.`);
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
      {status === 'success' && !hasPass && <p className="ok">Payment received. Activating your wedding…</p>}
      {status === 'seats' && <p className="ok">Payment received. New spots appear here within a few seconds.</p>}
      {status === 'cancelled' && <p className="muted small">Checkout was cancelled. Nothing was charged.</p>}

      {!everPaid ? (
        <div className="g2">
          <div className="card">
            <h2 className="ct">{PRICING.passName} · {PRICING.pass}</h2>
            <p style={{ marginBottom: 10 }}>One payment for the two of you, valid through your wedding date plus 90 days. After that, everything stays saved and view-only.</p>
            <ul style={{ paddingLeft: 18, marginBottom: 16 }}>{PASS_FEATURES.map((f) => <li key={f}>{f}</li>)}</ul>
            <button className="btn" disabled={busy} onClick={() => go({ action: 'pass' })}>Activate for {PRICING.pass}</button>
          </div>
          <div className="card">
            <h2 className="ct">Bringing others in later</h2>
            <p className="small" style={{ marginBottom: 10 }}>After you activate, invite people from Share. The person you’re marrying joins free.</p>
            {(['full', 'party'] as SeatType[]).map((t) => (
              <p key={t} style={{ marginBottom: 8 }}><b>{SPOTS[t].name}</b> · {SPOTS[t].price}<br /><span className="small muted">{SPOTS[t].blurb}</span></p>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="card">
            <h2 className="ct">Current plan</h2>
            <p className="sn" style={{ fontSize: '1.6rem' }}>{hasPass ? PRICING.passName : 'Ended'}</p>
            {hasPass && entitlement?.valid_until && <p className="muted">Active through {fullDate(entitlement.valid_until)}</p>}
            {!hasPass && <p className="muted">Everything you planned stays here to look back on.</p>}
            {entitlement?.stripe_customer_id && (
              <button className="btn g" style={{ marginTop: 14 }} disabled={busy} onClick={() => go({ action: 'portal' })}>Receipts and billing details</button>
            )}
          </div>
          {hasPass && (
            <div className="g2">
              {(['full', 'party'] as SeatType[]).map((t) => (
                <SpotCard key={t} type={t} used={used(t)} limit={seatLimit(hasPass, entitlement, t)} busy={busy}
                  onBuy={t === 'full' ? (qty) => go({ action: 'seats', seat_type: 'full', qty }) : undefined} />
              ))}
            </div>
          )}
        </>
      )}

      {(!everPaid || hasPass) && (
        <form className="card" onSubmit={redeem} style={{ maxWidth: 520 }}>
          <h2 className="ct">Have a code?</h2>
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

function SpotCard({ type, used, limit, busy, onBuy }: { type: SeatType; used: number; limit: number; busy: boolean; onBuy?: (qty: number) => void }) {
  const s = SPOTS[type];
  const [qty, setQty] = useState(2);
  return (
    <div className="card">
      <h2 className="ct">{s.name} · {s.price}</h2>
      <p className="small muted" style={{ marginTop: -8, marginBottom: 12 }}>{s.blurb}</p>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{onBuy ? 'Spots in use' : 'People invited'}</span><b>{used} of {limit}</b></div>
      <Bar pct={limit ? Math.min(100, Math.round((used / limit) * 100)) : 0} />
      {onBuy ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 12 }}>
          <label className="field" style={{ marginBottom: 0, width: 96 }}><span>Add</span>
            <input type="number" min={1} max={100} value={qty} onChange={(e) => setQty(Math.max(1, Math.min(100, Number(e.target.value) || 1)))} />
          </label>
          <button className="btn" disabled={busy} onClick={() => onBuy(qty)}>
            Add {qty} · {moneyCents(qty * PRICING.fullCents)}
          </button>
        </div>
      ) : <p className="small muted" style={{ marginTop: 10 }}>No purchase needed. Invite them from Share.</p>}
    </div>
  );
}
