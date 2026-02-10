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
