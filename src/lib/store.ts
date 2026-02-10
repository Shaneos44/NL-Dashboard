import { defaultScenarios } from './data';
import { supabase } from './supabase';
import { ScenarioData, ScenarioName } from './types';

const STORAGE_KEY = 'neolink-gtm-dashboard-v1';
const SCENARIO_TABLE = 'scenarios';
import { ScenarioData, ScenarioName } from './types';

const STORAGE_KEY = 'neolink-gtm-dashboard-v1';

export interface AppState {
  selectedScenario: ScenarioName;
  scenarios: Record<ScenarioName, ScenarioData>;
}

interface ScenarioRow {
  name: ScenarioName;
  payload: ScenarioData;
}

export const defaultState: AppState = {
  selectedScenario: 'Pilot',
  scenarios: defaultScenarios,
};

function loadStateLocal(): AppState {
export function loadState(): AppState {
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

  if (!supabase) {
    return local;
  }

  const { data, error } = await supabase
    .from(SCENARIO_TABLE)
    .select('name,payload')
    .in('name', ['Pilot', 'Ramp', 'Scale']);

  if (error || !data || data.length === 0) {
    return local;
  }

  const scenarios = structuredClone(local.scenarios);
  for (const row of data as ScenarioRow[]) {
    scenarios[row.name] = row.payload;
  }

  return {
    selectedScenario: local.selectedScenario,
    scenarios,
  };
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

  if (!supabase) {
    return;
  }

  await Promise.all(
    (Object.keys(state.scenarios) as ScenarioName[]).map((name) => upsertScenario({ name, payload: state.scenarios[name] }))
  );
}

export function saveState(state: AppState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function duplicateScenario(state: AppState, source: ScenarioName, target: ScenarioName): AppState {
  const next = structuredClone(state) as AppState;
  next.scenarios[target] = {
    ...structuredClone(state.scenarios[source]),
    name: target,
    auditLog: [...state.scenarios[source].auditLog, `Duplicated from ${source} at ${new Date().toISOString()}`],
  };
  return next;
}

export function exportScenarioJson(s: ScenarioData): string {
  return JSON.stringify(s, null, 2);
}

export function inventoryCsv(s: ScenarioData): string {
  const header = 'id,name,category,unitCost,usagePerProduct,leadTimeDays,moq,singleSource';
  const rows = s.inventory.map((i) => [i.id, i.name, i.category, i.unitCost, i.usagePerProduct, i.leadTimeDays, i.moq, i.singleSource].join(','));
  return [header, ...rows].join('\n');
}

export function sixPackCsv(s: ScenarioData): string {
  const header = 'id,metric,mode,mean,stdDev,lsl,usl,flaggedPass';
  const rows = s.sixPack.map((r) => [r.id, r.metric, r.mode, r.mean, r.stdDev, r.lsl, r.usl, r.flaggedPass ?? ''].join(','));
  return [header, ...rows].join('\n');
}
