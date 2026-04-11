/**
 * Copy repo `skills/` and designer system prompt dirs into session baselines and restore them between candidates.
 */
import { cp, mkdir, rm, stat } from 'node:fs/promises';

/** Snapshot repo `skills/` into the session folder before any proposer mutates disk. */
export async function saveSkillsBaseline(skillsDir: string, baselineDir: string): Promise<void> {
  await rm(baselineDir, { recursive: true, force: true });
  try {
    const st = await stat(skillsDir);
    if (st.isDirectory()) {
      await cp(skillsDir, baselineDir, { recursive: true });
      return;
    }
  } catch {
    /* skills missing or not a directory */
  }
  await mkdir(baselineDir, { recursive: true });
}

/** Replace repo `skills/` with the session baseline copy (per-candidate reset + `finally` cleanup). */
export async function restoreSkillsFromBaseline(skillsDir: string, baselineDir: string): Promise<void> {
  await rm(skillsDir, { recursive: true, force: true });
  await cp(baselineDir, skillsDir, { recursive: true });
}

/** Snapshot `prompts/designer-agentic-system/` at session start (mirrors {@link saveSkillsBaseline}). */
export async function savePromptsDesignerBaseline(
  designerPromptDir: string,
  baselineDir: string,
): Promise<void> {
  await rm(baselineDir, { recursive: true, force: true });
  try {
    const st = await stat(designerPromptDir);
    if (st.isDirectory()) {
      await cp(designerPromptDir, baselineDir, { recursive: true });
      return;
    }
  } catch {
    /* directory missing */
  }
  await mkdir(baselineDir, { recursive: true });
}

/** Restore designer system prompt dir from session baseline (paired with {@link restoreSkillsFromBaseline}). */
export async function restorePromptsDesignerFromBaseline(
  designerPromptDir: string,
  baselineDir: string,
): Promise<void> {
  await rm(designerPromptDir, { recursive: true, force: true });
  await cp(baselineDir, designerPromptDir, { recursive: true });
}
