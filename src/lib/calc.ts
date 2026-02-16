import type { ScenarioData } from './types';

const safeDivide = (n: number, d: number) => (d > 0 ? n / d : 0);

export interface CostBreakdown {
  labour: number;
  labourOverhead: number;
  material: number;
  logistics: number;
  warehouse: number;
  holding: number;
  capexDepreciation: number;
  quality: number;
  total: number;
  marginPerUnit: number;
  marginPct: number;
}

function scrapMultiplier(s: ScenarioData): number {
  const scrap = s.inputs.scrapRatePct ?? 0;
  return 1 + Math.max(0, scrap);
}
function holdingRateMonthly(s: ScenarioData): number {
  const annual = s.inputs.holdingRatePctAnnual ?? 0.24;
  return annual / 12;
}

export function computeCostBreakdown(s: ScenarioData): CostBreakdown {
  const v = s.inputs.monthlyDemand * scrapMultiplier(s);

  const labourBase = (s.inputs.labourRatePerHour / 60) * s.inputs.labourMinutesPerUnit;
  const overheadPct = s.inputs.overheadPct ?? 0.25;
  const labourOverhead = labourBase * overheadPct;

  const labour = labourBase;
  const material = s.stock.reduce((sum, i) => sum + i.unitCost * i.usagePerFinishedUnit, 0);

  const logistics = s.logistics.reduce((sum, l) => sum + safeDivide(l.costPerShipment, l.unitsPerShipment), 0);

  const warehouseMonthly = s.warehouses.reduce((sum, w) => sum + w.monthlyCost, 0);
  const warehouse = safeDivide(warehouseMonthly, v);

  const holding = material * holdingRateMonthly(s);
  const capexDepreciation = safeDivide(safeDivide(s.inputs.capexTotal, s.inputs.depreciationMonths), v);
  const quality = s.inputs.qualityCostPerUnit;

  const total = labour + labourOverhead + material + logistics + warehouse + holding + capexDepreciation + quality;

  const marginPerUnit = s.inputs.salePricePerUnit - total;
  const marginPct = safeDivide(marginPerUnit, s.inputs.salePricePerUnit) * 100;

  return {
    labour,
    labourOverhead,
    material,
    logistics,
    warehouse,
    holding,
    capexDepreciation,
    quality,
    total,
    marginPerUnit,
    marginPct,
  };
}

function findStockIdByName(s: ScenarioData, name: string): string | null {
  const n = name.trim().toLowerCase();
  const match = s.stock.find((i) => i.name.trim().toLowerCase() === n);
  return match?.id ?? null;
}

function parseItemQtyLinesToIdQty(s: ScenarioData, text: string): Record<string, number> {
  const out: Record<string, number> = {};
  const trimmed = String(text ?? '').trim();
  if (!trimmed) return out;

  const lines = trimmed.split('\n').map((x) => x.trim()).filter(Boolean);
  for (const line of lines) {
    const parts = line.split(',').map((p) => p.trim());
    if (parts.length < 2) continue;
    const id = findStockIdByName(s, parts[0]);
    const qty = Number(parts[1]);
    if (!id || !Number.isFinite(qty)) continue;
    out[id] = (out[id] ?? 0) + qty;
  }
  return out;
}

function addBomConsumption(s: ScenarioData, target: Record<string, number>, units: number) {
  if (!units) return;
  for (const item of s.stock) {
    const perUnit = Number(item.usagePerFinishedUnit) || 0;
    target[item.id] = (target[item.id] ?? 0) + units * perUnit;
  }
}

/**
 * Stage-aware consumption:
 * - Assembly-stage completed => consumes BOM for goodQty + assembly scrap (component rejects or BOM fallback)
 * - Post-Assembly-stage completed => if batch scrapStage is Post-Assembly => consumes BOM for scrapQty
 */
export function stockConsumptionFromCompletedBatches(s: ScenarioData): Record<string, number> {
  const consumed: Record<string, number> = {};
  for (const it of s.stock) consumed[it.id] = 0;

  const processById = new Map(s.processes.map((p) => [p.id, p]));

  const assemblyComplete = new Set<string>();
  const postComplete = new Set<string>();

  for (const evt of s.schedule) {
    if (evt.status !== 'Complete') continue;
    const p = processById.get(evt.processId);
    if (!p) continue;

    if (p.stage === 'Assembly') assemblyComplete.add(evt.batchId);
    else postComplete.add(evt.batchId);
  }

  for (const b of s.batches) {
    const good = Number(b.goodQty) || 0;
    const scrapQty = Number(b.scrapQty) || 0;

    // Assembly stage drives material usage for "built" units (good + any assembly rejects)
    if (assemblyComplete.has(b.id)) {
      addBomConsumption(s, consumed, good);

      if (scrapQty > 0 && b.scrapStage === 'Assembly') {
        const compRejects = parseItemQtyLinesToIdQty(s, b.componentRejects);
        if (Object.keys(compRejects).length === 0) {
          // fallback BOM if rejects not itemised
          addBomConsumption(s, consumed, scrapQty);
        } else {
          for (const id of Object.keys(compRejects)) {
            consumed[id] = (consumed[id] ?? 0) + compRejects[id];
          }
        }
      }
    }

    // Post-assembly failures scrap whole BOM only after post stage is complete
    if (postComplete.has(b.id)) {
      if (scrapQty > 0 && b.scrapStage === 'Post-Assembly') {
        addBomConsumption(s, consumed, scrapQty);
      }
    }
  }

  return consumed;
}

