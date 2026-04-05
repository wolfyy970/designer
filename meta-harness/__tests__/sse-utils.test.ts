import { describe, it, expect } from 'vitest';
import { parseSseJsonObject } from '../sse-utils.ts';

describe('parseSseJsonObject', () => {
  it('returns object for valid JSON object', () => {
    expect(parseSseJsonObject('{"a":1}')).toEqual({ a: 1 });
  });

  it('returns null for invalid JSON', () => {
    expect(parseSseJsonObject('{not json')).toBeNull();
  });

  it('returns null for non-object JSON', () => {
    expect(parseSseJsonObject('[1]')).toBeNull();
    expect(parseSseJsonObject('"hi"')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseSseJsonObject('')).toBeNull();
  });
});
