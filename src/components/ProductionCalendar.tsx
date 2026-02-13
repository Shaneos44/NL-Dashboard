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
function parseCsv(s: string) {
  return s.split(',').map((x) => x.trim()).filter(Boolean);
}
function toCsv(arr: string[]) {
  return arr.join(', ');
}
function daysBetween(aYmd: string, bYmd: string) {
  const a = new Date(aYmd + 'T00:00:00');
  const b = new Date(bYmd + 'T00:00:00');
  const ms = b.getTime() - a.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
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

function statusClass(s: BatchStatus) {
  return `cal-${s.replace(/\s/g, '').toLowerCase()}`;
}

export function ProductionCalendar(props: {
  scenario: ScenarioData;
  onChange: (next: ScenarioData, note?: string) => void;
}) {
  const { scenario, onChange } = props;

  const [weekStart, setWeekStart] = useState(() => mondayOfWeek(new Date()));
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  // New: toggle to move the whole batch chain together
  const [moveWholeBatch, setMoveWholeBatch] = useState(true);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const dayStrings = useMemo(() => days.map((d) => ymd(d)), [days]);

  const selectedEvent: ScheduledProcess | undefined = selectedEventId
    ? scenario.schedule.find((e) => e.id === selectedEventId)
    : undefined;

  const getBatch = (batchId: string) => scenario.batches.find((b) => b.id === batchId);
  const getBatchLabel = (batchId: string) => getBatch(batchId)?.batchNumber ?? 'Batch';
  const getProcessName = (processId: string) => scenario.processes.find((p) => p.id === processId)?.name ?? 'Process';

  const machineBlockedByMaintenance = (machineId: string, date: string) => {
    return scenario.maintenanceBlocks.some((mb) => {
      if (mb.status === 'Cancelled') return false;
      const ids = parseCsv(mb.machineIdsCsv);
      if (!ids.includes(machineId)) return false;

      const start = mb.date;
      const dur = Number(mb.durationDays) || 1;
      const startDate = new Date(start + 'T00:00:00');

      for (let i = 0; i < dur; i++) {
        if (ymd(addDays(startDate, i)) === date) return true;
      }
      return false;
    });
  };

  // Build a per-day booking map to detect conflicts
  const conflictsByDay = useMemo(() => {
    const map: Record<
      string,
      {
        people: Record<string, number>;
        machines: Record<string, number>;
      }
    > = {};

    for (const d of dayStrings) map[d] = { people: {}, machines: {} };

    const consider = (evt: ScheduledProcess, date: string) => {
      if (!map[date]) return;
      if (evt.status === 'Cancelled') return;

      for (const pid of parseCsv(evt.assignedPeopleIdsCsv)) {
        map[date].people[pid] = (map[date].people[pid] ?? 0) + 1;
      }
      for (const mid of parseCsv(evt.assignedMachineIdsCsv)) {
        // maintenance counts as a booking too (handled separately in warnings)
        map[date].machines[mid] = (map[date].machines[mid] ?? 0) + 1;
      }
    };

    // Count schedule bookings per day (including multi-day spans)
    for (const evt of scenario.schedule) {
      const start = evt.date;
      const dur = Number(evt.durationDays) || 1;
      const startDate = new Date(start + 'T00:00:00');
      for (let i = 0; i < dur; i++) {
        const d = ymd(addDays(startDate, i));
        consider(evt, d);
      }
    }

    return map;
  }, [scenario.schedule, dayStrings]);

  const eventHasConflictOnDay = (evt: ScheduledProcess, day: string) => {
    const people = parseCsv(evt.assignedPeopleIdsCsv);
    const machines = parseCsv(evt.assignedMachineIdsCsv);

    const counts = conflictsByDay[day];
    if (!counts) return false;

    const anyDoubleBooked =
      people.some((p) => (counts.people[p] ?? 0) > 1) || machines.some((m) => (counts.machines[m] ?? 0) > 1);

    const anyMaintenanceClash = machines.some((m) => machineBlockedByMaintenance(m, day));
    return anyDoubleBooked || anyMaintenanceClash;
  };

  const unscheduledBatches = scenario.batches.filter((b) => !scenario.schedule.some((e) => e.batchId === b.id));

  const createChainForBatchOnDay = (batchId: string, startDay: string) => {
    // New: auto-create a full process chain on drop
    // One ScheduledProcess per process template, sequential days.
    const processes = scenario.processes;
    const baseDate = new Date(startDay + 'T00:00:00');

    const created: ScheduledProcess[] = processes.map((p, idx) => ({
      id: crypto.randomUUID(),
      batchId,
      date: ymd(addDays(baseDate, idx)), // sequential
      durationDays: 1,
      processId: p.id,
      assignedPeopleIdsCsv: '',
      assignedMachineIdsCsv: '',
      status: getBatch(batchId)?.status ?? 'Planned',
      notes: '',
      observations: '',
    }));

    onChange(
      { ...scenario, schedule: [...scenario.schedule, ...created] },
      `Scheduled full process chain for ${getBatchLabel(batchId)} starting ${startDay}`
    );

    // select first created item
    if (created[0]) setSelectedEventId(created[0].id);
  };

  const moveEventOrBatchToDay = (eventId: string, targetDay: string) => {
    const evt = scenario.schedule.find((x) => x.id === eventId);
    if (!evt) return;

    if (!moveWholeBatch) {
      // move only this event
      const next = scenario.schedule.map((e) => (e.id === eventId ? { ...e, date: targetDay } : e));
      onChange({ ...scenario, schedule: next }, `Moved scheduled item to ${targetDay}`);
      setSelectedEventId(eventId);
      return;
    }

    // move whole batch chain by delta
    const delta = daysBetween(evt.date, targetDay);
    const next = scenario.schedule.map((e) => {
      if (e.batchId !== evt.batchId) return e;
      const d = new Date(e.date + 'T00:00:00');
      return { ...e, date: ymd(addDays(d, delta)) };
    });

    onChange({ ...scenario, schedule: next }, `Moved batch ${getBatchLabel(evt.batchId)} by ${delta} day(s)`);
    setSelectedEventId(eventId);
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
      `Removed scheduled item (${selectedEvent.id})`
    );
    setSelectedEventId(null);
  };

  const removeBatchChain = () => {
    if (!selectedEvent) return;
    const bid = selectedEvent.batchId;
    onChange(
      { ...scenario, schedule: scenario.schedule.filter((e) => e.batchId !== bid) },
      `Removed entire chain for ${getBatchLabel(bid)}`
    );
    setSelectedEventId(null);
  };

  const personName = (id: string) => scenario.people.find((p) => p.id === id)?.name ?? id;
  const machineName = (id: string) => scenario.machines.find((m) => m.id === id)?.name ?? id;

  const allowedMachineCandidates = (processId: string) => {
    const proc = scenario.processes.find((p) => p.id === processId);
    const allowed = parseCsv(proc?.allowedMachineTypesCsv ?? '');
    return scenario.machines.filter((m) => (allowed.length === 0 ? true : allowed.includes(m.type)));
  };

  return (
    <div className="cal-wrap">
      <div className="cal-left">
        <div className="card">
          <h3>How to use</h3>
          <div className="small">
            1) Create / edit batches (left).<br />
            2) Drag a batch onto a calendar day → auto-creates the full process chain.<br />
            3) Click a calendar item to assign people/machines and update status.<br />
            4) When schedule items are <b>Complete</b>, Stock updates (good + scrap rules).<br />
          </div>
        </div>

        <div className="card">
          <h3>Unscheduled batches</h3>
          <div className="hint">Drag a batch onto a day. This will create the full process chain automatically.</div>
          {unscheduledBatches.length === 0 && <div className="small">Nothing unscheduled.</div>}
          {unscheduledBatches.map((b) => (
            <div
              key={b.id}
              className="pill"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('kind', 'batch');
                e.dataTransfer.setData('id', b.id);
              }}
              title={b.purpose}
            >
              <b>{b.batchNumber}</b> · {b.plannedQty} planned · {b.status}
            </div>
          ))}
        </div>

        <div className="card">
          <h3>Batches</h3>
          <div className="hint">
            Update <b>Good</b> + <b>Scrap</b>. Assembly scrap uses component rejects; post-assembly scrap writes off full BOM.
          </div>

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
                    <td>
  <input
    value={b.batchNumber}
    onChange={(e) => {
      const next = scenario.batches.map((x) =>
        x.id === b.id ? { ...x, batchNumber: e.target.value } : x
      );
      onChange({ ...scenario, batches: next }, `Renamed batch ${b.batchNumber} → ${e.target.value}`);
    }}
  />
