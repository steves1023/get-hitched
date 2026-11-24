import { useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { ErrorNote } from '../components/ui';

export default function Login() {
  const { session } = useAuth();
  const [params] = useSearchParams();
  const next = params.get('next') || '/';
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const redirectTo = `${window.location.origin}${next}`;

  if (session) return <Navigate to={next} replace />;

  const sendLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
    setBusy(false);
    if (error) setError(error); else setSent(true);
  };
  const google = () => supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });

  return (
    <main className="auth">
      <h1>✦ Get Hitched</h1>
      <p className="muted" style={{ marginBottom: 24 }}>Plan your wedding together, and share just the right parts with everyone helping.</p>
      <div className="card">
        {sent ? (
          <>
            <h2 className="ct">Check your email</h2>
            <p>We sent a sign-in link to <b>{email}</b>. Open it on this device to continue.</p>
            <button className="btn g" style={{ marginTop: 14 }} onClick={() => setSent(false)}>Use a different email</button>
          </>
        ) : (
          <>
            <form onSubmit={sendLink}>
              <label className="field"><span>Email</span>
                <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </label>
              <button className="btn" style={{ width: '100%', justifyContent: 'center' }} disabled={busy}>
                {busy ? 'Sending…' : 'Email me a sign-in link'}
              </button>
            </form>
            <div className="divider">or</div>
            <button className="btn g" style={{ width: '100%', justifyContent: 'center' }} onClick={google}>Continue with Google</button>
            <ErrorNote error={error} />
          </>
        )}
      </div>
    </main>
  );
}
