import { useState } from 'react';
import { Link, NavLink, Outlet, useParams } from 'react-router-dom';
import { AccessProvider, useLoadAccess } from '../lib/access';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { daysUntil, fullDate } from '../lib/format';
import type { Level, Module } from '../lib/types';
import { ErrorNote, Loading } from '../components/ui';
import ShareModal from '../components/ShareModal';

const TABS: { to: string; module: Module | null; label: string; assignedLabel?: string }[] = [
  { to: '', module: null, label: 'Overview' },
  { to: 'tasks', module: 'tasks', label: 'Tasks', assignedLabel: 'My Tasks' },
  { to: 'vendors', module: 'vendors', label: 'Vendors' },
  { to: 'budget', module: 'budget', label: 'Budget' },
  { to: 'guests', module: 'guests', label: 'Guests' },
  { to: 'seating', module: 'seating', label: 'Seating' },
  { to: 'day', module: 'day', label: 'Wedding Day', assignedLabel: 'Day Of' },
  { to: 'vision', module: 'vision', label: 'Vision Board' },
  { to: 'files', module: 'files', label: 'Files' },
  { to: 'hashtags', module: 'hashtags', label: '# Hashtags' },
];

export default function WeddingLayout() {
  const { weddingId } = useParams();
  const { session } = useAuth();
  const q = useLoadAccess(weddingId!, session!.user.id);
  const [share, setShare] = useState(false);

  if (q.isLoading) return <main id="content"><Loading /></main>;
  if (q.error) return <main id="content"><ErrorNote error={q.error} /></main>;
  if (!q.data) {
    return <main className="auth"><h1>Wedding not found</h1><p>You may not be a member of this wedding. <Link to="/">Go to your weddings</Link></p></main>;
  }
  const a = q.data;
  const days = daysUntil(a.wedding.wedding_date);
  const visible = TABS.filter((t) => !t.module || a.levels[t.module] !== 'none');
  const label = (t: (typeof TABS)[number]) => (t.module && a.levels[t.module] === ('assigned' as Level) && t.assignedLabel) || t.label;

  return (
    <AccessProvider value={a}>
      <header id="header">
        <Link id="hTitle" to={`/w/${a.wedding.id}`}>✦ Get Hitched</Link>
        <div className="hr">
          {a.wedding.wedding_date && <span className="hdate">{fullDate(a.wedding.wedding_date)}</span>}
          {a.isCouple && <button className="hbtn" onClick={() => setShare(true)}>⇄ Share</button>}
          {a.isCouple && <Link className="hbtn" to="settings">⚙ Settings</Link>}
          {a.isCouple && <Link className="hbtn" to="billing">💳 Billing</Link>}
          <button className="hbtn" onClick={() => supabase.auth.signOut()}>Sign Out</button>
        </div>
      </header>
      {days !== null && (
        <div id="countdown">
          <span className="cd-n">{days >= 0 ? days : 'Married!'}</span>
          <span className="cd-l">{days > 0 ? 'Days until your wedding' : days === 0 ? 'Today’s the day' : 'Congratulations'}</span>
        </div>
      )}
      <nav id="nav" aria-label="Sections">
        {visible.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.to === ''} className={({ isActive }) => `tab${isActive ? ' on' : ''}`}>{label(t)}</NavLink>
        ))}
      </nav>
      <main id="content"><Outlet /></main>
      {a.isCouple && <ShareModal open={share} onClose={() => setShare(false)} />}
    </AccessProvider>
  );
}
