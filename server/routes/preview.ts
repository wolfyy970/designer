import { Hono } from 'hono';
import { z } from 'zod';
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
import { env } from '../env.ts';
import { approximatePreviewFilesUtf8Bytes } from '../lib/preview-payload-bytes.ts';

const bodySchema = z.object({
  files: z.record(z.string(), z.string()),
});

const preview = new Hono();

/** POST body — register a virtual tree; returns opaque id + default entry path. */
preview.post('/sessions', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return apiJsonError(c, 400, 'Invalid JSON body');
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return apiJsonError(c, 400, 'Expected { files: Record<string, string> }');
  }
  const { files } = parsed.data;
  if (Object.keys(files).length === 0) {
    return apiJsonError(c, 400, 'files must be non-empty');
  }
  if (approximatePreviewFilesUtf8Bytes(files) > env.MAX_PREVIEW_PAYLOAD_BYTES) {
    return apiJsonError(c, 413, 'Preview files payload too large');
  }
  const id = createPreviewSession(files);
  const entry = resolvePreviewEntryPath(files);
  return c.json({ id, entry });
});

const putBodySchema = z.object({
  files: z.record(z.string(), z.string()),
});

/** Replace files for an existing session (live updates). */
preview.put('/sessions/:id', async (c) => {
  const id = c.req.param('id');
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return apiJsonError(c, 400, 'Invalid JSON body');
  }
  const parsed = putBodySchema.safeParse(body);
  if (!parsed.success) {
    return apiJsonError(c, 400, 'Expected { files: Record<string, string> }');
  }
  const { files } = parsed.data;
  if (Object.keys(files).length === 0) {
    return apiJsonError(c, 400, 'files must be non-empty');
  }
  if (approximatePreviewFilesUtf8Bytes(files) > env.MAX_PREVIEW_PAYLOAD_BYTES) {
    return apiJsonError(c, 413, 'Preview files payload too large');
  }
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

/** Redirect to the default HTML entry for this session (register before the /:id/* file route). */
preview.get('/sessions/:sessionId', (c) => {
  const sessionId = c.req.param('sessionId');
  const pathname = new URL(c.req.url).pathname;
  const base = `/api/preview/sessions/${sessionId}`;
  if (pathname !== base && pathname !== `${base}/`) return c.text('Not found', 404);
  const snap = getPreviewSessionSnapshot(sessionId);
  if (!snap) return c.text('Not found', 404);
  const entry = resolvePreviewEntryPath(snap);
  const loc = new URL(c.req.url);
  loc.pathname = `${base}/${encodeVirtualPathForUrl(entry)}`;
  return c.redirect(loc.toString(), 302);
});

/** GET a file from a session (supports nested paths, e.g. pages/about.html). */
preview.get('/sessions/:sessionId/*', (c) => {
  const sessionId = c.req.param('sessionId');
  const rel = filePathFromPreviewUrl(c.req.url, sessionId);
  if (rel === null || rel === '') return c.text('Not found', 404);

  const content = getPreviewSessionFile(sessionId, rel);
  if (content === undefined) return c.text('Not found', 404);

  return c.body(content, 200, {
    'Content-Type': mimeForPath(rel),
    'Cache-Control': 'private, max-age=0, must-revalidate',
  });
});

export default preview;
