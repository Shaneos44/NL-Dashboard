import type { ScenarioData, MaintenanceBlock } from '../lib/types';
import './styles.css';

export function MaintenancePlanner(props: {
  scenario: ScenarioData;
  onChange: (next: ScenarioData, note?: string) => void;
}) {
  const { scenario, onChange } = props;

  const addBlock = () => {
    const mb: MaintenanceBlock = {
      id: crypto.randomUUID(),
      date: new Date().toISOString().slice(0, 10),
      durationDays: 1,
      machineIdsCsv: '',
      title: 'Planned maintenance',
      notes: '',
      status: 'Planned',
    };
    onChange({ ...scenario, maintenanceBlocks: [...scenario.maintenanceBlocks, mb] }, `Added maintenance block (${mb.date})`);
  };

  const update = (id: string, patch: Partial<MaintenanceBlock>) => {
    const next = scenario.maintenanceBlocks.map((m) => (m.id === id ? { ...m, ...patch } : m));
    onChange({ ...scenario, maintenanceBlocks: next }, `Updated maintenance block (${id})`);
  };

  const remove = (id: string) => {
    onChange({ ...scenario, maintenanceBlocks: scenario.maintenanceBlocks.filter((m) => m.id !== id) }, `Removed maintenance block (${id})`);
  };

  return (
    <div className="card">
      <div className="cal-header">
        <h3 style={{ margin: 0 }}>Maintenance</h3>
        <button onClick={addBlock}>+ Add maintenance block</button>
      </div>

      <div className="hint">
        Maintenance blocks reserve machines on the Production calendar (machines cannot be assigned on those days).
      </div>

      {scenario.maintenanceBlocks.length === 0 && <div className="small">No blocks yet.</div>}

      {scenario.maintenanceBlocks.map((m) => (
        <div key={m.id} className="card thin">
          <div className="split">
            <label>
              Date
              <input type="date" value={m.date} onChange={(e) => update(m.id, { date: e.target.value })} />
            </label>

            <label>
              Duration (days)
              <input type="number" value={m.durationDays} onChange={(e) => update(m.id, { durationDays: Number(e.target.value) })} />
            </label>

            <label>
              Status
              <select value={m.status} onChange={(e) => update(m.id, { status: e.target.value as any })}>
                <option value="Planned">Planned</option>
                <option value="In Progress">In Progress</option>
                <option value="Complete">Complete</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </label>
          </div>

          <label>
            Title
            <input value={m.title} onChange={(e) => update(m.id, { title: e.target.value })} />
          </label>

          <label>
            Machines (tick to reserve)
            <div className="pillrow">
              {scenario.machines.map((mac) => {
                const ids = m.machineIdsCsv.split(',').map((x) => x.trim()).filter(Boolean);
                const checked = ids.includes(mac.id);
                return (
                  <label key={mac.id} className="pillcheck">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        const next = new Set(ids);
                        if (e.target.checked) next.add(mac.id);
                        else next.delete(mac.id);
                        update(m.id, { machineIdsCsv: [...next].join(', ') });
                      }}
                    />
                    {mac.name}
                  </label>
                );
              })}
            </div>
          </label>

          <label>
            Notes
            <textarea value={m.notes} onChange={(e) => update(m.id, { notes: e.target.value })} rows={3} />
          </label>

          <button className="danger" onClick={() => remove(m.id)}>
            Remove
          </button>
        </div>
      ))}
    </div>
  );
}
