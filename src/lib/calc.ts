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

// Production consumption is driven by BATCH outcomes (good + scrap rules),
// but only counted when there is at least one scheduled item for that batch marked Complete.
export function stockConsumptionFromCompletedBatches(s: ScenarioData): Record<string, number> {
  const consumed: Record<string, number> = {};
  for (const it of s.stock) consumed[it.id] = 0;

  const completedBatchIds = new Set(
    s.schedule.filter((x) => x.status === 'Complete').map((x) => x.batchId)
  );

  for (const b of s.batches) {
    if (!completedBatchIds.has(b.id)) continue;

    // Good units always consume BOM
    addBomConsumption(s, consumed, Number(b.goodQty) || 0);

    const scrapQty = Number(b.scrapQty) || 0;
    if (!scrapQty) continue;

    if (b.scrapStage === 'Post-Assembly') {
      // Whole BOM scrapped
      addBomConsumption(s, consumed, scrapQty);
    } else {
      // Assembly scrap = component rejects, uneven per component
      const compRejects = parseItemQtyLinesToIdQty(s, b.componentRejects);

      // If nothing entered, fall back to BOM to avoid undercounting
      if (Object.keys(compRejects).length === 0) {
        addBomConsumption(s, consumed, scrapQty);
      } else {
        for (const id of Object.keys(compRejects)) {
          consumed[id] = (consumed[id] ?? 0) + compRejects[id];
        }
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
