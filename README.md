# NeoLink Global GTM Dashboard

## Run locally

```bash
npm install
npm run dev
```

## Required env (for Supabase sync)

Create `.env` from `.env.example`:

```bash
cp .env.example .env
```

Fill values:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

If env vars are missing, the app still works with localStorage fallback.

## Hosting (GitHub Pages) — fully wired

This repo now includes automatic deploy workflow:

- `.github/workflows/deploy-pages.yml`
- Vite `base` is set to `/NL-Dashboard/` in GitHub Actions builds.

### One-time GitHub setup

1. In GitHub repo settings, open **Pages**.
2. Set **Source** to **GitHub Actions**.
3. (Optional for Supabase at build/runtime) add repo secrets:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

After that, every push to `main` or `work` auto-deploys.

Your site URL will be:

`https://Shaneos44.github.io/NL-Dashboard/`

## Supabase SQL

Run:

- `supabase/step2_auth_rls.sql`

This script is rerunnable and upgrades older `scenarios` tables (adds/backfills `created_by`, `updated_at`, and policies).
