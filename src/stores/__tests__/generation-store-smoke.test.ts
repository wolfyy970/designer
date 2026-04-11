import { describe, it, expect, beforeEach } from 'vitest';
import { GENERATION_STATUS } from '../../constants/generation';
import { useGenerationStore } from '../generation-store';
import type { GenerationResult } from '../../types/provider';

describe('generation-store smoke', () => {
  beforeEach(() => {
    // Avoid full `reset()` — it touches IndexedDB (not available in Vitest node env).
    useGenerationStore.setState({
      results: [],
      isGenerating: false,
      selectedVersions: {},
      userBestOverrides: {},
    });
  });

  it('addResult appends and preserves status', () => {
    const r: GenerationResult = {
      id: 'g1',
      strategyId: 's1',
      providerId: 'openrouter',
      status: GENERATION_STATUS.COMPLETE,
      runId: 'run-1',
      runNumber: 1,
      metadata: { model: 'm' },
    };
    useGenerationStore.getState().addResult(r);
    const { results } = useGenerationStore.getState();
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe(GENERATION_STATUS.COMPLETE);
    expect(results[0]?.runId).toBe('run-1');
  });
});
