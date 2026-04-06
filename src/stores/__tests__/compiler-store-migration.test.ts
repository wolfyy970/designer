import { describe, expect, it } from 'vitest';

/**
 * Tests compiler store migration logic extracted from the persist config.
 * We import the store to exercise its `migrate` callback via Zustand internals —
 * but since the store is created inline, we directly test the migrate function
 * by reconstructing the migration ladder.
 */

function runCompilerMigrate(persisted: unknown, version: number): Record<string, unknown> {
  const state = persisted as Record<string, unknown>;

  if (version < 1) {
    const incubationPlans: Record<string, unknown> = {};
    if (state.dimensionMap) {
      incubationPlans['compiler-node'] = state.dimensionMap;
    }
    Object.assign(state, { incubationPlans });
  }

  if (version < 2) {
    const maps = (state.dimensionMaps ?? state.incubationPlans) as
      | Record<string, Record<string, unknown>>
      | undefined;
    if (maps) {
      for (const map of Object.values(maps)) {
        const items = (map.variants ?? map.hypotheses) as Record<string, unknown>[] | undefined;
        if (!items) continue;
        for (const v of items) {
          if ('primaryEmphasis' in v && !('hypothesis' in v)) {
            v.hypothesis = v.primaryEmphasis;
            delete v.primaryEmphasis;
          }
          if (!('measurements' in v)) v.measurements = '';
          delete v.howItDiffers;
          delete v.coupledDecisions;
        }
      }
    }
  }

  if (version < 3) {
    const oldMaps = state.dimensionMaps as Record<string, Record<string, unknown>> | undefined;
    if (oldMaps && !state.incubationPlans) {
      const incubationPlans: Record<string, unknown> = {};
      for (const [k, map] of Object.entries(oldMaps)) {
        const { variants, ...rest } = map;
        incubationPlans[k] = { ...rest, hypotheses: variants ?? [] };
      }
      state.incubationPlans = incubationPlans;
      delete state.dimensionMaps;
    } else if (state.incubationPlans) {
      const plans = state.incubationPlans as Record<string, Record<string, unknown>>;
      for (const plan of Object.values(plans)) {
        if (plan.variants && !plan.hypotheses) {
          plan.hypotheses = plan.variants;
          delete plan.variants;
        }
      }
    }
  }

  return state;
}

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

    const result = runCompilerMigrate(structuredClone(v2State), 2);

    expect(result).not.toHaveProperty('dimensionMaps');
    const plans = result.incubationPlans as Record<string, Record<string, unknown>>;
    expect(plans.inc1).toBeDefined();
    expect(plans.inc1.hypotheses).toEqual(v2State.dimensionMaps.inc1.variants);
    expect(plans.inc1).not.toHaveProperty('variants');
    expect(plans.inc1.dimensions).toEqual(v2State.dimensionMaps.inc1.dimensions);
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

    const result = runCompilerMigrate(structuredClone(v2State), 2);
    const plans = result.incubationPlans as Record<string, Record<string, unknown>>;
    expect(plans.inc1.hypotheses).toBeDefined();
    expect(plans.inc1).not.toHaveProperty('variants');
  });

  it('handles empty dimensionMaps gracefully', () => {
    const result = runCompilerMigrate({ dimensionMaps: {} }, 2);
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

    const result = runCompilerMigrate(structuredClone(v2State), 2);
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

    const result = runCompilerMigrate(structuredClone(v0State), 0);
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
