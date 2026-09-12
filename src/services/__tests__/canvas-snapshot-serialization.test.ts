import { describe, expect, it } from 'vitest';
import { GENERATION_STATUS } from '../../constants/generation';
import type { GenerationResult } from '../../types/provider';
import { toRestorableGenerationResult } from '../canvas-snapshot-serialization';

describe('toRestorableGenerationResult', () => {
  it('copies only restorable generation fields and marks in-flight runs stopped', () => {
    /**
     * The in-flight (`live*`) fields are the point of this test: they must not
     * survive into a persisted snapshot. They are typed as `GenerationResult`
     * rather than cast, so the fixture cannot drift away from the real field
     * shapes — it previously carried a `liveTrace` without `id`/`at` and an
     * `EvaluatorWorkerReport` with `score`/`summary` fields that no longer
     * exist, and the cast hid all of it.
     */
    const inFlight: GenerationResult = {
      id: 'r1',
      strategyId: 's1',
      providerId: 'openrouter',
      status: GENERATION_STATUS.GENERATING,
      code: '<html />',
      liveCode: '<html />',
      liveFiles: { 'index.html': '<html />' },
      liveFilesPlan: ['index.html'],
      liveTodos: [{ id: 't1', task: 'Build', status: 'pending' }],
      liveTrace: [
        {
          id: 'tr1',
          at: '2026-01-01T00:00:00.000Z',
          kind: 'phase',
          label: 'Building',
          phase: 'building',
        },
      ],
      liveSkills: [{ key: 'k', name: 'Skill', description: 'desc' }],
      liveActivatedSkills: [{ key: 'k', name: 'Skill', description: 'desc' }],
      liveEvalWorkers: {
        design: {
          rubric: 'design',
          scores: { hierarchy: { score: 4, notes: 'clear' } },
          findings: [],
          hardFails: [],
        },
      },
      streamedModelChars: 100,
      streamingToolName: 'write',
      runId: 'run',
      runNumber: 1,
      metadata: { model: 'm' },
    };

    const result = toRestorableGenerationResult(inFlight);

    expect(result.status).toBe(GENERATION_STATUS.ERROR);
    expect(result.error).toBe('Generation stopped.');
    expect(result.code).toBeUndefined();
    expect(result.liveCode).toBeUndefined();
    expect(result.liveFiles).toBeUndefined();
    expect(result.liveTrace).toBeUndefined();
    expect(result.liveEvalWorkers).toBeUndefined();
    expect(result.streamedModelChars).toBeUndefined();
    // Everything the snapshot does keep is preserved verbatim.
    expect(result.id).toBe('r1');
    expect(result.runId).toBe('run');
    expect(result.runNumber).toBe(1);
    expect(result.metadata).toEqual({ model: 'm' });
  });

  it('strips evaluator traces and round files from persisted evaluation metadata', () => {
    const complete: GenerationResult = {
      id: 'r1',
      strategyId: 's1',
      providerId: 'openrouter',
      status: GENERATION_STATUS.COMPLETE,
      runId: 'run',
      runNumber: 1,
      metadata: { model: 'm' },
      evaluationSummary: {
        overallScore: 4,
        normalizedScores: {},
        hardFails: [],
        prioritizedFixes: [],
        shouldRevise: false,
        revisionBrief: '',
        evaluatorTraces: { design: 'trace text' },
      },
      evaluationRounds: [
        {
          round: 1,
          files: { 'index.html': '<html />' },
          aggregate: {
            overallScore: 4,
            normalizedScores: {},
            hardFails: [],
            prioritizedFixes: [],
            shouldRevise: false,
            revisionBrief: '',
            evaluatorTraces: { design: 'trace text' },
          },
          design: {
            rubric: 'design',
            scores: { hierarchy: { score: 4, notes: 'clear' } },
            findings: [],
            hardFails: [],
            rawTrace: 'full worker output',
          },
        },
      ],
    };

    const result = toRestorableGenerationResult(complete);

    expect(result.evaluationSummary?.evaluatorTraces).toBeUndefined();
    expect(result.evaluationRounds?.[0].files).toBeUndefined();
    expect(result.evaluationRounds?.[0].aggregate?.evaluatorTraces).toBeUndefined();
    expect(
      result.evaluationRounds?.[0].design && 'rawTrace' in result.evaluationRounds[0].design,
    ).toBe(false);
    // Non-payload evaluation metadata survives.
    expect(result.evaluationSummary?.overallScore).toBe(4);
    expect(result.evaluationRounds?.[0].design?.scores).toEqual({
      hierarchy: { score: 4, notes: 'clear' },
    });
  });
});
