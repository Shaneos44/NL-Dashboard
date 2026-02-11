import type { ScenarioData } from './types';

export function productionUnitsGoodCompleted(s: ScenarioData): number {
  return s.production
    .filter((r) => r.status === 'Complete')
    .reduce((sum, r) => sum + (Number(r.unitsGood) || 0), 0);
}

export function inventoryConsumptionFromProduction(s: ScenarioData): Record<string, number> {
  // Consumes BOM items proportional to unitsGood for completed runs
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

  return s.inventory.map((it) => {
    const onHand = Number(it.onHandQty) || 0;
    const cons = Number(consumed[it.id] ?? 0) || 0;
    const remaining = onHand - cons;

    const rop = it.reorderPointQty ?? null;
    const min = it.minQty ?? null;

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
