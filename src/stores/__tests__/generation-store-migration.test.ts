import { describe, expect, it } from 'vitest';
import { GENERATION_STATUS } from '../../constants/generation';
import { pickValidatedGenerationPersistSlice } from '../generation-store';

/**
 * Extracted migration logic matching the generation store's persist.migrate callback.
 * Tests the v4→v5 rename of variantStrategyId to strategyId.
 */
function runGenerationMigrate(persisted: unknown, version: number): Record<string, unknown> {
  const state = persisted as Record<string, unknown>;

  if (version < 2) {
    const results = (state.results as Record<string, unknown>[]) ?? [];
    state.results = results.map((r) => ({
      ...r,
      runId: (r as Record<string, unknown>).runId ?? 'legacy',
      runNumber: (r as Record<string, unknown>).runNumber ?? 1,
    }));
    state.selectedVersions = state.selectedVersions ?? {};
  }
  if (version < 3) {
    const results = (state.results as Record<string, unknown>[]) ?? [];
    state.results = results.map((r) => {
      const next = { ...r };
      delete next.evaluationSummary;
      delete next.evaluationRounds;
      delete next.evaluationStatus;
      return next;
    });
  }
  if (version < 4) {
    state.userBestOverrides = state.userBestOverrides ?? {};
  }
  if (version < 5) {
    const results = (state.results as Record<string, unknown>[]) ?? [];
    state.results = results.map((r) => {
      if ('variantStrategyId' in r && !('strategyId' in r)) {
        const { variantStrategyId, ...rest } = r;
        return { ...rest, strategyId: variantStrategyId };
      }
      return r;
    });
  }
  return state;
}

describe('generation store migration v4 → v5 (variantStrategyId → strategyId)', () => {
  it('renames variantStrategyId to strategyId on result rows', () => {
    const v4State = {
      results: [
        {
          id: 'r1',
          variantStrategyId: 'vs1',
          providerId: 'openrouter',
          status: GENERATION_STATUS.COMPLETE,
          runId: 'run1',
          runNumber: 1,
          metadata: { model: 'test' },
        },
        {
          id: 'r2',
          variantStrategyId: 'vs2',
          providerId: 'openrouter',
          status: GENERATION_STATUS.GENERATING,
          runId: 'run1',
          runNumber: 2,
          metadata: { model: 'test' },
        },
      ],
      selectedVersions: { vs1: 'r1' },
      userBestOverrides: {},
    };

    const migrated = runGenerationMigrate(structuredClone(v4State), 4);
    const results = migrated.results as Record<string, unknown>[];

    expect(results[0].strategyId).toBe('vs1');
    expect(results[0]).not.toHaveProperty('variantStrategyId');
    expect(results[1].strategyId).toBe('vs2');
    expect(results[1]).not.toHaveProperty('variantStrategyId');
  });

  it('does not alter results that already have strategyId', () => {
    const v4State = {
      results: [
        {
          id: 'r1',
          strategyId: 'vs1',
          providerId: 'openrouter',
          status: GENERATION_STATUS.COMPLETE,
          runId: 'run1',
          runNumber: 1,
          metadata: { model: 'test' },
        },
      ],
      selectedVersions: {},
      userBestOverrides: {},
    };

    const migrated = runGenerationMigrate(structuredClone(v4State), 4);
    const results = migrated.results as Record<string, unknown>[];
    expect(results[0].strategyId).toBe('vs1');
  });

  it('migrated results pass Zod validation', () => {
    const v4State = {
      results: [
        {
          id: 'r1',
          variantStrategyId: 'vs1',
          providerId: 'openrouter',
          status: GENERATION_STATUS.COMPLETE,
          runId: 'run1',
          runNumber: 1,
          metadata: { model: 'test' },
        },
      ],
      selectedVersions: {},
      userBestOverrides: {},
    };

    const migrated = runGenerationMigrate(structuredClone(v4State), 4);
    const validated = pickValidatedGenerationPersistSlice(migrated);
    expect(validated).not.toBeNull();
    expect(validated!.results[0].strategyId).toBe('vs1');
  });
});

describe('generation store full migration ladder (v0 → v5)', () => {
  it('migrates v0 data with variantStrategyId through all steps', () => {
    const v0State = {
      results: [
        {
          id: 'r1',
          variantStrategyId: 'vs1',
          providerId: 'p',
          status: GENERATION_STATUS.COMPLETE,
          metadata: { model: 'm' },
        },
      ],
    };

    const migrated = runGenerationMigrate(structuredClone(v0State), 0);
    const results = migrated.results as Record<string, unknown>[];
    expect(results[0].strategyId).toBe('vs1');
    expect(results[0].runId).toBe('legacy');
    expect(results[0].runNumber).toBe(1);
    expect(results[0]).not.toHaveProperty('variantStrategyId');
  });
});
