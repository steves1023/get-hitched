const MESSAGES: Record<string, string> = {
  FREE_LIMIT_GUESTS: 'The free plan holds 50 guests. Get the Wedding Pass to add more.',
  FREE_LIMIT_VISION: 'The free plan holds 20 inspiration images. Get the Wedding Pass for unlimited images.',
  FREE_LIMIT_COLLABORATORS: 'This wedding has reached the free plan’s 4 people. The couple can get the Wedding Pass to invite more.',
  FREE_LIMIT_HASHTAGS: 'The free plan includes 3 hashtag generations. Get the Wedding Pass for more.',
  HASHTAG_DAILY_LIMIT: 'You’ve reached today’s hashtag limit. Try again tomorrow.',
  FILES_STORAGE_FULL: 'File storage is full for your plan. Delete files or get the Wedding Pass for 2 GB.',
  PASS_REQUIRED: 'This feature is part of the Wedding Pass.',
  INVITE_NOT_FOUND: 'This invite link isn’t valid. Ask the couple to send a new one.',
  INVITE_USED: 'This invite has already been used.',
  INVITE_EXPIRED: 'This invite has expired. Ask the couple to send a new one.',
  INVITE_EMAIL_MISMATCH: 'This invite was sent to a different email address. Sign out and sign in with that address.',
  NOT_ALLOWED: 'You don’t have permission to do that.',
  SPICY_NOT_CONFIRMED: 'Confirm you’re both 18+ to use the Spicy vibe.',
  GENERATION_FAILED: 'Couldn’t generate hashtags right now. Try again in a moment.',
  '42501': 'You don’t have permission to do that.',
};

/** Turns Postgres/Edge Function errors into a sentence for the user. */
export function friendly(e: unknown): string {
  const msg = typeof e === 'string' ? e
    : e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : 'Something went wrong.';
  const code = e && typeof e === 'object' && 'code' in e ? String((e as { code: unknown }).code) : '';
  for (const key of Object.keys(MESSAGES)) {
    if (msg.includes(key) || code === key) return MESSAGES[key];
  }
  if (msg.includes('row-level security')) return MESSAGES['42501'];
  return msg;
}

/** Extracts `{ error }` from a supabase.functions.invoke failure. */
export async function functionError(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response })?.context;
  if (ctx && typeof ctx.json === 'function') {
    try { const body = await ctx.json(); if (body?.error) return friendly(body.error); } catch { /* ignore */ }
  }
  return friendly(error);
}
