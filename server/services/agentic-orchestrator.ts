/**
 * Agentic design build + parallel evaluators + bounded multi-round revision loop.
 */
import type { PromptKey } from '../lib/prompts/defaults.ts';
import type {
  AgenticCheckpoint,
  AgenticPhase,
  AgenticStopReason,
  AggregatedEvaluationReport,
  EvaluationContextPayload,
  EvaluationRoundSnapshot,
  EvaluatorRubricId,
  EvaluatorWorkerReport,
} from '../../src/types/evaluation.ts';
import { getProvider } from './providers/registry.ts';
import {
  aggregateEvaluationReports,
  enforceRevisionGate,
  isEvalSatisfied,
  runEvaluationWorkers,
} from './design-evaluation-service.ts';
import { buildAgenticSystemContext } from '../lib/build-agentic-system-context.ts';
import { debugAgentIngest } from '../lib/debug-agent-ingest.ts';
import { isLangfuseTracingEnabled } from '../lib/langfuse-tracing-enabled.ts';
import { createTraceId, startActiveObservation } from '@langfuse/tracing';
import {
  runDesignAgentSession,
  type AgentRunEvent,
  type AgentSessionParams,
  type DesignAgentSessionResult,
} from './pi-agent-service.ts';
import type { LoadedSkillSummary } from '../lib/skill-schema.ts';
import { makeRunTraceEvent } from '../lib/run-trace.ts';

const AGENTIC_ROOT_SPAN_ID = '0000000000000001';

/** PI session fields supplied by the caller; system prompt comes from Langfuse per session. */
type AgenticOrchestratorBuildInput = Omit<AgentSessionParams, 'systemPrompt'>;

export type AgenticOrchestratorEvent =
  | AgentRunEvent
  | { type: 'phase'; phase: AgenticPhase }
  | { type: 'skills_loaded'; skills: LoadedSkillSummary[] }
  | { type: 'evaluation_progress'; round: number; phase: string; message?: string }
  | {
      type: 'evaluation_worker_done';
      round: number;
      rubric: EvaluatorRubricId;
      report: EvaluatorWorkerReport;
    }
  | { type: 'evaluation_report'; round: number; snapshot: EvaluationRoundSnapshot }
  | { type: 'revision_round'; round: number; brief: string };

interface AgenticOrchestratorOptions {
  build: AgenticOrchestratorBuildInput;
  compiledPrompt: string;
  evaluationContext?: EvaluationContextPayload;
  /** Override provider/model for LLM evaluators; defaults to build provider/model */
  evaluatorProviderId?: string;
  evaluatorModelId?: string;
  /** Max PI revision sessions after the first evaluation (not counting initial build). */
  maxRevisionRounds: number;
  /** Optional early exit when overall score is high enough and there are no hard fails. */
  minOverallScore?: number;
  getPromptBody: (key: PromptKey) => Promise<string>;
  onStream: (e: AgenticOrchestratorEvent) => void | Promise<void>;
}

interface AgenticOrchestratorResult {
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

async function emitSkillsLoaded(
  onStream: AgenticOrchestratorOptions['onStream'],
  skills: LoadedSkillSummary[],
  tracePhase: AgenticPhase,
): Promise<void> {
  const label =
    skills.length === 0
      ? 'No agent skills in catalog for this session'
      : `Skills catalog (${skills.length}): ${skills.map((s) => s.name).join(', ')}`;
  await emit(onStream, {
    type: 'trace',
    trace: makeRunTraceEvent({
      kind: 'skills_loaded',
      label,
      phase: tracePhase,
      status: skills.length === 0 ? 'info' : 'success',
    }),
  });
  await emit(onStream, { type: 'skills_loaded', skills });
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
    message: parallel
      ? 'Running design, strategy, and implementation evaluators in parallel…'
      : 'Running evaluators sequentially…',
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
    correlationId: options.build.correlationId,
    signal: options.build.signal,
    onWorkerDone: async (rubric, report) => {
      await emit(options.onStream, { type: 'evaluation_worker_done', round, rubric, report });
    },
  });

  const rawAgg = aggregateEvaluationReports(workers);
  const aggregate = enforceRevisionGate(rawAgg);

  const snapshot: EvaluationRoundSnapshot = {
    round,
    files: { ...files },
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
  opts: {
    stopReason: AgenticStopReason;
    revisionAttempts: number;
    revisionBriefApplied?: string;
  },
): AgenticCheckpoint {
  const finalRound = rounds[rounds.length - 1];
  const completedTodos = finalRound
    ? [...(finalRound.design?.findings.map((f) => f.summary) ?? [])].slice(0, 5)
    : [];
  return {
    totalRounds: rounds.length,
    filesWritten: Object.keys(files),
    finalTodosSummary: completedTodos.join('; ') || 'No findings recorded',
    revisionBriefApplied: opts.revisionBriefApplied,
    completedAt: new Date().toISOString(),
    stopReason: opts.stopReason,
    revisionAttempts: opts.revisionAttempts,
  };
}

