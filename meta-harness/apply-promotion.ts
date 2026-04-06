/**
 * Apply winning candidate prompts + skills from preflight drift into the repo, then run Langfuse sync.
 */
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { normalizeError } from '../src/lib/error-utils.ts';
import { PROMPT_KEYS } from '../src/lib/prompts/defaults.ts';
import { isLangfuseAppConfigured } from '../server/lib/langfuse-app-client.ts';
import type { StalePrompt, StaleSkill, UnpromotedSession } from './preflight-promotion-check.ts';

const KNOWN_PROMPT_KEYS = new Set<string>(PROMPT_KEYS);

type PromotionStepOk = { key?: string; relPath?: string; ok: boolean; error?: string };

export type PromotionResult = {
  promptsPatched: PromotionStepOk[];
  skillsCopied: PromotionStepOk[];
  /** Present when preflight had rubric drift; single write to rubric-weights.json */
  rubricWeightsPatched: PromotionStepOk | null;
  langfuseSyncExitCode: number | null;
  langfuseSyncOutput: string;
};

/** Escape so a string is safe inside a TS template literal (backtick-delimited). */
export function escapeForTemplateLiteral(content: string): string {
  return content.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}

/** Find index of closing backtick for template body starting at `from` (first char inside literal). */
export function findClosingBacktick(source: string, from: number): number {
  let i = from;
  while (i < source.length) {
    const c = source[i]!;
    if (c === '\\') {
      i += 2;
      continue;
    }
    if (c === '`') return i;
    if (c === '$' && source[i + 1] === '{') {
      i += 2;
      let depth = 1;
      while (i < source.length && depth > 0) {
        const d = source[i]!;
        if (d === '\\') {
          i += 2;
          continue;
        }
        if (d === '{') depth++;
        else if (d === '}') depth--;
        i++;
      }
      continue;
    }
    i++;
  }
  return -1;
}

export function findPromptEntryRange(
  source: string,
  key: string,
): { bodyStart: number; bodyEnd: number } | null {
  const marker = `  '${key}': \``;
  const idx = source.indexOf(marker);
  if (idx === -1) return null;
  const bodyStart = idx + marker.length;
  const bodyEnd = findClosingBacktick(source, bodyStart);
  if (bodyEnd === -1) return null;
  return { bodyStart, bodyEnd };
}

export async function patchSharedDefaults(
  sharedDefaultsPath: string,
  stalePrompts: StalePrompt[],
): Promise<PromotionStepOk[]> {
  const results: PromotionStepOk[] = [];
  if (stalePrompts.length === 0) return results;

  let source: string;
  try {
    source = await readFile(sharedDefaultsPath, 'utf8');
  } catch (e) {
    for (const p of stalePrompts) {
      results.push({ key: p.key, ok: false, error: `cannot read shared-defaults: ${normalizeError(e)}` });
    }
    return results;
  }

  const errByKey = new Map<string, string>();
  const toApply: Array<{ bodyStart: number; bodyEnd: number; winnerBody: string }> = [];

  for (const p of stalePrompts) {
    if (!KNOWN_PROMPT_KEYS.has(p.key)) {
      errByKey.set(p.key, 'unknown prompt key (not in PROMPT_KEYS)');
      continue;
    }
    const range = findPromptEntryRange(source, p.key);
    if (!range) {
      errByKey.set(p.key, 'key not found in shared-defaults.ts');
      continue;
    }
    toApply.push({
      bodyStart: range.bodyStart,
      bodyEnd: range.bodyEnd,
      winnerBody: p.winnerBody,
    });
  }

  for (const p of stalePrompts) {
    const err = errByKey.get(p.key);
    results.push(
      err != null ? { key: p.key, ok: false, error: err } : { key: p.key, ok: true },
    );
  }

  if (errByKey.size > 0) {
    return results;
  }

  let out = source;
  for (const op of [...toApply].sort((a, b) => b.bodyStart - a.bodyStart)) {
    out =
      out.slice(0, op.bodyStart) +
      escapeForTemplateLiteral(op.winnerBody) +
      out.slice(op.bodyEnd);
  }

  try {
    await writeFile(sharedDefaultsPath, out, 'utf8');
  } catch (e) {
    return stalePrompts.map((p) => ({
      key: p.key,
      ok: false,
      error: normalizeError(e),
    }));
  }

  return results;
}

