import { Hono } from "hono";
import { r as resolvePreviewEntryPath, c as createPreviewSession, a as replacePreviewSessionFiles, d as deletePreviewSession, g as getPreviewSessionSnapshot, e as encodeVirtualPathForUrl, b as getPreviewSessionFile } from "./preview-session-store-YT8vDwgJ.js";
import { a as apiJsonError, e as env } from "../[[...route]].js";
import { z } from "zod";
import { Buffer } from "node:buffer";
import { p as parseRequestJson } from "./parse-request-BH7y8s49.js";
import "@hono/node-server/vercel";
import "hono/cors";
import "hono/body-limit";
import "dotenv";
import "node:path";
function mimeForPath(filePath) {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "text/html; charset=utf-8";
  if (lower.endsWith(".css")) return "text/css; charset=utf-8";
  if (lower.endsWith(".js") || lower.endsWith(".mjs")) return "text/javascript; charset=utf-8";
  if (lower.endsWith(".json")) return "application/json; charset=utf-8";
  if (lower.endsWith(".svg")) return "image/svg+xml; charset=utf-8";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".ico")) return "image/x-icon";
  if (lower.endsWith(".woff2")) return "font/woff2";
  if (lower.endsWith(".woff")) return "font/woff";
  if (lower.endsWith(".ttf")) return "font/ttf";
  if (lower.endsWith(".otf")) return "font/otf";
  return "application/octet-stream";
}
function approximatePreviewFilesUtf8Bytes(files) {
  let n = 0;
  for (const [k, v] of Object.entries(files)) {
    n += Buffer.byteLength(k, "utf8") + Buffer.byteLength(v, "utf8");
  }
  return n;
}
const previewSessionFilesBodySchema = z.object({
  files: z.record(z.string(), z.string())
});
async function parsePreviewSessionFiles(c) {
  const parsed = await parseRequestJson(c, previewSessionFilesBodySchema);
  if (!parsed.ok) return parsed;
  const normalized = normalizePreviewFiles(parsed.data.files);
  if (!normalized.ok) {
    return { ok: false, response: apiJsonError(c, 400, normalized.error) };
  }
  const { files } = normalized;
  if (Object.keys(files).length === 0) {
    return { ok: false, response: apiJsonError(c, 400, "files must be non-empty") };
  }
  const entry = resolvePreviewEntryPath(files);
  if (!files[entry]) {
    return { ok: false, response: apiJsonError(c, 400, "Preview files must include an HTML entry") };
  }
  if (approximatePreviewFilesUtf8Bytes(files) > env.MAX_PREVIEW_PAYLOAD_BYTES) {
    return { ok: false, response: apiJsonError(c, 413, "Preview files payload too large") };
  }
  return { ok: true, files };
}
function normalizePreviewFiles(files) {
  const normalized = {};
  for (const [rawPath, content] of Object.entries(files)) {
    const path = normalizePreviewPath(rawPath);
    if (path == null) return { ok: false, error: "Invalid preview file path" };
    if (Object.prototype.hasOwnProperty.call(normalized, path)) {
      return { ok: false, error: "Duplicate preview file path" };
    }
    normalized[path] = content;
  }
  return { ok: true, files: normalized };
}
function normalizePreviewPath(rawPath) {
  for (let i = 0; i < rawPath.length; i += 1) {
    const code = rawPath.charCodeAt(i);
    if (code < 32 || code === 127) return null;
  }
  if (rawPath.startsWith("/") || rawPath.startsWith("\\")) return null;
  const segments = rawPath.replace(/\\/g, "/").split("/");
  const out = [];
  for (const segment of segments) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (out.length === 0) return null;
      out.pop();
      continue;
    }
    out.push(segment);
  }
  return out.length === 0 ? null : out.join("/");
}
const preview = new Hono();
preview.post("/sessions", async (c) => {
  const parsed = await parsePreviewSessionFiles(c);
  if (!parsed.ok) return parsed.response;
  const { files } = parsed;
  const id = createPreviewSession(files);
  const entry = resolvePreviewEntryPath(files);
  return c.json({ id, entry });
});
preview.put("/sessions/:id", async (c) => {
  const id = c.req.param("id");
  const parsed = await parsePreviewSessionFiles(c);
  if (!parsed.ok) return parsed.response;
  const { files } = parsed;
  const ok = replacePreviewSessionFiles(id, files);
  if (!ok) return apiJsonError(c, 404, "Unknown or expired session");
  const entry = resolvePreviewEntryPath(files);
  return c.json({ ok: true, entry });
});
preview.delete("/sessions/:id", (c) => {
  const id = c.req.param("id");
  deletePreviewSession(id);
  return c.json({ ok: true });
});
function filePathFromPreviewUrl(url, sessionId) {
  const pathname = new URL(url).pathname;
  const marker = `/api/preview/sessions/${sessionId}/`;
  const idx = pathname.indexOf(marker);
  if (idx === -1) return null;
  const rest = pathname.slice(idx + marker.length).replace(/\/$/, "");
  if (!rest) return "";
  try {
    return decodeURIComponent(rest);
  } catch {
    return null;
  }
}
preview.get("/sessions/:sessionId", (c) => {
  const sessionId = c.req.param("sessionId");
  const pathname = new URL(c.req.url).pathname;
  const base = `/api/preview/sessions/${sessionId}`;
  if (pathname !== base && pathname !== `${base}/`) return c.text("Not found", 404);
  const snap = getPreviewSessionSnapshot(sessionId);
  if (!snap) return c.text("Not found", 404);
  const entry = resolvePreviewEntryPath(snap);
  const loc = new URL(c.req.url);
  loc.pathname = `${base}/${encodeVirtualPathForUrl(entry)}`;
  return c.redirect(loc.toString(), 302);
});
preview.get("/sessions/:sessionId/*", (c) => {
  const sessionId = c.req.param("sessionId");
  const rel = filePathFromPreviewUrl(c.req.url, sessionId);
  if (rel === null || rel === "") return c.text("Not found", 404);
  const content = getPreviewSessionFile(sessionId, rel);
  if (content === void 0) return c.text("Not found", 404);
  return c.body(content, 200, {
    "Content-Type": mimeForPath(rel),
    "Cache-Control": "private, max-age=0, must-revalidate"
  });
});
export {
  preview as default
};
