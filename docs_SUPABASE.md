# Supabase rollout guide

## Step 2 (Auth + RLS)

1. In Supabase, enable at least one auth provider (email/password is enough to start).
2. Run SQL in `supabase/step2_auth_rls.sql`.
   - Note: `CREATE POLICY IF NOT EXISTS` is not supported in Supabase Postgres.
   - The script is rerunnable because it uses `DROP POLICY IF EXISTS` before each `CREATE POLICY`.
   - The script also upgrades pre-existing `scenarios` tables by adding/backfilling `created_by` and `updated_at`.
3. Ensure your frontend signs in users before save/read calls.
4. Verify RLS quickly:
   - User A creates a scenario.
   - User B should not be able to select/update/delete User A rows.

## Step 3 (implemented in code)

The app now attempts Supabase first, with localStorage fallback:
- `src/lib/supabase.ts` creates the client from env vars.
- `src/lib/store.ts` loads scenarios from Supabase, falls back to local state on error/empty.
- `src/lib/store.ts` saves locally and performs Supabase upsert by scenario name.
- `src/App.tsx` hydrates asynchronously and displays sync status.

## Troubleshooting

- `ERROR: 42703: column "created_by" does not exist`
  - Cause: older `scenarios` table existed before the auth columns were added.
  - Fix: rerun `supabase/step2_auth_rls.sql` (it now adds/backfills required columns).


- Store upsert conflict target is `name,created_by` to match the table unique constraint.
