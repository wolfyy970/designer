/**
 * Debug-oriented Markdown snapshots for hypotheses and design runs.
 * Structured for human reading + later diffing in Git or IDE.
 */
import type { CompiledPrompt, DimensionMap, VariantStrategy } from '../types/compiler';
import type { DesignSpec } from '../types/spec';
import { SPEC_SECTIONS } from './constants';
import type {
  AggregatedEvaluationReport,
  EvaluationRoundSnapshot,
  EvaluatorWorkerReport,
} from '../types/evaluation';
import type {
  GenerationResult,
  Provenance,
  RunTraceEvent,
  ThinkingTurnSlice,
  TodoItem,
} from '../types/provider';
import type {
  DomainDesignSystemContent,
  DomainHypothesis,
  DomainModelProfile,
} from '../types/workspace-domain';

const HR = '\n\n---\n\n';

function generationResultHasAssistantText(r: GenerationResult): boolean {
  const byTurn = r.activityByTurn;
  if (byTurn && Object.keys(byTurn).length > 0) return true;
  const log = r.activityLog;
  return !!(log?.length && log.some((s) => String(s).trim().length > 0));
}

export function downloadTextFile(filename: string, text: string, mime = 'text/markdown;charset=utf-8'): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function findDimensionMapForVariant(
  dimensionMaps: Record<string, DimensionMap>,
  variantStrategyId: string,
): DimensionMap | undefined {
  for (const map of Object.values(dimensionMaps)) {
    if (map.variants.some((v) => v.id === variantStrategyId)) return map;
  }
  return undefined;
}

function section(title: string, body: string): string {
  return `## ${title}\n\n${body.trim()}\n`;
}

function fenced(lang: string, content: string): string {
  return '```' + lang + '\n' + content + '\n```\n';
}

function formatTodos(todos: TodoItem[] | undefined): string {
  if (!todos?.length) return '_None._\n';
  return todos
    .map((t) => `- **${t.status}** — ${t.task} (\`${t.id}\`)`)
    .join('\n');
}

function formatTraceEvents(rows: RunTraceEvent[] | undefined): string {
  if (!rows?.length) return '_None._\n';
  return rows
    .map(
      (e) =>
        `- \`${e.at}\` **${e.kind}**${e.turnId != null ? ` (turn ${e.turnId})` : ''} — ${e.label}`,
    )
    .join('\n');
}

function formatThinkingTurns(rows: ThinkingTurnSlice[] | undefined): string {
  if (!rows?.length) return '_None._\n';
  let out = '';
  for (const t of rows) {
    out += `### Turn ${t.turnId}\n\n`;
    out += `- **started:** ${new Date(t.startedAt).toISOString()}\n`;
    out += `- **ended:** ${t.endedAt != null ? new Date(t.endedAt).toISOString() : '_in progress / unknown_'}\n\n`;
    out += fenced('text', t.text.trim() || '(empty)');
  }
  return out;
}

function formatActivityByTurn(map: Record<number, string> | undefined, fallback: string): string {
  if (map && Object.keys(map).length > 0) {
    const keys = Object.keys(map)
      .map(Number)
      .sort((a, b) => a - b);
    let out = '';
    for (const k of keys) {
      out += `### Assistant text (turn ${k})\n\n`;
      out += fenced('markdown', map[k] ?? '');
    }
    return out;
  }
  if (fallback.trim()) {
    return `### Assistant text (combined)\n\n${fenced('markdown', fallback)}`;
  }
  return '_None._\n';
}

function formatEvalCriterionNotes(report: EvaluatorWorkerReport): string {
  const lines: string[] = [];
  for (const [key, v] of Object.entries(report.scores ?? {})) {
    lines.push(`- **${key}:** ${v.score} — ${v.notes}`);
  }
  if (report.findings?.length) {
    lines.push('\n**Findings:**');
    for (const f of report.findings) {
      lines.push(`- (${f.severity}) ${f.summary}: ${f.detail}`);
    }
  }
  if (report.hardFails?.length) {
    lines.push('\n**Hard fails:**');
    for (const h of report.hardFails) {
      lines.push(`- \`${h.code}\` ${h.message}`);
    }
  }
  return lines.join('\n') || '_No rubric detail._';
}

