import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { signOut, useAuth } from '../lib/auth';
import { friendly } from '../lib/errors';

export default function AcceptInvite() {
  const { token } = useParams();
  const { session, loading } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [error, setError] = useState('');
  const tried = useRef(false);

  useEffect(() => {
    if (loading || !session || !token || tried.current) return;
    tried.current = true;
    supabase.rpc('accept_invite', { p_token: token }).then(async ({ data, error }) => {
      if (error) return setError(friendly(error));
      await qc.invalidateQueries({ queryKey: ['my-weddings'] });
      nav(`/w/${data}`, { replace: true });
    });
  }, [loading, session, token, nav, qc]);

  if (loading) return null;
  return (
    <main className="auth">
      <h1>You’re invited</h1>
      <div className="card">
        {!session ? (
          <>
            <p style={{ marginBottom: 14 }}>Sign in with the email address the invite was sent to.</p>
            <Link className="btn" to={`/login?next=${encodeURIComponent(`/invite/${token}`)}`}>Sign in to accept</Link>
          </>
        ) : error ? (
          <>
            <p className="err">{error}</p>
            <button className="btn g" onClick={() => signOut()}>Sign out</button>
          </>
        ) : <p>Joining the wedding…</p>}
      </div>
    </main>
  );
}
