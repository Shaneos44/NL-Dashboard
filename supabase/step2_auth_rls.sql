-- Step 2: Auth + Row Level Security for NeoLink Dashboard

create extension if not exists pgcrypto;

create table if not exists public.scenarios (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  payload jsonb not null,
  created_by uuid not null default auth.uid(),
  updated_at timestamptz not null default now(),
  constraint scenarios_name_owner_unique unique (name, created_by)
);

alter table public.scenarios enable row level security;

-- PostgreSQL/Supabase does not support CREATE POLICY IF NOT EXISTS,
-- so make this script rerunnable by dropping policies first.
drop policy if exists "scenarios_select_own" on public.scenarios;
drop policy if exists "scenarios_insert_own" on public.scenarios;
drop policy if exists "scenarios_update_own" on public.scenarios;
drop policy if exists "scenarios_delete_own" on public.scenarios;

-- Users can read only their own rows.
create policy "scenarios_select_own"
  on public.scenarios
  for select
  to authenticated
  using (created_by = auth.uid());

-- Users can insert only rows for themselves.
create policy "scenarios_insert_own"
  on public.scenarios
  for insert
  to authenticated
  with check (created_by = auth.uid());

-- Users can update only their own rows.
create policy "scenarios_update_own"
  on public.scenarios
  for update
  to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

-- Users can delete only their own rows.
create policy "scenarios_delete_own"
  on public.scenarios
  for delete
  to authenticated
  using (created_by = auth.uid());

create index if not exists idx_scenarios_owner_updated
  on public.scenarios (created_by, updated_at desc);
