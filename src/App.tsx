import { useEffect, useMemo, useRef, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

import './components/styles.css';
import { EditableTable } from './components/EditableTable';
import { KpiCard } from './components/KpiCard';

import type { GlobalInputs, ScenarioName, PlanningDecision } from './lib/types';
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
  'Executive Summary',
  'Decisions',
  'Inputs',
  'Processes',
  'Inventory',
  'Logistics/Lanes',
  'Machines',
  'Warehouses',
  'Maintenance',
  'Six Pack',
  'Risk',
  'Summary / Export',
] as const;

type Tab = (typeof tabs)[number];

const aud = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });
const aud0 = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 });

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

function defaultDecisions(): PlanningDecision[] {
  return [
    {
      id: crypto.randomUUID(),
      title: 'Capacity: how many machines & when?',
      target: 'No station > 85% utilization at target demand',
      owner: '',
      status: 'Not started',
      notes: '',
    },
    {
      id: crypto.randomUUID(),
      title: 'People: how many FTE & what roles?',
      target: 'Staffing plan supports ramp without overtime risk',
      owner: '',
      status: 'Not started',
      notes: '',
    },
    {
      id: crypto.randomUUID(),
      title: 'Supply chain: what to order & when?',
      target: 'No stockouts with defined safety stock policy',
      owner: '',
      status: 'Not started',
      notes: '',
    },
  ];
}

type RAG = 'Green' | 'Amber' | 'Red';

function ragFromFlags(flags: { red: number; amber: number }) : RAG {
  if (flags.red > 0) return 'Red';
  if (flags.amber > 0) return 'Amber';
  return 'Green';
}

