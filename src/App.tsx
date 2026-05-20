import { useMemo, useState } from 'react';
import './components/styles.css';

type SensorMap = { id: string; tag: string; equipment: string; parameter: string; unit: string };
type SensorPoint = { id: string; batch: string; tag: string; value: number; timestamp: string };
type ProcessParam = { id: string; batch: string; name: string; value: number; unit: string };

const uid = () => crypto.randomUUID();

export default function App() {
  const [sensorLookup, setSensorLookup] = useState<SensorMap[]>([
    { id: uid(), tag: 'TEMP-001', equipment: 'Mixer-01', parameter: 'Temperature', unit: '°C' },
  ]);
  const [sensorData, setSensorData] = useState<SensorPoint[]>([]);
  const [processParams, setProcessParams] = useState<ProcessParam[]>([]);

  const summary = useMemo(() => {
    const grouped = sensorData.reduce<Record<string, number[]>>((acc, row) => {
      if (!acc[row.tag]) acc[row.tag] = [];
      acc[row.tag].push(row.value);
      return acc;
    }, {});

    const rows = Object.entries(grouped).map(([tag, values]) => {
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const stdev =
        values.length > 1
          ? Math.sqrt(values.reduce((acc, x) => acc + (x - mean) ** 2, 0) / (values.length - 1))
          : 0;
      const lcl = mean - 3 * stdev;
      const ucl = mean + 3 * stdev;
      const latest = values[values.length - 1];
      return { tag, count: values.length, mean, stdev, lcl, ucl, latest, inControl: latest >= lcl && latest <= ucl };
    });

    return rows;
  }, [sensorData]);

  return (
    <div className="app fresh-app">
      <h1>Batch Process Intelligence Dashboard</h1>
      <p className="small">
        Brand-new workspace for uploading sensor data and process parameters, then finding links and trends with
        SPC-ready summaries and PLS-prep structure.
      </p>

      <section className="card">
        <h2>1) Sensor Lookup Table</h2>
        <button onClick={() => setSensorLookup((p) => [...p, { id: uid(), tag: '', equipment: '', parameter: '', unit: '' }])}>
          + Add Sensor
        </button>
        <table>
          <thead><tr><th>Tag</th><th>Equipment</th><th>Parameter</th><th>Unit</th></tr></thead>
          <tbody>
            {sensorLookup.map((s, i) => (
              <tr key={s.id}>
                <td><input value={s.tag} onChange={(e) => setSensorLookup((p) => p.map((r, idx) => idx === i ? { ...r, tag: e.target.value } : r))} /></td>
                <td><input value={s.equipment} onChange={(e) => setSensorLookup((p) => p.map((r, idx) => idx === i ? { ...r, equipment: e.target.value } : r))} /></td>
                <td><input value={s.parameter} onChange={(e) => setSensorLookup((p) => p.map((r, idx) => idx === i ? { ...r, parameter: e.target.value } : r))} /></td>
                <td><input value={s.unit} onChange={(e) => setSensorLookup((p) => p.map((r, idx) => idx === i ? { ...r, unit: e.target.value } : r))} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2>2) Sensor Data</h2>
        <button onClick={() => setSensorData((p) => [...p, { id: uid(), batch: 'BATCH-001', tag: sensorLookup[0]?.tag || '', value: 0, timestamp: new Date().toISOString() }])}>+ Add Reading</button>
        <table>
          <thead><tr><th>Batch</th><th>Sensor Tag</th><th>Value</th><th>Timestamp</th></tr></thead>
          <tbody>
            {sensorData.map((s, i) => (
              <tr key={s.id}>
                <td><input value={s.batch} onChange={(e) => setSensorData((p) => p.map((r, idx) => idx === i ? { ...r, batch: e.target.value } : r))} /></td>
                <td><input value={s.tag} onChange={(e) => setSensorData((p) => p.map((r, idx) => idx === i ? { ...r, tag: e.target.value } : r))} /></td>
                <td><input type="number" value={s.value} onChange={(e) => setSensorData((p) => p.map((r, idx) => idx === i ? { ...r, value: Number(e.target.value) } : r))} /></td>
                <td><input value={s.timestamp} onChange={(e) => setSensorData((p) => p.map((r, idx) => idx === i ? { ...r, timestamp: e.target.value } : r))} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2>3) Process Parameters</h2>
        <button onClick={() => setProcessParams((p) => [...p, { id: uid(), batch: 'BATCH-001', name: 'Line Speed', value: 0, unit: 'units/hr' }])}>+ Add Parameter</button>
        <table>
          <thead><tr><th>Batch</th><th>Parameter</th><th>Value</th><th>Unit</th></tr></thead>
          <tbody>
            {processParams.map((s, i) => (
              <tr key={s.id}>
                <td><input value={s.batch} onChange={(e) => setProcessParams((p) => p.map((r, idx) => idx === i ? { ...r, batch: e.target.value } : r))} /></td>
                <td><input value={s.name} onChange={(e) => setProcessParams((p) => p.map((r, idx) => idx === i ? { ...r, name: e.target.value } : r))} /></td>
                <td><input type="number" value={s.value} onChange={(e) => setProcessParams((p) => p.map((r, idx) => idx === i ? { ...r, value: Number(e.target.value) } : r))} /></td>
                <td><input value={s.unit} onChange={(e) => setProcessParams((p) => p.map((r, idx) => idx === i ? { ...r, unit: e.target.value } : r))} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2>SPC Quick View</h2>
        <table>
          <thead><tr><th>Tag</th><th>N</th><th>Mean</th><th>StdDev</th><th>LCL</th><th>UCL</th><th>Latest</th><th>Status</th></tr></thead>
          <tbody>
            {summary.map((r) => (
              <tr key={r.tag}>
                <td>{r.tag}</td><td>{r.count}</td><td>{r.mean.toFixed(3)}</td><td>{r.stdev.toFixed(3)}</td>
                <td>{r.lcl.toFixed(3)}</td><td>{r.ucl.toFixed(3)}</td><td>{r.latest.toFixed(3)}</td>
                <td>{r.inControl ? 'In control' : 'Out of control'}</td>
              </tr>
            ))}
            {summary.length === 0 && <tr><td colSpan={8}>No sensor readings yet.</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}
