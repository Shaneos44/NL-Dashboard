import { useEffect, useMemo, useRef, useState } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { EditableTable } from './components/EditableTable';
import { KpiCard } from './components/KpiCard';
import './components/styles.css';
import { computeCostBreakdown, computeTaktTimeMinutes, evaluateSixPack, machineRequirementForStation, riskScore, sixPackYieldPct } from './lib/calc';
import { defaultState, duplicateScenario, exportScenarioJson, inventoryCsv, loadState, saveState, sixPackCsv } from './lib/store';
import { loadState, saveState, duplicateScenario, exportScenarioJson, inventoryCsv, sixPackCsv } from './lib/store';
import { ScenarioName } from './lib/types';

const tabs = ['Inputs', 'Processes', 'Inventory', 'Machines', 'Warehouses', 'Logistics/Lanes', 'Maintenance', 'Quality', 'Six Pack', 'Risk', 'Audit/Change Log', 'Summary / Export'];

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
  const [state, setState] = useState(defaultState);
  const [activeTab, setActiveTab] = useState(tabs[0]);
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
    saveState(state)
      .then(() => setSyncStatus('synced'))
      .catch(() => setSyncStatus('error'));
  }, [loading, state]);
  const [state, setState] = useState(loadState());
  const [activeTab, setActiveTab] = useState(tabs[0]);

  useEffect(() => saveState(state), [state]);

  const scenario = state.scenarios[state.selectedScenario];
  const cost = useMemo(() => computeCostBreakdown(scenario), [scenario]);
  const takt = useMemo(() => computeTaktTimeMinutes(scenario), [scenario]);
  const sixYield = useMemo(() => sixPackYieldPct(scenario), [scenario]);
  const score = useMemo(() => riskScore(scenario, cost.marginPct), [scenario, cost.marginPct]);

  const updateScenario = (next: typeof scenario) => {
    setState((s) => ({ ...s, scenarios: { ...s.scenarios, [s.selectedScenario]: next } }));
  };

  const marginCurve = [0.5, 0.75, 1, 1.25, 1.5].map((mult) => {
    const demand = Math.round(scenario.inputs.monthlyDemand * mult);
    const tmp = { ...scenario, inputs: { ...scenario.inputs, monthlyDemand: demand } };
    const res = computeCostBreakdown(tmp);
    return { volume: demand, marginPct: Number(res.marginPct.toFixed(1)) };
  });

  const scenarios: ScenarioName[] = ['Pilot', 'Ramp', 'Scale'];

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
        <select value={state.selectedScenario} onChange={(e) => setState((s) => ({ ...s, selectedScenario: e.target.value as ScenarioName }))}>
          {scenarios.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <button onClick={() => {
          const next = duplicateScenario(state, state.selectedScenario, state.selectedScenario === 'Pilot' ? 'Ramp' : 'Scale');
          setState(next);
        }}>Duplicate Scenario</button>
        <button onClick={() => downloadFile(`${scenario.name}.json`, exportScenarioJson(scenario), 'application/json')}>Export JSON</button>
        <button onClick={() => downloadFile(`${scenario.name}-inventory.csv`, inventoryCsv(scenario), 'text/csv')}>Export Inventory CSV</button>
        <button onClick={() => downloadFile(`${scenario.name}-sixpack.csv`, sixPackCsv(scenario), 'text/csv')}>Export Six Pack CSV</button>
      </div>

      <div className="kpis">
        <KpiCard label="Revenue / mo" value={`€${(scenario.inputs.salePricePerUnit * scenario.inputs.monthlyDemand).toLocaleString()}`} />
        <KpiCard label="Total cost / unit" value={`€${cost.total.toFixed(2)}`} />
        <KpiCard label="Margin %" value={`${cost.marginPct.toFixed(1)}%`} tone={cost.marginPct > scenario.inputs.marginGuardrailPct ? 'good' : 'bad'} />
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
                <Line type="monotone" dataKey="marginPct" stroke="#63d6ff" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card small">
          <h3>Guardrail Alerts</h3>
          <ul>
            <li>Margin threshold: {cost.marginPct < scenario.inputs.marginGuardrailPct ? '🔴 breached' : '🟢 healthy'}</li>
            <li>Bottleneck: {scenario.machines.some((m) => machineRequirementForStation(scenario, m.cycleTimeSec) > m.machinesInstalled) ? '🔴 capacity risk' : '🟢 adequate'}</li>
            <li>Single-source critical items: {scenario.inventory.filter((i) => i.singleSource).length}</li>
          </ul>
        </div>
      </div>

      <div className="tab-row">
        {tabs.map((tab) => (
          <button key={tab} className={tab === activeTab ? 'active' : ''} onClick={() => setActiveTab(tab)}>{tab}</button>
        ))}
      </div>

      {activeTab === 'Inputs' && (
        <div className="card">
          <h3>Global Drivers</h3>
          <div className="header">
            {Object.entries(scenario.inputs).map(([k, v]) => (
              <label key={k}>{k}
                <input type="number" value={v} onChange={(e) => updateScenario({ ...scenario, inputs: { ...scenario.inputs, [k]: Number(e.target.value) }, auditLog: [...scenario.auditLog, `Updated input ${k}`] })} />
              </label>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'Processes' && <div className="card"><h3>Process Throughput</h3><p>Cycle time, OEE and bottleneck shown in Machines tab with machine requirement estimates.</p></div>}

      {activeTab === 'Inventory' && (
        <EditableTable
          title="Inventory & BOM"
          rows={scenario.inventory}
          columns={[
            { key: 'name', label: 'Item' },
            { key: 'category', label: 'Category' },
            { key: 'unitCost', label: 'Unit Cost', type: 'number' },
            { key: 'usagePerProduct', label: 'Usage/Product', type: 'number' },
            { key: 'leadTimeDays', label: 'Lead Time (d)', type: 'number' },
            { key: 'moq', label: 'MOQ', type: 'number' },
            { key: 'singleSource', label: 'Single Source', type: 'checkbox' },
          ]}
          onChange={(rows) => updateScenario({ ...scenario, inventory: rows, auditLog: [...scenario.auditLog, 'Inventory table edited'] })}
          createRow={() => ({ id: crypto.randomUUID(), name: 'New item', category: 'RM' as const, unitCost: 0, usagePerProduct: 1, leadTimeDays: 0, moq: 0, singleSource: false })}
          createRow={() => ({ id: crypto.randomUUID(), name: 'New item', category: 'RM', unitCost: 0, usagePerProduct: 1, leadTimeDays: 0, moq: 0, singleSource: false })}
        />
      )}

      {activeTab === 'Machines' && (
        <div className="card">
          <h3>Machine Requirements</h3>
          <ul>
            {scenario.machines.map((m) => {
              const req = machineRequirementForStation(scenario, m.cycleTimeSec);
              return <li key={m.id}>{m.station}: required {req.toFixed(2)} vs installed {m.machinesInstalled}</li>;
            })}
          </ul>
        </div>
      )}

      {activeTab === 'Warehouses' && <EditableTable title="Warehouse Planning" rows={scenario.warehouses} columns={[{ key: 'location', label: 'Location' }, { key: 'type', label: 'Type' }, { key: 'monthlyCost', label: 'Monthly Cost', type: 'number' }, { key: 'utilizationPct', label: 'Utilization', type: 'number' }]} onChange={(rows) => updateScenario({ ...scenario, warehouses: rows })} createRow={() => ({ id: crypto.randomUUID(), location: 'New DC', type: 'FG' as const, monthlyCost: 0, utilizationPct: 0.5 })} />}
      {activeTab === 'Logistics/Lanes' && <EditableTable title="Transport Lanes" rows={scenario.logistics} columns={[{ key: 'lane', label: 'Lane' }, { key: 'direction', label: 'Direction' }, { key: 'mode', label: 'Mode' }, { key: 'costPerShipment', label: 'Cost/Shipment', type: 'number' }, { key: 'unitsPerShipment', label: 'Units/Shipment', type: 'number' }]} onChange={(rows) => updateScenario({ ...scenario, logistics: rows })} createRow={() => ({ id: crypto.randomUUID(), lane: 'New Lane', direction: 'Inbound' as const, mode: 'Road' as const, costPerShipment: 0, unitsPerShipment: 1 })} />}
      {activeTab === 'Warehouses' && <EditableTable title="Warehouse Planning" rows={scenario.warehouses} columns={[{ key: 'location', label: 'Location' }, { key: 'type', label: 'Type' }, { key: 'monthlyCost', label: 'Monthly Cost', type: 'number' }, { key: 'utilizationPct', label: 'Utilization', type: 'number' }]} onChange={(rows) => updateScenario({ ...scenario, warehouses: rows })} createRow={() => ({ id: crypto.randomUUID(), location: 'New DC', type: 'FG', monthlyCost: 0, utilizationPct: 0.5 })} />}
      {activeTab === 'Logistics/Lanes' && <EditableTable title="Transport Lanes" rows={scenario.logistics} columns={[{ key: 'lane', label: 'Lane' }, { key: 'direction', label: 'Direction' }, { key: 'mode', label: 'Mode' }, { key: 'costPerShipment', label: 'Cost/Shipment', type: 'number' }, { key: 'unitsPerShipment', label: 'Units/Shipment', type: 'number' }]} onChange={(rows) => updateScenario({ ...scenario, logistics: rows })} createRow={() => ({ id: crypto.randomUUID(), lane: 'New Lane', direction: 'Inbound', mode: 'Road', costPerShipment: 0, unitsPerShipment: 1 })} />}
      {activeTab === 'Maintenance' && <EditableTable title="Maintenance" rows={scenario.maintenance} columns={[{ key: 'machineType', label: 'Machine Type' }, { key: 'pmHoursPerMonth', label: 'PM hrs/mo', type: 'number' }, { key: 'sparesCostPerMonth', label: 'Spares', type: 'number' }, { key: 'serviceCostPerMonth', label: 'Service', type: 'number' }]} onChange={(rows) => updateScenario({ ...scenario, maintenance: rows })} createRow={() => ({ id: crypto.randomUUID(), machineType: 'New', pmHoursPerMonth: 0, sparesCostPerMonth: 0, serviceCostPerMonth: 0 })} />}

      {activeTab === 'Quality' && <div className="card"><h3>Quality module</h3><p>Includes quality cost in total cost model and Six Pack capability checks.</p></div>}

      {activeTab === 'Six Pack' && (
        <div className="card">
          <h3>Six Pack Capability</h3>
          <ul>
            {scenario.sixPack.map((r) => {
              const ev = evaluateSixPack(r);
              return <li key={r.id}>{r.metric}: {ev.pass ? 'PASS' : 'FAIL'} (Cp {ev.cp.toFixed(2)} Cpk {ev.cpk.toFixed(2)})</li>;
            })}
          </ul>
          <button onClick={() => window.print()}>Print Six Pack Report</button>
        </div>
      )}

      {activeTab === 'Risk' && <EditableTable title="Risk Register" rows={scenario.risks} columns={[{ key: 'area', label: 'Area' }, { key: 'status', label: 'Status' }, { key: 'mitigation', label: 'Mitigation' }, { key: 'owner', label: 'Owner' }]} onChange={(rows) => updateScenario({ ...scenario, risks: rows })} createRow={() => ({ id: crypto.randomUUID(), area: 'New area', status: 'Amber' as const, mitigation: '', owner: '' })} />}
      {activeTab === 'Risk' && <EditableTable title="Risk Register" rows={scenario.risks} columns={[{ key: 'area', label: 'Area' }, { key: 'status', label: 'Status' }, { key: 'mitigation', label: 'Mitigation' }, { key: 'owner', label: 'Owner' }]} onChange={(rows) => updateScenario({ ...scenario, risks: rows })} createRow={() => ({ id: crypto.randomUUID(), area: 'New area', status: 'Amber', mitigation: '', owner: '' })} />}
      {activeTab === 'Audit/Change Log' && <div className="card"><h3>Audit Log</h3><ul>{scenario.auditLog.map((e, i) => <li key={i}>{e}</li>)}</ul></div>}
      {activeTab === 'Summary / Export' && <div className="card"><h3>Summary</h3><p>Gross margin per unit: €{cost.marginPerUnit.toFixed(2)} | Total cost per unit: €{cost.total.toFixed(2)}</p></div>}
    </div>
  );
}
