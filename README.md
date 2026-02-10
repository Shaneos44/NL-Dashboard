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

After the first successful deploy, your site URL will be:

`https://Shaneos44.github.io/NL-Dashboard/`

### If you see "There isn't a GitHub Pages site here"

1. Go to **Settings → Pages**.
2. Set **Source** to **GitHub Actions**.
3. Push a new commit to `main` or `work` (or run the workflow manually from Actions).
4. Wait for **Deploy to GitHub Pages** workflow to finish successfully.

## Supabase SQL

Run:

- `supabase/step2_auth_rls.sql`

This script is rerunnable and upgrades older `scenarios` tables (adds/backfills `created_by`, `updated_at`, and policies).
# NeoLink Global GTM Dashboard (Revamp Starter)

This repository now contains a React + TypeScript starter implementation of the NeoLink GTM dashboard brief, including:

- Scenario planning (Pilot/Ramp/Scale) with selector and duplication support.
- Top KPI row (revenue, total cost/unit, margin %, takt, risk score, Six Pack yield).
- Margin curve chart vs volume.
- Tabbed modules for Inputs, Inventory, Machines, Warehouses, Logistics, Maintenance, Quality, Six Pack, Risk, Audit, and Summary/Export.
- Inline editable tables with add-row behavior.
- Formula-based cost model and throughput metrics with documented calculation comments.
- Guardrail alerts for margin threshold, bottleneck risk, and single-source concentration.
- Export support (JSON + CSV for inventory and Six Pack).
- Local persistence via `localStorage`.
- Unit tests for Six Pack logic, cost model edge conditions, and scenario duplication integrity.

## Supabase connection (next step)

You shared this project URL:

- `https://noxoplsorftdpmrbubid.supabase.co`

To enable server persistence:

1. Create a `.env` file with:
   - `VITE_SUPABASE_URL=https://noxoplsorftdpmrbubid.supabase.co`
   - `VITE_SUPABASE_ANON_KEY=<your-anon-key>`
2. Add a `scenarios` table in Supabase with columns:
   - `id (uuid, pk)`
   - `name (text)`
   - `payload (jsonb)`
   - `updated_at (timestamptz default now())`
3. Add Supabase JS client and replace `loadState/saveState` in `src/lib/store.ts` with async reads/writes.
4. Keep localStorage as offline fallback.

## Local run

```bash
npm install
npm run dev
```

## Tests

```bash
npm test
```
