import { describe, it, expect } from 'vitest';
import {
  formatZodFlattenDetails,
  normalizeError,
  parseApiErrorBody,
} from '../error-utils';

describe('normalizeError', () => {
  it('returns the message from an Error instance', () => {
    expect(normalizeError(new Error('boom'))).toBe('boom');
  });

  it('returns the fallback when given a non-Error and fallback is provided', () => {
    expect(normalizeError(null, 'fallback msg')).toBe('fallback msg');
    expect(normalizeError(undefined, 'fallback msg')).toBe('fallback msg');
    expect(normalizeError(42, 'fallback msg')).toBe('fallback msg');
  });

  it('stringifies non-Error values when no fallback is provided', () => {
    expect(normalizeError('raw string')).toBe('raw string');
    expect(normalizeError(42)).toBe('42');
    expect(normalizeError(null)).toBe('null');
  });

  it('prefers Error.message over the fallback', () => {
    expect(normalizeError(new Error('real message'), 'fallback')).toBe('real message');
  });

  it('handles subclasses of Error', () => {
    class CustomError extends Error {}
    expect(normalizeError(new CustomError('custom'))).toBe('custom');
  });
});

describe('parseApiErrorBody', () => {
  it('reads JSON error string', () => {
    expect(parseApiErrorBody('{"error":"bad"}')).toBe('bad');
  });

  it('falls back to raw body when no error field', () => {
    expect(parseApiErrorBody('not json')).toBe('not json');
    expect(parseApiErrorBody('{}')).toBe('{}');
  });

  it('stringifies numeric error', () => {
    expect(parseApiErrorBody('{"error":429}')).toBe('429');
  });

  it('appends Zod-style flatten details under the error line', () => {
    const body = JSON.stringify({
      error: 'Invalid request',
      details: {
        formErrors: ['missing id'],
        fieldErrors: {
          foo: ['bad'],
          bar: undefined,
        },
      },
    });
    expect(parseApiErrorBody(body)).toBe(
      'Invalid request\nmissing id\nfoo: bad',
    );
  });
});

describe('formatZodFlattenDetails', () => {
  it('returns empty string for non-objects', () => {
    expect(formatZodFlattenDetails(null)).toBe('');
    expect(formatZodFlattenDetails('x')).toBe('');
  });
});
