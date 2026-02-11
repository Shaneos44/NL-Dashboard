export type ScenarioName = 'Pilot' | 'Ramp' | 'Scale';

export interface PlanningDecision {
  id: string;
  title: string;          // e.g. "How many machines & when?"
  target: string;         // e.g. "No capacity shortfall for next 6 months"
  owner: string;          // optional
  status: 'Not started' | 'In progress' | 'Blocked' | 'Done';
  notes: string;          // free text
}

export interface GlobalInputs {
  // NOTE: currency is AUD (display only)
  salePricePerUnit: number;
  monthlyDemand: number;

  availableMinutesPerMonth: number;
  oee: number;
  downtimePct: number;

  labourRatePerHour: number;
  labourMinutesPerUnit: number;

  qualityCostPerUnit: number;

  scrapRatePct?: number;           // 0.05 = 5%
  overheadPct?: number;            // 0.25 = 25%
  holdingRatePctAnnual?: number;   // 0.24 = 24%
  safetyStockDays?: number;        // e.g. 14

  capexTotal: number;
  depreciationMonths: number;
  marginGuardrailPct: number;
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

export interface ScenarioData {
  name: ScenarioName;
  decisions: PlanningDecision[]; // YOUR editable top 3 decisions + tracking
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
