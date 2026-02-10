import { defaultScenarios } from './data';
import { ScenarioData, ScenarioName } from './types';

const STORAGE_KEY = 'neolink-gtm-dashboard-v1';

export interface AppState {
  selectedScenario: ScenarioName;
  scenarios: Record<ScenarioName, ScenarioData>;
}

export const defaultState: AppState = {
  selectedScenario: 'Pilot',
  scenarios: defaultScenarios,
};

export function loadState(): AppState {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return defaultState;

  try {
    return JSON.parse(raw) as AppState;
  } catch {
    return defaultState;
  }
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
