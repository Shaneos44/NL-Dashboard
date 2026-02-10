import { defaultScenarios } from './data';
import { supabase } from './supabase';
import { ScenarioData, ScenarioName } from './types';

const STORAGE_KEY = 'neolink-gtm-dashboard-v1';
const SCENARIO_TABLE = 'scenarios';

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

  const { data, error } = await supabase
    .from(SCENARIO_TABLE)
    .select('name,payload')
    .in('name', ['Pilot', 'Ramp', 'Scale']);

  if (error || !data || data.length === 0) return local;

  const scenarios = structuredClone(local.scenarios);
  for (const row of data as ScenarioRow[]) {
    scenarios[row.name] = row.payload;
  }

  return { selectedScenario: local.selectedScenario, scenarios };
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

  await Promise.all(
    (Object.keys(state.scenarios) as ScenarioName[]).map((name) =>
      upsertScenario({ name, payload: state.scenarios[name] })
    )
  );
}
