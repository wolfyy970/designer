import { prisma } from './client.ts';
import type { PromptKey } from '../lib/prompts/defaults.ts';

function missingPromptMessage(key: PromptKey): string {
  return `Prompt "${key}" was not found in the database. Run \`pnpm db:seed\` to seed prompts before using the app.`;
}

/** Resolve prompt body from DB. The database is the sole runtime source of truth. */
export async function getPromptBody(key: PromptKey): Promise<string> {
  const version = await prisma.promptVersion.findFirst({
    where: { promptKey: key },
    orderBy: { version: 'desc' },
  });
  if (!version) {
    throw new Error(missingPromptMessage(key));
  }
  return version.body;
}

/** Compute next version number for a prompt key. */
export async function nextPromptVersion(key: PromptKey): Promise<number> {
  const latest = await prisma.promptVersion.findFirst({
    where: { promptKey: key },
    orderBy: { version: 'desc' },
  });
  return (latest?.version ?? 0) + 1;
}
