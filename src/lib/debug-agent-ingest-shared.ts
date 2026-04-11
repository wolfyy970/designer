/**
 * Shared debug-ingest URL and JSON body shape for server + browser wrappers.
 */

export const DEBUG_AGENT_INGEST_URL =
  'http://127.0.0.1:7576/ingest/83c687e1-03e6-457d-9b2a-e5ea8f1db0e1';

export const DEBUG_AGENT_INGEST_SESSION_ID = '5b9be9';

export type DebugAgentIngestPayload = {
  sessionId?: string;
  hypothesisId?: string;
  location: string;
  message: string;
  data?: Record<string, unknown>;
};

export function buildDebugAgentIngestBody(payload: DebugAgentIngestPayload): string {
  const sessionId = payload.sessionId ?? DEBUG_AGENT_INGEST_SESSION_ID;
  return JSON.stringify({
    ...payload,
    sessionId,
    timestamp: Date.now(),
  });
}
