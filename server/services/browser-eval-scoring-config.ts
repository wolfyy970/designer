/**
 * Named thresholds for browser QA (structural regex) and Playwright (rendered DOM).
 * Keeps scoring tunable from one place.
 */

// ── Playwright: console error count → rubric score (1–5) ─────────────────────
export const PLAYWRIGHT_CONSOLE_ERRORS_SCORE_5 = 0;
export const PLAYWRIGHT_CONSOLE_ERRORS_SCORE_3 = 1;
export const PLAYWRIGHT_CONSOLE_ERRORS_SCORE_2 = 2;
/** For 3+ errors: floor at 1 using `max(1, 5 - PLAYWRIGHT_CONSOLE_ERROR_BULK_PENALTY)`. */
export const PLAYWRIGHT_CONSOLE_ERROR_BULK_PENALTY = 4;

// ── Playwright: uncaught page errors ─────────────────────────────────────────
export const PLAYWRIGHT_PAGE_ERROR_SCORE_MULTIPLIER = 2;

// ── Playwright: visible text length ───────────────────────────────────────────
export const PLAYWRIGHT_VISIBLE_TEXT_EXCELLENT = 80;
export const PLAYWRIGHT_VISIBLE_TEXT_GOOD = 30;
export const PLAYWRIGHT_VISIBLE_TEXT_MINIMAL = 10;

// ── Playwright: body layout (viewport box) ────────────────────────────────────
export const PLAYWRIGHT_BODY_MIN_WIDTH_STRONG = 100;
export const PLAYWRIGHT_BODY_MIN_HEIGHT_STRONG = 40;

// ── Playwright: screenshot ─────────────────────────────────────────────────────
export const PLAYWRIGHT_SCREENSHOT_JPEG_QUALITY = 85;

// ── VM QA: interactive element rubric (counts from HTML structure) ────────────
export const QA_INTERACTIVE_SCORE2_MIN_TOTAL = 1;
export const QA_INTERACTIVE_SCORE3_MIN_TOTAL = 3;
export const QA_INTERACTIVE_SCORE3_MIN_ANCHORS = 2;
export const QA_INTERACTIVE_SCORE3_MIN_BUTTONS = 1;
export const QA_INTERACTIVE_SCORE4_MIN_TOTAL = 6;
export const QA_INTERACTIVE_SCORE4_MIN_BUTTONS = 2;
export const QA_INTERACTIVE_SCORE4_MIN_ANCHORS = 3;
export const QA_INTERACTIVE_SCORE4_MIN_NAVS = 1;
export const QA_INTERACTIVE_SCORE5_MIN_TOTAL = 10;
export const QA_INTERACTIVE_SCORE5_MIN_BUTTONS = 2;
export const QA_INTERACTIVE_SCORE5_MIN_FORMS = 1;

// ── VM QA: content presence (word / structure thresholds) ──────────────────────
export const QA_CONTENT_WORDS_T2 = 20;
export const QA_CONTENT_WORDS_T3 = 60;
export const QA_CONTENT_WORDS_T4 = 120;
export const QA_CONTENT_WORDS_T5 = 200;
export const QA_CONTENT_SCORE3_MIN_HEADINGS = 1;
export const QA_CONTENT_SCORE3_MIN_PARAGRAPHS = 1;
export const QA_CONTENT_SCORE4_MIN_HEADINGS = 2;
export const QA_CONTENT_SCORE4_MIN_SECTIONS = 2;
export const QA_CONTENT_SCORE5_MIN_HEADINGS = 2;
export const QA_CONTENT_SCORE5_MIN_PARAGRAPHS = 3;
export const QA_CONTENT_SCORE5_MIN_SECTIONS = 3;
