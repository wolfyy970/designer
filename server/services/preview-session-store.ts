/**
 * Ephemeral in-memory store for URL-backed artifact preview (dev/eval).
 * Sessions expire to bound memory — not a durable artifact store.
 */

import { env } from '../env.ts';

const DEFAULT_TTL_MS = 30 * 60 * 1000;

type SessionRow = {
  files: Record<string, string>;
  expiresAt: number;
  createdAt: number;
};

export interface PreviewSessionStore {
  create(files: Record<string, string>, ttlMs?: number): string;
  replace(id: string, files: Record<string, string>, ttlMs?: number): boolean;
  delete(id: string): void;
  snapshot(id: string): Record<string, string> | undefined;
  file(id: string, rawPath: string): string | undefined;
  clear(): void;
}

export class InMemoryPreviewSessionStore implements PreviewSessionStore {
  private readonly store = new Map<string, SessionRow>();

  create(files: Record<string, string>, ttlMs: number = DEFAULT_TTL_MS): string {
    ensurePruneLoop();
    this.prune();
    this.evictOldestSessionIfAtCap();
    const id = crypto.randomUUID();
    const now = Date.now();
    this.store.set(id, { files: { ...files }, expiresAt: now + ttlMs, createdAt: now });
    return id;
  }

  replace(id: string, files: Record<string, string>, ttlMs: number = DEFAULT_TTL_MS): boolean {
    this.prune();
    const row = this.store.get(id);
    if (!row || row.expiresAt <= Date.now()) return false;
    row.files = { ...files };
    row.expiresAt = Date.now() + ttlMs;
    return true;
  }

  delete(id: string): void {
    this.store.delete(id);
  }

  snapshot(id: string): Record<string, string> | undefined {
    this.prune();
    const row = this.store.get(id);
    if (!row || row.expiresAt <= Date.now()) return undefined;
    return { ...row.files };
  }

  file(id: string, rawPath: string): string | undefined {
    this.prune();
    const row = this.store.get(id);
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

  clear(): void {
    this.store.clear();
  }

  private evictOldestSessionIfAtCap(): void {
    const cap = env.MAX_PREVIEW_SESSIONS;
    if (this.store.size < cap) return;
    let oldestId: string | null = null;
    let oldestCreated = Infinity;
    for (const [id, row] of this.store) {
      if (row.createdAt < oldestCreated) {
        oldestCreated = row.createdAt;
        oldestId = id;
      }
    }
    if (oldestId != null) this.store.delete(oldestId);
  }

  private prune(): void {
    const now = Date.now();
    for (const [id, row] of this.store) {
      if (row.expiresAt <= now) this.store.delete(id);
    }
  }
}

let previewStore: PreviewSessionStore = new InMemoryPreviewSessionStore();

/** Periodic prune so expired rows don't linger if nothing reads the store. */
let pruneInterval: ReturnType<typeof setInterval> | null = null;
function ensurePruneLoop(): void {
  if (pruneInterval != null) return;
  if (process.env.VITEST === 'true') return;
  pruneInterval = setInterval(() => {
    try {
      previewStore.snapshot('__prune__');
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
  return previewStore.create(files, ttlMs);
}

export function replacePreviewSessionFiles(
  id: string,
  files: Record<string, string>,
  ttlMs: number = DEFAULT_TTL_MS,
): boolean {
  return previewStore.replace(id, files, ttlMs);
}

export function deletePreviewSession(id: string): void {
  previewStore.delete(id);
}

/**
 * Resolve a safe relative path against the session file map.
 * Returns `undefined` if session missing/expired or path escapes the tree / missing file.
 */
export function getPreviewSessionSnapshot(id: string): Record<string, string> | undefined {
  return previewStore.snapshot(id);
}

export function getPreviewSessionFile(id: string, rawPath: string): string | undefined {
  return previewStore.file(id, rawPath);
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
  previewStore.clear();
}

/** @internal */
export function setPreviewSessionStoreForTests(store: PreviewSessionStore): void {
  previewStore = store;
}
