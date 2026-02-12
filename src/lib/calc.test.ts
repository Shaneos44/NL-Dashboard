import { describe, expect, it } from 'vitest';
import { computeCostBreakdown } from './calc';
import { defaultScenarios } from './data';

describe('Cost model edge conditions', () => {
  it('handles zero volume without division errors', () => {
    const scenario = structuredClone(defaultScenarios.Pilot);
    scenario.inputs.monthlyDemand = 0;

    const cost = computeCostBreakdown(scenario);
    expect(Number.isFinite(cost.total)).toBe(true);
  });

  it('reflects high labour rate impact', () => {
    const scenario = structuredClone(defaultScenarios.Pilot);
    scenario.inputs.labourRatePerHour = 500;

    const cost = computeCostBreakdown(scenario);
    expect(cost.labour).toBeGreaterThan(100);
  });
});
