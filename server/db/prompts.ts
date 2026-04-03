import { env } from '../env.ts';
import { getLangfuseAppClient, isLangfuseAppConfigured } from '../lib/langfuse-app-client.ts';
import { parsePromptListPage, parseTextPromptGet } from '../lib/langfuse-prompt-dto.ts';
import { logUnexpectedLangfusePromptDev } from '../lib/langfuse-prompt-errors.ts';
import type { PromptKey } from '../lib/prompts/defaults.ts';
import { PROMPT_DEFAULTS } from '../../src/lib/prompts/shared-defaults.ts';

function missingPromptMessage(key: PromptKey): string {
  return `Prompt "${key}" was not found in Langfuse. Run \`pnpm db:seed\` after starting Langfuse (see docker/langfuse/README.md).`;
}

/** Resolve prompt text for the configured deployment label (default `production`). */
export async function getPromptBody(key: PromptKey): Promise<string> {
  if (!isLangfuseAppConfigured()) {
    return PROMPT_DEFAULTS[key];
  }
  const lf = getLangfuseAppClient();
  try {
    const pc = await lf.prompt.get(key, {
      type: 'text',
      label: env.LANGFUSE_PROMPT_LABEL,
      cacheTtlSeconds: 0,
    });
    return pc.prompt;
  } catch (err) {
    logUnexpectedLangfusePromptDev('getPromptBody', key, err);
    throw new Error(missingPromptMessage(key));
  }
}

/** Version 1 body in Langfuse, if it exists (for revert-to-baseline). */
export async function getBaselinePromptBody(key: PromptKey): Promise<string | null> {
  if (!isLangfuseAppConfigured()) return null;
  try {
    const lf = getLangfuseAppClient();
    const res = await lf.api.prompts.get(key, { version: 1 });
    const parsed = parseTextPromptGet(res);
    if (parsed.ok) return parsed.prompt;
    return null;
  } catch {
    return null;
  }
}

export async function getLatestPromptRow(key: PromptKey): Promise<{
  body: string;
  version: number;
  baselineBody: string | null;
}> {
  const lf = getLangfuseAppClient();
  const pc = await lf.prompt.get(key, {
    type: 'text',
    label: env.LANGFUSE_PROMPT_LABEL,
    cacheTtlSeconds: 0,
  });
  const baseline = await getBaselinePromptBody(key);
  return {
    body: pc.prompt,
    version: pc.promptResponse.version,
    baselineBody: baseline,
  };
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
