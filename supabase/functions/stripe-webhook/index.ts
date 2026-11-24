// Stripe calls this; deploy with --no-verify-jwt. Signature verification is the auth.
// Handles: Wedding Pass purchases and extra-people purchases (checkout.session.completed).
import Stripe from 'npm:stripe@17.7.0';
import { adminClient } from '../_shared/clients.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  httpClient: Stripe.createFetchHttpClient(),
});
const crypto = Stripe.createSubtleCryptoProvider();
const ok = () => new Response(JSON.stringify({ received: true }), { headers: { 'Content-Type': 'application/json' } });

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
  if (event.type !== 'checkout.session.completed') return ok();

  const s = event.data.object as Stripe.Checkout.Session;
  if (s.payment_status !== 'paid' && s.payment_status !== 'no_payment_required') return ok();
  const weddingId = s.metadata?.wedding_id ?? s.client_reference_id;
  if (!weddingId) return ok();

  const admin = adminClient();
  // Stripe may retry or duplicate deliveries; process each event once.
  const { data: isNew, error: recErr } = await admin.rpc('record_stripe_event', { p_id: event.id });
  if (recErr) { console.error(recErr); return new Response('Retry', { status: 500 }); }
  if (!isNew) return ok();

  try {
    const customerId = typeof s.customer === 'string' ? s.customer : s.customer?.id ?? null;

    if (s.metadata?.kind === 'seats') {
      const items = await stripe.checkout.sessions.listLineItems(s.id, { limit: 10 });
      const qty = items.data.reduce((n, li) => n + (li.quantity ?? 0), 0);
      const { error } = await admin.rpc('add_extra_seats', { p_wedding: weddingId, p_qty: qty });
      if (error) throw error;
    } else {
      const { data: w } = await admin.from('weddings').select('wedding_date').eq('id', weddingId).single();
      const base = w?.wedding_date ? new Date(w.wedding_date) : new Date(Date.now() + 365 * 86_400_000);
      const validUntil = new Date(base.getTime() + 90 * 86_400_000).toISOString().slice(0, 10);
      // Upsert touches only these columns, so any extra_seats already bought are kept.
      const { error } = await admin.from('entitlements').upsert({ wedding_id: weddingId, plan: 'pass', valid_until: validUntil });
      if (error) throw error;
    }

    if (customerId) {
      await admin.from('entitlements').update({ stripe_customer_id: customerId })
        .eq('wedding_id', weddingId).is('stripe_customer_id', null);
    }
    return ok();
  } catch (e) {
    console.error('Webhook processing failed', e);
    // Let Stripe retry: forget that we saw this event.
    await admin.from('processed_stripe_events').delete().eq('id', event.id);
    return new Response('Retry', { status: 500 });
  }
});
