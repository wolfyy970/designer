/**
 * Behavioural tests for `src/lib/debug-markdown-export.ts`.
 *
 * The module is dominated by pure string builders (Markdown snapshots for a
 * hypothesis node and for one design run), plus one DOM-touching helper
 * (`downloadTextFile`) and two option-bag helpers used by the debug export
 * dialog. Everything here runs in the default node environment; `Blob` and
 * `URL.createObjectURL` exist in Node, so `downloadTextFile` is exercised with
 * a minimal stubbed `document`/`window` rather than a jsdom document.
 *
 * Assertions pin emitted text (headings, exact lines, fences), section ORDER,
 * explicit ABSENCE of option-gated sections, and the exact truncation boundary.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildDesignDebugExportOptionsFromPreset,
  buildDesignRunDebugMarkdown,
  buildHypothesisDebugMarkdown,
  downloadTextFile,
  findPlanForStrategy,
  getDefaultDesignDebugExportOptions,
  mergeDesignDebugExportOptions,
  type DesignDebugExportOptions,
  type DesignRunDebugExportInput,
  type HypothesisDebugExportInput,
} from '../debug-markdown-export';
import type { CompiledPrompt, HypothesisStrategy, IncubationPlan } from '../../types/incubator';
import type { DesignSpec, ReferenceImage, SpecSection, SpecSectionId } from '../../types/spec';
import type {
  AggregatedEvaluationReport,
  EvaluationRoundSnapshot,
  EvaluatorWorkerReport,
} from '../../types/evaluation';
import type { GenerationResult, Provenance, ThinkingTurnSlice } from '../../types/provider';
import type { DomainDesignSystemContent, DomainHypothesis } from '../../types/workspace-domain';
import { DEFAULT_MODEL_ID, REASONING_MODEL_ID } from '../../test-support/model-fixtures';

// ---------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------

const EXPORTED_AT = '2024-06-01T00:00:00.000Z';

function agg(over: Partial<AggregatedEvaluationReport> = {}): AggregatedEvaluationReport {
  return {
    overallScore: 3.5,
    normalizedScores: {},
    hardFails: [],
    prioritizedFixes: [],
    shouldRevise: false,
    revisionBrief: '',
    ...over,
  };
}

function worker(over: Partial<EvaluatorWorkerReport> = {}): EvaluatorWorkerReport {
  return { rubric: 'design', scores: {}, findings: [], hardFails: [], ...over };
}

function round(n: number, over: Partial<EvaluationRoundSnapshot> = {}): EvaluationRoundSnapshot {
  return { round: n, aggregate: agg(), ...over };
}

function result(over: Partial<GenerationResult> = {}): GenerationResult {
  return {
    id: 'res-1',
    strategyId: 'strat-1',
    providerId: 'openrouter',
    status: 'complete',
    runId: 'run-1',
    runNumber: 1,
    metadata: { model: DEFAULT_MODEL_ID },
    ...over,
  };
}

function strategy(over: Partial<HypothesisStrategy> = {}): HypothesisStrategy {
  return {
    id: 'strat-1',
    name: 'Bold layout',
    hypothesis: 'A bold layout converts better.',
    rationale: 'Contrast draws the eye.',
    measurements: 'CTR on the hero CTA.',
    dimensionValues: { boldness: 'high' },
    ...over,
  };
}

function provenance(over: Partial<Provenance> = {}): Provenance {
  return {
    hypothesisSnapshot: {
      name: 'Bold layout',
      hypothesis: 'A bold layout converts better.',
      rationale: 'Contrast draws the eye.',
      dimensionValues: { boldness: 'high' },
    },
    compiledPrompt: '# Prompt\n\nbuild the page',
    provider: 'openrouter',
    model: DEFAULT_MODEL_ID,
    timestamp: '2024-05-30T12:00:00.000Z',
    ...over,
  };
}

function runInput(over: Partial<DesignRunDebugExportInput> = {}): DesignRunDebugExportInput {
  return { exportedAt: EXPORTED_AT, previewName: 'Checkout preview', result: result(), ...over };
}

function turn(over: Partial<ThinkingTurnSlice> = {}): ThinkingTurnSlice {
  return {
    turnId: 1,
    text: 'weighing options',
    startedAt: Date.parse('2024-05-30T12:00:00.000Z'),
    endedAt: Date.parse('2024-05-30T12:00:05.000Z'),
    ...over,
  };
}

const ALL_ON: DesignDebugExportOptions = {
  runSummary: true,
  strategySnapshot: true,
  progressHarness: true,
  thinking: true,
  assistantOutput: true,
  runTrace: true,
  evaluationFromResult: true,
  provenanceHypothesisSnapshot: true,
  provenanceDesignSystem: true,
  provenanceCompiledPrompt: true,
  provenanceRequestMeta: true,
  provenanceEvaluation: true,
  provenanceCheckpoint: true,
  artifactManifest: true,
  artifactFullSources: true,
};

const ALL_OFF: DesignDebugExportOptions = {
  runSummary: false,
  strategySnapshot: false,
  progressHarness: false,
  thinking: false,
  assistantOutput: false,
  runTrace: false,
  evaluationFromResult: false,
  provenanceHypothesisSnapshot: false,
  provenanceDesignSystem: false,
  provenanceCompiledPrompt: false,
  provenanceRequestMeta: false,
  provenanceEvaluation: false,
  provenanceCheckpoint: false,
  artifactManifest: false,
  artifactFullSources: false,
};

const FULL_FILES: Record<string, string> = {
  'index.html': '<html><body>hi</body></html>',
  'styles/main.css': 'body { color: red; }',
  'README.md': '# Notes',
};

/** One run with every optional surface populated at once. */
function fullyPopulatedRun(): DesignRunDebugExportInput {
  return runInput({
    previewNodeId: 'pnode-9',
    previewName: 'Checkout redesign v2!',
    strategyName: 'Bold layout',
    strategy: strategy(),
    result: result({
      id: 'res-9',
      runNumber: 4,
      agenticPhase: 'complete',
      evaluationStatus: 'done',
      progressMessage: 'Wrapping up',
      activeToolName: 'write_file',
      activeToolPath: 'index.html',
      metadata: {
        model: DEFAULT_MODEL_ID,
        durationMs: 1234,
        completedAt: '2024-05-30T12:05:00.000Z',
      },
      liveTodos: [{ id: 't1', task: 'Build hero', status: 'completed' }],
      liveFilesPlan: ['index.html', 'styles/main.css'],
      thinkingTurns: [turn()],
      activityByTurn: { 1: 'Working on the hero.' },
      liveTrace: [
        { id: 'tr-1', at: '2024-05-30T12:00:01.000Z', kind: 'run_started', label: 'Run started' },
        {
          id: 'tr-2',
          at: '2024-05-30T12:00:02.000Z',
          kind: 'tool_started',
          label: 'write_file index.html',
          turnId: 2,
        },
      ],
      evaluationRounds: [
        round(1, {
          design: worker({
            scores: { clarity: { score: 4, notes: 'Clear hero' } },
            findings: [{ severity: 'high', summary: 'Missing CTA', detail: 'No button' }],
            hardFails: [{ code: 'a11y_contrast', message: 'Contrast below 4.5' }],
          }),
          aggregate: agg({
            overallScore: 4.2,
            normalizedScores: { design: 0.9 },
            prioritizedFixes: ['fix contrast'],
            shouldRevise: true,
            revisionBrief: 'Raise contrast',
            hardFails: [{ source: 'browser', code: 'a11y_contrast', message: 'Contrast below 4.5' }],
          }),
        }),
      ],
      evaluationSummary: agg({ overallScore: 4.4 }),
    }),
    provenance: provenance({
      designSystemSnapshot: '# DS\n\nPrimary #123456',
      evaluation: { rounds: [round(1)], finalAggregate: agg({ overallScore: 4.1 }) },
      checkpoint: {
        totalRounds: 2,
        filesWritten: ['index.html'],
        finalTodosSummary: '2 done',
        completedAt: '2024-05-30T12:06:00.000Z',
        stopReason: 'satisfied',
      },
    }),
    code: '<html>single</html>',
    files: { ...FULL_FILES },
  });
}

/**
 * Assert every needle is present and that they appear in the given order.
 * `indexOf` on a missing needle would be -1, which is why presence is
 * checked first — ordering alone would silently accept a missing section.
 */
function expectDocumentOrder(doc: string, needles: string[]): void {
  const indices = needles.map((needle) => {
    expect(doc, `missing from export: ${needle}`).toContain(needle);
    return doc.indexOf(needle);
  });
  expect(indices).toEqual([...indices].sort((a, b) => a - b));
}

function specSection(
  id: SpecSectionId,
  content = '',
  images: ReferenceImage[] = [],
): SpecSection {
  return { id, content, images, lastModified: '2024-05-01T00:00:00.000Z' };
}

function image(id: string): ReferenceImage {
  return {
    id,
    filename: `${id}.png`,
    dataUrl: 'data:image/png;base64,AAAA',
    description: '',
    createdAt: '2024-05-01T00:00:00.000Z',
  };
}

