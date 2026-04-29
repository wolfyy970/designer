/**
 * Generic agentic task execution — runs a Pi agent session for non-design tasks
 * (incubation, inputs-gen, design-system-extract) and streams events via SSE.
 *
 * Unlike design generation, task sessions:
 * - Use build-only mode (no evaluation/revision loop)
 * - Extract a result from a designated output file in the sandbox
 * - Return the task result so the calling route can emit domain-specific events
 */
import { normalizeError } from '../../src/lib/error-utils.ts';
import { SSE_EVENT_NAMES } from '../../src/constants/sse-events.ts';
import type { ThinkingConfig } from '../../src/lib/thinking-defaults.ts';
import { agenticOrchestratorEventToSse } from '../lib/agentic-sse-map.ts';
import type { SessionType } from '../lib/skill-discovery.ts';
import { env } from '../env.ts';
import type { SseStreamWriter } from './generate-execution.ts';
import { createWriteGate, type WriteGate } from '../lib/sse-write-gate.ts';
import { resolveTaskAgentResultFile } from './task-agent-result-files.ts';
import {
  emitTaskResultLine,
  emitTaskRunLine,
  type TaskAgentOutcome,
  writeSuccessfulTaskRunDiskLog,
} from './task-agent-observability.ts';
import { acquireTaskAgentSlot, releaseTaskAgentSlot } from './task-agent-slot.ts';
import { runTaskAgentPiSession } from './task-agent-session.ts';

export interface TaskAgentInput {
  userPrompt: string;
  providerId: string;
  modelId: string;
  sessionType: SessionType;
  /**
   * Resolved thinking config (from `resolveThinkingConfig`). `thinking.level` is
   * forwarded to Pi; the full object is logged for observability.
   */
  thinking?: ThinkingConfig;
  signal?: AbortSignal;
  correlationId?: string;
  /** File path in the sandbox to extract as the task result (default: 'result.json'). */
  resultFile?: string;
  /**
   * Current routes historically accept the first non-empty sandbox file when
   * the requested file is missing. Keep that behavior explicit so stricter
   * routes can opt in later without changing the executor contract.
   */
  resultFileFallback?: 'firstNonEmptyFile' | 'strict';
  initialProgressMessage?: string;
}

export interface TaskAgentResult {
  result: string;
  resultFile: string;
  files: Record<string, string>;
}

export class TaskAgentExecutionError extends Error {
  readonly outcome: Exclude<TaskAgentOutcome, 'success'>;

  constructor(message: string, outcome: Exclude<TaskAgentOutcome, 'success'> = 'error') {
    super(message);
    this.name = 'TaskAgentExecutionError';
    this.outcome = outcome;
  }
}

/**
 * Run an agentic task and stream progress events. Returns the task result on
 * success, or throws a task error for the route wrapper to serialize.
 */
