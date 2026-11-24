import { useRef, useState } from 'react';
import { useAccess } from '../lib/access';
import { useRows, useTableMutations } from '../hooks/data';
import { supabase } from '../lib/supabase';
import { objectPath } from '../lib/storage';
import { friendly } from '../lib/errors';
import { bytes } from '../lib/format';
import type { FileRow } from '../lib/types';
import { Empty, ErrorNote, Loading, PageHeader } from '../components/ui';

const MAX = 10 * 1024 * 1024;
const icon = (mime: string | null) => (mime?.startsWith('image/') ? '🖼' : mime?.includes('pdf') ? '📄' : mime?.includes('sheet') || mime?.includes('excel') || mime?.includes('csv') ? '📊' : '📎');

export default function Files() {
  const { wedding, levels } = useAccess();
  const canEdit = levels.files === 'edit';
  const files = useRows<FileRow>('files', wedding.id, 'created_at', false);
  const m = useTableMutations<FileRow>('files', wedding.id);
  const [over, setOver] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = async (list: FileList | null) => {
    if (!list?.length) return;
    setError(''); setStatus('');
    for (const f of Array.from(list)) {
      if (f.size > MAX) { setError(`${f.name} is over 10 MB.`); continue; }
      setStatus(`Uploading ${f.name}…`);
      const path = objectPath(wedding.id, f.name);
      const up = await supabase.storage.from('files').upload(path, f, { contentType: f.type || undefined });
      if (up.error) { setError(friendly(up.error)); continue; }
      try {
        await m.insert.mutateAsync({ storage_path: path, name: f.name, size_bytes: f.size, mime_type: f.type || null });
      } catch (e) {
        await supabase.storage.from('files').remove([path]);
        setError(friendly(e));
      }
    }
    setStatus('');
  };

  const download = async (f: FileRow) => {
    const { data, error } = await supabase.storage.from('files').createSignedUrl(f.storage_path, 60, { download: f.name });
    if (error) return setError(friendly(error));
    window.location.href = data.signedUrl;
  };

  const remove = async (f: FileRow) => {
    if (!confirm(`Delete ${f.name}?`)) return;
    try { await m.remove.mutateAsync(f.id); await supabase.storage.from('files').remove([f.storage_path]); }
    catch (e) { setError(friendly(e)); }
  };

  return (
    <>
      <PageHeader title="Files & attachments" sub="Contracts, photos, documents — everything in one place" />
      {canEdit && (
        <div className="card">
          <div className={`zone${over ? ' over' : ''}`} role="button" tabIndex={0}
            onClick={() => inputRef.current?.click()} onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); upload(e.dataTransfer.files); }}>
            <div style={{ fontSize: '2rem', opacity: 0.5 }} aria-hidden>📎</div>
            Drag &amp; drop files here, or click to browse<br />
            <small className="muted">Images, PDFs, Word docs, spreadsheets · Max 10 MB per file</small>
          </div>
          <input ref={inputRef} type="file" multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
          {status && <p className="small" style={{ marginTop: 8 }}>{status}</p>}
        </div>
      )}
      {error && <p className="err">{error}</p>}
      <div className="card">
        <h2 className="ct">Uploaded files</h2>
        {files.isLoading ? <Loading /> : files.error ? <ErrorNote error={files.error} /> : (files.data ?? []).length === 0 ? (
          <Empty>No files yet. Contracts and quotes are good ones to keep here.</Empty>
        ) : (files.data ?? []).map((f) => (
          <div className="fi" key={f.id}>
            <div className="th" aria-hidden>{icon(f.mime_type)}</div>
            <div style={{ flex: 1, minWidth: 0 }}><b className="small" style={{ overflowWrap: 'anywhere' }}>{f.name}</b></div>
            <span className="small muted">{bytes(f.size_bytes)}</span>
            <button className="btn g sm" aria-label={`Download ${f.name}`} onClick={() => download(f)}>↓</button>
            {canEdit && <button className="btn danger sm" aria-label={`Delete ${f.name}`} onClick={() => remove(f)}>×</button>}
          </div>
        ))}
      </div>
    </>
  );
}