function hypothesisInput(over: Partial<HypothesisDebugExportInput> = {}): HypothesisDebugExportInput {
  return {
    exportedAt: EXPORTED_AT,
    hypothesisNodeId: 'hnode-1',
    strategy: strategy(),
    designSystems: {},
    spec: undefined,
    compiledPromptsForStrategy: [],
    resultsForStrategy: [],
    ...over,
  };
}

// ---------------------------------------------------------------------------
// findPlanForStrategy
// ---------------------------------------------------------------------------

describe('findPlanForStrategy', () => {
  function plan(id: string, hypothesisIds: string[]): IncubationPlan {
    return {
      id,
      specId: 'spec-1',
      dimensions: [],
      hypotheses: hypothesisIds.map((hid) => strategy({ id: hid, name: hid })),
      generatedAt: '2024-05-01T00:00:00.000Z',
      incubatorModel: REASONING_MODEL_ID,
    };
  }

  it('returns the plan whose hypotheses include the strategy id', () => {
    const plans = { p1: plan('p1', ['a', 'b']), p2: plan('p2', ['c']) };
    expect(findPlanForStrategy(plans, 'c')?.id).toBe('p2');
  });

  it('returns undefined when no plan lists the strategy id', () => {
    const plans = { p1: plan('p1', ['a']) };
    expect(findPlanForStrategy(plans, 'missing')).toBeUndefined();
  });

  it('returns undefined for an empty plan map', () => {
    expect(findPlanForStrategy({}, 'a')).toBeUndefined();
  });

  it('returns the first matching plan in insertion order when ids repeat', () => {
    const plans = { first: plan('first', ['dup']), second: plan('second', ['dup']) };
    expect(findPlanForStrategy(plans, 'dup')?.id).toBe('first');
  });
});

// ---------------------------------------------------------------------------
// downloadTextFile
// ---------------------------------------------------------------------------

describe('downloadTextFile', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function stubDom() {
    const anchor = {
      href: '',
      download: '',
      style: { display: '' },
      click: vi.fn(),
    };
    const appended: unknown[] = [];
    const removed: unknown[] = [];
    const createElement = vi.fn(() => anchor);
    vi.stubGlobal('document', {
      createElement,
      body: {
        appendChild: (node: unknown) => appended.push(node),
        removeChild: (node: unknown) => removed.push(node),
      },
    });
    vi.stubGlobal('window', { setTimeout: (fn: () => void) => setTimeout(fn, 0) });
    return { anchor, appended, removed, createElement };
  }

  it('downloads the text as a hidden anchor click and revokes the URL afterwards', async () => {
    const { anchor, appended, removed } = stubDom();
    let captured: Blob | undefined;
    const revoke = vi
      .spyOn(URL, 'revokeObjectURL')
      .mockImplementation(() => undefined);
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob: Blob | MediaSource) => {
      captured = blob as Blob;
      return 'blob:test-url';
    });

    downloadTextFile('export.md', '# Title');

    expect(anchor.download).toBe('export.md');
    expect(anchor.href).toBe('blob:test-url');
    expect(anchor.style.display).toBe('none');
    expect(anchor.click).toHaveBeenCalledTimes(1);
    expect(appended).toEqual([anchor]);
    expect(removed).toEqual([anchor]);
    expect(captured?.type).toBe('text/markdown;charset=utf-8');
    expect(await captured?.text()).toBe('# Title');
    expect(revoke).not.toHaveBeenCalled();

    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(revoke).toHaveBeenCalledWith('blob:test-url');
  });

  it('passes an explicit mime type through to the Blob', () => {
    stubDom();
    let captured: Blob | undefined;
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob: Blob | MediaSource) => {
      captured = blob as Blob;
      return 'blob:test-url';
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

    downloadTextFile('raw.txt', 'plain', 'text/plain');

    expect(captured?.type).toBe('text/plain');
  });
});

// ---------------------------------------------------------------------------
// option helpers
// ---------------------------------------------------------------------------

describe('getDefaultDesignDebugExportOptions', () => {
  it('returns the exact default option bag for a bare result', () => {
    expect(getDefaultDesignDebugExportOptions(runInput())).toEqual({
      runSummary: true,
      strategySnapshot: true,
      progressHarness: true,
      thinking: false,
      assistantOutput: false,
      runTrace: false,
      evaluationFromResult: false,
      provenanceHypothesisSnapshot: true,
      provenanceDesignSystem: true,
      provenanceCompiledPrompt: false,
      provenanceRequestMeta: true,
      provenanceEvaluation: false,
      provenanceCheckpoint: true,
      artifactManifest: false,
      artifactFullSources: false,
    });
  });

  it('turns on the data-driven sections only when their data exists', () => {
    const input = runInput({
      result: result({
        thinkingTurns: [turn()],
        liveTrace: [
          { id: 'tr-1', at: '2024-05-30T12:00:01.000Z', kind: 'run_started', label: 'Run started' },
        ],
        evaluationSummary: agg(),
      }),
      code: '<html></html>',
    });
    const o = getDefaultDesignDebugExportOptions(input);
    expect(o.thinking).toBe(true);
    expect(o.runTrace).toBe(true);
    expect(o.evaluationFromResult).toBe(true);
    expect(o.artifactManifest).toBe(true);
    // Assistant text is large and stays opt-in even by default.
    expect(o.assistantOutput).toBe(false);
    expect(o.artifactFullSources).toBe(false);
    expect(o.provenanceCompiledPrompt).toBe(false);
    expect(o.provenanceEvaluation).toBe(false);
  });

  it('treats whitespace-only code as no artifact but counts an all-whitespace file value as a file', () => {
    const whitespaceCode = getDefaultDesignDebugExportOptions(runInput({ code: '   \n  ' }));
    expect(whitespaceCode.artifactManifest).toBe(false);

    const whitespaceFile = getDefaultDesignDebugExportOptions(
      runInput({ files: { 'blank.txt': '   ' } }),
    );
    expect(whitespaceFile.artifactManifest).toBe(true);
  });

  it('counts evaluation that exists only in provenance rounds', () => {
    const o = getDefaultDesignDebugExportOptions(
      runInput({ provenance: provenance({ evaluation: { rounds: [round(1)], finalAggregate: agg() } }) }),
    );
    expect(o.evaluationFromResult).toBe(true);
  });

  it('does not count an empty provenance rounds array as evaluation', () => {
    const o = getDefaultDesignDebugExportOptions(
      runInput({ provenance: provenance({ evaluation: { rounds: [], finalAggregate: agg() } }) }),
    );
    expect(o.evaluationFromResult).toBe(false);
  });
});

describe('buildDesignDebugExportOptionsFromPreset', () => {
  it('balanced is exactly the default option bag', () => {
    const input = fullyPopulatedRun();
    expect(buildDesignDebugExportOptionsFromPreset(input, 'balanced')).toEqual(
      getDefaultDesignDebugExportOptions(input),
    );
  });

  it('quick omits thinking, trace, assistant text and the heavy provenance blocks', () => {
    expect(buildDesignDebugExportOptionsFromPreset(fullyPopulatedRun(), 'quick')).toEqual({
      runSummary: true,
      strategySnapshot: true,
      progressHarness: true,
      thinking: false,
      assistantOutput: false,
      runTrace: false,
      evaluationFromResult: true,
      provenanceHypothesisSnapshot: true,
      provenanceDesignSystem: false,
      provenanceCompiledPrompt: false,
      provenanceRequestMeta: true,
      provenanceEvaluation: false,
      provenanceCheckpoint: false,
      artifactManifest: true,
      artifactFullSources: false,
    });
  });

  it('full includes artifact sources, checkpoint, compiled prompt and assistant text for a populated run', () => {
    expect(buildDesignDebugExportOptionsFromPreset(fullyPopulatedRun(), 'full')).toEqual({
      runSummary: true,
      strategySnapshot: true,
      progressHarness: true,
      thinking: true,
      assistantOutput: true,
      runTrace: true,
      evaluationFromResult: true,
      provenanceHypothesisSnapshot: true,
      provenanceDesignSystem: true,
      provenanceCompiledPrompt: true,
      provenanceRequestMeta: true,
      provenanceEvaluation: false,
      provenanceCheckpoint: true,
      artifactManifest: true,
      artifactFullSources: true,
    });
  });

  it('keeps the design-system, compiled-prompt and checkpoint flags off in quick but on in full for a bare result', () => {
    const shared = {
      runSummary: true,
      strategySnapshot: true,
      progressHarness: true,
      thinking: false,
      assistantOutput: false,
      runTrace: false,
      evaluationFromResult: false,
      provenanceHypothesisSnapshot: true,
      provenanceRequestMeta: true,
      provenanceEvaluation: false,
      artifactManifest: false,
      artifactFullSources: false,
    };
    expect(buildDesignDebugExportOptionsFromPreset(runInput(), 'quick')).toEqual({
      ...shared,
      provenanceDesignSystem: false,
      provenanceCompiledPrompt: false,
      provenanceCheckpoint: false,
    });
    expect(buildDesignDebugExportOptionsFromPreset(runInput(), 'full')).toEqual({
      ...shared,
      provenanceDesignSystem: true,
      provenanceCompiledPrompt: true,
      provenanceCheckpoint: true,
    });
  });

  it('full treats a turn map with only empty text as assistant text but ignores a whitespace-only activity log', () => {
    const emptyTurnText = buildDesignDebugExportOptionsFromPreset(
      runInput({ result: result({ activityByTurn: { 1: '' } }) }),
      'full',
    );
    expect(emptyTurnText.assistantOutput).toBe(true);

    const blankLog = buildDesignDebugExportOptionsFromPreset(
      runInput({ result: result({ activityLog: ['', '   '] }) }),
      'full',
    );
    expect(blankLog.assistantOutput).toBe(false);

    const realLog = buildDesignDebugExportOptionsFromPreset(
      runInput({ result: result({ activityLog: ['  real text  '] }) }),
      'full',
    );
    expect(realLog.assistantOutput).toBe(true);
  });
});

