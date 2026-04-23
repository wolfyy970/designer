import { randomUUID } from 'node:crypto';
import type {
  AgenticPhase,
  AgenticStopReason,
  EvaluationRoundSnapshot,
} from '../../../src/types/evaluation.ts';
import { getProvider } from '../providers/registry.ts';
import { isEvalSatisfied } from '../design-evaluation-service.ts';
import { getPromptBody } from '../../lib/prompt-resolution.ts';
import { debugAgentIngest } from '../../lib/debug-agent-ingest.ts';
import { makeRunTraceEvent } from '../../lib/run-trace.ts';
import type { EvaluationRoundHistoryEntry } from '../../lib/agentic-revision-user.ts';
import { normalizeError } from '../../../src/lib/error-utils.ts';
import { env } from '../../env.ts';
import { writeAgenticEvalRunLog } from '../../lib/eval-run-logger.ts';
import { acquireAgenticSlotOrReject, releaseAgenticSlot } from '../../lib/agentic-concurrency.ts';
import type { AgentRunEvent } from '../pi-agent-run-types.ts';
import type { AgenticOrchestratorOptions, AgenticOrchestratorResult } from './types.ts';
import { MAX_REVISION_ROUNDS_CAP } from './types.ts';
import { emitOrchestratorEvent, type StreamEmissionContext } from './emit.ts';
import { runEvaluationRound } from './eval-round.ts';
import {
  agenticBuildOnlyResult,
  agenticResult,
  appendEvaluationRoundHistory,
} from './checkpoint.ts';
import { runAgenticPiSessionRound } from './pi-session-round.ts';
import { buildRevisionUserPrompt } from './revision-prompt.ts';
import { decideStopReason } from './stop-reason.ts';

export async function runAgenticWithEvaluation(
  options: AgenticOrchestratorOptions,
): Promise<AgenticOrchestratorResult | null> {
  return runAgenticWithEvaluationImpl(options);
}

