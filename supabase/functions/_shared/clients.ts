import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.46.1';

const url = Deno.env.get('SUPABASE_URL')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

/** Acts as the calling user, so every query obeys RLS. */
export function userClient(req: Request): SupabaseClient {
  return createClient(url, anonKey, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false },
  });
}

/** Bypasses RLS. Use only after the caller has been authorized through userClient. */
export function adminClient(): SupabaseClient {
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

/** Anonymous client for sending magic links. */
export function anonClient(): SupabaseClient {
  return createClient(url, anonKey, { auth: { persistSession: false } });
}

export async function requireUser(req: Request) {
  const supa = userClient(req);
  const { data, error } = await supa.auth.getUser();
  if (error || !data.user) return null;
  return { supa, user: data.user };
}
