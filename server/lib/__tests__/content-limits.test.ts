import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import rawLimits from '../../../config/content-limits.json';
import {
  ContentLimitsFileSchema,
  GREP_MAX_LINE_LENGTH,
  BASH_TOOL_MAX_CHARS,
  EVAL_FILE_MAX_CHARS,
  LOG_PREVIEW_SNIPPET_MAX,
  LOG_PREVIEW_SNIPPET_HEAD_CHARS,
  LOG_COMMAND_PREVIEW_MAX,
  LOG_COMMAND_PREVIEW_HEAD_CHARS,
} from '../content-limits.ts';

describe('content-limits.json', () => {
  it('round-trips through ContentLimitsFileSchema', () => {
    expect(ContentLimitsFileSchema.safeParse(rawLimits).success).toBe(true);
  });

  it('exported constants match JSON values', () => {
    expect(GREP_MAX_LINE_LENGTH).toBe(rawLimits.sandbox.grepMaxLineLength);
    expect(BASH_TOOL_MAX_CHARS).toBe(rawLimits.sandbox.bashToolMaxChars);
    expect(EVAL_FILE_MAX_CHARS).toBe(rawLimits.evaluator.fileMaxChars);
    expect(LOG_PREVIEW_SNIPPET_MAX).toBe(rawLimits.log.previewSnippetMax);
    expect(LOG_COMMAND_PREVIEW_MAX).toBe(rawLimits.log.commandPreviewMax);
  });

  it('HEAD_CHARS constants are derived as MAX - 3', () => {
    expect(LOG_PREVIEW_SNIPPET_HEAD_CHARS).toBe(LOG_PREVIEW_SNIPPET_MAX - 3);
    expect(LOG_COMMAND_PREVIEW_HEAD_CHARS).toBe(LOG_COMMAND_PREVIEW_MAX - 3);
  });

  it('rejects a zero-value limit', () => {
    const bad = { ...rawLimits, sandbox: { ...rawLimits.sandbox, grepMaxLineLength: 0 } };
    expect(() => ContentLimitsFileSchema.parse(bad)).toThrow(z.ZodError);
  });

  it('rejects a previewSnippetMax < 4', () => {
    const bad = { ...rawLimits, log: { ...rawLimits.log, previewSnippetMax: 3 } };
    expect(() => ContentLimitsFileSchema.parse(bad)).toThrow(z.ZodError);
  });

  it('rejects unknown top-level keys', () => {
    const bad = { ...rawLimits, unexpected: true };
    expect(() => ContentLimitsFileSchema.parse(bad)).toThrow(z.ZodError);
  });
});