function formatWorkerRubric(label: string, report: EvaluatorWorkerReport | undefined): string {
  if (!report) return `_No ${label} report._\n`;
  let body = `**Rubric:** ${report.rubric}\n\n`;
  body += formatEvalCriterionNotes(report);
  if (report.playwrightSkipped) {
    body += `\n\n_Playwright skipped: ${report.playwrightSkipped.reason} — ${report.playwrightSkipped.message}_\n`;
  }
  return body;
}

function formatAggregate(a: AggregatedEvaluationReport): string {
  return [
    `- **overallScore:** ${a.overallScore}`,
    `- **shouldRevise:** ${a.shouldRevise}`,
    `- **prioritizedFixes:** ${a.prioritizedFixes.length ? a.prioritizedFixes.map((x) => `\`${x}\``).join(', ') : '—'}`,
    '',
    '**Normalized scores:**',
    ...Object.entries(a.normalizedScores).map(([k, v]) => `- ${k}: ${v}`),
    '',
    a.hardFails.length
      ? '**Merged hard fails:**\n' + a.hardFails.map((h) => `- (${h.source}) \`${h.code}\` ${h.message}`).join('\n')
      : '_No merged hard fails._',
    '',
    a.revisionBrief ? fenced('text', a.revisionBrief) : '_No revision brief._',
  ].join('\n');
}

function formatEvaluationRounds(rounds: EvaluationRoundSnapshot[] | undefined): string {
  if (!rounds?.length) return '_None._\n';
  let out = '';
  for (const r of rounds) {
    out += `### Round ${r.round}\n\n`;
    out += '#### Aggregate\n\n';
    out += formatAggregate(r.aggregate) + '\n\n';
    out += '#### Design rubric\n\n' + formatWorkerRubric('design', r.design) + '\n\n';
    out += '#### Strategy rubric\n\n' + formatWorkerRubric('strategy', r.strategy) + '\n\n';
    out += '#### Implementation rubric\n\n' + formatWorkerRubric('implementation', r.implementation) + '\n\n';
    out += '#### Browser rubric\n\n' + formatWorkerRubric('browser', r.browser) + '\n\n';
  }
  return out;
}

function formatSpecContext(spec: DesignSpec | undefined): string {
  if (!spec) return '_No spec in export._\n';
  let body = `- **title:** ${spec.title}\n`;
  body += `- **spec id:** \`${spec.id}\`\n`;
  body += `- **version:** ${spec.version}\n`;
  body += `- **lastModified:** ${spec.lastModified}\n\n`;
  for (const meta of SPEC_SECTIONS) {
    const sec = spec.sections[meta.id];
    const title = meta.title;
    const content = sec?.content?.trim() ?? '';
    const imgCount = sec?.images?.length ?? 0;
    body += `### ${title}\n\n`;
    if (imgCount) body += `_(${imgCount} reference image(s) omitted from text export)_\n\n`;
    body += content ? content + '\n\n' : '_Empty._\n\n';
  }
  return body;
}

function formatDimensionContext(map: DimensionMap | undefined, strategy: VariantStrategy): string {
  if (!map) {
    return (
      '_No dimension map found for this strategy._\n\n' +
      '### Strategy dimensions (flat)\n\n' +
      fenced(
        'json',
        JSON.stringify(strategy.dimensionValues, null, 2),
      )
    );
  }
  let body = `- **map id:** \`${map.id}\`\n`;
  body += `- **specId:** \`${map.specId}\`\n`;
  body += `- **compilerModel:** ${map.compilerModel}\n`;
  body += `- **generatedAt:** ${map.generatedAt}\n\n`;
  body += '### Dimensions\n\n';
  body +=
    map.dimensions
      .map((d) => `- **${d.name}** (${d.isConstant ? 'constant' : 'variable'}): ${d.range}`)
      .join('\n') + '\n\n';
  body += '### This variant’s dimension values\n\n';
  body += fenced('json', JSON.stringify(strategy.dimensionValues, null, 2));
  return body;
}

