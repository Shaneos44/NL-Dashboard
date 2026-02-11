import { ScenarioData, ScenarioName } from './types';

const baseScenario = (name: ScenarioName, demand: number): ScenarioData => ({
  name,
  inputs: {
    salePricePerUnit: 240,
    monthlyDemand: demand,
    availableMinutesPerMonth: 22 * 8 * 60,

    labourRatePerHour: 28,
    labourMinutesPerUnit: 18,

    qualityCostPerUnit: 4.2,

    oee: name === 'Pilot' ? 0.62 : name === 'Ramp' ? 0.74 : 0.83,
    downtimePct: name === 'Pilot' ? 0.18 : name === 'Ramp' ? 0.12 : 0.08,

    capexTotal: 1200000,
    depreciationMonths: 60,
    marginGuardrailPct: 25,

    // new “not filler” knobs used by calc.ts
    scrapRatePct: name === 'Pilot' ? 0.06 : name === 'Ramp' ? 0.03 : 0.015,
    overheadPct: 0.25,
    holdingRatePctAnnual: 0.24,
    safetyStockDays: name === 'Pilot' ? 21 : 14,
  },

  inventory: [
    {
      id: 'i1',
      name: 'Core PCB',
      category: 'Component',
      unitCost: 35,
      usagePerProduct: 1,
      leadTimeDays: 35,
      moq: 500,
      singleSource: true,
    },
    {
      id: 'i2',
      name: 'Housing',
      category: 'RM',
      unitCost: 16,
      usagePerProduct: 1,
      leadTimeDays: 21,
      moq: 800,
      singleSource: false,
    },
    {
      id: 'i3',
      name: 'Packaging Kit',
      category: 'Packaging',
      unitCost: 4,
      usagePerProduct: 1,
      leadTimeDays: 14,
      moq: 1000,
      singleSource: false,
    },
  ],

  logistics: [
    {
      id: 'l1',
      lane: 'Shenzhen -> Rotterdam',
      direction: 'Inbound',
      mode: 'Sea',
      costPerShipment: 3200,
      unitsPerShipment: 2400,
    },
    {
      id: 'l2',
      lane: 'NL Plant -> EU Dist',
      direction: 'Outbound',
      mode: 'Road',
      costPerShipment: 700,
      unitsPerShipment: 900,
    },
  ],

  machines: [
    { id: 'm1', station: 'SMT', cycleTimeSec: 42, machinesInstalled: 2 },
    { id: 'm2', station: 'Final Assembly', cycleTimeSec: 60, machinesInstalled: 3 },
    { id: 'm3', station: 'Test & Pack', cycleTimeSec: 55, machinesInstalled: 2 },
  ],

  warehouses: [
    {
      id: 'w1',
      location: 'Eindhoven RM Hub',
      type: 'RM',
      monthlyCost: 15000,
      utilizationPct: 0.71,
      capacityPctLimit: 0.85,
    },
    {
      id: 'w2',
      location: 'Venlo FG DC',
      type: 'FG',
      monthlyCost: 18000,
      utilizationPct: 0.76,
      capacityPctLimit: 0.85,
    },
  ],

  maintenance: [
    { id: 'a1', machineType: 'SMT', pmHoursPerMonth: 28, sparesCostPerMonth: 2200, serviceCostPerMonth: 1800 },
    { id: 'a2', machineType: 'Assembly', pmHoursPerMonth: 24, sparesCostPerMonth: 1400, serviceCostPerMonth: 1200 },
  ],

  risks: [
    { id: 'r1', area: 'Supply', status: 'Amber', mitigation: 'Dual-source PCB qualification', owner: 'Sourcing Lead' },
    { id: 'r2', area: 'Quality', status: 'Green', mitigation: 'SPC on line-side torque', owner: 'Quality Manager' },
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
