import type { ThinkingConfig } from '../../src/lib/thinking-defaults.ts';
import { env } from '../env.ts';
import type { SessionType } from '../lib/session-types.ts';
import { OBSERVABILITY_SCHEMA_VERSION } from '../lib/observability-line.ts';
import { writeObservabilityLine } from '../lib/observability-sink.ts';
import { writeTaskRunDiskLog } from '../lib/task-run-logger.ts';
import { appendTaskResultLogEntry, appendTaskRunLogEntry } from '../log-store.ts';

export type TaskAgentOutcome = 'success' | 'error' | 'no_result';

export function emitTaskResultLine(input: {
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

export function emitTaskRunLine(input: {
  sessionType: SessionType;
  correlationId: string;
  providerId: string;
  modelId: string;
  durationMs: number;
  outcome: TaskAgentOutcome;
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

export function writeSuccessfulTaskRunDiskLog(input: {
  baseDir: string | undefined;
  correlationId: string;
  sessionType: SessionType;
  providerId: string;
  modelId: string;
  userPrompt: string;
  resultFile: string;
  resultContent: string;
  sandboxFilePaths: string[];
  skillKeys: string[];
  durationMs: number;
}): void {
  if (!input.baseDir) return;
  void writeTaskRunDiskLog({
    baseDir: input.baseDir,
    correlationId: input.correlationId,
    sessionType: input.sessionType,
    providerId: input.providerId,
    modelId: input.modelId,
    userPrompt: input.userPrompt,
    resultFile: input.resultFile,
    resultContent: input.resultContent,
    sandboxFilePaths: input.sandboxFilePaths,
    skillKeys: input.skillKeys,
    durationMs: input.durationMs,
    outcome: 'success',
  }).catch((err) => {
    if (env.isDev) console.error('[task-agent] writeTaskRunDiskLog failed', err);
  });
}
