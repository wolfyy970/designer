import type { LangfuseClient } from '@langfuse/client';
import { env } from '../env.ts';
import { getLangfuseAppClient, isLangfuseAppConfigured } from '../lib/langfuse-app-client.ts';
import { parsePromptListPage, parseTextPromptGet } from '../lib/langfuse-prompt-dto.ts';
import { logUnexpectedLangfusePromptDev } from '../lib/langfuse-prompt-errors.ts';
import { LEGACY_PROMPT_KEY_ALIASES, type PromptKey } from '../../src/lib/prompts/defaults.ts';
import { PROMPT_DEFAULTS } from '../../src/lib/prompts/shared-defaults.ts';

const LEGACY_NAME_BY_CANONICAL: Partial<Record<PromptKey, string>> = {};
for (const [legacy, canonical] of Object.entries(LEGACY_PROMPT_KEY_ALIASES) as [string, PromptKey][]) {
  LEGACY_NAME_BY_CANONICAL[canonical] = legacy;
}

function missingPromptMessage(key: PromptKey): string {
  return `Prompt "${key}" was not found in Langfuse. Run \`pnpm db:seed\` after starting Langfuse to create missing prompts (see docker/langfuse/README.md).`;
}

async function fetchLabeledTextPrompt(lf: LangfuseClient, name: string): Promise<string> {
  const pc = await lf.prompt.get(name, {
    type: 'text',
    label: env.LANGFUSE_PROMPT_LABEL,
    cacheTtlSeconds: 0,
  });
  return pc.prompt;
}

/** Resolve prompt text for the configured deployment label (default `production`). */
export async function getPromptBody(key: PromptKey): Promise<string> {
  if (!isLangfuseAppConfigured()) {
    return PROMPT_DEFAULTS[key];
  }
  const lf = getLangfuseAppClient();
  try {
    return await fetchLabeledTextPrompt(lf, key);
  } catch (err) {
    const legacy = LEGACY_NAME_BY_CANONICAL[key];
    if (legacy) {
      try {
        return await fetchLabeledTextPrompt(lf, legacy);
      } catch (err2) {
        logUnexpectedLangfusePromptDev('getPromptBody', `${key} (legacy ${legacy})`, err2);
      }
    } else {
      logUnexpectedLangfusePromptDev('getPromptBody', key, err);
    }
    throw new Error(missingPromptMessage(key));
  }
}

/** Version 1 body in Langfuse, if it exists (for revert-to-baseline). */
export async function getBaselinePromptBody(key: PromptKey): Promise<string | null> {
  if (!isLangfuseAppConfigured()) return null;
  const lf = getLangfuseAppClient();
  const tryName = async (name: string): Promise<string | null> => {
    try {
      const res = await lf.api.prompts.get(name, { version: 1 });
      const parsed = parseTextPromptGet(res);
      if (parsed.ok) return parsed.prompt;
    } catch (err) {
      logUnexpectedLangfusePromptDev('getBaselinePromptBody', name, err);
    }
    return null;
  };
  const legacy = LEGACY_NAME_BY_CANONICAL[key];
  return (await tryName(key)) ?? (legacy ? await tryName(legacy) : null);
}

export async function getLatestPromptRow(key: PromptKey): Promise<{
  body: string;
  version: number;
  baselineBody: string | null;
}> {
  const lf = getLangfuseAppClient();
  const baseline = await getBaselinePromptBody(key);
  const load = async (name: string) =>
    lf.prompt.get(name, {
      type: 'text',
      label: env.LANGFUSE_PROMPT_LABEL,
      cacheTtlSeconds: 0,
    });
  try {
    const pc = await load(key);
    return {
      body: pc.prompt,
      version: pc.promptResponse.version,
      baselineBody: baseline,
    };
  } catch (err) {
    const legacy = LEGACY_NAME_BY_CANONICAL[key];
    if (!legacy) throw err;
    const pc = await load(legacy);
    return {
      body: pc.prompt,
      version: pc.promptResponse.version,
      baselineBody: baseline,
    };
  }
}

export async function getPromptVersionBody(key: PromptKey, version: number): Promise<{
  body: string;
  createdAt: string;
} | null> {
  if (!isLangfuseAppConfigured()) {
    if (version !== 1) return null;
    return {
      body: PROMPT_DEFAULTS[key],
      createdAt: new Date(0).toISOString(),
    };
  }
  try {
    const lf = getLangfuseAppClient();
    const res = await lf.api.prompts.get(key, { version, resolve: false });
    const parsed = parseTextPromptGet(res);
    if (!parsed.ok) return null;
    const createdAt = parsed.updatedAt ?? parsed.createdAt ?? new Date(0).toISOString();
    return { body: parsed.prompt, createdAt };
  } catch (err) {
    logUnexpectedLangfusePromptDev('getPromptVersionBody', `${key}@${version}`, err);
    return null;
  }
}

export async function listPromptHistoryRows(
  key: PromptKey,
): Promise<{ version: number; createdAt: string }[]> {
  if (!isLangfuseAppConfigured()) {
    return [{ version: 1, createdAt: new Date(0).toISOString() }];
  }
  const lf = getLangfuseAppClient();
  const list = await lf.api.prompts.list({ name: key, limit: 1 });
  const parsed = parsePromptListPage(list);
  if (!parsed.ok) return [];
  const versions = [...(parsed.first?.versions ?? [])].sort((a, b) => b - a);
  const fallbackTs = parsed.first?.lastUpdatedAt ?? new Date(0).toISOString();
  const rows = await Promise.all(
    versions.map(async (version) => {
      const detail = await getPromptVersionBody(key, version);
      return {
        version,
        createdAt: detail?.createdAt ?? fallbackTs,
      };
    }),
  );
  return rows;
}

/** Whether current labeled prompt text matches repo default (for Prompt Studio badges). */
export function sharedDefaultForKey(key: PromptKey): string {
  return PROMPT_DEFAULTS[key];
}