describe('mergeDesignDebugExportOptions', () => {
  it('overrides only the patched keys', () => {
    const base = getDefaultDesignDebugExportOptions(runInput());
    const merged = mergeDesignDebugExportOptions(base, { thinking: true, artifactFullSources: true });
    expect(merged).toEqual({ ...base, thinking: true, artifactFullSources: true });
    expect(merged.runTrace).toBe(false);
  });

  it('returns an equal but distinct copy for an empty patch', () => {
    const base = getDefaultDesignDebugExportOptions(runInput());
    const merged = mergeDesignDebugExportOptions(base, {});
    expect(merged).toEqual(base);
    expect(merged).not.toBe(base);
  });
});

// ---------------------------------------------------------------------------
// buildDesignRunDebugMarkdown — document structure
// ---------------------------------------------------------------------------

describe('buildDesignRunDebugMarkdown — document structure', () => {
  it('emits every section in a fixed order for a fully populated run', () => {
    const md = buildDesignRunDebugMarkdown(fullyPopulatedRun(), ALL_ON);

    expect(md.startsWith(
      '# Design run debug: Checkout redesign v2!\n\n_Exported 2024-06-01T00:00:00.000Z (ISO)._\n\n',
    )).toBe(true);

    expectDocumentOrder(md, [
      '**Result id:** `res-9`',
      '## Strategy snapshot (compiler store, if provided)',
      '## Progress & harness',
      '## Thinking (per PI turn)',
      '## Assistant output (streamed)',
      '## Run trace (structured)',
      '## Evaluation (generation result)',
      '### Latest evaluation summary (result store)',
      '## Provenance (IndexedDB)',
      '## Generated artifacts',
    ]);

    expect(md.endsWith(
      '\n<!-- export: design slug=checkout-redesign-v2 result=res-9 run=4 -->\n',
    )).toBe(true);
  });

  it('separates sections with --- and puts no separator before the strategy snapshot', () => {
    const md = buildDesignRunDebugMarkdown(fullyPopulatedRun(), ALL_ON);
    expect(md).toContain('**Duration ms:** 1234\n\n## Strategy snapshot (compiler store, if provided)');
    expect(md).not.toContain('---\n\n## Strategy snapshot (compiler store, if provided)');
    expect(md).toContain('\n\n---\n\n## Progress & harness');
    expect(md).toContain('\n\n---\n\n## Thinking (per PI turn)');
    expect(md).toContain('\n\n---\n\n## Run trace (structured)');
    expect(md).toContain('\n\n---\n\n## Provenance (IndexedDB)');
    expect(md).toContain('\n\n---\n\n## Generated artifacts');
  });

  it('emits only the generated-artifacts section when every option is off', () => {
    const input = runInput({ previewName: 'X' });
    const md = buildDesignRunDebugMarkdown(input, ALL_OFF);

    expect(md).toBe(
      '# Design run debug: X\n\n' +
        '_Exported 2024-06-01T00:00:00.000Z (ISO)._\n\n' +
        '\n\n---\n\n## Generated artifacts\n\n' +
        '_No code or file map loaded — run may still be in progress or artifacts were GC’d._\n' +
        '\n<!-- export: design slug=x result=res-1 run=1 -->\n',
    );
    expect(md).not.toContain('## Run summary');
    expect(md).not.toContain('## Strategy snapshot');
    expect(md).not.toContain('## Progress & harness');
    expect(md).not.toContain('## Thinking');
    expect(md).not.toContain('## Assistant output');
    expect(md).not.toContain('## Run trace');
    expect(md).not.toContain('## Evaluation');
    expect(md).not.toContain('## Provenance');
  });

  it('omits sections whose option flag is off but data is present', () => {
    const md = buildDesignRunDebugMarkdown(fullyPopulatedRun(), {
      thinking: false,
      assistantOutput: false,
      runTrace: false,
    });
    expect(md).not.toContain('## Thinking (per PI turn)');
    expect(md).not.toContain('### Turn 1');
    expect(md).not.toContain('## Assistant output (streamed)');
    expect(md).not.toContain('Working on the hero.');
    expect(md).not.toContain('## Run trace (structured)');
    expect(md).not.toContain('- `2024-05-30T12:00:02.000Z` **tool_started** (turn 2)');
    // Still-present neighbours prove the section list is option-driven, not empty.
    expect(md).toContain('## Progress & harness');
    expect(md).toContain('## Generated artifacts');
  });

  it('notes that provenance is missing instead of silently dropping the section', () => {
    const md = buildDesignRunDebugMarkdown(runInput(), {
      provenanceHypothesisSnapshot: true,
      provenanceDesignSystem: false,
      provenanceCompiledPrompt: false,
      provenanceRequestMeta: false,
      provenanceEvaluation: false,
      provenanceCheckpoint: false,
    });
    expect(md).toContain(
      '## Provenance (IndexedDB)\n\n_No provenance snapshot in IndexedDB for this result id._\n',
    );
  });

  it('omits the provenance section entirely when every provenance flag is off', () => {
    const md = buildDesignRunDebugMarkdown(runInput(), {
      provenanceHypothesisSnapshot: false,
      provenanceDesignSystem: false,
      provenanceCompiledPrompt: false,
      provenanceRequestMeta: false,
      provenanceEvaluation: false,
      provenanceCheckpoint: false,
    });
    expect(md).not.toContain('## Provenance (IndexedDB)');
    expect(md).not.toContain('_No provenance snapshot in IndexedDB for this result id._');
  });

  it('keeps exportedAt and the slug out of the section body (footer uses the slug only)', () => {
    const md = buildDesignRunDebugMarkdown(runInput({ previewName: '  My *** Preview  ' }), ALL_OFF);
    expect(md).toContain('# Design run debug:   My *** Preview  \n');
    expect(md.endsWith('<!-- export: design slug=my-preview result=res-1 run=1 -->\n')).toBe(true);
  });

  it('strips non-ASCII characters from the slug rather than transliterating', () => {
    const md = buildDesignRunDebugMarkdown(runInput({ previewName: 'Café Déjà' }), ALL_OFF);
    expect(md.endsWith('<!-- export: design slug=caf-d-j result=res-1 run=1 -->\n')).toBe(true);
  });

  it('produces identical output regardless of the key insertion order of the file map', () => {
    const a = runInput({ files: { 'a.ts': '1', 'm/n.ts': '2', 'z.ts': '3' } });
    const b = runInput({ files: { 'z.ts': '3', 'a.ts': '1', 'm/n.ts': '2' } });
    expect(buildDesignRunDebugMarkdown(a, ALL_ON)).toBe(buildDesignRunDebugMarkdown(b, ALL_ON));
  });
});

// ---------------------------------------------------------------------------
// buildDesignRunDebugMarkdown — run summary
// ---------------------------------------------------------------------------

describe('buildDesignRunDebugMarkdown — run summary', () => {
  it('emits the identity lines, with preview node id first, when present', () => {
    const md = buildDesignRunDebugMarkdown(fullyPopulatedRun(), { runSummary: true });
    expect(md).toContain(
      '**Preview node id:** `pnode-9`\n' +
        '**Strategy / hypothesis name:** Bold layout\n' +
        '**Result id:** `res-9`\n' +
        '**Strategy id:** `strat-1`\n' +
        '**Status:** complete\n' +
        '**Run:** v4 (`run-1`)\n' +
        `**Provider / model:** openrouter / ${DEFAULT_MODEL_ID}\n` +
        '**Completed:** 2024-05-30T12:05:00.000Z\n' +
        '**Duration ms:** 1234\n',
    );
    expect(md).not.toContain('**Error:**');
  });

  it('omits the preview node id line when the node id is undefined', () => {
    const md = buildDesignRunDebugMarkdown(runInput(), { runSummary: true });
    expect(md).not.toContain('**Preview node id:**');
    expect(md).toContain('**Strategy / hypothesis name:** —\n');
  });

  it('emits duration 0 but omits an undefined duration', () => {
    const zero = buildDesignRunDebugMarkdown(
      runInput({ result: result({ metadata: { model: DEFAULT_MODEL_ID, durationMs: 0 } }) }),
      { runSummary: true },
    );
    expect(zero).toContain('**Duration ms:** 0\n');

    const missing = buildDesignRunDebugMarkdown(runInput(), { runSummary: true });
    expect(missing).not.toContain('**Duration ms:**');
  });

  it('prints the untruncated error in the run summary but truncates it in the results index', () => {
    const longError = 'E'.repeat(200);
    const md = buildDesignRunDebugMarkdown(
      runInput({ result: result({ error: longError }) }),
      { runSummary: true },
    );
    expect(md).toContain(`\n**Error:** ${longError}\n`);
  });
});

