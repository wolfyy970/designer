/** Shared envelope for NDGET + NDJSON file (v1). Kept server-only to avoid client import cycles. */

export const OBSERVABILITY_SCHEMA_VERSION = 1 as const;

export type ObservabilityLine =
  | ObservabilityLineLlm
  | ObservabilityLineTrace;

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
