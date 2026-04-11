/** Local Cursor/agent debug ingest — only when `DEBUG_AGENT_INGEST=1`. */
import {
  buildDebugAgentIngestBody,
  DEBUG_AGENT_INGEST_SESSION_ID,
  DEBUG_AGENT_INGEST_URL,
  type DebugAgentIngestPayload,
} from '../../src/lib/debug-agent-ingest-shared.ts';

export type { DebugAgentIngestPayload };

export function debugAgentIngest(payload: DebugAgentIngestPayload): void {
  if (process.env.DEBUG_AGENT_INGEST !== '1') return;
  const sessionId = payload.sessionId ?? DEBUG_AGENT_INGEST_SESSION_ID;
  fetch(DEBUG_AGENT_INGEST_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Debug-Session-Id': sessionId,
    },
    body: buildDebugAgentIngestBody(payload),
  }).catch(() => {});
}
