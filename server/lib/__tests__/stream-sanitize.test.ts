import { describe, it, expect } from 'vitest';
import { stripProviderControlTokens } from '../stream-sanitize.ts';

describe('stripProviderControlTokens', () => {
  it('removes Gemini-style ctrl markers', () => {
    expect(stripProviderControlTokens('a<ctrl46>b')).toBe('ab');
    expect(stripProviderControlTokens('pre <CTRL12> post')).toBe('pre  post');
  });

  it('passes through normal text', () => {
    expect(stripProviderControlTokens('Hello')).toBe('Hello');
  });
});
