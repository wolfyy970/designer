/**
 * Single registry for content-size limits (chars, lines, entries) used across server code,
 * plus re-exports of Pi tool truncation defaults so virtual tools stay aligned with the SDK.
 */
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES } from '@mariozechner/pi-coding-agent';

export { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES };

/**
 * Max chars per grep line in virtual grep tool output (Pi `truncate.js` `GREP_MAX_LINE_LENGTH`;
 * not re-exported from the package root — keep aligned when upgrading pi-coding-agent).
 */
export const GREP_MAX_LINE_LENGTH = 500;

/** Alias for read-tool docs and callers; same as Pi `DEFAULT_MAX_LINES`. */
export const SANDBOX_READ_MAX_LINES = DEFAULT_MAX_LINES;

/** Pi virtual `ls` tool entry cap (must match Pi `ls.js` default). */
export const SANDBOX_LS_MAX_ENTRIES = 500;

/** Pi virtual `find` tool result cap (must match Pi `find.js` default). */
export const SANDBOX_FIND_MAX_RESULTS = 1000;

/** Default max grep matches when the tool `limit` param is omitted. */
export const SANDBOX_GREP_DEFAULT_MATCH_LIMIT = 100;

/** Max chars returned from bundled bash output to the model. */
export const BASH_TOOL_MAX_CHARS = 51_200;

/** Per file block in LLM evaluator user content (design/strategy/implementation). */
export const EVAL_FILE_MAX_CHARS = 48_000;

/** Bundled preview HTML slice in LLM evaluator user content. */
export const EVAL_BUNDLE_MAX_CHARS = 64_000;

/** `hardFails[].message` cap in degraded evaluator worker report. */
export const EVAL_DEGRADED_MSG_MAX = 500;

/** Max chars of compiled generation prompt embedded in revision user message. */
export const REVISION_COMPILED_PROMPT_MAX = 4_000;

/** Serialized tool args on RunTraceEvent / NDJSON. */
export const PI_TOOL_ARGS_TRACE_MAX_CHARS = 2_048;

/** Serialized tool result text on traces. */
export const PI_TOOL_RESULT_TRACE_MAX_CHARS = 800;

/** Trace `label` field in observability NDJSON. */
export const TRACE_LABEL_MAX = 4_000;

/** Trace `detail` / `toolArgs` / `toolResult` fields in observability NDJSON. */
export const TRACE_TOOL_FIELD_MAX = 4_000;

/** Short preview for logs (bash command, trace snippets); longer strings get head + ellipsis. */
export const LOG_PREVIEW_SNIPPET_MAX = 120;

/** Characters kept before `…` when truncating to `LOG_PREVIEW_SNIPPET_MAX` (historical: 120 − 3). */
export const LOG_PREVIEW_SNIPPET_HEAD_CHARS = 117;

/** Longer preview for shell command in debug ingest. */
export const LOG_COMMAND_PREVIEW_MAX = 160;

/** Characters kept before `…` for command preview (historical: 160 − 3). */
export const LOG_COMMAND_PREVIEW_HEAD_CHARS = 157;
