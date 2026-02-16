export type ScenarioName = 'Pilot' | 'Ramp' | 'Scale';

export interface PlanningDecision {
  id: string;
  title: string;
  target: string;
  owner: string;
  status: 'Not started' | 'In progress' | 'Blocked' | 'Done';
  notes: string;
}

export interface CapaItem {
  id: string;
  ref: string;
  batchId?: string;
  title: string;
  owner: string;
  dueDate: string;
  status: 'Open' | 'In progress' | 'Effectiveness check' | 'Closed' | 'Cancelled';
  rootCause: string;
  action: string;
  notes: string;
}

export interface GlobalInputs {
  salePricePerUnit: number;
  monthlyDemand: number;

  availableMinutesPerMonth: number;
  oee: number;
  downtimePct: number;

  labourRatePerHour: number;
  labourMinutesPerUnit: number;

  qualityCostPerUnit: number;

  scrapRatePct?: number;
  overheadPct?: number;
  holdingRatePctAnnual?: number;
  safetyStockDays?: number;

  capexTotal: number;
  depreciationMonths: number;
  marginGuardrailPct: number;
}

export interface StockItem {
  id: string;
  name: string;
  type: 'Component' | 'Consumable' | 'Packaging' | 'Spare';
  unitCost: number;
  uom: string;
  location: string;

  usagePerFinishedUnit: number;

  leadTimeDays: number;
  moq: number;
  singleSource: boolean;

  onHandQty: number;
  reorderPointQty?: number;
  minQty?: number;
}

export interface LogisticsLane {
  id: string;
  lane: string;
  direction: 'Inbound' | 'Outbound';
  mode: 'Air' | 'Sea' | 'Road';
  costPerShipment: number;
  unitsPerShipment: number;
}

export interface Warehouse {
  id: string;
  location: string;
  type: 'FG' | 'RM';
  monthlyCost: number;
  utilizationPct: number;
  capacityPctLimit?: number;
}

export interface Person {
  id: string;
  name: string;
  role: string;
  shift: string;
  notes: string;
}

export interface MachineAsset {
  id: string;
  name: string;
  type: string;
  status: 'Available' | 'In Use' | 'Out of Service';
  notes: string;
}

export interface ProcessTemplate {
  id: string;
  name: string;
  stage: 'Assembly' | 'Post-Assembly';
  defaultDurationMin: number;
  allowedMachineTypesCsv: string;
  notes: string;
}

export type BatchStatus =
  | 'Planned'
  | 'In Progress'
  | 'Issue'
  | 'Complete'
  | 'Quarantine'
  | 'Rejected'
  | 'Cancelled';

export interface ProductionBatch {
  id: string;
  batchNumber: string;
  purpose: string;

  plannedQty: number;

  goodQty: number;

  scrapStage: 'Assembly' | 'Post-Assembly';
  scrapQty: number;

  componentRejects: string;

  status: BatchStatus;

  notes: string;
  observations: string;
}

export interface ScheduledProcess {
  id: string;
  batchId: string;

  date: string;
  durationDays: number;

  processId: string;
  assignedPeopleIdsCsv: string;
  assignedMachineIdsCsv: string;

  status: BatchStatus;
  notes: string;
  observations: string;
}

export interface MaintenanceBlock {
  id: string;
  date: string;
  durationDays: number;
  machineIdsCsv: string;
  title: string;
  notes: string;
  status: 'Planned' | 'In Progress' | 'Complete' | 'Cancelled';
}

export interface RiskEntry {
  id: string;
  area: string;
  status: 'Green' | 'Amber' | 'Red';
  mitigation: string;
  owner: string;
}

export interface ScenarioData {
  name: ScenarioName;

  decisions: PlanningDecision[];
  capas: CapaItem[];

  inputs: GlobalInputs;

  stock: StockItem[];
  people: Person[];
  machines: MachineAsset[];
  processes: ProcessTemplate[];

  batches: ProductionBatch[];
  schedule: ScheduledProcess[];
  maintenanceBlocks: MaintenanceBlock[];

  logistics: LogisticsLane[];
  warehouses: Warehouse[];
  risks: RiskEntry[];

  auditLog: string[];
}
