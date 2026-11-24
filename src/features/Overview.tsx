import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAccess, canRead } from '../lib/access';
import { useRows, useSummary } from '../hooks/data';
import { supabase } from '../lib/supabase';
import { dueBadge, money, pct } from '../lib/format';
import type { Task } from '../lib/types';
import { Badge, Bar, Stat } from '../components/ui';

export default function Overview() {
  const { wedding, levels, isCouple, me } = useAccess();
  const summary = useSummary(wedding.id);
  const tasks = useRows<Task>('tasks', wedding.id, 'due_date', true, levels.tasks !== 'none');
  const s = summary.data;
  const showBudget = canRead(levels.budget);
  const showGuests = canRead(levels.guests);
  const showTasks = levels.tasks !== 'none';
  const upcoming = (tasks.data ?? []).filter((t) => t.status !== 'done').slice(0, 4);

  return (
    <>
      <h1 className="pt">{isCouple ? 'Dashboard' : `Hi, ${me.display_name}`}</h1>
      <div className="ps">{wedding.partner1} &amp; {wedding.partner2}{wedding.venue ? ` · ${wedding.venue}` : ''}</div>

      {s && (
        <div className="g4" style={{ marginBottom: 16 }}>
          {showTasks && levels.tasks !== 'assigned' && <Stat value={`${s.tasks_done}/${s.tasks_total}`} label="Tasks done" />}
          {showGuests && <Stat value={s.guests_total} label="Guests" />}
          {showGuests && <Stat value={s.rsvp_yes} label="RSVP yes" />}
          {showBudget && <Stat value={`${pct(s.spent, s.total_budget)}%`} label="Budget used" />}
        </div>
      )}

      <div className="g2">
        {showTasks && (
          <div className="card">
            <h2 className="ct">{levels.tasks === 'assigned' ? 'Your tasks' : 'Upcoming tasks'}</h2>
            {upcoming.length === 0 && <p className="muted">Nothing open. Nice work.</p>}
            {upcoming.map((t) => {
              const due = dueBadge(t.due_date, false);
              return (
                <div className="row" key={t.id}>
                  <div><div className="nm">{t.title}</div>
                    <div className="chips"><Badge>{t.category}</Badge>{due && <Badge tone={due.tone}>{due.text}</Badge>}</div>
                  </div>
                </div>
              );
            })}
            <Link to="tasks" className="small">See all tasks</Link>
          </div>
        )}
        {showBudget && s && (
          <div className="card">
            <h2 className="ct">Budget summary</h2>
            <Line label="Total budget" value={money(s.total_budget)} />
            <Line label="Spent" value={money(s.spent)} color="var(--blush-d)" />
            <Line label="Remaining" value={money(s.total_budget - s.spent)} color="var(--sage-d)" />
            <Bar pct={pct(s.spent, s.total_budget)} />
            <div className="small muted">{pct(s.spent, s.total_budget)}% of budget used</div>
          </div>
        )}
      </div>
      {(isCouple || me.role === 'planner') && <Notes weddingId={wedding.id} initial={wedding.notes} editable={isCouple} />}
    </>
  );
}

const Line = ({ label, value, color }: { label: string; value: string; color?: string }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span>{label}</span><b style={{ color }}>{value}</b></div>
);

/** Autosaves one second after typing stops. */
function Notes({ weddingId, initial, editable }: { weddingId: string; initial: string; editable: boolean }) {
  const [text, setText] = useState(initial);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (!editable) return;
    setState('saving');
    const t = setTimeout(async () => {
      const { error } = await supabase.from('weddings').update({ notes: text }).eq('id', weddingId);
      setState(error ? 'error' : 'saved');
    }, 1000);
    return () => clearTimeout(t);
  }, [text, weddingId, editable]);
  return (
    <div className="card">
      <h2 className="ct">Notes &amp; ideas <span className="small muted" style={{ fontFamily: 'var(--sans)', fontWeight: 400 }}>
        {state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved' : state === 'error' ? 'Couldn’t save' : ''}</span></h2>
      <textarea className="notes" value={text} readOnly={!editable} aria-label="Notes and ideas"
        placeholder="Ask venue about rain plan…" onChange={(e) => setText(e.target.value)} />
    </div>
  );
}
