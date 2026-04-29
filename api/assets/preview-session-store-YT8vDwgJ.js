import { e as env } from "../[[...route]].js";
function resolvePreviewEntryPath(files) {
  if (files["index.html"]) return "index.html";
  const htmlKeys = Object.keys(files).filter((p) => p.endsWith(".html"));
  if (htmlKeys.length === 0) return "index.html";
  htmlKeys.sort((a, b) => a.localeCompare(b));
  return htmlKeys[0];
}
function encodeVirtualPathForUrl(relPath) {
  const normalized = relPath.replace(/\\/g, "/").replace(/^\/+/, "");
  return normalized.split("/").filter((s) => s.length > 0).map(encodeURIComponent).join("/");
}
const DEFAULT_TTL_MS = 30 * 60 * 1e3;
class InMemoryPreviewSessionStore {
  store = /* @__PURE__ */ new Map();
  create(files, ttlMs = DEFAULT_TTL_MS) {
    ensurePruneLoop();
    this.prune();
    this.evictOldestSessionIfAtCap();
    const id = crypto.randomUUID();
    const now = Date.now();
    this.store.set(id, { files: { ...files }, expiresAt: now + ttlMs, createdAt: now });
    return id;
  }
  replace(id, files, ttlMs = DEFAULT_TTL_MS) {
    this.prune();
    const row = this.store.get(id);
    if (!row || row.expiresAt <= Date.now()) return false;
    row.files = { ...files };
    row.expiresAt = Date.now() + ttlMs;
    return true;
  }
  delete(id) {
    this.store.delete(id);
  }
  snapshot(id) {
    this.prune();
    const row = this.store.get(id);
    if (!row || row.expiresAt <= Date.now()) return void 0;
    return { ...row.files };
  }
  file(id, rawPath) {
    this.prune();
    const row = this.store.get(id);
    if (!row || row.expiresAt <= Date.now()) return void 0;
    const normalized = normalizeVirtualPath(rawPath);
    if (normalized === "") return void 0;
    const direct = row.files[normalized];
    if (direct !== void 0) return direct;
    const withDot = `./${normalized}`;
    const alt = row.files[withDot];
    if (alt !== void 0) return alt;
    const unslash = normalized.replace(/^\//, "");
    if (unslash !== normalized) {
      const v = row.files[unslash];
      if (v !== void 0) return v;
    }
    return void 0;
  }
  clear() {
    this.store.clear();
  }
  evictOldestSessionIfAtCap() {
    const cap = env.MAX_PREVIEW_SESSIONS;
    if (this.store.size < cap) return;
    let oldestId = null;
    let oldestCreated = Infinity;
    for (const [id, row] of this.store) {
      if (row.createdAt < oldestCreated) {
        oldestCreated = row.createdAt;
        oldestId = id;
      }
    }
    if (oldestId != null) this.store.delete(oldestId);
  }
  prune() {
    const now = Date.now();
    for (const [id, row] of this.store) {
      if (row.expiresAt <= now) this.store.delete(id);
    }
  }
}
let previewStore = new InMemoryPreviewSessionStore();
let pruneInterval = null;
function ensurePruneLoop() {
  if (pruneInterval != null) return;
  if (process.env.VITEST === "true") return;
  pruneInterval = setInterval(() => {
    try {
      previewStore.snapshot("__prune__");
    } catch {
    }
  }, 6e4);
  if (typeof pruneInterval.unref === "function") pruneInterval.unref();
}
function createPreviewSession(files, ttlMs = DEFAULT_TTL_MS) {
  return previewStore.create(files, ttlMs);
}
function replacePreviewSessionFiles(id, files, ttlMs = DEFAULT_TTL_MS) {
  return previewStore.replace(id, files, ttlMs);
}
function deletePreviewSession(id) {
  previewStore.delete(id);
}
function getPreviewSessionSnapshot(id) {
  return previewStore.snapshot(id);
}
function getPreviewSessionFile(id, rawPath) {
  return previewStore.file(id, rawPath);
}
function normalizeVirtualPath(raw) {
  const trimmed = raw.replace(/\\/g, "/").replace(/^\/+/, "");
  const segments = trimmed.split("/").filter((s) => s.length > 0 && s !== ".");
  const out = [];
  for (const seg of segments) {
    if (seg === "..") {
      if (out.length === 0) return "";
      out.pop();
    } else {
      out.push(seg);
    }
  }
  return out.join("/");
}
export {
  replacePreviewSessionFiles as a,
  getPreviewSessionFile as b,
  createPreviewSession as c,
  deletePreviewSession as d,
  encodeVirtualPathForUrl as e,
  getPreviewSessionSnapshot as g,
  resolvePreviewEntryPath as r
};
