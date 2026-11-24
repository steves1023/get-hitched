import { useMemo, useRef, useState } from 'react';
import { useAccess } from '../lib/access';
import { useRows, useTableMutations } from '../hooks/data';
import { supabase } from '../lib/supabase';
import { objectPath, resizeImage, useSignedUrls } from '../lib/storage';
import { friendly } from '../lib/errors';
import { VISION_CATEGORIES, type VisionItem } from '../lib/types';
import { Empty, ErrorNote, Filters, FormDrawer, Loading, PageHeader, type FieldDef } from '../components/ui';

export default function Vision() {
  const { wedding, levels } = useAccess();
  const canEdit = levels.vision === 'edit';
  const items = useRows<VisionItem>('vision_items', wedding.id, 'created_at', false);
  const m = useTableMutations<VisionItem>('vision_items', wedding.id);
  const [cat, setCat] = useState('all');
  const [pending, setPending] = useState<File | null>(null);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const all = items.data ?? [];
  const list = useMemo(() => all.filter((i) => cat === 'all' || i.category === cat), [all, cat]);
  const urls = useSignedUrls('vision', all.map((i) => i.storage_path));

  const fields: FieldDef[] = [
    { key: 'caption', label: 'Caption', placeholder: 'Blush peony bouquet' },
    { key: 'category', label: 'Category', type: 'select', options: Object.entries(VISION_CATEGORIES).map(([value, label]) => ({ value, label })) },
  ];

  const remove = async (i: VisionItem) => {
    if (!confirm('Remove this image?')) return;
    setError('');
    try {
      await m.remove.mutateAsync(i.id);
      await supabase.storage.from('vision').remove([i.storage_path]);
    } catch (e) { setError(friendly(e)); }
  };

  return (
    <>
      <PageHeader title="Vision board" sub="Collect photos and inspiration for your perfect day"
        action={canEdit && <button className="btn" onClick={() => fileRef.current?.click()}>+ Add image</button>} />
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) setPending(f); e.target.value = ''; }} />
      <Filters value={cat} onChange={setCat} options={[{ value: 'all', label: 'All' }, ...Object.entries(VISION_CATEGORIES).map(([value, label]) => ({ value, label }))]} />
      {error && <p className="err">{error}</p>}
      {items.isLoading ? <Loading /> : items.error ? <ErrorNote error={items.error} /> : all.length === 0 && !canEdit ? (
        <Empty>No inspiration added yet.</Empty>
      ) : (
        <div className="vg">
          {list.map((i) => (
            <div className="vi" key={i.id}>
              {urls.data?.[i.storage_path] && <img src={urls.data[i.storage_path]} alt={i.caption ?? 'Inspiration image'} loading="lazy" />}
              {i.caption && <span>{i.caption}</span>}
              {canEdit && <button className="x" aria-label="Remove image" onClick={() => remove(i)}>×</button>}
            </div>
          ))}
          {canEdit && (
            <button type="button" className="vadd" onClick={() => fileRef.current?.click()}>
              <div style={{ fontSize: '2rem', opacity: 0.5 }} aria-hidden>＋</div>Add inspiration
            </button>
          )}
        </div>
      )}
      <FormDrawer open={!!pending} title="Add image" submitLabel="Upload" fields={fields}
        initial={{ category: cat === 'all' ? 'venue' : cat, caption: '' }} onClose={() => setPending(null)}
        extra={() => pending && <p className="small muted">{pending.name}</p>}
        onSubmit={async (v) => {
          if (!pending) return;
          const blob = await resizeImage(pending);
          if (blob.size > 10 * 1024 * 1024) throw new Error('Images must be under 10 MB.');
          const path = objectPath(wedding.id, pending.name.replace(/\.\w+$/, '.jpg'));
          const up = await supabase.storage.from('vision').upload(path, blob, { contentType: blob.type || 'image/jpeg' });
          if (up.error) throw up.error;
          try {
            await m.insert.mutateAsync({ storage_path: path, caption: v.caption as string | null, category: v.category as string });
          } catch (e) {
            await supabase.storage.from('vision').remove([path]); // don't leave orphaned files when the row is refused
            throw e;
          }
        }} />
    </>
  );
}
