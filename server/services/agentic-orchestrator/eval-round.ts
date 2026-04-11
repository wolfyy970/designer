import type { EvaluationRoundSnapshot, EvaluatorWorkerReport } from '../../../src/types/evaluation.ts';
import { aggregateEvaluationReports, enforceRevisionGate, runEvaluationWorkers } from '../design-evaluation-service.ts';
import type { AgenticOrchestratorOptions } from './types.ts';
import { emitOrchestratorEvent, type StreamEmissionContext } from './emit.ts';

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

export async function runEvaluationRound(
  options: AgenticOrchestratorOptions,
  streamCtx: StreamEmissionContext,
  round: number,
  files: Record<string, string>,
  parallel: boolean,
): Promise<EvaluationRoundSnapshot> {
  await emitOrchestratorEvent(streamCtx, {
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
    context: options.evaluationContext ?? undefined,
    providerId: options.build.providerId,
    modelId: options.build.modelId,
    evaluatorProviderId: options.evaluatorProviderId,
    evaluatorModelId: options.evaluatorModelId,
    parallel,
    correlationId: options.build.correlationId,
    signal: options.build.signal,
    onWorkerDone: async (rubric, report) => {
      await emitOrchestratorEvent(streamCtx, { type: 'evaluation_worker_done', round, rubric, report });
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

  await emitOrchestratorEvent(streamCtx, {
    type: 'evaluation_report',
    round,
    snapshot: stripEvaluationSnapshotForStream(snapshot),
  });
  return snapshot;
}