// ---------------------------------------------------------------------------
// buildDesignRunDebugMarkdown — progress, thinking, assistant text, trace
// ---------------------------------------------------------------------------

describe('buildDesignRunDebugMarkdown — progress & harness', () => {
  it('emits the state lines, task list and file plan', () => {
    const md = buildDesignRunDebugMarkdown(fullyPopulatedRun(), { progressHarness: true });
    expect(md).toContain(
      '## Progress & harness\n\n' +
        '- **agenticPhase:** complete\n' +
        '- **evaluationStatus:** done\n' +
        '- **progressMessage:** Wrapping up\n' +
        '- **activeTool:** write_file `index.html`\n\n' +
        '### Task list (last known)\n' +
        '- **completed** — Build hero (`t1`)\n\n' +
        '### File plan\n' +
        '- `index.html`\n- `styles/main.css`\n',
    );
  });

  it('falls back to em dashes and leaves a trailing space when no tool path is known', () => {
    const md = buildDesignRunDebugMarkdown(
      runInput({ result: result({ activeToolName: 'write_file' }) }),
      { progressHarness: true },
    );
    expect(md).toContain(
      '- **agenticPhase:** —\n- **evaluationStatus:** —\n- **progressMessage:** —\n- **activeTool:** write_file \n',
    );
  });

  it('emits _None._ for empty task list and file plan', () => {
    const md = buildDesignRunDebugMarkdown(
      runInput({ result: result({ liveTodos: [], liveFilesPlan: [] }) }),
      { progressHarness: true },
    );
    // formatTodos already ends its "_None._" with a newline, so the empty case
    // leaves two blank lines before the next heading (the populated case has one).
    expect(md).toContain('### Task list (last known)\n_None._\n\n\n### File plan\n_None._');
  });
});

describe('buildDesignRunDebugMarkdown — thinking turns', () => {
  it('emits per-turn ISO timestamps and a text fence', () => {
    const md = buildDesignRunDebugMarkdown(fullyPopulatedRun(), { thinking: true });
    expect(md).toContain(
      '## Thinking (per PI turn)\n\n' +
        '### Turn 1\n\n' +
        '- **started:** 2024-05-30T12:00:00.000Z\n' +
        '- **ended:** 2024-05-30T12:00:05.000Z\n\n' +
        '```text\nweighing options\n```\n',
    );
  });

  it('marks an open turn as in progress and an empty body as (empty)', () => {
    const md = buildDesignRunDebugMarkdown(
      runInput({
        result: result({
          thinkingTurns: [turn({ turnId: 2, text: '   ', endedAt: undefined })],
        }),
      }),
      { thinking: true },
    );
    expect(md).toContain('### Turn 2\n\n- **started:** 2024-05-30T12:00:00.000Z\n- **ended:** _in progress / unknown_');
    expect(md).toContain('```text\n(empty)\n```');
  });

  it('renders endedAt 0 as the epoch rather than as unknown', () => {
    const md = buildDesignRunDebugMarkdown(
      runInput({ result: result({ thinkingTurns: [turn({ startedAt: 0, endedAt: 0 })] }) }),
      { thinking: true },
    );
    expect(md).toContain('- **started:** 1970-01-01T00:00:00.000Z\n- **ended:** 1970-01-01T00:00:00.000Z');
  });

  it('emits _None._ when there are no thinking turns', () => {
    const md = buildDesignRunDebugMarkdown(runInput(), { thinking: true });
    expect(md).toContain('## Thinking (per PI turn)\n\n_None._\n');
  });
});

describe('buildDesignRunDebugMarkdown — assistant output', () => {
  it('emits one fenced block per turn, numbered by turn id', () => {
    const md = buildDesignRunDebugMarkdown(
      runInput({ result: result({ activityByTurn: { 1: 'first', 2: 'second' } }) }),
      { assistantOutput: true },
    );
    expect(md).toContain(
      '## Assistant output (streamed)\n\n' +
        '### Assistant text (turn 1)\n\n```markdown\nfirst\n```\n' +
        '### Assistant text (turn 2)\n\n```markdown\nsecond\n```\n',
    );
    expect(md).not.toContain('### Assistant text (combined)');
  });

  it('sorts fractional turn keys numerically, not by insertion or key order', () => {
    const md = buildDesignRunDebugMarkdown(
      runInput({ result: result({ activityByTurn: { 10.5: 'late', 2.5: 'early' } }) }),
      { assistantOutput: true },
    );
    expect(md.indexOf('### Assistant text (turn 2.5)')).toBeLessThan(
      md.indexOf('### Assistant text (turn 10.5)'),
    );
  });

  it('falls back to the activity log concatenated with no separator', () => {
    const md = buildDesignRunDebugMarkdown(
      runInput({ result: result({ activityByTurn: {}, activityLog: ['alpha', 'beta'] }) }),
      { assistantOutput: true },
    );
    expect(md).toContain('### Assistant text (combined)\n\n```markdown\nalphabeta\n```');
    expect(md).not.toContain('### Assistant text (turn');
  });

  it('emits _None._ for an empty turn map and a whitespace-only activity log', () => {
    const md = buildDesignRunDebugMarkdown(
      runInput({ result: result({ activityByTurn: {}, activityLog: [' ', '\n'] }) }),
      { assistantOutput: true },
    );
    expect(md).toContain('## Assistant output (streamed)\n\n_None._\n');
  });
});

describe('buildDesignRunDebugMarkdown — run trace', () => {
  it('emits one bullet per event with timestamp, kind, optional turn and label', () => {
    const md = buildDesignRunDebugMarkdown(fullyPopulatedRun(), { runTrace: true });
    expect(md).toContain(
      '## Run trace (structured)\n\n' +
        '- `2024-05-30T12:00:01.000Z` **run_started** — Run started\n' +
        '- `2024-05-30T12:00:02.000Z` **tool_started** (turn 2) — write_file index.html\n',
    );
  });

  it('includes turn 0 because the check is for a non-null turn id', () => {
    const md = buildDesignRunDebugMarkdown(
      runInput({
        result: result({
          liveTrace: [
            { id: 'tr-1', at: '2024-05-30T12:00:01.000Z', kind: 'phase', label: 'building', turnId: 0 },
          ],
        }),
      }),
      { runTrace: true },
    );
    expect(md).toContain('- `2024-05-30T12:00:01.000Z` **phase** (turn 0) — building\n');
  });

  it('emits _None._ when the trace is empty', () => {
    const md = buildDesignRunDebugMarkdown(runInput({ result: result({ liveTrace: [] }) }), {
      runTrace: true,
    });
    expect(md).toContain('## Run trace (structured)\n\n_None._\n');
  });
});

// ---------------------------------------------------------------------------
// buildDesignRunDebugMarkdown — evaluation
// ---------------------------------------------------------------------------