export async function copySkillFiles(
  skillsDir: string,
  staleSkills: StaleSkill[],
): Promise<PromotionStepOk[]> {
  const results: PromotionStepOk[] = [];

  for (const s of staleSkills) {
    const dest = path.join(skillsDir, s.relPath);
    try {
      if (s.kind === 'added') {
        try {
          await rm(dest, { force: true });
          results.push({ relPath: s.relPath, ok: true });
        } catch (e) {
          results.push({
            relPath: s.relPath,
            ok: false,
            error: normalizeError(e),
          });
        }
        continue;
      }

      if (s.kind === 'modified' || s.kind === 'deleted') {
        await mkdir(path.dirname(dest), { recursive: true });
        await writeFile(dest, s.winnerBody, 'utf8');
        results.push({ relPath: s.relPath, ok: true });
      }
    } catch (e) {
      results.push({
        relPath: s.relPath,
        ok: false,
        error: normalizeError(e),
      });
    }
  }

  return results;
}

export async function patchRubricWeightsFile(
  repoRoot: string,
  winnerWeights: Record<string, number>,
): Promise<PromotionStepOk> {
  const jsonPath = path.join(repoRoot, 'src/lib/rubric-weights.json');
  try {
    await mkdir(path.dirname(jsonPath), { recursive: true });
    await writeFile(jsonPath, `${JSON.stringify(winnerWeights, null, 2)}\n`, 'utf8');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: normalizeError(e) };
  }
}

function runLangfuseSync(repoRoot: string): { exitCode: number | null; output: string } {
  if (!isLangfuseAppConfigured()) {
    return {
      exitCode: null,
      output: 'Langfuse env not set (LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY / LANGFUSE_BASE_URL) — skipped pnpm langfuse:sync-prompts.',
    };
  }

  const r = spawnSync('pnpm', ['langfuse:sync-prompts'], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env },
  });
  let output = `${r.stdout ?? ''}${r.stderr ?? ''}`.trimEnd();
  if (r.error) {
    output = [output, r.error.message].filter(Boolean).join('\n');
  }
  const code = r.status === null ? 1 : r.status;
  return { exitCode: code, output };
}

export function promotionSucceeded(result: PromotionResult): boolean {
  const promptsOk = result.promptsPatched.every((p) => p.ok);
  const skillsOk = result.skillsCopied.every((p) => p.ok);
  const rubricOk = result.rubricWeightsPatched == null || result.rubricWeightsPatched.ok;
  const syncOk = result.langfuseSyncExitCode === null || result.langfuseSyncExitCode === 0;
  return promptsOk && skillsOk && rubricOk && syncOk;
}

/** Count newly-versioned keys from Langfuse sync stdout. */
function countNewLangfuseVersions(syncOutput: string): number {
  return (syncOutput.match(/New Langfuse prompt version:/g) ?? []).length;
}

/** One-line Langfuse status for the result panel. */
export function langfuseStatusLine(result: PromotionResult): string {
  if (result.langfuseSyncExitCode === null) {
    return result.langfuseSyncOutput.split('\n')[0] ?? 'skipped';
  }
  if (result.langfuseSyncExitCode !== 0) {
    return `sync failed (exit ${result.langfuseSyncExitCode})`;
  }
  const n = countNewLangfuseVersions(result.langfuseSyncOutput);
  return n > 0
    ? `${n} new version(s) created in Langfuse`
    : 'Langfuse sync ran — no new versions needed';
}

export async function applyPromotion(
  session: UnpromotedSession,
  repoRoot: string,
): Promise<PromotionResult> {
  const sharedDefaultsPath = path.join(repoRoot, 'src/lib/prompts/shared-defaults.ts');
  const skillsDir = path.join(repoRoot, 'skills');

  const promptsPatched = await patchSharedDefaults(sharedDefaultsPath, session.stalePrompts);
  const skillsCopied = await copySkillFiles(skillsDir, session.staleSkills);
  const rubricWeightsPatched = session.staleRubricWeights
    ? await patchRubricWeightsFile(repoRoot, session.staleRubricWeights.winnerWeights)
    : null;

  let langfuseSyncExitCode: number | null = null;
  let langfuseSyncOutput = '';

  const promptsOk = promptsPatched.every((p) => p.ok);
  const skillsOk = skillsCopied.every((p) => p.ok);
  const rubricOk = rubricWeightsPatched == null || rubricWeightsPatched.ok;

  if (promptsOk && skillsOk && rubricOk && session.stalePrompts.length > 0) {
    const sync = runLangfuseSync(repoRoot);
    langfuseSyncExitCode = sync.exitCode;
    langfuseSyncOutput = sync.output;
  } else if (promptsOk && skillsOk && rubricOk && session.stalePrompts.length === 0) {
    langfuseSyncOutput = 'No prompt drift — skipped Langfuse sync.';
  } else {
    langfuseSyncOutput =
      'Skipped Langfuse sync due to prompt, skill, or rubric-weight errors.';
  }

  return {
    promptsPatched,
    skillsCopied,
    rubricWeightsPatched,
    langfuseSyncExitCode,
    langfuseSyncOutput,
  };
}
