import { describe, expect, it } from 'vitest';
import {
  parsePromptListPage,
  parseTextPromptGet,
  promptListIndicatesVersions,
} from '../langfuse-prompt-dto.ts';

describe('langfuse-prompt-dto', () => {
  it('parsePromptListPage accepts minimal Langfuse list shape', () => {
    const raw = {
      data: [{ versions: [1, 2], lastUpdatedAt: '2026-01-01T00:00:00.000Z' }],
    };
    const p = parsePromptListPage(raw);
    expect(p.ok && p.first?.versions).toEqual([1, 2]);
    expect(p.ok && p.first?.lastUpdatedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(promptListIndicatesVersions(raw)).toBe(true);
  });

  it('parsePromptListPage rejects invalid list payload', () => {
    const p = parsePromptListPage({ data: [{ versions: 'nope' }] });
    expect(p.ok).toBe(false);
    expect(promptListIndicatesVersions({ data: [{ versions: 'nope' }] })).toBe(false);
  });

  it('promptListIndicatesVersions is false for empty data', () => {
    expect(promptListIndicatesVersions({ data: [] })).toBe(false);
    expect(promptListIndicatesVersions({ data: [{}] })).toBe(false);
    expect(promptListIndicatesVersions({ data: [{ versions: [] }] })).toBe(false);
  });

  it('parseTextPromptGet accepts text prompt', () => {
    const raw = {
      type: 'text',
      prompt: 'hello',
      version: 3,
      createdAt: 'a',
      updatedAt: 'b',
    };
    const p = parseTextPromptGet(raw);
    expect(p.ok && p.prompt).toBe('hello');
    expect(p.ok && 'version' in p && p.version).toBe(3);
  });

  it('parseTextPromptGet rejects chat type', () => {
    const p = parseTextPromptGet({ type: 'chat', prompt: [] });
    expect(p.ok).toBe(false);
  });
});