describe('buildDesignRunDebugMarkdown — evaluation', () => {
  it('emits the four rubric headings in fixed order after the aggregate', () => {
    const md = buildDesignRunDebugMarkdown(fullyPopulatedRun(), { evaluationFromResult: true });
    expectDocumentOrder(md, [
      '### Round 1',
      '#### Aggregate',
      '#### Design rubric',
      '#### Strategy rubric',
      '#### Implementation rubric',
      '#### Browser rubric',
    ]);
  });

  it('numbers rounds from the snapshot, not from the array index', () => {
    const md = buildDesignRunDebugMarkdown(
      runInput({ result: result({ evaluationRounds: [round(3), round(1)] }) }),
      { evaluationFromResult: true },
    );
    expectDocumentOrder(md, ['### Round 3', '### Round 1']);
  });

  it('formats the aggregate block including fixed prioritized fixes and merged hard fails', () => {
    const md = buildDesignRunDebugMarkdown(fullyPopulatedRun(), { evaluationFromResult: true });
    expect(md).toContain(
      '#### Aggregate\n\n' +
        '- **overallScore:** 4.2\n' +
        '- **shouldRevise:** true\n' +
        '- **prioritizedFixes:** `fix contrast`\n\n' +
        '**Normalized scores:**\n' +
        '- design: 0.9\n\n' +
        '**Merged hard fails:**\n- (browser) `a11y_contrast` Contrast below 4.5\n\n' +
        '```text\nRaise contrast\n```\n',
    );
  });

  it('falls back to em dash and placeholder text for an empty aggregate', () => {
    const md = buildDesignRunDebugMarkdown(
      runInput({ result: result({ evaluationRounds: [round(1)] }) }),
      { evaluationFromResult: true },
    );
    expect(md).toContain('- **prioritizedFixes:** —\n');
    expect(md).toContain('_No merged hard fails._');
    expect(md).toContain('_No revision brief._');
  });

  it('emits scores, findings and hard fails for a worker report', () => {
    const md = buildDesignRunDebugMarkdown(fullyPopulatedRun(), { evaluationFromResult: true });
    expect(md).toContain(
      '#### Design rubric\n\n' +
        '**Rubric:** design\n\n' +
        '- **clarity:** 4 — Clear hero\n\n' +
        '**Findings:**\n' +
        '- (high) Missing CTA: No button\n\n' +
        '**Hard fails:**\n' +
        '- `a11y_contrast` Contrast below 4.5\n',
    );
  });

  it('emits _No <rubric> report._ for the three rubrics that have no report', () => {
    const md = buildDesignRunDebugMarkdown(
      runInput({ result: result({ evaluationRounds: [round(1)] }) }),
      { evaluationFromResult: true },
    );
    expect(md).toContain('#### Design rubric\n\n_No design report._');
    expect(md).toContain('#### Strategy rubric\n\n_No strategy report._');
    expect(md).toContain('#### Implementation rubric\n\n_No implementation report._');
    expect(md).toContain('#### Browser rubric\n\n_No browser report._');
  });

  it('emits _No rubric detail._ for a report with no scores, findings or hard fails', () => {
    const md = buildDesignRunDebugMarkdown(
      runInput({ result: result({ evaluationRounds: [round(1, { design: worker() })] }) }),
      { evaluationFromResult: true },
    );
    expect(md).toContain('#### Design rubric\n\n**Rubric:** design\n\n_No rubric detail._');
  });

  it('notes a skipped playwright rubric inside the worker block', () => {
    const md = buildDesignRunDebugMarkdown(
      runInput({
        result: result({
          evaluationRounds: [
            round(1, {
              browser: worker({
                rubric: 'browser',
                playwrightSkipped: { reason: 'browser_unavailable', message: 'Chromium missing' },
              }),
            }),
          ],
        }),
      }),
      { evaluationFromResult: true },
    );
    expect(md).toContain(
      '\n\n_Playwright skipped: browser_unavailable — Chromium missing_\n',
    );
  });

  it('emits normalized scores in insertion order rather than sorted by key', () => {
    const first = buildDesignRunDebugMarkdown(
      runInput({
        result: result({ evaluationSummary: agg({ normalizedScores: { zeta: 1, alpha: 2 } }) }),
      }),
      { evaluationFromResult: true },
    );
    const second = buildDesignRunDebugMarkdown(
      runInput({
        result: result({ evaluationSummary: agg({ normalizedScores: { alpha: 2, zeta: 1 } }) }),
      }),
      { evaluationFromResult: true },
    );
    expect(first).toContain('**Normalized scores:**\n- zeta: 1\n- alpha: 2');
    expect(second).toContain('**Normalized scores:**\n- alpha: 2\n- zeta: 1');
    expect(first).not.toBe(second);
  });

  it('never emits the raw evaluator trace or browser screenshot payloads', () => {
    const md = buildDesignRunDebugMarkdown(
      runInput({
        result: result({
          evaluationRounds: [
            round(1, {
              browser: worker({
                rubric: 'browser',
                rawTrace: 'RAW EVALUATOR RESPONSE',
                artifacts: { browserScreenshot: { mediaType: 'image/jpeg', base64: 'BASE64PAYLOAD' } },
              }),
            }),
          ],
        }),
      }),
      { evaluationFromResult: true },
    );
    expect(md).toContain('#### Browser rubric');
    expect(md).not.toContain('RAW EVALUATOR RESPONSE');
    expect(md).not.toContain('BASE64PAYLOAD');
  });

  it('emits _None._ when no rounds are available', () => {
    const md = buildDesignRunDebugMarkdown(runInput(), { evaluationFromResult: true });
    expect(md).toContain('## Evaluation (generation result)\n\n_None._\n');
  });

  it('falls back to provenance rounds when the result has none', () => {
    const md = buildDesignRunDebugMarkdown(
      runInput({
        result: result({ evaluationRounds: [] }),
        provenance: provenance({ evaluation: { rounds: [round(7)], finalAggregate: agg() } }),
      }),
      { evaluationFromResult: true },
    );
    expect(md).toContain('### Round 7');
    expect(md).not.toContain('## Evaluation (generation result)\n\n_None._');
  });

  it('omits the evaluation section entirely when evaluationFromResult is off', () => {
    const md = buildDesignRunDebugMarkdown(fullyPopulatedRun(), { evaluationFromResult: false });
    expect(md).not.toContain('## Evaluation (generation result)');
    expect(md).not.toContain('### Latest evaluation summary (result store)');
  });

  it('appends the result-store summary after the rounds section', () => {
    const md = buildDesignRunDebugMarkdown(fullyPopulatedRun(), { evaluationFromResult: true });
    expect(md).toContain('### Latest evaluation summary (result store)\n\n- **overallScore:** 4.4\n');
    expectDocumentOrder(md, [
      '## Evaluation (generation result)',
      '### Latest evaluation summary (result store)',
      '## Generated artifacts',
    ]);
  });

  it('emits the summary even when there are no rounds', () => {
    const md = buildDesignRunDebugMarkdown(
      runInput({ result: result({ evaluationSummary: agg({ overallScore: 2.5 }) }) }),
      { evaluationFromResult: true },
    );
    expect(md).toContain(
      '## Evaluation (generation result)\n\n_None._\n\n### Latest evaluation summary (result store)\n\n- **overallScore:** 2.5\n',
    );
  });
});

// ---------------------------------------------------------------------------
// buildDesignRunDebugMarkdown — provenance
// ---------------------------------------------------------------------------

describe('buildDesignRunDebugMarkdown — provenance', () => {
  it('emits every provenance subsection in a fixed order', () => {
    const md = buildDesignRunDebugMarkdown(fullyPopulatedRun(), {
      provenanceHypothesisSnapshot: true,
      provenanceDesignSystem: true,
      provenanceCompiledPrompt: true,
      provenanceRequestMeta: true,
      provenanceEvaluation: true,
      provenanceCheckpoint: true,
      // Result carries rounds, so provenance's own copy is suppressed by design.
      evaluationFromResult: true,
    });
    expectDocumentOrder(md, [
      '### Compile-time hypothesis snapshot',
      '### Design system snapshot (compile)',
      '### Full compiled prompt (as sent)',
      '### Request metadata',
      '### Agentic checkpoint',
    ]);
    expect(md).toContain('"boldness": "high"');
    expect(md).toContain('### Design system snapshot (compile)\n\n```markdown\n# DS\n\nPrimary #123456\n```');
    expect(md).toContain('### Full compiled prompt (as sent)\n\n```markdown\n# Prompt\n\nbuild the page\n```');
    expect(md).toContain(
      '### Request metadata\n\n- **provider:** openrouter\n' +
        `- **model:** ${DEFAULT_MODEL_ID}\n` +
        '- **timestamp:** 2024-05-30T12:00:00.000Z\n',
    );
    expect(md).toContain('### Agentic checkpoint\n\n```json\n{\n  "totalRounds": 2,');
  });

  it('does not repeat provenance evaluation when the result already has rounds', () => {
    const md = buildDesignRunDebugMarkdown(fullyPopulatedRun(), {
      provenanceEvaluation: true,
      evaluationFromResult: true,
    });
    expect(md).toContain(
      '_Evaluation details are included via **Evaluation** from the generation result (not repeated from provenance)._ ',
    );
    expect(md).not.toContain('#### Final aggregate (provenance)');
    expect(md).not.toContain('overallScore:** 4.1');
  });

  it('emits the provenance evaluation when the result has no rounds', () => {
    const md = buildDesignRunDebugMarkdown(
      runInput({
        result: result({ evaluationRounds: [] }),
        provenance: provenance({ evaluation: { rounds: [round(2)], finalAggregate: agg({ overallScore: 4.1 }) } }),
      }),
      { provenanceEvaluation: true },
    );
    expect(md).toContain('### Evaluation (persisted in provenance)');
    expect(md).toContain('#### Final aggregate (provenance)\n\n- **overallScore:** 4.1');
    expect(md).not.toContain('not repeated from provenance');
  });

  it('emits nothing for provenance evaluation when neither result nor provenance has one', () => {
    const md = buildDesignRunDebugMarkdown(runInput({ provenance: provenance() }), {
      provenanceEvaluation: true,
    });
    expect(md).not.toContain('### Evaluation (persisted in provenance)');
    expect(md).not.toContain('#### Final aggregate (provenance)');
    expect(md).not.toContain('not repeated from provenance');
  });

  it('notes missing design system text and missing checkpoint separately', () => {
    const md = buildDesignRunDebugMarkdown(runInput({ provenance: provenance() }), {
      provenanceDesignSystem: true,
      provenanceCheckpoint: true,
    });
    expect(md).toContain('### Design system snapshot (compile)\n\n_No design system text in provenance._');
    expect(md).toContain('### Agentic checkpoint\n\n_No checkpoint in provenance._');
  });

  it('treats a whitespace-only design system snapshot as missing', () => {
    const md = buildDesignRunDebugMarkdown(
      runInput({ provenance: provenance({ designSystemSnapshot: '   \n ' }) }),
      { provenanceDesignSystem: true },
    );
    expect(md).toContain('_No design system text in provenance._');
    expect(md).not.toContain('```markdown\n   \n ```');
  });

  it('omits subsections whose individual flag is off', () => {
    const md = buildDesignRunDebugMarkdown(fullyPopulatedRun(), {
      provenanceHypothesisSnapshot: false,
      provenanceDesignSystem: false,
      provenanceCompiledPrompt: false,
      provenanceRequestMeta: false,
      provenanceEvaluation: false,
      provenanceCheckpoint: true,
    });
    expect(md).not.toContain('### Compile-time hypothesis snapshot');
    expect(md).not.toContain('### Design system snapshot (compile)');
    expect(md).not.toContain('### Full compiled prompt (as sent)');
    expect(md).not.toContain('### Request metadata');
    expect(md).not.toContain('### Evaluation (persisted in provenance)');
    expect(md).toContain('### Agentic checkpoint');
  });
});

