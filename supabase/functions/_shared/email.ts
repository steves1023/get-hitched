// Branded HTML emails. Inline styles and tables only: email apps ignore most modern CSS.

const C = { ivory: '#FDFAF5', ink: '#1E1A14', gold: '#C4A35A', blush: '#9E5E54', warm: '#6B5E4E', muted: '#A89880', border: '#EAE2D8' };
const SERIF = "'Playfair Display', Georgia, 'Times New Roman', serif";
const SANS = "'Inter', -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

/** The shared frame: dark header with the wordmark, ivory card, quiet footer. */
export function layout(opts: { preheader: string; body: string; footer: string }): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><title>Get Hitched</title>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Inter:wght@400;600&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:${C.ivory};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(opts.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.ivory};">
  <tr><td align="center" style="padding:28px 14px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
      <tr><td style="background:${C.ink};border-radius:20px 20px 0 0;padding:22px 32px;">
        <span style="font-family:${SERIF};font-size:22px;font-weight:700;color:${C.gold};">&#10022; Get Hitched</span>
      </td></tr>
      <tr><td style="background:#FFFFFF;border:1px solid ${C.border};border-top:none;border-radius:0 0 20px 20px;padding:36px 32px 32px;">
        ${opts.body}
      </td></tr>
      <tr><td style="padding:20px 12px;font-family:${SANS};font-size:12px;line-height:18px;color:${C.muted};text-align:center;">
        ${opts.footer}
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

export function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0 8px;"><tr>
  <td style="background:${C.blush};border-radius:10px;">
    <a href="${esc(href)}" style="display:inline-block;padding:14px 28px;font-family:${SANS};font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;">${esc(label)}</a>
  </td></tr></table>`;
}

const ROLE_TEXT: Record<string, string> = {
  partner: 'You’ll have the same full access as the couple to plan everything together.',
  planner: 'You’ll be able to help with planning: tasks, vendors, guests, seating and the day itself.',
  family: 'You’ll be able to help with planning and see what the couple shares with you.',
  wedding_party: 'You’ll see the wedding day schedule: your moments and anything the couple assigns you.',
  vendor: 'You’ll see the parts of the wedding day schedule that involve you.',
};

export function inviteEmail(p: {
  inviter: string; inviteeName: string; partner1: string; partner2: string; date: string | null; venue: string | null;
  role: string; signInUrl: string; inviteUrl: string; email: string;
}): { subject: string; html: string; text: string } {
  const couple = `${p.partner1} & ${p.partner2}`;
  const when = [p.date ? new Date(`${p.date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : null, p.venue]
    .filter(Boolean).join(' · ');
  const roleLine = ROLE_TEXT[p.role] ?? ROLE_TEXT.family;
  const isPartner = p.role === 'partner';
  const subject = isPartner ? `${p.inviter} invited you to plan your wedding on Get Hitched` : `${p.inviter} invited you to help with ${couple}’s wedding`;
  const body = `
    <p style="margin:0 0 6px;font-family:${SANS};font-size:15px;color:${C.warm};">Hi ${esc(p.inviteeName)},</p>
    <p style="margin:0 0 22px;font-family:${SANS};font-size:15px;line-height:23px;color:${C.ink};">
      ${esc(p.inviter)} invited you to ${isPartner ? 'plan your wedding together' : 'help with their wedding'} on Get Hitched.
    </p>
    <div style="border-top:1px solid ${C.border};border-bottom:1px solid ${C.border};padding:22px 0;text-align:center;">
      <div style="font-family:${SERIF};font-size:32px;line-height:38px;font-weight:700;color:${C.ink};">${esc(couple)}</div>
      ${when ? `<div style="margin-top:8px;font-family:${SANS};font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:${C.muted};">${esc(when)}</div>` : ''}
      <div style="margin:12px auto 0;width:60px;height:1px;background:${C.gold};line-height:1px;font-size:1px;">&nbsp;</div>
    </div>
    <p style="margin:22px 0 0;font-family:${SANS};font-size:15px;line-height:23px;color:${C.ink};">${esc(roleLine)}</p>
    ${button(p.signInUrl, 'Join the wedding')}
    <p style="margin:14px 0 0;font-family:${SANS};font-size:13px;line-height:20px;color:${C.warm};">
      The button signs you in as <b>${esc(p.email)}</b>, so there’s no password to set. It works once and expires after about an hour.
      If it has expired, <a href="${esc(p.inviteUrl)}" style="color:${C.blush};">open your invitation</a> and sign in with this email address.
    </p>`;
  const html = layout({
    preheader: `${p.inviter} invited you to ${isPartner ? 'plan your wedding' : `${couple}’s wedding`} on Get Hitched.`,
    body,
    footer: `You received this because ${esc(p.inviter)} invited ${esc(p.email)} to their wedding on Get Hitched.<br>If you weren’t expecting it, you can ignore this email.`,
  });
  const text = [
    `Hi ${p.inviteeName},`, '', `${p.inviter} invited you to ${isPartner ? 'plan your wedding together' : 'help with their wedding'} on Get Hitched.`, '',
    couple, when, '', roleLine, '', `Join the wedding: ${p.signInUrl}`, '',
    `If that link has expired, open your invitation and sign in with ${p.email}: ${p.inviteUrl}`,
  ].join('\n');
  return { subject, html, text };
}
