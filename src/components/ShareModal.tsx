import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAccess } from '../lib/access';
import { supabase } from '../lib/supabase';
import { useMembers, useRows } from '../hooks/data';
import { friendly, functionError } from '../lib/errors';
import { MODULES, MODULE_LABEL, PRICING, ROLE_LABEL, ROLE_PRESETS, seatLimit, seatTypeOf, type Invite, type Level, type Member, type Module, type Role, type SeatType } from '../lib/types';
import { Badge, Modal } from './ui';

type InvitableRole = Exclude<Role, 'owner'>;
// Vendor still exists in the database, but couples invite only these four.
const ROLES: InvitableRole[] = ['partner', 'planner', 'family', 'wedding_party'];
const SPOT_NAME: Record<SeatType, string> = { full: PRICING.fullName, party: PRICING.partyName };
const roleOption = (r: InvitableRole) => {
  const t = seatTypeOf(r);
  if (r === 'partner') return 'The person you’re marrying · free';
  return t === 'full' ? `${ROLE_LABEL[r]} · uses a ${SPOT_NAME.full} spot (${PRICING.full})` : `${ROLE_LABEL[r]} · free`;
};
const LEVELS: { value: Level; label: string }[] = [
  { value: 'none', label: 'Hidden' }, { value: 'assigned', label: 'Only theirs' }, { value: 'read', label: 'View' }, { value: 'edit', label: 'Edit' },
];
// 'Only theirs' only means something for Tasks and Wedding Day.
const levelsFor = (m: Module) => (m === 'tasks' || m === 'day' ? LEVELS : LEVELS.filter((l) => l.value !== 'assigned'));

