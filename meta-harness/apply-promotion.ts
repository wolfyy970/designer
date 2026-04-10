/**
 * Apply winning candidate skills + rubric weights from preflight drift into the repo.
 * Prompts are now managed as skills and PROMPT.md files — no shared-defaults.ts patching.
 */
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { normalizeError } from '../src/lib/error-utils.ts';
import type { StaleSkill, UnpromotedSession } from './preflight-promotion-check.ts';

type PromotionStepOk = { key?: string; relPath?: string; ok: boolean; error?: string };

export type PromotionResult = {
  skillsCopied: PromotionStepOk[];
  rubricWeightsPatched: PromotionStepOk | null;
};

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
  const skillsCopied = await copySkillFiles(skillsDir, session.staleSkills);
  const rubricWeightsPatched = session.staleRubricWeights
    ? await patchRubricWeightsFile(repoRoot, session.staleRubricWeights.winnerWeights)
    : null;

  return { skillsCopied, rubricWeightsPatched };
}
