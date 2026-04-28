import type { Context } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { ThinkingOverride, ThinkingTask } from '../../src/lib/thinking-defaults.ts';
import { resolveThinkingConfig } from '../../src/lib/thinking-defaults.ts';
import { env } from '../env.ts';
import { runTaskAgentSseBody, type TaskAgentSseWrite } from './sse-task-route.ts';
import { executeTaskAgentStream, type TaskAgentResult } from '../services/task-agent-execution.ts';
import type { SessionType } from './skill-discovery.ts';

export interface TaskAgentRouteBody {
  providerId: string;
  modelId: string;
  thinking?: ThinkingOverride;
}

export interface TaskAgentRouteResultContext {
  write: TaskAgentSseWrite;
  correlationId: string;
}

export interface TaskAgentRouteOptions<TBody extends TaskAgentRouteBody> {
  routeLabel: string;
  body: TBody;
  userPrompt: string;
  sessionType: SessionType;
  thinkingTask: ThinkingTask;
  resultFile: string;
  resultFileFallback?: 'firstNonEmptyFile' | 'strict';
  initialProgressMessage: string;
  debugPayload?: (body: TBody) => Record<string, unknown>;
  onTaskResult: (
    taskResult: TaskAgentResult,
    ctx: TaskAgentRouteResultContext,
  ) => Promise<void>;
}

export function runTaskAgentRoute<TBody extends TaskAgentRouteBody>(
  c: Context,
  options: TaskAgentRouteOptions<TBody>,
): Response {
  return streamSSE(c, async (stream) => {
    const abortSignal = c.req.raw.signal;
    const correlationId = crypto.randomUUID();
    if (env.isDev) {
      console.debug(`[${options.routeLabel}] request`, {
        correlationId,
        providerId: options.body.providerId,
        modelId: options.body.modelId,
        ...options.debugPayload?.(options.body),
      });
    }
    await runTaskAgentSseBody(stream, async ({ write, allocId, gate }) => {
      const thinking = resolveThinkingConfig(
        options.thinkingTask,
        options.body.modelId,
        options.body.thinking,
      );
      const taskResult = await executeTaskAgentStream(
        stream,
        {
          userPrompt: options.userPrompt,
          providerId: options.body.providerId,
          modelId: options.body.modelId,
          sessionType: options.sessionType,
          thinking,
          signal: abortSignal,
          correlationId,
          resultFile: options.resultFile,
          resultFileFallback: options.resultFileFallback ?? 'firstNonEmptyFile',
          initialProgressMessage: options.initialProgressMessage,
        },
        { allocId, writeGate: gate },
      );

      await options.onTaskResult(taskResult, { write, correlationId });
    });
  });
}
