import type { Context } from 'hono';
import { z } from 'zod';
import { apiJsonError } from './api-json-error.ts';
import { env } from '../env.ts';
import { approximatePreviewFilesUtf8Bytes } from './preview-payload-bytes.ts';
import { parseRequestJson } from './parse-request.ts';
import { resolvePreviewEntryPath } from '../../src/lib/preview-entry.ts';

const previewSessionFilesBodySchema = z.object({
  files: z.record(z.string(), z.string()),
});

/**
 * Parse JSON body + validate `files`, non-empty map, and payload size cap for preview session POST/PUT.
 */
export async function parsePreviewSessionFiles(
  c: Context,
): Promise<{ ok: true; files: Record<string, string> } | { ok: false; response: Response }> {
  const parsed = await parseRequestJson(c, previewSessionFilesBodySchema);
  if (!parsed.ok) return parsed;
  const normalized = normalizePreviewFiles(parsed.data.files);
  if (!normalized.ok) {
    return { ok: false, response: apiJsonError(c, 400, normalized.error) };
  }
  const { files } = normalized;
  if (Object.keys(files).length === 0) {
    return { ok: false, response: apiJsonError(c, 400, 'files must be non-empty') };
  }
  const entry = resolvePreviewEntryPath(files);
  if (!files[entry]) {
    return { ok: false, response: apiJsonError(c, 400, 'Preview files must include an HTML entry') };
  }
  if (approximatePreviewFilesUtf8Bytes(files) > env.MAX_PREVIEW_PAYLOAD_BYTES) {
    return { ok: false, response: apiJsonError(c, 413, 'Preview files payload too large') };
  }
  return { ok: true, files };
}

function normalizePreviewFiles(
  files: Record<string, string>,
): { ok: true; files: Record<string, string> } | { ok: false; error: string } {
  const normalized: Record<string, string> = {};
  for (const [rawPath, content] of Object.entries(files)) {
    const path = normalizePreviewPath(rawPath);
    if (path == null) return { ok: false, error: 'Invalid preview file path' };
    if (Object.prototype.hasOwnProperty.call(normalized, path)) {
      return { ok: false, error: 'Duplicate preview file path' };
    }
    normalized[path] = content;
  }
  return { ok: true, files: normalized };
}

function normalizePreviewPath(rawPath: string): string | null {
  for (let i = 0; i < rawPath.length; i += 1) {
    const code = rawPath.charCodeAt(i);
    if (code < 32 || code === 127) return null;
  }
  if (rawPath.startsWith('/') || rawPath.startsWith('\\')) return null;
  const segments = rawPath.replace(/\\/g, '/').split('/');
  const out: string[] = [];
  for (const segment of segments) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (out.length === 0) return null;
      out.pop();
      continue;
    }
    out.push(segment);
  }
  return out.length === 0 ? null : out.join('/');
}
