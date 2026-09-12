// @vitest-environment jsdom

/**
 * Regression tests for the "preview renders an error / broken CSS" class of
 * bug. Three distinct defects produced the same user-visible symptom — a card
 * that paints something broken instead of the finished design:
 *
 *   1. A self-defeating `useEffect` cleared `urlPreviewFailed` on every
 *      `previewSrc` change. The effect runs *after* commit, so the iframe's
 *      `onLoad` had already detected the 404, the flag was then wiped, and the
 *      broken frame stayed mounted with no fallback.
 *   2. The fallback bundle was only computed when registration *failed*, so a
 *      URL that registered fine and failed later had nothing to fall back to.
 *   3. A 404 whose body is empty (or any non-`Not found` marker) was not
 *      detected at all.
 */
import { cleanup, render, screen, waitFor, act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ArtifactPreviewFrame from '../ArtifactPreviewFrame';

/** A fetch mock that registers + verifies a preview session successfully. */
function healthyRegistration(sessionId = 'session-1') {
  return vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: sessionId, entry: 'index.html' }),
    })
    .mockResolvedValueOnce({ ok: true })
    .mockResolvedValue({ ok: true });
}

/**
 * Drive the iframe's load event with a same-origin document body.
 * jsdom does not execute iframe content, so `contentDocument` is written
 * directly to simulate what the browser would have parsed.
 */
function fireFrameLoad(frame: HTMLIFrameElement, bodyText: string) {
  let doc = frame.contentDocument ?? null;
  if (!doc || !doc.body) {
    // jsdom's about:blank document has no body — build one to simulate the
    // parsed server response the browser would have produced.
    doc = document.implementation.createHTMLDocument('frame');
    if (!doc.body) doc.appendChild(doc.createElement('body'));
  }
  doc.body.textContent = bodyText;
  Object.defineProperty(frame, 'contentDocument', { value: doc, configurable: true });
  act(() => {
    frame.dispatchEvent(new Event('load'));
  });
}

const DESIGN = {
  'index.html':
    '<!doctype html><html><body><h1>Loaded design</h1><p>Real content here.</p></body></html>',
};

describe('ArtifactPreviewFrame — recovery from a failed URL preview', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('falls back to the bundled srcDoc when the iframe loads the server 404 body', async () => {
    vi.stubGlobal('fetch', healthyRegistration('expired-session'));

    render(<ArtifactPreviewFrame files={DESIGN} title="Preview: Test" />);

    const frame = await screen.findByTitle<HTMLIFrameElement>('Preview: Test');
    expect(frame.getAttribute('src')).toBe(
      '/api/preview/sessions/expired-session/index.html',
    );

    // The session expired between verification and the browser's own GET.
    fireFrameLoad(frame, 'Not found');

    // The fallback is a different element: the iframe is keyed, so switching
    // from the URL form to srcDoc remounts it. Re-query instead of holding the
    // pre-fallback node.
    await waitFor(() => {
      expect(
        screen.getByTitle<HTMLIFrameElement>('Preview: Test').getAttribute('srcdoc'),
      ).toContain('Loaded design');
    });
    expect(screen.getByTitle<HTMLIFrameElement>('Preview: Test').getAttribute('src')).toBeNull();
  });

  it('does not lose the fallback when the failure is detected on first load', async () => {
    // Regression for defect 1: the reset effect used to run after commit and
    // clear the flag, leaving the broken URL frame mounted forever.
    vi.stubGlobal('fetch', healthyRegistration('expired-session'));

    render(<ArtifactPreviewFrame files={DESIGN} title="Preview: Test" />);
    const frame = await screen.findByTitle<HTMLIFrameElement>('Preview: Test');
    fireFrameLoad(frame, 'Not found');

    await waitFor(() =>
      expect(
        screen.getByTitle<HTMLIFrameElement>('Preview: Test').getAttribute('srcdoc'),
      ).toContain('Loaded design'),
    );

    // Give any post-commit effect a chance to undo it, then re-assert.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const settled = screen.getByTitle<HTMLIFrameElement>('Preview: Test');
    expect(settled.getAttribute('srcdoc')).toContain('Loaded design');
    expect(settled.getAttribute('src')).toBeNull();
  });

  it('falls back when the 404 renders an empty document', async () => {
    // A bare/proxied 404 has no "Not found" marker — its body is simply empty.
    vi.stubGlobal('fetch', healthyRegistration('blank-404'));

    render(<ArtifactPreviewFrame files={DESIGN} title="Preview: Test" />);
    const frame = await screen.findByTitle<HTMLIFrameElement>('Preview: Test');

    fireFrameLoad(frame, '');

    await waitFor(() =>
      expect(
        screen.getByTitle<HTMLIFrameElement>('Preview: Test').getAttribute('srcdoc'),
      ).toContain('Loaded design'),
    );
  });

  it('does not fall back for a legitimately sparse but valid design', async () => {
    // A short-text design is valid output, not a failed render. Only the
    // server's marker (or a truly empty body) should trigger the fallback.
    vi.stubGlobal('fetch', healthyRegistration('sparse-session'));

    render(<ArtifactPreviewFrame files={DESIGN} title="Preview: Test" />);
    const frame = await screen.findByTitle<HTMLIFrameElement>('Preview: Test');

    fireFrameLoad(frame, 'Hi');

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(frame.getAttribute('src')).toBe('/api/preview/sessions/sparse-session/index.html');
    expect(frame.getAttribute('srcdoc')).toBeNull();
  });

  it('keeps the URL preview when it loads the real design', async () => {
    vi.stubGlobal('fetch', healthyRegistration('good-session'));

    render(<ArtifactPreviewFrame files={DESIGN} title="Preview: Test" />);
    const frame = await screen.findByTitle<HTMLIFrameElement>('Preview: Test');

    fireFrameLoad(frame, 'Loaded design Real content here.');

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(frame.getAttribute('src')).toBe('/api/preview/sessions/good-session/index.html');
    expect(frame.getAttribute('srcdoc')).toBeNull();
  });
});

