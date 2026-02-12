import { useMemo, useState } from 'react';
import type { ScenarioData, ScheduledProcess, BatchStatus } from '../lib/types';
import './styles.css';

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}
function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
function mondayOfWeek(d: Date) {
  const date = new Date(d);
  const day = date.getDay(); // 0 Sun .. 6 Sat
  const diff = (day === 0 ? -6 : 1) - day;
  date.setDate(date.getDate() + diff);
  return date;
}
function fmtDay(d: Date) {
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

const statusOptions: { label: string; value: BatchStatus }[] = [
  { label: 'Planned', value: 'Planned' },
  { label: 'In Progress', value: 'In Progress' },
  { label: 'Issue', value: 'Issue' },
  { label: 'Complete', value: 'Complete' },
  { label: 'Quarantine', value: 'Quarantine' },
  { label: 'Rejected', value: 'Rejected' },
  { label: 'Cancelled', value: 'Cancelled' },
];

export function ProductionCalendar(props: {
  scenario: ScenarioData;
  onChange: (next: ScenarioData, note?: string) => void;
}) {
  const { scenario, onChange } = props;

  const [weekStart, setWeekStart] = useState(() => mondayOfWeek(new Date()));
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const unscheduledBatches = scenario.batches.filter(
    (b) => !scenario.schedule.some((e) => e.batchId === b.id)
  );

  const selectedEvent: ScheduledProcess | undefined = selectedEventId
    ? scenario.schedule.find((e) => e.id === selectedEventId)
    : undefined;

  const machineBlockedByMaintenance = (machineId: string, date: string) => {
    return scenario.maintenanceBlocks.some((mb) => {
      if (mb.status === 'Cancelled') return false;
      const ids = mb.machineIdsCsv.split(',').map((x) => x.trim()).filter(Boolean);
      if (!ids.includes(machineId)) return false;
      const start = mb.date;
      const dur = Number(mb.durationDays) || 1;
      const startDate = new Date(start);
      for (let i = 0; i < dur; i++) {
        if (ymd(addDays(startDate, i)) === date) return true;
      }
      return false;
    });
  };

  const dropBatchOnDay = (batchId: string, date: string) => {
    const b = scenario.batches.find((x) => x.id === batchId);
    if (!b) return;

    const newEvent: ScheduledProcess = {
      id: crypto.randomUUID(),
      batchId,
      date,
      durationDays: 1,
      processId: scenario.processes[0]?.id ?? '',
      assignedPeopleIdsCsv: '',
      assignedMachineIdsCsv: '',
      status: b.status,
      notes: '',
      observations: '',
    };

    onChange(
      { ...scenario, schedule: [...scenario.schedule, newEvent] },
      `Scheduled batch ${b.batchNumber} on ${date}`
    );
    setSelectedEventId(newEvent.id);
  };

  const updateEvent = (patch: Partial<ScheduledProcess>) => {
    if (!selectedEvent) return;
    const next = scenario.schedule.map((e) => (e.id === selectedEvent.id ? { ...e, ...patch } : e));
    onChange({ ...scenario, schedule: next }, `Updated schedule (${selectedEvent.id})`);
  };

  const removeEvent = () => {
    if (!selectedEvent) return;
    onChange(
      { ...scenario, schedule: scenario.schedule.filter((e) => e.id !== selectedEvent.id) },
      `Removed scheduled process (${selectedEvent.id})`
    );
    setSelectedEventId(null);
  };

  const getBatchLabel = (batchId: string) =>
    scenario.batches.find((b) => b.id === batchId)?.batchNumber ?? 'Batch';

  const getProcessName = (processId: string) =>
    scenario.processes.find((p) => p.id === processId)?.name ?? 'Process';

  const personName = (id: string) => scenario.people.find((p) => p.id === id)?.name ?? id;
  const machineName = (id: string) => scenario.machines.find((m) => m.id === id)?.name ?? id;

  const parseCsv = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
  const toCsv = (arr: string[]) => arr.join(', ');

  return (
    <div className="cal-wrap">
      <div className="cal-left">
        <div className="card">
          <h3>Unscheduled batches</h3>
          <div className="hint">Drag a batch onto a day.</div>
          {unscheduledBatches.length === 0 && <div className="small">Nothing unscheduled.</div>}
          {unscheduledBatches.map((b) => (
            <div
              key={b.id}
              className="pill"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('text/plain', b.id);
              }}
              title={b.purpose}
            >
              <b>{b.batchNumber}</b> · {b.plannedQty} planned · {b.status}
            </div>
          ))}
        </div>

        <div className="card">
          <h3>Batches</h3>
          <div className="hint">Edit batch outcomes (good + scrap). Stock updates when scheduled items are marked Complete.</div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Batch</th>
                  <th>Planned</th>
                  <th>Good</th>
                  <th>Scrap stage</th>
                  <th>Scrap</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {scenario.batches.map((b) => (
                  <tr key={b.id}>
                    <td>{b.batchNumber}</td>
                    <td>
                      <input
                        type="number"
                        value={b.plannedQty}
                        onChange={(e) => {
                          const next = scenario.batches.map((x) =>
                            x.id === b.id ? { ...x, plannedQty: Number(e.target.value) } : x
                          );
                          onChange({ ...scenario, batches: next }, `Updated batch planned qty (${b.batchNumber})`);
                        }}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        value={b.goodQty}
                        onChange={(e) => {
                          const next = scenario.batches.map((x) =>
                            x.id === b.id ? { ...x, goodQty: Number(e.target.value) } : x
                          );
                          onChange({ ...scenario, batches: next }, `Updated batch good qty (${b.batchNumber})`);
                        }}
                      />
                    </td>
                    <td>
                      <select
                        value={b.scrapStage}
                        onChange={(e) => {
                          const next = scenario.batches.map((x) =>
                            x.id === b.id ? { ...x, scrapStage: e.target.value as any } : x
                          );
                          onChange({ ...scenario, batches: next }, `Updated scrap stage (${b.batchNumber})`);
                        }}
                      >
                        <option value="Assembly">Assembly (components)</option>
                        <option value="Post-Assembly">Post-Assembly (whole BOM)</option>
                      </select>
                    </td>
                    <td>
                      <input
                        type="number"
                        value={b.scrapQty}
                        onChange={(e) => {
                          const next = scenario.batches.map((x) =>
                            x.id === b.id ? { ...x, scrapQty: Number(e.target.value) } : x
                          );
                          onChange({ ...scenario, batches: next }, `Updated batch scrap qty (${b.batchNumber})`);
                        }}
                      />
                    </td>
                    <td>
                      <select
                        value={b.status}
                        onChange={(e) => {
                          const next = scenario.batches.map((x) =>
                            x.id === b.id ? { ...x, status: e.target.value as any } : x
                          );
                          onChange({ ...scenario, batches: next }, `Updated batch status (${b.batchNumber})`);
                        }}
                      >
                        {statusOptions.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="hint" style={{ marginTop: 8 }}>
            For <b>Assembly</b> scrap, enter component rejects in the batch row (below) using <code>Item Name, Qty</code>.
          </div>

          {scenario.batches.map((b) => (
            <div key={b.id} className="card thin">
              <div className="small">
                <b>{b.batchNumber}</b> · {b.scrapStage}
              </div>
              <textarea
                placeholder="Component rejects (Item Name, Qty) one per line"
                value={b.componentRejects}
                onChange={(e) => {
                  const next = scenario.batches.map((x) => (x.id === b.id ? { ...x, componentRejects: e.target.value } : x));
                  onChange({ ...scenario, batches: next }, `Updated component rejects (${b.batchNumber})`);
                }}
                rows={3}
              />
            </div>
          ))}

          <button
            onClick={() => {
              const nb = {
                id: crypto.randomUUID(),
                batchNumber: `BATCH-${String(scenario.batches.length + 1).padStart(3, '0')}`,
                purpose: '',
                plannedQty: 0,
                goodQty: 0,
                scrapStage: 'Assembly' as const,
                scrapQty: 0,
                componentRejects: '',
                status: 'Planned' as const,
                notes: '',
                observations: '',
              };
              onChange({ ...scenario, batches: [...scenario.batches, nb] }, `Created batch ${nb.batchNumber}`);
            }}
          >
            + Add batch
          </button>
        </div>
      </div>

      <div className="cal-main">
        <div className="card">
          <div className="cal-header">
            <button onClick={() => setWeekStart(addDays(weekStart, -7))}>← Prev</button>
            <div>
              <h3 style={{ margin: 0 }}>Production calendar (Week)</h3>
              <div className="small">{fmtDay(days[0])} → {fmtDay(days[6])}</div>
            </div>
            <button onClick={() => setWeekStart(addDays(weekStart, 7))}>Next →</button>
          </div>

          <div className="cal-grid">
            {days.map((d) => {
              const day = ymd(d);
              const events = scenario.schedule.filter((e) => e.date === day);

              return (
                <div
                  key={day}
                  className="cal-col"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const batchId = e.dataTransfer.getData('text/plain');
                    if (batchId) dropBatchOnDay(batchId, day);
                  }}
                >
                  <div className="cal-col-head">{fmtDay(d)}</div>

                  {scenario.maintenanceBlocks
                    .filter((mb) => mb.date === day && mb.status !== 'Cancelled')
                    .map((mb) => (
                      <div key={mb.id} className="cal-item cal-maint" title={mb.notes}>
                        🛠 {mb.title} · {mb.durationDays}d
                      </div>
                    ))}

                  {events.map((e) => (
                    <div
                      key={e.id}
                      className={`cal-item cal-${e.status.replace(/\s/g, '').toLowerCase()}`}
                      onClick={() => setSelectedEventId(e.id)}
                      title="Click to edit"
                    >
                      <div className="small">
                        <b>{getBatchLabel(e.batchId)}</b> · {getProcessName(e.processId)}
                      </div>
                      <div className="tiny">
                        {e.durationDays}d · {e.status}
                      </div>
                    </div>
                  ))}

                  {events.length === 0 && (
                    <div className="cal-empty small">Drop batch here</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="card">
          <h3>Schedule editor</h3>
          {!selectedEvent && <div className="small">Click an event on the calendar to edit assignments.</div>}
          {selectedEvent && (
            <>
              <div className="small">
                <b>{getBatchLabel(selectedEvent.batchId)}</b> · {selectedEvent.date}
              </div>

              <label>
                Process
                <select value={selectedEvent.processId} onChange={(e) => updateEvent({ processId: e.target.value })}>
                  {scenario.processes.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Duration (days)
                <input
                  type="number"
                  value={selectedEvent.durationDays}
                  onChange={(e) => updateEvent({ durationDays: Number(e.target.value) })}
                />
              </label>

              <label>
                Status
                <select value={selectedEvent.status} onChange={(e) => updateEvent({ status: e.target.value as any })}>
                  {statusOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="split">
                <div>
                  <div className="small"><b>People</b> (from Resources)</div>
                  {scenario.people.map((p) => {
                    const ids = parseCsv(selectedEvent.assignedPeopleIdsCsv);
                    const checked = ids.includes(p.id);
                    return (
                      <label key={p.id} className="checkrow">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const next = new Set(ids);
                            if (e.target.checked) next.add(p.id);
                            else next.delete(p.id);
                            updateEvent({ assignedPeopleIdsCsv: toCsv([...next]) });
                          }}
                        />
                        {p.name} <span className="tiny">({p.role})</span>
                      </label>
                    );
                  })}
                </div>

                <div>
                  <div className="small"><b>Machines</b> (filtered by process + maintenance)</div>
                  {(() => {
                    const proc = scenario.processes.find((p) => p.id === selectedEvent.processId);
                    const allowed = (proc?.allowedMachineTypesCsv ?? '')
                      .split(',')
                      .map((x) => x.trim())
                      .filter(Boolean);

                    const candidates = scenario.machines.filter((m) => (allowed.length === 0 ? true : allowed.includes(m.type)));

                    const ids = parseCsv(selectedEvent.assignedMachineIdsCsv);

                    return candidates.map((m) => {
                      const blocked = machineBlockedByMaintenance(m.id, selectedEvent.date);
                      const checked = ids.includes(m.id);

                      return (
                        <label key={m.id} className="checkrow" title={blocked ? 'Blocked by maintenance' : ''}>
                          <input
                            type="checkbox"
                            disabled={blocked}
                            checked={checked}
                            onChange={(e) => {
                              const next = new Set(ids);
                              if (e.target.checked) next.add(m.id);
                              else next.delete(m.id);
                              updateEvent({ assignedMachineIdsCsv: toCsv([...next]) });
                            }}
                          />
                          {m.name} <span className="tiny">({m.type}{blocked ? ' · blocked' : ''})</span>
                        </label>
                      );
                    });
                  })()}
                </div>
              </div>

              <label>
                Notes
                <textarea value={selectedEvent.notes} onChange={(e) => updateEvent({ notes: e.target.value })} rows={3} />
              </label>
              <label>
                Observations
                <textarea value={selectedEvent.observations} onChange={(e) => updateEvent({ observations: e.target.value })} rows={3} />
              </label>

              <div className="header">
                <button className="danger" onClick={removeEvent}>
                  Remove from calendar
                </button>
              </div>

              <div className="hint">
                Assigned people: {parseCsv(selectedEvent.assignedPeopleIdsCsv).map(personName).join(', ') || '—'}
                <br />
                Assigned machines: {parseCsv(selectedEvent.assignedMachineIdsCsv).map(machineName).join(', ') || '—'}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
