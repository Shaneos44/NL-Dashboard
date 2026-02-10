-- Step 2: Auth + Row Level Security for NeoLink Dashboard
-- This script is resilient for both fresh and pre-existing `public.scenarios` tables.

create extension if not exists pgcrypto;

create table if not exists public.scenarios (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  payload jsonb not null
);

-- Backfill/upgrade path for repos that created `scenarios` before auth fields existed.
alter table public.scenarios add column if not exists created_by uuid;
alter table public.scenarios add column if not exists updated_at timestamptz;
alter table public.scenarios add column if not exists payload jsonb;
alter table public.scenarios add column if not exists name text;

-- Backfill nulls to allow NOT NULL hardening.
update public.scenarios
set created_by = coalesce(created_by, auth.uid(), gen_random_uuid())
where created_by is null;

update public.scenarios
set updated_at = coalesce(updated_at, now())
where updated_at is null;

alter table public.scenarios alter column created_by set default auth.uid();
alter table public.scenarios alter column updated_at set default now();
alter table public.scenarios alter column created_by set not null;
alter table public.scenarios alter column updated_at set not null;

-- Ensure unique (name, created_by) exists for per-user scenario names.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'scenarios_name_owner_unique'
      and conrelid = 'public.scenarios'::regclass
  ) then
    alter table public.scenarios
      add constraint scenarios_name_owner_unique unique (name, created_by);
  end if;
end $$;

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
