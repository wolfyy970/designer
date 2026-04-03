/** Local Cursor/agent debug ingest — only when `DEBUG_AGENT_INGEST=1`. */
const DEBUG_AGENT_INGEST_URL =
  'http://127.0.0.1:7576/ingest/83c687e1-03e6-457d-9b2a-e5ea8f1db0e1';

/** Default correlation id for ingest payloads and `X-Debug-Session-Id` header. */
const DEBUG_AGENT_INGEST_SESSION_ID = '5b9be9';

export type DebugAgentIngestPayload = {
  sessionId?: string;
  hypothesisId?: string;
  location: string;
  message: string;
  data?: Record<string, unknown>;
};

export function debugAgentIngest(payload: DebugAgentIngestPayload): void {
  if (process.env.DEBUG_AGENT_INGEST !== '1') return;
  const sessionId = payload.sessionId ?? DEBUG_AGENT_INGEST_SESSION_ID;
  fetch(DEBUG_AGENT_INGEST_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Debug-Session-Id': sessionId,
    },
    body: JSON.stringify({
      ...payload,
      sessionId,
      timestamp: Date.now(),
    }),
  }).catch(() => {});
}
