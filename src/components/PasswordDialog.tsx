import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Modal } from './ui';

/** Create or change a password for the signed-in account. */
export default function PasswordDialog({ open, first, onClose }: { open: boolean; first?: boolean; onClose: (saved: boolean) => void }) {
  const [pw, setPw] = useState(''); const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [done, setDone] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 8) return setError('Use at least 8 characters.');
    if (pw !== pw2) return setError('The two passwords don’t match.');
    setBusy(true); setError('');
    const { error } = await supabase.auth.updateUser({ password: pw, data: { has_password: true } });
    setBusy(false);
    if (error) {
      if (/reauthenticat|recent/i.test(error.message)) return setError('For security, sign out and back in with an email link, then set your password right away.');
      if (/weak|pwned|leaked/i.test(error.message)) return setError('That password is too common or has appeared in a data breach. Try another.');
      if (/same/i.test(error.message)) return setError('That’s already your password.');
      return setError(error.message);
    }
    setDone(true);
  };
  const close = () => { const saved = done; setPw(''); setPw2(''); setError(''); setDone(false); onClose(saved); };

  return (
    <Modal open={open} title={done ? 'Password saved' : first ? 'Create a password' : 'Set your password'} onClose={close}>
      {done ? (
        <>
          <p>Next time, sign in with your email and this password. No email link needed.</p>
          <button className="btn" style={{ marginTop: 14 }} onClick={close}>Done</button>
        </>
      ) : (
        <form onSubmit={save}>
          {first && <p style={{ marginBottom: 12 }}>Skip the email next time: add a password and sign in with it directly.</p>}
          <label className="field"><span>New password</span>
            <input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
          </label>
          <label className="field"><span>Type it again</span>
            <input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
          </label>
          <p className="small muted" style={{ marginBottom: 10 }}>At least 8 characters. You can still sign in with an email link any time.</p>
          {error && <p className="err">{error}</p>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn g" onClick={close}>{first ? 'Not now' : 'Cancel'}</button>
            <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save password'}</button>
          </div>
        </form>
      )}
    </Modal>
  );
}
