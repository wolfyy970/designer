import { describe, expect, it, vi } from 'vitest';
import {
  assertOkResponse,
  invalidServerResponseError,
  parseSseObject,
  requireSseReader,
} from '../client-sse-lifecycle';
import type { SseStreamDiagnostics } from '../../lib/sse-diagnostics';

function diagSpy(): SseStreamDiagnostics {
  return {
    recordReceived: vi.fn(),
    recordDrop: vi.fn(),
    summary: vi.fn(() => ({ durationMs: 0, byEvent: {}, drops: 0, dropReasons: [] })),
    logClose: vi.fn(),
  };
}

describe('client SSE lifecycle helpers', () => {
  it('parses object JSON without recording a drop', () => {
    const diag = diagSpy();
    expect(parseSseObject('{"status":"ok"}', 'progress', diag)).toEqual({ status: 'ok' });
    expect(diag.recordDrop).not.toHaveBeenCalled();
  });

  it('rejects non-object JSON and records an invalid-json drop', () => {
    const diag = diagSpy();
    expect(parseSseObject('"nope"', 'progress', diag)).toBeNull();
    expect(diag.recordDrop).toHaveBeenCalledWith('invalid_json', 'progress');
  });

  it('normalizes HTTP errors through the existing API error parser', async () => {
    await expect(assertOkResponse(new Response('bad gateway', { status: 502 }), 'fallback')).rejects.toThrow(
      /bad gateway|fallback/,
    );
  });

  it('returns a body reader or preserves the existing no-body error', () => {
    expect(requireSseReader(new Response(new ReadableStream()))).toBeDefined();
    expect(() => requireSseReader(new Response(null))).toThrow('No response body');
  });

  it('preserves the shared invalid server response message', () => {
    expect(invalidServerResponseError().message).toMatch(/Invalid server response/);
  });
});
