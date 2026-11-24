// POST { action: 'checkout', wedding_id, plan: 'pass' | 'monthly' } -> { url }
// POST { action: 'portal', wedding_id } -> { url }
import Stripe from 'npm:stripe@17.7.0';
import { corsHeaders, json } from '../_shared/cors.ts';
import { adminClient, requireUser } from '../_shared/clients.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  httpClient: Stripe.createFetchHttpClient(),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const auth = await requireUser(req);
  if (!auth) return json({ error: 'NOT_SIGNED_IN' }, 401);

  const { action, wedding_id, plan } = await req.json().catch(() => ({}));
  if (!wedding_id) return json({ error: 'BAD_REQUEST' }, 400);

  const { data: isCouple } = await auth.supa.rpc('is_couple', { w: wedding_id });
  if (!isCouple) return json({ error: 'NOT_ALLOWED' }, 403);

  const site = Deno.env.get('SITE_URL') ?? 'http://localhost:5173';
  const back = `${site}/w/${wedding_id}/billing`;
  const admin = adminClient();
  const { data: ent } = await admin.from('entitlements').select('*').eq('wedding_id', wedding_id).single();

  if (action === 'portal') {
    if (!ent?.stripe_customer_id) return json({ error: 'NO_CUSTOMER' }, 400);
    const session = await stripe.billingPortal.sessions.create({ customer: ent.stripe_customer_id, return_url: back });
    return json({ url: session.url });
  }

  if (action === 'checkout') {
    const price = plan === 'monthly' ? Deno.env.get('STRIPE_PRICE_MONTHLY') : Deno.env.get('STRIPE_PRICE_PASS');
    if (!price) return json({ error: 'PRICE_NOT_CONFIGURED' }, 500);
    const session = await stripe.checkout.sessions.create({
      mode: plan === 'monthly' ? 'subscription' : 'payment',
      line_items: [{ price, quantity: 1 }],
      customer: ent?.stripe_customer_id ?? undefined,
      customer_email: ent?.stripe_customer_id ? undefined : auth.user.email,
      customer_creation: plan === 'monthly' || ent?.stripe_customer_id ? undefined : 'always',
      client_reference_id: wedding_id,
      metadata: { wedding_id, plan: plan === 'monthly' ? 'monthly' : 'pass' },
      subscription_data: plan === 'monthly' ? { metadata: { wedding_id } } : undefined,
      success_url: `${back}?status=success`,
      cancel_url: `${back}?status=cancelled`,
    });
    return json({ url: session.url });
  }

  return json({ error: 'BAD_REQUEST' }, 400);
});
