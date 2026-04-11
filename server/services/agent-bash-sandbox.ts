/**
 * just-bash virtual project tree for the Pi coding agent (in-memory filesystem).
 */
import type { Bash } from 'just-bash';
import { Bash as BashCtor } from 'just-bash';
import { env } from '../env.ts';

/** Absolute path to the design workspace root inside just-bash. */
export const SANDBOX_PROJECT_ROOT = '/home/user/project';

/** Relative project path → absolute path under the sandbox root (shared with pi-app-tools). */
export function sandboxProjectAbsPath(rel: string): string {
  const trimmed = rel.replace(/^\/+/, '');
  return `${SANDBOX_PROJECT_ROOT}/${trimmed}`;
}

function toSandboxPath(rel: string): string {
  return sandboxProjectAbsPath(rel);
}

export interface AgentBashSandboxOptions {
  seedFiles?: Record<string, string>;
}

/**
 * Build initial `files` map for `new Bash({ files })`.
 */
export function buildSandboxSeedMaps(options: AgentBashSandboxOptions): Record<string, string> {
  const files: Record<string, string> = {};
  if (options.seedFiles) {
    for (const [path, content] of Object.entries(options.seedFiles)) {
      files[toSandboxPath(path)] = content;
    }
  }
  return files;
}

export function createAgentBashSandbox(options: AgentBashSandboxOptions): Bash {
  const files = buildSandboxSeedMaps(options);
  return new BashCtor({
    files,
    cwd: SANDBOX_PROJECT_ROOT,
    executionLimits: {
      maxCommandCount: 5000,
      maxLoopIterations: 5000,
      maxSedIterations: 5000,
      maxAwkIterations: 5000,
    },
  });
}

/**
 * Collect design artifacts as relative paths from project root.
 */
export async function extractDesignFiles(bash: Bash): Promise<Record<string, string>> {
  const paths = bash.fs.getAllPaths().filter((p) => {
    if (!p.startsWith(`${SANDBOX_PROJECT_ROOT}/`) && p !== SANDBOX_PROJECT_ROOT) return false;
    if (p === SANDBOX_PROJECT_ROOT) return false;
    return true;
  });

  const out: Record<string, string> = {};
  for (const abs of paths.sort()) {
    let stat;
    try {
      stat = await bash.fs.stat(abs);
    } catch {
      if (env.isDev) {
        console.warn('[sandbox] extractDesignFiles: stat failed for', abs);
      }
      continue;
    }
    if (!stat.isFile) continue;
    let body: string;
    try {
      body = await bash.fs.readFile(abs, 'utf8');
    } catch {
      if (env.isDev) {
        console.warn('[sandbox] extractDesignFiles: readFile failed for', abs);
      }
      continue;
    }
    const rel = abs.startsWith(`${SANDBOX_PROJECT_ROOT}/`)
      ? abs.slice(SANDBOX_PROJECT_ROOT.length + 1)
      : abs;
    out[rel] = body;
  }
  return out;
}

/**
 * Files the agent added or changed vs the initial seed map (revision rounds re-seed prior design files).
 * When `seedFiles` is empty, callers should treat the full extracted map as output.
 */
export function computeDesignFilesBeyondSeed(
  extracted: Record<string, string>,
  seedFiles: Record<string, string> | undefined,
): Record<string, string> {
  if (!seedFiles || Object.keys(seedFiles).length === 0) {
    return { ...extracted };
  }
  const out: Record<string, string> = {};
  for (const [path, content] of Object.entries(extracted)) {
    const seedContent = seedFiles[path];
    if (seedContent === undefined) {
      out[path] = content;
    } else if (seedContent !== content) {
      out[path] = content;
    }
  }
  return out;
}

/** Snapshot path -> string content for dirty detection after `bash.exec`. */
export async function snapshotDesignFiles(bash: Bash): Promise<Map<string, string>> {
  const files = await extractDesignFiles(bash);
  return new Map(Object.entries(files));
}
