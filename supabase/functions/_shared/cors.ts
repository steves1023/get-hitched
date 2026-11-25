export const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('SITE_URL') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Wraps a handler so any uncaught error still returns JSON with CORS headers.
 * Without this, a crash returns a bare 500 the browser hides as "Failed to send a request".
 */
export function withErrors(fn: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    try {
      return await fn(req);
    } catch (e) {
      const err = e as { message?: string; type?: string; raw?: { message?: string } };
      console.error('Unhandled error', err);
      const message = err?.raw?.message ?? err?.message ?? 'Unexpected error';
      const prefix = err?.type?.startsWith?.('Stripe') ? 'Payment setup problem: ' : '';
      return json({ error: `${prefix}${message}` }, 500);
    }
  };
}