function formatCompiledPrompts(prompts: CompiledPrompt[]): string {
  if (!prompts.length) return '_No compiled prompts in store (re-compile to capture)._ \n';
  let out = '';
  for (const p of prompts) {
    out += `### Prompt \`${p.id}\`\n\n`;
    out += `- **compiledAt:** ${p.compiledAt}\n`;
    out += `- **images:** ${p.images.length} reference image(s) (metadata only)\n\n`;
    out += fenced('markdown', p.prompt);
  }
  return out;
}

function formatDomainHypothesisBlock(
  hyp: DomainHypothesis | undefined,
  profiles: Record<string, DomainModelProfile>,
  designSystems: Record<string, DomainDesignSystemContent>,
): string {
  if (!hyp) return '_No domain hypothesis record (not linked in workspace domain)._ \n';
  let body = `- **hypothesis id:** \`${hyp.id}\`\n`;
  body += `- **incubatorId:** \`${hyp.incubatorId}\`\n`;
  body += `- **variantStrategyId:** \`${hyp.variantStrategyId}\`\n`;
  body += `- **agentMode:** ${hyp.agentMode ?? 'single'}\n`;
  body += `- **placeholder:** ${hyp.placeholder}\n\n`;
  body += '### Model nodes\n\n';
  if (!hyp.modelNodeIds.length) body += '_None._\n';
  else {
    for (const mid of hyp.modelNodeIds) {
      const m = profiles[mid];
      body += m
        ? `- **${mid}** — ${m.providerId} / ${m.modelId}${m.title ? ` (${m.title})` : ''} — thinking: ${m.thinkingLevel ?? 'default'}\n`
        : `- **${mid}** — _profile missing_\n`;
    }
  }
  body += '\n### Design system nodes\n\n';
  if (!hyp.designSystemNodeIds.length) body += '_None._\n';
  else {
    for (const did of hyp.designSystemNodeIds) {
      const d = designSystems[did];
      body += d
        ? `- **${did}** — ${d.title} (${d.content.length} chars, ${d.images.length} images)\n`
        : `- **${did}** — _missing_\n`;
    }
  }
  return body;
}

function formatStrategyCore(s: VariantStrategy): string {
  return [
    `- **id:** \`${s.id}\``,
    `- **name:** ${s.name}`,
    '',
    '### Hypothesis',
    s.hypothesis.trim() || '_Empty._',
    '',
    '### Rationale',
    s.rationale.trim() || '_Empty._',
    '',
    '### Measurements',
    s.measurements.trim() || '_Empty._',
  ].join('\n');
}

function formatResultsIndex(results: GenerationResult[]): string {
  if (!results.length) return '_No generation rows in store for this strategy._\n';
  const lines = results
    .slice()
    .sort((a, b) => a.runNumber - b.runNumber)
    .map(
      (r) =>
        `- **v${r.runNumber}** — \`${r.id}\` — ${r.status} — ${r.metadata.model ?? r.providerId} — run \`${r.runId}\`${r.error ? ` — error: ${r.error.slice(0, 120)}` : ''}`,
    );
  return lines.join('\n') + '\n';
}

export interface HypothesisDebugExportInput {
  exportedAt: string;
  canvasTitle?: string;
  hypothesisNodeId: string;
  strategy: VariantStrategy;
  dimensionMap?: DimensionMap;
  domainHypothesis?: DomainHypothesis;
  modelProfiles: Record<string, DomainModelProfile>;
  designSystems: Record<string, DomainDesignSystemContent>;
  spec: DesignSpec | undefined;
  compiledPromptsForStrategy: CompiledPrompt[];
  resultsForStrategy: GenerationResult[];
  agentModeOnNode: 'single' | 'agentic';
}

