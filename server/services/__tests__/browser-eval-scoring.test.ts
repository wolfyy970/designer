import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import rawScoring from '../../../config/browser-eval-scoring.json';
import {
  BrowserEvalScoringFileSchema,
  PLAYWRIGHT_CONSOLE_ERRORS_SCORE_5,
  PLAYWRIGHT_SCREENSHOT_JPEG_QUALITY,
  QA_INTERACTIVE_SCORE5_MIN_TOTAL,
  QA_CONTENT_WORDS_T5,
} from '../browser-eval-scoring-config.ts';

describe('browser-eval-scoring.json', () => {
  it('round-trips through BrowserEvalScoringFileSchema', () => {
    expect(BrowserEvalScoringFileSchema.safeParse(rawScoring).success).toBe(true);
  });

  it('exported constants match JSON values', () => {
    expect(PLAYWRIGHT_CONSOLE_ERRORS_SCORE_5).toBe(rawScoring.playwright.consoleErrors.score5);
    expect(PLAYWRIGHT_SCREENSHOT_JPEG_QUALITY).toBe(rawScoring.playwright.screenshotJpegQuality);
    expect(QA_INTERACTIVE_SCORE5_MIN_TOTAL).toBe(rawScoring.qa.interactive.score5MinTotal);
    expect(QA_CONTENT_WORDS_T5).toBe(rawScoring.qa.content.wordsT5);
  });

  it('rejects a JPEG quality > 100', () => {
    const bad = { ...rawScoring, playwright: { ...rawScoring.playwright, screenshotJpegQuality: 101 } };
    expect(() => BrowserEvalScoringFileSchema.parse(bad)).toThrow(z.ZodError);
  });

  it('rejects a negative count threshold', () => {
    const bad = {
      ...rawScoring,
      qa: { ...rawScoring.qa, interactive: { ...rawScoring.qa.interactive, score5MinTotal: -1 } },
    };
    expect(() => BrowserEvalScoringFileSchema.parse(bad)).toThrow(z.ZodError);
  });

  it('rejects unknown top-level keys', () => {
    const bad = { ...rawScoring, unexpected: true };
    expect(() => BrowserEvalScoringFileSchema.parse(bad)).toThrow(z.ZodError);
  });
});
