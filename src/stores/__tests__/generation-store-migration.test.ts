import { describe, expect, it } from 'vitest';
import { GENERATION_STATUS } from '../../constants/generation';
import {
  migrateGenerationPersistState,
  pickValidatedGenerationPersistSlice,
} from '../generation-store';

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

    const migrated = migrateGenerationPersistState(structuredClone(v4State), 4);
    const results = migrated.results as { strategyId: string }[];

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

    const migrated = migrateGenerationPersistState(structuredClone(v4State), 4);
    const results = migrated.results as { strategyId: string }[];
    expect(results[0].strategyId).toBe('vs1');
  });

  it('migrated results pass Zod validation via pickValidatedGenerationPersistSlice', () => {
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

    const migrated = migrateGenerationPersistState(structuredClone(v4State), 4);
    const validated = pickValidatedGenerationPersistSlice(migrated);
    expect(validated.results[0].strategyId).toBe('vs1');
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

    const migrated = migrateGenerationPersistState(structuredClone(v0State), 0);
    const results = migrated.results as Record<string, unknown>[];
    expect(results[0].strategyId).toBe('vs1');
    expect(results[0].runId).toBe('legacy');
    expect(results[0].runNumber).toBe(1);
    expect(results[0]).not.toHaveProperty('variantStrategyId');
  });
});
