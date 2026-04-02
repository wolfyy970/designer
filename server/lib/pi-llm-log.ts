/**
 * Wrap Pi `streamSimple` so each agent model turn is recorded in the dev LLM log (`/api/logs`).
 * Rows start as soon as the turn begins (prompts visible); assistant text is appended from stream
 * deltas; the row is finalized when `stream.result()` settles.
 */
import { performance } from 'node:perf_hooks';
import { streamSimple } from '@mariozechner/pi-ai';
import type {
  Api,
  AssistantMessage,
  Context,
  Message,
  SimpleStreamOptions,
  StreamFunction,
  ToolResultMessage,
  UserMessage,
} from '@mariozechner/pi-ai';
import type { LlmLogEntry } from '../log-store.ts';
import { piStreamCompletionMaxTokens } from './completion-budget.ts';
import {
  beginLlmCall,
  failLlmCall,
  finalizeLlmCall,
  getLlmLogResponseSnapshot,
  logLlmCall,
} from '../log-store.ts';
import { providerLogFields } from './llm-log-metadata.ts';
import { stripProviderControlTokens } from './stream-sanitize.ts';

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
      parts.push(
        path
          ? `[tool_call ${c.name} path=${path}]`
          : `[tool_call ${c.name} ${JSON.stringify(c.arguments)}]`,
      );
    }
  }
  return parts.join('\n');
}

/**
 * `message_update` deltas append to the ring buffer; `stream.result()` may yield a shorter
 * `AssistantMessage` summary. Keep the richer body so logs match what was streamed.
 */
export function mergeStreamedAndFormattedAssistantResponse(
  streamed: string,
  formatted: string,
): string {
  const s = streamed.length;
  const f = formatted.length;
  if (s > f) return streamed;
  return formatted;
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
  /** Set to the in-flight LLM log row id for the current Pi turn (streaming deltas). */
  turnLogRef: { current?: string };
}

export function makeLoggedPiStreamFn(params: LoggedPiStreamFnParams): StreamFunction<Api, SimpleStreamOptions> {
  return (model, context, options) => {
    /**
     * `@mariozechner/pi-ai` defaults to `min(model.maxTokens, 32000)` when `maxTokens` is omitted.
     * Use context-sized, prompt-aware budget (shrinks as transcript grows).
     */
    const streamMax = piStreamCompletionMaxTokens(model, context, options?.maxTokens);
    const stream = streamSimple(model, context, { ...options, maxTokens: streamMax });
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
        failLlmCall(logId, String(err), Math.round(performance.now() - t0));
      } finally {
        if (params.turnLogRef.current === logId) {
          params.turnLogRef.current = undefined;
        }
      }
    })();

    return stream;
  };
}
