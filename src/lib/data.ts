import { ScenarioData, ScenarioName } from './types';

const today = new Date().toISOString().slice(0, 10);

const baseScenario = (name: ScenarioName, demand: number): ScenarioData => ({
  name,

  decisions: [
    {
      id: 'd1',
      title: 'A) Capacity: machines & timing',
      target: 'No process over 85% utilisation at target demand',
      owner: '',
      status: 'Not started',
      notes: '',
    },
    {
      id: 'd2',
      title: 'B) People: roles & staffing',
      target: 'Staffing plan supports ramp without overtime risk',
      owner: '',
      status: 'Not started',
      notes: '',
    },
    {
      id: 'd3',
      title: 'C) Supply chain: what to order & when',
      target: 'No stockouts; define safety stock + reorder points',
      owner: '',
      status: 'Not started',
      notes: '',
    },
  ],

  capas: [],

  inputs: {
    salePricePerUnit: 390,
    monthlyDemand: demand,

    availableMinutesPerMonth: 22 * 8 * 60,
    oee: name === 'Pilot' ? 0.62 : name === 'Ramp' ? 0.74 : 0.83,
    downtimePct: name === 'Pilot' ? 0.18 : name === 'Ramp' ? 0.12 : 0.08,

    labourRatePerHour: 42,
    labourMinutesPerUnit: 18,

    qualityCostPerUnit: 6.5,

    scrapRatePct: name === 'Pilot' ? 0.06 : name === 'Ramp' ? 0.03 : 0.015,
    overheadPct: 0.25,
    holdingRatePctAnnual: 0.24,
    safetyStockDays: name === 'Pilot' ? 21 : 14,

    capexTotal: 1400000,
    depreciationMonths: 60,
    marginGuardrailPct: 25,
  },

  stock: [
    {
      id: 's1',
      name: 'Core PCB',
      type: 'Component',
      unitCost: 58,
      uom: 'pcs',
      location: 'RM-01',
      usagePerFinishedUnit: 1,
      leadTimeDays: 35,
      moq: 500,
      singleSource: true,
      onHandQty: 1800,
      reorderPointQty: 1200,
      minQty: 800,
    },
    {
      id: 's2',
      name: 'Housing',
      type: 'Component',
      unitCost: 24,
      uom: 'pcs',
      location: 'RM-02',
      usagePerFinishedUnit: 1,
      leadTimeDays: 21,
      moq: 800,
      singleSource: false,
      onHandQty: 2600,
      reorderPointQty: 1500,
      minQty: 1000,
    },
    {
      id: 's3',
      name: 'Packaging Kit',
      type: 'Packaging',
      unitCost: 6.2,
      uom: 'pcs',
      location: 'PK-01',
      usagePerFinishedUnit: 1,
      leadTimeDays: 14,
      moq: 1000,
      singleSource: false,
      onHandQty: 3400,
      reorderPointQty: 2000,
      minQty: 1500,
    },
    {
      id: 's4',
      name: 'IPA (cleaning)',
      type: 'Consumable',
      unitCost: 18,
      uom: 'L',
      location: 'CON-01',
      usagePerFinishedUnit: 0.02,
      leadTimeDays: 7,
      moq: 20,
      singleSource: false,
      onHandQty: 60,
      reorderPointQty: 30,
      minQty: 20,
    },
  ],

  people: [
    { id: 'p1', name: 'Operator A', role: 'Assembler', shift: 'Day', notes: '' },
    { id: 'p2', name: 'Operator B', role: 'Test Tech', shift: 'Day', notes: '' },
    { id: 'p3', name: 'Supervisor', role: 'Supervisor', shift: 'Day', notes: '' },
  ],

  machines: [
    { id: 'm1', name: 'Assembly Line #1', type: 'Assembly Line', status: 'Available', notes: '' },
    { id: 'm2', name: 'Assembly Line #2', type: 'Assembly Line', status: 'Available', notes: '' },
    { id: 'm3', name: 'Test Bench #1', type: 'Test Bench', status: 'Available', notes: '' },
  ],

  processes: [
    {
      id: 'pr1',
      name: 'Final Assembly',
      defaultDurationMin: 480,
      allowedMachineTypesCsv: 'Assembly Line',
      notes: '',
    },
    {
      id: 'pr2',
      name: 'Test & Pack',
      defaultDurationMin: 480,
      allowedMachineTypesCsv: 'Test Bench',
      notes: '',
    },
  ],

  batches: [
    {
      id: 'b1',
      batchNumber: 'BATCH-001',
      purpose: 'Pilot build',
      plannedQty: 200,
      goodQty: 0,
      scrapStage: 'Assembly',
      scrapQty: 0,
      componentRejects: '',
      status: 'Planned',
      notes: '',
      observations: '',
    },
  ],

  schedule: [],

  maintenanceBlocks: [],

  logistics: [
    { id: 'l1', lane: 'Asia -> AU DC', direction: 'Inbound', mode: 'Sea', costPerShipment: 5200, unitsPerShipment: 2400 },
    { id: 'l2', lane: 'AU DC -> Customers', direction: 'Outbound', mode: 'Road', costPerShipment: 950, unitsPerShipment: 900 },
  ],

  warehouses: [
    { id: 'w1', location: 'RM Hub', type: 'RM', monthlyCost: 18000, utilizationPct: 0.71, capacityPctLimit: 0.85 },
    { id: 'w2', location: 'FG DC', type: 'FG', monthlyCost: 22000, utilizationPct: 0.76, capacityPctLimit: 0.85 },
  ],

  risks: [
    { id: 'r1', area: 'Supply', status: 'Amber', mitigation: 'Dual-source PCB qualification', owner: '' },
    { id: 'r2', area: 'Quality', status: 'Green', mitigation: 'SPC on line-side torque', owner: '' },
  ],

  auditLog: [`Scenario ${name} initialised (${today})`],
});

export const defaultScenarios: Record<ScenarioName, ScenarioData> = {
  Pilot: baseScenario('Pilot', 2500),
  Ramp: baseScenario('Ramp', 7000),
  Scale: baseScenario('Scale', 18000),
};
