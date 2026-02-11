import type { ScenarioData, SixPackInput } from './types';

export interface CostBreakdown {
  labour: number;
  labourOverhead: number;
  material: number;
  logistics: number;
  warehouse: number;
  maintenance: number;
  holding: number;
  capexDepreciation: number;
  quality: number;
  total: number;
  marginPerUnit: number;
  marginPct: number;
}

const safeDivide = (n: number, d: number) => (d > 0 ? n / d : 0);

function scrapMultiplier(s: ScenarioData): number {
  const scrap = s.inputs.scrapRatePct ?? 0;
  return 1 + Math.max(0, scrap);
}

function holdingRateMonthly(s: ScenarioData): number {
  const annual = s.inputs.holdingRatePctAnnual ?? 0.24; // 24%/yr default
  return annual / 12;
}

export function computeCostBreakdown(s: ScenarioData): CostBreakdown {
  const v = s.inputs.monthlyDemand * scrapMultiplier(s);

  const labourBase = (s.inputs.labourRatePerHour / 60) * s.inputs.labourMinutesPerUnit;
  const overheadPct = s.inputs.overheadPct ?? 0.25;
  const labourOverhead = labourBase * overheadPct;

  const labour = labourBase;

  const material = s.inventory.reduce((sum, i) => sum + i.unitCost * i.usagePerProduct, 0);

  const logistics = s.logistics.reduce((sum, l) => sum + safeDivide(l.costPerShipment, l.unitsPerShipment), 0);

  const warehouseMonthly = s.warehouses.reduce((sum, w) => sum + w.monthlyCost, 0);
  const warehouse = safeDivide(warehouseMonthly, v);

  const maintenanceMonthly = s.maintenance.reduce(
    (sum, a) => sum + a.sparesCostPerMonth + a.serviceCostPerMonth,
    0
  );
  const maintenance = safeDivide(maintenanceMonthly, v);

  // holding cost proxy: monthly holding rate * material value
  const holding = material * holdingRateMonthly(s);

  // CAPEX depreciation / unit
  const capexDepreciation = safeDivide(safeDivide(s.inputs.capexTotal, s.inputs.depreciationMonths), v);

  const quality = s.inputs.qualityCostPerUnit;

  const total =
    labour + labourOverhead + material + logistics + warehouse + maintenance + holding + capexDepreciation + quality;

  const marginPerUnit = s.inputs.salePricePerUnit - total;
  const marginPct = safeDivide(marginPerUnit, s.inputs.salePricePerUnit) * 100;

  return {
    labour,
    labourOverhead,
    material,
    logistics,
    warehouse,
    maintenance,
    holding,
    capexDepreciation,
    quality,
    total,
    marginPerUnit,
    marginPct,
  };
}

export function computeTaktTimeMinutes(s: ScenarioData): number {
  const effectiveDemand = s.inputs.monthlyDemand * (1 + s.inputs.downtimePct);
  return safeDivide(s.inputs.availableMinutesPerMonth, effectiveDemand);
}

export interface StationCapacityRow {
  station: string;
  cycleTimeSec: number;
  installed: number;
  capacityUnitsPerMonth: number;
  requiredUnitsPerMonth: number;
  utilizationPct: number; // 0..100
  requiredMachines: number; // fractional
  shortfallMachines: number; // >0 means you need more
}

export function computeStationCapacity(s: ScenarioData): StationCapacityRow[] {
  const demand = s.inputs.monthlyDemand * scrapMultiplier(s);
  const monthlySecs = s.inputs.availableMinutesPerMonth * 60;

  return s.machines.map((m) => {
    const perMachineCapacity = safeDivide(monthlySecs * s.inputs.oee, m.cycleTimeSec);
    const capacityUnitsPerMonth = perMachineCapacity * m.machinesInstalled;

    const requiredMachines = safeDivide(demand, perMachineCapacity);
    const shortfallMachines = Math.max(0, requiredMachines - m.machinesInstalled);

    const utilizationPct = safeDivide(demand, capacityUnitsPerMonth) * 100;

    return {
      station: m.station,
      cycleTimeSec: m.cycleTimeSec,
      installed: m.machinesInstalled,
      capacityUnitsPerMonth,
      requiredUnitsPerMonth: demand,
      utilizationPct,
      requiredMachines,
      shortfallMachines,
    };
  });
}

export function bottleneckStation(s: ScenarioData): StationCapacityRow | null {
  const rows = computeStationCapacity(s);
  if (rows.length === 0) return null;
  return rows.reduce((worst, r) => (r.utilizationPct > worst.utilizationPct ? r : worst), rows[0]);
}

export function fteRequired(s: ScenarioData): number {
  const demand = s.inputs.monthlyDemand * scrapMultiplier(s);
  const requiredLabourMinutes = demand * s.inputs.labourMinutesPerUnit;
  return safeDivide(requiredLabourMinutes, s.inputs.availableMinutesPerMonth);
}

