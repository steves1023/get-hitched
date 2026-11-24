# Get Hitched

Wedding planning app: React 18 + Vite + TypeScript, Supabase (Postgres, Auth, Storage, Realtime, Edge Functions),
Stripe, Gemini, Netlify. Built from `get-hitched-mockup.html`.

The full step-by-step runbook (what to do after each component) lives in the **Get Hitched Build Guide**,
on its **Runbook** tab. This file is the short version.

## Quick start (local)

```bash
npm install
supabase init                 # creates supabase/config.toml; keep the existing migrations, functions and tests
supabase start                # local Postgres, Auth, Storage, Realtime; prints the anon key
supabase db reset             # applies supabase/migrations
supabase test db              # 16 permission tests must pass
cp .env.example .env.local    # paste the anon key from `supabase start`
cp supabase/functions/.env.example supabase/functions/.env   # fill in Gemini + Stripe test keys
supabase functions serve --env-file supabase/functions/.env  # separate terminal
npm run dev                   # http://localhost:5173 ; sign-in emails land in Inbucket/Mailpit (URL printed by supabase start)
```

## Layout

| Path | What it is |
| --- | --- |
| `supabase/migrations/` | Schema, RLS policies, plan limits, RPCs, storage buckets, realtime |
| `supabase/tests/rls_test.sql` | pgTAP tests proving who sees what |
| `supabase/functions/` | `generate-hashtags` (Gemini), `send-invite`, `billing` (Stripe Checkout/Portal), `stripe-webhook` |
| `src/lib/` | Supabase client, types, access context, formatting, error messages |
| `src/hooks/data.ts` | Query/mutation/realtime hooks used by every tab |
| `src/components/` | Shared UI (ported from the mockup's CSS) and the Share modal |
| `src/pages/` | Login, onboarding, invite acceptance, layout, settings, billing |
| `src/features/` | One file per tab |

## Deploy (summary)

1. `supabase link --project-ref <prod-ref>` then `supabase db push`.
2. `supabase secrets set --env-file supabase/functions/.env` (production values).
3. `supabase functions deploy generate-hashtags send-invite billing` and
   `supabase functions deploy stripe-webhook --no-verify-jwt`.
4. Netlify: connect the repo, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, deploy.
5. Stripe: add a webhook endpoint for `checkout.session.completed` and `customer.subscription.deleted`
   pointing at `https://<project-ref>.supabase.co/functions/v1/stripe-webhook`.

## Permission model

Owners and partners can edit everything. Everyone else gets a level per tab: `none`, `assigned` (Tasks and
Wedding Day only: just their own items), `read`, or `edit`. Postgres RLS enforces this; the UI only hides what
the database would refuse anyway.
