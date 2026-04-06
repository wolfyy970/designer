/**
 * Agentic design build + parallel evaluators + bounded multi-round revision loop.
 */
import { randomUUID } from 'node:crypto';
import type { PromptKey } from '../../src/lib/prompts/defaults.ts';
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
import {
  buildEvaluatorTracesSection,
  buildRevisionUserContext,
  buildRoundHistorySection,
  type EvaluationRoundHistoryEntry,
} from '../lib/agentic-revision-user.ts';
import { rubricMeansFromNormalizedScores } from '../lib/evaluation-revision-gate.ts';
import { GENERATION_MODE } from '../../src/constants/generation.ts';
import { normalizeError } from '../../src/lib/error-utils.ts';
import { env } from '../env.ts';
import { writeAgenticEvalRunLog } from '../lib/eval-run-logger.ts';
import { acquireAgenticSlotOrReject, releaseAgenticSlot } from '../lib/agentic-concurrency.ts';

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
  /** Optional blend for overall score; merged with product defaults and normalized server-side. */
  rubricWeights?: Partial<Record<EvaluatorRubricId, number>>;
  getPromptBody: (key: PromptKey) => Promise<string>;
  onStream: (e: AgenticOrchestratorEvent) => void | Promise<void>;
}

interface AgenticOrchestratorResult {
  files: Record<string, string>;
  rounds: EvaluationRoundSnapshot[];
  finalAggregate: AggregatedEvaluationReport;
  checkpoint: AgenticCheckpoint;
}

/** Mirrors Pi bridge: SSE delivery failures abort the run instead of unhandled rejections. */
type StreamEmissionContext = {
  onStream: AgenticOrchestratorOptions['onStream'];
  onDeliveryFailure?: () => void;
};

async function emit(ctx: StreamEmissionContext, e: AgenticOrchestratorEvent): Promise<void> {
  try {
    await ctx.onStream(e);
  } catch (err) {
    if (env.isDev) {
      console.error('[agentic-orchestrator] onStream failed', normalizeError(err), err);
    }
    ctx.onDeliveryFailure?.();
  }
}

async function emitSkillsLoaded(
  streamCtx: StreamEmissionContext,
  skills: LoadedSkillSummary[],
  tracePhase: AgenticPhase,
): Promise<void> {
  const label =
    skills.length === 0
      ? 'No agent skills in catalog for this session'
      : `Skills catalog (${skills.length}): ${skills.map((s) => s.name).join(', ')}`;
  await emit(streamCtx, {
    type: 'trace',
    trace: makeRunTraceEvent({
      kind: 'skills_loaded',
      label,
      phase: tracePhase,
      status: skills.length === 0 ? 'info' : 'success',
    }),
  });
  await emit(streamCtx, { type: 'skills_loaded', skills });
}

/** Omit server-only diagnostics from snapshots sent to the browser (SSE). */
function stripEvaluationSnapshotForStream(s: EvaluationRoundSnapshot): EvaluationRoundSnapshot {
  const stripWorker = (w?: EvaluatorWorkerReport): EvaluatorWorkerReport | undefined => {
    if (!w) return w;
    const { rawTrace: _rt, ...rest } = w;
    void _rt;
    return rest as EvaluatorWorkerReport;
  };
  const { evaluatorTraces: _et, ...aggRest } = s.aggregate;
  void _et;
  return {
    ...s,
    design: stripWorker(s.design),
    strategy: stripWorker(s.strategy),
    implementation: stripWorker(s.implementation),
    browser: stripWorker(s.browser),
    aggregate: aggRest,
  };
}

async function runEvaluationRound(
  options: AgenticOrchestratorOptions,
  streamCtx: StreamEmissionContext,
  round: number,
  files: Record<string, string>,
  parallel: boolean,
): Promise<EvaluationRoundSnapshot> {
  await emit(streamCtx, {
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
      await emit(streamCtx, { type: 'evaluation_worker_done', round, rubric, report });
    },
  });

  const rawAgg = aggregateEvaluationReports(workers, options.rubricWeights);
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

  await emit(streamCtx, {
    type: 'evaluation_report',
    round,
    snapshot: stripEvaluationSnapshotForStream(snapshot),
  });
  return snapshot;
}

