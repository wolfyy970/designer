import { describe, it, expect } from 'vitest';
import {
  AggregateJsonSchema,
  BestCandidateJsonSchema,
  EvalRunMetaSchema,
  MetaHarnessConfigSchema,
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
});
