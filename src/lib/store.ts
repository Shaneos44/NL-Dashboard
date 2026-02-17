import { defaultScenarios } from './data';
import { supabase } from './supabase';
import type { ScenarioData } from './types';

const STORAGE_KEY = 'neolink-gtm-dashboard-v1';
const SCENARIO_TABLE = 'scenarios';

export interface AppState {
  selectedScenario: string;
  scenarios: Record<string, ScenarioData>;
}

interface ScenarioRow {
  name: string; // ✅ dynamic scenario names
  payload: ScenarioData;
}

export const defaultState: AppState = {
  selectedScenario: 'Pilot',
  // defaultScenarios is still fine as a starting dataset
  scenarios: defaultScenarios as unknown as Record<string, ScenarioData>,
};

function loadStateLocal(): AppState {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return defaultState;

  try {
    return JSON.parse(raw) as AppState;
  } catch {
    return defaultState;
  }
}

function saveStateLocal(state: AppState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export async function loadState(): Promise<AppState> {
  const local = loadStateLocal();
  if (!supabase) return local;

  // ✅ Load ALL scenarios for this user (RLS restricts rows)
  const { data, error } = await supabase.from(SCENARIO_TABLE).select('name,payload');

  if (error || !data || data.length === 0) return local;

  const scenarios: Record<string, ScenarioData> = structuredClone(local.scenarios ?? {});
  for (const row of data as ScenarioRow[]) {
    scenarios[row.name] = row.payload;
  }

  // Ensure selectedScenario exists
  const names = Object.keys(scenarios);
  const selectedScenario = scenarios[local.selectedScenario]
    ? local.selectedScenario
    : names.includes('Pilot')
      ? 'Pilot'
      : names[0] ?? 'Pilot';

  // If nothing existed remotely and local was empty, fall back
  if (names.length === 0) return local;

  return { selectedScenario, scenarios };
}

async function upsertScenario(row: ScenarioRow): Promise<void> {
  if (!supabase) return;

  await supabase.from(SCENARIO_TABLE).upsert(
    {
      name: row.name,
      payload: row.payload,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'name,created_by' }
  );
}

export async function saveState(state: AppState): Promise<void> {
  saveStateLocal(state);
  if (!supabase) return;

  const names = Object.keys(state.scenarios ?? {});
  await Promise.all(
    names.map((name) => upsertScenario({ name, payload: state.scenarios[name] }))
  );
}

/** Utilities used by App.tsx and tests */
export function duplicateScenario(state: AppState, source: string, target: string): AppState {
  const next = structuredClone(state) as AppState;

  const src = state.scenarios[source];
  if (!src) return state;

  next.scenarios[target] = {
    ...structuredClone(src),
    name: target,
    auditLog: [...(src.auditLog ?? []), `Duplicated from ${source} at ${new Date().toISOString()}`],
  };

  next.selectedScenario = target;
  return next;
}

export function exportScenarioJson(s: ScenarioData): string {
  return JSON.stringify(s, null, 2);
}

/**
 * Stock CSV export (current schema)
 */
export function stockCsv(s: ScenarioData): string {
  const header =
    'id,name,type,unitCost,uom,location,usagePerFinishedUnit,onHandQty,reorderPointQty,minQty,leadTimeDays,moq,singleSource';

  const rows = (s.stock ?? []).map((i) =>
    [
      i.id,
      i.name,
      i.type,
      i.unitCost,
      i.uom,
      i.location,
      i.usagePerFinishedUnit,
      i.onHandQty,
      i.reorderPointQty ?? '',
      i.minQty ?? '',
      i.leadTimeDays,
      i.moq,
      i.singleSource,
    ].join(',')
  );

  return [header, ...rows].join('\n');
}

/**
 * Backwards-compatible names (older imports)
 */
export function inventoryCsv(s: ScenarioData): string {
  return stockCsv(s);
}

export function sixPackCsv(_s: ScenarioData): string {
  return 'id,metric,mode,mean,stdDev,lsl,usl,flaggedPass\n';
}
