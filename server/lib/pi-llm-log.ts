/**
 * Wrap Pi `streamSimple` so each agent model turn is recorded in the dev LLM log (`/api/logs`).
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
import { logLlmCall } from '../log-store.ts';
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
}

export function makeLoggedPiStreamFn(params: LoggedPiStreamFnParams): StreamFunction<Api, SimpleStreamOptions> {
  return (model, context, options) => {
    const stream = streamSimple(model, context, options);
    const t0 = performance.now();
    const pv = providerLogFields(params.providerId);
    const modelLabel = params.modelId || model.id;

    void (async () => {
      try {
        const final = await stream.result();
        const { systemPrompt, userPrompt } = piContextToLogFields(context);
        const response = formatAssistantForLog(final);
        const toolCalls = toolCallsForLog(final);
        safeLogLlmCall({
          source: params.source,
          phase: params.phase,
          model: modelLabel,
          ...pv,
          systemPrompt,
          userPrompt,
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
        const { systemPrompt, userPrompt } = piContextToLogFields(context);
        safeLogLlmCall({
          source: params.source,
          phase: params.phase,
          model: modelLabel,
          ...pv,
          systemPrompt,
          userPrompt,
          response: '',
          durationMs: Math.round(performance.now() - t0),
          error: String(err),
        });
      }
    })();

    return stream;
  };
}