export function buildHypothesisDebugMarkdown(input: HypothesisDebugExportInput): string {
  const slug = (input.strategy.name || 'hypothesis')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  let md = `# Hypothesis debug snapshot: ${input.strategy.name || 'Untitled'}\n\n`;
  md += `_Exported ${input.exportedAt} (ISO)._\n`;
  if (input.canvasTitle) md += `\n**Canvas / library:** ${input.canvasTitle}\n`;
  md += `\n**Hypothesis node id:** \`${input.hypothesisNodeId}\`\n`;
  md += `**Variant strategy id:** \`${input.strategy.id}\`\n`;
  md += `**Run mode (node):** ${input.agentModeOnNode}\n`;
  md += '\n' + section('Variant strategy (compiler)', formatStrategyCore(input.strategy));
  md += HR + section('Dimension map & axes', formatDimensionContext(input.dimensionMap, input.strategy));
  md += HR + section('Workspace domain bindings', formatDomainHypothesisBlock(
    input.domainHypothesis,
    input.modelProfiles,
    input.designSystems,
  ));
  md += HR + section('Design spec (full text)', formatSpecContext(input.spec));
  md += HR + section('Compiled prompts (current store)', formatCompiledPrompts(input.compiledPromptsForStrategy));
  md += HR + section('Generation runs (metadata only)', formatResultsIndex(input.resultsForStrategy));
  md += '\n_For per-run traces, thinking stream, and artifacts, use **Download debug** on the variant node after a run._\n';
  md += `\n<!-- export: hypothesis slug=${slug} strategy=${input.strategy.id} -->\n`;
  return md;
}

export interface DesignRunDebugExportInput {
  exportedAt: string;
  variantNodeId?: string;
  variantName: string;
  strategyName?: string;
  strategy?: VariantStrategy;
  result: GenerationResult;
  /** Prefer IndexedDB snapshot when available */
  provenance?: Provenance;
  code?: string;
  files?: Record<string, string>;
}

function formatFileArtifactsManifest(files: Record<string, string> | undefined): string {
  if (!files || !Object.keys(files).length) return '_No multi-file map._\n';
  const paths = Object.keys(files).sort();
  let out = '| Path | Bytes |\n|------|-------|\n';
  for (const path of paths) {
    const raw = files[path] ?? '';
    out += `| \`${path}\` | ${raw.length} |\n`;
  }
  out += '\n';
  return out;
}

function formatFileArtifactsContents(files: Record<string, string> | undefined): string {
  if (!files || !Object.keys(files).length) return '';
  const paths = Object.keys(files).sort();
  let out = '';
  for (const path of paths) {
    const ext = path.includes('.') ? path.split('.').pop() ?? 'text' : 'text';
    out += `### \`${path}\`\n\n`;
    out += fenced(ext, files[path] ?? '');
  }
  return out;
}

/** Toggle design-run Markdown export sections (used by the variant debug export dialog). */
export interface DesignDebugExportOptions {
  /** Ids, status, provider, timings, error. */
  runSummary: boolean;
  strategySnapshot: boolean;
  progressHarness: boolean;
  thinking: boolean;
  /** Streamed assistant text; often large. */
  assistantOutput: boolean;
  runTrace: boolean;
  /** Evaluation from the generation result (rounds + summary). */
  evaluationFromResult: boolean;
  provenanceHypothesisSnapshot: boolean;
  provenanceDesignSystem: boolean;
  /** Full compiled prompt text; often large. */
  provenanceCompiledPrompt: boolean;
  provenanceRequestMeta: boolean;
  /** Evaluation block stored inside provenance (skipped when it duplicates result rounds). */
  provenanceEvaluation: boolean;
  provenanceCheckpoint: boolean;
  /** Paths and byte sizes only. */
  artifactManifest: boolean;
  /** Full file contents or single-file HTML body. */
  artifactFullSources: boolean;
}

/** Preset bundles for the export UI (maps to `DesignDebugExportOptions`). */
export type DesignDebugExportPreset = 'quick' | 'balanced' | 'full';

