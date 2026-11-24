import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { Member } from '../lib/types';

/** All rows of a module table for one wedding. RLS decides which rows come back. */
export function useRows<T>(table: string, weddingId: string, orderBy = 'created_at', ascending = true, enabled = true) {
  return useQuery({
    queryKey: [table, weddingId],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from(table).select('*').eq('wedding_id', weddingId)
        .order(orderBy, { ascending, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as T[];
    },
  });
}

/** Insert, update and delete for one table, refreshing that table's query afterwards. */
export function useTableMutations<T extends { id: string }>(table: string, weddingId: string) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: [table, weddingId] });
  const summary = () => qc.invalidateQueries({ queryKey: ['summary', weddingId] });

  const insert = useMutation({
    mutationFn: async (row: Partial<T>) => {
      const { data, error } = await supabase.from(table).insert({ ...row, wedding_id: weddingId }).select().single();
      if (error) throw error;
      return data as T;
    },
    onSuccess: () => { refresh(); summary(); },
  });
  const update = useMutation({
    mutationFn: async ({ id, ...patch }: Partial<T> & { id: string }) => {
      const { data, error } = await supabase.from(table).update(patch).eq('id', id).select().single();
      if (error) throw error;
      return data as T;
    },
    onMutate: async (patch) => {
      // Optimistic update so checkboxes and drags feel instant.
      await qc.cancelQueries({ queryKey: [table, weddingId] });
      const prev = qc.getQueryData<T[]>([table, weddingId]);
      if (prev) qc.setQueryData<T[]>([table, weddingId], prev.map((r) => (r.id === patch.id ? { ...r, ...patch } : r)));
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData([table, weddingId], ctx.prev); },
    onSettled: () => { refresh(); summary(); },
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { refresh(); summary(); },
  });
  return { insert, update, remove, refresh };
}

/** Live updates: refetch a table when anyone on the wedding changes it. Respects RLS. */
export function useRealtime(table: string, weddingId: string) {
  const qc = useQueryClient();
  useEffect(() => {
    const channel = supabase
      .channel(`${table}:${weddingId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table, filter: `wedding_id=eq.${weddingId}` }, () => {
        qc.invalidateQueries({ queryKey: [table, weddingId] });
        qc.invalidateQueries({ queryKey: ['summary', weddingId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [table, weddingId, qc]);
}

export function useMembers(weddingId: string) {
  return useRows<Member>('wedding_members', weddingId, 'created_at');
}

export function useSummary(weddingId: string) {
  return useQuery({
    queryKey: ['summary', weddingId],
    queryFn: async () => {
      const { data, error } = await supabase.from('wedding_summary').select('*').eq('wedding_id', weddingId).single();
      if (error) throw error;
      return data as import('../lib/types').Summary;
    },
  });
}
