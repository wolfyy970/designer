/** Browser: local debug ingest when dev + `VITE_DEBUG_AGENT_INGEST=1`. */
import {
  buildDebugAgentIngestBody,
  DEBUG_AGENT_INGEST_SESSION_ID,
  DEBUG_AGENT_INGEST_URL,
  type DebugAgentIngestPayload,
} from './debug-agent-ingest-shared';

export type { DebugAgentIngestPayload };

type ViteEnv = { DEV?: boolean; VITE_DEBUG_AGENT_INGEST?: string };

function clientIngestEnabled(): boolean {
  const env = (import.meta as { env?: ViteEnv }).env;
  return Boolean(env?.DEV && env.VITE_DEBUG_AGENT_INGEST === '1');
}

export function debugAgentIngest(payload: DebugAgentIngestPayload): void {
  if (!clientIngestEnabled()) return;
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
