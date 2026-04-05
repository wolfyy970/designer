import { describe, it, expect } from 'vitest';
import {
  AggregateJsonSchema,
  AggregatedEvaluationReportHarnessSchema,
  BestCandidateJsonSchema,
  EvalRunMetaSchema,
  MetaHarnessConfigSchema,
  PromptOverridesSchema,
  parsePromptOverridesFromUnknown,
  parsePromptOverridesJsonString,
  RubricWeightsJsonSchema,
  TestCaseSummaryFileSchema,
  TestCaseSummarySchema,
} from '../schemas.ts';

describe('meta-harness schemas', () => {
  it('MetaHarnessConfigSchema accepts minimal valid config', () => {
    const r = MetaHarnessConfigSchema.safeParse({
      apiBaseUrl: 'http://127.0.0.1:3001/api',
      iterations: 1,
      proposerModel: 'x',
      proposerMaxToolRounds: 3,
      defaultCompilerProvider: 'openrouter',
    });
    expect(r.success).toBe(true);
  });

  it('MetaHarnessConfigSchema rejects missing apiBaseUrl', () => {
    const r = MetaHarnessConfigSchema.safeParse({
      iterations: 1,
      proposerModel: 'x',
      proposerMaxToolRounds: 3,
      defaultCompilerProvider: 'openrouter',
    });
    expect(r.success).toBe(false);
  });

  it('TestCaseSummarySchema accepts score + stopReason', () => {
    const r = TestCaseSummarySchema.safeParse({ overallScore: 3.2, stopReason: 'ok' });
    expect(r.success).toBe(true);
  });

  it('TestCaseSummaryFileSchema accepts rubricMeans', () => {
    const r = TestCaseSummaryFileSchema.safeParse({
      overallScore: 3,
      rubricMeans: { design: 1, strategy: 2 },
    });
    expect(r.success).toBe(true);
  });

  it('TestCaseSummaryFileSchema rejects non-finite rubricMeans values', () => {
    const r = TestCaseSummaryFileSchema.safeParse({
      overallScore: 3,
      rubricMeans: { x: Number.NaN },
    });
    expect(r.success).toBe(false);
  });

  it('RubricWeightsJsonSchema accepts number map', () => {
    expect(RubricWeightsJsonSchema.safeParse({ design: 0.5 }).success).toBe(true);
  });

  it('RubricWeightsJsonSchema rejects NaN', () => {
    expect(RubricWeightsJsonSchema.safeParse({ x: Number.NaN }).success).toBe(false);
  });

  it('EvalRunMetaSchema accepts partial meta', () => {
    const r = EvalRunMetaSchema.safeParse({ finalOverallScore: 4, stopReason: 'done' });
    expect(r.success).toBe(true);
  });

  it('AggregateJsonSchema accepts mean + candidateId', () => {
    const r = AggregateJsonSchema.safeParse({ meanScore: 2.5, candidateId: 1, scores: [1, 2] });
    expect(r.success).toBe(true);
  });

  it('BestCandidateJsonSchema accepts optional fields', () => {
    const r = BestCandidateJsonSchema.safeParse({
      meanScore: 3,
      candidateId: 2,
      updatedAt: '2020-01-01T00:00:00.000Z',
    });
    expect(r.success).toBe(true);
  });

  it('PromptOverridesSchema accepts string map', () => {
    const r = PromptOverridesSchema.safeParse({ 'designer-agentic-system': 'hello' });
    expect(r.success).toBe(true);
  });

  it('PromptOverridesSchema rejects non-string values', () => {
    const r = PromptOverridesSchema.safeParse({ k: 1 });
    expect(r.success).toBe(false);
  });

  it('parsePromptOverridesJsonString keeps only string values (coercion)', () => {
    expect(parsePromptOverridesJsonString('{"a":"x","b":1}')).toEqual({ a: 'x' });
  });

  it('parsePromptOverridesJsonString returns {} for invalid JSON', () => {
    expect(parsePromptOverridesJsonString('not json')).toEqual({});
  });

  it('parsePromptOverridesFromUnknown handles objects', () => {
    expect(parsePromptOverridesFromUnknown({ p: 'q' })).toEqual({ p: 'q' });
    expect(parsePromptOverridesFromUnknown([1, 2])).toEqual({});
  });

  it('AggregatedEvaluationReportHarnessSchema accepts overallScore and preserves extra keys', () => {
    const raw = {
      overallScore: 3.5,
      normalizedScores: { design: 4 },
      revisionBrief: 'fix contrast',
      hardFails: [],
      shouldRevise: false,
    };
    const r = AggregatedEvaluationReportHarnessSchema.safeParse(raw);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.overallScore).toBe(3.5);
      expect(r.data.hardFails).toEqual([]);
    }
  });

  it('AggregatedEvaluationReportHarnessSchema rejects non-finite overallScore', () => {
    const r = AggregatedEvaluationReportHarnessSchema.safeParse({ overallScore: NaN });
    expect(r.success).toBe(false);
  });
});
