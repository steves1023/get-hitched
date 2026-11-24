import { createContext, useContext, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';
import { MODULES, type Entitlement, type Level, type Member, type Module, type Wedding } from './types';

export interface Access {
  wedding: Wedding;
  me: Member;
  levels: Record<Module, Level>;
  isCouple: boolean;
  hasPass: boolean;
  /** Paid at some point (pass may have expired). */
  everPaid: boolean;
  /** Paid before but the pass has ended: everything is view-only. */
  expired: boolean;
  entitlement: Entitlement | null;
}

const Ctx = createContext<Access | null>(null);

export function useAccess(): Access {
  const a = useContext(Ctx);
  if (!a) throw new Error('useAccess outside a wedding');
  return a;
}

/** Loads the wedding, the caller's membership and per-tab levels, and the plan. */
export function useLoadAccess(weddingId: string, userId: string) {
  return useQuery({
    queryKey: ['access', weddingId, userId],
    queryFn: async (): Promise<Access | null> => {
      const [w, m, ent] = await Promise.all([
        supabase.from('weddings').select('*').eq('id', weddingId).maybeSingle(),
        supabase.from('wedding_members').select('*').eq('wedding_id', weddingId).eq('user_id', userId).maybeSingle(),
        supabase.from('entitlements').select('*').eq('wedding_id', weddingId).maybeSingle(),
      ]);
      if (w.error) throw w.error;
      if (!w.data || !m.data) return null;
      const me = m.data as Member;
      const isCouple = me.role === 'owner' || me.role === 'partner';
      const levels = Object.fromEntries(MODULES.map((k) => [k, isCouple ? 'edit' : 'none'])) as Record<Module, Level>;
      if (!isCouple) {
        const { data: rows, error } = await supabase.from('member_module_access').select('module, level').eq('member_id', me.id);
        if (error) throw error;
        for (const r of rows ?? []) levels[r.module as Module] = r.level as Level;
      }
      const entitlement = (ent.data as Entitlement | null) ?? null;
      const everPaid = !!entitlement && entitlement.plan !== 'free';
      const hasPass = everPaid && (!entitlement!.valid_until || entitlement!.valid_until >= new Date().toISOString().slice(0, 10));
      const expired = everPaid && !hasPass;
      // Same rules as public.my_access(): unpaid = nothing; expired = read-only.
      if (!hasPass) {
        for (const k of MODULES) levels[k] = expired ? (levels[k] === 'edit' ? 'read' : levels[k]) : 'none';
      }
      return { wedding: w.data as Wedding, me, levels, isCouple, hasPass, everPaid, expired, entitlement };
    },
  });
}

export function AccessProvider({ value, children }: { value: Access; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const canRead = (l: Level) => l === 'read' || l === 'edit';
