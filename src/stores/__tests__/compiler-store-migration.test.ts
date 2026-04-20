import { describe, expect, it } from 'vitest';
import { migrateIncubatorPersistState } from '../incubator-store';

describe('compiler store migration v2 → v3 (dimensionMaps → incubationPlans)', () => {
  it('converts dimensionMaps with variants to incubationPlans with hypotheses', () => {
    const v2State = {
      dimensionMaps: {
        inc1: {
          id: 'plan1',
          dimensions: [{ name: 'D1', range: 'A-B', isConstant: false }],
          variants: [
            { id: 'vs1', name: 'H1', hypothesis: 'Test it', rationale: 'R', measurements: 'M', dimensionValues: {} },
          ],
          generatedAt: '2024-01-01',
          incubatorModel: 'test-model',
        },
      },
      selectedProvider: 'openrouter',
      selectedModel: 'test',
    };

    const result = migrateIncubatorPersistState(structuredClone(v2State), 2);

    expect(result).not.toHaveProperty('dimensionMaps');
    const plans = result.incubationPlans as Record<string, Record<string, unknown>>;
    expect(plans.inc1).toBeDefined();
    expect(plans.inc1.hypotheses).toEqual(
      (v2State.dimensionMaps as Record<string, { variants: unknown[] }>).inc1.variants,
    );
    expect(plans.inc1).not.toHaveProperty('variants');
    expect(plans.inc1.dimensions).toEqual(
      (v2State.dimensionMaps as Record<string, { dimensions: unknown[] }>).inc1.dimensions,
    );
  });

  it('renames inner variants to hypotheses when incubationPlans already exists', () => {
    const v2State = {
      incubationPlans: {
        inc1: {
          id: 'plan1',
          dimensions: [],
          variants: [{ id: 'vs1', name: 'H1', hypothesis: 'x', rationale: '', measurements: '', dimensionValues: {} }],
        },
      },
    };

    const result = migrateIncubatorPersistState(structuredClone(v2State), 2);
    const plans = result.incubationPlans as Record<string, Record<string, unknown>>;
    expect(plans.inc1.hypotheses).toBeDefined();
    expect(plans.inc1).not.toHaveProperty('variants');
  });

  it('handles empty dimensionMaps gracefully', () => {
    const result = migrateIncubatorPersistState({ dimensionMaps: {} }, 2);
    expect(result.incubationPlans).toEqual({});
  });

  it('preserves incubationPlans with hypotheses already in place', () => {
    const v2State = {
      incubationPlans: {
        inc1: {
          id: 'plan1',
          dimensions: [],
          hypotheses: [{ id: 'vs1', name: 'H1' }],
        },
      },
    };

    const result = migrateIncubatorPersistState(structuredClone(v2State), 2);
    const plans = result.incubationPlans as Record<string, Record<string, unknown>>;
    expect((plans.inc1.hypotheses as unknown[]).length).toBe(1);
  });
});

describe('compiler store migration full ladder (v0 → v3)', () => {
  it('migrates v0 with dimensionMap + primaryEmphasis through all steps', () => {
    const v0State = {
      dimensionMap: {
        id: 'old',
        dimensions: [],
        variants: [
          { id: 'vs1', name: 'H1', primaryEmphasis: 'Bold colors', rationale: 'R', howItDiffers: 'x', coupledDecisions: 'y' },
        ],
      },
    };

    const result = migrateIncubatorPersistState(structuredClone(v0State), 0);
    const plans = result.incubationPlans as Record<string, Record<string, unknown>>;
    const node = plans['compiler-node'];
    expect(node).toBeDefined();
    const hyps = node.hypotheses as Record<string, unknown>[];
    expect(hyps[0].hypothesis).toBe('Bold colors');
    expect(hyps[0]).not.toHaveProperty('primaryEmphasis');
    expect(hyps[0]).not.toHaveProperty('howItDiffers');
    expect(hyps[0]).not.toHaveProperty('coupledDecisions');
    expect(hyps[0].measurements).toBe('');
  });
});
