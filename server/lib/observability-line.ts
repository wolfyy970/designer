/** Shared envelope for NDGET + NDJSON file (v1). Kept server-only to avoid client import cycles. */

export const OBSERVABILITY_SCHEMA_VERSION = 1 as const;

export type ObservabilityLine =
  | ObservabilityLineLlm
  | ObservabilityLineTrace
  | ObservabilityLineTaskResult
  | ObservabilityLineTaskRun
  | ObservabilityLineIncubateParsed;

export interface ObservabilityLineLlm {
  v: typeof OBSERVABILITY_SCHEMA_VERSION;
  ts: string;
  type: 'llm';
  /** Full [`LlmLogEntry`](../log-store.ts)-compatible object */
  payload: Record<string, unknown>;
}

export interface ObservabilityTracePayload {
  event: Record<string, unknown>;
  correlationId?: string;
  resultId?: string;
}

export interface ObservabilityLineTrace {
  v: typeof OBSERVABILITY_SCHEMA_VERSION;
  ts: string;
  type: 'trace';
  payload: ObservabilityTracePayload;
}

/** Raw task output file from Pi sandbox (incubate, inputs-gen, design-system extract). */
export interface ObservabilityLineTaskResult {
  v: typeof OBSERVABILITY_SCHEMA_VERSION;
  ts: string;
  type: 'task_result';
  payload: Record<string, unknown>;
}

/** End-of-run summary for `executeTaskAgentStream`. */
export interface ObservabilityLineTaskRun {
  v: typeof OBSERVABILITY_SCHEMA_VERSION;
  ts: string;
  type: 'task_run';
  payload: Record<string, unknown>;
}

/** Parsed incubation plan before SSE `incubate_result` (route-level). */
export interface ObservabilityLineIncubateParsed {
  v: typeof OBSERVABILITY_SCHEMA_VERSION;
  ts: string;
  type: 'incubate_parsed';
  payload: {
    correlationId: string;
    hypothesisCount: number;
    hypothesisNames: string[];
    firstHypothesisText: string;
    dimensionCount: number;
  };
}
