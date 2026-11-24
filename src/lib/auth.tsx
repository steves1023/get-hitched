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
      .then(({ data }) => setSession(data.session))
      .finally(() => { clearTimeout(fallback); setLoading(false); });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => { setSession(s); setLoading(false); });
    return () => { clearTimeout(fallback); data.subscription.unsubscribe(); };
  }, []);
  return <AuthCtx.Provider value={{ session, loading }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
