const MESSAGES: Record<string, string> = {
  FREE_LIMIT_GUESTS: 'The free plan holds 50 guests. Get the Wedding Pass to add more.',
  FREE_LIMIT_VISION: 'The free plan holds 20 inspiration images. Get the Wedding Pass for unlimited images.',
  FREE_LIMIT_COLLABORATORS: 'This wedding has reached its limit of people. The couple can add more on the Billing page.',
  SEAT_LIMIT: 'All of this wedding’s spots for people are taken. The couple can add more on the Billing page.',
  NO_FULL_SPOTS: 'All your Parents and Planners spots are in use. Add more on the Billing page.',
  NO_PARTY_SPOTS: 'Wedding Party invites open once your wedding is activated (up to 100 people).',
  PARTY_DAY_ONLY: 'Wedding Party spots include only the Wedding Day tab. To give more access, invite them as a parent or planner.',
  PARTNER_EXISTS: 'This wedding already has a partner. Invite this person with a different role.',
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
  PASS_ENDED: 'This wedding’s pass has already ended, so it can’t be bought again.',
  PROMO_NEEDS_PASS: 'This code adds people. Activate your wedding first, then enter it again; it hasn’t been used up.',
  VENUE_URL_INVALID: 'That doesn’t look like a public web address. Paste the venue page link, starting with https://.',
  VENUE_PAGE_UNREADABLE: 'Couldn’t read that page. Some venues put sizes in a PDF or image; enter the size by hand instead.',
  VENUE_DAILY_LIMIT: 'You’ve looked up room sizes 10 times today. Try again tomorrow, or enter the size by hand.',
  GIFT_HAS_NO_GIVER: 'Choose who gave this gift first (edit the gift), then write the note.',
  THANK_YOU_DAILY_LIMIT: 'You’ve drafted 100 notes today. Take a break and try again tomorrow.',
  GIFT_GIVER_MISMATCH: 'That guest belongs to a different wedding.',
  PROMO_INVALID: 'That code isn’t valid or has expired. Check the spelling and try again.',
  PROMO_ALREADY_USED: 'This wedding has already used that code.',
  ALREADY_HAS_PASS: 'This wedding already has the Wedding Pass, so that code isn’t needed. Codes for extra people still work here.',
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
