/**
 * Named thresholds for browser QA (structural regex) and Playwright (rendered DOM).
 * Numeric knobs live in `config/browser-eval-scoring.json`.
 */

import { z } from 'zod';
import rawScoring from '../../config/browser-eval-scoring.json';

const intMin0 = z.number().int().min(0);

export const BrowserEvalScoringFileSchema = z
  .object({
    playwright: z
      .object({
        consoleErrors: z.object({ score5: intMin0, score3: intMin0, score2: intMin0, bulkPenalty: intMin0 }).strict(),
        pageErrorMultiplier: intMin0,
        visibleText: z.object({ excellent: intMin0, good: intMin0, minimal: intMin0 }).strict(),
        bodyLayout: z.object({ minWidthStrong: intMin0, minHeightStrong: intMin0 }).strict(),
        screenshotJpegQuality: z.number().int().min(1).max(100),
      })
      .strict(),
    qa: z
      .object({
        interactive: z
          .object({
            score2MinTotal: intMin0, score3MinTotal: intMin0, score3MinAnchors: intMin0,
            score3MinButtons: intMin0, score4MinTotal: intMin0, score4MinButtons: intMin0,
            score4MinAnchors: intMin0, score4MinNavs: intMin0, score5MinTotal: intMin0,
            score5MinButtons: intMin0, score5MinForms: intMin0,
          })
          .strict(),
        content: z
          .object({
            wordsT2: intMin0, wordsT3: intMin0, wordsT4: intMin0, wordsT5: intMin0,
            score3MinHeadings: intMin0, score3MinParagraphs: intMin0,
            score4MinHeadings: intMin0, score4MinSections: intMin0,
            score5MinHeadings: intMin0, score5MinParagraphs: intMin0, score5MinSections: intMin0,
          })
          .strict(),
      })
      .strict(),
  })
  .strict();

const _c = BrowserEvalScoringFileSchema.parse(rawScoring);

// ── Playwright: console error count → rubric score (1–5) ─────────────────────
export const PLAYWRIGHT_CONSOLE_ERRORS_SCORE_5 = _c.playwright.consoleErrors.score5;
export const PLAYWRIGHT_CONSOLE_ERRORS_SCORE_3 = _c.playwright.consoleErrors.score3;
export const PLAYWRIGHT_CONSOLE_ERRORS_SCORE_2 = _c.playwright.consoleErrors.score2;
/** For 3+ errors: floor at 1 using `max(1, 5 - PLAYWRIGHT_CONSOLE_ERROR_BULK_PENALTY)`. */
export const PLAYWRIGHT_CONSOLE_ERROR_BULK_PENALTY = _c.playwright.consoleErrors.bulkPenalty;

// ── Playwright: uncaught page errors ─────────────────────────────────────────
export const PLAYWRIGHT_PAGE_ERROR_SCORE_MULTIPLIER = _c.playwright.pageErrorMultiplier;

// ── Playwright: visible text length ───────────────────────────────────────────
export const PLAYWRIGHT_VISIBLE_TEXT_EXCELLENT = _c.playwright.visibleText.excellent;
export const PLAYWRIGHT_VISIBLE_TEXT_GOOD       = _c.playwright.visibleText.good;
export const PLAYWRIGHT_VISIBLE_TEXT_MINIMAL    = _c.playwright.visibleText.minimal;

// ── Playwright: body layout (viewport box) ────────────────────────────────────
export const PLAYWRIGHT_BODY_MIN_WIDTH_STRONG  = _c.playwright.bodyLayout.minWidthStrong;
export const PLAYWRIGHT_BODY_MIN_HEIGHT_STRONG = _c.playwright.bodyLayout.minHeightStrong;

// ── Playwright: screenshot ─────────────────────────────────────────────────────
export const PLAYWRIGHT_SCREENSHOT_JPEG_QUALITY = _c.playwright.screenshotJpegQuality;

// ── VM QA: interactive element rubric (counts from HTML structure) ────────────
export const QA_INTERACTIVE_SCORE2_MIN_TOTAL   = _c.qa.interactive.score2MinTotal;
export const QA_INTERACTIVE_SCORE3_MIN_TOTAL   = _c.qa.interactive.score3MinTotal;
export const QA_INTERACTIVE_SCORE3_MIN_ANCHORS = _c.qa.interactive.score3MinAnchors;
export const QA_INTERACTIVE_SCORE3_MIN_BUTTONS = _c.qa.interactive.score3MinButtons;
export const QA_INTERACTIVE_SCORE4_MIN_TOTAL   = _c.qa.interactive.score4MinTotal;
export const QA_INTERACTIVE_SCORE4_MIN_BUTTONS = _c.qa.interactive.score4MinButtons;
export const QA_INTERACTIVE_SCORE4_MIN_ANCHORS = _c.qa.interactive.score4MinAnchors;
export const QA_INTERACTIVE_SCORE4_MIN_NAVS    = _c.qa.interactive.score4MinNavs;
export const QA_INTERACTIVE_SCORE5_MIN_TOTAL   = _c.qa.interactive.score5MinTotal;
export const QA_INTERACTIVE_SCORE5_MIN_BUTTONS = _c.qa.interactive.score5MinButtons;
export const QA_INTERACTIVE_SCORE5_MIN_FORMS   = _c.qa.interactive.score5MinForms;

// ── VM QA: content presence (word / structure thresholds) ──────────────────────
export const QA_CONTENT_WORDS_T2              = _c.qa.content.wordsT2;
export const QA_CONTENT_WORDS_T3              = _c.qa.content.wordsT3;
export const QA_CONTENT_WORDS_T4              = _c.qa.content.wordsT4;
export const QA_CONTENT_WORDS_T5              = _c.qa.content.wordsT5;
export const QA_CONTENT_SCORE3_MIN_HEADINGS   = _c.qa.content.score3MinHeadings;
export const QA_CONTENT_SCORE3_MIN_PARAGRAPHS = _c.qa.content.score3MinParagraphs;
export const QA_CONTENT_SCORE4_MIN_HEADINGS   = _c.qa.content.score4MinHeadings;
export const QA_CONTENT_SCORE4_MIN_SECTIONS   = _c.qa.content.score4MinSections;
export const QA_CONTENT_SCORE5_MIN_HEADINGS   = _c.qa.content.score5MinHeadings;
export const QA_CONTENT_SCORE5_MIN_PARAGRAPHS = _c.qa.content.score5MinParagraphs;
export const QA_CONTENT_SCORE5_MIN_SECTIONS   = _c.qa.content.score5MinSections;
