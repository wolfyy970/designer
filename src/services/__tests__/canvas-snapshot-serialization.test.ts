import { describe, expect, it } from 'vitest';
import { GENERATION_STATUS } from '../../constants/generation';
import type { GenerationResult } from '../../types/provider';
import { toRestorableGenerationResult } from '../canvas-snapshot-serialization';

describe('toRestorableGenerationResult', () => {
  it('copies only restorable generation fields and marks in-flight runs stopped', () => {
    const result = toRestorableGenerationResult({
      id: 'r1',
      strategyId: 's1',
      providerId: 'openrouter',
      status: GENERATION_STATUS.GENERATING,
      code: '<html />',
      liveCode: '<html />',
      liveFiles: { 'index.html': '<html />' },
      liveFilesPlan: ['index.html'],
      liveTodos: [{ id: 't1', task: 'Build', status: 'pending' }],
      liveTrace: [{ kind: 'phase', ts: 1, phase: 'build' }],
      liveSkills: [{ key: 'k', name: 'Skill', description: 'desc' }],
      liveActivatedSkills: [{ key: 'k', name: 'Skill', description: 'desc' }],
      liveEvalWorkers: { design: { rubric: 'design', score: 4, summary: 'ok', strengths: [], issues: [], recommendations: [], rawTrace: [] } },
      streamedModelChars: 100,
      streamingToolName: 'write',
      runId: 'run',
      runNumber: 1,
      metadata: { model: 'm' },
    } as GenerationResult);

    expect(result.status).toBe(GENERATION_STATUS.ERROR);
    expect(result.error).toBe('Generation stopped.');
    expect(result.code).toBeUndefined();
    expect(result.liveCode).toBeUndefined();
    expect(result.liveFiles).toBeUndefined();
    expect(result.liveTrace).toBeUndefined();
    expect(result.liveEvalWorkers).toBeUndefined();
    expect(result.streamedModelChars).toBeUndefined();
  });

  it('strips evaluator traces and round files from persisted evaluation metadata', () => {
    const result = toRestorableGenerationResult({
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
        evaluatorTraces: [{ rubric: 'design', trace: [] }],
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
            evaluatorTraces: [{ rubric: 'design', trace: [] }],
          },
          design: {
            rubric: 'design',
            score: 4,
            summary: 'ok',
            strengths: [],
            issues: [],
            recommendations: [],
            rawTrace: [],
          },
        },
      ],
    } as GenerationResult);

    expect(result.evaluationSummary?.evaluatorTraces).toBeUndefined();
    expect(result.evaluationRounds?.[0].files).toBeUndefined();
    expect(result.evaluationRounds?.[0].aggregate?.evaluatorTraces).toBeUndefined();
    expect(result.evaluationRounds?.[0].design && 'rawTrace' in result.evaluationRounds[0].design).toBe(false);
  });
});