export function buildDesignDebugExportOptionsFromPreset(
  input: DesignRunDebugExportInput,
  preset: DesignDebugExportPreset,
): DesignDebugExportOptions {
  const balanced = getDefaultDesignDebugExportOptions(input);
  if (preset === 'balanced') return balanced;

  const r = input.result;
  const p = input.provenance;
  const hasFiles = !!(input.files && Object.keys(input.files).length > 0);
  const hasCode = !!input.code?.trim();
  const hasArtifacts = hasFiles || hasCode;
  const hasThinking = (r.thinkingTurns?.length ?? 0) > 0;
  const hasTrace = (r.liveTrace?.length ?? 0) > 0;
  const hasAnyEval =
    (r.evaluationRounds?.length ?? 0) > 0 ||
    r.evaluationSummary != null ||
    !!(p?.evaluation?.rounds?.length);

  if (preset === 'quick') {
    return {
      runSummary: true,
      strategySnapshot: true,
      progressHarness: true,
      thinking: false,
      assistantOutput: false,
      runTrace: false,
      evaluationFromResult: hasAnyEval,
      provenanceHypothesisSnapshot: true,
      provenanceDesignSystem: false,
      provenanceCompiledPrompt: false,
      provenanceRequestMeta: true,
      provenanceEvaluation: false,
      provenanceCheckpoint: false,
      artifactManifest: hasArtifacts,
      artifactFullSources: false,
    };
  }

  return {
    runSummary: true,
    strategySnapshot: true,
    progressHarness: true,
    thinking: hasThinking,
    assistantOutput: generationResultHasAssistantText(r),
    runTrace: hasTrace,
    evaluationFromResult: hasAnyEval,
    provenanceHypothesisSnapshot: true,
    provenanceDesignSystem: true,
    provenanceCompiledPrompt: true,
    provenanceRequestMeta: true,
    provenanceEvaluation: false,
    provenanceCheckpoint: true,
    artifactManifest: hasArtifacts,
    artifactFullSources: hasArtifacts,
  };
}

export function getDefaultDesignDebugExportOptions(
  input: DesignRunDebugExportInput,
): DesignDebugExportOptions {
  const r = input.result;
  const p = input.provenance;
  const hasThinking = (r.thinkingTurns?.length ?? 0) > 0;
  const hasTrace = (r.liveTrace?.length ?? 0) > 0;
  const hasFiles = !!(input.files && Object.keys(input.files).length > 0);
  const hasCode = !!input.code?.trim();
  const hasArtifacts = hasFiles || hasCode;
  const hasAnyEval =
    (r.evaluationRounds?.length ?? 0) > 0 ||
    r.evaluationSummary != null ||
    !!(p?.evaluation?.rounds?.length);

  return {
    runSummary: true,
    strategySnapshot: true,
    progressHarness: true,
    thinking: hasThinking,
    assistantOutput: false,
    runTrace: hasTrace,
    evaluationFromResult: hasAnyEval,
    provenanceHypothesisSnapshot: true,
    provenanceDesignSystem: true,
    provenanceCompiledPrompt: false,
    provenanceRequestMeta: true,
    /** Second copy of eval from the provenance blob; keep off by default (evaluationFromResult already covers rounds). */
    provenanceEvaluation: false,
    provenanceCheckpoint: true,
    artifactManifest: hasArtifacts,
    artifactFullSources: false,
  };
}

export function mergeDesignDebugExportOptions(
  base: DesignDebugExportOptions,
  patch: Partial<DesignDebugExportOptions>,
): DesignDebugExportOptions {
  return { ...base, ...patch };
}

