export type ScenarioName = 'Pilot' | 'Ramp' | 'Scale';

export interface PlanningDecision {
  id: string;
  title: string;
  target: string;
  owner: string;
  status: 'Not started' | 'In progress' | 'Blocked' | 'Done';
  notes: string;
}

export interface GlobalInputs {
  // Currency display: AUD
  salePricePerUnit: number;
  monthlyDemand: number;

  availableMinutesPerMonth: number;
  oee: number;
  downtimePct: number;

  labourRatePerHour: number;
  labourMinutesPerUnit: number;

  qualityCostPerUnit: number;

  scrapRatePct?: number; // 0.05 = 5%
  overheadPct?: number; // 0.25 = 25%
  holdingRatePctAnnual?: number; // 0.24 = 24%
  safetyStockDays?: number; // e.g. 14

  capexTotal: number;
  depreciationMonths: number;
  marginGuardrailPct: number;
}

export interface InventoryItem {
  id: string;
  name: string;
  category: 'RM' | 'Component' | 'Packaging';
  unitCost: number;
  usagePerProduct: number; // BOM usage per finished good
  leadTimeDays: number;
  moq: number;
  singleSource: boolean;

  // stock tracking
  onHandQty: number; // physical stock on hand
  reorderPointQty?: number; // optional manual reorder point
  minQty?: number; // optional minimum on hand
  uom?: string; // e.g. "pcs", "m", "L"
  location?: string; // bin/location
}

export interface LogisticsLane {
  id: string;
  lane: string;
  direction: 'Inbound' | 'Outbound';
  mode: 'Air' | 'Sea' | 'Road';
  costPerShipment: number;
  unitsPerShipment: number;
}

export interface MachineStation {
  id: string;
  station: string;
  cycleTimeSec: number;
  machinesInstalled: number;
}

export interface MachineAsset {
  id: string;
  name: string; // e.g. "SMT #1"
  station: string; // link to station name
  status: 'Available' | 'In Use' | 'Out of Service';
  notes: string;
}

export interface Person {
  id: string;
  name: string;
  role: string; // e.g. "Assembler", "Test Tech", "Supervisor"
  shift: string; // e.g. "Day", "Night", "Flex"
  notes: string;
}

export interface Warehouse {
  id: string;
  location: string;
  type: 'FG' | 'RM';
  monthlyCost: number;
  utilizationPct: number;
  capacityPctLimit?: number;
}

export interface MaintenanceAsset {
  id: string;
  machineType: string;
  pmHoursPerMonth: number;
  sparesCostPerMonth: number;
  serviceCostPerMonth: number;
}

export interface RiskEntry {
  id: string;
  area: string;
  status: 'Green' | 'Amber' | 'Red';
  mitigation: string;
  owner: string;
}

export interface SixPackInput {
  id: string;
  metric: string;
  mean: number;
  stdDev: number;
  lsl: number;
  usl: number;
  mode: 'computed' | 'flags';
  flaggedPass?: boolean;
}

/**
 * Production logic:
 * - unitsGood always consume BOM.
 * - unitsScrap depends on scrapScope:
 *    - 'Components': scrap is component-level and specified in componentScrapOverrides
 *    - 'Full BOM': each scrapped unit consumes full BOM
 */
export interface ProductionRun {
  id: string;

  // schedule / timeline
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  durationMin: number;

  process: string; // e.g. "SMT", "Final Assembly", "Test & Pack"
  workOrder: string; // WO-123 etc.
  unitsPlanned: number;
  unitsGood: number;
  unitsScrap: number;

  // NEW: controls how scrap affects consumption
  scrapScope: 'Components' | 'Full BOM';

  // NEW: component-level scrap used when scrapScope === 'Components'
  // Format (one per line): "Item Name, QtyScrapped"
  componentScrapOverrides: string;

  // who/what
  assignedPeople: string; // comma-separated for simplicity
  machinesUsed: string; // comma-separated MachineAsset names or IDs

  status: 'Planned' | 'In Progress' | 'Complete' | 'Blocked' | 'Cancelled';

  notes: string;
  observations: string;

  // Optional absolute consumption overrides (wins last)
  // Format: "Item Name, QtyConsumed"
  consumptionOverrides: string;
}

export interface ScenarioData {
  name: ScenarioName;

  decisions: PlanningDecision[];
  inputs: GlobalInputs;

  inventory: InventoryItem[];
  logistics: LogisticsLane[];
  machines: MachineStation[];
  machineAssets: MachineAsset[];
  people: Person[];
  production: ProductionRun[];

  warehouses: Warehouse[];
  maintenance: MaintenanceAsset[];
  risks: RiskEntry[];
  sixPack: SixPackInput[];

  auditLog: string[];
}
