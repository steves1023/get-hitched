import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { friendly } from '../lib/errors';

export const Badge = ({ tone = 'bb', children }: { tone?: string; children: ReactNode }) =>
  <span className={`badge ${tone}`}>{children}</span>;

export function PageHeader({ title, sub, action }: { title: string; sub: string; action?: ReactNode }) {
  return (
    <>
      <div className="ph"><h1 className="pt">{title}</h1>{action}</div>
      <div className="ps">{sub}</div>
    </>
  );
}

export const Stat = ({ value, label, color }: { value: ReactNode; label: string; color?: string }) => (
  <div className="stat"><div className="sn" style={color ? { color } : undefined}>{value}</div><div className="sl">{label}</div></div>
);

export const Bar = ({ pct }: { pct: number }) => <div className="bar" role="progressbar" aria-valuenow={pct}><i style={{ width: `${pct}%` }} /></div>;

export function Filters<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="filters" role="group">
      {options.map((o) => (
        <button key={o.value} type="button" className={`f${o.value === value ? ' on' : ''}`} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return <div className="empty"><p>{children}</p>{action}</div>;
}

export function Loading() {
  return <p className="muted">Loading…</p>;
}

export function ErrorNote({ error }: { error: unknown }) {
  return error ? <p className="err" role="alert">{friendly(error)}</p> : null;
}

export function Locked({ feature, weddingId }: { feature: string; weddingId: string }) {
  return (
    <div className="card lock">
      <div className="ic" aria-hidden>🔒</div>
      <h2 className="ct" style={{ justifyContent: 'center' }}>{feature} is part of the Wedding Pass</h2>
      <p className="muted" style={{ marginBottom: 16 }}>One payment covers everything through your wedding date plus 90 days.</p>
      <Link className="btn" to={`/w/${weddingId}/billing`}>See the Wedding Pass</Link>
    </div>
  );
}

export function useToast() {
  const [msg, setMsg] = useState('');
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(''), 2200); return () => clearTimeout(t); }, [msg]);
  const node = msg ? <div className="toast" role="status">{msg}</div> : null;
  return { show: setMsg, node };
}

export function Drawer({ open, title, onClose, children, footer }: {
  open: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <>
      <div className="overlay" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={title}>
        <header><h2>{title}</h2><button type="button" className="x-btn" onClick={onClose} aria-label="Close">×</button></header>
        <div className="body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </aside>
    </>
  );
}

export function Modal({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <>
      <div className="overlay" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="ph" style={{ marginBottom: 16 }}>
          <h2 className="pt" style={{ fontSize: '1.4rem' }}>{title}</h2>
          <button type="button" className="x-btn" onClick={onClose} aria-label="Close">×</button>
        </div>
        {children}
      </div>
    </>
  );
}

// ---------- Config-driven form drawer, used by most tabs ----------

export type FieldType = 'text' | 'number' | 'date' | 'time' | 'select' | 'textarea' | 'email' | 'url' | 'tel';
export interface FieldDef {
  key: string; label: string; type?: FieldType; required?: boolean;
  options?: { value: string; label: string }[]; placeholder?: string; min?: number; step?: number;
}
type Values = Record<string, unknown>;

export function FormDrawer({ open, title, fields, initial, onClose, onSubmit, onDelete, extra, submitLabel = 'Save' }: {
  open: boolean; title: string; fields: FieldDef[]; initial: Values;
  onClose: () => void; onSubmit: (v: Values) => Promise<void>; onDelete?: () => Promise<void>;
  extra?: (v: Values, set: (k: string, val: unknown) => void) => ReactNode; submitLabel?: string;
}) {
  const [values, setValues] = useState<Values>(initial);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setValues(initial); setError(null); } }, [open, initial]);
  const set = (k: string, val: unknown) => setValues((v) => ({ ...v, [k]: val }));

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setBusy(true); setError(null);
    try {
      const clean: Values = { ...values };
      for (const f of fields) {
        const v = clean[f.key];
        if (f.type === 'number') clean[f.key] = v === '' || v == null ? null : Number(v);
        else if (typeof v === 'string' && v.trim() === '' && !f.required) clean[f.key] = null;
      }
      await onSubmit(clean);
      onClose();
    } catch (err) { setError(err); } finally { setBusy(false); }
  };
  const del = async () => {
    if (!onDelete || !confirm('Delete this? This can’t be undone.')) return;
    setBusy(true);
    try { await onDelete(); onClose(); } catch (err) { setError(err); } finally { setBusy(false); }
  };

  return (
    <Drawer open={open} title={title} onClose={onClose} footer={
      <>
        {onDelete ? <button type="button" className="btn danger" onClick={del} disabled={busy}>Delete</button> : <span />}
        <button type="submit" form="drawer-form" className="btn" disabled={busy}>{busy ? 'Saving…' : submitLabel}</button>
      </>
    }>
      <form id="drawer-form" onSubmit={submit}>
        {fields.map((f) => {
          const v = values[f.key] ?? '';
          const common = { id: `f-${f.key}`, required: f.required, value: String(v), placeholder: f.placeholder };
          return (
            <label className="field" key={f.key} htmlFor={`f-${f.key}`}>
              <span>{f.label}{f.required ? ' *' : ''}</span>
              {f.type === 'select' ? (
                <select {...common} onChange={(e) => set(f.key, e.target.value)}>
                  {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : f.type === 'textarea' ? (
                <textarea {...common} onChange={(e) => set(f.key, e.target.value)} />
              ) : (
                <input {...common} type={f.type ?? 'text'} min={f.min} step={f.step} onChange={(e) => set(f.key, e.target.value)} />
              )}
            </label>
          );
        })}
        {extra?.(values, set)}
        <ErrorNote error={error} />
      </form>
    </Drawer>
  );
}
