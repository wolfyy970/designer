/**
 * Virtual filesystem for the design agent: normalized paths, read-only skill mounts,
 * read/modified tracking for compaction, and per-path serialized mutations.
 */
import { pathMatchesGlob } from '../lib/virtual-path-glob.ts';

const READ_ONLY_PREFIXES = ['skills/'] as const;

/** Line-oriented content search (does not update readPaths for compaction). */
export interface GrepContentOptions {
  pattern: string;
  path?: string;
  glob?: string;
  ignoreCase?: boolean;
  literal?: boolean;
  context?: number;
  limit?: number;
}

export type GrepContentResult =
  | { ok: true; text: string; matchCount: number }
  | { ok: false; error: string };

export function normalizeVirtualPath(raw: string): string {
  let p = raw.trim().replace(/\\/g, '/');
  if (p.startsWith('./')) p = p.slice(2);
  if (p.startsWith('/')) p = p.slice(1);
  if (p.includes('..') || p.includes('\0')) {
    throw new Error(`Invalid path: ${raw}`);
  }
  return p;
}

function isReadOnlyPath(normalized: string): boolean {
  return READ_ONLY_PREFIXES.some((pre) => normalized === pre || normalized.startsWith(pre));
}

export interface ReadFileResult {
  text: string;
}

export interface WorkspaceFileSnapshot {
  readFiles: string[];
  modifiedFiles: string[];
  allPaths: string[];
}

export class VirtualWorkspace {
  private readonly data = new Map<string, string>();
  private readonly readPaths = new Set<string>();
  private readonly modifiedPaths = new Set<string>();
  private readonly mutationChains = new Map<string, Promise<unknown>>();

  /** Seed content (e.g. skills, revision seeds). Paths under `skills/` are read-only for writes/edits. */
  seed(rawPath: string, content: string): void {
    const path = normalizeVirtualPath(rawPath);
    this.data.set(path, content);
  }

  has(path: string): boolean {
    return this.data.has(normalizeVirtualPath(path));
  }

  get(rawPath: string): string | undefined {
    return this.data.get(normalizeVirtualPath(rawPath));
  }

  allKeys(): string[] {
    return [...this.data.keys()].sort();
  }

  getFileSnapshot(): WorkspaceFileSnapshot {
    const allPaths = this.allKeys();
    const modifiedFiles = [...this.modifiedPaths].filter((p) => !isReadOnlyPath(p)).sort();
    const readFiles = [...this.readPaths].filter((p) => !this.modifiedPaths.has(p)).sort();
    return {
      allPaths,
      readFiles,
      modifiedFiles,
    };
  }

  clearFileOpTracking(): void {
    this.readPaths.clear();
    this.modifiedPaths.clear();
  }

  isPathReadOnly(rawPath: string): boolean {
    const path = normalizeVirtualPath(rawPath);
    return isReadOnlyPath(path);
  }

  write(rawPath: string, content: string): void {
    const path = normalizeVirtualPath(rawPath);
    if (isReadOnlyPath(path)) {
      throw new Error(`Cannot write read-only path: ${path}`);
    }
    this.data.set(path, content);
    this.modifiedPaths.add(path);
  }

  read(rawPath: string, options?: { offset?: number; limit?: number }): ReadFileResult {
    const path = normalizeVirtualPath(rawPath);
    const full = this.data.get(path);
    if (full === undefined) {
      return { text: `File not found: ${rawPath}` };
    }
    this.readPaths.add(path);

    const lines = full.split('\n');
    const offset = options?.offset ?? 1;
    const limit = options?.limit;

    if (offset < 1) {
      return { text: `Invalid offset: ${offset} (must be >= 1)` };
    }

    const startIdx = offset - 1;
    if (startIdx >= lines.length) {
      return {
        text: `Offset ${offset} is beyond end of file (${lines.length} lines).`,
      };
    }

    const slice = limit != null ? lines.slice(startIdx, startIdx + limit) : lines.slice(startIdx);
    const numbered = slice.map((line, i) => `${startIdx + i + 1}|${line}`).join('\n');

    const MAX_CHARS = 50_000;
    let text = numbered;
    if (text.length > MAX_CHARS) {
      text = text.slice(0, MAX_CHARS) + `\n\n[Truncated: showing first ${MAX_CHARS} characters. Use read_file with a higher offset to continue.]`;
    } else {
      const endLine = startIdx + slice.length;
      const hasMore = endLine < lines.length;
      if (hasMore && limit != null) {
        text += `\n\n[More lines exist. Next read_file offset: ${endLine + 1}]`;
      } else if (hasMore && limit == null) {
        // full read to EOF, no note
      }
    }

    return { text };
  }

