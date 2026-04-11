/**
 * Apply winning candidate skills + rubric weights from preflight drift into the repo.
 * Prompts are now managed as skills and PROMPT.md files — no shared-defaults.ts patching.
 */
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { normalizeError } from '../src/lib/error-utils.ts';
import type { StaleSkill, UnpromotedSession } from './preflight-promotion-check.ts';
import { snapshotBeforeWrite } from './version-store.ts';

type PromotionStepOk = { key?: string; relPath?: string; ok: boolean; error?: string };

export type PromotionResult = {
  skillsCopied: PromotionStepOk[];
  rubricWeightsPatched: PromotionStepOk | null;
};

export async function copySkillFiles(
  repoRoot: string,
  skillsDir: string,
  staleSkills: StaleSkill[],
): Promise<PromotionStepOk[]> {
  const results: PromotionStepOk[] = [];

  for (const s of staleSkills) {
    const dest = path.join(skillsDir, s.relPath);
    const relUnderRepo = path.posix.join('skills', s.relPath.split(path.sep).join('/'));
    try {
      if (s.kind === 'added') {
        try {
          const snap = await snapshotBeforeWrite({
            repoRoot,
            relPath: relUnderRepo,
            source: 'meta-harness:promotion:copySkillFiles',
            action: 'delete',
          });
          if (!snap.ok) {
            results.push({ relPath: s.relPath, ok: false, error: snap.error });
            continue;
          }
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
        const snap = await snapshotBeforeWrite({
          repoRoot,
          relPath: relUnderRepo,
          source: 'meta-harness:promotion:copySkillFiles',
        });
        if (!snap.ok) {
          results.push({ relPath: s.relPath, ok: false, error: snap.error });
          continue;
        }
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
    const snap = await snapshotBeforeWrite({
      repoRoot,
      relPath: 'src/lib/rubric-weights.json',
      source: 'meta-harness:promotion:patchRubricWeightsFile',
    });
    if (!snap.ok) {
      return { ok: false, error: snap.error };
    }
    await mkdir(path.dirname(jsonPath), { recursive: true });
    await writeFile(jsonPath, `${JSON.stringify(winnerWeights, null, 2)}\n`, 'utf8');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: normalizeError(e) };
  }
}

export function promotionSucceeded(result: PromotionResult): boolean {
  const skillsOk = result.skillsCopied.every((p) => p.ok);
  const rubricOk = result.rubricWeightsPatched == null || result.rubricWeightsPatched.ok;
  return skillsOk && rubricOk;
}

export async function applyPromotion(
  session: UnpromotedSession,
  repoRoot: string,
): Promise<PromotionResult> {
  const skillsDir = path.join(repoRoot, 'skills');
  const skillsCopied = await copySkillFiles(repoRoot, skillsDir, session.staleSkills);
  const rubricWeightsPatched = session.staleRubricWeights
    ? await patchRubricWeightsFile(repoRoot, session.staleRubricWeights.winnerWeights)
    : null;

  return { skillsCopied, rubricWeightsPatched };
}
