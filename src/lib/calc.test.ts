import { describe, expect, it } from 'vitest';
import { computeCostBreakdown, evaluateSixPack } from './calc';
import { defaultScenarios } from './data';

describe('Six Pack logic', () => {
  it('passes computed mode when cp/cpk above threshold', () => {
    const result = evaluateSixPack({ id: '1', metric: 'm', mean: 10, stdDev: 0.05, lsl: 9.7, usl: 10.3, mode: 'computed' });
    expect(result.pass).toBe(true);
  });

  it('supports flag mode', () => {
    const result = evaluateSixPack({ id: '1', metric: 'm', mean: 0, stdDev: 1, lsl: 0, usl: 1, mode: 'flags', flaggedPass: false });
    expect(result.pass).toBe(false);
  });
});

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
