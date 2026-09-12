// @vitest-environment jsdom

/**
 * Regression tests for preview-session ownership.
 *
 * `useArtifactPreviewUrl` creates a server-side session (POST) and then
 * verifies it (GET) before rendering the iframe. If the component unmounts
 * during that verify window, the session existed only in a local variable — the
 * unmount cleanup captured `sessionRef.current` while it was still `null`, so
 * nothing reclaimed it.
 *
 * Leaked entries accumulate against `MAX_PREVIEW_SESSIONS`, and the store
 * evicts *oldest first* — so a leak caused by one card silently kills the
 * preview of an unrelated card. This is a plausible contributor to the
 * "sometimes it just doesn't render" reports.
 */
import { cleanup, render } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useArtifactPreviewUrl } from '../useArtifactPreviewUrl';

const FILES = {
  'index.html': '<!doctype html><html><body><h1>Design</h1></body></html>',
};

/** Minimal component so the hook can be mounted and unmounted. */
function Probe({ files }: { files: Record<string, string> }) {
  useArtifactPreviewUrl(files, 0);
  return null;
}

/** Every request the hook made, as `METHOD path`. */
function recordedCalls(fetchMock: ReturnType<typeof vi.fn>): string[] {
  return fetchMock.mock.calls.map((call) => {
    const [url, init] = call as [string, RequestInit | undefined];
    return `${init?.method ?? 'GET'} ${url}`;
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('useArtifactPreviewUrl — session cleanup', () => {
  it('deletes the session when unmounted during the verification GET', async () => {
    let resolveVerify: ((value: { ok: boolean }) => void) | undefined;
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ id: 'leaked-session', entry: 'index.html' }),
        });
      }
      if (url.includes('leaked-session')) {
        // Hold the verification open so we can unmount inside the window.
        return new Promise((resolve) => {
          resolveVerify = resolve as (value: { ok: boolean }) => void;
        });
      }
      return Promise.resolve({ ok: true });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { unmount } = render(createElement(Probe, { files: FILES }));

    // Wait until the POST resolved and the verify request is in flight.
    await vi.waitFor(() => {
      expect(recordedCalls(fetchMock).some((c) => c.startsWith('GET'))).toBe(true);
    });

    unmount();
    resolveVerify?.({ ok: true });
    // Let the pending continuation run.
    await Promise.resolve();
    await Promise.resolve();

    expect(recordedCalls(fetchMock)).toContain('DELETE /api/preview/sessions/leaked-session');
  });

  it('deletes the session when files change during the verification GET', async () => {
    let resolveVerify: ((value: { ok: boolean }) => void) | undefined;
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ id: 'first-session', entry: 'index.html' }),
        });
      }
      if (url.includes('first-session')) {
        return new Promise((resolve) => {
          resolveVerify = resolve as (value: { ok: boolean }) => void;
        });
      }
      return Promise.resolve({ ok: true });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { rerender } = render(createElement(Probe, { files: FILES }));
    await vi.waitFor(() => {
      expect(recordedCalls(fetchMock).some((c) => c.startsWith('GET'))).toBe(true);
    });

    // A new file revision supersedes the in-flight session.
    rerender(
      createElement(Probe, {
        files: { 'index.html': '<!doctype html><html><body><h1>Design v2</h1></body></html>' },
      }),
    );
    resolveVerify?.({ ok: true });
    await Promise.resolve();
    await Promise.resolve();

    expect(recordedCalls(fetchMock)).toContain('DELETE /api/preview/sessions/first-session');
  });

  it('deletes the previous session before registering a replacement', async () => {
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ id: 'session-x', entry: 'index.html' }),
        });
      }
      if (init?.method === 'DELETE') return Promise.resolve({ ok: true });
      return Promise.resolve({ ok: true });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { rerender } = render(createElement(Probe, { files: FILES }));
    await vi.waitFor(() => {
      expect(recordedCalls(fetchMock).some((c) => c.startsWith('POST'))).toBe(true);
    });

    rerender(
      createElement(Probe, {
        files: { 'index.html': '<!doctype html><html><body><h1>Second</h1></body></html>' },
      }),
    );
    await vi.waitFor(() => {
      expect(recordedCalls(fetchMock).filter((c) => c.startsWith('POST')).length).toBe(2);
    });

    // The superseded session is reclaimed rather than left to expire.
    expect(recordedCalls(fetchMock)).toContain('DELETE /api/preview/sessions/session-x');
  });
});
