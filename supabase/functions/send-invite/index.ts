// POST { invite_id } -> { link }
// Emails a magic link that signs the invitee in and lands them on /invite/:token.
// The invite row itself is created by the couple's client; RLS ensures only the couple can read it here.
import { corsHeaders, json, withErrors } from '../_shared/cors.ts';
import { anonClient, requireUser } from '../_shared/clients.ts';

Deno.serve(withErrors(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const auth = await requireUser(req);
  if (!auth) return json({ error: 'NOT_SIGNED_IN' }, 401);

  const { invite_id } = await req.json().catch(() => ({}));
  if (!invite_id) return json({ error: 'BAD_REQUEST' }, 400);

  const { data: invite } = await auth.supa
    .from('invites')
    .select('email, token, accepted_at, expires_at')
    .eq('id', invite_id)
    .single();
  if (!invite) return json({ error: 'NOT_ALLOWED' }, 403);
  if (invite.accepted_at) return json({ error: 'INVITE_USED' }, 400);

  const site = Deno.env.get('SITE_URL') ?? 'http://localhost:5173';
  const link = `${site}/invite/${invite.token}`;

  const { error } = await anonClient().auth.signInWithOtp({
    email: invite.email,
    options: { emailRedirectTo: link, shouldCreateUser: true },
  });
  if (error) {
    console.error('signInWithOtp failed', error.message);
    return json({ link, emailed: false });
  }
  return json({ link, emailed: true });
}));
