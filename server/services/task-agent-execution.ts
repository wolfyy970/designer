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
import { buildAgenticSystemContext } from '../lib/build-agentic-system-context.ts';
import type { SessionType } from '../lib/skill-discovery.ts';
import { runDesignAgentSession, type AgentRunEvent } from './pi-agent-service.ts';
import { emitSkillsLoadedEvents } from '../lib/agentic-skills-emission.ts';
import { acquireAgenticSlotOrReject, releaseAgenticSlot } from '../lib/agentic-concurrency.ts';
import { env } from '../env.ts';
import type { SseStreamWriter } from './generate-execution.ts';
import { createWriteGate, type WriteGate } from '../lib/sse-write-gate.ts';
import { OBSERVABILITY_SCHEMA_VERSION } from '../lib/observability-line.ts';
import { writeObservabilityLine } from '../lib/observability-sink.ts';
import { appendTaskResultLogEntry, appendTaskRunLogEntry } from '../log-store.ts';
import { writeTaskRunDiskLog } from '../lib/task-run-logger.ts';

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
  initialProgressMessage?: string;
}

export interface TaskAgentResult {
  result: string;
  resultFile: string;
  files: Record<string, string>;
}

type TaskOutcome = 'success' | 'error' | 'no_result';

export class TaskAgentExecutionError extends Error {
  readonly outcome: Exclude<TaskOutcome, 'success'>;

  constructor(message: string, outcome: Exclude<TaskOutcome, 'success'> = 'error') {
    super(message);
    this.name = 'TaskAgentExecutionError';
    this.outcome = outcome;
  }
}

function emitTaskResultLine(input: {
  sessionType: SessionType;
  correlationId: string;
  resultFile: string;
  resultContent: string;
  files: Record<string, string>;
}): void {
  const ts = new Date().toISOString();
  writeObservabilityLine({
    v: OBSERVABILITY_SCHEMA_VERSION,
    ts,
    type: 'task_result',
    payload: {
      sessionType: input.sessionType,
      correlationId: input.correlationId,
      resultFile: input.resultFile,
      resultContent: input.resultContent,
      sandboxFilePaths: Object.keys(input.files),
    },
  });
  appendTaskResultLogEntry({
    correlationId: input.correlationId,
    sessionType: input.sessionType,
    resultFile: input.resultFile,
    resultContent: input.resultContent,
    sandboxFilePaths: Object.keys(input.files),
  });
  if (env.isDev) {
    console.debug('[task-agent] result extracted', {
      sessionType: input.sessionType,
      correlationId: input.correlationId,
      resultFile: input.resultFile,
      resultChars: input.resultContent.length,
      sandboxFileCount: Object.keys(input.files).length,
    });
  }
}

