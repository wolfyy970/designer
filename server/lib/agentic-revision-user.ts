/**
 * User-message assembly for post-evaluation Pi revision rounds (orchestrator).
 */
import type { EvaluationContextPayload } from '../../src/types/evaluation.ts';

const REVISION_COMPILED_PROMPT_MAX = 4000;

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
