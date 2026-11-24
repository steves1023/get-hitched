import { describe, expect, it } from 'vitest';
import { dueBadge, daysUntil, money, pct, time12, initials } from './format';

const now = new Date(2026, 10, 22); // Nov 22, 2026

describe('dueBadge', () => {
  it('flags late tasks', () => expect(dueBadge('2026-11-10', false, now)).toEqual({ text: 'Nov 10 (12d late)', tone: 'br' }));
  it('shows days left within 30 days', () => expect(dueBadge('2026-12-20', false, now)).toEqual({ text: 'Dec 20 (28d)', tone: 'bg' }));
  it('shows full date when far out', () => expect(dueBadge('2027-03-01', false, now)?.tone).toBe('bw'));
  it('never shows late when done', () => expect(dueBadge('2026-11-10', true, now)?.tone).toBe('bw'));
  it('returns null without a date', () => expect(dueBadge(null, false, now)).toBeNull());
});

describe('helpers', () => {
  it('counts days to the wedding', () => expect(daysUntil('2027-06-20', now)).toBe(210));
  it('formats money', () => expect(money(12150)).toBe('$12,150'));
  it('formats 12-hour time', () => { expect(time12('08:00:00')).toBe('8:00 AM'); expect(time12('15:45')).toBe('3:45 PM'); expect(time12('00:30')).toBe('12:30 AM'); });
  it('computes capped percentages', () => { expect(pct(12150, 32000)).toBe(38); expect(pct(5, 0)).toBe(0); expect(pct(50, 10)).toBe(100); });
  it('builds initials', () => expect(initials('Sarah Miller')).toBe('SM'));
});