// ---------------------------------------------------------------------------
// buildDesignRunDebugMarkdown — generated artifacts
// ---------------------------------------------------------------------------

describe('buildDesignRunDebugMarkdown — generated artifacts', () => {
  it('emits a path-sorted manifest with byte counts and separately fenced file contents', () => {
    const md = buildDesignRunDebugMarkdown(fullyPopulatedRun(), {
      artifactManifest: true,
      artifactFullSources: true,
    });
    expect(md).toContain(
      '## Generated artifacts\n\n### File manifest\n\n' +
        '| Path | Bytes |\n|------|-------|\n' +
        '| `README.md` | 7 |\n' +
        '| `index.html` | 28 |\n' +
        '| `styles/main.css` | 20 |\n\n' +
        '### File contents\n\n' +
        '### `README.md`\n\n```md\n# Notes\n```\n' +
        '### `index.html`\n\n```html\n<html><body>hi</body></html>\n```\n' +
        '### `styles/main.css`\n\n```css\nbody { color: red; }\n```\n',
    );
  });

  it('emits only the manifest when full sources are off, and only contents when the manifest is off', () => {
    const manifestOnly = buildDesignRunDebugMarkdown(fullyPopulatedRun(), {
      artifactManifest: true,
      artifactFullSources: false,
    });
    expect(manifestOnly).toContain('### File manifest');
    expect(manifestOnly).not.toContain('### File contents');

    const contentsOnly = buildDesignRunDebugMarkdown(fullyPopulatedRun(), {
      artifactManifest: false,
      artifactFullSources: true,
    });
    expect(contentsOnly).not.toContain('### File manifest');
    expect(contentsOnly).toContain('### File contents\n\n### `README.md`');
  });

  it('describes a single-file HTML run by size and by source', () => {
    const md = buildDesignRunDebugMarkdown(
      runInput({ code: '<html>single</html>' }),
      { artifactManifest: true, artifactFullSources: true },
    );
    expect(md).toContain(
      '## Generated artifacts\n\n### Single-file HTML\n\n- **bytes:** 19\n\n' +
        '### HTML source\n\n```html\n<html>single</html>\n```\n',
    );
  });

  it('trims surrounding whitespace from a single-file HTML artifact', () => {
    const md = buildDesignRunDebugMarkdown(
      runInput({ code: '\n  <html>x</html>  \n' }),
      { artifactManifest: true, artifactFullSources: true },
    );
    expect(md).toContain('### HTML source\n\n```html\n<html>x</html>\n```');
    expect(md).not.toContain('  <html>x</html>');
  });

  it('prefers the multi-file map over a single-file code string', () => {
    const md = buildDesignRunDebugMarkdown(fullyPopulatedRun(), {
      artifactManifest: true,
      artifactFullSources: true,
    });
    expect(md).toContain('### File manifest');
    expect(md).not.toContain('### Single-file HTML');
    expect(md).not.toContain('### HTML source');
    expect(md).not.toContain('<html>single</html>');
  });

  it('reports omitted or missing artifacts instead of an empty section', () => {
    const omitted = buildDesignRunDebugMarkdown(fullyPopulatedRun(), {
      artifactManifest: false,
      artifactFullSources: false,
    });
    expect(omitted).toContain('_Artifacts present but omitted (manifest and full sources disabled)._');

    const missing = buildDesignRunDebugMarkdown(runInput(), {
      artifactManifest: true,
      artifactFullSources: true,
    });
    expect(missing).toContain(
      '## Generated artifacts\n\n_No code or file map loaded — run may still be in progress or artifacts were GC’d._\n',
    );
    expect(missing).not.toContain('### File manifest');
  });

  it('treats an empty file map as no artifacts and falls through to the code branch', () => {
    const md = buildDesignRunDebugMarkdown(
      runInput({ files: {}, code: '<html>fallback</html>' }),
      { artifactManifest: true, artifactFullSources: true },
    );
    expect(md).not.toContain('### File manifest');
    expect(md).toContain('### Single-file HTML\n\n- **bytes:** 21');
    expect(md).toContain('```html\n<html>fallback</html>\n```');
  });

  it('emits an empty file value as a zero-count row and an empty fence', () => {
    const md = buildDesignRunDebugMarkdown(runInput({ files: { 'empty.txt': '' } }), {
      artifactManifest: true,
      artifactFullSources: true,
    });
    expect(md).toContain('| `empty.txt` | 0 |');
    expect(md).toContain('### `empty.txt`\n\n```txt\n\n```');
  });

  it('derives the fence language from the last extension, falling back to text', () => {
    const md = buildDesignRunDebugMarkdown(
      runInput({ files: { Makefile: 'all:', 'archive.tar.gz': 'gz', 'trailing.': 'x' } }),
      { artifactFullSources: true },
    );
    expect(md).toContain('### `Makefile`\n\n```text\nall:\n```');
    expect(md).toContain('### `archive.tar.gz`\n\n```gz\ngz\n```');
    expect(md).toContain('### `trailing.`\n\n```\nx\n```');
  });

  it('counts UTF-16 code units under the "Bytes" column, not UTF-8 bytes', () => {
    const emoji = '😀';
    expect(new TextEncoder().encode(emoji).length).toBe(4);
    const md = buildDesignRunDebugMarkdown(
      runInput({ files: { 'emoji.txt': emoji }, code: emoji }),
      { artifactManifest: true },
    );
    expect(md).toContain('| `emoji.txt` | 2 |');
    expect(md).not.toContain('| `emoji.txt` | 4 |');

    const single = buildDesignRunDebugMarkdown(runInput({ code: emoji }), { artifactManifest: true });
    expect(single).toContain('- **bytes:** 2');
  });

  it('widens the fence past any backtick run inside the content', () => {
    const md = buildDesignRunDebugMarkdown(
      runInput({ files: { 'a.txt': '```js\ncode\n```' } }),
      { artifactManifest: true, artifactFullSources: true },
    );
    // Content containing ``` is wrapped in a 4-backtick fence, so the inner
    // fence cannot close it early and corrupt everything after it.
    expect(md).toContain('````txt\n```js\ncode\n```\n````');
  });

  it('widens the fence inside a compiled prompt or thinking text too', () => {
    const md = buildDesignRunDebugMarkdown(
      runInput({
        result: result({ thinkingTurns: [turn({ text: 'before ```\nafter' })] }),
        provenance: provenance({ compiledPrompt: 'prompt with ``` fence' }),
      }),
      { thinking: true, provenanceCompiledPrompt: true },
    );
    expect(md).toContain('````text\nbefore ```\nafter\n````');
    expect(md).toContain('````markdown\nprompt with ``` fence\n````');
  });

  it('keeps a three-backtick fence when the content has no backticks', () => {
    // The common case must stay byte-identical to before.
    const md = buildDesignRunDebugMarkdown(
      runInput({ files: { 'plain.txt': 'no backticks here' } }),
      { artifactManifest: true, artifactFullSources: true },
    );
    expect(md).toContain('```txt\nno backticks here\n```');
    expect(md).not.toContain('````');
  });

  it('escapes a pipe or backtick in a file path so the manifest table holds', () => {
    const md = buildDesignRunDebugMarkdown(
      runInput({ files: { 'a|b.txt': 'x', 'x`y.txt': 'y' } }),
      { artifactManifest: true, artifactFullSources: true },
    );
    // The pipe is escaped, so it renders as a literal inside the cell rather
    // than splitting it into two columns. (A raw `|` here is what silently
    // added a column to every row after it.)
    expect(md).toContain('| `a\\|b.txt` | 1 |');
    expect(md).not.toContain('| `a|b.txt` |');
    // A backtick in a path is escaped so it cannot close the code span early.
    expect(md).toContain('x\\`y.txt');
    expect(md).not.toContain('### `x`y.txt`');
  });
});

// ---------------------------------------------------------------------------
// buildDesignRunDebugMarkdown — empty and malformed input
// ---------------------------------------------------------------------------

