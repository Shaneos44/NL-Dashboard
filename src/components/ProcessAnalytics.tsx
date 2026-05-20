import type { ScenarioData } from '../lib/types';
import { EditableTable } from './EditableTable';

interface Props {
  scenario: ScenarioData;
  onChange: (next: ScenarioData, note?: string) => void;
  nowIso: () => string;
}

function mean(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((acc, v) => acc + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

export function ProcessAnalytics({ scenario, onChange, nowIso }: Props) {
  const sensorReadings = scenario.sensorReadings ?? [];
  const processParameters = scenario.processParameters ?? [];

  const grouped = sensorReadings.reduce<Record<string, number[]>>((acc, row) => {
    const value = Number(row.value);
    if (Number.isNaN(value)) return acc;
    acc[row.sensorTag] = acc[row.sensorTag] ? [...acc[row.sensorTag], value] : [value];
    return acc;
  }, {});

  const spcRows = Object.entries(grouped).map(([sensorTag, values]) => {
    const avg = mean(values);
    const sigma = stdDev(values);
    return {
      sensorTag,
      count: values.length,
      mean: avg,
      stdev: sigma,
      lcl: avg - 3 * sigma,
      ucl: avg + 3 * sigma,
      latest: values[values.length - 1],
    };
  });

  return (
    <div>
      <div className="card">
        <h3>Batch Analytics (PLS/SPC-ready)</h3>
        <div className="small">
          Upload batch-level sensor readings and process parameters here. The dashboard computes basic SPC control limits
          (mean ± 3σ) so you can quickly spot drift before running deeper tools such as PLS in Minitab/JMP/Python.
        </div>
      </div>

      <EditableTable
        title="Sensor lookup table"
        rows={scenario.sensorLookup}
        columns={[
          { key: 'sensorTag', label: 'Sensor tag' },
          { key: 'equipment', label: 'Equipment' },
          { key: 'location', label: 'Location' },
          { key: 'unit', label: 'Unit' },
          { key: 'processStep', label: 'Process step' },
          { key: 'criticalToQuality', label: 'CTQ', type: 'checkbox' },
        ]}
        onChange={(rows) => onChange({ ...scenario, sensorLookup: rows }, `Updated sensor lookup (${nowIso()})`)}
        createRow={() => ({
          id: crypto.randomUUID(),
          sensorTag: 'SENSOR-TAG',
          equipment: 'Line 1',
          location: 'Station A',
          unit: '°C',
          processStep: 'Assembly',
          criticalToQuality: false,
        })}
      />

      <EditableTable
        title="Sensor readings (batch timeline)"
        rows={sensorReadings}
        columns={[
          { key: 'batchNumber', label: 'Batch' },
          { key: 'timestamp', label: 'Timestamp' },
          { key: 'sensorTag', label: 'Sensor tag' },
          { key: 'value', label: 'Value', type: 'number' },
          { key: 'comment', label: 'Comment', type: 'textarea' },
        ]}
        onChange={(rows) => onChange({ ...scenario, sensorReadings: rows }, `Updated sensor readings (${nowIso()})`)}
        createRow={() => ({
          id: crypto.randomUUID(),
          batchNumber: scenario.batches[0]?.batchNumber ?? 'BATCH-001',
          timestamp: new Date().toISOString(),
          sensorTag: scenario.sensorLookup[0]?.sensorTag ?? 'SENSOR-TAG',
          value: 0,
          comment: '',
        })}
      />

      <EditableTable
        title="Process parameters"
        rows={processParameters}
        columns={[
          { key: 'batchNumber', label: 'Batch' },
          { key: 'parameter', label: 'Parameter' },
          { key: 'value', label: 'Value', type: 'number' },
          { key: 'unit', label: 'Unit' },
        ]}
        onChange={(rows) => onChange({ ...scenario, processParameters: rows }, `Updated process parameters (${nowIso()})`)}
        createRow={() => ({
          id: crypto.randomUUID(),
          batchNumber: scenario.batches[0]?.batchNumber ?? 'BATCH-001',
          parameter: 'Line speed',
          value: 0,
          unit: 'units/hr',
        })}
      />

      <div className="card">
        <h3>SPC quick summary</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Sensor</th><th>N</th><th>Mean</th><th>Std Dev</th><th>LCL</th><th>UCL</th><th>Latest</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {spcRows.map((r) => {
                const outOfControl = r.latest < r.lcl || r.latest > r.ucl;
                return (
                  <tr key={r.sensorTag}>
                    <td>{r.sensorTag}</td><td>{r.count}</td><td>{r.mean.toFixed(3)}</td><td>{r.stdev.toFixed(3)}</td>
                    <td>{r.lcl.toFixed(3)}</td><td>{r.ucl.toFixed(3)}</td><td>{r.latest.toFixed(3)}</td>
                    <td>{outOfControl ? 'Out of control' : 'In control'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
