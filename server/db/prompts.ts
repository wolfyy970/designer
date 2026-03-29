import { prisma } from './client.ts';
import { DEFAULTS } from '../lib/prompts/defaults.ts';
import type { PromptKey } from '../lib/prompts/defaults.ts';

/** Resolve prompt body from DB; falls back to hardcoded default if not seeded. */
export async function getPromptBody(key: PromptKey): Promise<string> {
  const version = await prisma.promptVersion.findFirst({
    where: { promptKey: key },
    orderBy: { version: 'desc' },
  });
  return version?.body ?? DEFAULTS[key];
}

/** Compute next version number for a prompt key. */
export async function nextPromptVersion(key: PromptKey): Promise<number> {
  const latest = await prisma.promptVersion.findFirst({
    where: { promptKey: key },
    orderBy: { version: 'desc' },
  });
  return (latest?.version ?? 0) + 1;
}
