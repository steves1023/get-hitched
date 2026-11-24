import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAccess } from '../lib/access';
import { supabase } from '../lib/supabase';
import { useMembers, useRows } from '../hooks/data';
import { friendly, functionError } from '../lib/errors';
import { MODULES, MODULE_LABEL, PRICING, ROLE_LABEL, ROLE_PRESETS, seatLimit, type Invite, type Level, type Member, type Module, type Role } from '../lib/types';
import { Badge, Modal } from './ui';

type InvitableRole = Exclude<Role, 'owner'>;
const ROLES: InvitableRole[] = ['partner', 'planner', 'family', 'wedding_party', 'vendor'];
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
    else setMsg(res.data?.emailed ? `Invite emailed to ${email}. You can also send them the link below.` : 'Invite created. The email didn’t send, so copy the link below.');
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
  const isCoupleRole = (r: Role) => r === 'owner' || r === 'partner';
  const limit = seatLimit(hasPass, entitlement?.extra_seats ?? 0);
  const used = (members.data ?? []).filter((m) => !isCoupleRole(m.role)).length
    + pending.filter((i) => i.role !== 'partner' && i.expires_at > new Date().toISOString()).length;
  const full = role !== 'partner' && used >= limit;

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
                <div className="chips"><Badge tone="bb">{ROLE_LABEL[m.role]}</Badge></div>
              </div>
              {!isCoupleRole(m.role) && <button className="btn g sm" onClick={() => openEdit(m)}>Access</button>}
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
            <b>{used} of {limit}</b> spots used. Your partner doesn’t take a spot; open invites do.
          </p>
          {full && (
            <p className="small" style={{ marginBottom: 10 }}>
              All spots are taken. {hasPass
                ? <>Add more people for {PRICING.seat} each on <Link to={`/w/${wedding.id}/billing`} onClick={onClose}>Billing</Link>.</>
                : <>The <Link to={`/w/${wedding.id}/billing`} onClick={onClose}>Wedding Pass</Link> includes {PRICING.includedWithPass}, and you can add more after that.</>}
            </p>
          )}
          <form onSubmit={sendInvite}>
            <div className="g2">
              <label className="field"><span>Name *</span><input required value={name} onChange={(e) => setName(e.target.value)} /></label>
              <label className="field"><span>Email *</span><input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
            </div>
            <label className="field"><span>Role</span>
              <select value={role} onChange={(e) => setRole(e.target.value as InvitableRole)}>
                {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </select>
            </label>
            <p className="muted small" style={{ marginBottom: 8 }}>
              {role === 'partner' ? 'Partners can see and change everything.' : 'Start from the preset, then adjust any tab.'}
            </p>
            <AccessGrid value={access} onChange={setAccess} disabled={role === 'partner'} />
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
