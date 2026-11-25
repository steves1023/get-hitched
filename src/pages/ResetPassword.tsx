import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import PasswordDialog from '../components/PasswordDialog';

/** Landing page for "Forgot password?" emails. The link signs the person in; then they pick a new password. */
export default function ResetPassword() {
  const { session, loading } = useAuth();
  const nav = useNavigate();
  const [ready, setReady] = useState(false);
  useEffect(() => { if (!loading) setReady(true); }, [loading]);
  if (!ready) return <main className="auth"><p className="muted">One moment…</p></main>;
  if (!session) {
    return (
      <main className="auth"><h1>✦ Get Hitched</h1>
        <div className="card"><h2 className="ct">This link has expired</h2>
          <p>Reset links work once and expire after about an hour.</p>
          <button className="btn" style={{ marginTop: 14 }} onClick={() => nav('/login')}>Back to sign in</button>
        </div>
      </main>
    );
  }
  return (
    <main className="auth"><h1>✦ Get Hitched</h1>
      <PasswordDialog open onClose={() => nav('/', { replace: true })} />
    </main>
  );
}
