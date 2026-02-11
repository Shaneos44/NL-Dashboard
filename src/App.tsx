import { useEffect, useMemo, useRef, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

import './components/styles.css';
import { EditableTable } from './components/EditableTable';
import { KpiCard } from './components/KpiCard';

import type {
  GlobalInputs,
  ScenarioName,
  InventoryItem,
  LogisticsLane,
  MachineStation,
  Warehouse,
  MaintenanceAsset,
  RiskEntry,
  SixPackInput,
} from './lib/types';
import type { AppState } from './lib/store';

import {
  computeCostBreakdown,
  computeTaktTimeMinutes,
  evaluateSixPack,
  riskScore,
  sixPackYieldPct,
  computeStationCapacity,
  bottleneckStation,
  fteRequired,
  computeInventoryExposure,
  inventoryExposureTotals,
  logisticsSummary,
} from './lib/calc';

import {
  defaultState,
  loadState,
  saveState,
  duplicateScenario,
  exportScenarioJson,
  inventoryCsv,
  sixPackCsv,
} from './lib/store';

const tabs = [
  'Inputs',
  'Processes',
  'Inventory',
  'Logistics/Lanes',
  'Machines',
  'Warehouses',
  'Maintenance',
  'Six Pack',
  'Risk',
  'Action Plan',
  'Audit/Change Log',
  'Summary / Export',
] as const;

type Tab = (typeof tabs)[number];

function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    alert('Copied to clipboard');
  } catch {
    alert('Copy failed (browser permissions).');
  }
}

/** Very simple CSV parser (no quoted commas). Good enough for quick internal use. */
function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) return { headers: [], rows: [] };

  const headers = lines[0].split(',').map((h) => h.trim());
  const rows = lines.slice(1).map((line) => {
    const parts = line.split(',').map((p) => p.trim());
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => (obj[h] = parts[i] ?? ''));
    return obj;
  });

  return { headers, rows };
}

function toCsv<T extends Record<string, any>>(rows: T[], columns: { key: keyof T; label: string }[]) {
  const header = columns.map((c) => String(c.key)).join(',');
  const lines = rows.map((r) =>
    columns
      .map((c) => {
        const v = r[c.key];
        // keep it simple (no escaping)
        return v == null ? '' : String(v);
      })
      .join(',')
  );
  return [header, ...lines].join('\n');
}

