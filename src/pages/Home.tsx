import { Link, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { ROLE_LABEL, type Role } from '../lib/types';
import { ErrorNote, Loading } from '../components/ui';
import { fullDate } from '../lib/format';

interface Row { role: Role; wedding: { id: string; partner1: string; partner2: string; wedding_date: string | null } }

/** Sends people to their wedding, to onboarding, or to a picker if they belong to several. */
export default function Home() {
  const { session } = useAuth();
  const q = useQuery({
    queryKey: ['my-weddings', session!.user.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('wedding_members')
        .select('role, wedding:weddings(id, partner1, partner2, wedding_date)')
        .eq('user_id', session!.user.id);
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });
  if (q.isLoading) return <main className="auth"><Loading /></main>;
  if (q.error) return <main className="auth"><ErrorNote error={q.error} /></main>;
  const rows = q.data ?? [];
  if (rows.length === 0) return <Navigate to="/new" replace />;
  if (rows.length === 1) return <Navigate to={`/w/${rows[0].wedding.id}`} replace />;
  return (
    <main className="auth">
      <h1>Your weddings</h1>
      {rows.map((r) => (
        <Link key={r.wedding.id} to={`/w/${r.wedding.id}`} className="row click" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div style={{ flex: 1 }}>
            <div className="nm">{r.wedding.partner1} &amp; {r.wedding.partner2}</div>
            <div className="chips">
              <span className="badge bb">{ROLE_LABEL[r.role]}</span>
              {r.wedding.wedding_date && <span className="badge bw">{fullDate(r.wedding.wedding_date)}</span>}
            </div>
          </div>
        </Link>
      ))}
      <Link to="/new" className="btn g" style={{ marginTop: 12 }}>Plan a new wedding</Link>
    </main>
  );
}
