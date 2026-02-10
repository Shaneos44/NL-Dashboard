import { ScenarioData, SixPackInput } from './types';

export interface CostBreakdown {
  labour: number;
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

export function computeCostBreakdown(s: ScenarioData): CostBreakdown {
  const v = s.inputs.monthlyDemand;

  // labour cost / unit = labour rate (per minute) * labour minutes / unit
  const labour = (s.inputs.labourRatePerHour / 60) * s.inputs.labourMinutesPerUnit;

  // material cost / unit = Σ (item unit cost * usage per product)
  const material = s.inventory.reduce((sum, i) => sum + i.unitCost * i.usagePerProduct, 0);

  // logistics / unit = Σ (cost per shipment / units per shipment)
  const logistics = s.logistics.reduce((sum, l) => sum + safeDivide(l.costPerShipment, l.unitsPerShipment), 0);

  // warehouse / unit = monthly warehousing cost / monthly demand
  const warehouseMonthly = s.warehouses.reduce((sum, w) => sum + w.monthlyCost, 0);
  const warehouse = safeDivide(warehouseMonthly, v);

  // maintenance / unit = monthly PM + spares + service / monthly demand
  const maintenanceMonthly = s.maintenance.reduce((sum, a) => sum + a.sparesCostPerMonth + a.serviceCostPerMonth, 0);
  const maintenance = safeDivide(maintenanceMonthly, v);

  // holding / unit = 1.5% of material value as baseline carrying burden proxy
  const holding = material * 0.015;

  // CAPEX depreciation / unit = (capex / depreciation months) / monthly demand
  const capexDepreciation = safeDivide(safeDivide(s.inputs.capexTotal, s.inputs.depreciationMonths), v);

  const quality = s.inputs.qualityCostPerUnit;
  const total = labour + material + logistics + warehouse + maintenance + holding + capexDepreciation + quality;
  const marginPerUnit = s.inputs.salePricePerUnit - total;
  const marginPct = safeDivide(marginPerUnit, s.inputs.salePricePerUnit) * 100;

  return { labour, material, logistics, warehouse, maintenance, holding, capexDepreciation, quality, total, marginPerUnit, marginPct };
}

export function computeTaktTimeMinutes(s: ScenarioData): number {
  const effectiveDemand = s.inputs.monthlyDemand * (1 + s.inputs.downtimePct);
  return safeDivide(s.inputs.availableMinutesPerMonth, effectiveDemand);
}

export function machineRequirementForStation(s: ScenarioData, cycleTimeSec: number): number {
  const monthlySecs = s.inputs.availableMinutesPerMonth * 60;
  const capacityPerMachine = safeDivide(monthlySecs * s.inputs.oee, cycleTimeSec);
  return safeDivide(s.inputs.monthlyDemand, capacityPerMachine);
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
  if (row.mode === 'flags') {
    return { pass: Boolean(row.flaggedPass), cp: 0, cpk: 0 };
  }

  if (row.stdDev <= 0) {
    return { pass: false, cp: 0, cpk: 0 };
  }

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
