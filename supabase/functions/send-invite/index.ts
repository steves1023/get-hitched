// POST { invite_id } -> { link, emailed }
// Sends the invitation. With RESEND_API_KEY and EMAIL_FROM set, it sends a branded, personal email through Resend
// (not limited by Supabase's built-in email quota). Otherwise it falls back to Supabase's sign-in email.
// The invite row is created by the couple's client; RLS ensures only the couple can read it here.
import { corsHeaders, json, withErrors } from '../_shared/cors.ts';
import { adminClient, anonClient, requireUser } from '../_shared/clients.ts';
import { inviteEmail } from '../_shared/email.ts';

Deno.serve(withErrors(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const auth = await requireUser(req);
  if (!auth) return json({ error: 'NOT_SIGNED_IN' }, 401);

  const { invite_id } = await req.json().catch(() => ({}));
  if (!invite_id) return json({ error: 'BAD_REQUEST' }, 400);

  const { data: invite } = await auth.supa
    .from('invites')
    .select('email, display_name, role, token, accepted_at, wedding_id')
    .eq('id', invite_id)
    .single();
  if (!invite) return json({ error: 'NOT_ALLOWED' }, 403);
  if (invite.accepted_at) return json({ error: 'INVITE_USED' }, 400);

  const site = Deno.env.get('SITE_URL') ?? 'http://localhost:5173';
  const link = `${site}/invite/${invite.token}`;
  const resendKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('EMAIL_FROM');

  if (resendKey && from) {
    const [{ data: wedding }, { data: me }] = await Promise.all([
      auth.supa.from('weddings').select('partner1, partner2, wedding_date, venue').eq('id', invite.wedding_id).single(),
      auth.supa.from('wedding_members').select('display_name').eq('wedding_id', invite.wedding_id).eq('user_id', auth.user.id).single(),
    ]);
    // A one-time sign-in link that lands on the invitation. New people get an account created on the spot.
    const admin = adminClient();
    let gen = await admin.auth.admin.generateLink({ type: 'magiclink', email: invite.email, options: { redirectTo: link } });
    if (gen.error) gen = await admin.auth.admin.generateLink({ type: 'invite', email: invite.email, options: { redirectTo: link } });
    if (gen.error || !gen.data?.properties?.action_link) {
      console.error('generateLink failed', gen.error?.message);
      return json({ link, emailed: false });
    }
    const mail = inviteEmail({
      inviter: me?.display_name ?? 'The couple', inviteeName: invite.display_name,
      partner1: wedding?.partner1 ?? '', partner2: wedding?.partner2 ?? '', date: wedding?.wedding_date ?? null, venue: wedding?.venue ?? null,
      role: invite.role, signInUrl: gen.data.properties.action_link, inviteUrl: link, email: invite.email,
    });
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [invite.email], subject: mail.subject, html: mail.html, text: mail.text,
        reply_to: auth.user.email ? [auth.user.email] : undefined }),
    });
    if (!res.ok) { console.error('Resend error', res.status, await res.text()); return json({ link, emailed: false }); }
    return json({ link, emailed: true });
  }

  // Fallback: Supabase's own sign-in email (rate-limited on the built-in sender).
  const { error } = await anonClient().auth.signInWithOtp({
    email: invite.email,
    options: { emailRedirectTo: link, shouldCreateUser: true },
  });
  if (error) {
    console.error('signInWithOtp failed', error.message);
    return json({ link, emailed: false, reason: /rate limit/i.test(error.message) ? 'EMAIL_RATE_LIMIT' : 'EMAIL_FAILED' });
  }
  return json({ link, emailed: true });
}));
