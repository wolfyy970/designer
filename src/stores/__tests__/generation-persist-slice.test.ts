import { describe, expect, it } from 'vitest';
import { GENERATION_STATUS } from '../../constants/generation';
import { pickValidatedGenerationPersistSlice } from '../generation-store';

describe('pickValidatedGenerationPersistSlice', () => {
  it('accepts a valid persisted slice', () => {
    const v = pickValidatedGenerationPersistSlice({
      results: [
        {
          id: 'a',
          strategyId: 'vs',
          providerId: 'p',
          status: GENERATION_STATUS.COMPLETE,
          runId: 'r',
          runNumber: 1,
          metadata: { model: 'm' },
        },
      ],
      selectedVersions: { vs: 'a' },
    });
    expect(v.results).toHaveLength(1);
    expect(v.selectedVersions).toEqual({ vs: 'a' });
  });

  it('drops corrupt rows and keeps valid ones', () => {
    const v = pickValidatedGenerationPersistSlice({
      results: [
        { id: 'x', status: 'bogus' },
        {
          id: 'good',
          strategyId: 'vs',
          providerId: 'p',
          status: GENERATION_STATUS.COMPLETE,
          runId: 'r',
          runNumber: 1,
          metadata: { model: 'm' },
        },
      ],
      selectedVersions: { vs: 'good' },
    });
    expect(v.results).toHaveLength(1);
    expect(v.results[0]?.id).toBe('good');
    expect(v.selectedVersions).toEqual({ vs: 'good' });
  });

  it('drops rows with invalid evaluationSummary but keeps others', () => {
    const v = pickValidatedGenerationPersistSlice({
      results: [
        {
          id: 'bad',
          strategyId: 'vs',
          providerId: 'p',
          status: GENERATION_STATUS.COMPLETE,
          runId: 'r',
          runNumber: 1,
          metadata: { model: 'm' },
          evaluationSummary: { overallScore: 3 },
        },
        {
          id: 'ok',
          strategyId: 'vs2',
          providerId: 'p',
          status: GENERATION_STATUS.COMPLETE,
          runId: 'r',
          runNumber: 1,
          metadata: { model: 'm' },
        },
      ],
      selectedVersions: { vs: 'bad', vs2: 'ok' },
    });
    expect(v.results.map((r) => r.id)).toEqual(['ok']);
    expect(v.selectedVersions).toEqual({ vs2: 'ok' });
  });

  it('filters selectedVersions when result id was dropped', () => {
    const v = pickValidatedGenerationPersistSlice({
      results: [
        {
          id: 'a',
          strategyId: 'vs',
          providerId: 'p',
          status: GENERATION_STATUS.COMPLETE,
          runId: 'r',
          runNumber: 1,
          metadata: { model: 'm' },
        },
      ],
      selectedVersions: { vs: 'a', orphan: 'missing-id' },
      userBestOverrides: { vs: 'orphan-ref' },
    });
    expect(v.selectedVersions).toEqual({ vs: 'a' });
    expect(v.userBestOverrides).toEqual({});
  });

  it('accepts userBestOverrides when present and valid', () => {
    const v = pickValidatedGenerationPersistSlice({
      results: [
        {
          id: 'a',
          strategyId: 'vs',
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
    expect(v.userBestOverrides).toEqual({ vs: 'a' });
  });
});