function clamp01(n: number) {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export default function App() {
  const [state, setState] = useState<AppState>(defaultState);
  const [activeTab, setActiveTab] = useState<Tab>(tabs[0]);
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');
  const hydrated = useRef(false);

  // load once
  useEffect(() => {
    let mounted = true;
    (async () => {
      const loaded = await loadState();
      if (mounted) {
        setState(loaded);
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // save on changes
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

  const cost = useMemo(() => computeCostBreakdown(scenario), [scenario]);
  const takt = useMemo(() => computeTaktTimeMinutes(scenario), [scenario]);
  const sixYield = useMemo(() => sixPackYieldPct(scenario), [scenario]);
  const score = useMemo(() => riskScore(scenario, cost.marginPct), [scenario, cost.marginPct]);

  const capacityRows = useMemo(() => computeStationCapacity(scenario), [scenario]);
  const bottleneck = useMemo(() => bottleneckStation(scenario), [scenario]);
  const fte = useMemo(() => fteRequired(scenario), [scenario]);

  const invExposure = useMemo(() => computeInventoryExposure(scenario), [scenario]);
  const invTotals = useMemo(() => inventoryExposureTotals(scenario), [scenario]);

  const laneSummary = useMemo(() => logisticsSummary(scenario), [scenario]);

  const scenarios: ScenarioName[] = ['Pilot', 'Ramp', 'Scale'];

  const hasCapacityShortfall = capacityRows.some((r) => r.shortfallMachines > 0.0001);
  const singleSourceCount = scenario.inventory.filter((i) => i.singleSource).length;

  const inputKeys = Object.keys(scenario.inputs) as (keyof GlobalInputs)[];

  const marginCurve = useMemo(() => {
    return [0.5, 0.75, 1, 1.25, 1.5].map((mult) => {
      const demand = Math.round(scenario.inputs.monthlyDemand * mult);
      const tmp = { ...scenario, inputs: { ...scenario.inputs, monthlyDemand: demand } };
      const res = computeCostBreakdown(tmp);
      return { volume: demand, marginPct: Number(res.marginPct.toFixed(1)) };
    });
  }, [scenario]);

  const updateScenario = (next: typeof scenario, note?: string) => {
    const audit = note ? [...next.auditLog, note] : next.auditLog;
    const patched = { ...next, auditLog: audit };
    setState((s: AppState) => ({
      ...s,
      scenarios: { ...s.scenarios, [s.selectedScenario]: patched },
    }));
  };

  const resetScenarioToDefaults = (name: ScenarioName) => {
    const fresh = structuredClone(defaultState.scenarios[name]);
    setState((s) => ({
      ...s,
      scenarios: { ...s.scenarios, [name]: fresh },
    }));
  };

  const autoFixCapacity = () => {
    // Increase machinesInstalled to ceil(requiredMachines) for stations with shortfall
    const nextMachines = scenario.machines.map((m) => {
      const row = capacityRows.find((r) => r.station === m.station);
      if (!row) return m;
      const needed = Math.ceil(row.requiredMachines);
      if (needed <= m.machinesInstalled) return m;
      return { ...m, machinesInstalled: needed };
    });

    updateScenario(
      { ...scenario, machines: nextMachines },
      `Auto-fix: increased machinesInstalled to eliminate capacity shortfall (${new Date().toISOString()})`
    );
  };

  const normalizeWarehouseUtilization = () => {
    const next = scenario.warehouses.map((w) => ({ ...w, utilizationPct: clamp01(w.utilizationPct) }));
    updateScenario(
      { ...scenario, warehouses: next },
      `Auto-fix: clamped warehouse utilization to 0..1 (${new Date().toISOString()})`
    );
  };

  const quickAddCommonSixPack = () => {
    const templates: SixPackInput[] = [
      { id: crypto.randomUUID(), metric: 'Critical Dimension B', mean: 0, stdDev: 1, lsl: -1, usl: 1, mode: 'computed' },
      { id: crypto.randomUUID(), metric: 'Torque Spec', mean: 0, stdDev: 1, lsl: -1, usl: 1, mode: 'computed' },
      { id: crypto.randomUUID(), metric: 'Visual Inspection', mean: 0, stdDev: 1, lsl: 0, usl: 1, mode: 'flags', flaggedPass: true },
    ];
    updateScenario(
      { ...scenario, sixPack: [...scenario.sixPack, ...templates] },
      `Added Six Pack template rows (${new Date().toISOString()})`
    );
  };

  // Action Plan (computed)
  const actionPlan = useMemo(() => {
    const actions: { severity: 'HIGH' | 'MED' | 'LOW'; title: string; why: string; suggestion: string }[] = [];

    if (cost.marginPct < scenario.inputs.marginGuardrailPct) {
      actions.push({
        severity: 'HIGH',
        title: 'Margin below guardrail',
        why: `Margin is ${cost.marginPct.toFixed(1)}% vs guardrail ${scenario.inputs.marginGuardrailPct}%`,
        suggestion:
          'Check sale price, labour minutes/unit, material costs, logistics cost per shipment, and warehouse costs. Validate scrap/overhead/holding assumptions.',
      });
    }

    if (hasCapacityShortfall) {
      const worst = bottleneck;
      actions.push({
        severity: 'HIGH',
        title: 'Capacity shortfall / bottleneck risk',
        why: worst
          ? `Worst station: ${worst.station} at ${worst.utilizationPct.toFixed(1)}% utilization`
          : 'One or more stations require more machines than installed.',
        suggestion: 'Use “Auto-fix capacity” to set machinesInstalled to required. Then review cycle times and OEE.',
      });
    }

    if (fte > 1.0) {
      actions.push({
        severity: 'MED',
        title: 'Staffing load high',
        why: `Estimated FTE required is ${fte.toFixed(2)} (based on labour min/unit).`,
        suggestion: 'Confirm labour minutes/unit by process mapping. Consider parallelization or automation for bottleneck steps.',
      });
    }

    if (singleSourceCount > 0) {
      actions.push({
        severity: 'MED',
        title: 'Single-source supply risk',
        why: `${singleSourceCount} inventory item(s) flagged single-source.`,
        suggestion: 'Add dual-source plan in Risk tab and qualify alternates for critical components.',
      });
    }

    const overUtilWarehouses = scenario.warehouses.filter((w) => w.utilizationPct > (w.capacityPctLimit ?? 0.85));
    if (overUtilWarehouses.length > 0) {
      actions.push({
        severity: 'MED',
        title: 'Warehouse utilization above threshold',
        why: overUtilWarehouses.map((w) => `${w.location} ${(w.utilizationPct * 100).toFixed(0)}%`).join(', '),
        suggestion: 'Increase space, improve slotting, reduce safety stock days, or add another hub/DC.',
      });
    }

    const sixFail = scenario.sixPack.filter((r) => !evaluateSixPack(r).pass).length;
    if (sixFail > 0) {
      actions.push({
        severity: 'LOW',
        title: 'Six Pack capability gaps',
        why: `${sixFail} metric(s) failing Cp/Cpk (or flagged fail).`,
        suggestion: 'Run DOE / reduce variation, confirm spec limits, or change measurement system.',
      });
    }

    const exposure = invTotals.total;
    if (exposure > 200000) {
      actions.push({
        severity: 'LOW',
        title: 'Inventory exposure is high',
        why: `Estimated pipeline + safety stock exposure ≈ €${Math.round(exposure).toLocaleString()}`,
        suggestion: 'Reduce lead time, reduce safety stock days, increase delivery cadence, or redesign MOQs.',
      });
    }

    return actions;
  }, [
    cost.marginPct,
    scenario.inputs.marginGuardrailPct,
    hasCapacityShortfall,
    bottleneck,
    fte,
    singleSourceCount,
    scenario.warehouses,
    scenario.sixPack,
    invTotals.total,
  ]);

  const exportActionPlanMarkdown = () => {
    const lines = [
      `# Action Plan — ${scenario.name}`,
      ``,
      `Generated: ${new Date().toISOString()}`,
      ``,
      ...actionPlan.map((a, idx) => {
        return [
          `## ${idx + 1}. [${a.severity}] ${a.title}`,
          `- Why: ${a.why}`,
          `- Suggested next step: ${a.suggestion}`,
          ``,
        ].join('\n');
      }),
    ];
    return lines.join('\n');
  };

  // Bulk import helpers (per table)
  const importInventoryCsv = () => {
    const text = window.prompt(
      'Paste CSV with headers: name,category,unitCost,usagePerProduct,leadTimeDays,moq,singleSource\n(Commas only; no quoted commas)'
    );
    if (!text) return;
    const { rows } = parseCsv(text);
    const imported: InventoryItem[] = rows.map((r) => ({
      id: crypto.randomUUID(),
      name: r.name ?? '',
      category: (r.category as any) || 'RM',
      unitCost: Number(r.unitCost ?? 0),
      usagePerProduct: Number(r.usagePerProduct ?? 1),
      leadTimeDays: Number(r.leadTimeDays ?? 0),
      moq: Number(r.moq ?? 0),
      singleSource: String(r.singleSource ?? '').toLowerCase() === 'true' || r.singleSource === '1',
    }));
    updateScenario(
      { ...scenario, inventory: imported },
      `Imported inventory CSV (${new Date().toISOString()})`
    );
  };

  const importLanesCsv = () => {
    const text = window.prompt(
      'Paste CSV headers: lane,direction,mode,costPerShipment,unitsPerShipment\n(Commas only; no quoted commas)'
    );
    if (!text) return;
    const { rows } = parseCsv(text);
    const imported: LogisticsLane[] = rows.map((r) => ({
      id: crypto.randomUUID(),
      lane: r.lane ?? '',
      direction: (r.direction as any) || 'Inbound',
      mode: (r.mode as any) || 'Road',
      costPerShipment: Number(r.costPerShipment ?? 0),
      unitsPerShipment: Number(r.unitsPerShipment ?? 1),
    }));
    updateScenario(
      { ...scenario, logistics: imported },
      `Imported logistics CSV (${new Date().toISOString()})`
    );
  };

  const importMachinesCsv = () => {
    const text = window.prompt('Paste CSV headers: station,cycleTimeSec,machinesInstalled');
    if (!text) return;
    const { rows } = parseCsv(text);
    const imported: MachineStation[] = rows.map((r) => ({
      id: crypto.randomUUID(),
      station: r.station ?? '',
      cycleTimeSec: Number(r.cycleTimeSec ?? 60),
      machinesInstalled: Number(r.machinesInstalled ?? 1),
    }));
    updateScenario(
      { ...scenario, machines: imported },
      `Imported machines CSV (${new Date().toISOString()})`
    );
  };

  const importWarehousesCsv = () => {
    const text = window.prompt('Paste CSV headers: location,type,monthlyCost,utilizationPct,capacityPctLimit');
    if (!text) return;
    const { rows } = parseCsv(text);
    const imported: Warehouse[] = rows.map((r) => ({
      id: crypto.randomUUID(),
      location: r.location ?? '',
      type: (r.type as any) || 'FG',
      monthlyCost: Number(r.monthlyCost ?? 0),
      utilizationPct: Number(r.utilizationPct ?? 0.5),
      capacityPctLimit: r.capacityPctLimit === '' || r.capacityPctLimit == null ? 0.85 : Number(r.capacityPctLimit),
    }));
    updateScenario(
      { ...scenario, warehouses: imported },
      `Imported warehouses CSV (${new Date().toISOString()})`
    );
  };

  const importMaintenanceCsv = () => {
    const text = window.prompt('Paste CSV headers: machineType,pmHoursPerMonth,sparesCostPerMonth,serviceCostPerMonth');
    if (!text) return;
    const { rows } = parseCsv(text);
    const imported: MaintenanceAsset[] = rows.map((r) => ({
      id: crypto.randomUUID(),
      machineType: r.machineType ?? '',
      pmHoursPerMonth: Number(r.pmHoursPerMonth ?? 0),
      sparesCostPerMonth: Number(r.sparesCostPerMonth ?? 0),
      serviceCostPerMonth: Number(r.serviceCostPerMonth ?? 0),
    }));
    updateScenario(
      { ...scenario, maintenance: imported },
      `Imported maintenance CSV (${new Date().toISOString()})`
    );
  };

  const importRisksCsv = () => {
    const text = window.prompt('Paste CSV headers: area,status,mitigation,owner');
    if (!text) return;
    const { rows } = parseCsv(text);
    const imported: RiskEntry[] = rows.map((r) => ({
      id: crypto.randomUUID(),
      area: r.area ?? '',
      status: (r.status as any) || 'Amber',
      mitigation: r.mitigation ?? '',
      owner: r.owner ?? '',
    }));
    updateScenario(
      { ...scenario, risks: imported },
      `Imported risks CSV (${new Date().toISOString()})`
    );
  };

  if (loading) {
    return (
      <div className="app">
        <h1>NeoLink Global GTM Dashboard</h1>
        <div className="card">Loading scenario data...</div>
      </div>
    );
  }

  return (
    <div className="app">
      <h1>NeoLink Global GTM Dashboard</h1>

      <div className="small">Data sync: {syncStatus}</div>

      <div className="header">
        <select
          value={state.selectedScenario}
          onChange={(e) =>
            setState((s: AppState) => ({ ...s, selectedScenario: e.target.value as ScenarioName }))
          }
        >
          {scenarios.map((n) => (
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
            setState(duplicateScenario(state, state.selectedScenario, target));
          }}
        >
          Duplicate Scenario
        </button>

        <button onClick={() => resetScenarioToDefaults(state.selectedScenario)}>Reset Scenario</button>

        <button onClick={() => autoFixCapacity()} disabled={!hasCapacityShortfall}>
          Auto-fix capacity
        </button>

        <button onClick={() => normalizeWarehouseUtilization()}>Clamp warehouse util</button>

        <button
          onClick={() =>
            downloadFile(`${scenario.name}.json`, exportScenarioJson(scenario), 'application/json')
          }
        >
          Export JSON
        </button>

        <button onClick={() => copyToClipboard(exportScenarioJson(scenario))}>Copy JSON</button>
      </div>

      <div className="kpis">
        <KpiCard
          label="Revenue / mo"
          value={`€${(scenario.inputs.salePricePerUnit * scenario.inputs.monthlyDemand).toLocaleString()}`}
        />
        <KpiCard label="Total cost / unit" value={`€${cost.total.toFixed(2)}`} />
        <KpiCard
          label="Margin %"
          value={`${cost.marginPct.toFixed(1)}%`}
          tone={cost.marginPct > scenario.inputs.marginGuardrailPct ? 'good' : 'bad'}
        />
        <KpiCard label="Takt time" value={`${takt.toFixed(2)} min`} tone={takt > 0.4 ? 'warn' : 'good'} />
        <KpiCard label="Risk score" value={String(score)} tone={score > 60 ? 'bad' : score > 35 ? 'warn' : 'good'} />
        <KpiCard label="Six Pack yield" value={`${sixYield.toFixed(1)}%`} tone={sixYield > 80 ? 'good' : 'warn'} />
      </div>

      <div className="layout-grid">
        <div className="card">
          <h3>Margin Curve vs Volume</h3>
          <div style={{ width: '100%', height: 240 }}>
            <ResponsiveContainer>
              <LineChart data={marginCurve}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="volume" />
                <YAxis unit="%" />
                <Tooltip />
                <Line type="monotone" dataKey="marginPct" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card small">
          <h3>Guardrail Alerts</h3>
          <ul>
            <li>
              Margin threshold:{' '}
              {cost.marginPct < scenario.inputs.marginGuardrailPct ? '🔴 breached' : '🟢 healthy'}
            </li>
            <li>Bottleneck/capacity: {hasCapacityShortfall ? '🔴 shortfall' : '🟢 adequate'}</li>
            <li>Single-source critical items: {singleSourceCount}</li>
          </ul>

          {bottleneck && (
            <div className="small" style={{ marginTop: 8 }}>
              Bottleneck: <b>{bottleneck.station}</b> ({bottleneck.utilizationPct.toFixed(1)}% util)
            </div>
          )}

          <div className="small" style={{ marginTop: 8 }}>
            Inventory exposure: <b>€{Math.round(invTotals.total).toLocaleString()}</b>
          </div>
        </div>
      </div>

      <div className="tab-row">
        {tabs.map((tab) => (
          <button key={tab} className={tab === activeTab ? 'active' : ''} onClick={() => setActiveTab(tab)}>
            {tab}
          </button>
        ))}
      </div>

      {/* INPUTS */}
      {activeTab === 'Inputs' && (
        <div className="card">
          <h3>Global Drivers</h3>
          <div className="header">
            {inputKeys.map((k) => {
              const v = scenario.inputs[k];
              return (
                <label key={String(k)}>
                  {String(k)}
                  <input
                    type="number"
                    value={typeof v === 'number' ? v : 0}
                    onChange={(e) =>
                      updateScenario(
                        {
                          ...scenario,
                          inputs: { ...scenario.inputs, [k]: Number(e.target.value) },
                        },
                        `Updated input ${String(k)}`
                      )
                    }
                  />
                </label>
              );
            })}
          </div>

          <div className="small" style={{ marginTop: 10 }}>
            Tip: add <b>scrapRatePct</b>, <b>overheadPct</b>, <b>holdingRatePctAnnual</b>, and{' '}
            <b>safetyStockDays</b> in Inputs for more realistic outputs.
          </div>
        </div>
      )}

      {/* PROCESSES */}
      {activeTab === 'Processes' && (
        <div className="card">
          <h3>Capacity & Bottleneck</h3>

          {bottleneck && (
            <div className="small">
              Bottleneck: <b>{bottleneck.station}</b> ({bottleneck.utilizationPct.toFixed(1)}% utilization)
            </div>
          )}

          <table>
            <thead>
              <tr>
                <th>Station</th>
                <th>Cycle (s)</th>
                <th>Installed</th>
                <th>Capacity/mo</th>
                <th>Util %</th>
                <th>Req Machines</th>
                <th>Shortfall</th>
              </tr>
            </thead>
            <tbody>
              {capacityRows.map((r) => (
                <tr key={r.station}>
                  <td>{r.station}</td>
                  <td>{r.cycleTimeSec}</td>
                  <td>{r.installed}</td>
                  <td>{Math.round(r.capacityUnitsPerMonth).toLocaleString()}</td>
                  <td>{r.utilizationPct.toFixed(1)}%</td>
                  <td>{r.requiredMachines.toFixed(2)}</td>
                  <td>{r.shortfallMachines > 0 ? `+${r.shortfallMachines.toFixed(2)}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="small" style={{ marginTop: 12 }}>
            Staffing estimate (FTE): <b>{fte.toFixed(2)}</b> (based on labour min/unit and available minutes/month)
          </div>

          <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={autoFixCapacity} disabled={!hasCapacityShortfall}>
              Auto-fix capacity (set installed = ceil(required))
            </button>
            <button
              onClick={() =>
                downloadFile(
                  `${scenario.name}-capacity.csv`,
                  toCsv(capacityRows as any, [
                    { key: 'station', label: 'station' } as any,
                    { key: 'cycleTimeSec', label: 'cycleTimeSec' } as any,
                    { key: 'installed', label: 'installed' } as any,
                    { key: 'capacityUnitsPerMonth', label: 'capacityUnitsPerMonth' } as any,
                    { key: 'utilizationPct', label: 'utilizationPct' } as any,
                    { key: 'requiredMachines', label: 'requiredMachines' } as any,
                    { key: 'shortfallMachines', label: 'shortfallMachines' } as any,
                  ]),
                  'text/csv'
                )
              }
            >
              Export capacity CSV
            </button>
          </div>
        </div>
      )}

      {/* INVENTORY */}
      {activeTab === 'Inventory' && (
        <div>
          <div className="card small">
            <h3>Inventory Exposure (Cash Tied Up)</h3>
            <ul>
              <li>Pipeline value: €{Math.round(invTotals.pipelineValue).toLocaleString()}</li>
              <li>Safety stock value: €{Math.round(invTotals.safetyStockValue).toLocaleString()}</li>
              <li>
                <b>Total exposure: €{Math.round(invTotals.total).toLocaleString()}</b>
              </li>
            </ul>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={() => downloadFile(`${scenario.name}-inventory.csv`, inventoryCsv(scenario), 'text/csv')}>
                Export inventory CSV
              </button>
              <button onClick={importInventoryCsv}>Import inventory CSV</button>
            </div>
          </div>

          <div className="card">
            <h3>Reorder Points (units)</h3>
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Lead Time (d)</th>
                  <th>ROP (units)</th>
                  <th>Pipeline €</th>
                  <th>SS €</th>
                </tr>
              </thead>
              <tbody>
                {invExposure.map((r) => (
                  <tr key={r.item}>
                    <td>{r.item}</td>
                    <td>{r.leadTimeDays}</td>
                    <td>{Math.round(r.reorderPointUnits).toLocaleString()}</td>
                    <td>€{Math.round(r.pipelineValue).toLocaleString()}</td>
                    <td>€{Math.round(r.safetyStockValue).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <EditableTable
            title="Inventory & BOM"
            rows={scenario.inventory}
            columns={[
              { key: 'name', label: 'Item' },
              {
                key: 'category',
                label: 'Category',
                type: 'select',
                options: [
                  { label: 'RM', value: 'RM' },
                  { label: 'Component', value: 'Component' },
                  { label: 'Packaging', value: 'Packaging' },
                ],
              },
              { key: 'unitCost', label: 'Unit Cost', type: 'number' },
              { key: 'usagePerProduct', label: 'Usage/Product', type: 'number' },
              { key: 'leadTimeDays', label: 'Lead Time (d)', type: 'number' },
              { key: 'moq', label: 'MOQ', type: 'number' },
              { key: 'singleSource', label: 'Single Source', type: 'checkbox' },
            ]}
            onChange={(rows) =>
              updateScenario(
                { ...scenario, inventory: rows },
                `Inventory updated (${new Date().toISOString()})`
              )
            }
            createRow={() => ({
              id: crypto.randomUUID(),
              name: 'New item',
              category: 'RM' as const,
              unitCost: 0,
              usagePerProduct: 1,
              leadTimeDays: 0,
              moq: 0,
              singleSource: false,
            })}
          />
        </div>
      )}

      {/* LOGISTICS */}
      {activeTab === 'Logistics/Lanes' && (
        <div>
          <div className="card">
            <h3>Lane Summary</h3>
            <table>
              <thead>
                <tr>
                  <th>Lane</th>
                  <th>Shipments/mo</th>
                  <th>Cost/unit</th>
                </tr>
              </thead>
              <tbody>
                {laneSummary.map((l) => (
                  <tr key={l.lane}>
                    <td>{l.lane}</td>
                    <td>{l.shipmentsPerMonth.toFixed(2)}</td>
                    <td>€{l.costPerUnit.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
              <button
                onClick={() =>
                  downloadFile(
                    `${scenario.name}-logistics.csv`,
                    toCsv(scenario.logistics as any, [
                      { key: 'lane', label: 'lane' } as any,
                      { key: 'direction', label: 'direction' } as any,
                      { key: 'mode', label: 'mode' } as any,
                      { key: 'costPerShipment', label: 'costPerShipment' } as any,
                      { key: 'unitsPerShipment', label: 'unitsPerShipment' } as any,
                    ]),
                    'text/csv'
                  )
                }
              >
                Export logistics CSV
              </button>
              <button onClick={importLanesCsv}>Import logistics CSV</button>
            </div>
          </div>

          <EditableTable
            title="Transport Lanes"
            rows={scenario.logistics}
            columns={[
              { key: 'lane', label: 'Lane' },
              {
                key: 'direction',
                label: 'Direction',
                type: 'select',
                options: [
                  { label: 'Inbound', value: 'Inbound' },
                  { label: 'Outbound', value: 'Outbound' },
                ],
              },
              {
                key: 'mode',
                label: 'Mode',
                type: 'select',
                options: [
                  { label: 'Air', value: 'Air' },
                  { label: 'Sea', value: 'Sea' },
                  { label: 'Road', value: 'Road' },
                ],
              },
              { key: 'costPerShipment', label: 'Cost/Shipment', type: 'number' },
              { key: 'unitsPerShipment', label: 'Units/Shipment', type: 'number' },
            ]}
            onChange={(rows) => updateScenario({ ...scenario, logistics: rows }, `Logistics updated`)}
            createRow={() => ({
              id: crypto.randomUUID(),
              lane: 'New Lane',
              direction: 'Inbound' as const,
              mode: 'Road' as const,
              costPerShipment: 0,
              unitsPerShipment: 1,
            })}
          />
        </div>
      )}

      {/* MACHINES */}
      {activeTab === 'Machines' && (
        <div className="card">
          <h3>Machines</h3>
          <p className="small">
            Edit cycle time and installed count. Capacity analysis is shown in <b>Processes</b>.
          </p>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            <button
              onClick={() =>
                downloadFile(
                  `${scenario.name}-machines.csv`,
                  toCsv(scenario.machines as any, [
                    { key: 'station', label: 'station' } as any,
                    { key: 'cycleTimeSec', label: 'cycleTimeSec' } as any,
                    { key: 'machinesInstalled', label: 'machinesInstalled' } as any,
                  ]),
                  'text/csv'
                )
              }
            >
              Export machines CSV
            </button>
            <button onClick={importMachinesCsv}>Import machines CSV</button>
          </div>

          <EditableTable
            title="Stations"
            rows={scenario.machines}
            columns={[
              { key: 'station', label: 'Station' },
              { key: 'cycleTimeSec', label: 'Cycle Time (s)', type: 'number' },
              { key: 'machinesInstalled', label: 'Installed', type: 'number' },
            ]}
            onChange={(rows) => updateScenario({ ...scenario, machines: rows }, `Machines updated`)}
            createRow={() => ({
              id: crypto.randomUUID(),
              station: 'New station',
              cycleTimeSec: 60,
              machinesInstalled: 1,
            })}
          />
        </div>
      )}

      {/* WAREHOUSES */}
      {activeTab === 'Warehouses' && (
        <div className="card">
          <h3>Warehousing</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            <button
              onClick={() =>
                downloadFile(
                  `${scenario.name}-warehouses.csv`,
                  toCsv(scenario.warehouses as any, [
                    { key: 'location', label: 'location' } as any,
                    { key: 'type', label: 'type' } as any,
                    { key: 'monthlyCost', label: 'monthlyCost' } as any,
                    { key: 'utilizationPct', label: 'utilizationPct' } as any,
                    { key: 'capacityPctLimit', label: 'capacityPctLimit' } as any,
                  ]),
                  'text/csv'
                )
              }
            >
              Export warehouses CSV
            </button>
            <button onClick={importWarehousesCsv}>Import warehouses CSV</button>
            <button onClick={normalizeWarehouseUtilization}>Clamp utilization 0..1</button>
          </div>

          <EditableTable
            title="Warehouse Planning"
            rows={scenario.warehouses}
            columns={[
              { key: 'location', label: 'Location' },
              {
                key: 'type',
                label: 'Type',
                type: 'select',
                options: [
                  { label: 'FG', value: 'FG' },
                  { label: 'RM', value: 'RM' },
                ],
              },
              { key: 'monthlyCost', label: 'Monthly Cost', type: 'number' },
              { key: 'utilizationPct', label: 'Utilization (0..1)', type: 'number' },
              { key: 'capacityPctLimit', label: 'Limit (0..1)', type: 'number' },
            ]}
            onChange={(rows) => updateScenario({ ...scenario, warehouses: rows }, `Warehouses updated`)}
            createRow={() => ({
              id: crypto.randomUUID(),
              location: 'New DC',
              type: 'FG' as const,
              monthlyCost: 0,
              utilizationPct: 0.5,
              capacityPctLimit: 0.85,
            })}
          />
        </div>
      )}

      {/* MAINTENANCE */}
      {activeTab === 'Maintenance' && (
        <div className="card">
          <h3>Maintenance</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            <button
              onClick={() =>
                downloadFile(
                  `${scenario.name}-maintenance.csv`,
                  toCsv(scenario.maintenance as any, [
                    { key: 'machineType', label: 'machineType' } as any,
                    { key: 'pmHoursPerMonth', label: 'pmHoursPerMonth' } as any,
                    { key: 'sparesCostPerMonth', label: 'sparesCostPerMonth' } as any,
                    { key: 'serviceCostPerMonth', label: 'serviceCostPerMonth' } as any,
                  ]),
                  'text/csv'
                )
              }
            >
              Export maintenance CSV
            </button>
            <button onClick={importMaintenanceCsv}>Import maintenance CSV</button>
          </div>

          <EditableTable
            title="Maintenance Assets"
            rows={scenario.maintenance}
            columns={[
              { key: 'machineType', label: 'Machine Type' },
              { key: 'pmHoursPerMonth', label: 'PM hrs/mo', type: 'number' },
              { key: 'sparesCostPerMonth', label: 'Spares/mo', type: 'number' },
              { key: 'serviceCostPerMonth', label: 'Service/mo', type: 'number' },
            ]}
            onChange={(rows) => updateScenario({ ...scenario, maintenance: rows }, `Maintenance updated`)}
            createRow={() => ({
              id: crypto.randomUUID(),
              machineType: 'New',
              pmHoursPerMonth: 0,
              sparesCostPerMonth: 0,
              serviceCostPerMonth: 0,
            })}
          />
        </div>
      )}

      {/* SIX PACK */}
      {activeTab === 'Six Pack' && (
        <div className="card">
          <h3>Six Pack Capability</h3>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            <button onClick={() => downloadFile(`${scenario.name}-sixpack.csv`, sixPackCsv(scenario), 'text/csv')}>
              Export Six Pack CSV
            </button>
            <button onClick={quickAddCommonSixPack}>Add template metrics</button>
            <button onClick={() => window.print()}>Print report</button>
          </div>

          <ul>
            {scenario.sixPack.map((r) => {
              const ev = evaluateSixPack(r);
              return (
                <li key={r.id}>
                  {r.metric}: {ev.pass ? 'PASS' : 'FAIL'} (Cp {ev.cp.toFixed(2)} Cpk {ev.cpk.toFixed(2)})
                </li>
              );
            })}
          </ul>

          <EditableTable
            title="Six Pack Inputs"
            rows={scenario.sixPack}
            columns={[
              { key: 'metric', label: 'Metric' },
              {
                key: 'mode',
                label: 'Mode',
                type: 'select',
                options: [
                  { label: 'computed', value: 'computed' },
                  { label: 'flags', value: 'flags' },
                ],
              },
              { key: 'mean', label: 'Mean', type: 'number' },
              { key: 'stdDev', label: 'StdDev', type: 'number' },
              { key: 'lsl', label: 'LSL', type: 'number' },
              { key: 'usl', label: 'USL', type: 'number' },
              { key: 'flaggedPass', label: 'Flag pass', type: 'checkbox' },
            ]}
            onChange={(rows) => updateScenario({ ...scenario, sixPack: rows }, `Six Pack updated`)}
            createRow={() => ({
              id: crypto.randomUUID(),
              metric: 'New metric',
              mode: 'computed' as const,
              mean: 0,
              stdDev: 1,
              lsl: -1,
              usl: 1,
              flaggedPass: true,
            })}
          />
        </div>
      )}

      {/* RISK */}
      {activeTab === 'Risk' && (
        <div className="card">
          <h3>Risk Register</h3>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            <button
              onClick={() =>
                downloadFile(
                  `${scenario.name}-risks.csv`,
                  toCsv(scenario.risks as any, [
                    { key: 'area', label: 'area' } as any,
                    { key: 'status', label: 'status' } as any,
                    { key: 'mitigation', label: 'mitigation' } as any,
                    { key: 'owner', label: 'owner' } as any,
                  ]),
                  'text/csv'
                )
              }
            >
              Export risks CSV
            </button>
            <button onClick={importRisksCsv}>Import risks CSV</button>
          </div>

          <EditableTable
            title="Risks"
            rows={scenario.risks}
            columns={[
              { key: 'area', label: 'Area' },
              {
                key: 'status',
                label: 'Status',
                type: 'select',
                options: [
                  { label: 'Green', value: 'Green' },
                  { label: 'Amber', value: 'Amber' },
                  { label: 'Red', value: 'Red' },
                ],
              },
              { key: 'mitigation', label: 'Mitigation', type: 'textarea', placeholder: 'What are we doing about it?' },
              { key: 'owner', label: 'Owner', placeholder: 'Name / role' },
            ]}
            onChange={(rows) => updateScenario({ ...scenario, risks: rows }, `Risks updated`)}
            createRow={() => ({
              id: crypto.randomUUID(),
              area: 'New area',
              status: 'Amber' as const,
              mitigation: '',
              owner: '',
            })}
          />
        </div>
      )}

      {/* ACTION PLAN */}
      {activeTab === 'Action Plan' && (
        <div className="card">
          <h3>Action Plan</h3>
          <p className="small">
            This is auto-generated from your scenario inputs and guardrails. Use it to drive next actions.
          </p>

          {actionPlan.length === 0 ? (
            <div className="small">No actions right now — guardrails look healthy.</div>
          ) : (
            <ol>
              {actionPlan.map((a, idx) => (
                <li key={idx} style={{ marginBottom: 10 }}>
                  <div>
                    <b>
                      [{a.severity}] {a.title}
                    </b>
                  </div>
                  <div className="small">Why: {a.why}</div>
                  <div className="small">Suggested: {a.suggestion}</div>
                </li>
              ))}
            </ol>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => copyToClipboard(exportActionPlanMarkdown())}>Copy as Markdown</button>
            <button
              onClick={() =>
                downloadFile(`${scenario.name}-action-plan.md`, exportActionPlanMarkdown(), 'text/markdown')
              }
            >
              Download Markdown
            </button>
          </div>
        </div>
      )}

      {/* AUDIT */}
      {activeTab === 'Audit/Change Log' && (
        <div className="card">
          <h3>Audit Log</h3>
          <ul>{scenario.auditLog.map((e, i) => <li key={i}>{e}</li>)}</ul>
        </div>
      )}

      {/* SUMMARY */}
      {activeTab === 'Summary / Export' && (
        <div className="card">
          <h3>Summary</h3>
          <p>
            Gross margin per unit: €{cost.marginPerUnit.toFixed(2)} | Total cost per unit: €
            {cost.total.toFixed(2)}
          </p>

          <h4>Cost breakdown (€/unit)</h4>
          <ul>
            <li>Labour: €{cost.labour.toFixed(2)}</li>
            <li>Labour overhead: €{cost.labourOverhead.toFixed(2)}</li>
            <li>Material: €{cost.material.toFixed(2)}</li>
            <li>Logistics: €{cost.logistics.toFixed(2)}</li>
            <li>Warehouse: €{cost.warehouse.toFixed(2)}</li>
            <li>Maintenance: €{cost.maintenance.toFixed(2)}</li>
            <li>Holding: €{cost.holding.toFixed(2)}</li>
            <li>CAPEX depreciation: €{cost.capexDepreciation.toFixed(2)}</li>
            <li>Quality: €{cost.quality.toFixed(2)}</li>
          </ul>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => downloadFile(`${scenario.name}.json`, exportScenarioJson(scenario), 'application/json')}>
              Download full JSON
            </button>
            <button onClick={() => copyToClipboard(exportScenarioJson(scenario))}>Copy JSON</button>

            <button
              onClick={() => {
                const summary = [
                  `Scenario: ${scenario.name}`,
                  `Revenue/mo: €${(scenario.inputs.salePricePerUnit * scenario.inputs.monthlyDemand).toLocaleString()}`,
                  `Cost/unit: €${cost.total.toFixed(2)}`,
                  `Margin: ${cost.marginPct.toFixed(1)}%`,
                  `Takt: ${takt.toFixed(2)} min`,
                  `FTE: ${fte.toFixed(2)}`,
                  `Inventory exposure: €${Math.round(invTotals.total).toLocaleString()}`,
                  `Single-source items: ${singleSourceCount}`,
                ].join('\n');
                void copyToClipboard(summary);
              }}
            >
              Copy summary text
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
