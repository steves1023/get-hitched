import { describe, expect, it } from 'vitest';
import { canSit, feetInches, occupancy, roomFromArea, seatOffsets, snapWallPoint, type SeatGuest } from './geometry';

const g = (id: string, party = 1, seat: number | null = null): SeatGuest => ({ id, name: id, party_size: party, seat_index: seat, side: 'both' });

describe('seatOffsets', () => {
  it('puts 8 chairs around a 60-inch round, first at the top', () => {
    const p = seatOffsets('round60', 8, 0);
    expect(p).toHaveLength(8);
    expect(p[0].x).toBeCloseTo(0); expect(p[0].y).toBeCloseTo(-3.5);
  });
  it('splits a banquet table across both long sides', () => {
    const p = seatOffsets('rect8', 8, 0);
    expect(p.filter((s) => s.y < 0)).toHaveLength(4);
    expect(p.filter((s) => s.y > 0)).toHaveLength(4);
  });
  it('rotates rectangles by 90 degrees', () => {
    const p = seatOffsets('rect8', 8, 90);
    expect(p.every((s) => Math.abs(s.x) > 1.5)).toBe(true);
  });
  it('seats both people on one side of a sweetheart table', () => {
    const p = seatOffsets('sweetheart', 2, 0);
    expect(p[0].y).toBe(p[1].y);
  });
});

describe('occupancy', () => {
  it('places a party of two in neighbouring chairs', () => {
    const s = occupancy(8, [g('sarah', 2, 3)]);
    expect(s[3]?.guest.id).toBe('sarah'); expect(s[4]?.plusOne).toBe(true); expect(s[5]).toBeNull();
  });
  it('wraps around the table', () => {
    const s = occupancy(8, [g('tom', 2, 7)]);
    expect(s[7]?.guest.id).toBe('tom'); expect(s[0]?.plusOne).toBe(true);
  });
  it('fills chairless guests into the first free chairs', () => {
    const s = occupancy(8, [g('a', 1, 0), g('b')]);
    expect(s[1]?.guest.id).toBe('b');
  });
  it('checks for room next to each other', () => {
    const s = occupancy(8, [g('a', 1, 4)]);
    expect(canSit(s, 3, g('pair', 2))).toBe(false);
    expect(canSit(s, 5, g('pair', 2))).toBe(true);
  });
});

it('estimates a 3:2 room from square footage', () => {
  expect(roomFromArea(3750)).toEqual({ width_ft: 50, length_ft: 75 });
});

describe('walls', () => {
  it('formats lengths in feet and inches', () => { expect(feetInches(12.5)).toBe('12′ 6″'); expect(feetInches(30)).toBe('30′'); });
  it('straightens nearly horizontal and vertical walls', () => {
    expect(snapWallPoint({ x: 20.2, y: 10.9 }, { x: 5, y: 10 }, [], 60, 40)).toEqual({ x: 20, y: 10 });
    expect(snapWallPoint({ x: 5.8, y: 30.1 }, { x: 5, y: 10 }, [], 60, 40)).toEqual({ x: 5, y: 30 });
  });
  it('snaps to 45 degrees', () => {
    expect(snapWallPoint({ x: 15.3, y: 14.6 }, { x: 5, y: 5 }, [], 60, 40)).toEqual({ x: 15, y: 15 });
  });
  it('joins the end of an existing wall', () => {
    expect(snapWallPoint({ x: 30.4, y: 17.6 }, { x: 10, y: 2 }, [{ x: 30, y: 18 }], 60, 40)).toEqual({ x: 30, y: 18 });
  });
  it('stays inside the room', () => {
    expect(snapWallPoint({ x: 70, y: -3 }, null, [], 60, 40)).toEqual({ x: 60, y: 0 });
  });
});
