import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';

export function objectPath(weddingId: string, fileName: string) {
  const safe = fileName.toLowerCase().replace(/[^a-z0-9.\-_]+/g, '-').slice(-80);
  return `${weddingId}/${crypto.randomUUID()}-${safe}`;
}

/** Signed URLs for private images, refreshed before the hour-long links expire. */
export function useSignedUrls(bucket: string, paths: string[]) {
  return useQuery({
    queryKey: ['signed', bucket, paths],
    enabled: paths.length > 0,
    staleTime: 50 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(bucket).createSignedUrls(paths, 3600);
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((d) => [d.path, d.signedUrl])) as Record<string, string>;
    },
  });
}

/** Shrinks photos to at most `max` px on the long edge before upload. */
export async function resizeImage(file: File, max = 1600): Promise<Blob> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.type === 'image/svg+xml') return file;
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return new Promise((res) => canvas.toBlob((b) => res(b ?? file), 'image/jpeg', 0.85));
}
