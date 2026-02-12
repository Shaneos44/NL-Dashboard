import { useEffect, useMemo, useRef, useState } from 'react';

import './components/styles.css';
import { EditableTable } from './components/EditableTable';
import { KpiCard } from './components/KpiCard';
import { ProductionCalendar } from './components/ProductionCalendar';
import { MaintenancePlanner } from './components/MaintenancePlanner';

import type { ScenarioName } from './lib/types';
import type { AppState } from './lib/store';

import { computeCostBreakdown, stockRemainingAfterProduction, summaryAlerts } from './lib/calc';
import { defaultState, loadState, saveState, duplicateScenario, exportScenarioJson } from './lib/store';

const tabs = ['Summary', 'Production', 'Stock', 'Resources', 'Decisions & Tracking', 'Inputs', 'Logistics', 'Warehouses', 'Maintenance', 'Risk'] as const;
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

export default function App() {
  const [state, setState] = useState<AppState>(defaultState);
  const [activeTab, setActiveTab] = useState<Tab>('Summary');
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');
  const hydrated = useRef(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const loaded = await loadState();
      const patched = structuredClone(loaded) as any;

      (['Pilot', 'Ramp', 'Scale'] as ScenarioName[]).forEach((sn) => {
        const sc = patched.scenarios?.[sn];
        if (!sc) return;

        // migrate older data safely
        sc.decisions = Array.isArray(sc.decisions) ? sc.decisions : [];
        sc.capas = Array.isArray(sc.capas) ? sc.capas : [];

        sc.stock = Array.isArray(sc.stock) ? sc.stock : [];
        sc.people = Array.isArray(sc.people) ? sc.people : [];
        sc.machines = Array.isArray(sc.machines) ? sc.machines : [];
        sc.processes = Array.isArray(sc.processes) ? sc.processes : [];

        sc.batches = Array.isArray(sc.batches) ? sc.batches : [];
        sc.schedule = Array.isArray(sc.schedule) ? sc.schedule : [];
        sc.maintenanceBlocks = Array.isArray(sc.maintenanceBlocks) ? sc.maintenanceBlocks : [];

        sc.logistics = Array.isArray(sc.logistics) ? sc.logistics : [];
        sc.warehouses = Array.isArray(sc.warehouses) ? sc.warehouses : [];
        sc.risks = Array.isArray(sc.risks) ? sc.risks : [];

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

  const cost = useMemo(() => computeCostBreakdown(scenario as any), [scenario]);
  const stockView = useMemo(() => stockRemainingAfterProduction(scenario as any), [scenario]);
  const alerts = useMemo(() => summaryAlerts(scenario as any), [scenario]);

  const updateScenario = (next: typeof scenario, note?: string) => {
    const audit = note ? [...next.auditLog, note] : next.auditLog;
    const patched = { ...next, auditLog: audit };
    setState((s: AppState) => ({
      ...s,
      scenarios: { ...s.scenarios, [s.selectedScenario]: patched },
    }));
  };

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
          {(['Pilot', 'Ramp', 'Scale'] as ScenarioName[]).map((n) => (
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

        <button onClick={() => downloadFile(`${scenario.name}.json`, exportScenarioJson(scenario as any), 'application/json')}>
          Export JSON
        </button>
      </div>

      <div className="kpis">
        <KpiCard label="Revenue / mo" value={aud0.format((scenario as any).inputs.salePricePerUnit * (scenario as any).inputs.monthlyDemand)} />
        <KpiCard
          label="Margin %"
          value={`${cost.marginPct.toFixed(1)}%`}
          tone={cost.marginPct > (scenario as any).inputs.marginGuardrailPct ? 'good' : 'bad'}
        />
        <KpiCard label="Stock" value={`${alerts.belowMin} below min / ${alerts.reorder} reorder`} tone={alerts.belowMin > 0 ? 'bad' : alerts.reorder > 0 ? 'warn' : 'good'} />
        <KpiCard label="Open issues" value={String(alerts.openIssues)} tone={alerts.openIssues > 0 ? 'warn' : 'good'} />
        <KpiCard label="Open CAPAs" value={String(alerts.openCapas)} tone={alerts.openCapas > 0 ? 'warn' : 'good'} />
        <KpiCard label="Machines down" value={String(alerts.machinesDown)} tone={alerts.machinesDown > 0 ? 'bad' : 'good'} />
      </div>

      <div className="tab-row">
        {tabs.map((tab) => (
          <button key={tab} className={tab === activeTab ? 'active' : ''} onClick={() => setActiveTab(tab)}>
            {tab}
          </button>
        ))}
      </div>

      {/* SUMMARY */}
      {activeTab === 'Summary' && (
        <div className="layout-grid">
          <div className="card">
            <h3>Executive summary</h3>
            <div className="small">
              • Demand: <b>{(scenario as any).inputs.monthlyDemand.toLocaleString()}</b> units/mo
              <br />• Total cost/unit: <b>{aud.format(cost.total)}</b>
              <br />• Margin/unit: <b>{aud.format(cost.marginPerUnit)}</b> · Margin: <b>{cost.marginPct.toFixed(1)}%</b>
              <br />• Stock: <b>{alerts.belowMin}</b> below min, <b>{alerts.reorder}</b> reorder
              <br />• Open issues: <b>{alerts.openIssues}</b> · Open CAPAs: <b>{alerts.openCapas}</b> · Machines down: <b>{alerts.machinesDown}</b>
            </div>

            <div className="hint" style={{ marginTop: 12 }}>
              This dashboard links Resources → Production → Stock automatically. Mark scheduled processes <b>Complete</b> to apply stock usage (good + scrap rules).
            </div>
          </div>

          <div className="card">
            <h3>What needs attention</h3>
            <ul className="small">
              {alerts.belowMin > 0 && <li><b>Stock below minimum</b> — check Stock tab and raise orders.</li>}
              {alerts.reorder > 0 && <li><b>Stock at reorder</b> — review reorder points and supplier lead times.</li>}
              {alerts.openIssues > 0 && <li><b>Production issues/quarantine</b> — review Production schedule items marked Issue/Quarantine.</li>}
              {alerts.openCapas > 0 && <li><b>Open CAPAs</b> — assign owners and due dates in Decisions & Tracking.</li>}
              {alerts.machinesDown > 0 && <li><b>Machines out of service</b> — update status in Resources and plan Maintenance blocks.</li>}
              {alerts.belowMin === 0 && alerts.reorder === 0 && alerts.openIssues === 0 && alerts.openCapas === 0 && alerts.machinesDown === 0 && (
                <li>Nothing critical flagged right now.</li>
              )}
            </ul>

            <h4>Export pack</h4>
            <button onClick={() => downloadFile(`${scenario.name}.json`, exportScenarioJson(scenario as any), 'application/json')}>
              Export JSON snapshot
            </button>
          </div>
        </div>
      )}

      {/* PRODUCTION */}
      {activeTab === 'Production' && (
        <ProductionCalendar scenario={scenario as any} onChange={updateScenario as any} />
      )}

      {/* STOCK */}
      {activeTab === 'Stock' && (
        <div>
          <div className="card">
            <h3>Stock (components + consumables)</h3>
            <div className="hint">
              Remaining stock is calculated from <b>completed scheduled items</b>:
              Good units always consume BOM; post-assembly scrap consumes whole BOM; assembly scrap uses component rejects (or falls back to BOM if empty).
            </div>
          </div>

          <div className="card">
            <h3>Remaining stock</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>On hand</th>
                    <th>Consumed</th>
                    <th>Remaining</th>
                    <th>ROP</th>
                    <th>Min</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {stockView.map((r) => (
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
          </div>

          <EditableTable
            title="Stock master (editable)"
            rows={(scenario as any).stock}
            columns={[
              { key: 'name', label: 'Item' },
              {
                key: 'type',
                label: 'Type',
                type: 'select',
                options: [
                  { label: 'Component', value: 'Component' },
                  { label: 'Consumable', value: 'Consumable' },
                  { label: 'Packaging', value: 'Packaging' },
                  { label: 'Spare', value: 'Spare' },
                ],
              },
              { key: 'unitCost', label: 'Unit cost (AUD)', type: 'number' },
              { key: 'uom', label: 'UoM' },
              { key: 'location', label: 'Location' },
              { key: 'usagePerFinishedUnit', label: 'BOM usage/unit', type: 'number' },
              { key: 'onHandQty', label: 'On hand', type: 'number' },
              { key: 'reorderPointQty', label: 'Reorder point', type: 'number' },
              { key: 'minQty', label: 'Min', type: 'number' },
              { key: 'leadTimeDays', label: 'Lead time (d)', type: 'number' },
              { key: 'moq', label: 'MOQ', type: 'number' },
              { key: 'singleSource', label: 'Single source', type: 'checkbox' },
            ]}
            onChange={(rows) => updateScenario({ ...(scenario as any), stock: rows }, `Updated stock master (${nowIso()})`)}
            createRow={() => ({
              id: crypto.randomUUID(),
              name: 'New item',
              type: 'Component',
              unitCost: 0,
              uom: 'pcs',
              location: '',
              usagePerFinishedUnit: 0,
              leadTimeDays: 0,
              moq: 0,
              singleSource: false,
              onHandQty: 0,
              reorderPointQty: 0,
              minQty: 0,
            })}
          />
        </div>
      )}

      {/* RESOURCES */}
      {activeTab === 'Resources' && (
        <div>
          <EditableTable
            title="People"
            rows={(scenario as any).people}
            columns={[
              { key: 'name', label: 'Name' },
              { key: 'role', label: 'Role' },
              { key: 'shift', label: 'Shift' },
              { key: 'notes', label: 'Notes', type: 'textarea' },
            ]}
            onChange={(rows) => updateScenario({ ...(scenario as any), people: rows }, `Updated people (${nowIso()})`)}
            createRow={() => ({
              id: crypto.randomUUID(),
              name: 'New person',
              role: 'Operator',
              shift: 'Day',
              notes: '',
            })}
          />

          <EditableTable
            title="Machines"
            rows={(scenario as any).machines}
            columns={[
              { key: 'name', label: 'Machine name' },
              { key: 'type', label: 'Type' },
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
            onChange={(rows) => updateScenario({ ...(scenario as any), machines: rows }, `Updated machines (${nowIso()})`)}
            createRow={() => ({
              id: crypto.randomUUID(),
              name: 'New machine',
              type: 'Assembly Line',
              status: 'Available',
              notes: '',
            })}
          />

          <EditableTable
            title="Processes"
            rows={(scenario as any).processes}
            columns={[
              { key: 'name', label: 'Process' },
              { key: 'defaultDurationMin', label: 'Default duration (min)', type: 'number' },
              { key: 'allowedMachineTypesCsv', label: 'Allowed machine types (csv)' },
              { key: 'notes', label: 'Notes', type: 'textarea' },
            ]}
            onChange={(rows) => updateScenario({ ...(scenario as any), processes: rows }, `Updated processes (${nowIso()})`)}
            createRow={() => ({
              id: crypto.randomUUID(),
              name: 'New process',
              defaultDurationMin: 480,
              allowedMachineTypesCsv: '',
              notes: '',
            })}
          />
        </div>
      )}

      {/* DECISIONS & TRACKING */}
      {activeTab === 'Decisions & Tracking' && (
        <div>
          <EditableTable
            title="A/B/C Decisions"
            rows={(scenario as any).decisions}
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
            onChange={(rows) => updateScenario({ ...(scenario as any), decisions: rows }, `Updated decisions (${nowIso()})`)}
            createRow={() => ({
              id: crypto.randomUUID(),
              title: 'New decision',
              target: '',
              owner: '',
              status: 'Not started',
              notes: '',
            })}
          />

          <EditableTable
            title="CAPAs"
            rows={(scenario as any).capas}
            columns={[
              { key: 'ref', label: 'Ref' },
              { key: 'batchId', label: 'Batch ID (optional)' },
              { key: 'title', label: 'Title' },
              { key: 'owner', label: 'Owner' },
              { key: 'dueDate', label: 'Due date', type: 'date' as any },
              {
                key: 'status',
                label: 'Status',
                type: 'select',
                options: [
                  { label: 'Open', value: 'Open' },
                  { label: 'In progress', value: 'In progress' },
                  { label: 'Effectiveness check', value: 'Effectiveness check' },
                  { label: 'Closed', value: 'Closed' },
                  { label: 'Cancelled', value: 'Cancelled' },
                ],
              },
              { key: 'rootCause', label: 'Root cause', type: 'textarea' },
              { key: 'action', label: 'Action', type: 'textarea' },
              { key: 'notes', label: 'Notes', type: 'textarea' },
            ]}
            onChange={(rows) => updateScenario({ ...(scenario as any), capas: rows }, `Updated CAPAs (${nowIso()})`)}
            createRow={() => ({
              id: crypto.randomUUID(),
              ref: `CAPA-${String(((scenario as any).capas?.length ?? 0) + 1).padStart(3, '0')}`,
              batchId: '',
              title: '',
              owner: '',
              dueDate: new Date().toISOString().slice(0, 10),
              status: 'Open',
              rootCause: '',
              action: '',
              notes: '',
            })}
          />
        </div>
      )}

      {/* INPUTS */}
      {activeTab === 'Inputs' && (
        <div className="card">
          <h3>Global drivers (AUD)</h3>
          <div className="header">
            {Object.keys((scenario as any).inputs).map((k) => {
              const v = (scenario as any).inputs[k];
              if (typeof v !== 'number') return null;
              return (
                <label key={k}>
                  {k}
                  <input
                    type="number"
                    value={v}
                    onChange={(e) =>
                      updateScenario(
                        { ...(scenario as any), inputs: { ...(scenario as any).inputs, [k]: Number(e.target.value) } },
                        `Updated input ${k} (${nowIso()})`
                      )
                    }
                  />
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* LOGISTICS */}
      {activeTab === 'Logistics' && (
        <EditableTable
          title="Transport lanes"
          rows={(scenario as any).logistics}
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
            { key: 'costPerShipment', label: 'Cost/shipment (AUD)', type: 'number' },
            { key: 'unitsPerShipment', label: 'Units/shipment', type: 'number' },
          ]}
          onChange={(rows) => updateScenario({ ...(scenario as any), logistics: rows }, `Updated logistics (${nowIso()})`)}
          createRow={() => ({
            id: crypto.randomUUID(),
            lane: 'New lane',
            direction: 'Inbound',
            mode: 'Road',
            costPerShipment: 0,
            unitsPerShipment: 1,
          })}
        />
      )}

      {/* WAREHOUSES */}
      {activeTab === 'Warehouses' && (
        <EditableTable
          title="Warehouses"
          rows={(scenario as any).warehouses}
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
            { key: 'monthlyCost', label: 'Monthly cost (AUD)', type: 'number' },
            { key: 'utilizationPct', label: 'Util (0..1)', type: 'number' },
            { key: 'capacityPctLimit', label: 'Limit (0..1)', type: 'number' },
          ]}
          onChange={(rows) => updateScenario({ ...(scenario as any), warehouses: rows }, `Updated warehouses (${nowIso()})`)}
          createRow={() => ({
            id: crypto.randomUUID(),
            location: 'New DC',
            type: 'FG',
            monthlyCost: 0,
            utilizationPct: 0.5,
            capacityPctLimit: 0.85,
          })}
        />
      )}

      {/* MAINTENANCE */}
      {activeTab === 'Maintenance' && (
        <MaintenancePlanner scenario={scenario as any} onChange={updateScenario as any} />
      )}

      {/* RISK */}
      {activeTab === 'Risk' && (
        <EditableTable
          title="Risk register"
          rows={(scenario as any).risks}
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
          onChange={(rows) => updateScenario({ ...(scenario as any), risks: rows }, `Updated risks (${nowIso()})`)}
          createRow={() => ({
            id: crypto.randomUUID(),
            area: 'New area',
            status: 'Amber',
            mitigation: '',
            owner: '',
          })}
        />
      )}

      <div className="card">
        <h3>Audit log</h3>
        <div className="small" style={{ maxHeight: 160, overflow: 'auto' }}>
          {(scenario as any).auditLog.slice().reverse().map((l: string, idx: number) => (
            <div key={idx}>• {l}</div>
          ))}
        </div>
      </div>
    </div>
  );
}
