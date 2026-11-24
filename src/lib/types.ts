// Hand-written to match supabase/migrations. Regenerate exact types with:
//   supabase gen types typescript --local > src/lib/database.types.ts
export type Role = 'owner' | 'partner' | 'planner' | 'family' | 'wedding_party' | 'vendor';
export type Level = 'none' | 'assigned' | 'read' | 'edit';
export const MODULES = ['tasks', 'vendors', 'budget', 'guests', 'seating', 'day', 'vision', 'files', 'hashtags'] as const;
export type Module = (typeof MODULES)[number];

export interface Wedding {
  id: string; partner1: string; partner2: string; last_names: string | null; wedding_date: string | null;
  venue: string | null; theme: string | null; total_budget: number; notes: string; spicy_confirmed_at: string | null;
}
export interface Member { id: string; wedding_id: string; user_id: string; role: Role; display_name: string }
export interface Task {
  id: string; wedding_id: string; title: string; category: string; due_date: string | null;
  status: 'todo' | 'done'; assignee_member_id: string | null; notes: string | null;
}
export interface Vendor {
  id: string; wedding_id: string; name: string; category: string;
  status: 'researching' | 'booked' | 'deposit_paid' | 'paid_in_full';
  contact_name: string | null; phone: string | null; email: string | null; url: string | null; notes: string | null;
}
export interface VendorPayment { id: string; wedding_id: string; vendor_id: string; total: number; paid: number; due_date: string | null }
export interface Expense {
  id: string; wedding_id: string; label: string; category: string; vendor_id: string | null;
  amount: number; status: 'planned' | 'invoiced' | 'paid';
}
export interface Guest {
  id: string; wedding_id: string; name: string; side: 'partner1' | 'partner2' | 'both'; rsvp: 'pending' | 'yes' | 'no';
  party_size: number; dietary: string | null; email: string | null; table_id: string | null;
}
export interface SeatingTable { id: string; wedding_id: string; label: string; shape: 'round' | 'rect'; capacity: number; x: number; y: number }
export interface DayItem {
  id: string; wedding_id: string; start_time: string; title: string; who: string | null; location: string | null;
  duration_min: number | null; phase: 'morning_prep' | 'getting_ready' | 'ceremony' | 'reception';
  audience: 'everyone' | 'wedding_party' | 'couple_only'; done: boolean;
}
export interface DayItemAssignee { day_item_id: string; member_id: string; wedding_id: string }
export interface VisionItem { id: string; wedding_id: string; storage_path: string; caption: string | null; category: string }
export interface FileRow { id: string; wedding_id: string; storage_path: string; name: string; size_bytes: number; mime_type: string | null; created_at: string }
export interface Hashtag { id: string; wedding_id: string; tag: string; vibe: string | null; starred: boolean }
export interface Invite {
  id: string; wedding_id: string; email: string; display_name: string; role: Role;
  access: Partial<Record<Module, Level>>; token: string; expires_at: string; accepted_at: string | null;
}
export interface Entitlement {
  wedding_id: string; plan: 'free' | 'pass' | 'monthly'; valid_until: string | null;
  stripe_customer_id: string | null; extra_seats: number;
}

/** Display prices. Stripe charges whatever the price IDs say, so keep these in step with Stripe. */
export const PRICING = { pass: '$29.99', seat: '$1.99', seatCents: 199, includedWithPass: 5 } as const;

/** People besides the couple this wedding may have. Mirrors public.seat_limit(). */
export const seatLimit = (hasPass: boolean, extraSeats: number) =>
  hasPass ? PRICING.includedWithPass + extraSeats : 0;
export interface Summary {
  wedding_id: string; total_budget: number; tasks_total: number; tasks_done: number;
  guests_total: number; rsvp_yes: number; rsvp_pending: number; spent: number;
}

export const ROLE_LABEL: Record<Role, string> = {
  owner: 'Owner', partner: 'Partner', planner: 'Planner', family: 'Family', wedding_party: 'Wedding party', vendor: 'Vendor',
};

export const MODULE_LABEL: Record<Module, string> = {
  tasks: 'Tasks', vendors: 'Vendors', budget: 'Budget', guests: 'Guests', seating: 'Seating',
  day: 'Wedding Day', vision: 'Vision Board', files: 'Files', hashtags: 'Hashtags',
};

/** Defaults the couple can override per person when inviting. */
export const ROLE_PRESETS: Record<Exclude<Role, 'owner'>, Record<Module, Level>> = {
  partner:       { tasks: 'edit', vendors: 'edit', budget: 'edit', guests: 'edit', seating: 'edit', day: 'edit', vision: 'edit', files: 'edit', hashtags: 'edit' },
  planner:       { tasks: 'edit', vendors: 'edit', budget: 'read', guests: 'edit', seating: 'edit', day: 'edit', vision: 'read', files: 'edit', hashtags: 'none' },
  family:        { tasks: 'assigned', vendors: 'none', budget: 'none', guests: 'read', seating: 'read', day: 'read', vision: 'read', files: 'none', hashtags: 'read' },
  wedding_party: { tasks: 'assigned', vendors: 'none', budget: 'none', guests: 'none', seating: 'none', day: 'assigned', vision: 'read', files: 'none', hashtags: 'read' },
  vendor:        { tasks: 'none', vendors: 'none', budget: 'none', guests: 'none', seating: 'none', day: 'assigned', vision: 'none', files: 'none', hashtags: 'none' },
};

export const TASK_CATEGORIES = ['Venue', 'Catering', 'Photography', 'Flowers', 'Attire', 'Invitations', 'Music', 'Transport', 'Other'];
export const VENDOR_STATUS: Record<Vendor['status'], { label: string; tone: string }> = {
  researching: { label: 'Researching', tone: 'bb' }, booked: { label: 'Booked', tone: 'bs' },
  deposit_paid: { label: 'Deposit Paid', tone: 'bg' }, paid_in_full: { label: 'Paid in Full', tone: 'bs' },
};
export const PHASES: Record<DayItem['phase'], string> = {
  morning_prep: 'Morning Prep', getting_ready: 'Getting Ready', ceremony: 'Ceremony', reception: 'Reception',
};
export const VISION_CATEGORIES: Record<string, string> = {
  flowers: 'Flowers & Florals', venue: 'Venue & Decor', attire: 'Dress & Attire', food: 'Cake & Food', palette: 'Color Palette',
};