function formatRunSummaryBlock(input: DesignRunDebugExportInput): string {
  const r = input.result;
  let md = '';
  if (input.variantNodeId) md += `**Variant node id:** \`${input.variantNodeId}\`\n`;
  md += `**Strategy / hypothesis name:** ${input.strategyName ?? '—'}\n`;
  md += `**Result id:** \`${r.id}\`\n`;
  md += `**Variant strategy id:** \`${r.variantStrategyId}\`\n`;
  md += `**Status:** ${r.status}\n`;
  md += `**Run:** v${r.runNumber} (\`${r.runId}\`)\n`;
  md += `**Provider / model:** ${r.providerId} / ${r.metadata.model}\n`;
  if (r.metadata.completedAt) md += `**Completed:** ${r.metadata.completedAt}\n`;
  if (r.metadata.durationMs != null) md += `**Duration ms:** ${r.metadata.durationMs}\n`;
  if (r.error) md += `\n**Error:** ${r.error}\n`;
  return md;
}

function formatProvenanceSnapshotGranular(
  p: Provenance | undefined,
  o: DesignDebugExportOptions,
  skipProvenanceEvaluationBecauseInResult: boolean,
): string {
  if (!p) return '_No provenance snapshot in IndexedDB for this result id._\n';

  const wantAny =
    o.provenanceHypothesisSnapshot ||
    o.provenanceDesignSystem ||
    o.provenanceCompiledPrompt ||
    o.provenanceRequestMeta ||
    o.provenanceEvaluation ||
    o.provenanceCheckpoint;

  if (!wantAny) return '_All provenance subsections omitted by export options._\n';

  let body = '';

  if (o.provenanceHypothesisSnapshot) {
    body += '### Compile-time hypothesis snapshot\n\n';
    body += fenced('json', JSON.stringify(p.hypothesisSnapshot, null, 2));
  }

  if (o.provenanceDesignSystem && p.designSystemSnapshot?.trim()) {
    body += '\n### Design system snapshot (compile)\n\n' + fenced('markdown', p.designSystemSnapshot);
  } else if (o.provenanceDesignSystem && !p.designSystemSnapshot?.trim()) {
    body += '\n### Design system snapshot (compile)\n\n_No design system text in provenance._\n';
  }

  if (o.provenanceCompiledPrompt) {
    body += '\n### Full compiled prompt (as sent)\n\n' + fenced('markdown', p.compiledPrompt);
  }

  if (o.provenanceRequestMeta) {
    body += `\n### Request metadata\n\n- **provider:** ${p.provider}\n- **model:** ${p.model}\n- **timestamp:** ${p.timestamp}\n`;
  }

  if (o.provenanceEvaluation && p.evaluation && !skipProvenanceEvaluationBecauseInResult) {
    body += '\n### Evaluation (persisted in provenance)\n\n';
    body += formatEvaluationRounds(p.evaluation.rounds);
    body += '\n#### Final aggregate (provenance)\n\n';
    body += formatAggregate(p.evaluation.finalAggregate);
  } else if (o.provenanceEvaluation && skipProvenanceEvaluationBecauseInResult && p.evaluation) {
    body +=
      '\n_Evaluation details are included via **Evaluation** from the generation result (not repeated from provenance)._ \n';
  }

  if (o.provenanceCheckpoint && p.checkpoint) {
    body += '\n### Agentic checkpoint\n\n';
    body += fenced('json', JSON.stringify(p.checkpoint, null, 2));
  } else if (o.provenanceCheckpoint && !p.checkpoint) {
    body += '\n### Agentic checkpoint\n\n_No checkpoint in provenance._\n';
  }

  return body;
}

