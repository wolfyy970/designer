import { describe, expect, it } from 'vitest';
import { GENERATION_STATUS } from '../../constants/generation';
import { pickValidatedGenerationPersistSlice } from '../generation-store';

describe('pickValidatedGenerationPersistSlice', () => {
  it('accepts a valid persisted slice', () => {
    const v = pickValidatedGenerationPersistSlice({
      results: [
        {
          id: 'a',
          variantStrategyId: 'vs',
          providerId: 'p',
          status: GENERATION_STATUS.COMPLETE,
          runId: 'r',
          runNumber: 1,
          metadata: { model: 'm' },
        },
      ],
      selectedVersions: { vs: 'a' },
    });
    expect(v?.results).toHaveLength(1);
    expect(v?.selectedVersions).toEqual({ vs: 'a' });
  });

  it('returns null for corrupt rows', () => {
    expect(
      pickValidatedGenerationPersistSlice({
        results: [{ id: 'x', status: 'bogus' }],
        selectedVersions: {},
      }),
    ).toBeNull();
  });

  it('returns null when evaluationSummary shape is invalid', () => {
    expect(
      pickValidatedGenerationPersistSlice({
        results: [
          {
            id: 'a',
            variantStrategyId: 'vs',
            providerId: 'p',
            status: GENERATION_STATUS.COMPLETE,
            runId: 'r',
            runNumber: 1,
            metadata: { model: 'm' },
            evaluationSummary: { overallScore: 3 },
          },
        ],
        selectedVersions: {},
      }),
    ).toBeNull();
  });

  it('accepts userBestOverrides when present', () => {
    const v = pickValidatedGenerationPersistSlice({
      results: [
        {
          id: 'a',
          variantStrategyId: 'vs',
          providerId: 'p',
          status: GENERATION_STATUS.COMPLETE,
          runId: 'r',
          runNumber: 1,
          metadata: { model: 'm' },
        },
      ],
      selectedVersions: { vs: 'a' },
      userBestOverrides: { vs: 'a' },
    });
    expect(v?.userBestOverrides).toEqual({ vs: 'a' });
  });
});
