/**
 * Runtime narrowing for Pi SDK shapes at the session event bridge boundary.
 * Avoids unchecked `as` casts on assistant message slices, tool calls, and compaction payloads.
 */
import type { AssistantMessage } from '../services/pi-sdk/types.ts';
import { extractPiToolPathFromArguments } from './pi-tool-args.ts';

/** Pi assistant message content slice when type is `toolCall`. */
export function parseToolCallFromAssistantSlice(slice: unknown): { toolName: string; toolPath?: string } {
  if (slice === null || typeof slice !== 'object' || !('type' in slice)) {
    return { toolName: 'tool' };
  }
  const type = (slice as { type?: unknown }).type;
  if (type !== 'toolCall') {
    return { toolName: 'tool' };
  }
  const obj = slice as Record<string, unknown>;
  const name = obj.name;
  const args = obj.arguments;
  const toolName = typeof name === 'string' && name.length > 0 ? name : 'tool';
  const argumentsObj =
    args !== null && typeof args === 'object' && !Array.isArray(args)
      ? (args as Record<string, unknown>)
      : undefined;
  const toolPath =
    argumentsObj != null ? extractPiToolPathFromArguments(argumentsObj) : undefined;
  return { toolName, ...(toolPath != null ? { toolPath } : {}) };
}

export function toolMetaFromPartialNarrowed(
  partial: AssistantMessage,
  contentIndex: number,
): { toolName: string; toolPath?: string } {
  const slice = partial.content[contentIndex];
  return parseToolCallFromAssistantSlice(slice);
}

/** Only the tool path from a partial message slice (cheaper than full meta when only path may arrive late). */
export function extractToolPathFromAssistantPartial(
  partial: AssistantMessage,
  contentIndex: number,
): string | undefined {
  return toolMetaFromPartialNarrowed(partial, contentIndex).toolPath;
}

/** `toolcall_end` payload — narrowed without `as` on Pi SDK toolCall. */
export function parsePiToolCallEnd(
  toolCall: unknown,
): { name?: string; arguments?: Record<string, unknown> } | null {
  if (toolCall === null || typeof toolCall !== 'object' || Array.isArray(toolCall)) {
    return null;
  }
  const o = toolCall as Record<string, unknown>;
  const name = o.name;
  const args = o.arguments;
  const out: { name?: string; arguments?: Record<string, unknown> } = {};
  if (typeof name === 'string') out.name = name;
  if (args !== null && typeof args === 'object' && !Array.isArray(args)) {
    out.arguments = args as Record<string, unknown>;
  }
  return out;
}

export function toolPathFromNarrowedToolCall(tc: {
  name?: string;
  arguments?: Record<string, unknown>;
}): string | undefined {
  return extractPiToolPathFromArguments(tc.arguments);
}

/** `tool_execution_start` args — safe record for trace serialization. */
export function parseUnknownArgsRecord(args: unknown): Record<string, unknown> | undefined {
  if (args === null || args === undefined) return undefined;
  if (typeof args !== 'object' || Array.isArray(args)) return undefined;
  return args as Record<string, unknown>;
}

/** Pi compaction `result.details` — optional file lists for trace detail lines. */
export function parseCompactionDetails(
  details: unknown,
): { readFiles?: string[]; modifiedFiles?: string[] } | undefined {
  if (details === null || typeof details !== 'object' || Array.isArray(details)) return undefined;
  const d = details as Record<string, unknown>;
  const readFiles = d.readFiles;
  const modifiedFiles = d.modifiedFiles;
  const out: { readFiles?: string[]; modifiedFiles?: string[] } = {};
  if (Array.isArray(readFiles) && readFiles.every((x) => typeof x === 'string')) {
    out.readFiles = readFiles;
  }
  if (Array.isArray(modifiedFiles) && modifiedFiles.every((x) => typeof x === 'string')) {
    out.modifiedFiles = modifiedFiles;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
