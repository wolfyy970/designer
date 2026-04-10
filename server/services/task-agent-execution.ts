/**
 * Generic agentic task execution — runs a Pi agent session for non-design tasks
 * (incubation, inputs-gen, design-system-extract) and streams events via SSE.
 *
 * Unlike design generation, task sessions:
 * - Use build-only mode (no evaluation/revision loop)
 * - Extract a result from a designated output file in the sandbox
 * - Return the result so the calling route can emit domain-specific events
 */
import { normalizeError } from '../../src/lib/error-utils.ts';
import { SSE_EVENT_NAMES } from '../../src/constants/sse-events.ts';
import { agenticOrchestratorEventToSse } from '../lib/agentic-sse-map.ts';
import { buildAgenticSystemContext } from '../lib/build-agentic-system-context.ts';
import type { SessionType } from '../lib/skill-discovery.ts';
import { runDesignAgentSession, type AgentRunEvent } from './pi-agent-service.ts';
import type { LoadedSkillSummary } from '../lib/skill-schema.ts';
import { makeRunTraceEvent } from '../lib/run-trace.ts';
import { acquireAgenticSlotOrReject, releaseAgenticSlot } from '../lib/agentic-concurrency.ts';
import { env } from '../env.ts';
import type { SseStreamWriter } from './generate-execution.ts';
import { createWriteGate, type WriteGate } from '../lib/sse-write-gate.ts';

export interface TaskAgentInput {
  userPrompt: string;
  providerId: string;
  modelId: string;
  sessionType: SessionType;
  thinkingLevel?: 'off' | 'minimal' | 'low' | 'medium' | 'high';
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

async function emitSkillsLoaded(
  onStream: (e: Parameters<typeof agenticOrchestratorEventToSse>[0]) => Promise<void>,
  skills: LoadedSkillSummary[],
): Promise<void> {
  const label =
    skills.length === 0
      ? 'No agent skills in catalog for this session'
      : `Skills catalog (${skills.length}): ${skills.map((s) => s.name).join(', ')}`;
  await onStream({
    type: 'trace',
    trace: makeRunTraceEvent({
      kind: 'skills_loaded',
      label,
      phase: 'building',
      status: skills.length === 0 ? 'info' : 'success',
    }),
  });
  await onStream({ type: 'skills_loaded', skills });
}

/**
 * Run an agentic task and stream events. Returns the task result (or null on failure).
 * The calling route is responsible for emitting the final result event and `done`.
 */
export async function executeTaskAgentStream(
  stream: SseStreamWriter,
  input: TaskAgentInput,
  options: {
    allocId: () => string;
    writeGate?: WriteGate;
  },
): Promise<TaskAgentResult | null> {
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
    await write(SSE_EVENT_NAMES.error, {
      error: 'Too many agentic runs are active. Please wait and try again.',
    });
    await write(SSE_EVENT_NAMES.done, {});
    return null;
  }

  try {
    await write(SSE_EVENT_NAMES.phase, { phase: 'building' });

    const ctx = await buildAgenticSystemContext({ sessionType: input.sessionType });
    await emitSkillsLoaded(writeEvent, ctx.loadedSkills);

    const forward = async (e: AgentRunEvent): Promise<void> => {
      await writeEvent(e);
    };

    const sessionResult = await runDesignAgentSession(
      {
        userPrompt: input.userPrompt,
        providerId: input.providerId,
        modelId: input.modelId,
        thinkingLevel: input.thinkingLevel,
        signal: input.signal,
        correlationId: input.correlationId,
        systemPrompt: ctx.systemPrompt,
        skillCatalog: ctx.skillCatalog,
        seedFiles: ctx.sandboxSeedFiles,
        initialProgressMessage:
          input.initialProgressMessage ?? 'Starting task…',
      },
      forward,
    );

    if (!sessionResult) {
      await write(SSE_EVENT_NAMES.error, { error: 'Agent session completed without result.' });
      return null;
    }

    const resultFile = input.resultFile ?? 'result.json';
    const resultContent = sessionResult.files[resultFile];

    if (resultContent != null) {
      return { result: resultContent, resultFile, files: sessionResult.files };
    }

    const firstFile = Object.entries(sessionResult.files).find(
      ([, content]) => content.trim().length > 0,
    );
    if (firstFile) {
      return { result: firstFile[1], resultFile: firstFile[0], files: sessionResult.files };
    }

    await write(SSE_EVENT_NAMES.error, {
      error: `Agent did not write the expected result file (${resultFile}).`,
    });
    return null;
  } catch (err) {
    try {
      await write(SSE_EVENT_NAMES.error, { error: normalizeError(err) });
    } catch (writeErr) {
      if (env.isDev) {
        console.error('[task-agent] failed to write error event', writeErr);
      }
    }
    return null;
  } finally {
    releaseAgenticSlot();
  }
}
