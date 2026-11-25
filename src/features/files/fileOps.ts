// Upload, download and delete files in the private "files" bucket. Shared by the Files tab and vendor attachments.
import { supabase } from '../../lib/supabase';
import { objectPath } from '../../lib/storage';
import type { FileRow } from '../../lib/types';

export const MAX_FILE = 10 * 1024 * 1024;
export const fileIcon = (mime: string | null) =>
  mime?.startsWith('image/') ? '🖼' : mime?.includes('pdf') ? '📄' : mime?.includes('sheet') || mime?.includes('excel') || mime?.includes('csv') ? '📊' : '📎';

export async function uploadFile(weddingId: string, f: File, vendorId: string | null = null): Promise<FileRow> {
  if (f.size > MAX_FILE) throw new Error(`${f.name} is over 10 MB.`);
  const path = objectPath(weddingId, f.name);
  const up = await supabase.storage.from('files').upload(path, f, { contentType: f.type || undefined });
  if (up.error) throw up.error;
  const { data, error } = await supabase.from('files')
    .insert({ wedding_id: weddingId, storage_path: path, name: f.name, size_bytes: f.size, mime_type: f.type || null, vendor_id: vendorId })
    .select().single();
  if (error) { await supabase.storage.from('files').remove([path]); throw error; }
  return data as FileRow;
}

export async function downloadFile(f: FileRow) {
  const { data, error } = await supabase.storage.from('files').createSignedUrl(f.storage_path, 60, { download: f.name });
  if (error) throw error;
  window.location.href = data.signedUrl;
}

export async function deleteFile(f: FileRow) {
  const { error } = await supabase.from('files').delete().eq('id', f.id);
  if (error) throw error;
  await supabase.storage.from('files').remove([f.storage_path]);
}