async function runAgenticWithEvaluationImpl(
  options: AgenticOrchestratorOptions,
): Promise<AgenticOrchestratorResult | null> {
  const provider = getProvider(options.build.providerId);
  const parallel = provider?.supportsParallel ?? false;
  const streamFailureCtrl = options.streamFailureController ?? new AbortController();
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
  const maxRevisions = Math.max(0, Math.min(MAX_REVISION_ROUNDS_CAP, options.maxRevisionRounds));
  const satisfactionOpts =
    options.minOverallScore != null && Number.isFinite(options.minOverallScore)
      ? { minOverallScore: options.minOverallScore }
      : undefined;

  const acquired = await acquireAgenticSlotOrReject();
  if (!acquired) {
    await emitOrchestratorEvent(streamCtx, {
      type: 'error',
      payload:
        'Too many agentic design runs are active on this server. Please wait a moment and try again.',
    });
    return null;
  }

  try {
    const revisionPromptByEvalRound = new Map<number, string>();
    const finishWithLog = (result: AgenticOrchestratorResult): AgenticOrchestratorResult => {
      const baseDir = env.OBSERVABILITY_LOG_BASE_DIR;
      if (baseDir) {
        void writeAgenticEvalRunLog({
          baseDir,
          runId: mergedOptions.build.correlationId ?? randomUUID(),
          compiledPrompt: mergedOptions.compiledPrompt,
          evaluationContext: mergedOptions.evaluationContext ?? undefined,
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

    const tracePhaseRef = { current: 'building' as AgenticPhase };
    const forward = async (e: AgentRunEvent) => {
      if (e.type === 'skill_activated') {
        await emitOrchestratorEvent(streamCtx, {
          type: 'trace',
          trace: makeRunTraceEvent({
            kind: 'skill_activated',
            label: `Skill activated: ${e.name} (${e.key})`,
            phase: tracePhaseRef.current,
            status: 'success',
          }),
        });
      }
      await emitOrchestratorEvent(streamCtx, e);
    };

    await emitOrchestratorEvent(streamCtx, { type: 'phase', phase: 'building' });

    const setPiTrace = (p: AgenticPhase) => {
      tracePhaseRef.current = p;
    };
    const buildResult = await runAgenticPiSessionRound(
      mergedOptions,
      streamCtx,
      forward,
      'building',
      setPiTrace,
      () => {
        const extra = mergedOptions.build.seedFiles ?? {};
        const seedFilesForBuild = Object.keys(extra).length > 0 ? extra : undefined;
        return { seedFiles: seedFilesForBuild };
      },
    );
    if (!buildResult) return null;

    if (effectiveSignal.aborted) {
      if (env.isDev) {
        console.debug('[agentic-orchestrator] build phase: effectiveSignal aborted after Pi session', {
          correlationId: mergedOptions.build.correlationId,
          upstreamAbort: upstreamSignal?.aborted ?? false,
          deliveryAbort: streamFailureCtrl.signal.aborted,
        });
      }
      return finishWithLog(
        agenticBuildOnlyResult(
          buildResult.files,
          [...(buildResult.emittedFilePaths ?? [])],
          'aborted',
        ),
      );
    }

    let files = buildResult.files;
    const emittedDuringRun = new Set<string>(buildResult.emittedFilePaths ?? []);
    const rounds: EvaluationRoundSnapshot[] = [];
    const roundHistory: EvaluationRoundHistoryEntry[] = [];
    let revisionAttempts = 0;
    let lastRevisionBrief: string | undefined;

    const returnWithCheckpoint = (
      snapshotArg: EvaluationRoundSnapshot,
      stopReason: AgenticStopReason,
    ): AgenticOrchestratorResult =>
      finishWithLog(
        agenticResult(
          files,
          rounds,
          snapshotArg,
          {
            stopReason,
            revisionAttempts,
            revisionBriefApplied: lastRevisionBrief,
          },
          [...emittedDuringRun],
        ),
      );

    if (mergedOptions.evaluationContext === null) {
      await emitOrchestratorEvent(streamCtx, { type: 'phase', phase: 'complete' });
      return finishWithLog(agenticBuildOnlyResult(files, [...emittedDuringRun]));
    }

    await emitOrchestratorEvent(streamCtx, { type: 'phase', phase: 'evaluating' });
    let evalRound = 1;
    let snapshot = await runEvaluationRound(mergedOptions, streamCtx, evalRound, files, parallel);
    rounds.push(snapshot);
    appendEvaluationRoundHistory(snapshot, roundHistory);

    if (effectiveSignal.aborted) {
      return returnWithCheckpoint(snapshot, 'aborted');
    }

    const revisionUserInstructions = (await getPromptBody('designer-agentic-revision-user')).trim();

    while (
      !isEvalSatisfied(snapshot.aggregate, satisfactionOpts) &&
      revisionAttempts < maxRevisions &&
      !effectiveSignal.aborted
    ) {
      await emitOrchestratorEvent(streamCtx, { type: 'phase', phase: 'revising' });
      const brief = snapshot.aggregate.revisionBrief;
      lastRevisionBrief = brief;

      await emitOrchestratorEvent(streamCtx, {
        type: 'revision_round',
        round: revisionAttempts + 1,
        brief,
      });

      const revisionUser = buildRevisionUserPrompt({
        compiledPrompt: options.compiledPrompt,
        evaluationContext: options.evaluationContext,
        revisionUserInstructions,
        roundHistory,
        snapshot,
      });
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

      const revised = await runAgenticPiSessionRound(mergedOptions, streamCtx, forward, 'revising', setPiTrace, () => ({
        userPrompt: revisionUser,
        seedFiles: files,
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
        return returnWithCheckpoint(snapshot, stopReason);
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
      for (const p of revised.emittedFilePaths ?? []) {
        emittedDuringRun.add(p);
      }
      revisionAttempts += 1;
      evalRound += 1;

      await emitOrchestratorEvent(streamCtx, { type: 'phase', phase: 'evaluating' });
      snapshot = await runEvaluationRound(mergedOptions, streamCtx, evalRound, files, parallel);
      rounds.push(snapshot);
      appendEvaluationRoundHistory(snapshot, roundHistory);

      if (effectiveSignal.aborted) {
        return returnWithCheckpoint(snapshot, 'aborted');
      }
    }

    const stopReason = decideStopReason({
      aborted: effectiveSignal.aborted,
      satisfied: isEvalSatisfied(snapshot.aggregate, satisfactionOpts),
    });

    await emitOrchestratorEvent(streamCtx, { type: 'phase', phase: 'complete' });
    return returnWithCheckpoint(snapshot, stopReason);
  } finally {
    releaseAgenticSlot();
  }
}
