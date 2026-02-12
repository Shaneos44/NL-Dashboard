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
  ref: string; // CAPA-001
  batchId?: string;
  title: string;
  owner: string;
  dueDate: string; // YYYY-MM-DD
  status: 'Open' | 'In progress' | 'Effectiveness check' | 'Closed' | 'Cancelled';
  rootCause: string;
  action: string;
  notes: string;
}

export interface GlobalInputs {
  salePricePerUnit: number; // AUD
  monthlyDemand: number;

  availableMinutesPerMonth: number;
  oee: number;
  downtimePct: number;

  labourRatePerHour: number; // AUD/hr
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
  uom: string; // pcs, m, L
  location: string;

  // For finished unit BOM usage (used for post-assembly failures and good units)
  usagePerFinishedUnit: number;

  // Replenishment
  leadTimeDays: number;
  moq: number;
  singleSource: boolean;

  // Physical stock
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
  type: string; // e.g. "Assembly Line", "Test Bench"
  status: 'Available' | 'In Use' | 'Out of Service';
  notes: string;
}

export interface ProcessTemplate {
  id: string;
  name: string; // e.g. "Final Assembly"
  defaultDurationMin: number;
  allowedMachineTypesCsv: string; // comma list of MachineAsset.type values
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

  // outcomes (editable)
  goodQty: number;

  // Scrap rules:
  // - Assembly: component-level rejects (entered per component)
  // - Post-Assembly: whole BOM rejected (finished unit fails after assembly)
  scrapStage: 'Assembly' | 'Post-Assembly';

  scrapQty: number;

  // Component rejects used when scrapStage === 'Assembly'
  // Format: one per line "Item Name, Qty"
  componentRejects: string;

  status: BatchStatus;

  notes: string;
  observations: string;
}

export interface ScheduledProcess {
  id: string;
  batchId: string;

  // scheduled
  date: string; // YYYY-MM-DD
  durationDays: number; // assign each process to a day, and how many days it spans

  processId: string; // ProcessTemplate.id
  assignedPeopleIdsCsv: string; // comma-separated person IDs
  assignedMachineIdsCsv: string; // comma-separated machine IDs

  status: BatchStatus;
  notes: string;
  observations: string;
}

export interface MaintenanceBlock {
  id: string;
  date: string; // YYYY-MM-DD
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

  // tracking
  decisions: PlanningDecision[];
  capas: CapaItem[];

  inputs: GlobalInputs;

  // master data
  stock: StockItem[];
  people: Person[];
  machines: MachineAsset[];
  processes: ProcessTemplate[];

  // execution
  batches: ProductionBatch[];
  schedule: ScheduledProcess[];
  maintenanceBlocks: MaintenanceBlock[];

  // planning
  logistics: LogisticsLane[];
  warehouses: Warehouse[];
  risks: RiskEntry[];

  auditLog: string[];
}