function AccessGrid({ value, onChange, disabled }: { value: Record<Module, Level>; onChange: (v: Record<Module, Level>) => void; disabled?: boolean }) {
  return (
    <div className="scroll-x">
      <table className="grid-access">
        <tbody>
          {MODULES.map((m) => (
            <tr key={m}>
              <th scope="row">{MODULE_LABEL[m]}</th>
              <td>
                <select aria-label={`${MODULE_LABEL[m]} access`} value={value[m]} disabled={disabled}
                  onChange={(e) => onChange({ ...value, [m]: e.target.value as Level })}>
                  {levelsFor(m).map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ShareModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { wedding, me, hasPass, entitlement } = useAccess();
  const qc = useQueryClient();
  const members = useMembers(wedding.id);
  const invites = useRows<Invite>('invites', wedding.id, 'created_at', false);

  const [role, setRole] = useState<InvitableRole>('wedding_party');
  const [access, setAccess] = useState<Record<Module, Level>>(ROLE_PRESETS.wedding_party);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [msg, setMsg] = useState('');
  const [link, setLink] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);
  const [editAccess, setEditAccess] = useState<Record<Module, Level> | null>(null);

  useEffect(() => { setAccess(ROLE_PRESETS[role]); }, [role]);

  const inviteLink = (token: string) => `${window.location.origin}/invite/${token}`;

  const sendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(''); setMsg(''); setLink('');
    const { data: inv, error } = await supabase.from('invites')
      .insert({ wedding_id: wedding.id, email: email.trim(), display_name: name.trim(), role, access })
      .select().single();
    if (error) { setBusy(false); return setError(friendly(error)); }
    const res = await supabase.functions.invoke('send-invite', { body: { invite_id: inv.id } });
    setBusy(false);
    setLink(inviteLink(inv.token));
    if (res.error) setMsg(`Invite created, but the email didn’t send (${await functionError(res.error)}). Copy the link below and send it yourself.`);
    else if (res.data?.emailed) setMsg(`Invite emailed to ${email}. You can also send them the link below.`);
    else if (res.data?.reason === 'EMAIL_RATE_LIMIT') setMsg('Invite created, but the email limit for this hour was reached. Copy the link below and text or email it yourself.');
    else setMsg('Invite created. The email didn’t send, so copy the link below.');
    setEmail(''); setName('');
    qc.invalidateQueries({ queryKey: ['invites', wedding.id] });
  };

  const openEdit = async (m: Member) => {
    setEditing(m);
    const { data } = await supabase.from('member_module_access').select('module, level').eq('member_id', m.id);
    const base = { ...ROLE_PRESETS[m.role as InvitableRole] };
    for (const r of data ?? []) base[r.module as Module] = r.level as Level;
    setEditAccess(base);
  };

  const saveEdit = async () => {
    if (!editing || !editAccess) return;
    setError('');
    const rows = MODULES.map((m) => ({ member_id: editing.id, wedding_id: wedding.id, module: m, level: editAccess[m] }));
    const { error } = await supabase.from('member_module_access').upsert(rows, { onConflict: 'member_id,module' });
    if (error) return setError(friendly(error));
    setEditing(null); setEditAccess(null);
    qc.invalidateQueries();
  };

  const removeMember = async (m: Member) => {
    if (!confirm(`Remove ${m.display_name} from this wedding?`)) return;
    const { error } = await supabase.from('wedding_members').delete().eq('id', m.id);
    if (error) return setError(friendly(error));
    qc.invalidateQueries({ queryKey: ['wedding_members', wedding.id] });
  };

  const revoke = async (i: Invite) => {
    const { error } = await supabase.from('invites').delete().eq('id', i.id);
    if (error) return setError(friendly(error));
    qc.invalidateQueries({ queryKey: ['invites', wedding.id] });
  };

  const pending = (invites.data ?? []).filter((i) => !i.accepted_at);
  const now = new Date().toISOString();
  const used = (t: SeatType) => (members.data ?? []).filter((m) => seatTypeOf(m.role) === t).length
    + pending.filter((i) => i.expires_at > now && seatTypeOf(i.role) === t).length;
  const hasPartner = (members.data ?? []).some((m) => m.role === 'partner')
    || pending.some((i) => i.role === 'partner' && i.expires_at > now);
  const roleChoices = ROLES.filter((r) => r !== 'partner' || !hasPartner);
  const roleType = seatTypeOf(role);
  const full = !!roleType && used(roleType) >= seatLimit(hasPass, entitlement, roleType);

  return (
    <Modal open={open} onClose={onClose} title="Share your wedding">
      {editing && editAccess ? (
        <>
          <h3 className="ct">What {editing.display_name} can see</h3>
          <AccessGrid value={editAccess} onChange={setEditAccess} />
          {error && <p className="err">{error}</p>}
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button className="btn" onClick={saveEdit}>Save access</button>
            <button className="btn g" onClick={() => { setEditing(null); setEditAccess(null); }}>Cancel</button>
          </div>
        </>
      ) : (
        <>
          <h3 className="ct">People</h3>
          {(members.data ?? []).map((m) => (
            <div className="row" key={m.id} style={{ alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <div className="nm">{m.display_name}{m.id === me.id ? ' (you)' : ''}</div>
                <div className="chips"><Badge tone="bb">{ROLE_LABEL[m.role]}</Badge>
                  {seatTypeOf(m.role) === 'party' && <Badge tone="bw">Wedding Day only</Badge>}</div>
              </div>
              {seatTypeOf(m.role) === 'full' && <button className="btn g sm" onClick={() => openEdit(m)}>Access</button>}
              {m.role !== 'owner' && m.id !== me.id && <button className="btn danger sm" onClick={() => removeMember(m)}>Remove</button>}
            </div>
          ))}

          {pending.length > 0 && (
            <>
              <h3 className="ct" style={{ marginTop: 18 }}>Waiting to accept</h3>
              {pending.map((i) => (
                <div className="row" key={i.id} style={{ alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <div className="nm">{i.display_name} <span className="muted small">{i.email}</span></div>
                    <div className="chips"><Badge tone="bw">{ROLE_LABEL[i.role]}</Badge></div>
                  </div>
                  <button className="btn g sm" onClick={() => navigator.clipboard.writeText(inviteLink(i.token))}>Copy link</button>
                  <button className="btn danger sm" onClick={() => revoke(i)}>Cancel</button>
                </div>
              ))}
            </>
          )}

          <h3 className="ct" style={{ marginTop: 18 }}>Invite someone</h3>
          <p className="small" style={{ marginBottom: 10 }}>
            Spots in use: <b>{used('full')} of {seatLimit(hasPass, entitlement, 'full')}</b> {PRICING.fullName} ·{' '}
            <b>{used('party')}</b> {PRICING.partyName} (free). The person you’re marrying joins free. Open invites hold a spot.
          </p>
          {full && roleType === 'full' && (
            <p className="small" style={{ marginBottom: 10 }}>
              No {SPOT_NAME.full} spots left. Add more for {PRICING.full} each on{' '}
              <Link to={`/w/${wedding.id}/billing`} onClick={onClose}>Billing</Link>.
            </p>
          )}
          {full && roleType === 'party' && <p className="small" style={{ marginBottom: 10 }}>You’ve reached {PRICING.partyCap} wedding party invites.</p>}
          <form onSubmit={sendInvite}>
            <div className="g2">
              <label className="field"><span>Name *</span><input required value={name} onChange={(e) => setName(e.target.value)} /></label>
              <label className="field"><span>Email *</span><input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
            </div>
            <label className="field"><span>Role</span>
              <select value={role} onChange={(e) => setRole(e.target.value as InvitableRole)}>
                {roleChoices.map((r) => <option key={r} value={r}>{roleOption(r)}</option>)}
              </select>
            </label>
            <p className="muted small" style={{ marginBottom: 8 }}>
              {role === 'partner' ? 'For your fiancé(e), the other half of the couple. They get the same full access as you, at no extra cost. One per wedding.'
                : roleType === 'party' ? 'Sees only the Wedding Day tab: items for the wedding party and items you assign to them.'
                : 'Starts with full access. Hide any tab you’d rather they didn’t see.'}
            </p>
            {roleType === 'full' && <AccessGrid value={access} onChange={setAccess} />}
            {error && <p className="err">{error}</p>}
            {msg && <p className="ok">{msg}</p>}
            {link && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <input className="input" readOnly value={link} onFocus={(e) => e.target.select()} />
                <button type="button" className="btn g" onClick={() => navigator.clipboard.writeText(link)}>Copy</button>
              </div>
            )}
            <button className="btn" disabled={busy || full} style={{ marginTop: 10 }}>{busy ? 'Sending…' : 'Send invite'}</button>
          </form>
        </>
      )}
    </Modal>
  );
}
