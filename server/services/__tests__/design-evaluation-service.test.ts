import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';
import type { GenerationProvider } from '../../../src/types/provider.ts';
import { EVALUATOR_RUBRIC_IDS, type EvaluatorRubricId } from '../../../src/types/evaluation.ts';
import * as registry from '../providers/registry.ts';
import {
  parseModelJsonObject,
  normalizeEvaluatorWorkerPayload,
  evaluatorWorkerReportSchema,
  enforceRevisionGate,
  buildEvaluatorUserContent,
  buildDegradedReport,
  aggregateEvaluationReports,
  isEvalSatisfied,
  runEvaluationWorkers,
} from '../design-evaluation-service.ts';
import { runBrowserQA } from '../browser-qa-evaluator.ts';
import type { AggregatedEvaluationReport } from '../../../src/types/evaluation.ts';

describe('parseModelJsonObject', () => {
  it('parses markdown fenced JSON', () => {
    const raw = 'Thoughts…\n```json\n{"hello":"world","n":2}\n```\n';
    const schema = z.object({ hello: z.string(), n: z.number() });
    expect(parseModelJsonObject(raw, schema)).toEqual({ hello: 'world', n: 2 });
  });

  it('parses raw JSON object substring', () => {
    const raw = 'prefix {"ok":true} suffix';
    expect(parseModelJsonObject(raw, z.object({ ok: z.boolean() }))).toEqual({ ok: true });
  });

  it('repairs malformed JSON when possible', () => {
    const raw = '```json\n{"ok": true, trailing: "x",}\n```';
    expect(
      parseModelJsonObject(
        raw,
        z.object({ ok: z.boolean(), trailing: z.string() }),
      ),
    ).toEqual({ ok: true, trailing: 'x' });
  });

  it('accepts evaluator JSON when findings and hardFails were wrongly nested under scores', () => {
    const raw = JSON.stringify({
      rubric: 'design',
      scores: {
        design_quality: { score: 4, notes: 'ok' },
        originality: { score: 3, notes: 'fine' },
        craft: { score: 4, notes: 'ok' },
        usability: { score: 4, notes: 'ok' },
        findings: [{ severity: 'high', summary: 'S', detail: 'D' }],
        hardFails: [{ code: 'MISSING_X', message: 'bad' }],
      },
      findings: [{ severity: 'low', summary: 'Top', detail: 'T' }],
      hardFails: [],
    });
    const parsed = parseModelJsonObject(raw, evaluatorWorkerReportSchema, normalizeEvaluatorWorkerPayload);
    expect(parsed.scores).not.toHaveProperty('findings');
    expect(parsed.scores).not.toHaveProperty('hardFails');
    expect(parsed.findings).toHaveLength(2);
    expect(parsed.hardFails).toHaveLength(1);
    expect(parsed.hardFails[0].code).toBe('MISSING_X');
  });

  it('coerces a single finding object at top level into an array', () => {
    const raw = JSON.stringify({
      rubric: 'strategy',
      scores: {
        hypothesis_adherence: { score: 5, notes: 'n' },
        kpi_alignment: { score: 5, notes: 'n' },
        constraints_respect: { score: 5, notes: 'n' },
        dimension_fit: { score: 5, notes: 'n' },
        design_system_use: { score: 5, notes: 'n' },
      },
      findings: { severity: 'medium', summary: 'One', detail: 'Detail' },
      hardFails: [],
    });
    const parsed = parseModelJsonObject(raw, evaluatorWorkerReportSchema, normalizeEvaluatorWorkerPayload);
    expect(parsed.findings).toEqual([
      { severity: 'medium', summary: 'One', detail: 'Detail' },
    ]);
  });
});

describe('enforceRevisionGate', () => {
  const base: AggregatedEvaluationReport = {
    overallScore: 4.2,
    normalizedScores: { craft: 4, originality: 4 },
    hardFails: [],
    prioritizedFixes: [],
    shouldRevise: false,
    revisionBrief: '',
  };

  it('forces shouldRevise when hardFails present', () => {
    const r = enforceRevisionGate({
      ...base,
      hardFails: [{ code: 'x', message: 'bad', source: 'design' }],
    });
    expect(r.shouldRevise).toBe(true);
  });

  it('forces shouldRevise when any normalized score is <= 2', () => {
    const r = enforceRevisionGate({
      ...base,
      normalizedScores: { a: 4, b: 2 },
    });
    expect(r.shouldRevise).toBe(true);
  });

  it('forces shouldRevise when average score is below 3.5', () => {
    const r = enforceRevisionGate({
      ...base,
      normalizedScores: { a: 3, b: 3 },
    });
    expect(r.shouldRevise).toBe(true);
  });

  it('preserves shouldRevise false when scores are healthy', () => {
    const r = enforceRevisionGate({
      ...base,
      normalizedScores: { a: 4, b: 4 },
      overallScore: 4,
    });
    expect(r.shouldRevise).toBe(false);
  });
});