</td>

                    <td>
                      <input
                        type="number"
                        value={b.plannedQty}
                        onChange={(e) => {
                          const next = scenario.batches.map((x) =>
                            x.id === b.id ? { ...x, plannedQty: Number(e.target.value) } : x
                          );
                          onChange({ ...scenario, batches: next }, `Updated planned qty (${b.batchNumber})`);
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
                          onChange({ ...scenario, batches: next }, `Updated good qty (${b.batchNumber})`);
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
                          onChange({ ...scenario, batches: next }, `Updated scrap qty (${b.batchNumber})`);
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

          {scenario.batches.map((b) => (
            <div key={b.id} className="card thin">
              <div className="small">
                <b>{b.batchNumber}</b> · component rejects (only used when Scrap stage = Assembly)
              </div>
              <textarea
                placeholder="Item Name, Qty (one per line)"
                value={b.componentRejects}
                onChange={(e) => {
                  const next = scenario.batches.map((x) =>
                    x.id === b.id ? { ...x, componentRejects: e.target.value } : x
                  );
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
              <div className="small">
                {fmtDay(days[0])} → {fmtDay(days[6])}
              </div>
            </div>
            <button onClick={() => setWeekStart(addDays(weekStart, 7))}>Next →</button>
          </div>

          <div className="cal-toolbar">
            <label className="checkrow">
              <input
                type="checkbox"
                checked={moveWholeBatch}
                onChange={(e) => setMoveWholeBatch(e.target.checked)}
              />
              Move whole batch chain when dragging events
            </label>
            <div className="tiny">
              Tip: drag events to re-plan. Conflicts show as ⚠.
            </div>
          </div>

          <div className="cal-grid">
            {dayStrings.map((day, idx) => {
              const dObj = days[idx];

              // Render events that overlap this day (multi-day)
              const events = scenario.schedule.filter((e) => {
                const start = e.date;
                const dur = Number(e.durationDays) || 1;
                const startDate = new Date(start + 'T00:00:00');
                for (let i = 0; i < dur; i++) {
                  if (ymd(addDays(startDate, i)) === day) return true;
                }
                return false;
              });

              const maint = scenario.maintenanceBlocks.filter((mb) => {
                if (mb.status === 'Cancelled') return false;
                const start = mb.date;
                const dur = Number(mb.durationDays) || 1;
                const startDate = new Date(start + 'T00:00:00');
                for (let i = 0; i < dur; i++) {
                  if (ymd(addDays(startDate, i)) === day) return true;
                }
                return false;
              });

              return (
                <div
                  key={day}
                  className="cal-col"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const kind = e.dataTransfer.getData('kind');
                    const id = e.dataTransfer.getData('id');
                    if (!kind || !id) return;

                    if (kind === 'batch') {
                      createChainForBatchOnDay(id, day);
                    } else if (kind === 'event') {
                      moveEventOrBatchToDay(id, day);
                    }
                  }}
                >
                  <div className="cal-col-head">{fmtDay(dObj)}</div>

                  {maint.map((mb) => (
                    <div key={mb.id} className="cal-item cal-maint" title={mb.notes}>
                      🛠 {mb.title} · {mb.durationDays}d
                    </div>
                  ))}

                  {events.map((e) => {
                    const conflict = eventHasConflictOnDay(e, day);
                    const isStartDay = e.date === day;

                    return (
                      <div
                        key={`${e.id}-${day}`}
                        className={`cal-item ${statusClass(e.status)} ${conflict ? 'cal-conflict' : ''} ${
                          isStartDay ? 'cal-start' : 'cal-continued'
                        }`}
                        draggable={isStartDay} // drag only from start block
                        onDragStart={(ev) => {
                          ev.dataTransfer.setData('kind', 'event');
                          ev.dataTransfer.setData('id', e.id);
                        }}
                        onClick={() => setSelectedEventId(e.id)}
                        title={conflict ? '⚠ Conflict detected (double-booking or maintenance clash)' : 'Click to edit'}
                      >
                        <div className="small">
                          <b>{getBatchLabel(e.batchId)}</b> · {getProcessName(e.processId)}{' '}
                          {conflict ? <span className="warn">⚠</span> : null}
                        </div>
                        <div className="tiny">
                          {e.durationDays}d · {e.status} {isStartDay ? '' : '· continued'}
                        </div>
                      </div>
                    );
                  })}

                  {events.length === 0 && <div className="cal-empty small">Drop batch here</div>}
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
                <b>{getBatchLabel(selectedEvent.batchId)}</b> · {selectedEvent.date} · {getProcessName(selectedEvent.processId)}
              </div>

              <div className="hint" style={{ marginTop: 6 }}>
                ⚠ Conflicts are flagged if a person/machine is double-booked on the same day, or a machine is blocked by maintenance.
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
                  onChange={(e) => updateEvent({ durationDays: Math.max(1, Number(e.target.value)) })}
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
                  <div className="small">
                    <b>People</b> (from Resources)
                  </div>
                  {scenario.people.map((p) => {
                    const ids = parseCsv(selectedEvent.assignedPeopleIdsCsv);
                    const checked = ids.includes(p.id);
                    const count = conflictsByDay[selectedEvent.date]?.people[p.id] ?? 0;
                    const conflict = checked && count > 1;

                    return (
                      <label key={p.id} className={`checkrow ${conflict ? 'row-conflict' : ''}`}>
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
                        {p.name} <span className="tiny">({p.role})</span> {conflict ? <span className="warn">⚠</span> : null}
                      </label>
                    );
                  })}
                </div>

                <div>
                  <div className="small">
                    <b>Machines</b> (filtered by process + maintenance)
                  </div>
                  {(() => {
                    const candidates = allowedMachineCandidates(selectedEvent.processId);
                    const ids = parseCsv(selectedEvent.assignedMachineIdsCsv);

                    return candidates.map((m) => {
                      const blocked = machineBlockedByMaintenance(m.id, selectedEvent.date);
                      const checked = ids.includes(m.id);
                      const count = conflictsByDay[selectedEvent.date]?.machines[m.id] ?? 0;
                      const doubleBooked = checked && count > 1;
                      const conflict = blocked || doubleBooked;

                      return (
                        <label
                          key={m.id}
                          className={`checkrow ${conflict ? 'row-conflict' : ''}`}
                          title={blocked ? 'Blocked by maintenance' : doubleBooked ? 'Double-booked' : ''}
                        >
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
                          {m.name} <span className="tiny">({m.type}{blocked ? ' · blocked' : ''})</span>{' '}
                          {conflict ? <span className="warn">⚠</span> : null}
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
                <textarea
                  value={selectedEvent.observations}
                  onChange={(e) => updateEvent({ observations: e.target.value })}
                  rows={3}
                />
              </label>

              <div className="header">
                <button className="danger" onClick={removeEvent}>
                  Remove this item
                </button>
                <button className="danger" onClick={removeBatchChain}>
                  Remove entire batch chain
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
