/**
 * Agentic design build + parallel evaluators + bounded revision pass.
 */
import type { PromptKey } from '../lib/prompts/defaults.ts';
import type {
  AgenticCheckpoint,
  AgenticPhase,
  AggregatedEvaluationReport,
  EvaluationContextPayload,
  EvaluationRoundSnapshot,
} from '../../src/types/evaluation.ts';
import { getProvider } from './providers/registry.ts';
import {
  aggregateEvaluationReports,
  enforceRevisionGate,
  runEvaluationWorkers,
} from './design-evaluation-service.ts';
import { runDesignAgentSession, type AgentRunEvent, type AgentSessionParams } from './pi-agent-service.ts';

export type AgenticOrchestratorEvent =
  | AgentRunEvent
  | { type: 'phase'; phase: AgenticPhase }
  | { type: 'evaluation_progress'; round: number; phase: string; message?: string }
  | { type: 'evaluation_report'; round: number; snapshot: EvaluationRoundSnapshot }
  | { type: 'revision_round'; round: number; brief: string };

export interface AgenticOrchestratorOptions {
  build: AgentSessionParams;
  compiledPrompt: string;
  evaluationContext?: EvaluationContextPayload;
  /** Override provider/model for LLM evaluators; defaults to build provider/model */
  evaluatorProviderId?: string;
  evaluatorModelId?: string;
  getPromptBody: (key: PromptKey) => Promise<string>;
  onStream: (e: AgenticOrchestratorEvent) => void | Promise<void>;
}

export interface AgenticOrchestratorResult {
  files: Record<string, string>;
  rounds: EvaluationRoundSnapshot[];
  finalAggregate: AggregatedEvaluationReport;
  checkpoint: AgenticCheckpoint;
}

async function emit(
  onStream: AgenticOrchestratorOptions['onStream'],
  e: AgenticOrchestratorEvent,
): Promise<void> {
  await onStream(e);
}

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

async function runEvaluationRound(
  options: AgenticOrchestratorOptions,
  round: number,
  files: Record<string, string>,
  parallel: boolean,
): Promise<EvaluationRoundSnapshot> {
  await emit(options.onStream, {
    type: 'evaluation_progress',
    round,
    phase: 'parallel_start',
    message: parallel ? 'Running design, strategy, and implementation evaluators in parallel…' : 'Running evaluators sequentially…',
  });

  const workers = await runEvaluationWorkers({
    files,
    compiledPrompt: options.compiledPrompt,
    context: options.evaluationContext,
    providerId: options.build.providerId,
    modelId: options.build.modelId,
    evaluatorProviderId: options.evaluatorProviderId,
    evaluatorModelId: options.evaluatorModelId,
    parallel,
    getPromptBody: options.getPromptBody,
  });

  const rawAgg = aggregateEvaluationReports(workers);
  const aggregate = enforceRevisionGate(rawAgg);

  const snapshot: EvaluationRoundSnapshot = {
    round,
    design: workers.design,
    strategy: workers.strategy,
    implementation: workers.implementation,
    browser: workers.browser,
    aggregate,
  };

  await emit(options.onStream, { type: 'evaluation_report', round, snapshot });
  return snapshot;
}

function buildCheckpoint(
  files: Record<string, string>,
  rounds: EvaluationRoundSnapshot[],
  revisionBriefApplied?: string,
): AgenticCheckpoint {
  const finalRound = rounds[rounds.length - 1];
  const completedTodos = finalRound
    ? [
        ...(finalRound.design?.findings.map((f) => f.summary) ?? []),
      ].slice(0, 5)
    : [];
  return {
    totalRounds: rounds.length,
    filesWritten: Object.keys(files),
    finalTodosSummary: completedTodos.join('; ') || 'No findings recorded',
    revisionBriefApplied,
    completedAt: new Date().toISOString(),
  };
}

/**
 * Full pipeline: PI build → eval (×4 + aggregate) → optional single revision → re-eval.
 */
export async function runAgenticWithEvaluation(
  options: AgenticOrchestratorOptions,
): Promise<AgenticOrchestratorResult | null> {
  const provider = getProvider(options.build.providerId);
  const parallel = provider?.supportsParallel ?? false;
  const signal = options.build.signal;

  const forward = async (e: AgentRunEvent) => {
    await options.onStream(e);
  };

  await emit(options.onStream, { type: 'phase', phase: 'building' });

  const buildResult = await runDesignAgentSession(options.build, forward);
  if (!buildResult || signal?.aborted) return null;

  let files = buildResult.files;
  const rounds: EvaluationRoundSnapshot[] = [];

  await emit(options.onStream, { type: 'phase', phase: 'evaluating' });
  const snap1 = await runEvaluationRound(options, 1, files, parallel);
  rounds.push(snap1);
  const agg1 = snap1.aggregate;

  if (agg1.shouldRevise && !signal?.aborted) {
    await emit(options.onStream, { type: 'phase', phase: 'revising' });
    await emit(options.onStream, {
      type: 'revision_round',
      round: 1,
      brief: agg1.revisionBrief,
    });

    const revisionUser = [
      buildRevisionUserContext(options.compiledPrompt, options.evaluationContext),
      'You are revising an existing multi-file design based on external evaluation feedback.',
      'Apply the changes below using edit_file when possible; use write_file only for full rewrites.',
      'Do not remove the design hypothesis — strengthen how it shows up in the UI and copy.',
      '',
      '## Revision brief',
      agg1.revisionBrief,
      '',
      '## Prioritized fixes',
      ...agg1.prioritizedFixes.map((f, i) => `${i + 1}. ${f}`),
    ].join('\n');

    const revised = await runDesignAgentSession(
      {
        ...options.build,
        userPrompt: revisionUser,
        seedFiles: files,
        compactionNote: `Post-evaluation revision requested. Overall ${agg1.overallScore.toFixed(2)}. Hard fails: ${agg1.hardFails.length}.`,
        initialProgressMessage: 'Revising design from evaluation feedback…',
      },
      forward,
    );

    if (!revised || signal?.aborted) return null;
    files = revised.files;

    await emit(options.onStream, { type: 'phase', phase: 'evaluating' });
    const snap2 = await runEvaluationRound(options, 2, files, parallel);
    rounds.push(snap2);

    await emit(options.onStream, { type: 'phase', phase: 'complete' });
    return {
      files,
      rounds,
      finalAggregate: snap2.aggregate,
      checkpoint: buildCheckpoint(files, rounds, agg1.revisionBrief),
    };
  }

  await emit(options.onStream, { type: 'phase', phase: 'complete' });
  return {
    files,
    rounds,
    finalAggregate: agg1,
    checkpoint: buildCheckpoint(files, rounds),
  };
}