describe('isEvalSatisfied', () => {
  const agg = (partial: Partial<AggregatedEvaluationReport>): AggregatedEvaluationReport => ({
    overallScore: 3,
    normalizedScores: {},
    hardFails: [],
    prioritizedFixes: [],
    shouldRevise: true,
    revisionBrief: '',
    ...partial,
  });

  it('is satisfied when shouldRevise is false', () => {
    expect(isEvalSatisfied(agg({ shouldRevise: false }))).toBe(true);
  });

  it('is not satisfied when shouldRevise true and no min threshold', () => {
    expect(isEvalSatisfied(agg({ shouldRevise: true, overallScore: 5 }))).toBe(false);
  });

  it('is satisfied with minOverallScore when score met and no hard fails', () => {
    expect(
      isEvalSatisfied(agg({ shouldRevise: true, overallScore: 4.5, hardFails: [] }), {
        minOverallScore: 4,
      }),
    ).toBe(true);
  });

  it('is not satisfied with minOverallScore when hard fails exist', () => {
    expect(
      isEvalSatisfied(
        agg({
          shouldRevise: true,
          overallScore: 5,
          hardFails: [{ code: 'x', message: 'bad', source: 'design' }],
        }),
        { minOverallScore: 3 },
      ),
    ).toBe(false);
  });

  it('is not satisfied when score below minOverallScore', () => {
    expect(
      isEvalSatisfied(agg({ shouldRevise: true, overallScore: 3, hardFails: [] }), {
        minOverallScore: 4,
      }),
    ).toBe(false);
  });
});

describe('buildDegradedReport', () => {
  it('marks rubric and includes worker error hardFail', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const r = buildDegradedReport('strategy', new Error('boom'));
      expect(r.rubric).toBe('strategy');
      expect(r.hardFails.some((h) => h.code === 'evaluator_worker_error')).toBe(true);
      expect(r.scores.evaluator_unavailable?.score).toBe(0);
      expect(warnSpy).toHaveBeenCalledWith(
        '[eval:worker-degraded]',
        expect.objectContaining({ rubric: 'strategy', message: expect.stringContaining('boom') }),
      );
    } finally {
      warnSpy.mockRestore();
    }
  });
});

describe('aggregateEvaluationReports', () => {
  const worker = (
    rubric: 'design' | 'strategy' | 'implementation' | 'browser',
    score: number,
  ) => ({
    rubric,
    scores: { c1: { score, notes: 'n' } },
    findings: [] as { severity: 'high' | 'medium' | 'low'; summary: string; detail: string }[],
    hardFails: [] as { code: string; message: string }[],
  });

  it('merges scores with rubric-prefixed keys and computes overall average', () => {
    const agg = aggregateEvaluationReports({
      design: worker('design', 4),
      strategy: worker('strategy', 2),
      implementation: worker('implementation', 4),
      browser: worker('browser', 4),
    });
    expect(agg.normalizedScores.design_c1).toBe(4);
    expect(agg.normalizedScores.strategy_c1).toBe(2);
    expect(agg.normalizedScores.browser_c1).toBe(4);
    expect(agg.overallScore).toBeCloseTo(14 / 4, 5);
    expect(agg.shouldRevise).toBe(false);
    const gated = enforceRevisionGate(agg);
    expect(gated.shouldRevise).toBe(true);
  });

  it('includes browser hard fails in aggregated hard fails with source browser', () => {
    const browserWorker = {
      rubric: 'browser' as const,
      scores: { js_runtime: { score: 1, notes: 'crash' } },
      findings: [] as { severity: 'high' | 'medium' | 'low'; summary: string; detail: string }[],
      hardFails: [{ code: 'js_execution_failure', message: 'ReferenceError: x is not defined' }],
    };
    const agg = aggregateEvaluationReports({
      design: worker('design', 4),
      strategy: worker('strategy', 4),
      implementation: worker('implementation', 4),
      browser: browserWorker,
    });
    expect(agg.hardFails.some((hf) => hf.source === 'browser' && hf.code === 'js_execution_failure')).toBe(true);
    const gated = enforceRevisionGate(agg);
    expect(gated.shouldRevise).toBe(true);
  });
});

