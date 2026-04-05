/**
 * Layout and TTY truncation limits for the meta-harness Ink / plain UI.
 */

/** Rolling proposer tool log entries kept in reducer state */
export const PROPOSER_TOOL_LOG_MAX = 12;

/** Max detail lines per test row (tail window) */
export const DETAIL_LINES_MAX = 14;

/** Proposer reasoning one-line preview in state after PROPOSER_DONE */
export const REASONING_PREVIEW_MAX = 120;

/** TEST_DONE error row liveLine and SKIPPED_TEST activity message truncation */
export const LIVE_LINE_ERROR_MAX = 80;

/** TEST_DONE activity log line for errors (slightly longer than liveLine) */
export const ACTIVITY_ERROR_SNIPPET_MAX = 100;

/** Target width for `bannerLine` rule padding (plain + preflight plain) */
export const BANNER_RULE_WIDTH = 60;
