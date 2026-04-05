/**
 * User-message assembly for post-evaluation Pi revision rounds (orchestrator).
 */
import type {
  EvaluationContextPayload,
  EvaluatorRubricId,
} from '../../src/types/evaluation.ts';

const REVISION_COMPILED_PROMPT_MAX = 4000;

/** One completed evaluation round for cross-round memory in revision prompts */
export interface EvaluationRoundHistoryEntry {
  round: number;
  rubricMeans: Partial<Record<EvaluatorRubricId, number>>;
  overallScore: number;
  hardFailCount: number;
  /** Full flattened scores for per-criterion deltas vs previous round */
  normalizedScores: Record<string, number>;
}

/** Original intent for the revision agent (truncated compiled prompt + KPI/hypothesis context). */
export function buildRevisionUserContext(
  compiledPrompt: string,
  evaluationContext?: EvaluationContextPayload,
): string {
  const truncated =
    compiledPrompt.length > REVISION_COMPILED_PROMPT_MAX
      ? `${compiledPrompt.slice(0, REVISION_COMPILED_PROMPT_MAX)}\n…[truncated]`
      : compiledPrompt;
  const parts: string[] = ['## Original design request (preserve intent)', '', truncated, ''];
  const ctx = evaluationContext;
  if (ctx?.strategyName) parts.push(`**Strategy:** ${ctx.strategyName}`);
  if (ctx?.hypothesis) parts.push(`**Hypothesis:** ${ctx.hypothesis}`);
  if (ctx?.rationale) parts.push(`**Rationale:** ${ctx.rationale}`);
  if (ctx?.measurements) parts.push(`**KPIs / measurements:** ${ctx.measurements}`);
  if (ctx?.objectivesMetrics) parts.push(`**Objectives & metrics:** ${ctx.objectivesMetrics}`);
  if (ctx?.designConstraints) parts.push(`**Design constraints:** ${ctx.designConstraints}`);
  if (parts.length > 4) parts.push('');
  return parts.join('\n');
}

function truncTrace(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}\n…[truncated]`;
}

const DEFAULT_TRACE_BUDGET = { design: 3000, strategy: 3000, implementation: 1500 } as const;

/**
 * Raw LLM evaluator responses (design / strategy / implementation) for revision context.
 * Design and strategy get larger budgets than implementation.
 */
export function buildEvaluatorTracesSection(
  traces: Partial<Record<EvaluatorRubricId, string>> | undefined,
  budget: { design?: number; strategy?: number; implementation?: number } = {},
): string {
  if (!traces || Object.keys(traces).length === 0) return '';
  const d = budget.design ?? DEFAULT_TRACE_BUDGET.design;
  const st = budget.strategy ?? DEFAULT_TRACE_BUDGET.strategy;
  const impl = budget.implementation ?? DEFAULT_TRACE_BUDGET.implementation;
  const parts: string[] = ['## Evaluator reasoning (raw model output)', ''];
  const order: EvaluatorRubricId[] = ['design', 'strategy', 'implementation'];
  for (const rubric of order) {
    const raw = traces[rubric];
    if (raw == null || raw.length === 0) continue;
    const label =
      rubric === 'design'
        ? 'Design quality evaluator'
        : rubric === 'strategy'
          ? 'Strategy fidelity evaluator'
          : 'Implementation evaluator';
    const b = rubric === 'design' ? d : rubric === 'strategy' ? st : impl;
    parts.push(`### ${label}`, '', truncTrace(raw, b), '');
  }
  return parts.join('\n').trimEnd();
}

function fmtMean(n: number | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toFixed(2);
}

function criterionDeltas(
  prev: Record<string, number>,
  curr: Record<string, number>,
): { key: string; delta: number }[] {
  const keys = new Set([...Object.keys(prev), ...Object.keys(curr)]);
  const out: { key: string; delta: number }[] = [];
  for (const k of keys) {
    const a = prev[k];
    const b = curr[k];
    if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b)) continue;
    const delta = b - a;
    if (delta !== 0) out.push({ key: k, delta });
  }
  return out;
}

/**
 * Cross-round score trajectory and largest per-criterion movers (last two rounds).
 */
export function buildRoundHistorySection(history: EvaluationRoundHistoryEntry[]): string {
  if (history.length === 0) return '';
  const lines: string[] = ['## Revision history', '', '| Round | Design | Strategy | Impl | Browser | Overall | Hard fails |', '|---|---|---|---|---|---|---|'];
  for (const h of history) {
    lines.push(
      `| ${h.round} | ${fmtMean(h.rubricMeans.design)} | ${fmtMean(h.rubricMeans.strategy)} | ${fmtMean(h.rubricMeans.implementation)} | ${fmtMean(h.rubricMeans.browser)} | ${fmtMean(h.overallScore)} | ${h.hardFailCount} |`,
    );
  }
  if (history.length >= 2) {
    const prev = history[history.length - 2]!;
    const curr = history[history.length - 1]!;
    const deltas = criterionDeltas(prev.normalizedScores, curr.normalizedScores);
    const improved = [...deltas].filter((x) => x.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 3);
    const regressed = [...deltas].filter((x) => x.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 3);
    lines.push('');
    lines.push(
      `Rounds ${prev.round}→${curr.round}: rubric means Δ design ${formatDeltaNumber(curr.rubricMeans.design, prev.rubricMeans.design)}, strategy ${formatDeltaNumber(curr.rubricMeans.strategy, prev.rubricMeans.strategy)}, implementation ${formatDeltaNumber(curr.rubricMeans.implementation, prev.rubricMeans.implementation)}, browser ${formatDeltaNumber(curr.rubricMeans.browser, prev.rubricMeans.browser)}.`,
    );
    if (improved.length) {
      lines.push(
        `Largest improvements: ${improved.map((x) => `${x.key} +${x.delta.toFixed(2)}`).join('; ')}.`,
      );
    }
    if (regressed.length) {
      lines.push(
        `Largest regressions: ${regressed.map((x) => `${x.key} ${x.delta.toFixed(2)}`).join('; ')}.`,
      );
    }
  }
  lines.push('');
  return lines.join('\n');
}

function formatDeltaNumber(
  cur: number | undefined,
  prev: number | undefined,
): string {
  if (cur == null || prev == null || !Number.isFinite(cur) || !Number.isFinite(prev)) return 'n/a';
  const d = cur - prev;
  const sign = d > 0 ? '+' : '';
  return `${sign}${d.toFixed(2)}`;
}
