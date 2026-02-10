# NeoLink Global GTM Dashboard (Revamp Starter)

This repository contains a React + TypeScript implementation of the NeoLink GTM dashboard brief, including:

- Scenario planning (Pilot/Ramp/Scale) with selector and duplication support.
- Top KPI row (revenue, total cost/unit, margin %, takt, risk score, Six Pack yield).
- Margin curve chart vs volume.
- Tabbed modules for Inputs, Inventory, Machines, Warehouses, Logistics, Maintenance, Quality, Six Pack, Risk, Audit, and Summary/Export.
- Inline editable tables with add-row behavior.
- Formula-based cost model and throughput metrics with documented calculation comments.
- Guardrail alerts for margin threshold, bottleneck risk, and single-source concentration.
- Export support (JSON + CSV for inventory and Six Pack).
- Local persistence via `localStorage` with Supabase sync support.
- Unit tests for Six Pack logic, cost model edge conditions, and scenario duplication integrity.

## Supabase connection

Project URL:

- `https://noxoplsorftdpmrbubid.supabase.co`

Create `.env`:

- `VITE_SUPABASE_URL=https://noxoplsorftdpmrbubid.supabase.co`
- `VITE_SUPABASE_ANON_KEY=<your-anon-key>`

## Step 2: Auth + RLS

Run SQL from `supabase/step2_auth_rls.sql` to create a user-scoped `scenarios` table and RLS policies.

## Step 3: Persistence (implemented)

Implemented in code:

- `src/lib/supabase.ts` creates Supabase client from env.
- `src/lib/store.ts` now uses async load/save with local fallback and Supabase upsert.
- `src/App.tsx` hydrates on startup and shows sync status.

Detailed rollout notes: `docs_SUPABASE.md`.

## Local run

```bash
npm install
npm run dev
```

## Tests

```bash
npm test
```