function emitTaskRunLine(input: {
  sessionType: SessionType;
  correlationId: string;
  providerId: string;
  modelId: string;
  durationMs: number;
  outcome: TaskOutcome;
  resultFile?: string;
  sandboxFileCount: number;
  errorMessage?: string;
  thinking?: ThinkingConfig;
}): void {
  const ts = new Date().toISOString();
  writeObservabilityLine({
    v: OBSERVABILITY_SCHEMA_VERSION,
    ts,
    type: 'task_run',
    payload: {
      sessionType: input.sessionType,
      correlationId: input.correlationId,
      providerId: input.providerId,
      modelId: input.modelId,
      durationMs: input.durationMs,
      outcome: input.outcome,
      resultFile: input.resultFile,
      sandboxFileCount: input.sandboxFileCount,
      errorMessage: input.errorMessage,
      thinking: input.thinking,
    },
  });
  appendTaskRunLogEntry({
    correlationId: input.correlationId,
    sessionType: input.sessionType,
    providerId: input.providerId,
    modelId: input.modelId,
    durationMs: input.durationMs,
    outcome: input.outcome,
    resultFile: input.resultFile,
    sandboxFileCount: input.sandboxFileCount,
    errorMessage: input.errorMessage,
    thinking: input.thinking,
  });
  if (env.isDev) {
    console.debug('[task-agent] task_run summary', {
      ...input,
      ts,
    });
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
  let outcome: TaskOutcome = 'error';
  let errorMessage: string | undefined;
  let resultFileUsed: string | undefined;
  let sandboxFileCount = 0;

  const gate = options.writeGate ?? createWriteGate();

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

  const acquired = await acquireAgenticSlotOrReject();
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
    await write(SSE_EVENT_NAMES.phase, { phase: 'building' });

    const ctx = await buildAgenticSystemContext({ sessionType: input.sessionType });
    await emitSkillsLoadedEvents(writeEvent, ctx.loadedSkills, 'building');

    const forward = async (e: AgentRunEvent): Promise<void> => {
      await writeEvent(e);
    };

    const sessionResult = await runDesignAgentSession(
      {
        userPrompt: input.userPrompt,
        providerId: input.providerId,
        modelId: input.modelId,
        thinkingLevel: input.thinking?.level,
        signal: input.signal,
        correlationId,
        sessionType: input.sessionType,
        systemPrompt: ctx.systemPrompt,
        skillCatalog: ctx.skillCatalog,
        seedFiles: ctx.sandboxSeedFiles,
        initialProgressMessage:
          input.initialProgressMessage ?? 'Starting task…',
      },
      forward,
    );

    if (!sessionResult) {
      errorMessage = 'Agent session completed without result.';
      throw new TaskAgentExecutionError(errorMessage, 'no_result');
    }

    sandboxFileCount = Object.keys(sessionResult.files).length;
    const resultFile = input.resultFile ?? 'result.json';
    resultFileUsed = resultFile;
    const resultContent = sessionResult.files[resultFile];

    if (resultContent != null) {
      outcome = 'success';
      emitTaskResultLine({
        sessionType: input.sessionType,
        correlationId,
        resultFile,
        resultContent,
        files: sessionResult.files,
      });
      const baseDir = env.OBSERVABILITY_LOG_BASE_DIR;
      if (baseDir) {
        void writeTaskRunDiskLog({
          baseDir,
          correlationId,
          sessionType: input.sessionType,
          providerId: input.providerId,
          modelId: input.modelId,
          userPrompt: input.userPrompt,
          resultFile,
          resultContent,
          sandboxFilePaths: Object.keys(sessionResult.files),
          skillKeys: ctx.loadedSkills.map((s) => s.key),
          durationMs: Date.now() - startedAt,
          outcome: 'success',
        }).catch((err) => {
          if (env.isDev) console.error('[task-agent] writeTaskRunDiskLog failed', err);
        });
      }
      return { result: resultContent, resultFile, files: sessionResult.files };
    }

    const firstFile = Object.entries(sessionResult.files).find(
      ([, content]) => content.trim().length > 0,
    );
    if (firstFile) {
      outcome = 'success';
      const [altFile, altContent] = firstFile;
      resultFileUsed = altFile;
      emitTaskResultLine({
        sessionType: input.sessionType,
        correlationId,
        resultFile: altFile,
        resultContent: altContent,
        files: sessionResult.files,
      });
      const baseDir = env.OBSERVABILITY_LOG_BASE_DIR;
      if (baseDir) {
        void writeTaskRunDiskLog({
          baseDir,
          correlationId,
          sessionType: input.sessionType,
          providerId: input.providerId,
          modelId: input.modelId,
          userPrompt: input.userPrompt,
          resultFile: altFile,
          resultContent: altContent,
          sandboxFilePaths: Object.keys(sessionResult.files),
          skillKeys: ctx.loadedSkills.map((s) => s.key),
          durationMs: Date.now() - startedAt,
          outcome: 'success',
        }).catch((err) => {
          if (env.isDev) console.error('[task-agent] writeTaskRunDiskLog failed', err);
        });
      }
      return { result: altContent, resultFile: altFile, files: sessionResult.files };
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
    releaseAgenticSlot();
  }
}