export default function App() {
  const [state, setState] = useState<AppState>(defaultState);
  const [activeTab, setActiveTab] = useState<Tab>('Executive Summary');
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');
  const hydrated = useRef(false);

  // One-time migration so older saved states don't break new required fields
  const migratedRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const loaded = await loadState();

      // MIGRATION: ensure decisions exists in every scenario
      const patched = structuredClone(loaded);
      let changed = false;

      (['Pilot', 'Ramp', 'Scale'] as ScenarioName[]).forEach((sn) => {
        const sc: any = patched.scenarios[sn];
        if (!sc.decisions || !Array.isArray(sc.decisions) || sc.decisions.length === 0) {
          sc.decisions = defaultDecisions();
          sc.auditLog = [...(sc.auditLog ?? []), `Auto-migration: added Decisions (${nowIso()})`];
          changed = true;
        }
      });

      if (mounted) {
        setState(patched);
        setLoading(false);

        // If migrated, save once so it doesn't keep happening
        if (changed) migratedRef.current = true;
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

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

  // After first save, clear migrated flag (prevents extra logs)
  useEffect(() => {
    if (migratedRef.current && syncStatus === 'synced') migratedRef.current = false;
  }, [syncStatus]);

  const scenario = state.scenarios[state.selectedScenario];

  // Defensive: if still missing for any reason, provide a non-crashing default
  const decisions = scenario.decisions && scenario.decisions.length > 0 ? scenario.decisions : defaultDecisions();

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

  const updateScenario = (next: typeof scenario, note?: string) => {
    const audit = note ? [...next.auditLog, note] : next.auditLog;
    const patched = { ...next, auditLog: audit };
    setState((s: AppState) => ({
      ...s,
      scenarios: { ...s.scenarios, [s.selectedScenario]: patched },
    }));
  };

  const inputKeys = Object.keys(scenario.inputs) as (keyof GlobalInputs)[];

  const marginCurve = useMemo(() => {
    return [0.5, 0.75, 1, 1.25, 1.5].map((mult) => {
      const demand = Math.round(scenario.inputs.monthlyDemand * mult);
      const tmp = { ...scenario, inputs: { ...scenario.inputs, monthlyDemand: demand } };
      const res = computeCostBreakdown(tmp);
      return { volume: demand, marginPct: Number(res.marginPct.toFixed(1)) };
    });
  }, [scenario]);

  // Executive-grade “signals”
  const hasCapacityShortfall = capacityRows.some((r) => r.shortfallMachines > 0.0001);
  const worstUtil = bottleneck ? bottleneck.utilizationPct : 0;
  const singleSourceCount = scenario.inventory.filter((i) => i.singleSource).length;
  const warehouseOver = scenario.warehouses.filter((w) => w.utilizationPct > (w.capacityPctLimit ?? 0.85)).length;
  const sixFailCount = scenario.sixPack.filter((r) => !evaluateSixPack(r).pass).length;

  const flags = {
    red: 0,
    amber: 0,
  };

  // Margin guardrail
  if (cost.marginPct < scenario.inputs.marginGuardrailPct) flags.red += 1;

  // Capacity
  if (hasCapacityShortfall) flags.red += 1;
  else if (worstUtil > 80) flags.amber += 1;

  // Supply risk
  if (singleSourceCount >= 3) flags.amber += 1;
  if (singleSourceCount >= 6) flags.red += 1;

  // Warehouse
  if (warehouseOver > 0) flags.amber += 1;

  // Quality capability
  if (sixFailCount > 0) flags.amber += 1;
  if (sixFailCount >= 3) flags.red += 1;

  const overallRag = ragFromFlags(flags);

  const topActions = useMemo(() => {
    const actions: { rag: RAG; title: string; detail: string; goto: Tab }[] = [];

    if (cost.marginPct < scenario.inputs.marginGuardrailPct) {
      actions.push({
        rag: 'Red',
        title: 'Margin below guardrail',
        detail: `Margin ${cost.marginPct.toFixed(1)}% vs guardrail ${scenario.inputs.marginGuardrailPct}% — review inputs, BOM costs, logistics, holding/scrap.`,
        goto: 'Summary / Export',
      });
    }

    if (hasCapacityShortfall) {
      actions.push({
        rag: 'Red',
        title: 'Capacity shortfall',
        detail: bottleneck
          ? `Bottleneck ${bottleneck.station} at ${bottleneck.utilizationPct.toFixed(1)}% util — add machines or reduce cycle time/OEE assumptions.`
          : 'One or more stations require more machines than installed.',
        goto: 'Processes',
      });
    }

    if (fte > 1.2) {
      actions.push({
        rag: 'Amber',
        title: 'High staffing load',
        detail: `Estimated FTE ${fte.toFixed(2)} — verify labour minutes/unit and shift assumptions.`,
        goto: 'Inputs',
      });
    }

    if (singleSourceCount > 0) {
      actions.push({
        rag: 'Amber',
        title: 'Single-source items',
        detail: `${singleSourceCount} item(s) flagged — add mitigation owners + dual-source plan.`,
        goto: 'Risk',
      });
    }

    if (invTotals.total > 250000) {
      actions.push({
        rag: 'Amber',
        title: 'Inventory cash exposure high',
        detail: `Pipeline + safety stock ≈ ${aud0.format(invTotals.total)} — reduce lead times, safety stock days, or increase shipment cadence.`,
        goto: 'Inventory',
      });
    }

    if (warehouseOver > 0) {
      actions.push({
        rag: 'Amber',
        title: 'Warehouse utilization over limit',
        detail: `${warehouseOver} warehouse(s) over threshold — adjust utilization/limit or capacity strategy.`,
        goto: 'Warehouses',
      });
    }

    if (sixFailCount > 0) {
      actions.push({
        rag: 'Amber',
        title: 'Six Pack capability gaps',
        detail: `${sixFailCount} failing metric(s) — focus improvement on top CTQs.`,
        goto: 'Six Pack',
      });
    }

    return actions.slice(0, 6);
  }, [
    cost.marginPct,
    scenario.inputs.marginGuardrailPct,
    hasCapacityShortfall,
    bottleneck,
    fte,
    singleSourceCount,
    invTotals.total,
    warehouseOver,
    sixFailCount,
  ]);

  if (loading) {
    return (
      <div className="app">
        <h1>Ops & Planning Dashboard</h1>
        <div className="card">Loading…</div>
      </div>
    );
  }

  return (
    <div className="app">
      <h1>Ops & Planning Dashboard</h1>
      <div className="small">
        Currency: <b>AUD</b> · Sync: {syncStatus}
      </div>

      <div className="header">
        <select
          value={state.selectedScenario}
          onChange={(e) => setState((s) => ({ ...s, selectedScenario: e.target.value as ScenarioName }))}
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

        <button onClick={() => downloadFile(`${scenario.name}.json`, exportScenarioJson(scenario), 'application/json')}>
          Export JSON
        </button>
        <button onClick={() => downloadFile(`${scenario.name}-inventory.csv`, inventoryCsv(scenario), 'text/csv')}>
          Export Inventory CSV
        </button>
        <button onClick={() => downloadFile(`${scenario.name}-sixpack.csv`, sixPackCsv(scenario), 'text/csv')}>
          Export Six Pack CSV
        </button>
      </div>

      <div className="kpis">
        <KpiCard
          label="Revenue / mo"
          value={aud0.format(scenario.inputs.salePricePerUnit * scenario.inputs.monthlyDemand)}
        />
        <KpiCard label="Total cost / unit" value={aud.format(cost.total)} />
        <KpiCard
          label="Margin %"
          value={`${cost.marginPct.toFixed(1)}%`}
          tone={cost.marginPct > scenario.inputs.marginGuardrailPct ? 'good' : 'bad'}
        />
        <KpiCard label="Takt time" value={`${takt.toFixed(2)} min`} tone={takt > 0.4 ? 'warn' : 'good'} />
        <KpiCard label="Risk score" value={String(score)} tone={score > 60 ? 'bad' : score > 35 ? 'warn' : 'good'} />
        <KpiCard label="Inventory exposure" value={aud0.format(invTotals.total)} tone={invTotals.total > 250000 ? 'warn' : 'good'} />
      </div>

      <div className="tab-row">
        {tabs.map((tab) => (
          <button key={tab} className={tab === activeTab ? 'active' : ''} onClick={() => setActiveTab(tab)}>
            {tab}
          </button>
        ))}
      </div>

      {/* EXECUTIVE SUMMARY */}
      {activeTab === 'Executive Summary' && (
        <div>
          <div className="layout-grid">
            <div className="card">
              <h3>Executive Snapshot</h3>
              <div className={`badge ${overallRag === 'Green' ? 'good' : overallRag === 'Amber' ? 'warn' : 'bad'}`}>
                Overall status: <b>{overallRag}</b>
              </div>{' '}
              <div className="badge">
                Demand: <b>{scenario.inputs.monthlyDemand.toLocaleString()}</b> units/mo
              </div>{' '}
              <div className="badge">
                Bottleneck: <b>{bottleneck ? bottleneck.station : '—'}</b>
              </div>
              <hr />
              <div className="small">
                • Margin: <b>{cost.marginPct.toFixed(1)}%</b> ({aud.format(cost.marginPerUnit)} / unit)
              </div>
              <div className="small">
                • Capacity: <b>{hasCapacityShortfall ? 'Shortfall' : 'OK'}</b>{' '}
                {bottleneck ? `(${bottleneck.utilizationPct.toFixed(1)}% util)` : ''}
              </div>
              <div className="small">
                • People: <b>{fte.toFixed(2)} FTE</b> estimated
              </div>
              <div className="small">
                • Supply risk: <b>{singleSourceCount}</b> single-source item(s)
              </div>
              <div className="small">
                • Cash tied up: <b>{aud0.format(invTotals.total)}</b> (pipeline + safety)
              </div>
              <div className="hint" style={{ marginTop: 10 }}>
                “Executive Summary” is designed to be screenshot-ready for SLT/ELT.
              </div>
            </div>

            <div className="card">
              <h3>Top Actions (auto)</h3>
              {topActions.length === 0 ? (
                <div className="small">No major actions flagged.</div>
              ) : (
                <ul className="small">
                  {topActions.map((a, idx) => (
                    <li key={idx} style={{ marginBottom: 10 }}>
                      <span className={`badge ${a.rag === 'Green' ? 'good' : a.rag === 'Amber' ? 'warn' : 'bad'}`}>
                        {a.rag}
                      </span>{' '}
                      <b>{a.title}</b>
                      <div className="hint">{a.detail}</div>
                      <button style={{ marginTop: 6 }} onClick={() => setActiveTab(a.goto)}>
                        Open: {a.goto}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="card">
            <h3>Margin Curve vs Volume</h3>
            <div style={{ width: '100%', height: 240 }}>
              <ResponsiveContainer>
                <LineChart data={[0.5, 0.75, 1, 1.25, 1.5].map((mult) => {
                  const demand = Math.round(scenario.inputs.monthlyDemand * mult);
                  const tmp = { ...scenario, inputs: { ...scenario.inputs, monthlyDemand: demand } };
                  const res = computeCostBreakdown(tmp);
                  return { volume: demand, marginPct: Number(res.marginPct.toFixed(1)) };
                })}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="volume" />
                  <YAxis unit="%" />
                  <Tooltip />
                  <Line type="monotone" dataKey="marginPct" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="hint">If the curve looks wrong, update: BOM unit costs, labour minutes/unit, logistics, holding/scrap.</div>
          </div>
        </div>
      )}

      {/* DECISIONS */}
      {activeTab === 'Decisions' && (
        <div>
          <EditableTable
            title="Top Planning Decisions (editable)"
            rows={decisions}
            columns={[
              { key: 'title', label: 'Decision / Question' },
              { key: 'target', label: 'Target / Definition of done', type: 'textarea' },
              { key: 'owner', label: 'Owner' },
              {
                key: 'status',
                label: 'Status',
                type: 'select',
                options: [
                  { label: 'Not started', value: 'Not started' },
                  { label: 'In progress', value: 'In progress' },
                  { label: 'Blocked', value: 'Blocked' },
                  { label: 'Done', value: 'Done' },
                ],
              },
              { key: 'notes', label: 'Notes', type: 'textarea' },
            ]}
            onChange={(rows) =>
              updateScenario({ ...scenario, decisions: rows }, `Updated Decisions (${nowIso()})`)
            }
            createRow={() => ({
              id: crypto.randomUUID(),
              title: 'New decision',
              target: '',
              owner: '',
              status: 'Not started' as const,
              notes: '',
            })}
          />

          <div className="card">
            <h3>How this becomes “exec-ready”</h3>
            <ul className="small">
              <li>Set the 3 decisions above (owners + targets).</li>
              <li>Fill Inputs + the core tables (Machines, Inventory, Logistics).</li>
              <li>Executive Summary auto-flags issues and produces a short “Top Actions” list.</li>
            </ul>
          </div>
        </div>
      )}

      {/* INPUTS */}
      {activeTab === 'Inputs' && (
        <div className="card">
          <h3>Global Drivers (AUD)</h3>
          <div className="hint" style={{ marginBottom: 8 }}>
            If you only enter anything in one place, enter it here first. These drivers power everything else.
          </div>
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
                        { ...scenario, inputs: { ...scenario.inputs, [k]: Number(e.target.value) } },
                        `Updated input ${String(k)} (${nowIso()})`
                      )
                    }
                  />
                </label>
              );
            })}
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

          <div className="table-wrap">
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
          </div>

          <div className="small" style={{ marginTop: 12 }}>
            Staffing estimate (FTE): <b>{fte.toFixed(2)}</b>
          </div>
        </div>
      )}

      {/* INVENTORY */}
      {activeTab === 'Inventory' && (
        <div>
          <div className="card">
            <h3>Inventory Exposure</h3>
            <div className="small">
              Pipeline: <b>{aud0.format(invTotals.pipelineValue)}</b> · Safety stock:{' '}
              <b>{aud0.format(invTotals.safetyStockValue)}</b> · Total: <b>{aud0.format(invTotals.total)}</b>
            </div>
          </div>

          <div className="card">
            <h3>Reorder Points (units)</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Lead Time (d)</th>
                    <th>ROP (units)</th>
                    <th>Pipeline (AUD)</th>
                    <th>SS (AUD)</th>
                  </tr>
                </thead>
                <tbody>
                  {invExposure.map((r) => (
                    <tr key={r.item}>
                      <td>{r.item}</td>
                      <td>{r.leadTimeDays}</td>
                      <td>{Math.round(r.reorderPointUnits).toLocaleString()}</td>
                      <td>{aud0.format(r.pipelineValue)}</td>
                      <td>{aud0.format(r.safetyStockValue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <EditableTable
            title="Inventory & BOM (editable)"
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
              { key: 'unitCost', label: 'Unit Cost (AUD)', type: 'number' },
              { key: 'usagePerProduct', label: 'Usage/Product', type: 'number' },
              { key: 'leadTimeDays', label: 'Lead Time (d)', type: 'number' },
              { key: 'moq', label: 'MOQ', type: 'number' },
              { key: 'singleSource', label: 'Single Source', type: 'checkbox' },
            ]}
            onChange={(rows) => updateScenario({ ...scenario, inventory: rows }, `Updated inventory (${nowIso()})`)}
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
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Lane</th>
                    <th>Shipments/mo</th>
                    <th>Cost/unit (AUD)</th>
                  </tr>
                </thead>
                <tbody>
                  {laneSummary.map((l) => (
                    <tr key={l.lane}>
                      <td>{l.lane}</td>
                      <td>{l.shipmentsPerMonth.toFixed(2)}</td>
                      <td>{aud.format(l.costPerUnit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <EditableTable
            title="Transport Lanes (editable)"
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
              { key: 'costPerShipment', label: 'Cost/Shipment (AUD)', type: 'number' },
              { key: 'unitsPerShipment', label: 'Units/Shipment', type: 'number' },
            ]}
            onChange={(rows) => updateScenario({ ...scenario, logistics: rows }, `Updated logistics (${nowIso()})`)}
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
        <EditableTable
          title="Stations & Machines (editable)"
          rows={scenario.machines}
          columns={[
            { key: 'station', label: 'Station' },
            { key: 'cycleTimeSec', label: 'Cycle Time (s)', type: 'number' },
            { key: 'machinesInstalled', label: 'Installed', type: 'number' },
          ]}
          onChange={(rows) => updateScenario({ ...scenario, machines: rows }, `Updated machines (${nowIso()})`)}
          createRow={() => ({
            id: crypto.randomUUID(),
            station: 'New station',
            cycleTimeSec: 60,
            machinesInstalled: 1,
          })}
        />
      )}

      {/* WAREHOUSES */}
      {activeTab === 'Warehouses' && (
        <EditableTable
          title="Warehouses (editable)"
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
            { key: 'monthlyCost', label: 'Monthly Cost (AUD)', type: 'number' },
            { key: 'utilizationPct', label: 'Util (0..1)', type: 'number' },
            { key: 'capacityPctLimit', label: 'Limit (0..1)', type: 'number' },
          ]}
          onChange={(rows) => updateScenario({ ...scenario, warehouses: rows }, `Updated warehouses (${nowIso()})`)}
          createRow={() => ({
            id: crypto.randomUUID(),
            location: 'New DC',
            type: 'FG' as const,
            monthlyCost: 0,
            utilizationPct: 0.5,
            capacityPctLimit: 0.85,
          })}
        />
      )}

      {/* MAINTENANCE */}
      {activeTab === 'Maintenance' && (
        <EditableTable
          title="Maintenance (editable)"
          rows={scenario.maintenance}
          columns={[
            { key: 'machineType', label: 'Machine Type' },
            { key: 'pmHoursPerMonth', label: 'PM hrs/mo', type: 'number' },
            { key: 'sparesCostPerMonth', label: 'Spares/mo (AUD)', type: 'number' },
            { key: 'serviceCostPerMonth', label: 'Service/mo (AUD)', type: 'number' },
          ]}
          onChange={(rows) => updateScenario({ ...scenario, maintenance: rows }, `Updated maintenance (${nowIso()})`)}
          createRow={() => ({
            id: crypto.randomUUID(),
            machineType: 'New',
            pmHoursPerMonth: 0,
            sparesCostPerMonth: 0,
            serviceCostPerMonth: 0,
          })}
        />
      )}

      {/* SIX PACK */}
      {activeTab === 'Six Pack' && (
        <div className="card">
          <h3>Six Pack Capability</h3>
          <ul className="small">
            {scenario.sixPack.map((r) => {
              const ev = evaluateSixPack(r);
              return (
                <li key={r.id}>
                  {r.metric}: {ev.pass ? 'PASS' : 'FAIL'} (Cp {ev.cp.toFixed(2)} Cpk {ev.cpk.toFixed(2)})
                </li>
              );
            })}
          </ul>
          <button onClick={() => downloadFile(`${scenario.name}-sixpack.csv`, sixPackCsv(scenario), 'text/csv')}>
            Export Six Pack CSV
          </button>
        </div>
      )}

      {/* RISK */}
      {activeTab === 'Risk' && (
        <EditableTable
          title="Risk Register (editable)"
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
            { key: 'mitigation', label: 'Mitigation', type: 'textarea' },
            { key: 'owner', label: 'Owner' },
          ]}
          onChange={(rows) => updateScenario({ ...scenario, risks: rows }, `Updated risks (${nowIso()})`)}
          createRow={() => ({
            id: crypto.randomUUID(),
            area: 'New area',
            status: 'Amber' as const,
            mitigation: '',
            owner: '',
          })}
        />
      )}

      {/* SUMMARY */}
      {activeTab === 'Summary / Export' && (
        <div className="card">
          <h3>Summary</h3>
          <div className="small">
            Total cost/unit: <b>{aud.format(cost.total)}</b> · Margin/unit: <b>{aud.format(cost.marginPerUnit)}</b> · Margin:{' '}
            <b>{cost.marginPct.toFixed(1)}%</b>
          </div>

          <h4>Cost breakdown (AUD / unit)</h4>
          <ul className="small">
            <li>Labour: {aud.format(cost.labour)}</li>
            <li>Labour overhead: {aud.format(cost.labourOverhead)}</li>
            <li>Material: {aud.format(cost.material)}</li>
            <li>Logistics: {aud.format(cost.logistics)}</li>
            <li>Warehouse: {aud.format(cost.warehouse)}</li>
            <li>Maintenance: {aud.format(cost.maintenance)}</li>
            <li>Holding: {aud.format(cost.holding)}</li>
            <li>CAPEX depreciation: {aud.format(cost.capexDepreciation)}</li>
            <li>Quality: {aud.format(cost.quality)}</li>
          </ul>

          <div className="header">
            <button onClick={() => downloadFile(`${scenario.name}-inventory.csv`, inventoryCsv(scenario), 'text/csv')}>
              Export Inventory CSV
            </button>
            <button onClick={() => downloadFile(`${scenario.name}.json`, exportScenarioJson(scenario), 'application/json')}>
              Export JSON
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
