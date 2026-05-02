/**
 * Authoritative virtual workspace contract for agent sessions.
 *
 * Owns path normalization, seed-file materialization, file-map extraction, and
 * "files beyond seed" semantics for the just-bash workspace. Pi tool adapters
 * may depend on this; higher-level orchestration should treat the helpers as
 * the package's VFS boundary.
 */
import type { Bash } from 'just-bash';
import { Bash as BashCtor } from 'just-bash';

/** Absolute path to the design workspace root inside just-bash. */
export const SANDBOX_PROJECT_ROOT = '/home/user/project';

/** Relative project path → absolute path under the sandbox root. */
export function sandboxProjectAbsPath(rel: string): string {
  const trimmed = rel.replace(/^\/+/, '');
  return `${SANDBOX_PROJECT_ROOT}/${trimmed}`;
}

export interface AgentBashSandboxOptions {
  seedFiles?: Record<string, string>;
}

/** Build initial `files` map for `new Bash({ files })`. */
export function buildSandboxSeedMaps(options: AgentBashSandboxOptions): Record<string, string> {
  const files: Record<string, string> = {};
  if (options.seedFiles) {
    for (const [p, content] of Object.entries(options.seedFiles)) {
      files[sandboxProjectAbsPath(p)] = content;
    }
  }
  return files;
}

export function createAgentBashSandbox(options: AgentBashSandboxOptions = {}): Bash {
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

/** Collect design artifacts as relative paths from project root. */
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
      continue;
    }
    if (!stat.isFile) continue;
    let body: string;
    try {
      body = await bash.fs.readFile(abs, 'utf8');
    } catch {
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
 * Files the agent added or changed vs the initial seed map (revision rounds re-seed
 * prior design files). When `seedFiles` is empty, callers should treat the full
 * extracted map as output.
 */
export function computeDesignFilesBeyondSeed(
  extracted: Record<string, string>,
  seedFiles: Record<string, string> | undefined,
): Record<string, string> {
  if (!seedFiles || Object.keys(seedFiles).length === 0) {
    return { ...extracted };
  }
  const out: Record<string, string> = {};
  for (const [p, content] of Object.entries(extracted)) {
    const seedContent = seedFiles[p];
    if (seedContent === undefined || seedContent !== content) {
      out[p] = content;
    }
  }
  return out;
}

/** Snapshot path → string content for dirty detection after `bash.exec`. */
export async function snapshotDesignFiles(bash: Bash): Promise<Map<string, string>> {
  const files = await extractDesignFiles(bash);
  return new Map(Object.entries(files));
}
