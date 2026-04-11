/**
 * Serialize Pi tool calls for RunTraceEvent (toolArgs / toolResult / detail).
 */
import { normalizeError } from '../../src/lib/error-utils.ts';
import {
  PI_TOOL_ARGS_TRACE_MAX_CHARS,
  PI_TOOL_RESULT_TRACE_MAX_CHARS,
} from './content-limits.ts';
import { truncateUtf16WithSuffix } from './string-truncate.ts';

export { PI_TOOL_ARGS_TRACE_MAX_CHARS, PI_TOOL_RESULT_TRACE_MAX_CHARS };

/** JSON-stringify tool_execution_start args for trace payloads. */
export function serializePiToolArgsForTrace(raw: unknown, maxChars = PI_TOOL_ARGS_TRACE_MAX_CHARS): string | undefined {
  if (raw == null) return undefined;
  if (typeof raw !== 'object') return undefined;
  try {
    return truncateUtf16WithSuffix(JSON.stringify(raw), maxChars);
  } catch {
    return undefined;
  }
}

type TextBlock = { type?: string; text?: string };

function extractTextFromAgentToolResult(result: unknown): string {
  if (result == null) return '';
  if (typeof result === 'string') return result;
  if (typeof result === 'object' && result !== null && 'message' in result) {
    const m = (result as { message?: unknown }).message;
    if (typeof m === 'string') return m;
  }
  const r = result as { content?: unknown };
  if (!Array.isArray(r.content)) return '';
  const parts: string[] = [];
  for (const block of r.content) {
    if (block && typeof block === 'object' && (block as TextBlock).type === 'text') {
      const t = (block as TextBlock).text;
      if (typeof t === 'string') parts.push(t);
    }
  }
  return parts.join('\n');
}

/**
 * Normalize tool_execution_end `result` into a single string for traces.
 * Handles successful AgentToolResult, thrown errors, and unknown shapes.
 */
export function serializePiToolResultForTrace(
  result: unknown,
  isError: boolean,
  maxChars = PI_TOOL_RESULT_TRACE_MAX_CHARS,
): string | undefined {
  if (result == null) return isError ? '(no result)' : undefined;
  let text: string;
  if (isError) {
    if (result instanceof Error) {
      text = result.message || String(result);
    } else {
      text = extractTextFromAgentToolResult(result);
      if (!text) {
        try {
          text = typeof result === 'object' ? JSON.stringify(result) : String(result);
        } catch {
          text = normalizeError(result);
        }
      }
    }
  } else {
    text = extractTextFromAgentToolResult(result);
  }
  const trimmed = text.trim();
  if (!trimmed) return isError ? '(empty result)' : undefined;
  return truncateUtf16WithSuffix(trimmed, maxChars);
}