describe('ArtifactPreviewFrame — incomplete artifact warning', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('warns when the entry references files the build never wrote', async () => {
    // The exact aborted-build shape: index.html landed, its assets did not.
    vi.stubGlobal('fetch', healthyRegistration('partial-session'));

    render(
      <ArtifactPreviewFrame
        files={{
          'index.html':
            '<!doctype html><html><head><link rel="stylesheet" href="styles.css"></head>' +
            '<body><script src="app.js"></script></body></html>',
        }}
        title="Preview: Partial"
      />,
    );

    const notice = await screen.findByRole('status');
    expect(notice.textContent).toContain('Build incomplete');
    expect(notice.textContent).toContain('styles.css');
    expect(notice.textContent).toContain('app.js');
    expect(notice.textContent).toContain('not the finished design');
    // The preview still renders — we annotate, we do not hide the work.
    expect(screen.getByTitle('Preview: Partial')).toBeTruthy();
  });

  it('stays silent when every referenced file is present', async () => {
    vi.stubGlobal('fetch', healthyRegistration('complete-session'));

    render(
      <ArtifactPreviewFrame
        files={{
          'index.html':
            '<!doctype html><html><head><link rel="stylesheet" href="styles.css"></head>' +
            '<body><script src="app.js"></script></body></html>',
          'styles.css': 'body{}',
          'app.js': 'console.log(1)',
        }}
        title="Preview: Complete"
      />,
    );

    await screen.findByTitle('Preview: Complete');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('does not treat external assets as missing', async () => {
    vi.stubGlobal('fetch', healthyRegistration('external-session'));

    render(
      <ArtifactPreviewFrame
        files={{
          'index.html':
            '<!doctype html><html><head>' +
            '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">' +
            '</head><body><h1>Design</h1></body></html>',
        }}
        title="Preview: External"
      />,
    );

    await screen.findByTitle('Preview: External');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('keeps the warning visible when the URL preview falls back to srcDoc', async () => {
    // An incomplete build is incomplete either way; the fallback must not hide it.
    vi.stubGlobal('fetch', healthyRegistration('expired-partial'));

    render(
      <ArtifactPreviewFrame
        files={{
          'index.html':
            '<!doctype html><html><head><link rel="stylesheet" href="styles.css"></head><body></body></html>',
        }}
        title="Preview: Fallback"
      />,
    );

    const frame = await screen.findByTitle<HTMLIFrameElement>('Preview: Fallback');
    fireFrameLoad(frame, 'Not found');

    await waitFor(() =>
      expect(screen.getByTitle<HTMLIFrameElement>('Preview: Fallback').getAttribute('srcdoc')).toBeTruthy(),
    );
    expect(screen.getByRole('status').textContent).toContain('Build incomplete');
  });
});
