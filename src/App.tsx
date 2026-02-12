import { useEffect, useMemo, useRef, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

import './components/styles.css';
import { EditableTable } from './components/EditableTable';
import { KpiCard } from './components/KpiCard';

import type { GlobalInputs, ScenarioName } from './lib/types';
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
  inventoryRemainingAfterProduction,
  productionUnitsGoodCompleted,
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
  'Production',
  'Stock Take',
  'Resources',
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

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function App() {
  const [state, setState] = useState<AppState>(defaultState);
  const [activeTab, setActiveTab] = useState<Tab>('Executive Summary');
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');
  const hydrated = useRef(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const loaded = await loadState();

      // Lightweight migration for older states:
      // - ensure arrays exist
      // - ensure inventory has onHandQty etc
      // - ensure production runs have new scrap fields
      const patched = structuredClone(loaded) as any;

      (['Pilot', 'Ramp', 'Scale'] as ScenarioName[]).forEach((sn) => {
        const sc = patched.scenarios?.[sn];
        if (!sc) return;

        sc.people = Array.isArray(sc.people) ? sc.people : [];
        sc.machineAssets = Array.isArray(sc.machineAssets) ? sc.machineAssets : [];
        sc.production = Array.isArray(sc.production) ? sc.production : [];

        sc.production = sc.production.map((r: any) => ({
          ...r,
          consumptionOverrides: typeof r?.consumptionOverrides === 'string' ? r.consumptionOverrides : '',
          scrapScope: r?.scrapScope === 'Full BOM' ? 'Full BOM' : 'Components',
          componentScrapOverrides: typeof r?.componentScrapOverrides === 'string' ? r.componentScrapOverrides : '',
        }));

        sc.inventory = Array.isArray(sc.inventory)
          ? sc.inventory.map((it: any) => ({
              ...it,
              onHandQty: typeof it.onHandQty === 'number' ? it.onHandQty : 0,
              reorderPointQty: typeof it.reorderPointQty === 'number' ? it.reorderPointQty : undefined,
              minQty: typeof it.minQty === 'number' ? it.minQty : undefined,
              uom: typeof it.uom === 'string' ? it.uom : 'pcs',
              location: typeof it.location === 'string' ? it.location : '',
            }))
          : [];

        sc.auditLog = Array.isArray(sc.auditLog) ? sc.auditLog : [];
      });

      if (mounted) {
        setState(patched);
        setLoading(false);
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

  const scenario = state.scenarios[state.selectedScenario];

  const cost = useMemo(() => computeCostBreakdown(scenario), [scenario]);
  const takt = useMemo(() => computeTaktTimeMinutes(scenario), [scenario]);
  const sixYield = useMemo(() => sixPackYieldPct(scenario), [scenario]);
  const score = useMemo(() => riskScore(scenario, cost.marginPct), [scenario, cost.marginPct]);

  const capacityRows = useMemo(() => computeStationCapacity(scenario), [scenario]);
  const bottleneck = useMemo(() => bottleneckStation(scenario), [scenario]);
  const fte = useMemo(() => fteRequired(scenario), [scenario]);

  const invTotals = useMemo(() => inventoryExposureTotals(scenario), [scenario]);

  const laneSummary = useMemo(() => logisticsSummary(scenario), [scenario]);

  const completedUnits = useMemo(() => productionUnitsGoodCompleted(scenario), [scenario]);
  const stockView = useMemo(() => inventoryRemainingAfterProduction(scenario), [scenario]);
  const belowMinCount = stockView.filter((x) => x.status === 'Below Min').length;
  const reorderCount = stockView.filter((x) => x.status === 'Reorder').length;

  const hasCapacityShortfall = capacityRows.some((r: { shortfallMachines: number }) => r.shortfallMachines > 0.0001);
  const singleSourceCount = scenario.inventory.filter((i) => i.singleSource).length;

  const scenarios: ScenarioName[] = ['Pilot', 'Ramp', 'Scale'];
  const inputKeys = Object.keys(scenario.inputs) as (keyof GlobalInputs)[];

  const updateScenario = (next: typeof scenario, note?: string) => {
    const audit = note ? [...next.auditLog, note] : next.auditLog;
    const patched = { ...next, auditLog: audit };
    setState((s: AppState) => ({
      ...s,
      scenarios: { ...s.scenarios, [s.selectedScenario]: patched },
    }));
  };

  const marginCurve = useMemo(() => {
    return [0.5, 0.75, 1, 1.25, 1.5].map((mult) => {
      const demand = Math.round(scenario.inputs.monthlyDemand * mult);
      const tmp = { ...scenario, inputs: { ...scenario.inputs, monthlyDemand: demand } };
      const res = computeCostBreakdown(tmp);
      return { volume: demand, marginPct: Number(res.marginPct.toFixed(1)) };
    });
  }, [scenario]);

  if (loading) {
    return (
      <div className="app">
        <h1>Ops & Production Dashboard</h1>
        <div className="card">Loading…</div>
      </div>
    );
  }

  return (
    <div className="app">
      <h1>Ops & Production Dashboard</h1>
      <div className="small">
        Currency: <b>AUD</b> · Sync: {syncStatus}
      </div>

      <div className="header">
        <select
          value={state.selectedScenario}
          onChange={(e) => setState((s: AppState) => ({ ...s, selectedScenario: e.target.value as ScenarioName }))}
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
              state.selectedScenario === 'Pilot' ? 'Ramp' : state.selectedScenario === 'Ramp' ? 'Scale' : 'Pilot';
            setState(duplicateScenario(state, state.selectedScenario, target));
          }}
        >
          Duplicate Scenario
        </button>

        <button onClick={() => downloadFile(`${scenario.name}.json`, exportScenarioJson(scenario), 'application/json')}>
          Export JSON
        </button>
      </div>

      <div className="kpis">
        <KpiCard label="Revenue / mo" value={aud0.format(scenario.inputs.salePricePerUnit * scenario.inputs.monthlyDemand)} />
        <KpiCard
          label="Margin %"
          value={`${cost.marginPct.toFixed(1)}%`}
          tone={cost.marginPct > scenario.inputs.marginGuardrailPct ? 'good' : 'bad'}
        />
        <KpiCard label="Capacity" value={hasCapacityShortfall ? 'Shortfall' : 'OK'} tone={hasCapacityShortfall ? 'bad' : 'good'} />
        <KpiCard label="Completed units" value={completedUnits.toLocaleString()} />
        <KpiCard
          label="Stock alerts"
          value={`${belowMinCount} below min / ${reorderCount} reorder`}
          tone={belowMinCount > 0 ? 'bad' : reorderCount > 0 ? 'warn' : 'good'}
        />
        <KpiCard label="Single-source items" value={String(singleSourceCount)} tone={singleSourceCount > 0 ? 'warn' : 'good'} />
      </div>

      <div className="tab-row">
        {tabs.map((tab) => (
          <button key={tab} className={tab === activeTab ? 'active' : ''} onClick={() => setActiveTab(tab)}>
            {tab}
          </button>
        ))}
      </div>

      {/* EXEC SUMMARY */}
      {activeTab === 'Executive Summary' && (
        <div className="layout-grid">
          <div className="card">
            <h3>Executive Snapshot</h3>
            <div className="small">
              • Demand: <b>{scenario.inputs.monthlyDemand.toLocaleString()}</b> units/mo
              <br />• Total cost/unit: <b>{aud.format(cost.total)}</b>
              <br />• Bottleneck: <b>{bottleneck ? bottleneck.station : '—'}</b>
              <br />• FTE estimate: <b>{fte.toFixed(2)}</b>
              <br />• Inventory exposure: <b>{aud0.format(invTotals.total)}</b>
              <br />• Stock alerts: <b>{belowMinCount}</b> below min, <b>{reorderCount}</b> reorder
              <br />• Risk score: <b>{score}</b> · Six Pack yield: <b>{sixYield.toFixed(1)}%</b> · Takt: <b>{takt.toFixed(2)} min</b>
            </div>
          </div>

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
        </div>
      )}

      {/* PRODUCTION TAB */}
      {activeTab === 'Production' && (
        <div>
          <div className="card">
            <h3>Production Schedule & Run Log</h3>
            <div className="hint">
              Stock Take consumption rules:
              <br />
              <b>Always</b> consumes <code>BOM × unitsGood</code>.
              <br />
              If <b>Scrap scope = Full BOM</b> (post-assembly rejects): also consumes <code>BOM × unitsScrap</code>.
              <br />
              If <b>Scrap scope = Components</b> (assembly scrap): add component scrap lines below (can be uneven per item).
              <br />
              Optional: “Actual consumption overrides” sets absolute consumed qty per item for the run (wins last).
              <br />
              Line format: <code>Item Name, Qty</code>
            </div>
          </div>

          <EditableTable
            title="Runs"
            rows={scenario.production}
            columns={[
              { key: 'date', label: 'Date' },
              { key: 'startTime', label: 'Start (HH:MM)' },
              { key: 'durationMin', label: 'Duration (min)', type: 'number' },
              { key: 'process', label: 'Process' },
              { key: 'workOrder', label: 'Work Order' },
              { key: 'unitsPlanned', label: 'Planned', type: 'number' },
              { key: 'unitsGood', label: 'Good', type: 'number' },
              { key: 'unitsScrap', label: 'Scrap', type: 'number' },
              {
                key: 'scrapScope',
                label: 'Scrap scope',
                type: 'select',
                options: [
                  { label: 'Components (assembly)', value: 'Components' },
                  { label: 'Full BOM (post-assembly)', value: 'Full BOM' },
                ],
              },
              { key: 'componentScrapOverrides', label: 'Component scrap (Item,Qty)', type: 'textarea' },
              { key: 'assignedPeople', label: 'People (comma list)', type: 'textarea' },
              { key: 'machinesUsed', label: 'Machines (comma list)', type: 'textarea' },
              {
                key: 'status',
                label: 'Status',
                type: 'select',
                options: [
                  { label: 'Planned', value: 'Planned' },
                  { label: 'In Progress', value: 'In Progress' },
                  { label: 'Complete', value: 'Complete' },
                  { label: 'Blocked', value: 'Blocked' },
                  { label: 'Cancelled', value: 'Cancelled' },
                ],
              },
              { key: 'notes', label: 'Notes', type: 'textarea' },
              { key: 'observations', label: 'Observations', type: 'textarea' },
              { key: 'consumptionOverrides', label: 'Actual consumption overrides (Item,Qty)', type: 'textarea' },
            ]}
            onChange={(rows) => updateScenario({ ...scenario, production: rows }, `Updated production runs (${nowIso()})`)}
            createRow={() => ({
              id: crypto.randomUUID(),
              date: todayYmd(),
              startTime: '08:00',
              durationMin: 120,
              process: 'Final Assembly',
              workOrder: '',
              unitsPlanned: 0,
              unitsGood: 0,
              unitsScrap: 0,
              scrapScope: 'Components' as const,
              componentScrapOverrides: '',
              assignedPeople: '',
              machinesUsed: '',
              status: 'Planned' as const,
              notes: '',
              observations: '',
              consumptionOverrides: '',
            })}
          />

          <div className="card">
            <h3>Machine Usage Quick View</h3>
            <div className="hint">Update machine status in Resources tab. Use machine names in the run’s “Machines” field.</div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Machine</th>
                    <th>Station</th>
                    <th>Status</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {scenario.machineAssets.map((m) => (
                    <tr key={m.id}>
                      <td>{m.name}</td>
                      <td>{m.station}</td>
                      <td>{m.status}</td>
                      <td>{m.notes}</td>
                    </tr>
                  ))}
                  {scenario.machineAssets.length === 0 && (
                    <tr>
                      <td colSpan={4} className="small">
                        No machine assets yet. Add them in Resources.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* STOCK TAKE TAB */}
      {activeTab === 'Stock Take' && (
        <div>
          <div className="card">
            <h3>Stock Take</h3>
            <div className="small">
              Completed runs consume stock using the Production rules (good + scrap + optional overrides).
            </div>
          </div>

          <div className="card">
            <h3>Remaining Stock (after completed production)</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>On hand</th>
                    <th>Consumed</th>
                    <th>Remaining</th>
                    <th>Reorder point</th>
                    <th>Min</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {stockView.map((r: any) => (
                    <tr key={r.id}>
                      <td>{r.name}</td>
                      <td>{r.onHandQty.toLocaleString()}</td>
                      <td>{Math.round(r.consumedQty).toLocaleString()}</td>
                      <td>{Math.round(r.remainingQty).toLocaleString()}</td>
                      <td>{r.reorderPointQty == null ? '—' : r.reorderPointQty.toLocaleString()}</td>
                      <td>{r.minQty == null ? '—' : r.minQty.toLocaleString()}</td>
                      <td>{r.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="hint" style={{ marginTop: 8 }}>
              To adjust physical stock counts, edit Inventory → onHandQty / reorderPointQty / minQty.
            </div>
          </div>
        </div>
      )}

      {/* RESOURCES TAB */}
      {activeTab === 'Resources' && (
        <div>
          <EditableTable
            title="People"
            rows={scenario.people}
            columns={[
              { key: 'name', label: 'Name' },
              { key: 'role', label: 'Role' },
              { key: 'shift', label: 'Shift' },
              { key: 'notes', label: 'Notes', type: 'textarea' },
            ]}
            onChange={(rows) => updateScenario({ ...scenario, people: rows }, `Updated people (${nowIso()})`)}
            createRow={() => ({
              id: crypto.randomUUID(),
              name: 'New person',
              role: 'Operator',
              shift: 'Day',
              notes: '',
            })}
          />

          <EditableTable
            title="Machine Assets"
            rows={scenario.machineAssets}
            columns={[
              { key: 'name', label: 'Machine name' },
              { key: 'station', label: 'Station' },
              {
                key: 'status',
                label: 'Status',
                type: 'select',
                options: [
                  { label: 'Available', value: 'Available' },
                  { label: 'In Use', value: 'In Use' },
                  { label: 'Out of Service', value: 'Out of Service' },
                ],
              },
              { key: 'notes', label: 'Notes', type: 'textarea' },
            ]}
            onChange={(rows) => updateScenario({ ...scenario, machineAssets: rows }, `Updated machine assets (${nowIso()})`)}
            createRow={() => ({
              id: crypto.randomUUID(),
              name: 'New machine',
              station: 'Final Assembly',
              status: 'Available' as const,
              notes: '',
            })}
          />
        </div>
      )}

      {/* DECISIONS */}
      {activeTab === 'Decisions' && (
        <EditableTable
          title="Top Planning Decisions"
          rows={scenario.decisions}
          columns={[
            { key: 'title', label: 'Decision' },
            { key: 'target', label: 'Target', type: 'textarea' },
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
          onChange={(rows) => updateScenario({ ...scenario, decisions: rows }, `Updated decisions (${nowIso()})`)}
          createRow={() => ({
            id: crypto.randomUUID(),
            title: 'New decision',
            target: '',
            owner: '',
            status: 'Not started' as const,
            notes: '',
          })}
        />
      )}

      {/* INPUTS */}
      {activeTab === 'Inputs' && (
        <div className="card">
          <h3>Global Drivers (AUD)</h3>
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
        <EditableTable
          title="Inventory & BOM + Stock (editable)"
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
            { key: 'onHandQty', label: 'On hand', type: 'number' },
            { key: 'reorderPointQty', label: 'Reorder point', type: 'number' },
            { key: 'minQty', label: 'Min', type: 'number' },
            { key: 'leadTimeDays', label: 'Lead Time (d)', type: 'number' },
            { key: 'moq', label: 'MOQ', type: 'number' },
            { key: 'location', label: 'Location' },
            { key: 'uom', label: 'UoM' },
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
            onHandQty: 0,
            reorderPointQty: 0,
            minQty: 0,
            uom: 'pcs',
            location: '',
          })}
        />
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
                  {laneSummary.map((l: { lane: string; shipmentsPerMonth: number; costPerUnit: number }) => (
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
          title="Stations & Machines"
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
          title="Warehouses"
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
          title="Maintenance"
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
            {scenario.sixPack.map((r: any) => {
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
          title="Risk Register"
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

          <h4>Exports</h4>
          <div className="header">
            <button onClick={() => downloadFile(`${scenario.name}-inventory.csv`, inventoryCsv(scenario), 'text/csv')}>
              Export Inventory CSV
            </button>
            <button onClick={() => downloadFile(`${scenario.name}-sixpack.csv`, sixPackCsv(scenario), 'text/csv')}>
              Export Six Pack CSV
            </button>
            <button onClick={() => downloadFile(`${scenario.name}.json`, exportScenarioJson(scenario), 'application/json')}>
              Export JSON
            </button>
          </div>

          <div className="hint" style={{ marginTop: 10 }}>
            Inventory exposure (planning): {aud0.format(invTotals.total)} · Completed units (execution): {completedUnits.toLocaleString()}
          </div>
        </div>
      )}
    </div>
  );
}
