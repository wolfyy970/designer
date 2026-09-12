import { Hono, type Context } from 'hono';
import {
  createPreviewSession,
  deletePreviewSession,
  getPreviewSessionFile,
  getPreviewSessionSnapshot,
  replacePreviewSessionFiles,
} from '../services/preview-session-store.ts';
import { mimeForPath } from '../lib/preview-mime.ts';
import { encodeVirtualPathForUrl, resolvePreviewEntryPath } from '../../src/lib/preview-entry.ts';
import { apiJsonError } from '../lib/api-json-error.ts';
import { parsePreviewSessionFiles } from '../lib/preview-session-files-request.ts';

const preview = new Hono();

/** POST body — register a virtual tree; returns opaque id + default entry path. */
preview.post('/sessions', async (c) => {
  const parsed = await parsePreviewSessionFiles(c);
  if (!parsed.ok) return parsed.response;
  const { files } = parsed;
  const id = createPreviewSession(files);
  const entry = resolvePreviewEntryPath(files);
  return c.json({ id, entry });
});

/** Replace files for an existing session (live updates). */
preview.put('/sessions/:id', async (c) => {
  const id = c.req.param('id');
  const parsed = await parsePreviewSessionFiles(c);
  if (!parsed.ok) return parsed.response;
  const { files } = parsed;
  const ok = replacePreviewSessionFiles(id, files);
  if (!ok) return apiJsonError(c, 404, 'Unknown or expired session');
  const entry = resolvePreviewEntryPath(files);
  return c.json({ ok: true, entry });
});

preview.delete('/sessions/:id', (c) => {
  const id = c.req.param('id');
  deletePreviewSession(id);
  return c.json({ ok: true });
});

function filePathFromPreviewUrl(url: string, sessionId: string): string | null {
  const pathname = new URL(url).pathname;
  const marker = `/api/preview/sessions/${sessionId}/`;
  const idx = pathname.indexOf(marker);
  if (idx === -1) return null;
  const rest = pathname.slice(idx + marker.length).replace(/\/$/, '');
  if (!rest) return '';
  try {
    return decodeURIComponent(rest);
  } catch {
    return null;
  }
}

/**
 * A miss from this route is almost always transient: during a build the entry
 * document is served before the assets it references have been written, so the
 * browser's subresource requests (`styles.css`, `app.js`) legitimately 404 for a
 * few hundred milliseconds.
 *
 * Without `no-store` those 404s are heuristically cacheable, and a cached miss
 * outlives the missing file — the frame then keeps rendering unstyled long after
 * the stylesheet exists, which is the "intermittently afterwards" half of the
 * unstyled-preview report. Session ids are unique per snapshot, so there is
 * nothing to gain from caching a miss here.
 */
const NOT_FOUND_HEADERS = { 'Cache-Control': 'no-store' } as const;

/** 404 with caching disabled — use for every miss on the session file route. */
function notFound(c: Context) {
  return c.text('Not found', 404, NOT_FOUND_HEADERS);
}

/** Redirect to the default HTML entry for this session (register before the /:id/* file route). */
preview.get('/sessions/:sessionId', (c) => {
  const sessionId = c.req.param('sessionId');
  const pathname = new URL(c.req.url).pathname;
  const base = `/api/preview/sessions/${sessionId}`;
  if (pathname !== base && pathname !== `${base}/`) return notFound(c);
  const snap = getPreviewSessionSnapshot(sessionId);
  if (!snap) return notFound(c);
  const entry = resolvePreviewEntryPath(snap);
  const loc = new URL(c.req.url);
  loc.pathname = `${base}/${encodeVirtualPathForUrl(entry)}`;
  return c.redirect(loc.toString(), 302);
});

/** GET a file from a session (supports nested paths, e.g. pages/about.html). */
preview.get('/sessions/:sessionId/*', (c) => {
  const sessionId = c.req.param('sessionId');
  const rel = filePathFromPreviewUrl(c.req.url, sessionId);
  if (rel === null || rel === '') return notFound(c);

  const content = getPreviewSessionFile(sessionId, rel);
  if (content === undefined) return notFound(c);

  return c.body(content, 200, {
    'Content-Type': mimeForPath(rel),
    'Cache-Control': 'private, max-age=0, must-revalidate',
  });
});

export default preview;
