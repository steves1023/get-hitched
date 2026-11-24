const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Parses YYYY-MM-DD as a local calendar date (no timezone shift). */
export function parseDate(d: string): Date {
  const [y, m, day] = d.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, day);
}

export function today(): Date {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

export function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

export function daysUntil(d: string | null, now: Date = today()): number | null {
  return d ? daysBetween(now, parseDate(d)) : null;
}

export function shortDate(d: string): string {
  const x = parseDate(d);
  return `${MONTHS[x.getMonth()]} ${x.getDate()}`;
}

export function longDate(d: string): string {
  const x = parseDate(d);
  return `${MONTHS[x.getMonth()]} ${x.getDate()}, ${x.getFullYear()}`;
}

export function fullDate(d: string): string {
  return parseDate(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

/** Badge for a due date, matching the mockup: late (red), within 30 days (gold), later (neutral). */
export function dueBadge(due: string | null, done: boolean, now: Date = today()): { text: string; tone: string } | null {
  if (!due) return null;
  if (done) return { text: longDate(due), tone: 'bw' };
  const d = daysUntil(due, now)!;
  if (d < 0) return { text: `${shortDate(due)} (${-d}d late)`, tone: 'br' };
  if (d === 0) return { text: 'Due today', tone: 'bg' };
  if (d <= 30) return { text: `${shortDate(due)} (${d}d)`, tone: 'bg' };
  return { text: longDate(due), tone: 'bw' };
}

export function money(n: number | null | undefined): string {
  return (n ?? 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

export function time12(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');
}

export function pct(part: number, whole: number): number {
  return whole > 0 ? Math.min(100, Math.round((part / whole) * 100)) : 0;
}

/** Exact amount with cents, for prices. */
export function moneyCents(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
}
