// Stripe calls this; deploy with --no-verify-jwt. Signature verification is the auth.
import Stripe from 'npm:stripe@17.7.0';
import { adminClient } from '../_shared/clients.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  httpClient: Stripe.createFetchHttpClient(),
});
const crypto = Stripe.createSubtleCryptoProvider();

Deno.serve(async (req) => {
  const signature = req.headers.get('Stripe-Signature');
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body, signature!, Deno.env.get('STRIPE_WEBHOOK_SECRET')!, undefined, crypto,
    );
  } catch (e) {
    console.error('Bad signature', e);
    return new Response('Bad signature', { status: 400 });
  }

  const admin = adminClient();

  if (event.type === 'checkout.session.completed') {
    const s = event.data.object as Stripe.Checkout.Session;
    const weddingId = s.metadata?.wedding_id ?? s.client_reference_id;
    if (!weddingId) return new Response('No wedding', { status: 200 });
    const plan = s.metadata?.plan === 'monthly' ? 'monthly' : 'pass';

    let validUntil: string | null = null;
    if (plan === 'pass') {
      const { data: w } = await admin.from('weddings').select('wedding_date').eq('id', weddingId).single();
      const base = w?.wedding_date ? new Date(w.wedding_date) : new Date(Date.now() + 365 * 86_400_000);
      validUntil = new Date(base.getTime() + 90 * 86_400_000).toISOString().slice(0, 10);
    }
    await admin.from('entitlements').upsert({
      wedding_id: weddingId,
      plan,
      valid_until: validUntil,
      stripe_customer_id: typeof s.customer === 'string' ? s.customer : s.customer?.id ?? null,
      stripe_subscription_id: typeof s.subscription === 'string' ? s.subscription : null,
    });
  }

  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object as Stripe.Subscription;
    await admin.from('entitlements')
      .update({ plan: 'free', valid_until: null, stripe_subscription_id: null })
      .eq('stripe_subscription_id', sub.id);
  }

  return new Response(JSON.stringify({ received: true }), { headers: { 'Content-Type': 'application/json' } });
});
