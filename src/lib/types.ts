export type ScenarioName = 'Pilot' | 'Ramp' | 'Scale';

export interface GlobalInputs {
  salePricePerUnit: number;
  monthlyDemand: number;

  // time/capacity model
  availableMinutesPerMonth: number;
  oee: number;
  downtimePct: number;

  // labour model
  labourRatePerHour: number;
  labourMinutesPerUnit: number;

  // quality / yield
  qualityCostPerUnit: number;
  scrapRatePct?: number; // % of demand extra to cover scrap/rework, e.g. 0.05 = 5%

  // finance
  capexTotal: number;
  depreciationMonths: number;
  marginGuardrailPct: number;
  overheadPct?: number; // % add-on to labour as overhead burden, e.g. 0.25 = 25%
  holdingRatePctAnnual?: number; // annual inventory holding rate, e.g. 0.24 = 24%

  // inventory policy (used for exposure + reorder points)
  safetyStockDays?: number; // e.g. 14
}

export interface InventoryItem {
  id: string;
  name: string;
  category: 'RM' | 'Component' | 'Packaging';
  unitCost: number;
  usagePerProduct: number;
  leadTimeDays: number;
  moq: number;
  singleSource: boolean;
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

export interface Warehouse {
  id: string;
  location: string;
  type: 'FG' | 'RM';
  monthlyCost: number;
  utilizationPct: number;
  capacityPctLimit?: number; // e.g. 0.85 alert threshold
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

export interface ScenarioData {
  name: ScenarioName;
  inputs: GlobalInputs;
  inventory: InventoryItem[];
  logistics: LogisticsLane[];
  machines: MachineStation[];
  warehouses: Warehouse[];
  maintenance: MaintenanceAsset[];
  risks: RiskEntry[];
  sixPack: SixPackInput[];
  auditLog: string[];
}
