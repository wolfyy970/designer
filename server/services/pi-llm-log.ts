/**
 * Wrap Pi `streamFn` (coding-agent `Agent`) so each model turn is recorded in the dev LLM log (`/api/logs`).
 */
import { performance } from 'node:perf_hooks';
import {
  streamSimple,
  type Context,
  type Message,
  type AssistantMessage,
  type UserMessage,
  type ToolResultMessage,
  piStreamCompletionMaxTokens,
} from './pi-sdk/index.ts';

/** Pi agent `streamFn` hook: `streamSimple` arity, stream or Promise of stream. */
export type PiAgentStreamFn = (
  ...args: Parameters<typeof streamSimple>
) => ReturnType<typeof streamSimple> | Promise<ReturnType<typeof streamSimple>>;
import type { LlmLogEntry } from '../log-store.ts';
import {
  beginLlmCall,
  failLlmCall,
  finalizeLlmCall,
  getLlmLogResponseSnapshot,
  logLlmCall,
} from '../log-store.ts';
import { providerLogFields } from './llm-log-metadata.ts';
import { stripProviderControlTokens } from '../lib/stream-sanitize.ts';
import { normalizeError } from '../../src/lib/error-utils.ts';
import { mergeStreamedAndFormattedAssistantResponse } from '../lib/merge-streamed-formatted-assistant.ts';

/** `phase` on LLM log rows for Pi agent turns (see `wrapPiStreamWithLogging`). */
export const PI_LLM_LOG_PHASE = {
  AGENTIC_TURN: 'agentic_turn',
  REVISION: 'revision',
} as const;

/** Never throws; logging must not break Pi streaming. Exported for tests. */
export function safeLogLlmCall(entry: Omit<LlmLogEntry, 'id' | 'timestamp'>): void {
  try {
    logLlmCall(entry);
  } catch (logErr) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[pi-llm-log] logLlmCall failed', logErr);
    }
  }
}

function userOrToolContentToString(content: UserMessage['content'] | ToolResultMessage['content']): string {
  if (typeof content === 'string') return content;
  return content.map((p) => (p.type === 'text' ? p.text : '[image]')).join('');
}

/** Visible test hook: serialize Pi LLM context the same way we store it in LlmLogEntry. */
export function piContextToLogFields(context: Context): { systemPrompt: string; userPrompt: string } {
  const systemPrompt = context.systemPrompt?.trim() || '(no system message)';

  const formatOne = (m: Message): string => {
    if (m.role === 'user') {
      return userOrToolContentToString(m.content);
    }
    if (m.role === 'toolResult') {
      const body = userOrToolContentToString(m.content);
      return `[tool_result ${m.toolName}]\n${body}`;
    }
    if (m.role === 'assistant') {
      return formatAssistantForLog(m);
    }
    return '';
  };

  const chunks = context.messages.map(formatOne).filter(Boolean);
  return {
    systemPrompt,
    userPrompt: chunks.join('\n\n') || '(no user message)',
  };
}

function formatAssistantForLog(m: AssistantMessage): string {
  const parts: string[] = [];
  for (const c of m.content) {
    if (c.type === 'text') parts.push(stripProviderControlTokens(c.text));
    else if (c.type === 'thinking')
      parts.push(`[thinking]\n${stripProviderControlTokens(c.thinking)}`);
    else if (c.type === 'toolCall') {
      const path = typeof c.arguments?.path === 'string' ? c.arguments.path : undefined;
      const cmd =
        typeof c.arguments?.command === 'string' ? c.arguments.command : undefined;
      if (c.name === 'bash' && cmd) {
        const short = cmd.length > 200 ? `${cmd.slice(0, 197)}…` : cmd;
        parts.push(`[tool_call ${c.name} command=${JSON.stringify(short)}]`);
      } else {
        parts.push(
          path
            ? `[tool_call ${c.name} path=${path}]`
            : `[tool_call ${c.name} ${JSON.stringify(c.arguments)}]`,
        );
      }
    }
  }
  return parts.join('\n');
}

function toolCallsForLog(m: AssistantMessage): { name: string; path?: string }[] {
  const out: { name: string; path?: string }[] = [];
  for (const c of m.content) {
    if (c.type !== 'toolCall') continue;
    const path = typeof c.arguments?.path === 'string' ? c.arguments.path : undefined;
    out.push({ name: c.name, path });
  }
  return out;
}

export interface LoggedPiStreamFnParams {
  providerId: string;
  modelId: string;
  source: LlmLogEntry['source'];
  phase?: string;
  correlationId?: string;
  turnLogRef: { current?: string };
}

/**
 * Wrap an existing Pi `StreamFn` (e.g. the SDK's auth-injecting `streamFn`) with LLM logging.
 */
export function wrapPiStreamWithLogging(
  inner: PiAgentStreamFn,
  params: LoggedPiStreamFnParams,
): PiAgentStreamFn {
  return ((model, context, options) => {
    const streamMax = piStreamCompletionMaxTokens(model, context, options?.maxTokens);
    return Promise.resolve(
      inner(model, context, { ...options, maxTokens: streamMax }),
    ).then((stream) => {
      const t0 = performance.now();
      const pv = providerLogFields(params.providerId);
      const modelLabel = params.modelId || model.id;
      const { systemPrompt, userPrompt } = piContextToLogFields(context);

      const logId = beginLlmCall({
        source: params.source,
        phase: params.phase,
        model: modelLabel,
        ...pv,
        systemPrompt,
        userPrompt,
        response: '',
        ...(params.correlationId ? { correlationId: params.correlationId } : {}),
      });
      params.turnLogRef.current = logId;

      void (async () => {
        try {
          const final = await stream.result();
          const formatted = formatAssistantForLog(final);
          const streamed = getLlmLogResponseSnapshot(logId) ?? '';
          const response = mergeStreamedAndFormattedAssistantResponse(streamed, formatted);
          const toolCalls = toolCallsForLog(final);
          finalizeLlmCall(logId, {
            response,
            durationMs: Math.round(performance.now() - t0),
            promptTokens: final.usage?.input,
            completionTokens: final.usage?.output,
            totalTokens: final.usage?.totalTokens,
            truncated: final.stopReason === 'length',
            toolCalls: toolCalls.length ? toolCalls : undefined,
            error:
              final.stopReason === 'error' || final.stopReason === 'aborted'
                ? (final.errorMessage ?? final.stopReason)
                : undefined,
          });
        } catch (err) {
          failLlmCall(logId, normalizeError(err), Math.round(performance.now() - t0));
        } finally {
          if (params.turnLogRef.current === logId) {
            params.turnLogRef.current = undefined;
          }
        }
      })();

      return stream;
    });
  }) as PiAgentStreamFn;
}