function mergeSeedWithDesign(
  designFiles: Record<string, string>,
  sandboxSeedFiles?: Record<string, string>,
): Record<string, string> {
  const sand = sandboxSeedFiles && Object.keys(sandboxSeedFiles).length > 0 ? sandboxSeedFiles : {};
  return { ...sand, ...designFiles };
}

function agenticResult(
  files: Record<string, string>,
  rounds: EvaluationRoundSnapshot[],
  snapshot: EvaluationRoundSnapshot,
  checkpointOpts: {
    stopReason: AgenticStopReason;
    revisionAttempts: number;
    revisionBriefApplied?: string;
  },
): AgenticOrchestratorResult {
  return {
    files,
    rounds,
    finalAggregate: snapshot.aggregate,
    checkpoint: buildCheckpoint(files, rounds, checkpointOpts),
  };
}

type PiSessionExtras = Partial<
  Pick<AgentSessionParams, 'userPrompt' | 'seedFiles' | 'compactionNote' | 'initialProgressMessage'>
>;

type AgenticSystemContextBundle = Awaited<ReturnType<typeof buildAgenticSystemContext>>;

/** Refresh Langfuse agentic context, emit skills_loaded, run one Pi design session. */
async function runAgenticPiSessionRound(
  options: AgenticOrchestratorOptions,
  forward: (e: AgentRunEvent) => Promise<void>,
  tracePhase: AgenticPhase,
  setPiTracePhase: (p: AgenticPhase) => void,
  sessionExtras:
    | PiSessionExtras
    | ((ctx: AgenticSystemContextBundle) => PiSessionExtras),
): Promise<DesignAgentSessionResult | null> {
  const ctx = await buildAgenticSystemContext({
    getPromptBody: options.getPromptBody,
  });
  await emitSkillsLoaded(options.onStream, ctx.loadedSkills, tracePhase);
  setPiTracePhase(tracePhase);
  const extras = typeof sessionExtras === 'function' ? sessionExtras(ctx) : sessionExtras;
  return runDesignAgentSession(
    {
      ...options.build,
      ...extras,
      systemPrompt: ctx.systemPrompt,
      skillCatalog: ctx.skillCatalog,
    },
    forward,
  );
}

/**
 * Full pipeline: PI build → eval rounds → bounded revision loop until satisfied or cap.
 */
export async function runAgenticWithEvaluation(
  options: AgenticOrchestratorOptions,
): Promise<AgenticOrchestratorResult | null> {
  if (!isLangfuseTracingEnabled()) {
    return runAgenticWithEvaluationImpl(options);
  }
  const seed = options.build.correlationId ?? '';
  const parentSpanContext = {
    traceId: await createTraceId(seed),
    spanId: AGENTIC_ROOT_SPAN_ID,
    traceFlags: 1,
  };
  return startActiveObservation(
    'agentic-orchestration',
    async (span) => {
      span.update({
        metadata: {
          correlationId: options.build.correlationId,
          providerId: options.build.providerId,
          modelId: options.build.modelId,
        },
        input: { mode: 'agentic' },
      });
      const result = await runAgenticWithEvaluationImpl(options);
      if (result) {
        span.update({
          output: {
            stopReason: result.checkpoint.stopReason,
            rounds: result.rounds.length,
          },
        });
      }
      return result;
    },
    { parentSpanContext },
  );
}

