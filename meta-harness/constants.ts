/**
 * Shared literals for meta-harness (URLs, timeouts, filenames).
 */

export const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';

export const DEFAULT_COMPILE_MODEL = 'minimax/minimax-m2.5';

/** Default OpenRouter hypothesis-rubric timeout when config omits hypothesisRubricTimeoutMs */
export const DEFAULT_HYPOTHESIS_RUBRIC_TIMEOUT_MS = 300_000;

export const HEARTBEAT_INTERVAL_MS = 3_000;

/** POST /health check in CLI entry */
export const META_HARNESS_HEALTH_TIMEOUT_MS = 5_000;

/** Delay before Ink exits after engine completes */
export const INK_EXIT_DELAY_MS = 250;

/** Header clock tick */
export const HEADER_CLOCK_INTERVAL_MS = 1_000;

/** Wait for eval-run meta.json after SSE (evaluator) */
export const EVAL_META_JSON_WAIT_MS = 60_000;

/** Poll interval for meta.json */
export const EVAL_META_JSON_POLL_MS = 400;

/** Truncate compile error body in runCompileStep */
export const COMPILE_ERROR_BODY_MAX = 800;

/** Plain-mode heartbeat log throttle */
export const PLAIN_HEARTBEAT_LOG_THROTTLE_MS = 10_000;

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
} as const;
