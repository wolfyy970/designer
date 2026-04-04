/**
 * Ephemeral in-memory store for URL-backed artifact preview (dev/eval).
 * Sessions expire to bound memory — not a durable artifact store.
 */

const DEFAULT_TTL_MS = 30 * 60 * 1000;

type SessionRow = {
  files: Record<string, string>;
  expiresAt: number;
};

const store = new Map<string, SessionRow>();

function prune(): void {
  const now = Date.now();
  for (const [id, row] of store) {
    if (row.expiresAt <= now) store.delete(id);
  }
}

/** Periodic prune so expired rows don't linger if nothing reads the store. */
let pruneInterval: ReturnType<typeof setInterval> | null = null;
function ensurePruneLoop(): void {
  if (pruneInterval != null) return;
  if (process.env.VITEST === 'true') return;
  pruneInterval = setInterval(() => {
    try {
      prune();
    } catch {
      /* ignore */
    }
  }, 60_000);
  if (typeof pruneInterval.unref === 'function') pruneInterval.unref();
}

export function createPreviewSession(
  files: Record<string, string>,
  ttlMs: number = DEFAULT_TTL_MS,
): string {
  ensurePruneLoop();
  prune();
  const id = crypto.randomUUID();
  store.set(id, { files: { ...files }, expiresAt: Date.now() + ttlMs });
  return id;
}

export function replacePreviewSessionFiles(
  id: string,
  files: Record<string, string>,
  ttlMs: number = DEFAULT_TTL_MS,
): boolean {
  prune();
  const row = store.get(id);
  if (!row || row.expiresAt <= Date.now()) return false;
  row.files = { ...files };
  row.expiresAt = Date.now() + ttlMs;
  return true;
}

export function deletePreviewSession(id: string): void {
  store.delete(id);
}

/**
 * Resolve a safe relative path against the session file map.
 * Returns `undefined` if session missing/expired or path escapes the tree / missing file.
 */
export function getPreviewSessionSnapshot(id: string): Record<string, string> | undefined {
  prune();
  const row = store.get(id);
  if (!row || row.expiresAt <= Date.now()) return undefined;
  return { ...row.files };
}

export function getPreviewSessionFile(id: string, rawPath: string): string | undefined {
  prune();
  const row = store.get(id);
  if (!row || row.expiresAt <= Date.now()) return undefined;

  const normalized = normalizeVirtualPath(rawPath);
  if (normalized === '') return undefined;

  const direct = row.files[normalized];
  if (direct !== undefined) return direct;

  const withDot = `./${normalized}`;
  const alt = row.files[withDot];
  if (alt !== undefined) return alt;

  const unslash = normalized.replace(/^\//, '');
  if (unslash !== normalized) {
    const v = row.files[unslash];
    if (v !== undefined) return v;
  }

  return undefined;
}

function normalizeVirtualPath(raw: string): string {
  const trimmed = raw.replace(/\\/g, '/').replace(/^\/+/, '');
  const segments = trimmed.split('/').filter((s) => s.length > 0 && s !== '.');
  const out: string[] = [];
  for (const seg of segments) {
    if (seg === '..') {
      if (out.length === 0) return '';
      out.pop();
    } else {
      out.push(seg);
    }
  }
  return out.join('/');
}

/** @internal */
export function clearPreviewSessionsForTests(): void {
  store.clear();
}