describe('runBrowserQA', () => {
  it('passes healthy well-formed HTML', () => {
    const html = '<!DOCTYPE html><html><head><title>T</title></head><body><h1>Hello</h1><p>World content here with lots of words to make the content check pass easily</p><button onclick="go()">CTA</button><a href="#home">Nav</a></body></html>';
    const result = runBrowserQA({ files: { 'index.html': html } });
    expect(result.rubric).toBe('browser');
    expect(result.scores.page_structure?.score).toBeGreaterThanOrEqual(3);
    expect(result.scores.interactive_elems?.score).toBeGreaterThanOrEqual(2);
    expect(result.hardFails.filter((hf) => hf.code !== 'empty_page')).toHaveLength(0);
  });

  it('reports hard fail for completely empty page', () => {
    const result = runBrowserQA({ files: { 'index.html': '<html><body></body></html>' } });
    expect(result.hardFails.some((hf) => hf.code === 'empty_page')).toBe(true);
    expect(result.scores.content_presence?.score).toBeLessThanOrEqual(2);
  });

  it('catches JS runtime errors in bundled scripts', () => {
    const html = '<!DOCTYPE html><html><head></head><body><h1>Hello world content here</h1><button>Go</button></body><script>undeclaredFunction();</script></html>';
    const result = runBrowserQA({ files: { 'index.html': html } });
    expect(result.scores.js_runtime?.score).toBeLessThan(5);
  });

  it('reports missing external asset as hard fail', () => {
    const html = '<!DOCTYPE html><html><head><link rel="stylesheet" href="styles.css"/></head><body><h1>Styled page with enough content here</h1></body></html>';
    const result = runBrowserQA({ files: { 'index.html': html } });
    expect(result.hardFails.some((hf) => hf.code === 'missing_assets')).toBe(true);
  });

  it('passes when external asset is present in file map', () => {
    const html = '<!DOCTYPE html><html><head><link rel="stylesheet" href="styles.css"/></head><body><h1>Styled</h1><p>Content with enough words for the check</p><button>Go</button></body></html>';
    const result = runBrowserQA({ files: { 'index.html': html, 'styles.css': 'body { color: red; }' } });
    expect(result.scores.asset_integrity?.score).toBe(5);
  });

  it('checks asset integrity on secondary html pages', () => {
    const result = runBrowserQA({
      files: {
        'index.html':
          '<!DOCTYPE html><html><body><h1>Home page with words for content</h1><a href="p2.html">Next</a></body></html>',
        'p2.html':
          '<!DOCTYPE html><html><head><link rel="stylesheet" href="missing.css"/></head><body><h1>Second page words here</h1></body></html>',
      },
    });
    expect(result.hardFails.some((hf) => hf.code === 'missing_assets')).toBe(true);
  });

  it('returns degraded-shaped report when files map is empty', () => {
    const result = runBrowserQA({ files: {} });
    expect(result.rubric).toBe('browser');
    expect(result.hardFails.some((hf) => hf.code === 'empty_page')).toBe(true);
  });
});

describe('runEvaluationWorkers onWorkerDone', () => {
  const html =
    '<!DOCTYPE html><html><head><title>T</title></head><body><h1>Hello</h1><p>World content here with lots of words to make the content check pass easily</p><button onclick="go()">CTA</button><a href="#home">Nav</a></body></html>';

  let getProviderSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    getProviderSpy = vi.spyOn(registry, 'getProvider').mockReturnValue({
      generateChat: vi.fn().mockResolvedValue({
        raw: JSON.stringify({
          rubric: 'design',
          scores: { x: { score: 4, notes: 'n' } },
          findings: [],
          hardFails: [],
        }),
      }),
    } as unknown as GenerationProvider);
  });

  afterEach(() => {
    getProviderSpy.mockRestore();
  });

  it('invokes onWorkerDone once per rubric in parallel mode', async () => {
    const done: EvaluatorRubricId[] = [];
    await runEvaluationWorkers({
      files: { 'index.html': html },
      compiledPrompt: 'p',
      providerId: 'openrouter',
      modelId: 'x',
      parallel: true,
      getPromptBody: vi.fn().mockResolvedValue('system'),
      onWorkerDone: (rubric) => {
        done.push(rubric);
      },
    });
    expect(done).toHaveLength(4);
    expect(new Set(done).size).toBe(4);
  });

  it('invokes onWorkerDone in sequential rubric order', async () => {
    const done: EvaluatorRubricId[] = [];
    await runEvaluationWorkers({
      files: { 'index.html': html },
      compiledPrompt: 'p',
      providerId: 'openrouter',
      modelId: 'x',
      parallel: false,
      getPromptBody: vi.fn().mockResolvedValue('system'),
      onWorkerDone: (rubric) => {
        done.push(rubric);
      },
    });
    expect(done).toEqual([...EVALUATOR_RUBRIC_IDS]);
  });
});

describe('buildEvaluatorUserContent', () => {
  it('includes hypothesis context from EvaluationContextPayload', () => {
    const body = buildEvaluatorUserContent(
      { 'index.html': '<!DOCTYPE html><html><body>Hi</body></html>' },
      'compiled prompt text',
      {
        hypothesis: 'Bold dark UI',
        objectivesMetrics: 'Increase trust',
      },
    );
    expect(body).toContain('compiled prompt text');
    expect(body).toContain('Bold dark UI');
    expect(body).toContain('Increase trust');
    expect(body).toContain('bundled_preview_html');
    expect(body).toContain('index.html');
  });

  it('embeds preview_page_url when provided', () => {
    const body = buildEvaluatorUserContent(
      { 'index.html': '<html><body>x</body></html>' },
      'p',
      undefined,
      'http://127.0.0.1:3001/api/preview/sessions/abc/index.html',
    );
    expect(body).toContain('<preview_page_url>');
    expect(body).toContain('http://127.0.0.1:3001/api/preview/sessions/abc/index.html');
  });
});
