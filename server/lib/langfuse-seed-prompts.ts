/**
 * Ensures all app prompts exist in Langfuse.
 * Target text per key: latest `PromptVersion` from legacy SQLite when configured / auto-detected, else `shared-defaults`.
 *
 * **Default (create-only):** Creates missing prompts + repairs a missing label; if a labeled version already
 * exists, **does not push** — Prompt Studio is source of truth.
 *
 * **Sync mode** (`LANGFUSE_SEED_SYNC=1` or `seedLangfusePromptsFromDefaults({ sync: true })`): if the labeled
 * body differs from target text, calls **`lf.prompt.create`** for that prompt **name** again. Langfuse stores
 * this as a **new prompt version** (timeline / history); **`LANGFUSE_PROMPT_LABEL`** (e.g. `production`) moves
 * to the new version. **Older versions are not deleted** — they remain in the Langfuse UI for comparison,
 * same semantics as **`PUT /api/prompts/:key`** (which also uses `prompt.create`).
 *
 * There is no in-place “overwrite” of a single version blob; history is append-only from the app’s perspective.
 *
 * Uses `lf.api.prompts.list` / `lf.api.prompts.get` instead of `lf.prompt.get` so first-time seed does not spam
 * PromptManager 404 errors to the console.
 */
import type { LangfuseClient } from '@langfuse/client';
import { env } from '../env.ts';
import { getLangfuseAppClient, isLangfuseAppConfigured } from './langfuse-app-client.ts';
import { parseTextPromptGet, promptListIndicatesVersions } from './langfuse-prompt-dto.ts';
import { loadLegacyPromptBodiesForSeed } from './legacy-sqlite-prompts.ts';
import { LEGACY_PROMPT_KEY_ALIASES } from '../../src/lib/prompts/defaults.ts';
import { PROMPT_KEYS } from '../../src/lib/prompts/defaults.ts';
import { PROMPT_DEFAULTS } from '../../src/lib/prompts/shared-defaults.ts';

async function promptHasAnyVersion(lf: LangfuseClient, name: string): Promise<boolean> {
  try {
    const list = await lf.api.prompts.list({ name, limit: 1 });
    return promptListIndicatesVersions(list);
  } catch {
    return false;
  }
}

/** Resolved `production` (or configured label) text via REST API — avoids PromptManager error logging on 404. */
async function getLabeledTextPromptBodyViaApi(
  lf: LangfuseClient,
  name: string,
  label: string,
): Promise<string | null> {
  try {
    const res = await lf.api.prompts.get(name, { label });
    const parsed = parseTextPromptGet(res);
    if (!parsed.ok) return null;
    return parsed.prompt;
  } catch {
    return null;
  }
}

export type SeedLangfusePromptsOptions = {
  /** Override env `LANGFUSE_SEED_SYNC`. When true, push repo/SQLite bodies when they differ from Langfuse. */
  sync?: boolean;
};

export async function seedLangfusePromptsFromDefaults(options?: SeedLangfusePromptsOptions): Promise<void> {
  const sync = options?.sync ?? env.langfuseSeedSync;

  if (!isLangfuseAppConfigured()) {
    console.error(
      'Langfuse keys missing — set LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, LANGFUSE_BASE_URL before db:seed.',
    );
    process.exitCode = 1;
    return;
  }

  if (sync) {
    console.log(
      'Langfuse seed: sync mode — when a body differs, creates a new prompt version and moves the label (older versions stay in Langfuse).',
    );
  }

  const { bodies: legacyBodies, sourceLabel } = await loadLegacyPromptBodiesForSeed(process.cwd());
  const legacyCount = Object.keys(legacyBodies).length;
  const explicitLegacy = Boolean(env.LANGFUSE_PROMPT_IMPORT_SQLITE);
  if (explicitLegacy) {
    if (legacyCount === 0) {
      console.warn(
        `LANGFUSE_PROMPT_IMPORT_SQLITE points at ${sourceLabel || '(unset)'} but no PromptVersion rows were read (wrong path, tables already dropped, or Node.js needs 22.5+ with node:sqlite). Falling back to shared-defaults.`,
      );
    } else {
      console.log(`Prompt seed: ${legacyCount} body(ies) from legacy SQLite ${sourceLabel}`);
    }
  } else if (legacyCount > 0 && sourceLabel) {
    console.log(`Prompt seed: ${legacyCount} body(ies) from legacy SQLite ${sourceLabel}`);
  }

  const lf = getLangfuseAppClient();
  const label = env.LANGFUSE_PROMPT_LABEL;

  for (const [legacyName, newKey] of Object.entries(LEGACY_PROMPT_KEY_ALIASES)) {
    const newExists = await promptHasAnyVersion(lf, newKey);
    if (newExists) continue;
    const legacyExists = await promptHasAnyVersion(lf, legacyName);
    if (!legacyExists) continue;
    let body = await getLabeledTextPromptBodyViaApi(lf, legacyName, label);
    if (body === null) body = PROMPT_DEFAULTS[newKey];
    await lf.prompt.create({
      name: newKey,
      type: 'text',
      prompt: body,
      labels: [label],
    });
    console.log(`Migrated Langfuse prompt: ${legacyName} → ${newKey}`);
  }

  for (const key of PROMPT_KEYS) {
    const targetBody = legacyBodies[key] ?? PROMPT_DEFAULTS[key];
    const exists = await promptHasAnyVersion(lf, key);

    if (!exists) {
      await lf.prompt.create({
        name: key,
        type: 'text',
        prompt: targetBody,
        labels: [label],
      });
      console.log(`Seeded prompt: ${key}`);
      continue;
    }

    const current = await getLabeledTextPromptBodyViaApi(lf, key, label);
    if (current === null) {
      await lf.prompt.create({
        name: key,
        type: 'text',
        prompt: targetBody,
        labels: [label],
      });
      console.log(`New Langfuse prompt version: ${key} (no labeled version before; label attached)`);
      continue;
    }

    if (current === targetBody) {
      console.log(`Prompt up to date: ${key}`);
      continue;
    }

    if (!sync) {
      console.log(`Skipping existing (Prompt Studio): ${key}`);
      continue;
    }

    await lf.prompt.create({
      name: key,
      type: 'text',
      prompt: targetBody,
      labels: [label],
    });
    console.log(`New Langfuse prompt version: ${key} (label moved; prior versions unchanged in history)`);
  }
}