describe('buildDesignRunDebugMarkdown — empty and malformed input', () => {
  it('renders a bare result with default options without throwing', () => {
    const md = buildDesignRunDebugMarkdown(runInput());
    expect(md).toContain('# Design run debug: Checkout preview\n');
    expect(md).toContain('## Strategy snapshot (compiler store, if provided)\n\n_Not passed._');
    expect(md).toContain('## Generated artifacts\n\n_No code or file map loaded');
    expect(md).not.toContain('## Thinking (per PI turn)');
    expect(md).not.toContain('## Run trace (structured)');
  });

  it('renders empty arrays as explicit empty markers under every option', () => {
    const md = buildDesignRunDebugMarkdown(
      runInput({
        result: result({
          thinkingTurns: [],
          liveTrace: [],
          liveTodos: [],
          liveFilesPlan: [],
          activityByTurn: {},
          activityLog: [],
          evaluationRounds: [],
        }),
        files: {},
      }),
      ALL_ON,
    );
    expect(md).toContain('## Thinking (per PI turn)\n\n_None._');
    expect(md).toContain('## Run trace (structured)\n\n_None._');
    expect(md).toContain('## Assistant output (streamed)\n\n_None._');
    expect(md).toContain('## Evaluation (generation result)\n\n_None._');
    expect(md).toContain('### Task list (last known)\n_None._');
    expect(md).toContain('### File plan\n_None._');
    expect(md).not.toContain('### Turn');
    expect(md).not.toContain('### Round');
  });

  it('survives a worker report missing scores, findings and hard fails', () => {
    const malformed = { rubric: 'design' } as unknown as EvaluatorWorkerReport;
    const md = buildDesignRunDebugMarkdown(
      runInput({ result: result({ evaluationRounds: [round(1, { design: malformed })] }) }),
      { evaluationFromResult: true },
    );
    expect(md).toContain('#### Design rubric\n\n**Rubric:** design\n\n_No rubric detail._');
  });

  it('renders a non-numeric turn key as NaN instead of throwing', () => {
    const malformedMap = { notATurn: 'text' } as unknown as Record<number, string>;
    const md = buildDesignRunDebugMarkdown(
      runInput({ result: result({ activityByTurn: malformedMap }) }),
      { assistantOutput: true },
    );
    expect(md).toContain('### Assistant text (turn NaN)\n\n```markdown\n\n```');
  });

  it('renders an undefined model as the string "undefined" in the summary line', () => {
    const malformed = result({ metadata: { model: undefined as unknown as string } });
    const md = buildDesignRunDebugMarkdown(runInput({ result: malformed }), { runSummary: true });
    expect(md).toContain('**Provider / model:** openrouter / undefined\n');
  });

  /**
   * `designSystemNodeIds` is required by `DomainHypothesis`, but the store
   * migration passes it straight through for legacy records while normalizing
   * its sibling `modelNodeIds`, so a persisted record can reach the export
   * without it. The export must describe such a record, not throw on it.
   */
  it('exports a domain hypothesis whose designSystemNodeIds is missing', () => {
    const legacy = {
      id: 'dh-1',
      incubatorId: 'inc-1',
      strategyId: 'strat-1',
      placeholder: false,
    } as unknown as DomainHypothesis;
    const input = hypothesisInput({
      domainHypothesis: legacy,
      spec: undefined,
    });

    const markdown = buildHypothesisDebugMarkdown(input);

    expect(markdown).toContain('### Design system nodes');
    expect(markdown).toContain('_None._');
    // The rest of the record still renders.
    expect(markdown).toContain('strat-1');
  });
});

// ---------------------------------------------------------------------------
// buildHypothesisDebugMarkdown
// ---------------------------------------------------------------------------

