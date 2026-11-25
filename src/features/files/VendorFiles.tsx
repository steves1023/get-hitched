import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { friendly } from '../../lib/errors';
import { bytes } from '../../lib/format';
import type { FileRow } from '../../lib/types';
import { deleteFile, downloadFile, fileIcon, uploadFile } from './fileOps';

/** Contracts, quotes and invoices for one vendor. Files also appear on the Files tab. */
export default function VendorFiles({ weddingId, vendorId, files, canEdit }: {
  weddingId: string; vendorId: string | null; files: FileRow[]; canEdit: boolean;
}) {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [status, setStatus] = useState(''); const [error, setError] = useState('');
  const [pick, setPick] = useState('');
  const refresh = () => qc.invalidateQueries({ queryKey: ['files', weddingId] });
  const mine = files.filter((f) => f.vendor_id === vendorId);
  const loose = files.filter((f) => !f.vendor_id);

  if (!vendorId) return <p className="small muted" style={{ marginTop: 6 }}>Save the vendor first, then you can attach contracts and quotes.</p>;

  const add = async (list: FileList | null) => {
    if (!list?.length) return;
    setError('');
    for (const f of Array.from(list)) {
      setStatus(`Uploading ${f.name}…`);
      try { await uploadFile(weddingId, f, vendorId); } catch (e) { setError(friendly(e)); }
    }
    setStatus(''); refresh();
  };
  const run = async (fn: () => Promise<unknown>) => { setError(''); try { await fn(); refresh(); } catch (e) { setError(friendly(e)); } };

  return (
    <fieldset style={{ border: 'none', margin: '6px 0 4px' }}>
      <legend className="ct" style={{ fontSize: '1rem', marginBottom: 8 }}>Attachments {mine.length > 0 && <span className="badge bw">{mine.length}</span>}</legend>
      {mine.length === 0 && <p className="small muted" style={{ marginBottom: 8 }}>No files yet. Contracts, quotes and invoices are good ones to keep here.</p>}
      {mine.map((f) => (
        <div className="fi" key={f.id}>
          <div className="th" aria-hidden>{fileIcon(f.mime_type)}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <b className="small" style={{ overflowWrap: 'anywhere' }}>{f.name}</b>
            <div className="small muted">{bytes(f.size_bytes)}</div>
          </div>
          <button type="button" className="btn g sm" onClick={() => run(() => downloadFile(f))} aria-label={`Download ${f.name}`}>↓</button>
          {canEdit && <>
            <button type="button" className="btn g sm" title="Keep the file, remove it from this vendor"
              onClick={() => run(async () => { const { error } = await supabase.from('files').update({ vendor_id: null }).eq('id', f.id); if (error) throw error; })}>Unlink</button>
            <button type="button" className="x-btn" aria-label={`Delete ${f.name}`}
              onClick={() => { if (confirm(`Delete ${f.name}? It will also be removed from the Files tab.`)) run(() => deleteFile(f)); }}>×</button>
          </>}
        </div>
      ))}
      {canEdit && (
        <>
          <div className={`zone${over ? ' over' : ''}`} role="button" tabIndex={0} style={{ padding: 16, marginTop: 6 }}
            onClick={() => input.current?.click()} onKeyDown={(e) => e.key === 'Enter' && input.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files); }}>
            📎 Drop files here or <u>browse</u> <small className="muted">· Max 10 MB each</small>
          </div>
          <input ref={input} type="file" multiple hidden onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
          {loose.length > 0 && (
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Attach a file already on the Files tab"
                style={{ flex: 1, padding: '7px 9px', border: '1.5px solid var(--border)', borderRadius: 8, background: 'var(--ivory)', font: 'inherit', fontSize: '.82rem' }}>
                <option value="">Attach a file already on the Files tab…</option>
                {loose.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
              <button type="button" className="btn g sm" disabled={!pick}
                onClick={() => run(async () => { const { error } = await supabase.from('files').update({ vendor_id: vendorId }).eq('id', pick); if (error) throw error; setPick(''); })}>Attach</button>
            </div>
          )}
          {status && <p className="small" style={{ marginTop: 6 }}>{status}</p>}
        </>
      )}
      {error && <p className="err">{error}</p>}
    </fieldset>
  );
}
