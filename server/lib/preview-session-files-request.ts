import type { Context } from 'hono';
import { z } from 'zod';
import { apiJsonError } from './api-json-error.ts';
import { env } from '../env.ts';
import { approximatePreviewFilesUtf8Bytes } from './preview-payload-bytes.ts';
import { parseRequestJson } from './parse-request.ts';

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
  const { files } = parsed.data;
  if (Object.keys(files).length === 0) {
    return { ok: false, response: apiJsonError(c, 400, 'files must be non-empty') };
  }
  if (approximatePreviewFilesUtf8Bytes(files) > env.MAX_PREVIEW_PAYLOAD_BYTES) {
    return { ok: false, response: apiJsonError(c, 413, 'Preview files payload too large') };
  }
  return { ok: true, files };
}
