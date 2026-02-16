import { useEffect, useMemo, useRef, useState } from 'react';
import { AuthGate } from './components/AuthGate';

import './components/styles.css';
import { EditableTable } from './components/EditableTable';
import { KpiCard } from './components/KpiCard';
import { ProductionCalendar } from './components/ProductionCalendar';
import { MaintenancePlanner } from './components/MaintenancePlanner';
import { exportReportDocx, exportReportXlsx } from './lib/report';

import type { ScenarioName } from './lib/types';
import type { AppState } from './lib/store';

import {
  computeCostBreakdown,
  stockRemainingAfterProduction,
  summaryAlerts,
  scheduleRiskSummary,
} from './lib/calc';

import {
  defaultState,
  loadState,
  saveState,
  duplicateScenario,
  exportScenarioJson,
} from './lib/store';

const tabs = [
  'Summary',
  'Production',
  'Stock',
  'Resources',
  'Decisions & Tracking',
  'Inputs',
  'Logistics',
  'Warehouses',
  'Maintenance',
  'Risk',
] as const;

type Tab = (typeof tabs)[number];

const aud = new Intl.NumberFormat('en-AU', {
  style: 'currency',
  currency: 'AUD',
});

const aud0 = new Intl.NumberFormat('en-AU', {
  style: 'currency',
  currency: 'AUD',
  maximumFractionDigits: 0,
});

function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function nowIso() {
  return new Date().toISOString();
}

export default function App() {
  const [state, setState] = useState<AppState>(defaultState);
  const [activeTab, setActiveTab] = useState<Tab>('Summary');
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<
    'idle' | 'syncing' | 'synced' | 'error'
  >('idle');

  const hydrated = useRef(false);

  // -------- LOAD STATE ----------
  useEffect(() => {
    let mounted = true;

    (async () => {
      const loaded = await loadState();
      if (!mounted) return;
      setState(loaded);
      setLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, []);

  // -------- SAVE STATE ----------
  useEffect(() => {
    if (loading || !hydrated.current) {
      hydrated.current = true;
      return;
    }

    setSyncStatus('syncing');

    void saveState(state)
      .then(() => setSyncStatus('synced'))
      .catch(() => setSyncStatus('error'));
  }, [loading, state]);

  const scenario = state.scenarios[state.selectedScenario];

  const cost = useMemo(
    () => computeCostBreakdown(scenario as any),
    [scenario]
  );

  const stockView = useMemo(
    () => stockRemainingAfterProduction(scenario as any),
    [scenario]
  );

  const alerts = useMemo(
    () => summaryAlerts(scenario as any),
    [scenario]
  );

  const sched = useMemo(
    () => scheduleRiskSummary(scenario as any),
    [scenario]
  );

  const updateScenario = (next: typeof scenario, note?: string) => {
    const audit = note ? [...next.auditLog, note] : next.auditLog;
    const patched = { ...next, auditLog: audit };

    setState((s: AppState) => ({
      ...s,
      scenarios: {
        ...s.scenarios,
        [s.selectedScenario]: patched,
      },
    }));
  };

  // -------- SINGLE CLEAN RETURN ----------
  return (
    <AuthGate>
      <div className="app">
        <h1>Ops & Production Dashboard</h1>

        {loading ? (
          <div className="card">Loading…</div>
        ) : (
          <>
            <div className="small">
              Currency: <b>AUD</b> · Sync: {syncStatus}
            </div>

            {/* HEADER */}
            <div className="header">
              <select
                value={state.selectedScenario}
                onChange={(e) =>
                  setState((s: AppState) => ({
                    ...s,
                    selectedScenario: e.target.value as ScenarioName,
                  }))
                }
              >
                {(['Pilot', 'Ramp', 'Scale'] as ScenarioName[]).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>

              <button
                onClick={() => {
                  const target: ScenarioName =
                    state.selectedScenario === 'Pilot'
                      ? 'Ramp'
                      : state.selectedScenario === 'Ramp'
                      ? 'Scale'
                      : 'Pilot';

                  setState(
                    duplicateScenario(
                      state,
                      state.selectedScenario,
                      target
                    )
                  );
                }}
              >
                Duplicate Scenario
              </button>

              <button
                onClick={() =>
                  downloadFile(
                    `${scenario.name}.json`,
                    exportScenarioJson(scenario as any),
                    'application/json'
                  )
                }
              >
                Export JSON
              </button>

              <button
                onClick={() =>
                  exportReportXlsx(scenario as any)
                }
              >
                Export XLSX Report
              </button>

              <button
                onClick={() =>
                  exportReportDocx(scenario as any)
                }
              >
                Export Word Report
              </button>
            </div>

            {/* KPI CARDS */}
            <div className="kpis">
              <KpiCard
                label="Revenue / mo"
                value={aud0.format(
                  scenario.inputs.salePricePerUnit *
                    scenario.inputs.monthlyDemand
                )}
              />
              <KpiCard
                label="Margin %"
                value={`${cost.marginPct.toFixed(1)}%`}
                tone={
                  cost.marginPct >
                  scenario.inputs.marginGuardrailPct
                    ? 'good'
                    : 'bad'
                }
              />
              <KpiCard
                label="Ready (7d)"
                value={String(sched.ready)}
                tone={sched.ready > 0 ? 'good' : 'neutral'}
              />
              <KpiCard
                label="At risk (7d)"
                value={String(sched.atRisk)}
                tone={sched.atRisk > 0 ? 'warn' : 'good'}
              />
              <KpiCard
                label="Blocked (7d)"
                value={String(sched.blocked)}
                tone={sched.blocked > 0 ? 'bad' : 'good'}
              />
              <KpiCard
                label="Stock alerts"
                value={`${alerts.belowMin} below min / ${alerts.reorder} reorder`}
                tone={
                  alerts.belowMin > 0
                    ? 'bad'
                    : alerts.reorder > 0
                    ? 'warn'
                    : 'good'
                }
              />
            </div>

            {/* TABS */}
            <div className="tab-row">
              {tabs.map((tab) => (
                <button
                  key={tab}
                  className={tab === activeTab ? 'active' : ''}
                  onClick={() => setActiveTab(tab)}
                >
                  {tab}
                </button>
              ))}
            </div>

            {activeTab === 'Production' && (
              <ProductionCalendar
                scenario={scenario as any}
                onChange={updateScenario as any}
              />
            )}

            {activeTab === 'Maintenance' && (
              <MaintenancePlanner
                scenario={scenario as any}
                onChange={updateScenario as any}
              />
            )}

            {/* Add other tab blocks here exactly as you already have them */}

            <div className="card">
              <h3>Audit log</h3>
              <div
                className="small"
                style={{ maxHeight: 160, overflow: 'auto' }}
              >
                {scenario.auditLog
                  .slice()
                  .reverse()
                  .map((l: string, idx: number) => (
                    <div key={idx}>• {l}</div>
                  ))}
              </div>
            </div>
          </>
        )}
      </div>
    </AuthGate>
  );
}