export async function executeTaskAgentStream(
  stream: SseStreamWriter,
  input: TaskAgentInput,
  options: {
    allocId: () => string;
    writeGate?: WriteGate;
  },
): Promise<TaskAgentResult> {
  const startedAt = Date.now();
  const correlationId = input.correlationId ?? crypto.randomUUID();
  let outcome: TaskAgentOutcome = 'error';
  let errorMessage: string | undefined;
  let resultFileUsed: string | undefined;
  let sandboxFileCount = 0;

  const gate = options.writeGate ?? createWriteGate();
  const logContext = {
    sessionType: input.sessionType,
    correlationId,
    providerId: input.providerId,
    modelId: input.modelId,
  };
  const log = env.isDev ? console.debug : console.info;

  const write = async (event: string, data: Record<string, unknown>) => {
    const payload = JSON.stringify(data);
    await gate.enqueue(async () => {
      await stream.writeSSE({ data: payload, event, id: options.allocId() });
    });
  };

  const writeEvent = async (event: Parameters<typeof agenticOrchestratorEventToSse>[0]) => {
    if (input.signal?.aborted) return;
    const { sseEvent, data } = agenticOrchestratorEventToSse(event);
    await write(sseEvent, data);
  };

  const acquired = await acquireTaskAgentSlot();
  if (!acquired) {
    errorMessage = 'Too many agentic runs are active. Please wait and try again.';
    emitTaskRunLine({
      sessionType: input.sessionType,
      correlationId,
      providerId: input.providerId,
      modelId: input.modelId,
      durationMs: Date.now() - startedAt,
      outcome: 'error',
      sandboxFileCount: 0,
      errorMessage,
      thinking: input.thinking,
    });
    throw new TaskAgentExecutionError(errorMessage, 'error');
  }

  try {
    log('[task-agent] acquired', logContext);
    await write(SSE_EVENT_NAMES.phase, { phase: 'building' });
    log('[task-agent] first_sse_write', logContext);

    log('[task-agent] pi_session_start', logContext);
    const { sessionResult, skillKeys } = await runTaskAgentPiSession(
      {
        userPrompt: input.userPrompt,
        providerId: input.providerId,
        modelId: input.modelId,
        sessionType: input.sessionType,
        thinking: input.thinking,
        signal: input.signal,
        correlationId,
        initialProgressMessage: input.initialProgressMessage,
      },
      writeEvent,
    );
    log('[task-agent] pi_session_end', {
      ...logContext,
      hasResult: Boolean(sessionResult),
      skillCount: skillKeys.length,
    });

    if (!sessionResult) {
      errorMessage = 'Agent session completed without result.';
      throw new TaskAgentExecutionError(errorMessage, 'no_result');
    }

    sandboxFileCount = Object.keys(sessionResult.files).length;
    const resultFile = input.resultFile ?? 'result.json';
    resultFileUsed = resultFile;

    const resolved = resolveTaskAgentResultFile({
      files: sessionResult.files,
      resultFile,
      fallback: input.resultFileFallback ?? 'firstNonEmptyFile',
    });

    if (resolved) {
      outcome = 'success';
      resultFileUsed = resolved.resultFile;
      emitTaskResultLine({
        sessionType: input.sessionType,
        correlationId,
        resultFile: resolved.resultFile,
        resultContent: resolved.result,
        files: sessionResult.files,
      });
      writeSuccessfulTaskRunDiskLog({
        baseDir: env.OBSERVABILITY_LOG_BASE_DIR,
        correlationId,
        sessionType: input.sessionType,
        providerId: input.providerId,
        modelId: input.modelId,
        userPrompt: input.userPrompt,
        resultFile: resolved.resultFile,
        resultContent: resolved.result,
        sandboxFilePaths: Object.keys(sessionResult.files),
        skillKeys,
        durationMs: Date.now() - startedAt,
      });
      return { result: resolved.result, resultFile: resolved.resultFile, files: sessionResult.files };
    }

    outcome = 'no_result';
    errorMessage = `Agent did not write the expected result file (${resultFile}).`;
    throw new TaskAgentExecutionError(errorMessage, 'no_result');
  } catch (err) {
    errorMessage = normalizeError(err);
    if (err instanceof TaskAgentExecutionError) {
      outcome = err.outcome;
    } else {
      outcome = 'error';
    }
    throw err;
  } finally {
    log('[task-agent] finished', {
      ...logContext,
      durationMs: Date.now() - startedAt,
      outcome,
      resultFile: resultFileUsed,
      sandboxFileCount,
    });
    emitTaskRunLine({
      sessionType: input.sessionType,
      correlationId,
      providerId: input.providerId,
      modelId: input.modelId,
      durationMs: Date.now() - startedAt,
      outcome,
      resultFile: resultFileUsed,
      sandboxFileCount,
      errorMessage: outcome !== 'success' ? errorMessage : undefined,
      thinking: input.thinking,
    });
    releaseTaskAgentSlot();
  }
}
