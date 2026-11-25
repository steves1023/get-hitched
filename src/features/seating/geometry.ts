// Real-world table sizes (feet) and chair placement. All coordinates are feet.

export type TableKind = 'round60' | 'round72' | 'rect6' | 'rect8' | 'sweetheart';
export type ItemKind = 'dance_floor' | 'dj' | 'bar' | 'stage' | 'entrance' | 'cake' | 'buffet' | 'area' | 'column';
export type WallKind = 'wall' | 'half_wall' | 'divider';

export interface KindSpec { label: string; round: boolean; w: number; h: number; seats: number; max: number }

export const TABLE_KINDS: Record<TableKind, KindSpec> = {
  round60:    { label: 'Round 60″ (5 ft)',      round: true,  w: 5,   h: 5,   seats: 8,  max: 10 },
  round72:    { label: 'Round 72″ (6 ft)',      round: true,  w: 6,   h: 6,   seats: 10, max: 12 },
  rect6:      { label: 'Rectangle 6 ft',        round: false, w: 6,   h: 2.5, seats: 6,  max: 8 },
  rect8:      { label: 'Banquet 8 ft',          round: false, w: 8,   h: 2.5, seats: 8,  max: 10 },
  sweetheart: { label: 'Sweetheart (for two)',  round: false, w: 4,   h: 2.5, seats: 2,  max: 2 },
};

export const ITEM_KINDS: Record<ItemKind, { label: string; w: number; h: number }> = {
  dance_floor: { label: 'Dance floor', w: 20, h: 20 },
  dj:          { label: 'DJ / band',   w: 8,  h: 4 },
  bar:         { label: 'Bar',         w: 12, h: 3 },
  stage:       { label: 'Stage',       w: 16, h: 8 },
  entrance:    { label: 'Entrance',    w: 6,  h: 1 },
  cake:        { label: 'Cake table',  w: 3,  h: 3 },
  buffet:      { label: 'Buffet',      w: 12, h: 3 },
  area:        { label: 'Area',        w: 20, h: 15 },
  column:      { label: 'Column',      w: 2,  h: 2 },
};

export const WALL_KINDS: Record<WallKind, { label: string; hint: string; stroke: string; width: number; dash?: string }> = {
  wall:      { label: 'Wall',      hint: 'Full-height wall',                 stroke: '#4A4036', width: 0.5 },
  half_wall: { label: 'Half wall', hint: 'Low wall or bar back you can see over', stroke: '#8B7B66', width: 0.35 },
  divider:   { label: 'Divider',   hint: 'Drape, screen or movable partition', stroke: '#A89880', width: 0.2, dash: '0.6 0.4' },
};

export type Pt = { x: number; y: number };

/** 12′ 6″ style length. */
export function feetInches(ft: number): string {
  const total = Math.round(ft * 12);
  const f = Math.floor(total / 12), i = total % 12;
  return i ? `${f}′ ${i}″` : `${f}′`;
}

/**
 * Where a wall point should land: first an existing wall end within 1 ft, then straight/45° lines
 * from the start point, then the nearest half foot. Always kept inside the room.
 */
export function snapWallPoint(p: Pt, start: Pt | null, ends: Pt[], W: number, L: number): Pt {
  const inRoom = (q: Pt) => ({ x: Math.min(W, Math.max(0, q.x)), y: Math.min(L, Math.max(0, q.y)) });
  const near = ends.find((e) => Math.hypot(e.x - p.x, e.y - p.y) <= 1);
  if (near) return { ...near };
  let q = { x: Math.round(p.x * 2) / 2, y: Math.round(p.y * 2) / 2 };
  if (start) {
    const dx = q.x - start.x, dy = q.y - start.y;
    const ang = Math.abs((Math.atan2(dy, dx) * 180) / Math.PI);  // 0..180
    const off = (a: number) => Math.abs(ang - a);
    if (off(0) < 8 || off(180) < 8) q = { x: q.x, y: start.y };
    else if (off(90) < 8) q = { x: start.x, y: q.y };
    else if (off(45) < 6 || off(135) < 6) {
      const d = (Math.abs(dx) + Math.abs(dy)) / 2;
      q = { x: start.x + Math.sign(dx) * d, y: start.y + Math.sign(dy) * d };
    }
  }
  return inRoom(q);
}