async function runAgenticWithEvaluationImpl(
  options: AgenticOrchestratorOptions,
): Promise<AgenticOrchestratorResult | null> {
  const provider = getProvider(options.build.providerId);
  const parallel = provider?.supportsParallel ?? false;
  const signal = options.build.signal;
  const maxRevisions = Math.max(0, Math.min(20, options.maxRevisionRounds));
  const satisfactionOpts =
    options.minOverallScore != null && Number.isFinite(options.minOverallScore)
      ? { minOverallScore: options.minOverallScore }
      : undefined;

  let piTracePhase: AgenticPhase = 'building';
  const forward = async (e: AgentRunEvent) => {
    if (e.type === 'skill_activated') {
      await emit(options.onStream, {
        type: 'trace',
        trace: makeRunTraceEvent({
          kind: 'skill_activated',
          label: `Skill activated: ${e.name} (${e.key})`,
          phase: piTracePhase,
          status: 'success',
        }),
      });
    }
    await options.onStream(e);
  };

  await emit(options.onStream, { type: 'phase', phase: 'building' });

  const setPiTrace = (p: AgenticPhase) => {
    piTracePhase = p;
  };
  const buildResult = await runAgenticPiSessionRound(
    options,
    forward,
    'building',
    setPiTrace,
    (ctx) => {
      const initialSeedFiles = {
        ...ctx.sandboxSeedFiles,
        ...(options.build.seedFiles ?? {}),
      };
      const seedFilesForBuild =
        Object.keys(initialSeedFiles).length > 0 ? initialSeedFiles : undefined;
      return { seedFiles: seedFilesForBuild };
    },
  );
  if (!buildResult || signal?.aborted) return null;

  let files = buildResult.files;
  const rounds: EvaluationRoundSnapshot[] = [];
  let revisionAttempts = 0;
  let lastRevisionBrief: string | undefined;

  await emit(options.onStream, { type: 'phase', phase: 'evaluating' });
  let evalRound = 1;
  let snapshot = await runEvaluationRound(options, evalRound, files, parallel);
  rounds.push(snapshot);

  if (signal?.aborted) {
    return agenticResult(files, rounds, snapshot, {
      stopReason: 'aborted',
      revisionAttempts,
      revisionBriefApplied: lastRevisionBrief,
    });
  }

  while (
    !isEvalSatisfied(snapshot.aggregate, satisfactionOpts) &&
    revisionAttempts < maxRevisions &&
    !signal?.aborted
  ) {
    await emit(options.onStream, { type: 'phase', phase: 'revising' });
    const brief = snapshot.aggregate.revisionBrief;
    lastRevisionBrief = brief;

    await emit(options.onStream, {
      type: 'revision_round',
      round: revisionAttempts + 1,
      brief,
    });

    const revisionUser = [
      buildRevisionUserContext(options.compiledPrompt, options.evaluationContext),
      'You are revising an existing multi-file design based on external evaluation feedback.',
      'Apply the changes below using edit_file when possible; use write_file only for full rewrites.',
      'Do not remove the design hypothesis — strengthen how it shows up in the UI and copy.',
      '',
      '## Revision brief',
      brief,
      '',
      '## Prioritized fixes',
      ...snapshot.aggregate.prioritizedFixes.map((f, i) => `${i + 1}. ${f}`),
    ].join('\n');

    debugAgentIngest({
      hypothesisId: 'H7',
      location: 'agentic-orchestrator.ts:revision_start',
      message: 'runDesignAgentSession (revision) starting',
      data: {
        revisionAttempt: revisionAttempts + 1,
        revisionUserChars: revisionUser.length,
        prioritizedFixesCount: snapshot.aggregate.prioritizedFixes.length,
        designFileCount: Object.keys(files).length,
      },
    });

    const revised = await runAgenticPiSessionRound(options, forward, 'revising', setPiTrace, (ctx) => ({
      userPrompt: revisionUser,
      seedFiles: mergeSeedWithDesign(files, ctx.sandboxSeedFiles),
      compactionNote: `Post-evaluation revision requested. Overall ${snapshot.aggregate.overallScore.toFixed(2)}. Hard fails: ${snapshot.aggregate.hardFails.length}.`,
      initialProgressMessage: 'Revising design from evaluation feedback…',
    }));

    if (!revised || signal?.aborted) {
      const stopReason: AgenticStopReason = signal?.aborted ? 'aborted' : 'revision_failed';
      debugAgentIngest({
        hypothesisId: 'H7',
        location: 'agentic-orchestrator.ts:revision_end',
        message: 'runDesignAgentSession (revision) aborted or null',
        data: { revisionAttempt: revisionAttempts + 1, aborted: !!signal?.aborted },
      });
      return agenticResult(files, rounds, snapshot, {
        stopReason,
        revisionAttempts,
        revisionBriefApplied: lastRevisionBrief,
      });
    }

    debugAgentIngest({
      hypothesisId: 'H7',
      location: 'agentic-orchestrator.ts:revision_end',
      message: 'runDesignAgentSession (revision) finished',
      data: {
        revisionAttempt: revisionAttempts + 1,
        outFileCount: Object.keys(revised.files).length,
      },
    });

    files = revised.files;
    revisionAttempts += 1;
    evalRound += 1;

    await emit(options.onStream, { type: 'phase', phase: 'evaluating' });
    snapshot = await runEvaluationRound(options, evalRound, files, parallel);
    rounds.push(snapshot);

    if (signal?.aborted) {
      return agenticResult(files, rounds, snapshot, {
        stopReason: 'aborted',
        revisionAttempts,
        revisionBriefApplied: lastRevisionBrief,
      });
    }
  }

  const satisfied = isEvalSatisfied(snapshot.aggregate, satisfactionOpts);
  const stopReason: AgenticStopReason = signal?.aborted
    ? 'aborted'
    : satisfied
      ? 'satisfied'
      : 'max_revisions';

  await emit(options.onStream, { type: 'phase', phase: 'complete' });
  return agenticResult(files, rounds, snapshot, {
    stopReason,
    revisionAttempts,
    revisionBriefApplied: lastRevisionBrief,
  });
}