describe('buildHypothesisDebugMarkdown', () => {
  function fullPlan(): IncubationPlan {
    return {
      id: 'plan-1',
      specId: 'spec-1',
      dimensions: [
        { name: 'boldness', range: 'low → high', isConstant: false },
        { name: 'palette', range: 'brand', isConstant: true },
      ],
      hypotheses: [strategy()],
      generatedAt: '2024-05-01T00:00:00.000Z',
      incubatorModel: REASONING_MODEL_ID,
    };
  }

  function fullSpec(): DesignSpec {
    return {
      id: 'spec-1',
      title: 'Checkout spec',
      version: 3,
      createdAt: '2024-04-01T00:00:00.000Z',
      lastModified: '2024-05-01T00:00:00.000Z',
      sections: {
        'design-brief': specSection('design-brief', 'Brief body'),
        'research-context': specSection('research-context', '', [image('img-1')]),
        'objectives-metrics': specSection('objectives-metrics', 'Metrics body'),
        'design-constraints': specSection('design-constraints', 'Constraints body'),
        'design-system': specSection('design-system', 'Legacy design system body'),
        'existing-design': specSection('existing-design', 'Retired existing design body'),
      },
    };
  }

  function fullDomainHypothesis(): DomainHypothesis {
    return {
      id: 'dh-1',
      incubatorId: 'inc-1',
      strategyId: 'strat-1',
      designSystemNodeIds: ['ds-1', 'ds-missing'],
      revisionEnabled: true,
      maxRevisionRounds: 3,
      minOverallScore: null,
      placeholder: false,
    };
  }

  const designSystems: Record<string, DomainDesignSystemContent> = {
    'ds-1': {
      nodeId: 'ds-1',
      title: 'Core DS',
      content: 'primary=#123456',
      images: [image('ds-img')],
    },
  };

  function fullPrompt(): CompiledPrompt {
    return {
      id: 'p1',
      strategyId: 'strat-1',
      specId: 'spec-1',
      prompt: 'PROMPT BODY',
      images: [image('p-img')],
      compiledAt: '2024-05-02T00:00:00.000Z',
    };
  }

  function fullHypothesisExport(): HypothesisDebugExportInput {
    return hypothesisInput({
      canvasTitle: 'Checkout canvas',
      hypothesisNodeId: 'hnode-1',
      strategy: strategy(),
      incubationPlan: fullPlan(),
      domainHypothesis: fullDomainHypothesis(),
      designSystems,
      spec: fullSpec(),
      compiledPromptsForStrategy: [fullPrompt()],
      resultsForStrategy: [
        result({ id: 'r2', runNumber: 2, metadata: { model: REASONING_MODEL_ID }, error: 'boom' }),
        result({ id: 'r1', runNumber: 1 }),
      ],
    });
  }

  it('emits the header, canvas line and section order for a fully populated export', () => {
    const md = buildHypothesisDebugMarkdown(fullHypothesisExport());
    expect(md.startsWith(
      '# Hypothesis debug snapshot: Bold layout\n\n' +
        '_Exported 2024-06-01T00:00:00.000Z (ISO)._\n\n' +
        '**Canvas / library:** Checkout canvas\n' +
        '\n**Hypothesis node id:** `hnode-1`\n' +
        '**Strategy id:** `strat-1`\n',
    )).toBe(true);

    expectDocumentOrder(md, [
      '## Hypothesis strategy (compiler)',
      '## Incubation plan & axes',
      '## Workspace domain bindings',
      '## Design spec (full text)',
      '## Compiled prompts (current store)',
      '## Generation runs (metadata only)',
      '_For per-run traces, thinking stream, and artifacts, use **Download debug** on the preview node after a run._',
      '<!-- export: hypothesis slug=bold-layout strategy=strat-1 -->',
    ]);
    expect(md.endsWith('<!-- export: hypothesis slug=bold-layout strategy=strat-1 -->\n')).toBe(true);
  });

  it('puts no horizontal rule before the first section', () => {
    const md = buildHypothesisDebugMarkdown(fullHypothesisExport());
    expect(md).toContain('**Strategy id:** `strat-1`\n\n## Hypothesis strategy (compiler)');
    expect(md).not.toContain('---\n\n## Hypothesis strategy');
    expect(md).toContain('\n\n---\n\n## Incubation plan & axes');
    expect(md).toContain('\n\n---\n\n## Design spec (full text)');
  });

  it('emits the strategy core with sub-headings and _Empty._ placeholders', () => {
    const md = buildHypothesisDebugMarkdown(fullHypothesisExport());
    expect(md).toContain(
      '## Hypothesis strategy (compiler)\n\n' +
        '- **id:** `strat-1`\n' +
        '- **name:** Bold layout\n\n' +
        '### Hypothesis\nA bold layout converts better.\n\n' +
        '### Rationale\nContrast draws the eye.\n\n' +
        '### Measurements\nCTR on the hero CTA.\n',
    );
  });

  it('renders whitespace-only strategy prose as _Empty._', () => {
    const md = buildHypothesisDebugMarkdown(
      hypothesisInput({ strategy: strategy({ hypothesis: '  ', rationale: '\n', measurements: '' }) }),
    );
    expect(md).toContain('### Hypothesis\n_Empty._\n\n### Rationale\n_Empty._\n\n### Measurements\n_Empty._');
  });

  it('omits the canvas line when canvasTitle is empty', () => {
    const md = buildHypothesisDebugMarkdown(hypothesisInput({ canvasTitle: '' }));
    expect(md).not.toContain('**Canvas / library:**');
  });

  it('renders the incubation plan axes and the hypothesis position JSON', () => {
    const md = buildHypothesisDebugMarkdown(fullHypothesisExport());
    expect(md).toContain(
      '## Incubation plan & axes\n\n' +
        '- **map id:** `plan-1`\n' +
        '- **specId:** `spec-1`\n' +
        `- **incubatorModel:** ${REASONING_MODEL_ID}\n` +
        '- **generatedAt:** 2024-05-01T00:00:00.000Z\n\n' +
        '### Exploration axes\n\n' +
        '- **boldness** (variable): low → high\n' +
        '- **palette** (constant): brand\n\n' +
        '### This hypothesis position\n\n' +
        '```json\n{\n  "boldness": "high"\n}\n```\n',
    );
  });

  it('falls back to a position-only block when no plan matches the strategy', () => {
    const md = buildHypothesisDebugMarkdown(
      hypothesisInput({ strategy: strategy(), incubationPlan: undefined }),
    );
    expect(md).toContain('## Incubation plan & axes\n\n_No incubation plan found for this strategy._');
    expect(md).toContain('### Hypothesis position in exploration map');
    expect(md).not.toContain('### Exploration axes');
    expect(md).not.toContain('### This hypothesis position');
  });

  it('renders the domain bindings, including a missing design system node', () => {
    const md = buildHypothesisDebugMarkdown(fullHypothesisExport());
    expect(md).toContain(
      '## Workspace domain bindings\n\n' +
        '- **hypothesis id:** `dh-1`\n' +
        '- **incubatorId:** `inc-1`\n' +
        '- **strategyId:** `strat-1`\n' +
        '- **revisionEnabled (auto-improve):** true\n' +
        '- **maxRevisionRounds (override):** 3\n' +
        '- **minOverallScore (override):** off\n' +
        '- **placeholder:** false\n\n' +
        '### Design system nodes\n\n' +
        '- **ds-1** — Core DS (15 chars, 1 images)\n' +
        '- **ds-missing** — _missing_\n',
    );
  });

  it('distinguishes an absent override, a null override and a zero override', () => {
    const base = { ...fullDomainHypothesis(), designSystemNodeIds: [] };
    const absent = buildHypothesisDebugMarkdown(
      hypothesisInput({
        domainHypothesis: { ...base, maxRevisionRounds: undefined, minOverallScore: undefined },
      }),
    );
    expect(absent).toContain(
      '- **maxRevisionRounds (override):** _use Settings default_\n' +
        '- **minOverallScore (override):** _use Settings default_',
    );

    const zero = buildHypothesisDebugMarkdown(
      hypothesisInput({ domainHypothesis: { ...base, minOverallScore: 0 } }),
    );
    expect(zero).toContain('- **minOverallScore (override):** 0\n');
    expect(zero).not.toContain('minOverallScore (override):** off');
  });

  it('defaults revisionEnabled to false and lists no design systems as _None._', () => {
    const md = buildHypothesisDebugMarkdown(
      hypothesisInput({
        domainHypothesis: {
          id: 'dh-1',
          incubatorId: 'inc-1',
          strategyId: 'strat-1',
          designSystemNodeIds: [],
          placeholder: true,
        },
      }),
    );
    expect(md).toContain('- **revisionEnabled (auto-improve):** false\n');
    expect(md).toContain('### Design system nodes\n\n_None._');
  });

  it('notes a missing domain hypothesis record', () => {
    const md = buildHypothesisDebugMarkdown(hypothesisInput({ domainHypothesis: undefined }));
    expect(md).toContain(
      '## Workspace domain bindings\n\n_No domain hypothesis record (not linked in workspace domain)._',
    );
  });

  it('lists every spec section in SPEC_SECTIONS order with image and empty markers', () => {
    const md = buildHypothesisDebugMarkdown(fullHypothesisExport());
    expect(md).toContain(
      '## Design spec (full text)\n\n' +
        '- **title:** Checkout spec\n' +
        '- **spec id:** `spec-1`\n' +
        '- **version:** 3\n' +
        '- **lastModified:** 2024-05-01T00:00:00.000Z\n\n' +
        '### Design Brief\n\nBrief body\n\n' +
        '### Research & Context\n\n_(1 reference image(s) omitted from text export)_\n\n_Empty._\n\n' +
        '### Objectives & Metrics\n\nMetrics body\n\n' +
        '### Design Constraints\n\nConstraints body\n\n' +
        '### Design System\n\nLegacy design system body\n',
    );
  });

  it('drops the retired existing-design section from the spec export', () => {
    const md = buildHypothesisDebugMarkdown(fullHypothesisExport());
    expect(md).not.toContain('Retired existing design body');
    expect(md).not.toContain('### Existing design');
  });

  it('emits _Empty._ for every section of an empty spec and notes a missing spec', () => {
    const emptySpec: DesignSpec = {
      id: 'spec-1',
      title: 'Empty spec',
      version: 1,
      createdAt: '2024-04-01T00:00:00.000Z',
      lastModified: '2024-05-01T00:00:00.000Z',
      sections: {},
    };
    const withSpec = buildHypothesisDebugMarkdown(hypothesisInput({ spec: emptySpec }));
    expect(withSpec).toContain('### Design Brief\n\n_Empty._');
    expect(withSpec).toContain('### Design System\n\n_Empty._');

    const withoutSpec = buildHypothesisDebugMarkdown(hypothesisInput({ spec: undefined }));
    expect(withoutSpec).toContain('## Design spec (full text)\n\n_No spec in export._');
    expect(withoutSpec).not.toContain('### Design Brief');
  });

  it('emits compiled prompts in array order with image counts', () => {
    const prompts: CompiledPrompt[] = [
      { id: 'p2', strategyId: 'strat-1', specId: 'spec-1', prompt: 'SECOND', images: [], compiledAt: '2024-05-03T00:00:00.000Z' },
      { id: 'p1', strategyId: 'strat-1', specId: 'spec-1', prompt: 'FIRST', images: [image('i')], compiledAt: '2024-05-02T00:00:00.000Z' },
    ];
    const md = buildHypothesisDebugMarkdown(
      hypothesisInput({ compiledPromptsForStrategy: prompts }),
    );
    expect(md).toContain(
      '## Compiled prompts (current store)\n\n' +
        '### Prompt `p2`\n\n' +
        '- **compiledAt:** 2024-05-03T00:00:00.000Z\n' +
        '- **images:** 0 reference image(s) (metadata only)\n\n' +
        '```markdown\nSECOND\n```\n' +
        '### Prompt `p1`\n\n' +
        '- **compiledAt:** 2024-05-02T00:00:00.000Z\n' +
        '- **images:** 1 reference image(s) (metadata only)\n\n' +
        '```markdown\nFIRST\n```\n',
    );
    expect(md.indexOf('### Prompt `p2`')).toBeLessThan(md.indexOf('### Prompt `p1`'));
  });

  it('notes an empty compiled prompt store', () => {
    const md = buildHypothesisDebugMarkdown(hypothesisInput({ compiledPromptsForStrategy: [] }));
    expect(md).toContain(
      '## Compiled prompts (current store)\n\n_No compiled prompts in store (re-compile to capture)._',
    );
  });

  it('sorts generation rows by run number and truncates the error to 120 characters', () => {
    const longError = 'E'.repeat(150);
    const md = buildHypothesisDebugMarkdown(
      hypothesisInput({
        resultsForStrategy: [
          result({ id: 'r10', runNumber: 10, metadata: { model: REASONING_MODEL_ID } }),
          result({ id: 'r2', runNumber: 2, metadata: { model: REASONING_MODEL_ID } }),
          result({ id: 'r1', runNumber: 1, error: longError }),
        ],
      }),
    );
    expectDocumentOrder(md, [
      `- **v1** — \`r1\` — complete — ${DEFAULT_MODEL_ID} — run \`run-1\` — error: ${'E'.repeat(120)}`,
      `- **v2** — \`r2\` — complete — ${REASONING_MODEL_ID} — run \`run-1\``,
      `- **v10** — \`r10\` — complete — ${REASONING_MODEL_ID} — run \`run-1\``,
    ]);
    expect(md).toContain(`error: ${'E'.repeat(120)}\n`);
    expect(md).not.toContain('E'.repeat(121));
  });

  it('keeps an error of exactly 120 characters intact', () => {
    const exact = 'E'.repeat(120);
    const md = buildHypothesisDebugMarkdown(
      hypothesisInput({ resultsForStrategy: [result({ error: exact })] }),
    );
    expect(md).toContain(`— error: ${exact}\n`);
  });

  it('falls back to the provider id when the run metadata has no model', () => {
    const md = buildHypothesisDebugMarkdown(
      hypothesisInput({
        resultsForStrategy: [
          result({ metadata: { model: undefined as unknown as string }, providerId: 'lmstudio' }),
        ],
      }),
    );
    expect(md).toContain('- **v1** — `res-1` — complete — lmstudio — run `run-1`');
  });

  it('notes an empty results list', () => {
    const md = buildHypothesisDebugMarkdown(hypothesisInput({ resultsForStrategy: [] }));
    expect(md).toContain(
      '## Generation runs (metadata only)\n\n_No generation rows in store for this strategy._',
    );
  });

  it('uses Untitled for the title but the hypothesis slug for the footer when the name is empty', () => {
    const md = buildHypothesisDebugMarkdown(hypothesisInput({ strategy: strategy({ name: '' }) }));
    expect(md.startsWith('# Hypothesis debug snapshot: Untitled\n')).toBe(true);
    expect(md.endsWith('<!-- export: hypothesis slug=hypothesis strategy=strat-1 -->\n')).toBe(true);
  });

  it('slugs a punctuation-heavy strategy name and never emits run/full debug sections', () => {
    const md = buildHypothesisDebugMarkdown(
      hypothesisInput({
        strategy: strategy({ name: '  Bold / Layout: v2!  ' }),
        resultsForStrategy: [result({ evaluationSummary: agg() })],
      }),
    );
    expect(md).toContain('# Hypothesis debug snapshot:   Bold / Layout: v2!  \n');
    expect(md.endsWith('<!-- export: hypothesis slug=bold-layout-v2 strategy=strat-1 -->\n')).toBe(true);
    expect(md).not.toContain('## Thinking (per PI turn)');
    expect(md).not.toContain('## Run trace (structured)');
    expect(md).not.toContain('## Generated artifacts');
    expect(md).not.toContain('## Provenance');
  });
});
