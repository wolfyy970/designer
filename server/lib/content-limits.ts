/**
 * Single registry for content-size limits (chars, lines, entries) used across server code,
 * plus re-exports of Pi tool truncation defaults so virtual tools stay aligned with the SDK.
 * Numeric knobs live in `config/content-limits.json`.
 */
import { z } from 'zod';
import rawLimits from '../../config/content-limits.json';
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES } from '@mariozechner/pi-coding-agent';

export { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES };

export const ContentLimitsFileSchema = z
  .object({
    sandbox: z.object({
      grepMaxLineLength:     z.number().int().min(1),
      lsMaxEntries:          z.number().int().min(1),
      findMaxResults:        z.number().int().min(1),
      grepDefaultMatchLimit: z.number().int().min(1),
      bashToolMaxChars:      z.number().int().min(1),
    }).strict(),
    evaluator: z.object({
      fileMaxChars:              z.number().int().min(1),
      bundleMaxChars:            z.number().int().min(1),
      degradedMsgMax:            z.number().int().min(1),
      revisionCompiledPromptMax: z.number().int().min(1),
    }).strict(),
    trace: z.object({
      toolArgsMaxChars:  z.number().int().min(1),
      toolResultMaxChars: z.number().int().min(1),
      labelMax:          z.number().int().min(1),
      toolFieldMax:      z.number().int().min(1),
    }).strict(),
    log: z.object({
      previewSnippetMax: z.number().int().min(4),
      commandPreviewMax: z.number().int().min(4),
    }).strict(),
  })
  .strict();

const _limits = ContentLimitsFileSchema.parse(rawLimits);

/**
 * Max chars per grep line in virtual grep tool output (Pi `truncate.js` `GREP_MAX_LINE_LENGTH`;
 * not re-exported from the package root — keep aligned when upgrading pi-coding-agent).
 */
export const GREP_MAX_LINE_LENGTH = _limits.sandbox.grepMaxLineLength;

/** Alias for read-tool docs and callers; same as Pi `DEFAULT_MAX_LINES`. */
export const SANDBOX_READ_MAX_LINES = DEFAULT_MAX_LINES;

/** Pi virtual `ls` tool entry cap (must match Pi `ls.js` default). */
export const SANDBOX_LS_MAX_ENTRIES = _limits.sandbox.lsMaxEntries;

/** Pi virtual `find` tool result cap (must match Pi `find.js` default). */
export const SANDBOX_FIND_MAX_RESULTS = _limits.sandbox.findMaxResults;

/** Default max grep matches when the tool `limit` param is omitted. */
export const SANDBOX_GREP_DEFAULT_MATCH_LIMIT = _limits.sandbox.grepDefaultMatchLimit;

/** Max chars returned from bundled bash output to the model. */
export const BASH_TOOL_MAX_CHARS = _limits.sandbox.bashToolMaxChars;

/** Per file block in LLM evaluator user content (design/strategy/implementation). */
export const EVAL_FILE_MAX_CHARS = _limits.evaluator.fileMaxChars;

/** Bundled preview HTML slice in LLM evaluator user content. */
export const EVAL_BUNDLE_MAX_CHARS = _limits.evaluator.bundleMaxChars;

/** `hardFails[].message` cap in degraded evaluator worker report. */
export const EVAL_DEGRADED_MSG_MAX = _limits.evaluator.degradedMsgMax;

/** Max chars of compiled generation prompt embedded in revision user message. */
export const REVISION_COMPILED_PROMPT_MAX = _limits.evaluator.revisionCompiledPromptMax;

/** Serialized tool args on RunTraceEvent / NDJSON. */
export const PI_TOOL_ARGS_TRACE_MAX_CHARS = _limits.trace.toolArgsMaxChars;

/** Serialized tool result text on traces. */
export const PI_TOOL_RESULT_TRACE_MAX_CHARS = _limits.trace.toolResultMaxChars;

/** Trace `label` field in observability NDJSON. */
export const TRACE_LABEL_MAX = _limits.trace.labelMax;

/** Trace `detail` / `toolArgs` / `toolResult` fields in observability NDJSON. */
export const TRACE_TOOL_FIELD_MAX = _limits.trace.toolFieldMax;

/** Short preview for logs (bash command, trace snippets); longer strings get head + ellipsis. */
export const LOG_PREVIEW_SNIPPET_MAX = _limits.log.previewSnippetMax;

/** Characters kept before `…` when truncating to `LOG_PREVIEW_SNIPPET_MAX` (historical: 120 − 3). */
export const LOG_PREVIEW_SNIPPET_HEAD_CHARS = _limits.log.previewSnippetMax - 3;

/** Longer preview for shell command in debug ingest. */
export const LOG_COMMAND_PREVIEW_MAX = _limits.log.commandPreviewMax;

/** Characters kept before `…` for command preview (historical: 160 − 3). */
export const LOG_COMMAND_PREVIEW_HEAD_CHARS = _limits.log.commandPreviewMax - 3;
