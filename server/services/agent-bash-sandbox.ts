/**
 * just-bash virtual project tree for the Pi coding agent (in-memory filesystem).
 */
import type { Bash } from 'just-bash';
import { Bash as BashCtor } from 'just-bash';

/** Absolute path to the design workspace root inside just-bash. */
export const SANDBOX_PROJECT_ROOT = '/home/user/project';

function toSandboxPath(rel: string): string {
  const trimmed = rel.replace(/^\/+/, '');
  return `${SANDBOX_PROJECT_ROOT}/${trimmed}`;
}

export interface AgentBashSandboxOptions {
  seedFiles?: Record<string, string>;
  virtualSkillFiles?: Record<string, string>;
}

/**
 * Build initial `files` map for `new Bash({ files })`.
 */
export function buildSandboxSeedMaps(options: AgentBashSandboxOptions): Record<string, string> {
  const files: Record<string, string> = {};
  if (options.virtualSkillFiles) {
    for (const [path, content] of Object.entries(options.virtualSkillFiles)) {
      const key = path.startsWith('skills/') ? path : `skills/${path.replace(/^\/+/, '')}`;
      files[toSandboxPath(key)] = content;
    }
  }
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

function isSkillSandboxPath(absPath: string): boolean {
  return absPath.includes(`${SANDBOX_PROJECT_ROOT}/skills/`);
}

/**
 * Collect design artifacts (excludes `skills/` subtree) as relative paths from project root.
 */
export async function extractDesignFiles(bash: Bash): Promise<Record<string, string>> {
  const paths = bash.fs.getAllPaths().filter((p) => {
    if (!p.startsWith(`${SANDBOX_PROJECT_ROOT}/`) && p !== SANDBOX_PROJECT_ROOT) return false;
    if (p === SANDBOX_PROJECT_ROOT) return false;
    return !isSkillSandboxPath(p);
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

/** Snapshot path -> string content for dirty detection after `bash.exec`. */
export async function snapshotDesignFiles(bash: Bash): Promise<Map<string, string>> {
  const files = await extractDesignFiles(bash);
  return new Map(Object.entries(files));
}