function appendEvaluationRoundHistory(
  snapshot: EvaluationRoundSnapshot,
  history: EvaluationRoundHistoryEntry[],
): void {
  history.push({
    round: snapshot.round,
    rubricMeans: rubricMeansFromNormalizedScores(snapshot.aggregate.normalizedScores),
    overallScore: snapshot.aggregate.overallScore,
    hardFailCount: snapshot.aggregate.hardFails.length,
    normalizedScores: { ...snapshot.aggregate.normalizedScores },
  });
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
  streamCtx: StreamEmissionContext,
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
  await emitSkillsLoaded(streamCtx, ctx.loadedSkills, tracePhase);
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
        input: { mode: GENERATION_MODE.AGENTIC },
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
  const streamFailureCtrl = new AbortController();
  const upstreamSignal = options.build.signal;
  const effectiveSignal =
    upstreamSignal != null
      ? AbortSignal.any([upstreamSignal, streamFailureCtrl.signal])
      : streamFailureCtrl.signal;
  const mergedOptions: AgenticOrchestratorOptions = {
    ...options,
    build: { ...options.build, signal: effectiveSignal },
  };
  const streamCtx: StreamEmissionContext = {
    onStream: options.onStream,
    onDeliveryFailure: () => streamFailureCtrl.abort(),
  };
  const maxRevisions = Math.max(0, Math.min(20, options.maxRevisionRounds));
  const satisfactionOpts =
    options.minOverallScore != null && Number.isFinite(options.minOverallScore)
      ? { minOverallScore: options.minOverallScore }
      : undefined;

  const acquired = await acquireAgenticSlotOrReject();
  if (!acquired) {
    await emit(streamCtx, {
      type: 'error',
      payload:
        'Too many agentic design runs are active on this server. Please wait a moment and try again.',
    });
    return null;
  }

  try {
    let piTracePhase: AgenticPhase = 'building';
  const forward = async (e: AgentRunEvent) => {
    if (e.type === 'skill_activated') {
      await emit(streamCtx, {
        type: 'trace',
        trace: makeRunTraceEvent({
          kind: 'skill_activated',
          label: `Skill activated: ${e.name} (${e.key})`,
          phase: piTracePhase,
          status: 'success',
        }),
      });
    }
    await emit(streamCtx, e);
  };

  await emit(streamCtx, { type: 'phase', phase: 'building' });

  const setPiTrace = (p: AgenticPhase) => {
    piTracePhase = p;
  };
  const buildResult = await runAgenticPiSessionRound(
    mergedOptions,
    streamCtx,
    forward,
    'building',
    setPiTrace,
    (ctx) => {
      const initialSeedFiles = {
        ...ctx.sandboxSeedFiles,
        ...(mergedOptions.build.seedFiles ?? {}),
      };
      const seedFilesForBuild =
        Object.keys(initialSeedFiles).length > 0 ? initialSeedFiles : undefined;
      return { seedFiles: seedFilesForBuild };
    },
  );
  if (!buildResult || effectiveSignal.aborted) return null;

  let files = buildResult.files;
  const rounds: EvaluationRoundSnapshot[] = [];
  const roundHistory: EvaluationRoundHistoryEntry[] = [];
  const revisionPromptByEvalRound = new Map<number, string>();
  let revisionAttempts = 0;
  let lastRevisionBrief: string | undefined;

  const finishWithLog = (result: AgenticOrchestratorResult): AgenticOrchestratorResult => {
    const baseDir = env.OBSERVABILITY_LOG_BASE_DIR;
    if (baseDir) {
      void writeAgenticEvalRunLog({
        baseDir,
        runId: mergedOptions.build.correlationId ?? randomUUID(),
        compiledPrompt: mergedOptions.compiledPrompt,
        evaluationContext: mergedOptions.evaluationContext,
        getPromptBody: mergedOptions.getPromptBody,
        rounds: result.rounds,
        revisionPromptByEvalRound,
        stopReason: result.checkpoint.stopReason ?? 'unknown',
        finalAggregate: result.finalAggregate,
      }).catch((err) => {
        if (env.isDev) console.warn('[eval-run-log]', normalizeError(err), err);
      });
    }
    return result;
  };

  await emit(streamCtx, { type: 'phase', phase: 'evaluating' });
  let evalRound = 1;
  let snapshot = await runEvaluationRound(mergedOptions, streamCtx, evalRound, files, parallel);
  rounds.push(snapshot);
  appendEvaluationRoundHistory(snapshot, roundHistory);

  if (effectiveSignal.aborted) {
    return finishWithLog(
      agenticResult(files, rounds, snapshot, {
        stopReason: 'aborted',
        revisionAttempts,
        revisionBriefApplied: lastRevisionBrief,
      }),
    );
  }

  const revisionUserInstructions = (await options.getPromptBody('designer-agentic-revision-user')).trim();

  while (
    !isEvalSatisfied(snapshot.aggregate, satisfactionOpts) &&
    revisionAttempts < maxRevisions &&
    !effectiveSignal.aborted
  ) {
    await emit(streamCtx, { type: 'phase', phase: 'revising' });
    const brief = snapshot.aggregate.revisionBrief;
    lastRevisionBrief = brief;

    await emit(streamCtx, {
      type: 'revision_round',
      round: revisionAttempts + 1,
      brief,
    });

    const tracesSection = buildEvaluatorTracesSection(snapshot.aggregate.evaluatorTraces);
    const revisionParts = [
      buildRevisionUserContext(options.compiledPrompt, options.evaluationContext),
      revisionUserInstructions,
      '',
      buildRoundHistorySection(roundHistory),
      '## Revision brief',
      brief,
    ];
    if (tracesSection.length > 0) {
      revisionParts.push('', tracesSection);
    }
    revisionParts.push(
      '',
      '## Prioritized fixes',
      ...snapshot.aggregate.prioritizedFixes.map((f, i) => `${i + 1}. ${f}`),
    );
    const revisionUser = revisionParts.join('\n');
    revisionPromptByEvalRound.set(snapshot.round, revisionUser);

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

    const revised = await runAgenticPiSessionRound(mergedOptions, streamCtx, forward, 'revising', setPiTrace, (ctx) => ({
      userPrompt: revisionUser,
      seedFiles: mergeSeedWithDesign(files, ctx.sandboxSeedFiles),
      compactionNote: `Post-evaluation revision requested. Overall ${snapshot.aggregate.overallScore.toFixed(2)}. Hard fails: ${snapshot.aggregate.hardFails.length}.`,
      initialProgressMessage: 'Revising design from evaluation feedback…',
    }));

    if (!revised || effectiveSignal.aborted) {
      const stopReason: AgenticStopReason = effectiveSignal.aborted ? 'aborted' : 'revision_failed';
      debugAgentIngest({
        hypothesisId: 'H7',
        location: 'agentic-orchestrator.ts:revision_end',
        message: 'runDesignAgentSession (revision) aborted or null',
        data: { revisionAttempt: revisionAttempts + 1, aborted: !!effectiveSignal.aborted },
      });
      return finishWithLog(
        agenticResult(files, rounds, snapshot, {
          stopReason,
          revisionAttempts,
          revisionBriefApplied: lastRevisionBrief,
        }),
      );
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

    await emit(streamCtx, { type: 'phase', phase: 'evaluating' });
    snapshot = await runEvaluationRound(mergedOptions, streamCtx, evalRound, files, parallel);
    rounds.push(snapshot);
    appendEvaluationRoundHistory(snapshot, roundHistory);

    if (effectiveSignal.aborted) {
      return finishWithLog(
        agenticResult(files, rounds, snapshot, {
          stopReason: 'aborted',
          revisionAttempts,
          revisionBriefApplied: lastRevisionBrief,
        }),
      );
    }
  }

  const satisfied = isEvalSatisfied(snapshot.aggregate, satisfactionOpts);
  const stopReason: AgenticStopReason = effectiveSignal.aborted
    ? 'aborted'
    : satisfied
      ? 'satisfied'
      : 'max_revisions';

  await emit(streamCtx, { type: 'phase', phase: 'complete' });
  return finishWithLog(
    agenticResult(files, rounds, snapshot, {
      stopReason,
      revisionAttempts,
      revisionBriefApplied: lastRevisionBrief,
    }),
  );
  } finally {
    releaseAgenticSlot();
  }
}
