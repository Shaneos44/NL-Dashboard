import { ScenarioData, ScenarioName } from './types';

const baseScenario = (name: ScenarioName, demand: number): ScenarioData => ({
  name,

  // REQUIRED (because types.ts now requires it)
  decisions: [
    {
      id: 'd1',
      title: 'Capacity: how many machines & when?',
      target: 'No station > 85% utilization at target demand',
      owner: '',
      status: 'Not started',
      notes: '',
    },
    {
      id: 'd2',
      title: 'People: how many FTE & what roles?',
      target: 'Staffing plan supports ramp without overtime risk',
      owner: '',
      status: 'Not started',
      notes: '',
    },
    {
      id: 'd3',
      title: 'Supply chain: what to order & when?',
      target: 'No stockouts with defined safety stock policy',
      owner: '',
      status: 'Not started',
      notes: '',
    },
  ],

  inputs: {
    salePricePerUnit: 390, // AUD
    monthlyDemand: demand,

    availableMinutesPerMonth: 22 * 8 * 60,
    oee: name === 'Pilot' ? 0.62 : name === 'Ramp' ? 0.74 : 0.83,
    downtimePct: name === 'Pilot' ? 0.18 : name === 'Ramp' ? 0.12 : 0.08,

    labourRatePerHour: 42, // AUD/hr
    labourMinutesPerUnit: 18,

    qualityCostPerUnit: 6.5, // AUD/unit

    scrapRatePct: name === 'Pilot' ? 0.06 : name === 'Ramp' ? 0.03 : 0.015,
    overheadPct: 0.25,
    holdingRatePctAnnual: 0.24,
    safetyStockDays: name === 'Pilot' ? 21 : 14,

    capexTotal: 1400000, // AUD
    depreciationMonths: 60,
    marginGuardrailPct: 25,
  },

  inventory: [
    {
      id: 'i1',
      name: 'Core PCB',
      category: 'Component',
      unitCost: 58,
      usagePerProduct: 1,
      leadTimeDays: 35,
      moq: 500,
      singleSource: true,
    },
    {
      id: 'i2',
      name: 'Housing',
      category: 'RM',
      unitCost: 24,
      usagePerProduct: 1,
      leadTimeDays: 21,
      moq: 800,
      singleSource: false,
    },
    {
      id: 'i3',
      name: 'Packaging Kit',
      category: 'Packaging',
      unitCost: 6.2,
      usagePerProduct: 1,
      leadTimeDays: 14,
      moq: 1000,
      singleSource: false,
    },
  ],

  logistics: [
    {
      id: 'l1',
      lane: 'Asia -> AU DC',
      direction: 'Inbound',
      mode: 'Sea',
      costPerShipment: 5200,
      unitsPerShipment: 2400,
    },
    {
      id: 'l2',
      lane: 'AU DC -> Customers',
      direction: 'Outbound',
      mode: 'Road',
      costPerShipment: 950,
      unitsPerShipment: 900,
    },
  ],

  machines: [
    { id: 'm1', station: 'SMT', cycleTimeSec: 42, machinesInstalled: 2 },
    { id: 'm2', station: 'Final Assembly', cycleTimeSec: 60, machinesInstalled: 3 },
    { id: 'm3', station: 'Test & Pack', cycleTimeSec: 55, machinesInstalled: 2 },
  ],

  warehouses: [
    { id: 'w1', location: 'RM Hub', type: 'RM', monthlyCost: 18000, utilizationPct: 0.71, capacityPctLimit: 0.85 },
    { id: 'w2', location: 'FG DC', type: 'FG', monthlyCost: 22000, utilizationPct: 0.76, capacityPctLimit: 0.85 },
  ],

  maintenance: [
    { id: 'a1', machineType: 'SMT', pmHoursPerMonth: 28, sparesCostPerMonth: 2200, serviceCostPerMonth: 1800 },
    { id: 'a2', machineType: 'Assembly', pmHoursPerMonth: 24, sparesCostPerMonth: 1400, serviceCostPerMonth: 1200 },
  ],

  risks: [
    { id: 'r1', area: 'Supply', status: 'Amber', mitigation: 'Dual-source PCB qualification', owner: '' },
    { id: 'r2', area: 'Quality', status: 'Green', mitigation: 'SPC on line-side torque', owner: '' },
  ],

  sixPack: [
    { id: 's1', metric: 'Critical Dimension A', mean: 9.95, stdDev: 0.08, lsl: 9.7, usl: 10.3, mode: 'computed' },
    { id: 's2', metric: 'Leak Test', mean: 0, stdDev: 1, lsl: 0, usl: 1, mode: 'flags', flaggedPass: true },
  ],

  auditLog: [`Scenario ${name} initialised`],
});

export const defaultScenarios: Record<ScenarioName, ScenarioData> = {
  Pilot: baseScenario('Pilot', 2500),
  Ramp: baseScenario('Ramp', 7000),
  Scale: baseScenario('Scale', 18000),
};