  /**
   * Apply multiple disjoint single-match replacements in one pass (reverse index order).
   */
  applyEdits(rawPath: string, edits: Array<{ oldText: string; newText: string }>): string {
    const path = normalizeVirtualPath(rawPath);
    if (isReadOnlyPath(path)) {
      throw new Error(`Cannot edit read-only path: ${path}`);
    }
    let content = this.data.get(path);
    if (content === undefined) {
      throw new Error(`File not found: ${rawPath}. Use write_file to create it first.`);
    }

    const ranges: { start: number; end: number; newText: string }[] = [];
    for (const ed of edits) {
      if (!ed.oldText) {
        throw new Error('oldText must be non-empty');
      }
      const count = content.split(ed.oldText).length - 1;
      if (count === 0) {
        throw new Error(`Text not found in ${path}. Check that oldText matches exactly.`);
      }
      if (count > 1) {
        throw new Error(
          `Found ${count} matches for a replacement in ${path}. Make oldText more specific to target exactly one location.`,
        );
      }
      const start = content.indexOf(ed.oldText);
      ranges.push({ start, end: start + ed.oldText.length, newText: ed.newText });
    }

    for (let i = 0; i < ranges.length; i++) {
      for (let j = i + 1; j < ranges.length; j++) {
        const a = ranges[i]!;
        const b = ranges[j]!;
        const overlap = !(a.end <= b.start || b.end <= a.start);
        if (overlap) {
          throw new Error('Edit ranges overlap. Use separate edit_file calls or narrower oldText snippets.');
        }
      }
    }

    ranges.sort((a, b) => b.start - a.start);
    for (const r of ranges) {
      content = content.slice(0, r.start) + r.newText + content.slice(r.end);
    }

    this.data.set(path, content);
    this.modifiedPaths.add(path);
    return content;
  }

  /** List paths under an optional directory prefix ("" or "." = all). */
  list(rawPrefix?: string): string {
    const keys = this.allKeys();
    let p = rawPrefix?.trim() || '';
    if (p === '.' || p === '') {
      if (keys.length === 0) return '(empty workspace)';
      return keys.join('\n');
    }
    p = normalizeVirtualPath(p.replace(/\/$/, ''));
    const filtered = keys.filter((k) => k === p || k.startsWith(`${p}/`));
    if (filtered.length === 0) return `No entries under ${p}`;
    return filtered.join('\n');
  }

  /** Glob match on full paths; optional path prefix filter. */
  find(globPattern: string, rawPrefix?: string, limit = 1000): string[] {
    let prefix = rawPrefix?.trim() || '';
    if (prefix && prefix !== '.') {
      prefix = normalizeVirtualPath(prefix.replace(/\/$/, ''));
    } else {
      prefix = '';
    }
    const out: string[] = [];
    for (const k of this.allKeys()) {
      if (out.length >= limit) break;
      if (prefix && k !== prefix && !k.startsWith(`${prefix}/`)) continue;
      if (pathMatchesGlob(k, globPattern)) out.push(k);
    }
    return out;
  }

  /**
   * Search file contents line-by-line. Same semantics as the grep tool (no readPaths tracking).
   */
  grepContent(options: GrepContentOptions): GrepContentResult {
    const limit = options.limit ?? 100;
    const ctxLines = options.context ?? 0;
    const MAX_LINE_LEN = 500;
    const params = options;

    let regex: RegExp | null = null;
    if (!params.literal) {
      try {
        regex = new RegExp(params.pattern, params.ignoreCase ? 'i' : '');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { ok: false, error: `Invalid pattern: ${msg}` };
      }
    }

    const lineMatches = (line: string): boolean => {
      if (params.literal) {
        return params.ignoreCase
          ? line.toLowerCase().includes(params.pattern.toLowerCase())
          : line.includes(params.pattern);
      }
      return regex!.test(line);
    };

    const entries: [string, string][] = [];
    for (const path of this.allKeys()) {
      if (params.path) {
        const scope = params.path.replace(/\/$/, '');
        if (path !== scope && !path.startsWith(`${scope}/`)) continue;
      }
      if (params.glob && !pathMatchesGlob(path, params.glob)) continue;
      const c = this.get(path);
      if (c !== undefined) entries.push([path, c]);
    }

    const linesOut: string[] = [];
    let matchCount = 0;

    outer: for (const [filePath, content] of entries) {
      const lines = content.split('\n');
      for (let lineNum = 0; lineNum < lines.length; lineNum++) {
        if (matchCount >= limit) break outer;
        const line = lines[lineNum]!;
        if (lineMatches(line)) {
          matchCount++;
          const lo = Math.max(0, lineNum - ctxLines);
          const hi = Math.min(lines.length - 1, lineNum + ctxLines);
          for (let j = lo; j <= hi; j++) {
            const prefix = j === lineNum ? '>' : ':';
            const raw = lines[j]!;
            const truncated = raw.length > MAX_LINE_LEN ? raw.slice(0, MAX_LINE_LEN) + '…' : raw;
            linesOut.push(`${filePath}:${j + 1}${prefix} ${truncated}`);
          }
          if (ctxLines > 0 && hi < lines.length - 1) {
            linesOut.push(`${filePath}:--`);
          }
        }
      }
    }

    const text =
      linesOut.length > 0
        ? linesOut.join('\n') + (matchCount >= limit ? `\n[${limit} match limit reached]` : '')
        : `No matches found for pattern: ${params.pattern}`;

    return { ok: true, text, matchCount };
  }

  entriesForDesignOutput(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [path, content] of this.data.entries()) {
      if (!isReadOnlyPath(path)) out[path] = content;
    }
    return out;
  }

  designPathCount(): number {
    return [...this.data.keys()].filter((p) => !isReadOnlyPath(p)).length;
  }

  /**
   * Serialize mutations to the same path (Pi-style per-file queue).
   */
  enqueueMutation<T>(rawPath: string, fn: () => Promise<T>): Promise<T> {
    const path = normalizeVirtualPath(rawPath);
    const prev = this.mutationChains.get(path) ?? Promise.resolve();
    const run = async (): Promise<T> => fn();
    const next = prev.then(run, run) as Promise<T>;
    this.mutationChains.set(
      path,
      next.then(
        () => undefined,
        () => undefined,
      ),
    );
    return next;
  }
}
