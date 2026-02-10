import { describe, expect, it } from 'vitest';
import { defaultState, duplicateScenario } from './store';

describe('Scenario switching and duplication integrity', () => {
  it('does not mutate source scenario when duplicated', () => {
    const state = structuredClone(defaultState);
    const next = duplicateScenario(state, 'Pilot', 'Ramp');

    next.scenarios.Ramp.inputs.salePricePerUnit = 999;
    expect(state.scenarios.Pilot.inputs.salePricePerUnit).not.toBe(999);
  });
});
