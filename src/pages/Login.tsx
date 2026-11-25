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
  const [password, setPassword] = useState('');
  const [sent, setSent] = useState<'' | 'link' | 'reset'>('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const redirectTo = `${window.location.origin}${next}`;

  if (session) return <Navigate to={next} replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    if (password) {
      // Password set up earlier: sign straight in, no email needed.
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setBusy(false);
      if (error) setError(/invalid login/i.test(error.message)
        ? new Error('That email and password don’t match. Clear the password box to get a sign-in link instead.') : error);
      return;
    }
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
    setBusy(false);
    if (error) setError(error); else setSent('link');
  };
  const forgot = async () => {
    if (!email) return setError(new Error('Enter your email first, then tap “Forgot password?”.'));
    setBusy(true); setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
    setBusy(false);
    if (error) setError(error); else setSent('reset');
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
            <p>{sent === 'link'
              ? <>We sent a sign-in link to <b>{email}</b>. Open it on this device to continue.</>
              : <>We sent a link to <b>{email}</b> to choose a new password.</>}</p>
            <button className="btn g" style={{ marginTop: 14 }} onClick={() => setSent('')}>Back</button>
          </>
        ) : (
          <>
            <form onSubmit={submit}>
              <label className="field"><span>Email</span>
                <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </label>
              <label className="field"><span>Password</span>
                <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="Leave blank to get a link by email" />
              </label>
              <button className="btn" style={{ width: '100%', justifyContent: 'center' }} disabled={busy}>
                {busy ? 'One moment…' : password ? 'Sign in' : 'Email me a sign-in link'}
              </button>
              <button type="button" className="linkish" onClick={forgot} disabled={busy}>Forgot password?</button>
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