function formatGeneratedArtifactsSection(
  input: DesignRunDebugExportInput,
  o: DesignDebugExportOptions,
): string {
  const hasFiles = input.files && Object.keys(input.files).length > 0;
  const code = input.code?.trim();

  if (!o.artifactManifest && !o.artifactFullSources) {
    if (hasFiles || code) {
      return '_Artifacts present but omitted (manifest and full sources disabled)._ \n';
    }
    return '_No code or file map loaded — run may still be in progress or artifacts were GC’d._\n';
  }

  if (hasFiles) {
    let body = '';
    if (o.artifactManifest) {
      body += '### File manifest\n\n' + formatFileArtifactsManifest(input.files);
    }
    if (o.artifactFullSources) {
      body += '### File contents\n\n' + formatFileArtifactsContents(input.files);
    }
    return body || '_Nothing selected for multi-file artifacts._\n';
  }

  if (code) {
    let body = '';
    if (o.artifactManifest) {
      body += `### Single-file HTML\n\n- **bytes:** ${code.length}\n\n`;
    }
    if (o.artifactFullSources) {
      body += '### HTML source\n\n' + fenced('html', code);
    }
    return body || '_Nothing selected for HTML artifact._\n';
  }

  return '_No code or file map loaded — run may still be in progress or artifacts were GC’d._\n';
}

export function buildDesignRunDebugMarkdown(
  input: DesignRunDebugExportInput,
  options?: Partial<DesignDebugExportOptions>,
): string {
  const o = mergeDesignDebugExportOptions(getDefaultDesignDebugExportOptions(input), options ?? {});
  const r = input.result;
  const slug = input.variantName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  let md = `# Design run debug: ${input.variantName}\n\n`;
  md += `_Exported ${input.exportedAt} (ISO)._\n\n`;

  if (o.runSummary) {
    md += formatRunSummaryBlock(input);
  }

  if (o.strategySnapshot) {
    md +=
      '\n' +
      section(
        'Strategy snapshot (compiler store, if provided)',
        input.strategy ? formatStrategyCore(input.strategy) : '_Not passed._\n',
      );
  }

  if (o.progressHarness) {
    md +=
      HR +
      section('Progress & harness', [
        `- **agenticPhase:** ${r.agenticPhase ?? '—'}`,
        `- **evaluationStatus:** ${r.evaluationStatus ?? '—'}`,
        `- **progressMessage:** ${r.progressMessage ?? '—'}`,
        `- **activeTool:** ${r.activeToolName ?? '—'} ${r.activeToolPath ? `\`${r.activeToolPath}\`` : ''}`,
        '',
        '### Task list (last known)',
        formatTodos(r.liveTodos),
        '',
        '### File plan',
        r.liveFilesPlan?.length
          ? r.liveFilesPlan.map((p) => `- \`${p}\``).join('\n')
          : '_None._',
      ].join('\n'));
  }

  if (o.thinking) {
    md += HR + section('Thinking (per PI turn)', formatThinkingTurns(r.thinkingTurns));
  }

  if (o.assistantOutput) {
    md +=
      HR +
      section(
        'Assistant output (streamed)',
        formatActivityByTurn(r.activityByTurn, (r.activityLog ?? []).join('')),
      );
  }

  if (o.runTrace) {
    md += HR + section('Run trace (structured)', formatTraceEvents(r.liveTrace));
  }

  const skipProvEvalDuplicate = (r.evaluationRounds?.length ?? 0) > 0;
  if (o.evaluationFromResult) {
    const rounds = r.evaluationRounds?.length ? r.evaluationRounds : input.provenance?.evaluation?.rounds;
    md += HR + section('Evaluation (generation result)', formatEvaluationRounds(rounds));
    if (r.evaluationSummary) {
      md += '\n### Latest evaluation summary (result store)\n\n' + formatAggregate(r.evaluationSummary) + '\n';
    }
  }

  const wantProvenanceSection =
    o.provenanceHypothesisSnapshot ||
    o.provenanceDesignSystem ||
    o.provenanceCompiledPrompt ||
    o.provenanceRequestMeta ||
    o.provenanceEvaluation ||
    o.provenanceCheckpoint;

  if (wantProvenanceSection) {
    md +=
      HR +
      section(
        'Provenance (IndexedDB)',
        formatProvenanceSnapshotGranular(input.provenance, o, skipProvEvalDuplicate),
      );
  }

  md += HR + section('Generated artifacts', formatGeneratedArtifactsSection(input, o));

  md += `\n<!-- export: design slug=${slug} result=${r.id} run=${r.runNumber} -->\n`;
  return md;
}
