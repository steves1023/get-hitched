// POST { action: 'pass', wedding_id }            -> { url }  Wedding Pass checkout ($29.99, includes 5 people)
// POST { action: 'seats', wedding_id, qty? }     -> { url }  Extra people ($1.99 each, quantity adjustable at checkout)
// POST { action: 'portal', wedding_id }          -> { url }  Stripe customer portal (receipts)
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

  const { action, wedding_id, qty } = await req.json().catch(() => ({}));
  if (!wedding_id) return json({ error: 'BAD_REQUEST' }, 400);

  const { data: isCouple } = await auth.supa.rpc('is_couple', { w: wedding_id });
  if (!isCouple) return json({ error: 'NOT_ALLOWED' }, 403);

  const site = Deno.env.get('SITE_URL') ?? 'http://localhost:5173';
  const back = `${site}/w/${wedding_id}/billing`;
  const admin = adminClient();
  const { data: ent } = await admin.from('entitlements').select('*').eq('wedding_id', wedding_id).single();
  const { data: hasPass } = await admin.rpc('has_pass', { w: wedding_id });

  // Reuse the Stripe customer after the first purchase so receipts stay together in the portal.
  const customer = ent?.stripe_customer_id
    ? { customer: ent.stripe_customer_id as string }
    : { customer_email: auth.user.email, customer_creation: 'always' as const };

  if (action === 'portal') {
    if (!ent?.stripe_customer_id) return json({ error: 'NO_CUSTOMER' }, 400);
    const session = await stripe.billingPortal.sessions.create({ customer: ent.stripe_customer_id, return_url: back });
    return json({ url: session.url });
  }

  if (action === 'pass') {
    if (hasPass) return json({ error: 'ALREADY_HAS_PASS' }, 400);
    if (ent && ent.plan !== 'free') return json({ error: 'PASS_ENDED' }, 400);  // a repurchase would already be expired
    const price = Deno.env.get('STRIPE_PRICE_PASS');
    if (!price) return json({ error: 'PRICE_NOT_CONFIGURED' }, 500);
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price, quantity: 1 }],
      ...customer,
      allow_promotion_codes: true,
      invoice_creation: { enabled: true },
      client_reference_id: wedding_id,
      metadata: { wedding_id, kind: 'pass' },
      success_url: `${back}?status=success`,
      cancel_url: `${back}?status=cancelled`,
    });
    return json({ url: session.url });
  }

  if (action === 'seats') {
    if (!hasPass) return json({ error: 'PASS_REQUIRED' }, 400);
    const price = Deno.env.get('STRIPE_PRICE_SEAT');
    if (!price) return json({ error: 'PRICE_NOT_CONFIGURED' }, 500);
    const start = Math.max(1, Math.min(100, Number(qty) || 1));
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price, quantity: start, adjustable_quantity: { enabled: true, minimum: 1, maximum: 100 } }],
      ...customer,
      invoice_creation: { enabled: true },
      client_reference_id: wedding_id,
      metadata: { wedding_id, kind: 'seats' },
      success_url: `${back}?status=seats`,
      cancel_url: `${back}?status=cancelled`,
    });
    return json({ url: session.url });
  }

  return json({ error: 'BAD_REQUEST' }, 400);
});
