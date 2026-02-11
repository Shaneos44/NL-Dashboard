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
  'How to use',
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

export default function App() {
  const [state, setState] = useState<AppState>(defaultState);
  const [activeTab, setActiveTab] = useState<Tab>('How to use');
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');
  const hydrated = useRef(false);

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

  const hasCapacityShortfall = capacityRows.some((r) => r.shortfallMachines > 0.0001);
  const singleSourceCount = scenario.inventory.filter((i) => i.singleSource).length;

  const inputKeys = Object.keys(scenario.inputs) as (keyof GlobalInputs)[];

  const scenarios: ScenarioName[] = ['Pilot', 'Ramp', 'Scale'];

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
        <h1>Ops & Planning Dashboard</h1>
        <div className="card">Loading scenario data…</div>
      </div>
    );
  }

  return (
    <div className="app">
      <h1>Ops & Planning Dashboard</h1>
      <div className="small">
        Currency: <b>AUD</b> · Data sync: {syncStatus}
      </div>

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
          <div className="hint">Tip: if margin is wrong, update unit costs, labour minutes, logistics, and holding/scrap in Inputs.</div>
        </div>

        <div className="card">
          <h3>What’s breaking?</h3>
          <div className={`badge ${cost.marginPct < scenario.inputs.marginGuardrailPct ? 'bad' : 'good'}`}>
            Margin guardrail {cost.marginPct < scenario.inputs.marginGuardrailPct ? 'breached' : 'healthy'}
          </div>{' '}
          <div className={`badge ${hasCapacityShortfall ? 'bad' : 'good'}`}>
            Capacity {hasCapacityShortfall ? 'shortfall' : 'OK'}
          </div>{' '}
          <div className={`badge ${singleSourceCount > 0 ? 'warn' : 'good'}`}>
            Single-source items: {singleSourceCount}
          </div>
          <hr />
          {bottleneck ? (
            <div className="small">
              Bottleneck: <b>{bottleneck.station}</b> ({bottleneck.utilizationPct.toFixed(1)}% util)
            </div>
          ) : (
            <div className="small">No stations defined yet.</div>
          )}
          <div className="small">
            Inventory exposure (pipeline + safety): <b>{aud0.format(invTotals.total)}</b>
          </div>
          <div className="hint">Go to Decisions → set your 3 questions, then fill Inputs + tables until alerts go green.</div>
        </div>
      </div>

      <div className="tab-row">
        {tabs.map((tab) => (
          <button key={tab} className={tab === activeTab ? 'active' : ''} onClick={() => setActiveTab(tab)}>
            {tab}
          </button>
        ))}
      </div>

      {/* HOW TO USE */}
      {activeTab === 'How to use' && (
        <div className="card">
          <h3>How to use this dashboard (fast)</h3>
          <ol>
            <li>
              <b>Decisions:</b> define your 3 planning questions (capacity / people / supply). Add an owner + target.
            </li>
            <li>
              <b>Inputs:</b> set demand, price, labour minutes, OEE, scrap, holding, safety stock.
            </li>
            <li>
              <b>Fill the tables:</b> Inventory (BOM), Machines (stations), Logistics (lanes), Warehouses & Maintenance.
              The dashboard then shows bottlenecks, required capacity, inventory exposure, and lane costs.
            </li>
          </ol>
          <hr />
          <div className="small">
            Recommended workflow: <b>Inputs → Machines → Inventory → Logistics</b>, then check <b>Processes</b> and <b>Summary</b>.
          </div>
        </div>
      )}

      {/* DECISIONS */}
      {activeTab === 'Decisions' && (
        <div>
          <EditableTable
            title="Top 3 Planning Decisions (editable)"
            rows={scenario.decisions}
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
            onChange={(rows) => updateScenario({ ...scenario, decisions: rows }, 'Updated decisions')}
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
            <h3>Helpful links (what answers what)</h3>
            <ul className="small">
              <li><b>Capacity & bottlenecks:</b> Processes + Machines</li>
              <li><b>People / labour load:</b> Processes (FTE estimate) + Inputs</li>
              <li><b>Supply chain orders & cash tied up:</b> Inventory exposure + Inventory table + Logistics</li>
              <li><b>Margin and cost drivers:</b> Summary / Export + Inputs</li>
            </ul>
          </div>
        </div>
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
                        `Updated input ${String(k)}`
                      )
                    }
                  />
                </label>
              );
            })}
          </div>
          <div className="hint" style={{ marginTop: 8 }}>
            Tip: keep utilization fields as 0..1. Set safetyStockDays + holdingRatePctAnnual for realistic inventory cost/exposure.
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
            Staffing estimate (FTE): <b>{fte.toFixed(2)}</b>
          </div>
        </div>
      )}

      {/* INVENTORY */}
      {activeTab === 'Inventory' && (
        <div>
          <div className="card">
            <h3>Inventory exposure (cash tied up)</h3>
            <div className="small">
              Pipeline: <b>{aud0.format(invTotals.pipelineValue)}</b> · Safety stock: <b>{aud0.format(invTotals.safetyStockValue)}</b> · Total:{' '}
              <b>{aud0.format(invTotals.total)}</b>
            </div>
            <div className="hint">Use this to set safetyStockDays and lead times; it directly affects cash tied up.</div>
          </div>

          <div className="card">
            <h3>Reorder Points (units)</h3>
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
            onChange={(rows) => updateScenario({ ...scenario, inventory: rows }, 'Updated inventory')}
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
            <h3>Lane summary</h3>
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
            onChange={(rows) => updateScenario({ ...scenario, logistics: rows }, 'Updated logistics')}
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
          onChange={(rows) => updateScenario({ ...scenario, machines: rows }, 'Updated machines')}
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
          onChange={(rows) => updateScenario({ ...scenario, warehouses: rows }, 'Updated warehouses')}
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
          onChange={(rows) => updateScenario({ ...scenario, maintenance: rows }, 'Updated maintenance')}
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
          <div className="hint">This is a quick capability signal. For a real system you’d add measurement system + sampling plan.</div>
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
          onChange={(rows) => updateScenario({ ...scenario, risks: rows }, 'Updated risks')}
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
            Total cost/unit: <b>{aud.format(cost.total)}</b> · Margin/unit: <b>{aud.format(cost.marginPerUnit)}</b> · Margin: <b>{cost.marginPct.toFixed(1)}%</b>
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