export const CHAIR_R = 0.75;   // an 18-inch chair
const GAP = 1.0;               // chair centre sits 1 ft out from the table edge

/** Table footprint after rotation. */
export function footprint(kind: TableKind, rotation: number) {
  const k = TABLE_KINDS[kind];
  return rotation === 90 ? { w: k.h, h: k.w } : { w: k.w, h: k.h };
}

/** Chair centres relative to the table centre, clockwise from the top. */
export function seatOffsets(kind: TableKind, count: number, rotation: number): { x: number; y: number }[] {
  const k = TABLE_KINDS[kind];
  let pts: { x: number; y: number }[];
  if (k.round) {
    const r = k.w / 2 + GAP;
    pts = Array.from({ length: count }, (_, i) => {
      const a = (i / count) * Math.PI * 2 - Math.PI / 2;
      return { x: r * Math.cos(a), y: r * Math.sin(a) };
    });
  } else if (kind === 'sweetheart') {
    // Both chairs on one side, facing the room.
    pts = [{ x: -0.9, y: -(k.h / 2 + GAP) }, { x: 0.9, y: -(k.h / 2 + GAP) }].slice(0, count);
  } else {
    const top = Math.ceil(count / 2), bottom = count - top;
    const row = (n: number, y: number, reverse: boolean) => {
      const step = k.w / n;
      const xs = Array.from({ length: n }, (_, i) => -k.w / 2 + step * (i + 0.5));
      return (reverse ? xs.reverse() : xs).map((x) => ({ x, y }));
    };
    // Clockwise: top row left to right, then bottom row right to left.
    pts = [...row(top, -(k.h / 2 + GAP), false), ...row(bottom, k.h / 2 + GAP, true)];
  }
  return rotation === 90 ? pts.map((p) => ({ x: -p.y, y: p.x })) : pts;
}

export interface SeatGuest { id: string; name: string; party_size: number; seat_index: number | null; side: 'partner1' | 'partner2' | 'both' }
export type Seat = { guest: SeatGuest; plusOne: boolean } | null;

/** Who sits in each chair. Guests with a chosen chair first, then anyone seated without one. */
export function occupancy(capacity: number, guests: SeatGuest[]): Seat[] {
  const seats: Seat[] = Array(capacity).fill(null);
  const place = (g: SeatGuest, start: number) => {
    for (let k = 0; k < g.party_size; k++) {
      const idx = (start + k) % capacity;
      if (seats[idx] === null) seats[idx] = { guest: g, plusOne: k > 0 };
    }
  };
  for (const g of guests.filter((x) => x.seat_index !== null).sort((a, b) => a.seat_index! - b.seat_index!)) {
    if (g.seat_index! < capacity) place(g, g.seat_index!);
  }
  for (const g of guests.filter((x) => x.seat_index === null)) {
    const start = seats.findIndex((s) => s === null);
    if (start >= 0) place(g, start);
  }
  return seats;
}

/** Can this guest (and their party) sit starting at chair `start`, in chairs next to each other? */
export function canSit(seats: Seat[], start: number, guest: { id: string; party_size: number }): boolean {
  if (guest.party_size > seats.length) return false;
  for (let k = 0; k < guest.party_size; k++) {
    const s = seats[(start + k) % seats.length];
    if (s && s.guest.id !== guest.id) return false;
  }
  return true;
}

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');
}

/** Turn a square-footage figure into a plausible 3:2 room, clearly an estimate. */
export function roomFromArea(sqft: number) {
  const w = Math.sqrt(sqft / 1.5);
  return { width_ft: Math.round(w), length_ft: Math.round(w * 1.5) };
}