export interface InventoryExposureRow {
  item: string;
  unitCost: number;
  usage: number;
  leadTimeDays: number;
  monthlyDemand: number;
  pipelineUnits: number;
  pipelineValue: number;
  safetyStockUnits: number;
  safetyStockValue: number;
  reorderPointUnits: number;
}

export function computeInventoryExposure(s: ScenarioData): InventoryExposureRow[] {
  const demand = s.inputs.monthlyDemand * scrapMultiplier(s);
  const safetyStockDays = s.inputs.safetyStockDays ?? 14;

  return s.inventory.map((i) => {
    const dailyDemand = demand / 30;
    const pipelineUnits = dailyDemand * i.leadTimeDays;
    const safetyStockUnits = dailyDemand * safetyStockDays;
    const reorderPointUnits = pipelineUnits + safetyStockUnits;

    const unitExtendedCost = i.unitCost * i.usagePerProduct;

    return {
      item: i.name,
      unitCost: unitExtendedCost,
      usage: i.usagePerProduct,
      leadTimeDays: i.leadTimeDays,
      monthlyDemand: demand,
      pipelineUnits,
      pipelineValue: pipelineUnits * unitExtendedCost,
      safetyStockUnits,
      safetyStockValue: safetyStockUnits * unitExtendedCost,
      reorderPointUnits,
    };
  });
}

export function inventoryExposureTotals(s: ScenarioData): {
  pipelineValue: number;
  safetyStockValue: number;
  total: number;
} {
  const rows = computeInventoryExposure(s);
  const pipelineValue = rows.reduce((sum, r) => sum + r.pipelineValue, 0);
  const safetyStockValue = rows.reduce((sum, r) => sum + r.safetyStockValue, 0);
  return { pipelineValue, safetyStockValue, total: pipelineValue + safetyStockValue };
}

export function logisticsSummary(s: ScenarioData): { lane: string; shipmentsPerMonth: number; costPerUnit: number }[] {
  const demand = s.inputs.monthlyDemand * scrapMultiplier(s);
  return s.logistics.map((l) => ({
    lane: l.lane,
    shipmentsPerMonth: safeDivide(demand, l.unitsPerShipment),
    costPerUnit: safeDivide(l.costPerShipment, l.unitsPerShipment),
  }));
}

export function riskScore(s: ScenarioData, marginPct: number): number {
  const counts = s.risks.reduce(
    (acc, r) => ({ ...acc, [r.status]: acc[r.status] + 1 }),
    { Green: 0, Amber: 0, Red: 0 }
  );
  const singleSourceCount = s.inventory.filter((i) => i.singleSource).length;
  const guardrailHit = marginPct < s.inputs.marginGuardrailPct ? 1 : 0;
  return counts.Red * 30 + counts.Amber * 15 + singleSourceCount * 8 + guardrailHit * 20;
}

export function evaluateSixPack(row: SixPackInput): { pass: boolean; cp: number; cpk: number } {
  if (row.mode === 'flags') return { pass: Boolean(row.flaggedPass), cp: 0, cpk: 0 };
  if (row.stdDev <= 0) return { pass: false, cp: 0, cpk: 0 };

  const cp = (row.usl - row.lsl) / (6 * row.stdDev);
  const cpu = (row.usl - row.mean) / (3 * row.stdDev);
  const cpl = (row.mean - row.lsl) / (3 * row.stdDev);
  const cpk = Math.min(cpu, cpl);
  return { pass: cp >= 1.33 && cpk >= 1.33, cp, cpk };
}

export function sixPackYieldPct(s: ScenarioData): number {
  const total = s.sixPack.length;
  const passed = s.sixPack.filter((r) => evaluateSixPack(r).pass).length;
  return safeDivide(passed, total) * 100;
}

/* -----------------------------
   PRODUCTION + STOCK HELPERS
   (safe even if production fields missing)
------------------------------*/

export function productionUnitsGoodCompleted(s: ScenarioData): number {
  const runs: any[] = (s as any).production ?? [];
  return runs
    .filter((r) => r?.status === 'Complete')
    .reduce((sum, r) => sum + (Number(r.unitsGood) || 0), 0);
}

export function inventoryConsumptionFromProduction(s: ScenarioData): Record<string, number> {
  const units = productionUnitsGoodCompleted(s);
  const consumed: Record<string, number> = {};
  for (const item of s.inventory) {
    const perUnit = Number(item.usagePerProduct) || 0;
    consumed[item.id] = units * perUnit;
  }
  return consumed;
}

export function inventoryRemainingAfterProduction(s: ScenarioData): {
  id: string;
  name: string;
  onHandQty: number;
  consumedQty: number;
  remainingQty: number;
  reorderPointQty: number | null;
  minQty: number | null;
  status: 'OK' | 'Reorder' | 'Below Min';
}[] {
  const consumed = inventoryConsumptionFromProduction(s);

  return s.inventory.map((it: any) => {
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