export function stockRemainingAfterProduction(s: ScenarioData): {
  id: string;
  name: string;
  onHandQty: number;
  consumedQty: number;
  remainingQty: number;
  reorderPointQty: number | null;
  minQty: number | null;
  status: 'OK' | 'Reorder' | 'Below Min';
}[] {
  const consumed = stockConsumptionFromCompletedBatches(s);

  return s.stock.map((it) => {
    const onHand = Number(it.onHandQty ?? 0);
    const cons = Number(consumed[it.id] ?? 0);
    const remaining = onHand - cons;

    const rop = typeof it.reorderPointQty === 'number' ? it.reorderPointQty : null;
    const min = typeof it.minQty === 'number' ? it.minQty : null;

    let status: 'OK' | 'Reorder' | 'Below Min' = 'OK';
    if (min != null && remaining < min) status = 'Below Min';
    else if (rop != null && remaining < rop) status = 'Reorder';

    return {
      id: it.id,
      name: it.name,
      onHandQty: onHand,
      consumedQty: cons,
      remainingQty: remaining,
      reorderPointQty: rop,
      minQty: min,
      status,
    };
  });
}

export function summaryAlerts(s: ScenarioData): {
  belowMin: number;
  reorder: number;
  openIssues: number;
  openCapas: number;
  machinesDown: number;
} {
  const stock = stockRemainingAfterProduction(s);
  const belowMin = stock.filter((x) => x.status === 'Below Min').length;
  const reorder = stock.filter((x) => x.status === 'Reorder').length;

  const openIssues = s.schedule.filter((x) => x.status === 'Issue' || x.status === 'Quarantine').length;
  const openCapas = s.capas.filter((c) => c.status !== 'Closed' && c.status !== 'Cancelled').length;
  const machinesDown = s.machines.filter((m) => m.status === 'Out of Service').length;

  return { belowMin, reorder, openIssues, openCapas, machinesDown };
}

/**
 * Existing executive indicator (kept)
 */
function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}
function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
function parseCsv(s: string) {
  return s.split(',').map((x) => x.trim()).filter(Boolean);
}

export function scheduleRiskSummary(s: ScenarioData): { ready: number; atRisk: number; blocked: number } {
  const start = new Date();
  const days = Array.from({ length: 7 }, (_, i) => ymd(addDays(start, i)));
  const inWindow = (date: string) => days.includes(date);

  const byDay: Record<string, { people: Record<string, number>; machines: Record<string, number> }> = {};
  for (const d of days) byDay[d] = { people: {}, machines: {} };

  const addBooking = (day: string, peopleCsv: string, machinesCsv: string) => {
    if (!byDay[day]) return;
    for (const pid of parseCsv(peopleCsv)) byDay[day].people[pid] = (byDay[day].people[pid] ?? 0) + 1;
    for (const mid of parseCsv(machinesCsv)) byDay[day].machines[mid] = (byDay[day].machines[mid] ?? 0) + 1;
  };

  const maintenanceBooking = (machineId: string, day: string) => {
    return s.maintenanceBlocks.some((mb) => {
      if (mb.status === 'Cancelled') return false;
      const ids = parseCsv(mb.machineIdsCsv);
      if (!ids.includes(machineId)) return false;

      const startY = mb.date;
      const dur = Number(mb.durationDays) || 1;
      const startD = new Date(startY + 'T00:00:00');
      for (let i = 0; i < dur; i++) {
        if (ymd(addDays(startD, i)) === day) return true;
      }
      return false;
    });
  };

  for (const evt of s.schedule) {
    if (evt.status === 'Cancelled') continue;

    const startY = evt.date;
    const dur = Number(evt.durationDays) || 1;
    const startD = new Date(startY + 'T00:00:00');
    for (let i = 0; i < dur; i++) {
      const d = ymd(addDays(startD, i));
      if (!inWindow(d)) continue;
      addBooking(d, evt.assignedPeopleIdsCsv, evt.assignedMachineIdsCsv);
    }
  }

  let ready = 0;
  let atRisk = 0;
  let blocked = 0;

  for (const evt of s.schedule) {
    if (!inWindow(evt.date)) continue;

    if (evt.status === 'Issue' || evt.status === 'Quarantine' || evt.status === 'Cancelled') {
      blocked++;
      continue;
    }

    const pIds = parseCsv(evt.assignedPeopleIdsCsv);
    const mIds = parseCsv(evt.assignedMachineIdsCsv);

    const counts = byDay[evt.date];
    const doubleBooked =
      pIds.some((p) => (counts.people[p] ?? 0) > 1) || mIds.some((m) => (counts.machines[m] ?? 0) > 1);

    const maintClash = mIds.some((m) => maintenanceBooking(m, evt.date));

    if (doubleBooked || maintClash) atRisk++;
    else ready++;
  }

  return { ready, atRisk, blocked };
}
