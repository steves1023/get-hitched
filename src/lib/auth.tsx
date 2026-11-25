import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

const AuthCtx = createContext<{ session: Session | null; loading: boolean }>({ session: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    // Never leave the page blank: if the session check is slow (bad network), render as signed out
    // and update as soon as the real answer arrives.
    const fallback = setTimeout(() => setLoading(false), 2500);
    supabase.auth.getSession()
      .then(async ({ data }) => {
        setSession(data.session);
        if (!data.session) return;
        // A saved session can outlive its account or server-side session (e.g. after an account was deleted).
        // If the server rejects it, clear it so the person lands on sign-in instead of a half-working app.
        const { error } = await supabase.auth.getUser();
        if (error && 'status' in error && (error.status === 401 || error.status === 403)) {
          await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
          setSession(null);
        }
      })
      .finally(() => { clearTimeout(fallback); setLoading(false); });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => { setSession(s); setLoading(false); });
    return () => { clearTimeout(fallback); data.subscription.unsubscribe(); };
  }, []);
  return <AuthCtx.Provider value={{ session, loading }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);

/**
 * Sign out reliably. Ask the server to end the session, but always clear this device's copy and
 * go to sign-in, even if the server no longer recognises the session (e.g. after an account change).
 */
export async function signOut() {
  try { await supabase.auth.signOut(); } catch { /* server may reject a stale session */ }
  try { await supabase.auth.signOut({ scope: 'local' }); } catch { /* already cleared */ }
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith('sb-') && k.includes('auth')) localStorage.removeItem(k);
  } catch { /* private mode */ }
  window.location.assign('/login');
}
