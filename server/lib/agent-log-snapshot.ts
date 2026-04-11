/**
 * Writes `logs/agent-snapshot.json` — same payload as dev `GET /api/logs`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../env.ts';

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
const DEBOUNCE_MS = 500;

export function scheduleAgentLogSnapshot(): void {
  if (!env.isDev || process.env.VITEST === 'true') return;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void flushAgentLogSnapshot();
  }, DEBOUNCE_MS);
}

/** Flush immediately (e.g. after clear) without waiting for debounce. */
export function flushAgentLogSnapshotNow(): void {
  if (!env.isDev || process.env.VITEST === 'true') return;
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  void flushAgentLogSnapshot();
}

async function flushAgentLogSnapshot(): Promise<void> {
  try {
    const [{ getLogEntries, getTaskLogEntries }, { getTraceLogLines }] = await Promise.all([
      import('../log-store.ts'),
      import('../trace-log-store.ts'),
    ]);
    const dir = path.join(process.cwd(), 'logs');
    fs.mkdirSync(dir, { recursive: true });
    const payload = {
      updatedAt: new Date().toISOString(),
      note:
        'Mirror of dev GET /api/logs ({ llm, trace, task }). Regenerated when the log ring changes.',
      llm: getLogEntries(),
      trace: getTraceLogLines(),
      task: getTaskLogEntries(),
    };
    fs.writeFileSync(path.join(dir, 'agent-snapshot.json'), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  } catch (err) {
    if (env.isDev) console.warn('[agent-log-snapshot] write failed', err);
  }
}
