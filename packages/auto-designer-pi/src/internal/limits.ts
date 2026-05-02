/**
 * Content-size limits for the VFS-backed Pi tools.
 *
 * Numerically aligned with the host app's `config/content-limits.json` as of the time of
 * extraction; if those drift, the host can override at runtime by passing custom values
 * into `createVirtualPiCodingTools`.
 */
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES } from '@mariozechner/pi-coding-agent';

export { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES };

export const SANDBOX_LIMITS = {
  /** Max chars per grep line in virtual grep output. */
  grepMaxLineLength: 500,
  /** Pi virtual `ls` tool entry cap. */
  lsMaxEntries: 500,
  /** Pi virtual `find` tool result cap. */
  findMaxResults: 1000,
  /** Default max grep matches when the tool `limit` param is omitted. */
  grepDefaultMatchLimit: 100,
  /** Max chars returned from bundled bash output to the model. */
  bashToolMaxChars: 51_200,
} as const;

/** Read-tool max line cap (inherits Pi's `DEFAULT_MAX_LINES`). */
export const SANDBOX_READ_MAX_LINES = DEFAULT_MAX_LINES;

/** Short preview for logs (head + ellipsis). */
export const LOG_PREVIEW_SNIPPET_MAX = 120;
export const LOG_PREVIEW_SNIPPET_HEAD_CHARS = LOG_PREVIEW_SNIPPET_MAX - 3;
