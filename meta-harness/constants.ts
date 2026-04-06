/**
 * Shared literals for meta-harness (URLs, timeouts, filenames).
 */

/** Canonical spec section ids for simplified benchmarks + incubate-mode rubric context (must stay aligned with `SpecSectionId`). */
export const SECTION_KEYS = [
  'design-brief',
  'existing-design',
  'research-context',
  'objectives-metrics',
  'design-constraints',
] as const;

/** Default `promptOptions.count` when config and test case omit a count. */
export const DEFAULT_HYPOTHESIS_COUNT = 5;

/** Engine/UI sentinel: no winning candidate / mean score yet. */
export const NO_BEST_SENTINEL = -1;

export const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';

export const DEFAULT_INCUBATE_MODEL = 'minimax/minimax-m2.5';

/** Default OpenRouter hypothesis-rubric timeout when config omits hypothesisRubricTimeoutMs */
export const DEFAULT_HYPOTHESIS_RUBRIC_TIMEOUT_MS = 300_000;

export const HEARTBEAT_INTERVAL_MS = 3_000;

/** POST /health check in CLI entry */
export const META_HARNESS_HEALTH_TIMEOUT_MS = 5_000;

/** Delay before Ink exits after engine completes */
export const INK_EXIT_DELAY_MS = 250;

/**
 * Run on the TTY immediately before `render()` so the Ink UI starts at the top of the viewport.
 * `3J` clears scrollback (xterm / VS Code); `2J` clears the screen; `H` homes the cursor.
 */
export const INK_TTY_PREP_SEQUENCE = '\u001b[3J\u001b[2J\u001b[H';

/** Header clock tick */
export const HEADER_CLOCK_INTERVAL_MS = 1_000;

/** Wait for eval-run meta.json after SSE (evaluator) */
export const EVAL_META_JSON_WAIT_MS = 60_000;

/** Poll interval for meta.json */
export const EVAL_META_JSON_POLL_MS = 400;

/** Truncate incubate error body in runIncubateStep */
export const INCUBATE_ERROR_BODY_MAX = 800;

/** Proposer `search` tool: max substring hits returned */
export const SEARCH_MAX_HITS = 40;

/** Proposer `search` tool: skip files larger than this (bytes) */
export const SEARCH_MAX_FILE_BYTES = 400_000;

/** Proposer `search` tool: max directory depth when walking */
export const SEARCH_MAX_DEPTH = 8;

/** Truncate `revisionBrief` in per-test summary.json written by meta-harness */
export const REVISION_BRIEF_MAX_CHARS = 800;

/** Snippet length in incubate-mode rubric LLM parse / JSON error messages */
export const RUBRIC_ERROR_SNIPPET_MAX = 200;

/** Max chars of non-OK `/hypothesis/generate` response body embedded in evaluator errors */
export const EVAL_FETCH_ERROR_BODY_MAX = 500;

/** Default timeout for a single POST /api/inputs/generate call (single LLM call, not SSE) */
export const DEFAULT_INPUTS_GENERATE_TIMEOUT_MS = 120_000;

/** Snippet length in inputs-mode rubric LLM parse / JSON error messages */
export const INPUTS_RUBRIC_ERROR_SNIPPET_MAX = 200;

/** Plain-mode heartbeat log throttle */
export const PLAIN_HEARTBEAT_LOG_THROTTLE_MS = 10_000;

/** Default timeout for POST /hypothesis/generate (SSE) when config omits hypothesisGenerateTimeoutMs */
export const DEFAULT_HYPOTHESIS_GENERATE_TIMEOUT_MS = 600_000;

/** Default timeout per OpenRouter chat request (proposer rounds, incubate-mode rubric when no other signal) */
export const DEFAULT_OPENROUTER_CHAT_TIMEOUT_MS = 600_000;

/** Truncate OpenRouter error response bodies in thrown errors */
export const OPENROUTER_HTTP_ERROR_BODY_MAX = 800;

export const ARTIFACT = {
  summaryJson: 'summary.json',
  aggregateJson: 'aggregate.json',
  promptOverridesJson: 'prompt-overrides.json',
  rubricWeightsJson: 'rubric-weights.json',
  bestCandidateJson: 'best-candidate.json',
  metaJson: 'meta.json',
  changelogMd: 'CHANGELOG.md',
  proposalMd: 'proposal.md',
  sessionJson: 'session.json',
  evalRunIdTxt: 'eval-run-id.txt',
  promotionReportMd: 'PROMOTION_REPORT.md',
  /** Per-candidate copy of `skills/` at evaluation time (directory name, not a file). */
  skillsSnapshot: 'skills-snapshot',
  /** Session copy of repo `skills/` before any candidate mutates disk — used to restore after each candidate and in `finally`. */
  skillsBaseline: 'skills-baseline',
} as const;

/**
 * Candidate-0 baseline passes **no** `promptOverrides` on `/api/*` requests, so prompts always come from
 * the **running server** (Langfuse + in-process defaults), not from another session’s winning
 * `prompt-overrides.json`. After you promote + sync, the next baseline matches that live layer; if you
 * skip promotion, baseline still tracks **API** text, not the stale winner file on disk.
 */
export const META_HARNESS_BASELINE_PROMPT_OVERRIDES: Readonly<Record<string, string>> = Object.freeze({});
